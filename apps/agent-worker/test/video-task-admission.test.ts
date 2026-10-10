import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPollOnce, recoverProcessingQueue, type WorkerDeps } from '../src/index';
import { admitPendingVideoTask, createVideoReadinessResumeScheduler, parkPendingVideoTask, releasePendingVideoTask,
  recoverHeldVideoTasks, VIDEO_READINESS_HOLD } from '../src/video-task-admission';
import { dispatchAgentTask, recoverUndispatchedAgentTasks } from '../../../packages/domain/src/agent/agent';

const execution = vi.hoisted(() => ({ claim: vi.fn(), progress: vi.fn() }));
// The dispatcher, intent proof and admission mutations remain real. Only the
// existing claim/progress execution ports are isolated from unrelated handlers.
vi.mock('@openscience/domain', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(),
  claimAgentTask: execution.claim, markTaskProgress: execution.progress,
}));
beforeEach(() => { execution.claim.mockReset(); execution.progress.mockReset(); });

const queueKey = 'agent:queue'; const processingKey = 'agent:queue:processing';
type QueueTask = {
  id: string; kind: string; status: string; error: string | null; executionAttempt: number;
  sessionId: string; retryCount: number; result: Record<string, unknown> | null; interestContext: Record<string, unknown> | null;
  updatedAt: Date; createdAt: Date; dispatchedAt: Date | null; deletedAt: null;
  payload: Record<string, unknown>; session: { id: string; userId: string; researchObjectId: string; deletedAt: null;
    researchObject: { id: string; workspaceId: string; deletedAt: null } };
};
function matches(value: unknown, where: Record<string, unknown>): boolean {
  const row = value as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some(filter => matches(row, filter));
    const actual = row[key];
    if (condition instanceof Date) return actual instanceof Date && actual.getTime() === condition.getTime();
    if (condition && typeof condition === 'object') {
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
    executionAttempt: 0, updatedAt: savedAt, createdAt: savedAt, dispatchedAt: savedAt, deletedAt: null,
    payload: { schemaVersion: 1, kind: 'video', researchObjectId: 'ro', versionId: 'version', sourceClaimIds: ['claim'], video: {} },
    session: { id: 'session', userId: 'actor', researchObjectId: 'ro', deletedAt: null,
      researchObject: { id: 'ro', workspaceId: 'workspace', deletedAt: null } } };
  const tasks = new Map<string, QueueTask>([[task.id, task]]);
  const lists = new Map<string, string[]>([[queueKey, [task.id]], [processingKey, []]]);
  const state = { ready: false, rejectUpdate: false, beforeUpdate: undefined as (() => void | Promise<void>) | undefined,
    afterPush: undefined as (() => Promise<void>) | undefined };
  const agentTask = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(tasks.get(where.id) ?? null)),
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
      [...tasks.values()].filter(row => matches(row, where)).slice(0, take).map(row => structuredClone(row))),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hook = state.beforeUpdate; state.beforeUpdate = undefined; await hook?.();
      if (state.rejectUpdate) return { count: 0 };
      let count = 0;
      for (const row of tasks.values()) if (matches(row, where)) {
        Object.assign(row, data, { updatedAt: data.updatedAt ?? new Date() }); count++;
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
    ingestionTask: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
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
      await f.poll(); expect(f.task).toEqual(afterChange); expect(f.lists.get(processingKey)).toEqual([f.task.id]);
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
  it('keeps processing when the pending park CAS loses instead of claiming or marking failure', async () => {
    const f = queueFixture(); f.state.rejectUpdate = true;
    expect(await f.poll()).toBe(true); expect(f.lists.get(processingKey)).toEqual([f.task.id]);
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
  it('keeps a losing held CAS in place without blocking or accidentally moving the next task', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.state.rejectUpdate = true;
    const ordinary = { ...structuredClone(f.task), id: 'ordinary', kind: 'demo.echo', error: null };
    f.tasks.set(ordinary.id, ordinary); f.lists.set(queueKey, []); f.lists.set(processingKey, [ordinary.id, f.task.id]);
    expect(await recoverProcessingQueue(f.deps)).toBe(1);
    expect(f.lists.get(processingKey)).toEqual([f.task.id]); expect(f.lists.get(queueKey)).toEqual([ordinary.id]);
    expect(f.redis.lrange).toHaveBeenCalledTimes(1); expect(f.redis.rpoplpush).not.toHaveBeenCalled();
  });
  it('preserves both processing IDs if ordinary requeue fails behind a parked tail', async () => {
    const f = queueFixture(); f.task.error = VIDEO_READINESS_HOLD; f.state.rejectUpdate = true;
    const ordinary = { ...structuredClone(f.task), id: 'ordinary', kind: 'demo.echo', error: null };
    f.tasks.set(ordinary.id, ordinary); f.lists.set(queueKey, []); f.lists.set(processingKey, [ordinary.id, f.task.id]);
    f.redis.lpush.mockRejectedValueOnce(new Error('WRONGTYPE queue'));
    await expect(recoverProcessingQueue(f.deps)).rejects.toThrow('WRONGTYPE queue');
    expect(f.lists.get(processingKey)).toEqual([ordinary.id, f.task.id]); expect(f.redis.lrem).not.toHaveBeenCalled();
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
