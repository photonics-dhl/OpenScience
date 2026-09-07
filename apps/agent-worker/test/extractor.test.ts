import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { AiGateway, Provider } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
import {
  extractHandler,
  sdfCoreGuard,
  selectManuscriptEvidence,
  sourceMapToManuscriptText,
  type ExtractedCore,
} from '../src/extractor';
import { createHandlers, streamToBufferBounded } from '../src/index';

const VALID: ExtractedCore = {
  schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP',
};

const VALID_PROPOSAL = {
  schemaVersion: '0.1.0',
  fields: Object.fromEntries(Object.entries(VALID).filter(([field]) => field !== 'schemaVersion').map(([field, summary]) => [field, {
    summary, sourceQuote: String(summary), sourceLocator: 'chars:0-1', needsMoreInformation: false,
  }])),
};

describe('sdfCoreGuard（§9.3 Schema 校验 + §5.1 六字段）', () => {
  it('合法六字段通过', () => {
    expect(sdfCoreGuard(VALID)).toBe(true);
  });

  it('缺字段/非 string/缺 schemaVersion → 拒绝', () => {
    expect(sdfCoreGuard({ ...VALID, method: undefined })).toBe(false);
    expect(sdfCoreGuard({ ...VALID, insight: 123 })).toBe(false);
    expect(sdfCoreGuard({ ...VALID, schemaVersion: '9.9.9' })).toBe(false);
    expect(sdfCoreGuard('nope')).toBe(false);
    expect(sdfCoreGuard(null)).toBe(false);
  });
});

describe('extractHandler（§9.2 提取 + §9.3 结构化校验 + 不写 SDF）', () => {
  it('从 canonical source map 的页块顺序派生兼容正文', () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1',
      contentHash: 'a'.repeat(64),
      parser: { name: 'cascade', version: '1' },
      pages: [{
        page: 1, width: 100, height: 100,
        blocks: [
          {
            id: 'block-1', kind: 'heading', text: 'Problem: Canonical evidence',
            boundingBox: { x: 0, y: 80, width: 100, height: 10 },
            parser: { name: 'native', version: '1' }, transformations: [],
          },
          {
            id: 'block-2', kind: 'figure',
            boundingBox: { x: 0, y: 20, width: 100, height: 50 },
            parser: { name: 'native', version: '1' }, transformations: [],
          },
          {
            id: 'block-3', kind: 'paragraph', text: 'Method: Reproducible protocol',
            boundingBox: { x: 0, y: 5, width: 100, height: 10 },
            parser: { name: 'native', version: '1' }, transformations: [],
          },
          {
            id: 'block-4', kind: 'paragraph', text: '   ',
            boundingBox: { x: 0, y: 30, width: 100, height: 10 },
            parser: { name: 'native', version: '1' }, transformations: [],
          },
        ],
      }],
    };

    expect(sourceMapToManuscriptText(sourceMap)).toBe(
      'Problem: Canonical evidence\nMethod: Reproducible protocol',
    );
  });

  it('binary sdf.extract 调用一次 cascade，并只用 canonical source map 正文进入 SDF prompt', async () => {
    const bytes = Buffer.from('%PDF-1.7 canonical fixture', 'utf8');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1', contentHash,
      parser: { name: 'openscience-parser-cascade', version: '1.0.0' },
      pages: [{
        page: 1, width: 612, height: 792,
        blocks: [{
          id: 'block-1', kind: 'paragraph', text: 'Problem: Canonical parser text',
          boundingBox: { x: 72, y: 700, width: 400, height: 20 },
          parser: { name: 'native-pdf', version: '1' }, transformations: [],
        }],
      }],
    };
    const proposal = {
      schemaVersion: '0.1.0',
      fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
        summary: '', sourceQuote: '', needsMoreInformation: true,
      }])),
    };
    const completeStructured = vi.fn().mockResolvedValue(proposal);
    const gateway = { completeStructured } as unknown as AiGateway;
    const parserCascade = vi.fn().mockResolvedValue({ status: 'succeeded', sourceMap, warnings: [] });
    const handlers = createHandlers(gateway, {
      parserCascade,
      externalProcessingPolicy: async () => true,
    });
    const storedDerived = new Map<string, Buffer>();
    const storage = {
      getObject: vi.fn().mockResolvedValue({ body: Readable.from([bytes]), size: bytes.length }),
      headObject: vi.fn().mockResolvedValue(null),
      putObject: vi.fn(async (key: string, body: Buffer) => {
        storedDerived.set(key, body);
        return { key, size: body.length, etag: 'fixture' };
      }),
    };
    const deps = {
      storage,
      malwareScanner: vi.fn().mockResolvedValue(undefined),
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({
          id: 'agent-task-1', kind: 'sdf.extract', status: 'running',
          session: {
            userId: 'user-1',
            researchObject: {
              id: 'ro-1', workspaceId: 'workspace-1', workspace: { id: 'workspace-1', status: 'active' },
            },
          },
        }) },
        membership: { findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1', workspaceId: 'workspace-1', role: 'author',
        }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: bytes.length,
          blobSha256: contentHash, logicalPath: 'paper.pdf', mimeType: 'application/pdf',
        }) },
      },
    };

    const result = await handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' },
      executionAttempt: 1,
    });

    expect(parserCascade).toHaveBeenCalledTimes(1);
    expect(parserCascade).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'artifact-1', contentHash, mediaType: 'application/pdf' }),
      {
        trustedAuthorizationContext: {
          taskId: 'agent-task-1', workspaceId: 'workspace-1', actorId: 'user-1',
        },
        externalProcessingEligible: true,
      },
    );
    expect(completeStructured).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(completeStructured.mock.calls[0])).toContain('Canonical parser text');
    expect(JSON.stringify(completeStructured.mock.calls[0])).not.toContain('%PDF-1.7');
    expect(result.sourceMapRef).toMatchObject({
      schemaVersion: 1,
      parserStatus: 'succeeded',
      artifactId: 'artifact-1',
      contentHash,
    });
    expect(result.evidenceLocation?.problem).toMatchObject({
      status: 'located', origin: 'explicit_field_label',
      sourceLocator: { artifactId: 'artifact-1', contentHash, blockId: 'block-1', page: 1 },
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^derived\/source-maps\/[a-f0-9]{64}\.json$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/json' }),
    );
  });

  it('SDF proposal provider fails after parsing without orphaning the trusted SourceMap reference', async () => {
    const bytes = Buffer.from('%PDF-1.7 proposal failure fixture', 'utf8');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1', contentHash,
      parser: { name: 'openscience-parser-cascade', version: '1.0.0' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'block-1', kind: 'paragraph', text: 'Problem: Canonical parser text',
        boundingBox: { x: 1, y: 1, width: 10, height: 10 },
        parser: { name: 'native-pdf', version: '1' }, transformations: [],
      }] }],
    };
    const handlers = createHandlers({ completeStructured: vi.fn().mockRejectedValue(new Error('provider down')) } as unknown as AiGateway, {
      parserCascade: vi.fn().mockResolvedValue({ status: 'succeeded', sourceMap, warnings: [] }),
    });
    const stored = new Map<string, Buffer>();
    const result = await handlers['sdf.extract']!({
      storage: {
        getObject: vi.fn().mockResolvedValue({ body: Readable.from([bytes]), size: bytes.length }),
        headObject: vi.fn().mockResolvedValue(null),
        putObject: vi.fn(async (key: string, body: Buffer) => {
          stored.set(key, body);
          return { key, size: body.length, etag: 'fixture' };
        }),
      },
      malwareScanner: vi.fn().mockResolvedValue(undefined),
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({
          id: 'agent-task-1', kind: 'sdf.extract', status: 'running',
          session: { userId: 'user-1', researchObject: {
            id: 'ro-1', workspaceId: 'workspace-1', workspace: { id: 'workspace-1', status: 'active' },
          } },
        }) },
        membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1', role: 'author' }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: bytes.length,
          blobSha256: contentHash, logicalPath: 'paper.pdf', mimeType: 'application/pdf',
        }) },
      },
    } as never, { id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' }, executionAttempt: 1 });

    expect(result).toMatchObject({ status: 'needs_review', reason: 'sdf-proposal-unavailable', sourceMapRef: { parserStatus: 'succeeded' } });
    expect(stored.size).toBe(1);
  });

  it.each([
    { role: 'reviewer', workspaceStatus: 'active', policyAllows: true, label: 'reviewer downgrade' },
    { role: 'viewer', workspaceStatus: 'active', policyAllows: true, label: 'viewer downgrade' },
    { role: 'author', workspaceStatus: 'archived', policyAllows: true, label: 'archived workspace' },
    { role: 'author', workspaceStatus: 'active', policyAllows: false, label: 'policy denial' },
  ])('执行时 $label 不得获得 external processing eligibility', async ({ role, workspaceStatus, policyAllows }) => {
    const bytes = Buffer.from('%PDF-1.7 authorization fixture', 'utf8');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const parserCascade = vi.fn().mockResolvedValue({
      status: 'needs_review', reasons: ['fixture stopped after authorization'],
    });
    const handlers = createHandlers({ completeStructured: vi.fn() } as unknown as AiGateway, {
      parserCascade,
      externalProcessingPolicy: async () => policyAllows,
    });
    const deps = {
      storage: { getObject: vi.fn().mockResolvedValue({ body: Readable.from([bytes]), size: bytes.length }) },
      malwareScanner: vi.fn().mockResolvedValue(undefined),
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({
          id: 'agent-task-1', kind: 'sdf.extract', status: 'running',
          session: {
            userId: 'user-1',
            researchObject: {
              id: 'ro-1', workspaceId: 'workspace-1', workspace: { id: 'workspace-1', status: workspaceStatus },
            },
          },
        }) },
        membership: { findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1', workspaceId: 'workspace-1', role,
        }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: bytes.length,
          blobSha256: contentHash, logicalPath: 'paper.pdf', mimeType: 'application/pdf',
        }) },
      },
    };

    await handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1',
      payload: {
        artifactId: 'artifact-1', researchObjectId: 'ro-1', externalProcessingEligible: true,
      },
      executionAttempt: 1,
    });

    expect(parserCascade).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      externalProcessingEligible: false,
    }));
  });

  it('对象存储实际字节超过声明上限时停止缓冲', async () => {
    await expect(streamToBufferBounded(Readable.from([Buffer.from('123'), Buffer.from('456')]), 5))
      .rejects.toThrow(/exceeds limit/);
  });

  it.each([
    { logicalPath: 'direct-same.md', mimeType: 'text/markdown', stored: Buffer.from('same-size-A'), declared: Buffer.from('same-size-B') },
    { logicalPath: 'direct-truncated.md', mimeType: 'text/markdown', stored: Buffer.from('truncated'), declared: Buffer.from('truncated-and-more') },
    { logicalPath: 'sidecar-same.pdf', mimeType: 'application/pdf', stored: Buffer.from('%PDF-same-A'), declared: Buffer.from('%PDF-same-B') },
    { logicalPath: 'sidecar-truncated.pdf', mimeType: 'application/pdf', stored: Buffer.from('%PDF-truncated'), declared: Buffer.from('%PDF-truncated-and-more') },
  ])('在 $logicalPath 进入扫描器或解析器前校验实际长度与摘要', async ({ logicalPath, mimeType, stored, declared }) => {
    const malwareScanner = vi.fn();
    const parserCascade = vi.fn();
    const handlers = createHandlers({ completeStructured: vi.fn() } as unknown as AiGateway, { parserCascade });
    const deps = {
      storage: { getObject: vi.fn().mockResolvedValue({ body: Readable.from([stored]), size: stored.length }) },
      malwareScanner,
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({
          id: 'agent-task-1', kind: 'sdf.extract', status: 'running',
          session: { userId: 'user-1', researchObject: {
            id: 'ro-1', workspaceId: 'workspace-1', workspace: { id: 'workspace-1', status: 'active' },
          } },
        }) },
        membership: { findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1', workspaceId: 'workspace-1', role: 'author',
        }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: declared.length,
          blobSha256: createHash('sha256').update(declared).digest('hex'), logicalPath, mimeType,
        }) },
      },
    };

    await expect(handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' }, executionAttempt: 1,
    })).rejects.toThrow(/artifact integrity mismatch/);
    expect(malwareScanner).not.toHaveBeenCalled();
    expect(parserCascade).not.toHaveBeenCalled();
  });
  it('前八个关键词已在头部时仍选取中段结果，并保留准确偏移和字符预算', () => {
    const manuscript = `${'results '.repeat(8)}${'h'.repeat(15_000)}RESULTS critical-middle-measurement${'t'.repeat(18_000)}`;
    const selected = selectManuscriptEvidence(manuscript);

    expect(selected).toContain('critical-middle-measurement');
    const excerpts = [...selected.matchAll(/--- SOURCE chars:(\d+)-(\d+) ---\n([\s\S]*?)(?=\n\n--- SOURCE|$)/g)];
    let total = 0;
    for (const [, start, end, content] of excerpts) {
      expect(content).toBe(manuscript.slice(Number(start), Number(end)));
      total += Number(end) - Number(start);
    }
    expect(total).toBeLessThanOrEqual(24_000);
  });

  it('同一个中段窗口内的重复关键词不耗尽后续证据窗口', () => {
    const manuscript = `${'h'.repeat(10_000)}${'results '.repeat(8)}${'m'.repeat(6_000)}RESULTS later-critical-measurement${'t'.repeat(18_000)}`;

    expect(selectManuscriptEvidence(manuscript)).toContain('later-critical-measurement');
  });

  it('长文即使前段关键词窗口很多也始终保留正文尾部', () => {
    const earlyWindows = Array.from({ length: 10 }, (_, index) => `LIMITATIONS early-${index} ${'x'.repeat(2_500)}`).join('\n');
    const manuscript = `${earlyWindows}${'m'.repeat(20_000)}TAIL-REPRODUCIBILITY-MARKER`;

    const selected = selectManuscriptEvidence(manuscript);

    expect(manuscript.length).toBeGreaterThan(44_000);
    expect(selected).toContain('TAIL-REPRODUCIBILITY-MARKER');
    expect(selected.length).toBeLessThanOrEqual(25_000);
  });

  it('worker 在读取 Blob 前再次拒绝跨 Workspace Artifact', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const handlers = createHandlers(gateway);
    const storage = { getObject: vi.fn() };
    const deps = {
      storage,
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({
          id: 'agent-task-1',
          session: { userId: 'user-1', researchObject: { id: 'ro-1', workspaceId: 'workspace-1' } },
        }) },
        membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1' }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-2', workspaceId: 'workspace-2', blobSha256: 'a'.repeat(64), logicalPath: 'private.pdf',
        }) },
      },
    };

    await expect(handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1', payload: { artifactId: 'artifact-2', researchObjectId: 'ro-1' },
    })).rejects.toThrow(/Artifact/);
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });

  it('worker 在读取 Blob 前拒绝超过解析上限的 Artifact', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const handlers = createHandlers(gateway);
    const storage = { getObject: vi.fn() };
    await expect(handlers['sdf.extract']!({
      storage,
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({ session: { userId: 'user-1', researchObject: { id: 'ro-1', workspaceId: 'workspace-1' } } }) },
        membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1' }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: 50 * 1024 * 1024 + 1,
          blobSha256: 'a'.repeat(64), logicalPath: 'oversized.pdf',
        }) },
      },
    } as never, { id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' } }))
      .rejects.toThrow(/artifact exceeds parser limit/);

    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('worker 未配置恶意内容扫描器时 fail closed 且不读取 Blob', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const handlers = createHandlers(gateway);
    const storage = { getObject: vi.fn() };
    const deps = {
      storage,
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({ session: { userId: 'user-1', researchObject: { id: 'ro-1', workspaceId: 'workspace-1' } } }) },
        membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1' }) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: 1024,
          blobSha256: 'a'.repeat(64), logicalPath: 'paper.pdf',
        }) },
      },
    };

    await expect(handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' },
    })).rejects.toThrow(/malware scanner unavailable/);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('worker 在消费前重新拒绝已被移出 Workspace 的提交者', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const handlers = createHandlers(gateway);
    const storage = { getObject: vi.fn() };
    const deps = {
      storage,
      malwareScanner: vi.fn(),
      prisma: {
        agentTask: { findUnique: vi.fn().mockResolvedValue({ session: { userId: 'user-removed', researchObject: { id: 'ro-1', workspaceId: 'workspace-1' } } }) },
        membership: { findUnique: vi.fn().mockResolvedValue(null) },
        artifact: { findUnique: vi.fn().mockResolvedValue({
          id: 'artifact-1', workspaceId: 'workspace-1', size: 1024,
          blobSha256: 'a'.repeat(64), logicalPath: 'paper.pdf',
        }) },
      },
    };

    await expect(handlers['sdf.extract']!(deps as never, {
      id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' },
    })).rejects.toThrow(/membership/);
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(deps.malwareScanner).not.toHaveBeenCalled();
  });

  it('调 gateway.completeStructured + 返回 core（无 prisma 写入）', async () => {
    const provider: Provider = { name: 'mock', complete: async () => ({ text: JSON.stringify(VALID_PROPOSAL), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const result = await extractHandler(gateway, { payload: { manuscriptText: 'P I M R L RP：这是一篇关于量子计算的文章正文。' } });
    expect(result.core.problem).toBe('P');
    expect(result.core).toMatchObject({ method: 'M', reproducibility: 'RP' });
  });

  it('缺正文 → 抛错', async () => {
    const provider: Provider = { name: 'mock', complete: async () => ({ text: '{}', usage: { inputTokens: 0, outputTokens: 0 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    await expect(extractHandler(gateway, { payload: {} })).rejects.toThrow(/缺少正文/);
  });

  it('保留正文后段的局限与复现证据，并返回逐字段来源和缺失信息', async () => {
    let submittedText = '';
    const proposal = {
      schemaVersion: '0.1.0',
      fields: {
        problem: { summary: '现有近红外场采样依赖大型系统。', sourceQuote: 'bulky apparatuses', sourceLocator: 'chars:15-32', needsMoreInformation: false },
        insight: { summary: '提出片上采样器。', sourceQuote: 'all-on-chip', sourceLocator: 'chars:40-51', needsMoreInformation: false },
        method: { summary: '使用纳米天线电子发射。', sourceQuote: 'nanoantenna emission', sourceLocator: 'chars:60-80', needsMoreInformation: false },
        results: { summary: '恢复弱光瞬态。', sourceQuote: 'recovered the weak optical transient', sourceLocator: 'chars:90-126', needsMoreInformation: false },
        limitations: { summary: '器件仍依赖约 50 pJ 驱动脉冲。', sourceQuote: 'requires a 50 pJ driving pulse', sourceLocator: 'chars:9100-9131', needsMoreInformation: false },
        reproducibility: { summary: '', sourceQuote: '', sourceLocator: '', needsMoreInformation: true },
      },
    };
    const provider: Provider = {
      name: 'capture', model: 'capture',
      complete: async (input) => {
        submittedText = input.messages.map((message) => message.content).join('\n');
        return { text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'capture' };
      },
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const manuscriptText = `INTRO ${'x'.repeat(9_000)}\n\nLIMITATIONS: requires a 50 pJ driving pulse.\n\nDATA AVAILABILITY: not reported.`;

    const result = await extractHandler(gateway, { payload: { manuscriptText } }) as unknown as {
      core: ExtractedCore;
      evidence: Record<string, { quote: string; locator: string }>;
      needsMoreInformation: string[];
    };

    expect(submittedText).toContain('requires a 50 pJ driving pulse');
    expect(result.core.limitations).toContain('50 pJ');
    expect(result.evidence.limitations.quote).toBe('requires a 50 pJ driving pulse');
    expect(result.evidence.limitations.locator).toMatch(/^chars:\d+-\d+$/);
    expect(result.needsMoreInformation).toContain('reproducibility');
  });

  it('接受 PDF 空白等价引文，但证据仍切回原始正文字符区间', async () => {
    const manuscriptText = 'P I M R L RP\nHowever, optical-field sampling systems\nrequire bulky apparatuses and vacuum environments.';
    const proposal = {
      ...VALID_PROPOSAL,
      fields: {
        ...VALID_PROPOSAL.fields,
        problem: {
          summary: '现有光场采样系统依赖庞大设备和真空环境。',
          sourceQuote: 'However optical field sampling systems require bulky apparatuses and vacuum environments',
          needsMoreInformation: false,
        },
      },
    };
    const provider: Provider = {
      name: 'pdf-whitespace', model: 'pdf-whitespace',
      complete: async () => ({ text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'pdf-whitespace' }),
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;

    const result = await extractHandler(gateway, { payload: { manuscriptText } });

    expect(result.core.problem).toContain('庞大设备');
    expect(result.evidence.problem.quote).toBe('However, optical-field sampling systems\nrequire bulky apparatuses and vacuum environments');
    expect(result.evidence.problem.locator).toMatch(/^chars:\d+-\d+$/);
  });

  it('canonical source map 将唯一第二页 Unicode 空白等价引文定位到原始 block，并忽略模型伪造 locator', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-canonical', contentHash: 'b'.repeat(64),
      parser: { name: 'cascade', version: '1' },
      pages: [
        { page: 1, width: 100, height: 100, blocks: [{
          id: 'page-one', kind: 'paragraph', text: 'Unrelated first page.',
          boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [],
        }] },
        { page: 2, width: 100, height: 100, blocks: [{
          id: 'page-two', kind: 'paragraph', text: '  CRLF\r\n😀e\u0301 evidence  ',
          boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [],
        }] },
      ],
    };
    const proposal = {
      ...VALID_PROPOSAL,
      fields: {
        ...VALID_PROPOSAL.fields,
        problem: {
          summary: 'Unicode evidence', sourceQuote: 'CRLF 😀e\u0301 evidence',
          sourceLocator: '{"artifactId":"forged","blockId":"forged"}', needsMoreInformation: false,
        },
      },
    };
    const provider: Provider = {
      name: 'canonical-location', model: 'canonical-location',
      complete: async () => ({ text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'canonical-location' }),
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;

    const result = await extractHandler(gateway, {
      payload: { manuscriptText: sourceMapToManuscriptText(sourceMap) },
    }, { sourceMap });

    expect(result.evidence.problem).toEqual({ quote: 'CRLF\r\n😀e\u0301 evidence', locator: 'chars:22-41' });
    expect(result.evidenceLocation?.problem).toMatchObject({
      status: 'located', origin: 'model_quote', matching: 'whitespace',
      sourceLocator: {
        artifactId: 'artifact-canonical', contentHash: 'b'.repeat(64), blockId: 'page-two', page: 2,
        charRange: { start: 2, end: 21 },
      },
    });
  });

  it('trusted canonical source map overrides a conflicting payload manuscript for both prompt and locator binding', async () => {
    const mapA: DocumentSourceMap = {
      artifactId: 'artifact-A', contentHash: 'd'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'map-a-block', kind: 'paragraph', text: 'Problem: shared quote from map A.',
        boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [],
      }] }],
    };
    const payloadB = 'Problem: shared quote from map B.';
    let prompt = '';
    const proposal = {
      schemaVersion: '0.1.0', fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
        summary: '', sourceQuote: '', needsMoreInformation: true,
      }])),
    };
    const provider: Provider = {
      name: 'canonical-overrides-payload', model: 'canonical-overrides-payload',
      complete: async (input) => {
        prompt = input.messages.map((message) => message.content).join('\n');
        return { text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'canonical-overrides-payload' };
      },
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;

    const result = await extractHandler(gateway, { payload: { manuscriptText: payloadB } }, { sourceMap: mapA });

    expect(prompt).toContain('shared quote from map A');
    expect(prompt).not.toContain('shared quote from map B');
    expect(result.evidenceLocation?.problem).toMatchObject({
      status: 'located', sourceLocator: { artifactId: 'artifact-A', contentHash: 'd'.repeat(64), blockId: 'map-a-block' },
    });
  });

  it('canonical locations refuse duplicate, cross-block, missing, and empty quotes without inventing a source locator', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-status', contentHash: 'c'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [
        { id: 'one', kind: 'paragraph', text: 'Exact duplicate', boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'two', kind: 'paragraph', text: 'Exact duplicate', boundingBox: { x: 0, y: 20, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'three', kind: 'paragraph', text: 'Whitespace\n duplicate', boundingBox: { x: 0, y: 40, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'four', kind: 'paragraph', text: 'Whitespace duplicate', boundingBox: { x: 0, y: 60, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'five', kind: 'paragraph', text: 'cross block', boundingBox: { x: 0, y: 80, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'six', kind: 'paragraph', text: 'quote', boundingBox: { x: 0, y: 90, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
      ] }, { page: 2, width: 100, height: 100, blocks: [
        { id: 'seven', kind: 'paragraph', text: 'Exact duplicate', boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
      ] }],
    };
    const quote = (sourceQuote: string, needsMoreInformation = false) => ({ summary: 'summary', sourceQuote, needsMoreInformation });
    const proposal = {
      schemaVersion: '0.1.0', fields: {
        problem: quote('Exact duplicate'),
        insight: quote('Whitespace duplicate'),
        method: quote('block\nquote'),
        results: quote('absent quote'),
        limitations: quote('', true),
        reproducibility: quote('', true),
      },
    };
    const provider: Provider = {
      name: 'location-status', model: 'location-status',
      complete: async () => ({ text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'location-status' }),
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const result = await extractHandler(gateway, {
      payload: { manuscriptText: sourceMapToManuscriptText(sourceMap) },
    }, { sourceMap });

    expect(result.evidenceLocation).toMatchObject({
      problem: { status: 'ambiguous', reason: 'multiple-matches' },
      insight: { status: 'ambiguous', reason: 'multiple-matches' },
      method: { status: 'cross_block', reason: 'match-spans-blocks' },
      results: { status: 'missing', reason: 'no-match' },
      limitations: { status: 'missing', reason: 'empty-quote' },
    });
    expect(result.evidenceLocation?.insight).not.toHaveProperty('matching');
    expect(result.evidence.problem).toEqual({ quote: 'Exact duplicate', locator: 'chars:0-15' });
    expect(result.evidence.insight).toEqual({ quote: 'Whitespace duplicate', locator: 'chars:54-74' });
    expect(result.evidence.method).toEqual({ quote: 'block\nquote', locator: 'chars:81-92' });
    for (const field of ['problem', 'insight', 'method', 'results', 'limitations'] as const) {
      expect(result.evidenceLocation?.[field]).not.toHaveProperty('sourceLocator');
    }
  });

  it.each(['repeat quote ', 'repeat\nquote '])('stops occurrence enumeration after ambiguity is established: %j', async (fragment) => {
    const text = fragment.repeat(2_000).trim();
    const sourceMap: DocumentSourceMap = {
      artifactId: 'repeated', contentHash: 'c'.repeat(64), parser: { name: 'test', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'repeated-block', kind: 'paragraph', text,
        boundingBox: { x: 0, y: 0, width: 90, height: 10 },
        parser: { name: 'test', version: '1' }, transformations: [],
      }] }],
    };
    const proposal = { schemaVersion: '0.1.0', fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
      summary: 'Repeated source is ambiguous', sourceQuote: 'repeat quote', needsMoreInformation: false,
    }])) };
    const provider: Provider = { name: 'repeated', model: 'repeated', complete: async () => ({
      text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'repeated',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] });
    const original = String.prototype.indexOf;
    let occurrenceSearches = 0;
    const spy = vi.spyOn(String.prototype, 'indexOf').mockImplementation(function (this: string, search, position) {
      if (this.length > 20_000 && search === 'repeat quote') occurrenceSearches += 1;
      return original.call(this, search, position);
    });
    try {
      const result = await extractHandler(gateway, { payload: { manuscriptText: text } }, { sourceMap });
      expect(result.evidenceLocation?.problem.status).toBe('ambiguous');
      expect(result.evidence.problem.quote).toBe(fragment.trim());
      // A six-field extraction must not enumerate thousands of equivalent ranges.
      expect(occurrenceSearches).toBeLessThan(50);
    } finally { spy.mockRestore(); }
  });

  it('拒绝仅在移除词边界后才相同的语义变异引文', async () => {
    const manuscriptText = 'The treatment was notable for toxicity in the longitudinal cohort.';
    const proposal = {
      ...VALID_PROPOSAL,
      fields: {
        ...VALID_PROPOSAL.fields,
        problem: {
          summary: '治疗因为毒性而不可实施。',
          sourceQuote: 'The treatment was not able for toxicity in the longitudinal cohort',
          needsMoreInformation: false,
        },
      },
    };
    const provider: Provider = {
      name: 'semantic-mutation', model: 'semantic-mutation',
      complete: async () => ({ text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'semantic-mutation' }),
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;

    const result = await extractHandler(gateway, { payload: { manuscriptText } });

    expect(result.core.problem).toBe('');
    expect(result.evidence.problem).toEqual({ quote: '', locator: '' });
    expect(result.needsMoreInformation).toContain('problem');
  });

  it('模型保守地标记全部缺失时仍采用正文中的显式字段标签，但不推断未提供的 Results', async () => {
    const manuscriptText = [
      'Problem: Current optical measurements require an unverified assumption.',
      'Insight: Field-resolved sampling can connect waveforms to transport.',
      'Method: Use a calibrated pump-probe protocol.',
      'Limitations: Generalisation beyond this device remains unverified.',
      'Reproducibility: Publish calibration, geometry, code, and environment details.',
    ].join('\n');
    const missingProposal = {
      schemaVersion: '0.1.0',
      fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
        summary: '', sourceQuote: '', needsMoreInformation: true,
      }])),
    };
    const provider: Provider = {
      name: 'conservative', model: 'conservative',
      complete: async () => ({ text: JSON.stringify(missingProposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'conservative' }),
    };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;

    const result = await extractHandler(gateway, { payload: { manuscriptText } });

    expect(result.core.problem).toBe('Current optical measurements require an unverified assumption.');
    expect(result.evidence.problem).toEqual({
      quote: 'Current optical measurements require an unverified assumption.',
      locator: 'chars:9-71',
    });
    expect(result.core.reproducibility).toContain('Publish calibration');
    expect(result.core.results).toBe('');
    expect(result.needsMoreInformation).toEqual(['results']);
  });
});
