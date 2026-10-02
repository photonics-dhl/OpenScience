import { describe, expect, it } from 'vitest';
import { readNativeAgentExecution, initialNativeAgentExecution, compareNativeAgentCheckpoint, nativeAgentTerminalResult,
  type NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { projectAgentTaskResult, persistAgentTaskInTransaction, persistHistoricalSourceTaskInTransaction, markTaskProgress } from '../../src/agent/agent';
import { fixture as sourceFixture } from './direct-source-review-fixture';

const runtime = { runtimeId: 'installed-0.10-snapshot', skillCatalogueId: 'selected-science-catalogue', model: 'MiniMax-M3' };
const map = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'paper', contentHash: 'a'.repeat(64),
  objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
const reference = (state: 'started' | 'completed', turnCount = 1): NativeAgentCheckpointReference => ({ taskId: 'task',
  objectKey: `derived/native-agent/${state === 'started' ? 'c'.repeat(64) : 'd'.repeat(64)}.json`,
  serializedSha256: state === 'started' ? 'c'.repeat(64) : 'd'.repeat(64), size: 300, artifactId: map.artifactId,
  documentSha256: map.contentHash, sourceMapHash: map.serializedSha256, state, turnCount, executionAttempt: 1,
  target: { provider: 'minimax-key-1-model-1', model: runtime.model, promptHash: 'e'.repeat(64) },
  ...(state === 'completed' ? { responseHash: 'f'.repeat(64), finishReason: 'stop' as const, hasToolCalls: false } : {}) });
function fixture() {
  const task = { id: 'task', kind: 'sdf.extract', status: 'running', deletedAt: null, executionAttempt: 1,
    result: { ...initialNativeAgentExecution(runtime), sourceMapRef: structuredClone(map) } };
  const tx = { agentTask: { findUnique: async () => task, updateMany: async ({ where, data }: {
    where: { result: { equals: unknown }; executionAttempt: number }; data: { result: typeof task.result } }) => {
    if (JSON.stringify(where.result.equals) !== JSON.stringify(task.result) || where.executionAttempt !== task.executionAttempt) return { count: 0 };
    task.result = data.result; return { count: 1 };
  } } };
  return { task, tx: tx as never };
}
describe('native Agent server-owned execution receipts', () => {
  it.each(['nativeIllustrationContext', 'storyboardCheckpoint', 'storyboardReview', 'nativeIllustration', 'illustrationPrompts'])('retains server-owned %s on failure and rejects a substituted incoming value', key => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, initialNativeAgentExecution(runtime, 'paper-illustration'), { [key]: { saved: true } });
    expect(nativeAgentTerminalResult(f.task as never, 'failed', undefined)).toMatchObject({ [key]: { saved: true } });
    expect(() => nativeAgentTerminalResult(f.task as never, 'failed', { [key]: { saved: false } })).toThrow();
  });
  it('initializes an illustration profile without changing the original paper profile', () => {
    expect(readNativeAgentExecution(initialNativeAgentExecution(runtime, 'paper-illustration'))?.profile).toBe('paper-illustration');
    expect(readNativeAgentExecution(initialNativeAgentExecution(runtime))?.profile).toBe('paper-understanding');
  });
  it('uses the same original started/completed CAS for a native illustration task', async () => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, initialNativeAgentExecution(runtime, 'paper-illustration'));
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: reference('started'), paidCompletion: false });
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'), next: reference('completed'), paidCompletion: true });
    expect(readNativeAgentExecution(f.task.result)?.checkpoint?.responseHash).toBe(reference('completed').responseHash);
    expect(f.task.result.sourceMapRef).toEqual(map);
  });
  it.each(['valid', 'receipt-changed', 'wrong-task', 'wrong-response', 'source-profile'] as const)('binds illustration terminal proof: %s', mode => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, initialNativeAgentExecution(runtime, mode === 'source-profile' ? 'paper-understanding' : 'paper-illustration'));
    f.task.result.nativeAgentExecution!.checkpoint = reference('completed');
    const review = { stage: 'final-brief', requestId: 'task', decision: 'accepted', summary: 'Supported',
      candidateHash: '1'.repeat(64), sourceEvidenceIdentity: 'bound-existing-source',
      ...reference('completed').target, responseHash: reference('completed').responseHash };
    Object.assign(f.task.result, { storyboardReview: review });
    const incoming = { assetId: mode === 'wrong-task' ? 'foreign' : 'task', sourceMapRef: map, storyboardReview: { ...review,
      ...(mode === 'receipt-changed' ? { candidateHash: '2'.repeat(64) } : {}),
      ...(mode === 'wrong-response' ? { responseHash: '3'.repeat(64) } : {}) } };
    if (mode === 'valid') expect(nativeAgentTerminalResult(f.task as never, 'succeeded', incoming)).toMatchObject(incoming);
    else expect(() => nativeAgentTerminalResult(f.task as never, 'succeeded', incoming)).toThrow('binding');
  });
  it.each(['unchanged', 'membership', 'session', 'artifact', 'map', 'map_missing', 'map_partial', 'source', 'run'] as const)(
    'rebinds current authority inside actual markTaskProgress after a paid completion (%s)', async change => {
      const f = sourceFixture(); Object.assign(f.prisma, { trashEntry: { findFirst: async () => null } });
      const findSource = f.prisma.ingestionTask.findUnique.bind(f.prisma.ingestionTask);
      Object.assign(f.prisma.ingestionTask, { findUnique: async (args: { where: { id?: string; agentTaskId?: string }; include?: unknown }) => {
        if (!args.where.agentTaskId) return findSource(args as never);
        const row = f.db.ingestionTasks.find(item => item.agentTaskId === args.where.agentTaskId);
        return row ? findSource({ ...args, where: { id: row.id } } as never) : null;
      } });
      Object.assign(f.prisma.hermesResearchStep, { findFirst: async ({ where }: { where: { agentTaskId: string; stage: string } }) =>
        f.db.hermesResearchSteps.find(step => step.agentTaskId === where.agentTaskId && step.stage === where.stage) ?? null });
      const owner = f.db.agentTasks[0]!; const session = f.db.agentSessions.find(row => row.id === owner.sessionId)!;
      const cp = { ...reference('completed'), taskId: owner.id, artifactId: f.ids.artifact };
      Object.assign(owner, { status: 'running', executionAttempt: 1, retryCount: 0,
        result: { ...initialNativeAgentExecution(runtime), sourceMapRef: f.anchorResult.sourceMapRef } });
      (owner.result as ReturnType<typeof initialNativeAgentExecution>)!.nativeAgentExecution.checkpoint = cp;
      f.db.ingestionTasks[0]!.agentTaskId = owner.id; f.db.hermesResearchRuns[0]!.status = 'running';
      const sourceStep = f.db.hermesResearchSteps.find(row => row.stage === 'source_ingestion')!; sourceStep.agentTaskId = owner.id;
      const result = { ...f.anchorResult, scientificReview: { ...f.anchorResult.scientificReview, kind: 'hermes_agent_review',
        ...cp.target, responseHash: cp.responseHash, runtimeId: runtime.runtimeId, skillCatalogueId: runtime.skillCatalogueId } };
      if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
      if (change === 'session') session.status = 'closed';
      if (change === 'artifact') f.db.artifacts[0]!.blobSha256 = '9'.repeat(64);
      if (change === 'map') Object.assign((owner.result as { sourceMapRef: typeof map }).sourceMapRef,
        { serializedSha256: '9'.repeat(64), objectKey: `derived/source-maps/${'9'.repeat(64)}.json` });
      if (change === 'map_missing') delete (owner.result as { sourceMapRef?: unknown }).sourceMapRef;
      if (change === 'map_partial') (owner.result as { sourceMapRef: { parserStatus: string } }).sourceMapRef.parserStatus = 'needs_review';
      if (change === 'source') f.db.ingestionTasks[0]!.agentTaskId = 'other';
      if (change === 'run') f.db.hermesResearchRuns[0]!.status = 'cancelled';
      const promise = markTaskProgress(f.deps, { taskId: owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 });
      if (change === 'unchanged') expect((await promise).status).toBe('succeeded');
      else { await expect(promise).rejects.toThrow(); expect(owner.status).toBe('running'); }
      expect(readNativeAgentExecution(owner.result)?.checkpoint).toEqual(cp);
    });
  it('initializes only new normal paper tasks after exact replay, without a second debit or migrating old tasks', async () => {
    const f = sourceFixture(); const session = f.db.agentSessions[0]!;
    const input = { userId: f.input.actorId, sessionId: session.id, kind: 'sdf.extract',
      payload: { artifactId: f.ids.artifact, researchObjectId: f.ids.ro }, idempotencyKey: 'normal-paper:extract:0' };
    const old = await persistAgentTaskInTransaction(f.deps, f.prisma as never, input);
    expect(readNativeAgentExecution(old.task.result)).toBeUndefined();
    const deps = { ...f.deps, nativeAgentRuntime: runtime }; const ledger = f.db.usageLedger.length;
    expect((await persistAgentTaskInTransaction(deps, f.prisma as never, input)).replayed).toBe(true);
    expect(f.db.usageLedger.length).toBe(ledger); expect(readNativeAgentExecution(old.task.result)).toBeUndefined();
    const fresh = await persistAgentTaskInTransaction(deps, f.prisma as never, { ...input, idempotencyKey: 'fresh-paper:extract:0' });
    expect(readNativeAgentExecution(fresh.task.result)).toMatchObject(runtime); expect(f.db.usageLedger.length).toBe(ledger + 1);
    const historicalReview = await persistAgentTaskInTransaction(deps, f.prisma as never, { ...input, idempotencyKey: 'ingestion-analysis-compose:historical-review' });
    expect(readNativeAgentExecution(historicalReview.task.result)).toMatchObject(runtime);
    const signedHistorical = await persistHistoricalSourceTaskInTransaction(deps, f.prisma as never,
      { ...input, idempotencyKey: 'signed-historical-review' });
    expect(readNativeAgentExecution(signedHistorical.task.result)).toBeUndefined();
  });
  it('creates a distinct actual Agent marker, and has no marker for disabled server routing', () => {
    expect(readNativeAgentExecution(initialNativeAgentExecution(runtime))).toMatchObject({ kind: 'hermes-agent', ...runtime });
    expect(initialNativeAgentExecution(undefined)).toBeUndefined(); expect(readNativeAgentExecution({ nativeSourceReview: { mode: 'model-native' } })).toBeUndefined();
  });
  it('does not fall back from a malformed native marker', () => {
    expect(() => readNativeAgentExecution({ nativeAgentExecution: { kind: 'model-native' } })).toThrow('binding');
  });
  it('starts after current authority was checked and completes the exact paid receipt after lease change', async () => {
    const f = fixture(); await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: reference('started'), paidCompletion: false });
    f.task.executionAttempt = 2; f.task.status = 'failed';
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'), next: reference('completed'), paidCompletion: true });
    expect(readNativeAgentExecution(f.task.result)?.checkpoint?.state).toBe('completed');
  });
  it.each(['deleted', 'source', 'reference', 'target', 'turn', 'lease'] as const)('denies changed %s before checkpoint publication', async change => {
    const f = fixture(); await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: reference('started'), paidCompletion: false });
    const next = reference('completed');
    if (change === 'deleted') f.task.deletedAt = new Date() as never;
    if (change === 'source') next.documentSha256 = '9'.repeat(64);
    if (change === 'reference') next.taskId = 'foreign';
    if (change === 'target') next.target.promptHash = '9'.repeat(64);
    if (change === 'turn') next.turnCount = 2;
    if (change === 'lease') f.task.executionAttempt = 2;
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'), next,
      paidCompletion: change !== 'lease' })).rejects.toThrow();
  });
  it('does not append a new request over an unknown started response', async () => {
    const f = fixture(); await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: reference('started'), paidCompletion: false });
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'), next: reference('started', 2), paidCompletion: false })).rejects.toThrow();
  });
  it('rejects guessed or mismatched scientific terminal receipts and keeps the private checkpoint on failure', async () => {
    const f = fixture(); const started = reference('started'); await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: started, paidCompletion: false });
    await expect(Promise.resolve().then(() => nativeAgentTerminalResult(f.task as never, 'succeeded', { scientificReview: { kind: 'model_self_check' } }))).rejects.toThrow();
    expect(nativeAgentTerminalResult(f.task as never, 'failed', { reason: 'stopped' })).toMatchObject({ nativeAgentExecution: { checkpoint: started }, reason: 'stopped' });
    expect(nativeAgentTerminalResult(f.task as never, 'failed', undefined)).toMatchObject({ sourceMapRef: map });
  });
  it('removes native checkpoints from public task projection, including marker-only results', () => {
    expect(projectAgentTaskResult(initialNativeAgentExecution(runtime), 'sdf.extract')).toBeNull();
    expect(projectAgentTaskResult({ ...initialNativeAgentExecution(runtime), core: { problem: 'public' } }, 'sdf.extract')).toEqual({ core: { problem: 'public' } });
  });
});
