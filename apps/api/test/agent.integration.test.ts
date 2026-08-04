import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { createAgentSession, submitAgentTask, getAgentTask, AGENT_TASK_QUEUE } from '@openscience/domain';
import { pollOnce } from '@openscience/agent-worker';

/**
 * P1D-2 集成测试（云上执行）：真 PG/Redis 队列。
 * 提交任务 → worker pollOnce 异步消费 → 完成 → 幂等重放（§16）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();

beforeAll(async () => {
  // 清队列 + DB 残留（防跨运行 poll 陈旧任务 id）
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.agentTask.deleteMany();
  await prisma.agentSession.deleteMany();
});

afterAll(async () => {
  // 清 Redis 队列残留（跨运行持久化，防 poll 消费陈旧任务 id → findUnique null）
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

describe('P1D-2 Hermes 异步任务通道（云上，迁移 15）', () => {
  it('提交任务 → pollOnce 消费 → succeeded + 进度 100（§9.3 长任务异步）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    // 直接建 user 行（非 auth 全流程，聚焦 agent 链路）
    const user = await prisma.user.create({
      data: { email: `agent${Date.now()}@example.com`, displayName: 'agent', passwordHash: 'x', status: 'email_verified' },
    });
    // §2.4-7：AI Credit 配额（P1A-7 骨架）
    await prisma.usageLedger.create({ data: { userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });
    const session = await createAgentSession(deps, { userId: user.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'ping' } });
    expect(task.status).toBe('pending');

    // 消费（幂等：重复 poll 不重复副作用）
    const consumed = await pollOnce(deps);
    expect(consumed).toBe(true);
    const done = await getAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(done.status).toBe('succeeded');
    expect(done.progress).toBe(100);
    expect(done.result).toMatchObject({ echoed: 'ping' });

    // §16 幂等重放：已完成任务再 poll → skip（不重复执行/不覆盖）
    const replay = await pollOnce(deps);
    expect(replay).toBe(false); // 队列已空，无新任务
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('幂等键：同 key 重发 → 返回既有任务（§16）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    const user = await prisma.user.create({
      data: { email: `agent2${Date.now()}@example.com`, displayName: 'agent2', passwordHash: 'x', status: 'email_verified' },
    });
    await prisma.usageLedger.create({ data: { userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });
    const session = await createAgentSession(deps, { userId: user.id, kind: 'extract' });
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'x' }, idempotencyKey: `ik-${Date.now()}` };
    const first = await submitAgentTask(deps, input);
    const replay = await submitAgentTask(deps, input);
    expect(replay.id).toBe(first.id);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
