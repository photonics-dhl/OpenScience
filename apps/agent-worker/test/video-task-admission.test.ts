import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { createRedisClient, type Redis } from '@openscience/database';
import { createPollOnce, recoverProcessingQueue, type WorkerDeps } from '../src/index';
import { admitPendingVideoTask, createVideoReadinessResumeScheduler, parkPendingVideoTask, releasePendingVideoTask,
  recoverHeldVideoTasks, VIDEO_READINESS_HOLD, NATIVE_IMAGE_CONTRACT_HOLD } from '../src/video-task-admission';
import { claimAgentTask as realClaimAgentTask, dispatchAgentTask, recoverUndispatchedAgentTasks, prepareAgentTaskForCrashRecovery } from '../../../packages/domain/src/agent/agent';
import { initialNativeAgentExecution, readNativeAgentExecution, type NativeAgentCheckpointReference } from '../../../packages/domain/src/agent/native-agent-execution';
import { describeIllustrationBrief, type IllustrationBrief } from '../../../packages/domain/src/assets/illustration-brief';
import { presentationClaimContent, presentationEvidenceIdentity, readVisualNarrativeSource } from '../../../packages/domain/src/assets/illustration-source';
import { parseStoryboardDocument } from '../../../packages/domain/src/assets/storyboard';
import { parsePresentationGenerationPayload } from '../../../packages/domain/src/assets/presentation-asset';
import { requireSceneImageParent } from '../../../packages/domain/src/assets/scene-image';
import { CONTENT_DRIVEN_PROFILE } from '../../../packages/domain/src/assets/video';

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

function imageContractFixture() {
  const f = queueFixture();
  f.task.payload = { schemaVersion: 1, researchObjectId: 'ro', versionId: 'version', kind: 'interactive_html', sourceClaimIds: ['claim'],
    storyboard: { output: 'image', narrative: true, locale: 'en', style: 'technical', instruction: 'Explain this finding' } };
  f.task.result = { nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-illustration',
    runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3',
    planningContract: 'image-source-explicit-trig-v1' } };
  return f;
}

function completedPaperCheckpoint(taskId = 'video-task') {
  const serializedSha256 = 'a'.repeat(64);
  return { taskId, objectKey: `derived/native-agent/${serializedSha256}.json`, serializedSha256, size: 1,
    artifactId: 'artifact', documentSha256: 'b'.repeat(64), sourceMapHash: 'c'.repeat(64), executionAttempt: 1,
    turnCount: 1, state: 'completed' as const, target: { provider: 'synclip', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) },
    responseHash: 'e'.repeat(64), finishReason: 'stop' as const, hasToolCalls: false };
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

describe('image planning-contract admission hold', () => {
  it('parks a marked image before claim without changing its attempt or receipt', async () => {
    const f = imageContractFixture();
    const before = structuredClone(f.task);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'pending', error: NATIVE_IMAGE_CONTRACT_HOLD, executionAttempt: 0,
      retryCount: 0, result: before.result, payload: before.payload });
    expect(f.task.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });

  it('admits a valid marked image to the Native reader when Hermes runtime is configured', async () => {
    const f = imageContractFixture();
    (f.deps as WorkerDeps).nativeAgentRuntime = { runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' };
    (f.deps as WorkerDeps).nativeImageReaderReady = true;
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1, error: null });
    expect(f.handler).toHaveBeenCalledTimes(1);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });

  it('holds a valid marked image when the Native reader is not fully assembled', async () => {
    const f = imageContractFixture();
    (f.deps as WorkerDeps).nativeAgentRuntime = { runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' };
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'pending', error: NATIVE_IMAGE_CONTRACT_HOLD, executionAttempt: 0 });
    expect(f.handler).not.toHaveBeenCalled();
  });

  it('keeps an already held image out of video readiness and removes only its processing entry at startup', async () => {
    const f = imageContractFixture(); f.task.error = NATIVE_IMAGE_CONTRACT_HOLD; f.lists.set(processingKey, [f.task.id]);
    const before = structuredClone(f.task);
    expect(await recoverProcessingQueue(f.deps)).toBe(0);
    expect(f.task).toEqual(before);
    expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });

  it('parks a pristine pending image before generic startup recovery can claim it', async () => {
    const f = imageContractFixture(); f.lists.set(processingKey, [f.task.id]);
    expect(await recoverProcessingQueue(f.deps)).toBe(0);
    expect(f.task.error).toBe(NATIVE_IMAGE_CONTRACT_HOLD);
    expect(f.task.executionAttempt).toBe(0);
    expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });

  it('retries image parking after only an outbox timestamp race', async () => {
    const f = imageContractFixture();
    f.state.beforeUpdate = () => { f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1); };
    expect(await admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).toBe(true);
    expect(f.task.error).toBe(NATIVE_IMAGE_CONTRACT_HOLD);
    expect(f.task.executionAttempt).toBe(0);
  });

  it('refuses image parking after the payload changes during the first CAS', async () => {
    const f = imageContractFixture();
    f.state.beforeUpdate = () => { f.task.payload = { ...f.task.payload, versionId: 'changed-version' }; };
    expect(await admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).toBe(false);
    expect(f.task.error).toBeNull();
    expect(f.task.executionAttempt).toBe(0);
  });

  it('refuses image parking after a concurrent error mutation', async () => {
    const f = imageContractFixture();
    f.state.beforeUpdate = () => { f.task.error = 'concurrent-error'; };
    expect(await admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).toBe(false);
    expect(f.task.error).toBe('concurrent-error');
    expect(f.task.executionAttempt).toBe(0);
  });

  it.each(['missing-marker', 'corrupt-marker'] as const)('fails closed for an already held image with %s marker', failure => {
    const f = imageContractFixture(); f.task.error = NATIVE_IMAGE_CONTRACT_HOLD;
    if (failure === 'missing-marker') delete f.task.result!.nativeAgentExecution;
    else f.task.result!.nativeAgentExecution = { planningContract: 'video-optional-audio-v1' };
    const before = structuredClone(f.task);
    return expect(admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).resolves.toBe(true)
      .then(() => expect(f.task).toEqual(before));
  });

  it('preserves a marked image row through the P2034 recovery decision', async () => {
    const f = imageContractFixture();
    Object.assign(f.task, { status: 'running', executionAttempt: 1, result: {
      ...f.task.result, nativeAgentExecution: { ...(f.task.result!.nativeAgentExecution as Record<string, unknown>),
        checkpoint: completedPaperCheckpoint() }, providerReceipt: 'paid',
    } });
    const before = structuredClone(f.task);
    expect(await prepareAgentTaskForCrashRecovery(f.deps, f.task.id)).toBe(false);
    expect(f.task).toEqual(before);
  });

  it('does not reset a started marked image task during generic startup recovery', async () => {
    const f = imageContractFixture();
    Object.assign(f.task, { status: 'running', executionAttempt: 1, result: {
      ...f.task.result, nativeAgentExecution: { ...(f.task.result!.nativeAgentExecution as Record<string, unknown>),
        checkpoint: completedPaperCheckpoint() }, providerReceipt: 'paid',
    } });
    f.lists.set(queueKey, []);
    f.lists.set(processingKey, [f.task.id]);
    const before = structuredClone(f.task);
    expect(await recoverProcessingQueue(f.deps)).toBe(0);
    expect(f.task).toEqual(before);
    expect(f.lists.get(processingKey)).toEqual([f.task.id]);
    expect(f.lists.get(queueKey)).toEqual([]);
  });

  it('keeps a paid image checkpoint in processing when the final task write hits P2034', async () => {
    const f = imageContractFixture();
    f.task.result = null;
    execution.progress.mockImplementationOnce(async () => {
      f.task.result = { nativeAgentExecution: {
        kind: 'hermes-agent', profile: 'paper-illustration', runtimeId: 'native-installed',
        skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3', planningContract: 'image-source-explicit-trig-v1',
        checkpoint: completedPaperCheckpoint(),
      }, providerReceipt: 'paid' };
      throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    });
    expect(await f.poll()).toBe(true);
    expect(f.task.status).toBe('running');
    expect(f.task.result).toMatchObject({ nativeAgentExecution: { checkpoint: { state: 'completed' } }, providerReceipt: 'paid' });
    expect(f.lists.get(processingKey)).toEqual([f.task.id]);
    expect(f.lists.get(queueKey)).toEqual([]);
    expect(f.redis.lrem).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'failed'] as const)('cleans a terminal marked image processing residue for %s', async status => {
    const f = imageContractFixture();
    f.task.status = status;
    f.lists.set(queueKey, []); f.lists.set(processingKey, [f.task.id]);
    const before = structuredClone(f.task);
    expect(await recoverProcessingQueue(f.deps)).toBe(0);
    expect(f.task).toEqual(before);
    expect(f.lists.get(processingKey)).toEqual([]);
    expect(f.lists.get(queueKey)).toEqual([]);
  });
});

describe('ordinary local Native video planning compatibility floor', () => {
  function localRevision() {
    const f = firstNativePlanFixture(); f.state.ready = true;
    Object.assign(f.deps.prisma, { presentationAsset: { findUnique: vi.fn(async () => null) } });
    Object.assign(f.task.payload.storyboard!, { baseAssetId: '10000000-0000-4000-8000-000000000001', revisionSceneIndex: 0 });
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    Object.assign(f.task, { idempotencyKey: 'original-local-video-once' });
    return f;
  }
  it.each(['first-scene', 'later-scene', 'started', 'paid-unknown'] as const)(
    'parks owned marked %s local revision before Host or claim and never releases it', async state => {
      const f = localRevision();
      if (state === 'later-scene') (f.task.payload.storyboard as Record<string, unknown>).revisionSceneIndex = 2;
      if (state === 'started') {
        const checkpoint: NativeAgentCheckpointReference = { taskId: f.task.id, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`,
          serializedSha256: 'd'.repeat(64), size: 100, artifactId: 'paper-artifact', documentSha256: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64),
          executionAttempt: 1, turnCount: 1, state: 'started', target: { provider: 'provider-v1', model: 'MiniMax-M3', promptHash: 'c'.repeat(64) } };
        Object.assign(f.task.result!.nativeAgentExecution!, { checkpoint }); f.task.executionAttempt = 1;
        expect(readNativeAgentExecution(f.task.result)?.checkpoint?.state).toBe('started');
      }
      if (state === 'paid-unknown') f.task.result!.providerOutcome = 'unknown';
      const ledger = [{ id: 'existing-local-debit', taskId: f.task.id, delta: -1 }];
      Object.assign(f.deps.prisma, { usageLedger: { findMany: vi.fn(async () => ledger), create: vi.fn() } });
      const before = structuredClone(f.task), paid = structuredClone(ledger);
      expect(await f.poll()).toBe(true);
      expect(f.task).toEqual({ ...before, error: VIDEO_READINESS_HOLD, updatedAt: new Date(before.updatedAt.getTime() + 1) });
      expect(f.task.executionAttempt).toBe(before.executionAttempt); expect(ledger).toEqual(paid);
      expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
      expect(f.lists.get(processingKey)).toEqual([]);
      const held = structuredClone(f.task);
      expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
      expect(await releasePendingVideoTask(f.deps, held as never)).toBe(false);
      expect(await releasePendingVideoTask(f.deps, held as never, 'video-optional-audio-v1')).toBe(false);
      expect(await f.outbox()).toBe(0); expect(f.task).toEqual(held); expect(ledger).toEqual(paid);
    });
  it.each([null, undefined, 'unknown-contract', {}])('parks a malformed owned local contract %j without reopening history', async planningContract => {
    const f = localRevision(); Object.assign(f.task.result!.nativeAgentExecution!, { planningContract });
    const before = structuredClone(f.task); await f.poll();
    expect(f.task).toEqual({ ...before, error: VIDEO_READINESS_HOLD, updatedAt: new Date(before.updatedAt.getTime() + 1) });
    const held = structuredClone(f.task);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(await releasePendingVideoTask(f.deps, held as never)).toBe(false);
    expect(f.task).toEqual(held); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled();
  });
  it.each(['unmarked', 'unmarked-malformed', 'base-only', 'run', 'scene-limit', 'revisionMode', 'revisionTaskId', 'revisionImageAssetId', 'artSceneIndex', 'image', 'sdf'] as const)(
    'retains the original %s admission without inventing a local contract hold', async change => {
      const f = localRevision(), storyboard = f.task.payload.storyboard as Record<string, unknown>;
      if (change === 'unmarked' || change === 'unmarked-malformed') delete (f.task.result!.nativeAgentExecution as Record<string, unknown>).planningContract;
      if (change === 'unmarked-malformed') (f.task.result!.nativeAgentExecution as Record<string, unknown>).runtimeId = '';
      if (change === 'base-only') delete storyboard.revisionSceneIndex;
      if (change === 'run') {
        f.task.payload.hermesRunAuthority = { runId: '10000000-0000-4000-8000-000000000003', profile: 'content-driven-v1', stage: 'storyboard', ordinal: 0 };
        f.deps.prisma.hermesResearchRun.findUnique = vi.fn(async () => null) as never;
      }
      if (change === 'scene-limit') storyboard.narrativeSceneLimit = 3;
      if (change === 'revisionMode') storyboard.revisionMode = 'art';
      if (change === 'revisionTaskId' || change === 'revisionImageAssetId') storyboard[change] = '10000000-0000-4000-8000-000000000003';
      if (change === 'artSceneIndex') storyboard.artSceneIndex = 0;
      if (change === 'image') storyboard.output = 'image';
      if (change === 'sdf') f.task.kind = 'sdf.extract';
      const before = structuredClone(f.task);
      expect(await admitPendingVideoTask(f.deps, before as never)).toEqual({ expectedPendingTask: before });
      expect(f.task).toEqual(before); expect(f.task.error).toBeNull(); expect(execution.claim).not.toHaveBeenCalled();
    });
});

describe('first Native video plan admission', () => {
  it.each([['external-narration', false], ['native-first', false], ['external-narration', true], ['native-first', true]] as const)(
    'claims compatible marked R2 NULL-CP %s with Host ready=%s, preserving its credit and once key', async (intent, ready) => {
    const f = firstNativePlanFixture(); f.state.ready = ready;
    (f.task.payload.storyboard as Record<string, unknown>).instruction = `Use ${intent}`;
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    Object.assign(f.task, { idempotencyKey: 'original-video-once-key' });
    const ledger = [{ id: 'reserved-credit', taskId: f.task.id, delta: -1 }];
    Object.assign(f.deps.prisma, { usageLedger: { findMany: vi.fn(async () => ledger), create: vi.fn() } });
    const before = structuredClone(f.task), paid = structuredClone(ledger);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ id: before.id, payload: before.payload, result: before.result,
      idempotencyKey: 'original-video-once-key', status: 'succeeded', error: null, executionAttempt: 1 });
    expect(ledger).toEqual(paid);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).toHaveBeenCalledTimes(1);
    expect(f.handler).toHaveBeenCalledTimes(1); expect(f.lists.get(processingKey)).toEqual([]);
    const completed = structuredClone(f.task);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(await releasePendingVideoTask(f.deps, completed as never)).toBe(false);
    expect(f.task).toEqual(completed); expect(await f.outbox()).toBe(0);
  });
  it.each([null, undefined, 'unknown-contract', 1, {}, ['video-optional-audio-v1']])('never lets Host readiness unlock malformed contract %j', async planningContract => {
    const f = firstNativePlanFixture(); f.state.ready = true;
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract });
    await f.poll(); const held = structuredClone(f.task);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toEqual(held); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
  it('allows only explicit same-contract release once to the original outbox and then R2 claim', async () => {
    const f = firstNativePlanFixture();
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    const held = structuredClone(f.task);
    const release = releasePendingVideoTask as (...args: unknown[]) => Promise<boolean>;
    expect(await release(f.deps, held, 'other-contract')).toBe(false);
    expect(await release(f.deps, held, 'video-optional-audio-v1')).toBe(true);
    expect(await release(f.deps, held, 'video-optional-audio-v1')).toBe(false);
    expect(f.task).toMatchObject({ id: held.id, status: 'pending', executionAttempt: 0, result: held.result, payload: held.payload,
      error: null, dispatchedAt: null });
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0); expect(f.lists.get(queueKey)).toEqual([held.id]);
    await f.poll(); expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1, result: held.result, error: null });
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
  });
  it('recovers an original R1-held optional row through the actual R2 caller and claims it once without Host authority', async () => {
    const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    Object.assign(f.task, { idempotencyKey: 'original-r1-held-once' });
    const ledger = [{ id: 'original-debit', taskId: f.task.id, delta: -1 }];
    Object.assign(f.deps.prisma, { usageLedger: { create: vi.fn(), findMany: vi.fn(async () => ledger) } });
    const held = structuredClone(f.task), paid = structuredClone(ledger);
    expect(await releasePendingVideoTask(f.deps, held as never)).toBe(false);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
    const released = structuredClone(f.task);
    expect(f.task).toEqual({ ...held, error: null, dispatchedAt: null, updatedAt: new Date(held.updatedAt.getTime() + 1) });
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(f.task).toEqual(released);
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0);
    await f.poll();
    expect(f.task).toMatchObject({ id: held.id, idempotencyKey: 'original-r1-held-once', result: held.result, payload: held.payload,
      status: 'succeeded', error: null, executionAttempt: 1 });
    expect(ledger).toEqual(paid); expect(f.deps.prisma.usageLedger.create).not.toHaveBeenCalled();
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
  });
  it('releases an already-enqueued R1 hold through R2 admission and its original durable outbox', async () => {
    const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD;
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    const held = structuredClone(f.task);
    await f.poll();
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0, result: held.result });
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    expect(f.lists.get(processingKey)).toEqual([]);
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0); await f.poll();
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1, result: held.result });
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).toHaveBeenCalledTimes(1);
  });
  it('releases the same compatible R1-held optional row once under concurrent R2 recovery', async () => {
    const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    const counts = await Promise.all([recoverHeldVideoTasks(f.deps), recoverHeldVideoTasks(f.deps)]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0 });
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled();
  });
  it.each(['payload', 'result', 'marker', 'updated', 'dispatch', 'session'] as const)(
    'does not release compatible held work whose %s changes during the full-snapshot R2 CAS', async change => {
      const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
      Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
      let changed: unknown;
      f.state.beforeUpdate = () => {
        if (change === 'payload') (f.task.payload.storyboard as Record<string, unknown>).instruction = 'A new instruction';
        if (change === 'result') f.task.result!.providerOutcome = 'unknown';
        if (change === 'marker') Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'unknown-contract' });
        if (change === 'updated') f.task.updatedAt = new Date(f.task.updatedAt.getTime() + 1);
        if (change === 'dispatch') f.task.dispatchedAt = new Date(f.task.dispatchedAt!.getTime() + 1);
        if (change === 'session') f.task.sessionId = 'changed-session';
        changed = structuredClone(f.task);
      };
      expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
      expect(changed).toBeDefined(); expect(f.task).toEqual(changed);
      expect(f.task.error).toBe(VIDEO_READINESS_HOLD); expect(f.task.executionAttempt).toBe(0);
      expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    });
  it.each(['running', 'succeeded', 'failed', 'deleted', 'attempt', 'retry', 'started', 'paid-unknown'] as const)(
    'does not explicitly release %s marked work', async change => {
      const f = firstNativePlanFixture(); f.task.error = VIDEO_READINESS_HOLD;
      Object.assign(f.task.result!.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
      if (['running', 'succeeded', 'failed'].includes(change)) f.task.status = change;
      if (change === 'deleted') f.task.deletedAt = new Date();
      if (change === 'attempt') f.task.executionAttempt = 1;
      if (change === 'retry') f.task.retryCount = 1;
      if (change === 'started') Object.assign(f.task.result!.nativeAgentExecution!, { checkpoint: { state: 'started' } });
      if (change === 'paid-unknown') f.task.result!.providerOutcome = 'unknown';
      const before = structuredClone(f.task);
      const release = releasePendingVideoTask as (...args: unknown[]) => Promise<boolean>;
      expect(await release(f.deps, before, 'video-optional-audio-v1')).toBe(false);
      expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(f.task).toEqual(before);
    });
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

describe('optional video contract hold scope', () => {
  function malformedNonvideo(kind: 'presentation.generate' | 'sdf.extract', ownContract = false) {
    const f = kind === 'sdf.extract' ? ordinaryIngestionFixture() : queueFixture();
    if (kind === 'presentation.generate') f.task.payload = { ...f.task.payload, kind: 'interactive_html', storyboard: { output: 'image', narrative: true } };
    f.task.result = initialNativeAgentExecution({ runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' }, 'paper-illustration')!;
    Object.assign(f.task.result.nativeAgentExecution!, { runtimeId: '' });
    if (ownContract) Object.assign(f.task.result.nativeAgentExecution!, { planningContract: 'unknown-contract' });
    f.handler.mockImplementation(async () => { readNativeAgentExecution(f.task.result); return { completed: true }; });
    return f;
  }
  it.each(['presentation.generate', 'sdf.extract'] as const)('lets malformed unmarked %s reach its existing fail-closed handler on admission and retry', async kind => {
    const f = malformedNonvideo(kind), result = structuredClone(f.task.result);
    const snapshot = structuredClone(f.task);
    expect(await admitPendingVideoTask(f.deps, snapshot as never)).toEqual({ expectedPendingTask: snapshot });
    expect(f.task).toEqual(snapshot); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    await f.poll();
    expect(f.task).toMatchObject({ status: 'failed', executionAttempt: 1, result });
    expect(f.task.error).not.toBe(VIDEO_READINESS_HOLD);
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
    Object.assign(f.task, { status: 'pending', error: null, retryCount: 1 });
    f.lists.set(queueKey, [f.task.id]);
    await f.poll();
    expect(f.task).toMatchObject({ status: 'failed', executionAttempt: 2, retryCount: 1, result });
    expect(f.task.error).not.toBe(VIDEO_READINESS_HOLD);
    expect(execution.claim).toHaveBeenCalledTimes(2); expect(f.handler).toHaveBeenCalledTimes(2);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled(); expect(f.lists.get(processingKey)).toEqual([]);
  });
  it.each(['presentation.generate', 'sdf.extract'] as const)('never invents a video hold for a malformed marked nonvideo %s', async kind => {
    const f = malformedNonvideo(kind, true), snapshot = structuredClone(f.task);
    expect(await admitPendingVideoTask(f.deps, snapshot as never)).toEqual({ expectedPendingTask: snapshot });
    expect(f.task).toEqual(snapshot); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it.each(['presentation.generate', 'sdf.extract'] as const)('preserves generic held recovery and original explicit release for malformed unmarked %s', async kind => {
    const f = malformedNonvideo(kind); f.task.error = VIDEO_READINESS_HOLD;
    const held = structuredClone(f.task);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toEqual(held); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    expect(await releasePendingVideoTask(f.deps, held as never)).toBe(true);
    expect(await releasePendingVideoTask(f.deps, held as never)).toBe(false);
    expect(f.task).toEqual({ ...held, error: null, dispatchedAt: null, updatedAt: new Date(held.updatedAt.getTime() + 1) });
  });
});

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


// Reconstruct the same completed source/Native/pixel graph used by the Domain parent contract.
// All authority readers remain real; only the database and queue are in-memory.
async function persistedNativeAdmissionFixture() {
  const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
  const roId = uuid(1), versionId = uuid(2), claimId = uuid(3), parentId = uuid(4), artifactId = uuid(5), ingestionId = uuid(6);
  const now = new Date('2026-10-08T00:00:00Z');
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const parentIdentity = (asset: { contentHash: string; provenance: unknown }) => JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids: [claimId] });
  type RenderResources = Array<{ id: string; version?: string; upstreamCommit?: string; resources: string[] }>;

  function document(sceneCount = 3) {
    const illustration: IllustrationBrief = { schemaVersion: 2, message: 'The source transfers energy to the receiver.', domain: 'real-space',
      encoding: 'The supported transfer runs left to right.', subjects: [{ description: 'A source left of a receiver',
        basis: { claimId, evidenceId: uuid(7), quote: 'The source transfers energy to the receiver.' } }],
      composition: 'Both objects remain visible.', treatment: 'Scientific linework.', labels: ['Source', 'Receiver'], constraints: ['No invented apparatus.'] };
    return { schemaVersion: 1, title: 'Energy transfer', narrative: { mainMessage: 'Explain the supported transfer.', audience: 'Researchers' },
      videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep the same source and receiver.', audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
      scenes: Array.from({ length: sceneCount }, () => ({ title: 'Transfer', narration: 'The source transfers energy to the receiver.',
        visualAction: describeIllustrationBrief(illustration), illustration: structuredClone(illustration), durationSeconds: 10, sourceClaimIds: [claimId],
        videoDirection: { shotType: 'mechanism', purpose: 'Explain the transfer.', subjectLock: 'Source stays left of receiver.', generatedElements: 'One transfer trace.',
          motion: 'Trace advances left to right.', camera: 'Fixed view.', reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration',
          subtitleMode: 'sidecar', negativeConstraints: ['No invented apparatus.'], modelPolicy: 'commercial-primary' } })) };
  }

  async function fixture() {
    const claims = [{ id: claimId, researchObjectId: roId, versionId, parentClaimId: null, kind: 'finding', statement: 'The source transfers energy to the receiver.',
      assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded', updatedAt: now,
      provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
    const evidence = [{ id: uuid(7), claimId, researchObjectId: roId, versionId, artifactId, contentHash: 'a'.repeat(64), exactQuote: claims[0]!.statement,
      relation: 'supports', locator: { page: 1 }, extractionStatus: 'succeeded', updatedAt: now, provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
    const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId, contentHash: 'a'.repeat(64),
      objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
    const session = { id: uuid(8), userId: uuid(9), researchObjectId: roId, deletedAt: null as Date | null, status: 'active' };
    const ro = { id: roId, workspaceId: uuid(10), deletedAt: null as Date | null };
    const version = { id: versionId, researchObjectId: roId, manifest: { id: uuid(11), coreJson: {}, entries: [{ artifactId, blobSha256: sourceMapRef.contentHash }] } };
    const ingestion = { id: ingestionId, artifactId, state: 'confirmed', batch: { userId: session.userId, researchObjectId: roId },
      artifact: { workspaceId: ro.workspaceId, blobSha256: sourceMapRef.contentHash, deletedAt: null as Date | null, bytesPurgedAt: null },
      agentTask: { id: uuid(12), kind: 'sdf.extract', status: 'succeeded', deletedAt: null as Date | null, updatedAt: now, session,
        result: { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: 4, responseHash: 'c'.repeat(64) },
          core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' } } } };
    const payload = { schemaVersion: 1, researchObjectId: roId, versionId, kind: 'interactive_html', sourceClaimIds: [claimId],
      storyboard: { locale: 'zh', style: 'scientific', instruction: 'Explain the supported transfer.', output: 'video', narrative: true } };
    const cp: NativeAgentCheckpointReference = { taskId: parentId, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
      size: 100, artifactId, documentSha256: sourceMapRef.contentHash, sourceMapHash: sourceMapRef.serializedSha256,
      executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
      responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
    const storyboardDocument = parseStoryboardDocument(document(), [claimId], 'video', { nativeNarrativeVideo: true });
    const sourceEvidenceIdentity = presentationEvidenceIdentity(evidence as never);
    const review = { stage: 'final-brief', decision: 'accepted', requestId: parentId, candidateHash: hash(storyboardDocument), sourceEvidenceIdentity,
      summary: 'Supported by the saved paper.', ...cp.target, responseHash: cp.responseHash };
    const context = { payload: structuredClone(payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(claims), baseIdentity: null, narrativeSourceIdentity: '' };
    const result = { ...initialNativeAgentExecution({ runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' }, 'paper-illustration', 'video-optional-audio-v1')!,
      sourceMapRef: structuredClone(sourceMapRef), assetId: parentId, contentHash: '1'.repeat(64), nativeIllustrationContext: context,
      storyboardCheckpoint: { ...structuredClone(context), executionAttempt: 1, planned: { document: structuredClone(storyboardDocument), promptHash: review.promptHash, reviewFormat: 2,
        designSkills: [{ id: 'scientific', version: '20', resources: ['SKILL.md#Execution'] }] as RenderResources } }, storyboardReview: structuredClone(review),
      nativeIllustration: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', planToolCallId: 'actual-art', reviewToolCallId: 'actual-review' },
      illustrationPrompts: storyboardDocument.scenes.map((_, sceneIndex) => ({ sceneIndex, prompt: `Verified frame ${sceneIndex}`, videoPrompt: `Verified motion ${sceneIndex}` })) };
    result.nativeAgentExecution.checkpoint = cp;
    const parent = { id: parentId, researchObjectId: roId, versionId, kind: 'interactive_html', status: 'draft', deletedAt: null as Date | null,
      contentHash: result.contentHash, sourceClaims: [{ claimId }], provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: parentId,
        sourceEvidenceIdentity, storyboardSettings: structuredClone(payload.storyboard), storyboardDocument, illustrationReview: structuredClone(review) } };
    Object.assign(parent.provenance, { designSkills: structuredClone(result.storyboardCheckpoint.planned.designSkills) });
    const parentTask = { id: parentId, sessionId: session.id, session, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
      error: null as string | null, executionAttempt: 1, payload, result };
    const frames = Array.from({ length: 3 }, (_, sceneIndex) => {
      const id = uuid(20 + sceneIndex), contentHash = String(sceneIndex + 2).repeat(64);
      const imageReview = { stage: 'generated-image', requestId: id, decision: 'accepted', summary: 'Saved pixels preserve the source.', repairInstruction: null,
        contentHash, sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), promptHash: '4'.repeat(64), responseHash: '5'.repeat(64),
        provider: 'minimax-key-1-model-1', model: 'MiniMax-M3' };
      return { id, researchObjectId: roId, versionId, kind: 'image', status: 'draft', deletedAt: null as Date | null, contentHash, sourceClaims: [{ claimId }],
        provenance: { source: 'approved_storyboard_scene', taskId: id, subtype: 'storyboard_scene_image', sceneImage: { storyboardAssetId: parentId, sceneIndex },
          sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), imageReview } };
    });
    const frameTasks = frames.map(frame => ({ id: frame.id, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
      result: { assetId: frame.id, contentHash: frame.contentHash, imageReview: structuredClone(frame.provenance.imageReview),
        nativeImageReview: { mode: 'model-native', state: 'completed', executionAttempt: 1, requestId: frame.id, contentHash: frame.contentHash,
          sourceEvidenceIdentity, parentIdentity: frame.provenance.parentIdentity, promptHash: '4'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3',
          review: structuredClone(frame.provenance.imageReview) } } }));
    const ancestors: Array<typeof parent> = [], ancestorTasks: Array<typeof parentTask> = [];
    type Where = { id?: { in: string[] }; claimId?: { in: string[] }; researchObjectId?: string; versionId?: string; extractionStatus?: string; contentHash?: string; exactQuote?: unknown };
    const prisma = {
      presentationAsset: { findUnique: async ({ where }: { where: { id: string } }) => [parent, ...ancestors, ...frames].find(asset => asset.id === where.id) ?? null,
        findMany: async ({ where }: { where: { id: { in: string[] } } }) => frames.filter(frame => where.id.in.includes(frame.id)) },
      agentTask: { findUnique: async ({ where }: { where: { id: string } }) => [parentTask, ...ancestorTasks, ...frameTasks].find(task => task.id === where.id) ?? null },
      agentSession: { findUnique: async () => session }, researchObject: { findUnique: async () => ro },
      claimNode: { findMany: async ({ where }: { where: Where }) => claims.filter(claim => (!where.id || where.id.in.includes(claim.id))
        && (!where.researchObjectId || claim.researchObjectId === where.researchObjectId) && (!where.versionId || claim.versionId === where.versionId)
        && (!where.extractionStatus || claim.extractionStatus === where.extractionStatus)) },
      evidenceRecord: { findMany: async ({ where }: { where: Where }) => evidence.filter(row => (!where.claimId || where.claimId.in.includes(row.claimId))
        && (!where.researchObjectId || row.researchObjectId === where.researchObjectId) && (!where.versionId || row.versionId === where.versionId)
        && (!where.extractionStatus || row.extractionStatus === where.extractionStatus) && (!where.contentHash || row.contentHash === where.contentHash)) },
      version: { findFirst: async () => version }, ingestionTask: { findUnique: async () => ingestion },
    };
    const source = await readVisualNarrativeSource(prisma as never, { userId: session.userId, workspaceId: ro.workspaceId, researchObjectId: roId, versionId, sourceClaimIds: [claimId] });
    context.narrativeSourceIdentity = source.identity;
    result.storyboardCheckpoint.narrativeSourceIdentity = source.identity;
    const input = { researchObjectId: roId, versionId, sourceClaimIds: [claimId],
      video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parentId, sceneImageAssetIds: frames.map(frame => frame.id) } };
    return { prisma, input, parent, parentTask, frames, frameTasks, ancestors, ancestorTasks, claims, evidence, ingestion, version, context, cp, sourceEvidenceIdentity };
  }
  const native = await fixture(), f = queueFixture();
  f.task.payload = { schemaVersion: 1, kind: 'video', ...native.input };
  f.task.sessionId = native.parentTask.sessionId;
  Object.assign(f.task.session, native.parentTask.session, { researchObject: await native.prisma.researchObject.findUnique() });
  const findTask = f.agentTask.findUnique.getMockImplementation()!;
  f.agentTask.findUnique.mockImplementation(async args => await findTask(args)
    ?? structuredClone(await native.prisma.agentTask.findUnique(args)) as QueueTask | null);
  const { agentTask: _parentTasks, ...readers } = native.prisma;
  void _parentTasks; // Preserve the poller's own task reader while reusing the authoritative parent readers.
  const ingestionUpdate = f.deps.prisma.ingestionTask.updateMany;
  Object.assign(f.deps.prisma, readers);
  f.deps.prisma.ingestionTask.updateMany = ingestionUpdate;
  execution.claim.mockImplementation((...args: unknown[]) =>
    (realClaimAgentTask as (...input: unknown[]) => Promise<unknown>)(...args));
  const setAudio = (policy: string, modes: string[]) => {
    const doc = native.parent.provenance.storyboardDocument;
    doc.videoProduction!.audioPolicy = policy as never;
    doc.scenes.forEach((scene, index) => { scene.videoDirection!.audioMode = modes[index] as never; });
    native.parentTask.result.storyboardCheckpoint.planned.document = structuredClone(doc);
    native.parentTask.result.storyboardReview.candidateHash = hash(doc);
    native.parent.provenance.illustrationReview = structuredClone(native.parentTask.result.storyboardReview);
    native.frames.forEach((frame, index) => {
      frame.provenance.parentIdentity = parentIdentity(native.parent);
      frame.provenance.imageReview.parentIdentity = frame.provenance.parentIdentity;
      const result = native.frameTasks[index]!.result;
      result.imageReview = structuredClone(frame.provenance.imageReview);
      result.nativeImageReview.parentIdentity = frame.provenance.parentIdentity;
      result.nativeImageReview.review = structuredClone(frame.provenance.imageReview);
    });
  };
  const asSceneImage = () => {
    f.task.payload = { schemaVersion: 1, kind: 'image', researchObjectId: roId, versionId, sourceClaimIds: [claimId],
      sceneImage: { storyboardAssetId: parentId, sceneIndex: 1 } };
  };
  return { ...f, native, setAudio, asSceneImage };
}

describe('ordinary inherited Native local revision admission', () => {
  async function local() {
    const f = await persistedNativeAdmissionFixture(); f.state.ready = true;
    f.task.payload = { ...structuredClone(f.native.parentTask.payload), storyboard: {
      ...f.native.parentTask.payload.storyboard, baseAssetId: f.native.parent.id, revisionSceneIndex: 1, instruction: 'Revise only the selected scene.',
    } };
    f.task.result = initialNativeAgentExecution({ runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' }, 'paper-illustration', 'video-optional-audio-v1')!;
    Object.assign(f.task, { idempotencyKey: 'original-ordinary-local-key' });
    return f;
  }
  it('recovers the same inherited local NULL-CP row once through complete readiness and the real outbox/claim', async () => {
    const f = await local(); f.setAudio('native-first', ['native', 'native', 'native']);
    f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    const ledger = [{ id: 'local-existing-credit', taskId: f.task.id, delta: -1 }];
    Object.assign(f.deps.prisma, { usageLedger: { create: vi.fn(), findMany: vi.fn(async () => ledger) } });
    const before = structuredClone(f.task), paid = structuredClone(ledger);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(1); expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toEqual({ ...before, error: null, dispatchedAt: null, updatedAt: new Date(before.updatedAt.getTime() + 1) });
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0); await f.poll();
    expect(f.task).toMatchObject({ id: before.id, status: 'succeeded', executionAttempt: 1, result: before.result, payload: before.payload,
      idempotencyKey: 'original-ordinary-local-key' });
    expect(ledger).toEqual(paid); expect(f.deps.prisma.usageLedger.create).not.toHaveBeenCalled();
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.deps.readVideoReadiness!).mock.calls).toEqual([['native-first'], ['native-first']]);
  });
  it.each(['fresh', 'held'] as const)('admits %s native-only local work using the saved purpose without another debit', async state => {
    const f = await local(); f.setAudio('native-first', ['native', 'native', 'native']);
    f.deps.readVideoReadiness = vi.fn(async (purpose?: 'native-first') => purpose === 'native-first');
    const ledger = [{ id: 'original-credit', taskId: f.task.id, delta: -1 }];
    Object.assign(f.deps.prisma, { usageLedger: { create: vi.fn(), findMany: vi.fn(async () => ledger) } });
    const paid = structuredClone(ledger);
    if (state === 'held') {
      f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
      expect(await recoverHeldVideoTasks(f.deps)).toBe(1); expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
      expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0);
    }
    await f.poll();
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1, idempotencyKey: 'original-ordinary-local-key' });
    expect(vi.mocked(f.deps.readVideoReadiness!).mock.calls).toEqual(state === 'held' ? [['native-first'], ['native-first']] : [['native-first']]);
    expect(execution.claim).toHaveBeenCalledTimes(1); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(ledger).toEqual(paid); expect(f.deps.prisma.usageLedger.create).not.toHaveBeenCalled();
  });
  it.each(['closed', 'external', 'mode-race', 'identity-race', 'contract-race'] as const)('keeps %s local native-only work held at attempt zero', async change => {
    const f = await local(); f.setAudio('native-first', ['native', 'native', 'native']);
    if (change === 'external') f.setAudio('external-narration', ['external-narration', 'external-narration', 'external-narration']);
    f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    f.deps.readVideoReadiness = vi.fn(async (purpose?: 'native-first') => {
      if (change === 'mode-race') f.setAudio('external-narration', ['external-narration', 'external-narration', 'external-narration']);
      if (change === 'identity-race') f.native.parentTask.result.illustrationPrompts[0]!.videoPrompt = 'Changed video prompt';
      if (change === 'contract-race') Object.assign(f.native.parentTask.result.nativeAgentExecution, { planningContract: 'image-source-explicit-trig-v1' });
      return change !== 'closed' && purpose === 'native-first';
    });
    const held = structuredClone(f.task);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(f.task).toEqual(held);
    expect(vi.mocked(f.deps.readVideoReadiness!).mock.calls).toEqual([change === 'external' ? [] : ['native-first']]);
    expect(await f.outbox()).toBe(0); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
  it('admits a newly inherited local row only with default complete Host/TTS readiness', async () => {
    const f = await local(), before = structuredClone(f.task);
    expect(await admitPendingVideoTask(f.deps, before as never)).toEqual({ expectedPendingTask: before });
    expect(f.task).toEqual(before); expect(vi.mocked(f.deps.readVideoReadiness!).mock.calls).toEqual([[]]);
  });
  it('releases the inherited local snapshot once under concurrent compatible recovery', async () => {
    const f = await local(); f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
    const counts = await Promise.all([recoverHeldVideoTasks(f.deps), recoverHeldVideoTasks(f.deps)]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await f.outbox()).toBe(1); expect(await f.outbox()).toBe(0);
    expect(f.task.executionAttempt).toBe(0); expect(execution.claim).not.toHaveBeenCalled();
  });
  it('retains a local row changed after parent/readiness checks before full-snapshot release', async () => {
    const f = await local(); f.task.error = VIDEO_READINESS_HOLD;
    let changed: unknown;
    f.state.beforeUpdate = () => { f.task.result!.providerOutcome = 'unknown'; changed = structuredClone(f.task); };
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(changed).toBeDefined(); expect(f.task).toEqual(changed);
    expect(f.task).toMatchObject({ error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });
  it.each(['not-ready', 'unknown-parent', 'deleted-parent', 'unmarked-parent', 'parent-drift'] as const)(
    'keeps %s inherited local work held with unchanged result/key/attempt', async change => {
      const f = await local(); f.task.error = VIDEO_READINESS_HOLD; f.lists.set(queueKey, []);
      if (change === 'not-ready') f.state.ready = false;
      if (change === 'unknown-parent') Object.assign(f.native.parentTask.result.nativeAgentExecution, { planningContract: 'unknown' });
      if (change === 'deleted-parent') f.native.parent.deletedAt = new Date();
      if (change === 'unmarked-parent') delete (f.native.parentTask.result.nativeAgentExecution as { planningContract?: unknown }).planningContract;
      if (change === 'parent-drift') f.deps.readVideoReadiness = vi.fn(async () => {
        delete (f.native.parentTask.result.nativeAgentExecution as { planningContract?: unknown }).planningContract;
        return true;
      });
      const held = structuredClone(f.task);
      expect(await recoverHeldVideoTasks(f.deps)).toBe(0); expect(f.task).toEqual(held);
      expect(await releasePendingVideoTask(f.deps, held as never, 'video-optional-audio-v1')).toBe(false);
      expect(await f.outbox()).toBe(0); expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    });
  it.each(['started', 'unknown', 'retry', 'attempt', 'terminal', 'deleted'] as const)(
    'cannot use local compatibility release to reopen %s work', async change => {
      const f = await local(); f.task.error = VIDEO_READINESS_HOLD;
      if (change === 'started') Object.assign(f.task.result!.nativeAgentExecution!, { checkpoint: { state: 'started' } });
      if (change === 'unknown') f.task.result!.providerOutcome = 'unknown';
      if (change === 'retry') f.task.retryCount = 1;
      if (change === 'attempt') f.task.executionAttempt = 1;
      if (change === 'terminal') f.task.status = 'succeeded';
      if (change === 'deleted') f.task.deletedAt = new Date();
      const before = structuredClone(f.task);
      expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
      expect(await releasePendingVideoTask(f.deps, before as never, 'video-optional-audio-v1')).toBe(false);
      expect(f.task).toEqual(before); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    });
});

describe('persisted Native audio admission', () => {
  it.each(['video', 'scene-image'] as const)('holds external %s without a preset through the default zero-argument readiness', async kind => {
    const f = await persistedNativeAdmissionFixture();
    if (kind === 'scene-image') f.asSceneImage();
    f.deps.readVideoReadiness = vi.fn(async purpose => purpose === 'native-first');
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(vi.mocked(f.deps.readVideoReadiness).mock.calls).toEqual([[]]);
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });

  it.each(['video', 'scene-image'] as const)('claims native-first %s from its actual saved parent through the original CAS', async kind => {
    const f = await persistedNativeAdmissionFixture(); f.setAudio('native-first', ['native', 'native', 'native']);
    if (kind === 'scene-image') f.asSceneImage();
    f.deps.readVideoReadiness = vi.fn(async purpose => purpose === 'native-first');
    const parent = structuredClone(f.native.parent), receipt = structuredClone(f.native.parentTask.result);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'succeeded', executionAttempt: 1 }); expect(f.handler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.deps.readVideoReadiness).mock.calls).toEqual([['native-first']]);
    expect(f.native.parent).toEqual(parent); expect(f.native.parentTask.result).toEqual(receipt);
  });

  it.each(['video', 'scene-image'] as const)('holds external %s with no narration preset despite client native hints', async kind => {
    const f = await persistedNativeAdmissionFixture();
    if (kind === 'scene-image') f.asSceneImage();
    Object.assign(f.task.payload, { audioPolicy: 'native-first', audioMode: 'native' });
    f.deps.readVideoReadiness = vi.fn(async purpose => purpose === 'native-first');
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
    // Strict payload validation may block the untrusted hints before host sampling.
    expect(vi.mocked(f.deps.readVideoReadiness).mock.calls.every(call => call.length === 0)).toBe(true);
  });

  it.each(['video', 'scene-image'] as const)('blocks mixed %s before any provider readiness or rendering', async kind => {
    const f = await persistedNativeAdmissionFixture(); f.setAudio('native-first', ['native', 'external-narration', 'native']);
    if (kind === 'scene-image') {
      f.asSceneImage();
      f.handler.mockImplementation(async () => {
        await requireSceneImageParent(f.deps.prisma, parsePresentationGenerationPayload(f.task.payload));
        return { completed: true };
      });
    }
    f.deps.readVideoReadiness = vi.fn(async () => true);
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject(kind === 'video'
      ? { status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 }
      : { status: 'failed', executionAttempt: 1 });
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    expect(execution.claim).toHaveBeenCalledTimes(kind === 'video' ? 0 : 1);
  });

  it('releases only the native held task through native readiness and never posts or changes an attempt', async () => {
    const f = await persistedNativeAdmissionFixture(); f.task.error = VIDEO_READINESS_HOLD;
    f.deps.readVideoReadiness = vi.fn(async purpose => purpose === 'native-first');
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(vi.mocked(f.deps.readVideoReadiness).mock.calls).toEqual([[]]);
    f.setAudio('native-first', ['native', 'native', 'native']);
    expect(await recoverHeldVideoTasks(f.deps)).toBe(1);
    expect(f.task).toMatchObject({ status: 'pending', error: null, dispatchedAt: null, executionAttempt: 0 });
    expect(vi.mocked(f.deps.readVideoReadiness).mock.calls).toEqual([[], ['native-first']]);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });

  it.each(['mode', 'mixed', 'source', 'pixel-owner'] as const)('cannot claim a parent changed during readiness by %s', async change => {
    const f = await persistedNativeAdmissionFixture(); f.setAudio('native-first', ['native', 'native', 'native']);
    f.deps.readVideoReadiness = vi.fn(async () => {
      if (change === 'mode') f.setAudio('external-narration', ['external-narration', 'external-narration', 'external-narration']);
      if (change === 'mixed') f.setAudio('native-first', ['native', 'hybrid', 'native']);
      if (change === 'source') f.native.claims[0]!.statement = 'Different scientific source.';
      if (change === 'pixel-owner') f.native.frameTasks[0]!.status = 'failed';
      return true;
    });
    expect(await f.poll()).toBe(true);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
    expect(execution.claim).not.toHaveBeenCalled(); expect(f.handler).not.toHaveBeenCalled();
  });

  it('keeps a held mode change during readiness parked', async () => {
    const f = await persistedNativeAdmissionFixture(); f.task.error = VIDEO_READINESS_HOLD;
    f.setAudio('native-first', ['native', 'native', 'native']);
    f.deps.readVideoReadiness = vi.fn(async () => {
      f.setAudio('external-narration', ['external-narration', 'external-narration', 'external-narration']); return true;
    });
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toMatchObject({ status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: 0 });
  });

  it('retains the payload snapshot CAS after a valid native parent read', async () => {
    const f = await persistedNativeAdmissionFixture(); f.setAudio('native-first', ['native', 'native', 'native']);
    f.deps.readVideoReadiness = vi.fn(async () => true);
    const admitted = await admitPendingVideoTask(f.deps, structuredClone(f.task) as never);
    expect(admitted).toHaveProperty('expectedPendingTask');
    if (!admitted || typeof admitted !== 'object') throw new Error('Expected a pending admission snapshot');
    f.task.payload = { ...f.task.payload, versionId: 'changed-version' };
    expect(await realClaimAgentTask(f.deps, f.task.id, admitted.expectedPendingTask)).toBeNull();
    expect(f.task.executionAttempt).toBe(0); expect(f.handler).not.toHaveBeenCalled();
  });

  it.each(['running', 'succeeded', 'failed'] as const)('does not admit or release %s old work', async status => {
    const f = await persistedNativeAdmissionFixture(); f.setAudio('native-first', ['native', 'native', 'native']);
    Object.assign(f.task, { status, executionAttempt: 1, error: VIDEO_READINESS_HOLD, result: { providerOutcome: 'unknown' } });
    const before = structuredClone(f.task);
    f.deps.readVideoReadiness = vi.fn(async () => true);
    expect(await admitPendingVideoTask(f.deps, structuredClone(f.task) as never)).toBeNull();
    expect(await recoverHeldVideoTasks(f.deps)).toBe(0);
    expect(f.task).toEqual(before); expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
});
