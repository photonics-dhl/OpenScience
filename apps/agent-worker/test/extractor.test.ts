import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { AiGateway, type Provider } from '@openscience/ai-gateway';
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
      fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, field === 'problem'
        ? { summary: 'Canonical parser problem', sourceBlockIds: ['B000001'], needsMoreInformation: false }
        : { summary: '', sourceBlockIds: [], needsMoreInformation: true }])),
    };
    const completeStructured = vi.fn(async (guard: (value: unknown) => boolean) => {
      expect(guard(proposal)).toBe(true);
      return proposal;
    });
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
      status: 'located', origin: 'model_quote',
      sourceLocator: { artifactId: 'artifact-1', contentHash, blockId: 'block-1', page: 1 },
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^derived\/source-maps\/[a-f0-9]{64}\.json$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/json' }),
    );
  });

  it('SDF proposal provider failure stays retryable after preserving the trusted SourceMap reference', async () => {
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
    await expect(handlers['sdf.extract']!({
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
    } as never, { id: 'agent-task-1', payload: { artifactId: 'artifact-1', researchObjectId: 'ro-1' }, executionAttempt: 1 }))
      .rejects.toThrow(/provider down/);

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

  it.each(['missing', 'rewritten', 'partial', 'first-omitted', 'missing-upgrade', 'missing-invalid', 'two-failed-attempts'])('保留首轮合法字段并以字段原因修复其余字段：%s', async (mode) => {
    const blocks = Array.from({ length: 6 }, (_, index) => ({
      id: `block-${index + 1}`, kind: 'paragraph' as const, text: `Exact source block ${index + 1}`,
      boundingBox: { x: 1, y: 90 - index * 10, width: 80, height: 8 },
      parser: { name: 'native-pdf', version: '1' }, transformations: [],
    }));
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks }],
    };
    const missing = { summary: '', sourceBlockIds: [], needsMoreInformation: true };
    const first = {
      schemaVersion: '0.1.0',
      fields: {
        problem: { summary: 'Retained problem', sourceBlockIds: ['B000001', 'B000002'], needsMoreInformation: false },
        insight: { summary: 'Reverse order is invalid', sourceBlockIds: ['B000005', 'B000003'], needsMoreInformation: false },
        method: { summary: '', sourceBlockIds: [], needsMoreInformation: false },
        results: { summary: 'Duplicate invalid', sourceBlockIds: ['B000004', 'B000004'], needsMoreInformation: false },
        limitations: { summary: 'Must be empty when missing', sourceBlockIds: [], needsMoreInformation: true },
        reproducibility: missing,
      },
    };
    const second = {
      schemaVersion: '0.1.0',
      fields: Object.fromEntries(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']
        .map((field) => [field, field === 'method'
          ? { summary: 'Repaired method', sourceBlockIds: ['B000003', 'B000004'], needsMoreInformation: false }
          : missing])),
    };
    const requests: unknown[] = [];
    let call = 0;
    const provider: Provider = {
      name: 'fixture', model: 'fixture',
      complete: async (request) => {
        requests.push(request);
        call += 1;
        const reply = structuredClone(call === 1 ? first : second);
        if (call === 1 && mode === 'first-omitted') delete (reply.fields as Record<string, unknown>).method;
        if (call > 1 && mode === 'missing-upgrade') reply.fields.reproducibility = { summary: 'Supported reproduction condition', sourceBlockIds: ['B000006'], needsMoreInformation: false };
        if (call > 1 && mode === 'missing-invalid') reply.fields.reproducibility = { summary: 'Invalid must not upgrade', sourceBlockIds: ['UNKNOWN'], needsMoreInformation: false };
        if (call > 1 && mode !== 'missing') {
          reply.fields.problem = { summary: 'Unrequested rewrite', sourceBlockIds: ['B000005'], needsMoreInformation: false };
        }
        if (call === 2 && mode === 'two-failed-attempts') reply.fields.insight = first.fields.insight;
        if (call > 1 && mode === 'partial') {
          const partialFields = reply.fields as Record<string, unknown>;
          delete partialFields.problem;
          delete partialFields.reproducibility;
        }
        return { text: JSON.stringify(reply), model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    const result = await extractHandler(new AiGateway({ providers: [provider] }), { payload: {} }, { sourceMap });

    expect(call).toBe(mode === 'two-failed-attempts' ? 3 : 2);
    expect(result.core.problem).toBe('Retained problem');
    expect(result.evidenceSegments?.problem.map((segment) => segment.quote)).toEqual([
      'Exact source block 1', 'Exact source block 2',
    ]);
    expect(result.core.method).toBe('Repaired method');
    expect(result.evidenceSegments?.method.map((segment) => segment.quote)).toEqual([
      'Exact source block 3', 'Exact source block 4',
    ]);
    expect(result.needsMoreInformation).toEqual(mode === 'missing-upgrade'
      ? ['insight', 'results', 'limitations'] : ['insight', 'results', 'limitations', 'reproducibility']);
    expect(result.core.reproducibility).toBe(mode === 'missing-upgrade' ? 'Supported reproduction condition' : '');
    const initialRequest = JSON.stringify(requests[0]);
    const retryRequest = JSON.stringify(requests[1]);
    expect(initialRequest).toContain('{\\"summary\\": string, \\"sourceBlockIds\\": string[], \\"needsMoreInformation\\": boolean}');
    expect(retryRequest).toContain('insight:ordered_ids_required');
    expect(retryRequest).toContain(mode === 'first-omitted' ? 'method:malformed_item' : 'method:summary_required');
    expect(retryRequest).toContain('results:duplicate_ids');
    expect(retryRequest).toContain('limitations:missing_requires_empty');
    expect(retryRequest).toContain('only the invalid fields');
    expect(retryRequest).toContain('select 1-32 blocks');
    expect(retryRequest).toContain('may never have an empty sourceBlockIds array');
    expect(retryRequest).not.toContain('Reverse order is invalid');
    expect(retryRequest).not.toContain('Must be empty when missing');
  });

  it('错误 schemaVersion 的响应不缓存其中看似合法的字段', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1', contentHash: 'b'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'block-1', kind: 'paragraph', text: 'Exact source',
        boundingBox: { x: 1, y: 1, width: 10, height: 10 },
        parser: { name: 'native-pdf', version: '1' }, transformations: [],
      }] }],
    };
    const fields = Object.fromEntries(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']
      .map((field) => [field, field === 'problem'
        ? { summary: 'Must not survive', sourceBlockIds: ['B000001'], needsMoreInformation: false }
        : { summary: '', sourceBlockIds: [], needsMoreInformation: true }]));
    let call = 0;
    const provider: Provider = {
      name: 'fixture', model: 'fixture',
      complete: async () => ({ text: JSON.stringify(call++ === 0
        ? { schemaVersion: 'wrong', fields }
        : { schemaVersion: '0.1.0', fields: Object.fromEntries(Object.keys(fields).map((field) => [field, { summary: '', sourceBlockIds: [], needsMoreInformation: true }])) }), model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } }),
    };

    const result = await extractHandler(new AiGateway({ providers: [provider] }), { payload: {} }, { sourceMap });
    expect(result.core.problem).toBe('');
    expect(result.needsMoreInformation).toContain('problem');
  });

  it('重试耗尽时拒绝整份结果而不返回已缓存的局部字段', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-1', contentHash: 'c'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: Array.from({ length: 3 }, (_, index) => ({
        id: `block-${index + 1}`, kind: 'paragraph' as const, text: `Exact ${index + 1}`,
        boundingBox: { x: 1, y: 20 + index, width: 10, height: 10 },
        parser: { name: 'native-pdf', version: '1' }, transformations: [],
      })) }],
    };
    const invalid = {
      schemaVersion: '0.1.0', fields: {
        problem: { summary: 'Valid but not independently returnable', sourceBlockIds: ['B000001'], needsMoreInformation: false },
        insight: { summary: 'Still reversed', sourceBlockIds: ['B000003', 'B000001'], needsMoreInformation: false },
        method: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        results: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        limitations: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        reproducibility: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
      },
    };
    let calls = 0;
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async () => {
      calls += 1;
      return { text: JSON.stringify(invalid), model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
    } };

    await expect(extractHandler(new AiGateway({ providers: [provider] }), { payload: {} }, { sourceMap }))
      .rejects.toThrow(/重试上限/);
    expect(calls).toBe(3);
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
        problem: { summary: 'Unicode evidence', sourceBlockIds: ['B000002'], needsMoreInformation: false },
        insight: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        method: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        results: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        limitations: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
        reproducibility: { summary: '', sourceBlockIds: [], needsMoreInformation: true },
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

    expect(result.evidence.problem.quote).toBe('CRLF\r\n😀e\u0301 evidence');
    expect(result.evidenceLocation?.problem).toMatchObject({
      status: 'located', origin: 'model_quote', matching: 'exact',
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
      schemaVersion: '0.1.0', fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, field === 'problem'
        ? { summary: 'Map A problem', sourceBlockIds: ['B000001'], needsMoreInformation: false }
        : { summary: '', sourceBlockIds: [], needsMoreInformation: true }])),
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

  it('canonical block selections disambiguate repeated text and preserve multi-block evidence without a fake locator', async () => {
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
    const selected = (sourceBlockIds: string[]) => ({ summary: 'summary', sourceBlockIds, needsMoreInformation: false });
    const missing = { summary: '', sourceBlockIds: [], needsMoreInformation: true };
    const proposal = {
      schemaVersion: '0.1.0', fields: {
        problem: selected(['B000001']),
        insight: selected(['B000003']),
        method: selected(['B000005', 'B000006']),
        results: missing,
        limitations: missing,
        reproducibility: missing,
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
      problem: { status: 'located', sourceLocator: { blockId: 'one' } },
      insight: { status: 'located', sourceLocator: { blockId: 'three' } },
      method: { status: 'cross_block', reason: 'match-spans-blocks' },
      results: { status: 'missing', reason: 'empty-quote' },
      limitations: { status: 'missing', reason: 'empty-quote' },
    });
    expect(result.evidence.problem).toEqual({ quote: 'Exact duplicate', locator: 'blocks:B000001' });
    expect(result.evidence.insight.quote).toBe('Whitespace\n duplicate');
    expect(result.evidence.method.quote).toBe('cross block\nquote');
    expect(result.evidenceLocation?.method).not.toHaveProperty('sourceLocator');
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
    const proposal = { schemaVersion: '0.1.0', fields: Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, field === 'problem'
      ? { summary: 'Repeated source', sourceBlockIds: ['B000001'], needsMoreInformation: false }
      : { summary: '', sourceBlockIds: [], needsMoreInformation: true }])) };
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
      await expect(extractHandler(gateway, { payload: { manuscriptText: text } }, { sourceMap })).rejects.toThrow();
      expect(occurrenceSearches).toBe(0);
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

  it('uses ordered noncontiguous canonical blocks without including unrelated text or rewriting fragmented formulas', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-segments', contentHash: 'e'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 600, height: 800, blocks: [
        { id: 'line-a', kind: 'paragraph', text: 'The optical-', boundingBox: { x: 10, y: 10, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'line-b', kind: 'paragraph', text: 'field obeys Φ_CEP ≠ 0 under calibrated condi-', boundingBox: { x: 10, y: 20, width: 300, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'unrelated', kind: 'paragraph', text: 'Copyright and running header.', boundingBox: { x: 10, y: 25, width: 200, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
        { id: 'line-c', kind: 'paragraph', text: 'tions.', boundingBox: { x: 10, y: 30, width: 50, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [] },
      ] }],
    };
    const missing = { summary: '', sourceBlockIds: [], needsMoreInformation: true };
    const proposal = {
      schemaVersion: '0.1.0', fields: {
        problem: { summary: 'The calibrated condition produces a nonzero CEP response.', sourceBlockIds: ['B000001', 'B000002', 'B000004'], needsMoreInformation: false },
        insight: missing, method: missing, results: missing, limitations: missing, reproducibility: missing,
      },
    };
    const provider: Provider = { name: 'block-span', model: 'block-span', complete: async () => ({
      text: JSON.stringify(proposal), usage: { inputTokens: 1, outputTokens: 1 }, model: 'block-span',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });

    expect(result.core.problem).toContain('nonzero CEP');
    expect(result.evidence.problem.quote).toBe('The optical-\nfield obeys Φ_CEP ≠ 0 under calibrated condi-\ntions.');
    expect(result.evidenceLocation?.problem).toMatchObject({ status: 'cross_block', reason: 'match-spans-blocks' });
    expect(result.evidenceSegments?.problem).toEqual([
      expect.objectContaining({ quote: 'The optical-', sourceLocator: expect.objectContaining({ blockId: 'line-a', charRange: { start: 0, end: 12 } }) }),
      expect.objectContaining({ quote: 'field obeys Φ_CEP ≠ 0 under calibrated condi-', sourceLocator: expect.objectContaining({ blockId: 'line-b' }) }),
      expect.objectContaining({ quote: 'tions.', sourceLocator: expect.objectContaining({ blockId: 'line-c' }) }),
    ]);
  });

  it('materializes the legal six-by-32 canonical segment maximum in one indexed pass', async () => {
    const blocks = Array.from({ length: 32 }, (_, index) => ({
      id: `block-${index + 1}`, kind: 'paragraph' as const, text: `Exact segment ${index + 1}.`,
      boundingBox: { x: 0, y: index * 2, width: 50, height: 1 },
      parser: { name: 'native', version: '1' }, transformations: [],
    }));
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-max-segments', contentHash: '9'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks }],
    };
    const sourceBlockIds = blocks.map((_, index) => `B${String(index + 1).padStart(6, '0')}`);
    const fields = Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
      summary: `${field} summary`, sourceBlockIds, needsMoreInformation: false,
    }]));
    const provider: Provider = { name: 'max-segments', model: 'max-segments', complete: async () => ({
      text: JSON.stringify({ schemaVersion: '0.1.0', fields }), usage: { inputTokens: 1, outputTokens: 1 }, model: 'max-segments',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] });

    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });

    expect(Object.values(result.evidenceSegments!).flat()).toHaveLength(6 * 32);
    expect(result.evidenceSegments!.reproducibility[31]).toMatchObject({
      quote: 'Exact segment 32.', sourceLocator: { blockId: 'block-32', page: 1 },
    });
  });

  it.each([
    { label: 'unlisted', ids: ['B999999'] },
    { label: 'duplicate', ids: ['B000001', 'B000001'] },
    { label: 'empty', ids: [] },
  ])('rejects $label canonical block selections in structured validation', async ({ ids }) => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-guard', contentHash: 'f'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'only', kind: 'paragraph', text: 'A sufficiently substantive canonical evidence block.',
        boundingBox: { x: 0, y: 0, width: 90, height: 10 }, parser: { name: 'native', version: '1' }, transformations: [],
      }] }],
    };
    const fields = Object.fromEntries(Object.keys(VALID_PROPOSAL.fields).map((field) => [field, {
      summary: field === 'problem' ? 'Claim' : '', sourceBlockIds: field === 'problem' ? ids : [], needsMoreInformation: field !== 'problem',
    }]));
    const provider: Provider = { name: 'invalid-block', model: 'invalid-block', complete: async () => ({
      text: JSON.stringify({ schemaVersion: '0.1.0', fields }), usage: { inputTokens: 1, outputTokens: 1 }, model: 'invalid-block',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] });
    await expect(extractHandler(gateway, { payload: {} }, { sourceMap })).rejects.toThrow();
  });

  it('rejects canonical evidence whose authentic selected text exceeds 8000 characters', async () => {
    const sourceMap: DocumentSourceMap = {
      artifactId: 'artifact-oversize-evidence', contentHash: '8'.repeat(64), parser: { name: 'cascade', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'oversize', kind: 'paragraph', text: 'x'.repeat(8_001), boundingBox: { x: 0, y: 0, width: 90, height: 10 },
        parser: { name: 'native', version: '1' }, transformations: [],
      }] }],
    };
    const missing = { summary: '', sourceBlockIds: [], needsMoreInformation: true };
    const fields = { problem: { summary: 'Too large', sourceBlockIds: ['B000001'], needsMoreInformation: false },
      insight: missing, method: missing, results: missing, limitations: missing, reproducibility: missing };
    const gateway = new AiGateway({ providers: [{ name: 'oversize', model: 'oversize', complete: async () => ({
      text: JSON.stringify({ schemaVersion: '0.1.0', fields }), usage: { inputTokens: 1, outputTokens: 1 }, model: 'oversize',
    }) }] });
    await expect(extractHandler(gateway, { payload: {} }, { sourceMap })).rejects.toThrow(/重试上限/);
  });
});
