import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import type { AiGateway } from '@openscience/ai-gateway';
import { createAgentSession, submitAgentTask, getAgentTask, AGENT_TASK_QUEUE } from '@openscience/domain';
import { createHandlers, createPollOnce } from '@openscience/agent-worker';

/**
 * P1D-3 集成测试（云上执行）：真 PG/Redis。
 * sdf.extract 任务（注入 mock gateway）→ 异步完成 → result.core 六字段（§9.3/§5.4）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();

beforeAll(async () => {
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.agentTask.deleteMany();
  await prisma.agentSession.deleteMany();
});

afterAll(async () => {
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.agentTask.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.usageLedger.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1D-3 SDF Extractor（云上，无新迁移）', () => {
  it('sdf.extract 任务 → mock gateway 提取六字段 → succeeded + result.core（§9.3/§5.1）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    const user = await prisma.user.create({
      data: { email: `ext${Date.now()}@example.com`, displayName: 'ext', passwordHash: 'x', status: 'email_verified' },
    });
    await prisma.usageLedger.create({ data: { userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });

    // 注入 mock gateway（§24 占位，真实 MiniMax 未配置）
    const mockProvider = { name: 'mock-M3', complete: async () => ({
      text: JSON.stringify({ schemaVersion: '0.1.0', problem: '量子纠错', insight: '表面码', method: '实验', results: '保真度提升', limitations: '规模小', reproducibility: '代码见附录' }),
      usage: { inputTokens: 10, outputTokens: 5 }, model: 'mock-M3',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [mockProvider], logger: console }) as AiGateway;
    const handlers = createHandlers(gateway);
    const pollOnce = await createPollOnce(handlers);

    const session = await createAgentSession(deps, { userId: user.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: '本文研究量子纠错表面码……' } });
    expect(task.status).toBe('pending');

    // 异步消费（P1D-3 handler）
    const consumed = await pollOnce(deps);
    expect(consumed).toBe(true);

    const done = await getAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(done.status).toBe('succeeded');
    expect(done.progress).toBe(100);
    const core = done.result?.core as Record<string, string>;
    expect(core.problem).toBe('量子纠错');
    expect(core.method).toBe('实验');
    expect(core.reproducibility).toBe('代码见附录');

    // 未写 SDF（§9.2 禁止覆盖正文）：无 RO 级 sdf 更新
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('extract 失败（非法 JSON）→ 任务 failed + error（§9.3 校验失败有限重试后拒绝）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    const user = await prisma.user.create({
      data: { email: `ext2${Date.now()}@example.com`, displayName: 'ext2', passwordHash: 'x', status: 'email_verified' },
    });
    await prisma.usageLedger.create({ data: { userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });

    const badProvider = { name: 'mock-bad', complete: async () => ({
      text: 'not-json-at-all', usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock-bad',
    }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [badProvider], logger: console }) as AiGateway;
    const handlers = createHandlers(gateway);
    const pollOnce = await createPollOnce(handlers);

    const session = await createAgentSession(deps, { userId: user.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: 'x' } });
    await pollOnce(deps);
    const done = await getAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(done.status).toBe('failed');
    expect(done.error).toContain('重试上限');
    await prisma.user.delete({ where: { id: user.id } });
  });
});
