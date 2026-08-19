import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { AiGateway, Provider } from '@openscience/ai-gateway';
import { extractHandler, sdfCoreGuard, selectManuscriptEvidence, type ExtractedCore } from '../src/extractor';
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
  it('对象存储实际字节超过声明上限时停止缓冲', async () => {
    await expect(streamToBufferBounded(Readable.from([Buffer.from('123'), Buffer.from('456')]), 5))
      .rejects.toThrow(/exceeds limit/);
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
