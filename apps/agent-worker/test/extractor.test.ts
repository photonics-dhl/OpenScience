import { describe, expect, it } from 'vitest';
import type { AiGateway, Provider } from '@openscience/ai-gateway';
import { extractHandler, sdfCoreGuard, type ExtractedCore } from '../src/extractor';

const VALID: ExtractedCore = {
  schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP',
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
  it('调 gateway.completeStructured + 返回 core（无 prisma 写入）', async () => {
    const provider: Provider = { name: 'mock', complete: async () => ({ text: JSON.stringify(VALID), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const result = await extractHandler(gateway, { payload: { manuscriptText: '这是一篇关于量子计算的文章正文……' } });
    expect(result.core.problem).toBe('P');
    expect(result.core).toMatchObject({ method: 'M', reproducibility: 'RP' });
  });

  it('缺正文 → 抛错', async () => {
    const provider: Provider = { name: 'mock', complete: async () => ({ text: '{}', usage: { inputTokens: 0, outputTokens: 0 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    await expect(extractHandler(gateway, { payload: {} })).rejects.toThrow(/缺少正文/);
  });
});
