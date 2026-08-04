import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { AiGateway, type Provider } from '@openscience/ai-gateway';

/**
 * P1D-1 集成测试（云上执行）：真 PG 审计落表。
 * 以 mock provider 注入 gateway → 调用 → 审计行字段完整 + 密钥不落日志（§9.3/§17）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: 'ai.gateway.call' } });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1D-1 AI Gateway 调用日志（云上，真 PG）', () => {
  it('mock provider 调用 → 审计行含模型/token/延迟，无密钥无 prompt（§9.3/§17）', async () => {
    const provider: Provider = {
      name: 'mock-primary',
      complete: async () => ({ text: 'ok', usage: { inputTokens: 33, outputTokens: 7 }, model: 'mock-M3' }),
    };
    const gw = new AiGateway({
      providers: [provider],
      audit: await import('@openscience/database').then((m) => m.createPrismaAuditSink(prisma)),
      logger: console,
    });

    await gw.complete([{ role: 'user', content: 'SENSITIVE_PROMPT_XYZ' }]);

    const rows = await prisma.auditLog.findMany({
      where: { action: 'ai.gateway.call' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(rows.length).toBe(1);
    const meta = rows[0].metadata as Record<string, unknown>;
    // §9.3 调用日志字段
    expect(meta.provider).toBe('mock-primary');
    expect(meta.model).toBe('mock-M3');
    expect(meta.inputTokens).toBe(33);
    expect(meta.outputTokens).toBe(7);
    expect(typeof meta.latencyMs).toBe('number');
    // §17 脱敏：无 prompt / 无密钥
    expect(JSON.stringify(rows[0].metadata)).not.toContain('SENSITIVE_PROMPT_XYZ');
    expect(JSON.stringify(rows[0].metadata)).not.toMatch(/api[_-]?key|Bearer/i);
  });

  it('回退链：primary 失败 → fallback 成功，记录回退原因', async () => {
    const fail: Provider = { name: 'mock-fail', complete: async () => { throw new Error('down'); } };
    const fallback: Provider = { name: 'mock-fallback', complete: async () => ({ text: 'recovered', usage: { inputTokens: 5, outputTokens: 2 }, model: 'mock-fb' }) };
    const gw = new AiGateway({
      providers: [fail, fallback],
      audit: await import('@openscience/database').then((m) => m.createPrismaAuditSink(prisma)),
      logger: console,
    });

    const result = await gw.complete([{ role: 'user', content: 'x' }]);
    expect(result.text).toBe('recovered');

    const rows = await prisma.auditLog.findMany({
      where: { action: 'ai.gateway.call' },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    const fallbackLog = rows.find((r) => (r.metadata as { fallbackReason?: string }).fallbackReason);
    expect(fallbackLog).toBeDefined();
    expect((fallbackLog!.metadata as { provider: string }).provider).toBe('mock-fallback');
  });
});
