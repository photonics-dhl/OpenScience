import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { claimAgentTask, createAgentSession, submitAgentTask, getAgentTask, listAgentTasks, markTaskProgress } from '../../src/agent/agent';

/** 内存 Redis fake（队列：agent:queue）。 */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  return {
    lists,
    lpush: async (key: string, val: string) => {
      const arr = lists.get(key) ?? [];
      arr.unshift(val);
      lists.set(key, arr);
      return arr.length;
    },
    brpoplpush: async (src: string, dst: string, timeout: number) => {
      void timeout;
      const arr = lists.get(src);
      const val = arr?.pop();
      if (!val) return null;
      lists.set(src, arr!);
      const dstArr = lists.get(dst) ?? [];
      dstArr.push(val);
      lists.set(dst, dstArr);
      return val;
    },
    lrem: async (key: string, _count: number, val: string) => {
      const arr = lists.get(key) ?? [];
      lists.set(key, arr.filter((v) => v !== val));
      return 0;
    },
  };
}

async function makeDeps(credit = 100) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'agent-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  // AI Credit 余额（§2.4-7）
  db.usageLedger.push({ id: 'u-1', userId: user.id, resource: 'ai_credit', delta: credit, kind: 'grant', createdAt: new Date() });
  const redis = fakeRedis();
  const deps = { prisma, mailer: {} as never, redis } as never;
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  return { deps: { prisma, mailer: {} as never, redis } as never, db, user, ro, redis };
}

describe('AgentSession/AgentTask（§15 + §16 幂等 + §9.1 配额）', () => {
  it('建会话 + 提交任务入队 + 进度查询', async () => {
    const { deps, user, ro, redis } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    expect(session.researchObjectId).toBe(ro.id);

    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'hi' } });
    expect(task.status).toBe('pending');
    expect(redis.lists.get('agent:queue')?.includes(task.id)).toBe(true);

    const view = await getAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(view.kind).toBe('demo.echo');
  });

  it('lists only the current user actionable tasks with RO context', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: {} });
    const rows = await listAgentTasks(deps, { userId: user.id, actionableOnly: true });
    expect(rows).toEqual([
      expect.objectContaining({ id: task.id, researchObjectId: ro.id, status: 'pending' }),
    ]);
  });

  it('幂等键重放 → 返回既有任务（§16 不重复）', async () => {
    const { deps, user, ro, redis } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'x' }, idempotencyKey: 'k1' };
    const first = await submitAgentTask(deps, input);
    const replay = await submitAgentTask(deps, input);
    expect(replay.id).toBe(first.id);
    expect(redis.lists.get('agent:queue')).toEqual([first.id]);
  });

  it('Redis dispatch 失败后重放可恢复同一 pending 任务', async () => {
    const { deps, user, ro, redis, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const originalLpush = redis.lpush;
    let firstAttempt = true;
    redis.lpush = async (key: string, value: string) => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('redis unavailable');
      }
      return originalLpush(key, value);
    };
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, idempotencyKey: 'recover-dispatch' };
    await expect(submitAgentTask(deps, input)).rejects.toThrow(/redis unavailable/);
    expect(db.agentTasks).toHaveLength(1);
    const replay = await submitAgentTask(deps, input);
    expect(redis.lists.get('agent:queue')).toEqual([replay.id]);
  });

  it('worker CAS claim 只允许一个消费者执行任务', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} });
    expect((await claimAgentTask(deps, task.id))?.status).toBe('running');
    expect(await claimAgentTask(deps, task.id)).toBeNull();
  });

  it('任务幂等键不能跨 Hermes 会话重放', async () => {
    const { deps, user, ro } = await makeDeps();
    const firstSession = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const secondSession = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await submitAgentTask(deps, {
      sessionId: firstSession.id, userId: user.id, kind: 'demo.echo', payload: { message: 'first' }, idempotencyKey: 'shared-task-key',
    });
    await expect(submitAgentTask(deps, {
      sessionId: secondSession.id, userId: user.id, kind: 'demo.echo', payload: { message: 'second' }, idempotencyKey: 'shared-task-key',
    })).rejects.toThrow(/幂等键/);
  });

  it('会话并发 P2002 恢复不能返回其他用户的会话', async () => {
    const { deps, db, user, ro } = await makeDeps();
    const outsider = seedUser(db, { id: 'session-outsider' });
    db.agentSessions.push({
      id: 'outsider-session', userId: outsider.id, researchObjectId: null, kind: 'ingestion', title: '', status: 'active',
      idempotencyKey: 'raced-session-key', createdAt: new Date(), updatedAt: new Date(),
    });
    const prisma = (deps as { prisma: { agentSession: { findUnique: (args: unknown) => Promise<unknown> } } }).prisma;
    const originalFindUnique = prisma.agentSession.findUnique;
    let lookupCount = 0;
    prisma.agentSession.findUnique = async (args: unknown) => {
      lookupCount += 1;
      if (lookupCount === 1) return null;
      return originalFindUnique(args);
    };

    await expect(createAgentSession(deps, {
      userId: user.id, researchObjectId: ro.id, kind: 'ingestion', idempotencyKey: 'raced-session-key',
    })).rejects.toThrow(/幂等键/);
  });

  it('AI Credit 不足 → INSUFFICIENT_CREDIT（§9.1）', async () => {
    const { deps, user, ro } = await makeDeps(0);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await expect(
      submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} }),
    ).rejects.toThrow(/AI Credit 不足/);
  });

  it('他人会话提交 → 404（§17 越权）', async () => {
    const { deps, db, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const outsider = seedUser(db, { id: 'agent-outsider' });
    await expect(
      submitAgentTask(deps, { sessionId: session.id, userId: outsider.id, kind: 'x', payload: {} }),
    ).rejects.toThrow(/会话不存在/);
  });

  it('任务状态机：非法迁移拒绝 + 终态幂等', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'x', payload: {} });
    // pending → succeeded 非法（需经 running）
    await expect(
      markTaskProgress(deps, { taskId: task.id, status: 'succeeded' }),
    ).rejects.toThrow(/非法/);
    // pending → running → succeeded
    await markTaskProgress(deps, { taskId: task.id, status: 'running', progress: 50 });
    const done = await markTaskProgress(deps, { taskId: task.id, status: 'succeeded', progress: 100, result: { ok: true } });
    expect(done.status).toBe('succeeded');
    // 终态重放 → skip（§16 幂等，不抛错不覆盖）
    const replay = await markTaskProgress(deps, { taskId: task.id, status: 'running', progress: 10 });
    expect(replay.status).toBe('succeeded');
    expect(replay.progress).toBe(100);
  });

  it('永久阻断错误同步为 failed_blocked，不允许普通 retry', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'ingestion' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: {} });
    db.ingestionTasks.push({
      id: 'ingestion-task-1', batchId: 'batch-1', artifactId: 'artifact-1', agentTaskId: task.id,
      state: 'parsing', retryCount: 0, error: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await markTaskProgress(deps, { taskId: task.id, status: 'running' });
    await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: '[blocked] parser rejected unsafe content' });
    expect(db.ingestionTasks[0].state).toBe('failed_blocked');
  });
});
