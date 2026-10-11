import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRedisClient, type Redis } from '@openscience/database';
import { createPollOnce, recoverProcessingQueue, type WorkerDeps } from '../src/index';
import { admitPendingVideoTask, createVideoReadinessResumeScheduler, parkPendingVideoTask, releasePendingVideoTask,
  recoverHeldVideoTasks, VIDEO_READINESS_HOLD } from '../src/video-task-admission';
import { claimAgentTask as realClaimAgentTask, dispatchAgentTask, recoverUndispatchedAgentTasks } from '../../../packages/domain/src/agent/agent';
import { initialNativeAgentExecution } from '../../../packages/domain/src/agent/native-agent-execution';

const execution = vi.hoisted(() => ({ claim: vi.fn(), progress: vi.fn() }));
// The dispatcher, intent proof and admission mutations remain real. Only the
// existing claim/progress execution ports are isolated from unrelated handlers.
vi.mock('@openscience/domain', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(),
  claimAgentTask: execution.claim, markTaskProgress: execution.progress,
}));
beforeEach(() => { execution.claim.mockReset(); execution.progress.mockReset(); });

const queueKey = 'agent:queue'; const processingKey = 'agent:queue:processing';
type QueueTask = {
  id: string; kind: string; status: string; error: string | null; executionAttempt: number; progress: number;
  sessionId: string; retryCount: number; result: Record<string, unknown> | null; interestContext: Record<string, unknown> | null;
  updatedAt: Date; createdAt: Date; dispatchedAt: Date | null; deletedAt: Date | null;
  payload: Record<string, unknown>; session: { id: string; userId: string; researchObjectId: string; deletedAt: Date | null;
    researchObject: { id: string; workspaceId: string; deletedAt: Date | null } };
};
function matches(value: unknown, where: Record<string, unknown>): boolean {
  const row = value as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some(filter => matches(row, filter));
    const actual = row[key];
    if (condition === Prisma.AnyNull) return actual == null;
    if (condition instanceof Date) return actual instanceof Date && actual.getTime() === condition.getTime();
    if (condition && typeof condition === 'object') {
      if ('equals' in condition) return condition.equals === Prisma.AnyNull ? actual == null : isDeepStrictEqual(actual, condition.equals);
      if ('in' in condition) return (condition.in as unknown[]).includes(actual);
      return Boolean(actual && matches(actual, condition as Record<string, unknown>));
    }
    return actual === condition;
  });
}
function queueFixture() {
  // A future saved timestamp proves park/release advance old+1ms even when now is behind.
  const savedAt = new Date(Date.now() + 60_000);
  const task: QueueTask = { id: 'video-task', kind: 'presentation.generate', status: 'pending', error: null,
    sessionId: 'session', retryCount: 0, result: null, interestContext: null,
    executionAttempt: 0, progress: 0, updatedAt: savedAt, createdAt: savedAt, dispatchedAt: savedAt, deletedAt: null,
    payload: { schemaVersion: 1, kind: 'video', researchObjectId: 'ro', versionId: 'version', sourceClaimIds: ['claim'], video: {} },
    session: { id: 'session', userId: 'actor', researchObjectId: 'ro', deletedAt: null,
      researchObject: { id: 'ro', workspaceId: 'workspace', deletedAt: null } } };
  const tasks = new Map<string, QueueTask>([[task.id, task]]);
  const lists = new Map<string, string[]>([[queueKey, [task.id]], [processingKey, []]]);
  const state = { ready: false, rejectUpdate: false, beforeUpdate: undefined as (() => void | Promise<void>) | undefined,
    afterPush: undefined as (() => Promise<void>) | undefined, queueWrongType: false };
  const agentTask = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(tasks.get(where.id) ?? null)),
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
      [...tasks.values()].filter(row => matches(row, where)).slice(0, take).map(row => structuredClone(row))),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hook = state.beforeUpdate; state.beforeUpdate = undefined; await hook?.();
      if (state.rejectUpdate) return { count: 0 };
      let count = 0;
      for (const row of tasks.values()) if (matches(row, where)) {
        const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
          value && typeof value === 'object' && 'increment' in value
            ? Number((row as unknown as Record<string, unknown>)[key]) + Number(value.increment) : value]));
        Object.assign(row, values, { updatedAt: data.updatedAt ?? new Date() }); count++;
      }
      return { count };
    }),
  };
  const redis = {
    lpush: vi.fn(async (key: string, id: string) => { lists.get(key)!.unshift(id); await state.afterPush?.(); return lists.get(key)!.length; }),
    brpoplpush: vi.fn(async (source: string, target: string) => {
      const id = lists.get(source)!.pop() ?? null; if (id) lists.get(target)!.unshift(id); return id;
    }),
    lrange: vi.fn(async (key: string) => [...lists.get(key)!]),
    lindex: vi.fn(async (key: string, index: number) => lists.get(key)!.at(index) ?? null),
    rpoplpush: vi.fn(async (source: string, target: string) => {
      const id = lists.get(source)!.pop() ?? null; if (id) lists.get(target)!.unshift(id); return id;
    }),
    lrem: vi.fn(async (key: string, count: number, id: string) => {
      expect(count).toBe(1); const entries = lists.get(key)!; const index = entries.indexOf(id);
      if (index < 0) return 0; entries.splice(index, 1); return 1;
    }),
    eval: vi.fn(async (_script: string, keys: number, queue: string, processing: string, id: string): Promise<number> => {
      expect(keys).toBe(2);
      if (state.queueWrongType) throw new Error('WRONGTYPE queue');
      const index = lists.get(processing)!.indexOf(id);
      if (index < 0) return 0;
      if (!lists.get(queue)!.includes(id)) await redis.lpush(queue, id);
      return redis.lrem(processing, 1, id);
    }),
    multi: vi.fn(() => {
      const operations: Array<() => Promise<unknown>> = [];
      const transaction = {
        lrem: (key: string, count: number, id: string) => { operations.push(() => redis.lrem(key, count, id)); return transaction; },
        lpush: (key: string, id: string) => { operations.push(() => redis.lpush(key, id)); return transaction; },
        exec: async () => { const values = []; for (const operation of operations) values.push([null, await operation()]); return values; },
      };
      return transaction;
    }),
  };
  const prisma = { agentTask, hermesResearchRun: { findMany: vi.fn(async () => []) },
    ingestionTask: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: { findMany: vi.fn(async () => []) } };
  // Ordinary extraction now also enters the shared source-authorization transaction.
  Object.assign(prisma, { $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)) });
  const deps = { prisma, redis, videoEnabled: true, readVideoReadiness: vi.fn(async () => state.ready) } as unknown as WorkerDeps;
  execution.claim.mockImplementation(async (_deps, id: string) => {
    const row = tasks.get(id); if (!row || row.status !== 'pending') return null;
    row.status = 'running'; row.executionAttempt++; return { ...row, retryCount: 0 };
  });
  execution.progress.mockImplementation(async (_deps, input: { taskId: string; status: string }) => {
    const row = tasks.get(input.taskId)!; row.status = input.status; return row;
  });
  const handler = vi.fn(async () => ({ completed: true }));
  return { task, tasks, lists, state, agentTask, redis, deps, handler,
    poll: async () => (await createPollOnce({ 'presentation.generate': handler, 'sdf.extract': handler }, { runMaintenance: false }))(deps),
    dispatch: () => dispatchAgentTask(deps, task.id), outbox: () => recoverUndispatchedAgentTasks(deps) };
}

function firstNativePlanFixture() {
  const f = queueFixture();
  const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;
  f.task.payload = { schemaVersion: 1, researchObjectId: uuid(1), versionId: uuid(2), kind: 'interactive_html', sourceClaimIds: [uuid(3)],
    storyboard: { output: 'video', narrative: true, locale: 'en', style: 'technical', instruction: 'Explain this finding' } };
  f.task.session.researchObjectId = uuid(1); f.task.session.researchObject.id = uuid(1);
  f.task.result = initialNativeAgentExecution({ runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' }, 'paper-illustration')!;
  // Exercise the real pending CAS and attempt increment, not the fixture's old claim port.
  execution.claim.mockImplementation((...args: unknown[]) =>
    (realClaimAgentTask as (...input: unknown[]) => Promise<unknown>)(...args));
  return f;
}

/** Execute the poller's actual script with isolated keys on the CI-only Redis. */
async function withRealRedisMove(
  check: (redis: Redis, move: () => Promise<unknown>, queue: string, processing: string, id: string) => Promise<void>,
) {
  const input = process.env.XGS_WORKER_TEST_REDIS_URL;
  let url: URL;
  try { url = new URL(input ?? ''); }
  catch { throw new Error('XGS_WORKER_TEST_REDIS_URL must target redis://127.0.0.1:16379'); }
  if (url.protocol !== 'redis:' || url.hostname !== '127.0.0.1' || url.port !== '16379'
    || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    throw new Error('XGS_WORKER_TEST_REDIS_URL must target redis://127.0.0.1:16379');
  const f = firstNativePlanFixture();
  f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
  await f.poll();
  expect(f.redis.eval).toHaveBeenCalledTimes(1);
  const [script, numberOfKeys, originalQueue, originalProcessing, id] = f.redis.eval.mock.calls[0]!;
  expect([numberOfKeys, originalQueue, originalProcessing, id]).toEqual([2, queueKey, processingKey, f.task.id]);
  const prefix = `xgs:worker-test:${randomUUID()}`;
  const queue = `${prefix}:queue`, processing = `${prefix}:processing`;
  // Explicit validated input prevents createRedisClient's production/default fallback.
  const redis = createRedisClient(url.href);
  try {
    await redis.ping();
    await check(redis, () => redis.eval(script, numberOfKeys, queue, processing, id), queue, processing, id);
  } finally {
    try { await redis.del(queue, processing); }
    finally { redis.disconnect(); }
  }
}

describe.skipIf(process.env.XGS_WORKER_TEST_REDIS_URL === undefined)('real Redis pending admission move', () => {
  it('moves the current ID while removing only one processing occurrence', async () => {
    await withRealRedisMove(async (redis, move, queue, processing, id) => {
      await redis.rpush(processing, 'older', id, 'later', id);
      expect(await move()).toBe(1);
      expect(await redis.lrange(queue, 0, -1)).toEqual([id]);
      expect(await redis.lrange(processing, 0, -1)).toEqual(['older', 'later', id]);
    });
  });
  it('preserves processing and the wrong-type target when publication cannot proceed', async () => {
    await withRealRedisMove(async (redis, move, queue, processing, id) => {
      await redis.set(queue, 'not-a-list'); await redis.rpush(processing, id, 'other');
      await expect(move()).rejects.toThrow('WRONGTYPE');
      expect(await redis.get(queue)).toBe('not-a-list');
      expect(await redis.lrange(processing, 0, -1)).toEqual([id, 'other']);
    });
  });
  it('returns numeric zero for a missing processing ID without changing either list', async () => {
    await withRealRedisMove(async (redis, move, queue, processing) => {
      await redis.rpush(queue, 'queued-other'); await redis.rpush(processing, 'processing-other');
      expect(await move()).toBe(0);
      expect(await redis.lrange(queue, 0, -1)).toEqual(['queued-other']);
      expect(await redis.lrange(processing, 0, -1)).toEqual(['processing-other']);
    });
  });
  it('removes processing without duplicating an ID already at queue position zero', async () => {
    await withRealRedisMove(async (redis, move, queue, processing, id) => {
      await redis.rpush(queue, id, 'other'); await redis.rpush(processing, id);
      expect(await move()).toBe(1);
      expect(await redis.lrange(queue, 0, -1)).toEqual([id, 'other']);
      expect(await redis.lrange(processing, 0, -1)).toEqual([]);
    });
  });
});

describe('first Native video plan admission', () => {
  it('keeps video intent and dispatches fresh pending0 through the real claim as attempt1 with Host closed', async () => {
    const f = firstNativePlanFixture();
    expect(f.task.executionAttempt).toBe(0);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1, error: null });
    expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.handler).toHaveBeenCalledWith(f.deps, expect.objectContaining({ executionAttempt: 1, payload: f.task.payload }));
  });

  it.each(['hold', 'retry', 'attempt', 'legacy', 'base', 'run', 'scene-limit', 'extra-result', 'malformed-marker', 'checkpoint'] as const)('does not treat %s as a new first plan while closed', async kind => {
      const f = firstNativePlanFixture();
      const settings = f.task.payload.storyboard as Record<string, unknown>;
      if (kind === 'hold') f.task.error = VIDEO_READINESS_HOLD;
      if (kind === 'retry') f.task.retryCount = 1;
      if (kind === 'attempt') f.task.executionAttempt = 1;
      if (kind === 'legacy') delete settings.narrative;
      if (kind === 'base') settings.baseAssetId = '00000004-0000-4000-8000-000000000001';
      if (kind === 'scene-limit') settings.narrativeSceneLimit = 3;
      if (kind === 'run') f.task.payload.hermesRunAuthority = { runId: 'run', stage: 'storyboard', ordinal: 0, profile: 'visual-narrative-v1' };
      if (kind === 'extra-result') f.task.result!.untrusted = true;
      if (kind === 'malformed-marker') f.task.result!.nativeAgentExecution = null;
      // Deliberately malformed checkpoint: proves it cannot grant initial-task admission, not a paid CP fixture.
      if (kind === 'checkpoint') (f.task.result!.nativeAgentExecution as Record<string, unknown>).checkpoint = null;
      if (kind === 'run') f.deps.prisma.hermesResearchRun.findUnique = vi.fn(async () => ({ actorId: 'actor', researchObjectId: f.task.session.researchObjectId,
        versionId: f.task.payload.versionId, profile: 'visual-narrative-v1', generationSettings: { output: 'video' }, sourceClaimIds: f.task.payload.sourceClaimIds,
        steps: [{ agentTaskId: f.task.id, stage: 'storyboard', ordinal: 0 }] })) as never;
      await f.poll();
      expect(f.task.status).toBe('pending'); expect(f.task.error).toBe(VIDEO_READINESS_HOLD);
      expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    });

  it.each(['hold', 'payload', 'checkpoint', 'retry', 'attempt', 'progress', 'interest', 'dispatch', 'updated'] as const)('does not consume or lose a pending plan changed at claim by %s', async change => {
      const f = firstNativePlanFixture(); f.state.ready = true;
      f.state.beforeUpdate = () => {
        if (change === 'hold') f.task.error = VIDEO_READINESS_HOLD;
        if (change === 'payload') (f.task.payload.storyboard as Record<string, unknown>).instruction = 'Changed after admission';
        if (change === 'checkpoint') (f.task.result!.nativeAgentExecution as Record<string, unknown>).checkpoint = null;
        if (change === 'retry') f.task.retryCount = 1;
        if (change === 'attempt') f.task.executionAttempt = 1;
        if (change === 'progress') f.task.progress = 20;
        if (change === 'interest') f.task.interestContext = { currentGoal: 'Changed after admission' };
        if (change === 'dispatch') f.task.dispatchedAt = null;
        if (change === 'updated') f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
      };
      await f.poll();
      expect(f.task.status).toBe('pending');
      expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
      expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
      if (change === 'hold') expect(f.task.error).toBe(VIDEO_READINESS_HOLD);
    });

  it.each(['running', 'succeeded', 'failed', 'deleted', 'session-deleted', 'ro-deleted'] as const)('does not requeue a plan that becomes %s before claim', async change => {
      const f = firstNativePlanFixture(); f.state.ready = true;
      f.state.beforeUpdate = () => {
        if (['running', 'succeeded', 'failed'].includes(change)) f.task.status = change;
        if (change === 'deleted') f.task.deletedAt = new Date();
        if (change === 'session-deleted') f.task.session.deletedAt = new Date();
        if (change === 'ro-deleted') f.task.session.researchObject.deletedAt = new Date();
      };
      await f.poll();
      expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
      expect(f.lists.get(queueKey)).toEqual([]); expect(f.lists.get(processingKey)).toEqual([]);
    });

  it('keeps the pending snapshot fenced when intent lookup sees a later non-video payload', async () => {
    const f = firstNativePlanFixture();
    const read = f.agentTask.findUnique.getMockImplementation()!;
    let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      const snapshot = await read(args);
      if (++reads === 2) (f.task.payload.storyboard as Record<string, unknown>).output = 'image';
      return snapshot;
    });
    await f.poll();
    expect(f.task.status).toBe('pending'); expect(f.task.executionAttempt).toBe(0);
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
    expect(f.lists.get(queueKey)).toEqual([f.task.id]); expect(f.lists.get(processingKey)).toEqual([]);
  });

  it.each(['updatedAt', 'payload'] as const)('recovers a live pending %s change between poller and admission without restart', async change => {
    const f = firstNativePlanFixture();
    const read = f.agentTask.findUnique.getMockImplementation()!;
    let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      const snapshot = await read(args);
      if (++reads === 1) {
        if (change === 'updatedAt') f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
        if (change === 'payload') (f.task.payload.storyboard as Record<string, unknown>).instruction = 'Current instruction';
      }
      return snapshot;
    });
    await f.poll();
    expect(f.task).toMatchObject({ status: 'pending', error: null, executionAttempt: 0 });
    expect(f.task.dispatchedAt).not.toBeNull(); expect(f.handler).not.toHaveBeenCalled();
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1 });
    expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.handler).toHaveBeenCalledWith(f.deps, expect.objectContaining({ payload: f.task.payload }));
  });

  it.each(['result', 'error'] as const)('reclassifies a changed %s on the next poll without clearing it or executing the old plan', async change => {
    const f = firstNativePlanFixture();
    const read = f.agentTask.findUnique.getMockImplementation()!; let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      const snapshot = await read(args);
      if (++reads === 1) {
        if (change === 'result') f.task.result!.untrusted = true;
        else f.task.error = VIDEO_READINESS_HOLD;
      }
      return snapshot;
    });
    await f.poll();
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled();
    expect(f.task.executionAttempt).toBe(0); const result = structuredClone(f.task.result);
    await f.poll();
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.task.result).toEqual(result); expect(f.handler).not.toHaveBeenCalled();
    expect(f.lists.get(queueKey)).toEqual([]); expect(f.lists.get(processingKey)).toEqual([]);
  });

  it.each(['missing', 'running', 'succeeded', 'failed', 'deleted', 'session-deleted', 'ro-deleted'] as const)('clears only the stale processing entry when admission reread finds %s', async change => {
    const f = firstNativePlanFixture();
    const read = f.agentTask.findUnique.getMockImplementation()!; let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      const snapshot = await read(args);
      if (++reads === 1) {
        if (change === 'missing') f.tasks.delete(f.task.id);
        if (['running', 'succeeded', 'failed'].includes(change)) f.task.status = change;
        if (change === 'deleted') f.task.deletedAt = new Date();
        if (change === 'session-deleted') f.task.session.deletedAt = new Date();
        if (change === 'ro-deleted') f.task.session.researchObject.deletedAt = new Date();
        f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
      }
      return snapshot;
    });
    await f.poll();
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([]);
    expect(execution.claim).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
    expect(f.handler).not.toHaveBeenCalled(); expect(await f.poll()).toBe(false);
  });

  it.each(['stopping', 'read-failure'] as const)('preserves processing on %s while resolving admission reread mismatch', async failure => {
    const f = firstNativePlanFixture(); let stopping = false;
    const read = f.agentTask.findUnique.getMockImplementation()!; let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      if (++reads === 3 && failure === 'read-failure') throw new Error('database unavailable');
      const snapshot = await read(args);
      if (reads === 1) f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
      if (reads === 2 && failure === 'stopping') stopping = true;
      return snapshot;
    });
    const poll = await createPollOnce({ 'presentation.generate': f.handler }, { runMaintenance: false, stopping: () => stopping });
    if (failure === 'read-failure') await expect(poll(f.deps)).rejects.toThrow('database unavailable');
    else expect(await poll(f.deps)).toBe(false);
    expect(f.lists.get(processingKey)).toEqual([f.task.id]); expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
  it('retains processing when publishing the pending ID fails with OOM', async () => {
    const f = firstNativePlanFixture();
    f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
    f.redis.lpush.mockRejectedValueOnce(new Error('OOM command not allowed when used memory > maxmemory'));
    await expect(f.poll()).rejects.toThrow('OOM');
    expect(f.lists.get(processingKey)).toEqual([f.task.id]); expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.task).toMatchObject({ status: 'pending', error: null, executionAttempt: 0 });
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
  it('does not publish a duplicate when the pending ID is already queued', async () => {
    const f = firstNativePlanFixture(); f.lists.set(queueKey, [f.task.id, f.task.id]);
    f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
    expect(await f.poll()).toBe(true);
    expect(f.lists.get(queueKey)).toEqual([f.task.id]); expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    expect(f.task).toMatchObject({ status: 'pending', error: null, executionAttempt: 0 });
  });
  it('does not enqueue a missing processing ID or consume an attempt', async () => {
    const f = firstNativePlanFixture();
    f.state.beforeUpdate = () => {
      f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
      f.lists.set(processingKey, []);
    };
    expect(await f.poll()).toBe(true);
    expect(f.lists.get(queueKey)).toEqual([]); expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    expect(f.task).toMatchObject({ status: 'pending', error: null, executionAttempt: 0 });
  });
  it('leaves the ID queued when Redis response becomes unknown after the move', async () => {
    const f = firstNativePlanFixture();
    f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
    const move = f.redis.eval.getMockImplementation()!;
    f.redis.eval.mockImplementationOnce(async (...args) => { await move(...args); throw new Error('connection lost after EVAL'); });
    await expect(f.poll()).rejects.toThrow('connection lost after EVAL');
    expect(f.lists.get(queueKey)).toEqual([f.task.id]); expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
  it.each(['reread', 'claim'] as const)('preserves the pending ID on Redis failure after %s mismatch', async phase => {
    const f = firstNativePlanFixture(); f.state.queueWrongType = true;
    if (phase === 'claim') f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
    else {
      const read = f.agentTask.findUnique.getMockImplementation()!; let reads = 0;
      f.agentTask.findUnique.mockImplementation(async args => {
        const snapshot = await read(args);
        if (++reads === 1) f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
        return snapshot;
      });
    }
    await expect(f.poll()).rejects.toThrow('WRONGTYPE queue');
    expect(f.lists.get(processingKey)).toEqual([f.task.id]); expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.task).toMatchObject({ status: 'pending', error: null, executionAttempt: 0 });
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
});

function ordinaryIngestionFixture(role = 'author') {
  const f = queueFixture(); f.task.kind = 'sdf.extract';
  f.task.payload = { researchObjectId: 'ro', artifactId: 'artifact', requestedOutput: 'video' };
  const source = async () => ({ id: 'ingestion', artifactId: 'artifact',
    artifact: { workspaceId: 'workspace' },
    batch: { userId: 'actor', researchObjectId: 'ro',
      researchObject: { workspaceId: 'workspace', workspace: { status: 'active' } } },
    agentTask: { ...f.task, session: { ...f.task.session, status: 'active' } } });
  const journalArticle = { findUnique: vi.fn(async () => null) };
  Object.assign(f.deps.prisma, {
    ingestionTask: { findFirst: vi.fn(source), findUnique: vi.fn(source) },
    agentSession: { findUnique: vi.fn(async () => ({ ...f.task.session, status: 'active' })) },
    membership: { findUnique: vi.fn(async () => ({ workspaceId: 'workspace', userId: 'actor', role })) },
    journalArticle,
  });
  return { ...f, journalArticle };
}

describe('audio-only pending and held admission', () => {
  const policy = { audio: { provider: 'synclip' as const, voice: 'selected-voice', speed: 1 }, maxEstimatedCoins: 200 };
  function audition() {
    const f = queueFixture();
    f.task.payload.video = { purpose: 'audio-audition', sceneIndex: 1 };
    f.deps.readAudioAuditionReadiness = vi.fn(async () => policy);
    return f;
  }
  it('claims an explicit audition through speech readiness while full-video readiness is false', async () => {
    const f = audition();
    expect(await f.poll()).toBe(true);
    expect(f.handler).toHaveBeenCalledTimes(1); expect(f.task.status).toBe('succeeded');
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('releases only the held speech task through the same speech readiness', async () => {
    const f = audition(); f.task.error = VIDEO_READINESS_HOLD;
    expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
    expect(f.task.error).toBeNull(); expect(f.task.dispatchedAt).toBeNull();
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('lets a re-claimed original grant reach its read-only recovery handler when admission has closed', async () => {
    const f = audition(); f.deps.readAudioAuditionReadiness = vi.fn(async () => null);
    f.task.executionAttempt = 1;
    f.task.result = { audioAuditionGrant: { schemaVersion: 1, purpose: 'audio-audition', taskId: f.task.id,
      executionAttempt: 1, inputHash: 'a'.repeat(64) } };
    expect(await f.poll()).toBe(true); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.task.executionAttempt).toBe(2);
  });
});

function barrier() {
  let resolve!: () => void; const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}
async function pauseDispatchAfterPush(f: ReturnType<typeof queueFixture>) {
  f.task.dispatchedAt = null; f.lists.set(queueKey, []);
  const pushed = barrier(); const acknowledge = barrier();
  f.state.afterPush = async () => { pushed.resolve(); await acknowledge.promise; };
  const dispatch = f.dispatch(); await pushed.promise; f.state.afterPush = undefined;
  return { finish: async () => { acknowledge.resolve(); await dispatch; } };
}

describe('real dispatcher acknowledgement interleavings', () => {
  it('LPUSH not yet acknowledged: park prevents outbox redispatch while readiness is closed', async () => {
    const f = queueFixture(); const paused = await pauseDispatchAfterPush(f);
    try {
      await f.poll();
      expect(f.task.dispatchedAt).not.toBeNull(); expect(f.task.status).toBe('pending');
      expect(f.task.error).toBe('Video generation is temporarily unavailable.');
      expect(await f.outbox()).toBe(0); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
      expect(f.lists.get(queueKey)).toEqual([]); expect(f.lists.get(processingKey)).toEqual([]);
      expect(execution.claim).not.toHaveBeenCalled(); expect(f.task.executionAttempt).toBe(0);
    } finally { await paused.finish(); }
  });
  it('park then release: original late dispatch acknowledgement cannot overwrite the outbox null', async () => {
    const f = queueFixture(); const before = f.task.updatedAt.getTime(); const paused = await pauseDispatchAfterPush(f);
    try {
      expect(await admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).toBe(true);
      expect(f.task.dispatchedAt).not.toBeNull(); expect(f.task.updatedAt.getTime()).toBe(before + 1);
      f.state.ready = true; expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
      expect(f.task.error).toBeNull(); expect(f.task.dispatchedAt).toBeNull(); expect(f.task.updatedAt.getTime()).toBe(before + 2);
    } finally { await paused.finish(); }
    expect(f.task.dispatchedAt).toBeNull();
    // A crash at the release boundary needs no special Redis recovery path.
    f.lists.set(queueKey, []); expect(await f.outbox()).toBe(1); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
  });
});

describe('dispatcher wins the first pending park CAS', () => {
  it('ACK advances the pending snapshot before park: same ID resumes without restarting the worker', async () => {
    const f = queueFixture(); const readAt = f.task.updatedAt.getTime(); const paused = await pauseDispatchAfterPush(f);
    // The real dispatcher is suspended after LPUSH. The poller reads its old
    // pending snapshot, then the real ACK commits before the park CAS executes.
    f.state.beforeUpdate = async () => { await paused.finish(); };
    try {
      expect(await f.poll()).toBe(true);
      expect(f.agentTask.updateMany.mock.calls[0]![0].where.updatedAt).toEqual(new Date(readAt));
      expect(await f.agentTask.updateMany.mock.results[0]!.value).toEqual({ count: 0 });
      expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
      expect(f.task.dispatchedAt).not.toBeNull(); expect(f.task.updatedAt.getTime()).toBe(readAt + 2);
      expect(f.lists.get(processingKey)).toEqual([]); expect(execution.claim).not.toHaveBeenCalled();
      expect(execution.progress).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
      f.state.ready = true; expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
      expect(await f.outbox()).toBe(1); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
      await f.poll(); expect(f.task.status).toBe('succeeded'); expect(f.task.executionAttempt).toBe(1);
      expect(f.handler).toHaveBeenCalledTimes(1); expect(f.redis.lrange).not.toHaveBeenCalled();
    } finally { await paused.finish(); }
  });
  it.each(['payload', 'receipt', 'attempt', 'running', 'unknown'] as const)(
    'does not repark a changed %s after losing the original CAS', async changed => {
      const f = queueFixture(); let afterChange: QueueTask | undefined;
      f.state.beforeUpdate = () => {
        if (changed === 'payload') f.task.payload = { ...f.task.payload, sourceClaimIds: ['changed-claim'] };
        if (changed === 'receipt') f.task.result = { nativeAgentExecution: { state: 'started' } };
        if (changed === 'attempt') f.task.executionAttempt++;
        if (changed === 'running') { f.task.status = 'running'; f.task.executionAttempt++; }
        if (changed === 'unknown') f.task.error = 'UNCERTAIN';
        f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); afterChange = structuredClone(f.task);
      };
      await f.poll(); expect(f.task).toEqual(afterChange); expect(f.lists.get(processingKey)).toEqual([]);
      expect(f.lists.get(queueKey)).toEqual(changed === 'running' ? [] : [f.task.id]);
      expect(f.agentTask.updateMany).toHaveBeenCalledTimes(1); expect(execution.claim).not.toHaveBeenCalled();
      expect(execution.progress).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    });
});

describe('Worker native video pending admission', () => {
  it('parks closed preclaim pending work with a nonnull dispatch acknowledgement and a monotonic timestamp', async () => {
    const f = queueFixture(); f.task.dispatchedAt = null; const before = f.task.updatedAt.getTime();
    expect(await f.poll()).toBe(true);
    expect(f.task.status).toBe('pending'); expect(f.task.executionAttempt).toBe(0);
    expect(f.task.error).toBe('Video generation is temporarily unavailable.');
    expect(f.task.dispatchedAt).toBeInstanceOf(Date); expect(f.task.updatedAt.getTime()).toBe(before + 1);
    expect(f.lists.get(processingKey)).toEqual([]); expect(execution.claim).not.toHaveBeenCalled();
    expect(execution.progress).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
  it('requeues the same pending ID when the park CAS loses without claiming or marking failure', async () => {
    const f = queueFixture(); f.state.rejectUpdate = true;
    expect(await f.poll()).toBe(true); expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    expect(f.task).toMatchObject({ status: 'pending', executionAttempt: 0, error: null });
    expect(f.agentTask.updateMany).toHaveBeenCalledTimes(2);
    expect(execution.claim).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
  it('preserves the processing entry and propagates an unexpected database failure before claim', async () => {
    const f = queueFixture(); f.agentTask.updateMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.poll()).rejects.toThrow('database unavailable');
    expect(f.lists.get(processingKey)).toEqual([f.task.id]); expect(f.task.executionAttempt).toBe(0);
    expect(execution.claim).not.toHaveBeenCalled(); expect(execution.progress).not.toHaveBeenCalled();
  });
  it('leaves a ready pending entry unclaimed when shutdown arrives during its readiness read', async () => {
    const f = queueFixture(); let stopping = false;
    vi.mocked(f.deps.readVideoReadiness!).mockImplementation(async () => { stopping = true; return true; });
    const poll = await createPollOnce({ 'presentation.generate': f.handler }, { runMaintenance: false, stopping: () => stopping });
    expect(await poll(f.deps)).toBe(false); expect(f.lists.get(processingKey)).toEqual([f.task.id]);
    expect(f.task).toMatchObject({ status: 'pending', executionAttempt: 0 }); expect(execution.claim).not.toHaveBeenCalled();
  });
  it('removes only its own processing occurrence after parking a duplicate queue ID', async () => {
    const f = queueFixture(); f.lists.set(processingKey, [f.task.id]);
    await f.poll(); expect(f.lists.get(processingKey)).toEqual([f.task.id]);
    expect(f.task.error).toBe(VIDEO_READINESS_HOLD); expect(f.redis.lrem).toHaveBeenCalledTimes(1);
    expect(f.redis.lrem).toHaveBeenCalledWith(processingKey, 1, f.task.id);
  });
  it('requires the trusted video classifier instead of a client requestedOutput hint', async () => {
    const f = queueFixture(); f.task.kind = 'sdf.extract';
    f.task.payload = { researchObjectId: 'ro', artifactId: 'artifact', requestedOutput: 'video' };
    await f.poll();
    expect(execution.progress).toHaveBeenCalledWith(f.deps, expect.objectContaining({ status: 'succeeded' }));
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.task.error).toBeNull(); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('keeps sdf.extract with storyboard hints and a Native marker on its existing authorized-video hold path', async () => {
    const f = ordinaryIngestionFixture();
    Object.assign(f.task.payload, { kind: 'interactive_html', storyboard: { output: 'video', narrative: true } });
    f.task.result = initialNativeAgentExecution({ runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' }, 'paper-illustration')!;
    f.deps.prisma.hermesResearchRun.findMany = vi.fn(async () => [{ actorId: 'actor', researchObjectId: 'ro',
      profile: 'visual-narrative-v1', generationSettings: { output: 'video' }, steps: [
        { agentTaskId: f.task.id, stage: 'source_composition', ingestionTaskId: 'ingestion', artifactId: 'artifact' },
        { stage: 'source_ingestion', ingestionTaskId: 'ingestion', artifactId: 'artifact' },
      ] }]) as never;
    await f.poll();
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.deps.readVideoReadiness).toHaveBeenCalledTimes(1);
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
  it('executes an authorized ordinary ingestion while video readiness is closed', async () => {
    const f = ordinaryIngestionFixture();
    await f.poll();
    expect(f.task.status).toBe('succeeded'); expect(f.task.executionAttempt).toBe(1);
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(execution.progress).toHaveBeenCalledWith(f.deps, expect.objectContaining({ status: 'succeeded' }));
    expect(f.journalArticle.findUnique).toHaveBeenCalledWith({ where: { workingResearchObjectId: 'ro' }, include: { journal: true } });
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('still rejects unauthorized ordinary ingestion while video readiness is closed', async () => {
    const f = ordinaryIngestionFixture('viewer');
    await f.poll();
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).not.toHaveBeenCalled();
    expect(execution.progress).toHaveBeenCalledWith(f.deps, expect.objectContaining({ status: 'failed',
      error: '[blocked] Source processing authorization changed before claim execution' }));
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('preserves the old image path while video readiness is closed', async () => {
    const f = queueFixture(); f.task.payload = { ...f.task.payload, kind: 'interactive_html', storyboard: { output: 'image' } };
    await f.poll(); expect(f.task.status).toBe('succeeded'); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it.each(['running', 'failed', 'succeeded', 'unknown'])('never changes a nonpending %s task into a readiness hold', async status => {
    const f = queueFixture(); f.task.status = status; f.task.error = 'UNCERTAIN'; const before = structuredClone(f.task);
    await f.poll(); expect(f.task).toEqual(before); expect(f.agentTask.updateMany).not.toHaveBeenCalled();
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
});

describe('existing outbox release of native video holds', () => {
  it('releases once by pending/error/attempt/time CAS without touching Redis or the attempt', async () => {
    const f = queueFixture(); await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    const heldAt = f.task.updatedAt.getTime(); f.state.ready = true;
    const counts = await Promise.all([recoverHeldVideoTasks(f.deps), recoverHeldVideoTasks(f.deps)]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0 });
    expect(f.task.updatedAt.getTime()).toBe(heldAt + 1);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.redis.lrem).not.toHaveBeenCalled(); expect(f.redis.multi).not.toHaveBeenCalled();
  });
  it('does not release a stale snapshot after claim and never removes its new processing entry', async () => {
    const f = queueFixture(); await admitPendingVideoTask(f.deps, structuredClone(f.task) as never); f.state.ready = true;
    f.lists.set(processingKey, [f.task.id]);
    f.state.beforeUpdate = () => {
      f.task.status = 'running'; f.task.executionAttempt++; f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
    };
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toMatchObject({ status: 'running', executionAttempt: 1 }); expect(f.lists.get(processingKey)).toEqual([f.task.id]);
    expect(f.redis.lrem).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
  it('rejects old park and release snapshots even after pending/error/attempt return to the same values', async () => {
    const f = queueFixture(); const initial = structuredClone(f.task); const originalDispatch = f.task.dispatchedAt;
    await admitPendingVideoTask(f.deps, initial as never); expect(f.task.dispatchedAt).toEqual(originalDispatch);
    const held = structuredClone(f.task); f.state.ready = true; expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
    expect(await parkPendingVideoTask(f.deps, initial as never)).toBe(false);
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0 });
    f.state.ready = false; await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    expect(await releasePendingVideoTask(f.deps, held as never)).toBe(false);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.task.dispatchedAt).not.toBeNull(); expect(f.task.updatedAt.getTime()).toBe(initial.updatedAt.getTime() + 3);
  });
  it('leaves closed or untrusted holds parked and bounds queries to pending held rows', async () => {
    const f = queueFixture(); await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0); const before = structuredClone(f.task);
    f.state.ready = true; f.task.payload = { ...f.task.payload, kind: 'interactive_html', storyboard: { output: 'image' } };
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toEqual({ ...before, payload: f.task.payload }); expect(f.redis.lpush).not.toHaveBeenCalled();
    expect(f.agentTask.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { status: 'pending', error: VIDEO_READINESS_HOLD, deletedAt: null }, take: 50,
    }));
  });
  it('allows existing outbox recovery after a release crash and rechecks freshness before claim', async () => {
    const f = queueFixture(); f.lists.set(queueKey, []); await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    f.state.ready = true; expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
    expect(f.lists.get(queueKey)).toEqual([]); expect(await f.outbox()).toBe(1); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    f.state.ready = false; await f.poll();
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.lists.get(processingKey)).toEqual([]); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    f.state.ready = true; expect(await recoverHeldVideoTasks(f.deps)).toBe(1); expect(await f.outbox()).toBe(1);
    await f.poll(); expect(f.task.status).toBe('succeeded'); expect(f.task.executionAttempt).toBe(1); expect(f.handler).toHaveBeenCalledTimes(1);
  });
  it('uses the existing maintenance cadence without scanning pending holds on every poll', async () => {
    const f = queueFixture(); await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    let current = 0; const tick = createVideoReadinessResumeScheduler({ now: () => current });
    expect(await tick(f.deps)).toBe(0); current = 59_999; f.state.ready = true;
    expect(await tick(f.deps)).toBe(0); expect(f.agentTask.findMany).toHaveBeenCalledTimes(1);
    current = 60_000; expect(await tick(f.deps)).toBe(1); expect(f.agentTask.findMany).toHaveBeenCalledTimes(2);
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });
});

describe('single snapshot startup recovery with pending video holds', () => {
  it('parks a closed held entry and continues the original running/terminal recovery semantics', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.task.dispatchedAt = null;
    const running = { ...structuredClone(f.task), id: 'running', kind: 'demo.echo', status: 'running', error: null };
    const unknown = { ...structuredClone(f.task), id: 'unknown', kind: 'demo.echo', status: 'failed', error: 'UNCERTAIN' };
    f.tasks.set(running.id, running); f.tasks.set(unknown.id, unknown);
    f.lists.set(queueKey, []); f.lists.set(processingKey, [running.id, unknown.id, f.task.id]);
    expect(await recoverProcessingQueue(f.deps)).toBe(1);
    expect(f.redis.lrange).toHaveBeenCalledTimes(1); expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.lists.get(queueKey)).toEqual([running.id]); expect(running.status).toBe('pending');
    expect(unknown).toMatchObject({ status: 'failed', error: 'UNCERTAIN' });
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.task.dispatchedAt).not.toBeNull(); expect(execution.claim).not.toHaveBeenCalled();
  });
  it('requeues a losing held CAS and the next task from the same startup snapshot', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.state.rejectUpdate = true;
    const ordinary = { ...structuredClone(f.task), id: 'ordinary', kind: 'demo.echo', error: null };
    f.tasks.set(ordinary.id, ordinary); f.lists.set(queueKey, []); f.lists.set(processingKey, [ordinary.id, f.task.id]);
    expect(await recoverProcessingQueue(f.deps)).toBe(2);
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([ordinary.id, f.task.id]);
    expect(f.redis.lrange).toHaveBeenCalledTimes(1);
  });
  it('preserves both processing IDs if requeue fails at the losing held tail', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.state.rejectUpdate = true;
    const ordinary = { ...structuredClone(f.task), id: 'ordinary', kind: 'demo.echo', error: null };
    f.tasks.set(ordinary.id, ordinary); f.lists.set(queueKey, []); f.lists.set(processingKey, [ordinary.id, f.task.id]);
    f.state.queueWrongType = true;
    await expect(recoverProcessingQueue(f.deps)).rejects.toThrow('WRONGTYPE queue');
    expect(f.lists.get(processingKey)).toEqual([ordinary.id, f.task.id]); expect(f.redis.lrem).not.toHaveBeenCalled();
  });
  it('requeues a held startup snapshot changed before admission and lets the next poll classify the current row', async () => {
    const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD;
    f.lists.set(queueKey, []); f.lists.set(processingKey, [f.task.id]);
    const read = f.agentTask.findUnique.getMockImplementation()!; let reads = 0;
    f.agentTask.findUnique.mockImplementation(async args => {
      const snapshot = await read(args);
      if (++reads === 1) f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
      return snapshot;
    });
    expect(await recoverProcessingQueue(f.deps)).toBe(1);
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled();
    await f.poll();
    expect(f.task.error).toBe(VIDEO_READINESS_HOLD); expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.handler).not.toHaveBeenCalled();
  });
  it('requeues a held startup row whose current non-video intent returns an allowed snapshot', async () => {
    const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD;
    (f.task.payload.storyboard as Record<string, unknown>).output = 'image';
    f.lists.set(queueKey, []); f.lists.set(processingKey, [f.task.id]);
    expect(await recoverProcessingQueue(f.deps)).toBe(1);
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(f.handler).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled();
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1 });
    expect(f.handler).toHaveBeenCalledWith(f.deps, expect.objectContaining({ payload: f.task.payload }));
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('releases a ready held entry into the outbox and only clears its old processing occurrence', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.state.ready = true;
    f.lists.set(queueKey, []); f.lists.set(processingKey, [f.task.id]);
    await recoverProcessingQueue(f.deps);
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0 });
    expect(f.lists.get(processingKey)).toEqual([]); expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.redis.rpoplpush).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
    expect(await f.outbox()).toBe(1); expect(f.lists.get(queueKey)).toEqual([f.task.id]);
  });
});
