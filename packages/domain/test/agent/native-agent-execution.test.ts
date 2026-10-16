import { describe, expect, it } from 'vitest';
import { readNativeAgentExecution, initialNativeAgentExecution, compareNativeAgentCheckpoint, nativeAgentTerminalResult,
  supportsNativeIllustration, type NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { projectAgentTaskResult, persistAgentTaskInTransaction, persistHistoricalSourceTaskInTransaction, markTaskProgress, getAgentTask } from '../../src/agent/agent';
import { getIngestionTask } from '../../src/ingestion/ingestion-service';
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
  return { task, tx: tx as never, mockTx: tx };
}

it('keeps ordinary opaque extensions through real late paid CAS and authenticated historical readers', async () => {
  const f = sourceFixture(), owner = f.db.agentTasks.find(row => row.id === f.ids.failed)!;
  const opaque = { selectedImageContext: { note: 'ordinary retained history', assetId: 'ordinary retained asset extension' }, selectedImageReply: { text: 'ordinary retained reply' },
    selectedImageReference: { note: 'ordinary retained reference', assetId: 'opaque legacy asset' },
    selectedImageDraft: { note: 'ordinary retained draft', values: [null, { preserved: true }] } };
  const source = owner.result.sourceMapRef;
  const started = { ...reference('started'), taskId: owner.id, artifactId: source.artifactId,
    documentSha256: source.contentHash, sourceMapHash: source.serializedSha256 };
  Object.assign(owner, { status: 'failed', executionAttempt: 2 });
  Object.assign(owner.result, initialNativeAgentExecution(runtime, 'paper-author'), opaque);
  owner.result.nativeAgentExecution.checkpoint = started;
  const completed = { ...started, state: 'completed' as const, responseHash: 'f'.repeat(64), finishReason: 'stop' as const, hasToolCalls: false };
  const ledger = structuredClone(f.db.usageLedger);
  await compareNativeAgentCheckpoint(f.prisma as never, { taskId: owner.id, executionAttempt: 1, expected: started, next: completed, paidCompletion: true });
  expect(owner.executionAttempt).toBe(2);
  expect(readNativeAgentExecution(owner.result)?.checkpoint?.executionAttempt).toBe(1);
  expect(owner.result).toMatchObject(opaque);
  expect((await getAgentTask(f.deps, { userId: f.input.actorId, taskId: owner.id })).result).toMatchObject(opaque);
  expect((await getIngestionTask(f.deps, { userId: f.input.actorId, taskId: f.ids.source })).task.result).toMatchObject(opaque);
  const saved = structuredClone(owner.result);
  expect((await markTaskProgress(f.deps, { taskId: owner.id, status: 'failed' })).result).toMatchObject(opaque);
  owner.status = 'succeeded';
  expect((await markTaskProgress(f.deps, { taskId: owner.id, status: 'succeeded', result: { summary: 'must not replace history' } })).result).toMatchObject(opaque);
  expect(owner.result).toEqual(saved);
  expect(readNativeAgentExecution(owner.result)?.checkpoint).toEqual(completed);
  expect(f.db.usageLedger).toEqual(ledger);
  await expect(getAgentTask(f.deps, { userId: 'not-the-owner', taskId: owner.id })).rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
  f.db.memberships[0]!.userId = 'not-the-member';
  await expect(getIngestionTask(f.deps, { userId: f.input.actorId, taskId: f.ids.source })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
});

describe('image review tool-final contract and pure checkpoint finalization', () => {
  const policy = 'image-review-tool-final-v1' as const;
  const initialize = initialNativeAgentExecution as (...args: unknown[]) => ReturnType<typeof initialNativeAgentExecution>;
  function imageFixture() {
    const f = fixture(); f.task.kind = 'presentation.generate'; f.task.executionAttempt = 2;
    const identity = { requestId: 'task', contentHash: 'a'.repeat(64), sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'original-parent' };
    const cp = { taskId: 'task', sourceKind: 'illustration-image', imageIdentity: identity,
      objectKey: `derived/native-agent/${'c'.repeat(64)}.json`, serializedSha256: 'c'.repeat(64), size: 300,
      executionAttempt: 1, turnCount: 2, state: 'completed', imageResultPolicy: policy, received: 'decoded',
      target: reference('completed').target, responseHash: 'd'.repeat(64), finishReason: 'other', hasToolCalls: true };
    Object.assign(f.task, { result: { nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile: 'image-review', imageResultPolicy: policy, checkpoint: cp },
      nativeImageReview: { ...identity, mode: 'agent-native', state: 'prepared', imageResultPolicy: policy,
        preparedAt: 1, deadlineAt: 300001, executionAttempt: 1, ...runtime, provider: cp.target.provider,
        reservationLedgerId: 'original-charge', maxTurns: 4, maxOutputTokens: 32768, maxTotalOutputTokens: 32768, maxInputBytes: 1000 } } });
    const next = { ...cp, objectKey: `derived/native-agent/${'e'.repeat(64)}.json`, serializedSha256: 'e'.repeat(64), size: 400,
      validatedFinal: { policy, rawCheckpoint: cp.serializedSha256, turnOrdinal: 1, resultToolCallId: 'result-1', responseHash: 'f'.repeat(64) } };
    return { ...f, cp, next };
  }
  it('terminal policy partition keeps the old no-marker/no-policy early return opaque', () => {
    const task = { result: { nativeImageReview: { historical: 'opaque' } } };
    const incoming = { assetId: 'preserved-old-image' };
    expect(nativeAgentTerminalResult(task as never, 'succeeded', incoming)).toBe(incoming);
  });
  it.each([undefined, null, 'unknown', policy])('terminal policy partition refuses orphan own envelope policy %s', value => {
    const task = { result: { nativeImageReview: { imageResultPolicy: value } } };
    expect(() => nativeAgentTerminalResult(task as never, 'succeeded', {})).toThrow();
  });
  it.each([undefined, null, 'unknown'])('terminal policy partition keeps invalid own marker policy %s closed', value => {
    const initialized = initialNativeAgentExecution(runtime, 'image-review')!;
    const task = { result: { ...initialized, nativeAgentExecution: { ...initialized.nativeAgentExecution, imageResultPolicy: value },
      nativeImageReview: { mode: 'model-native', state: 'not_started' } } };
    expect(() => nativeAgentTerminalResult(task as never, 'failed', {})).toThrow();
  });
  it('terminal policy partition refuses an envelope tag attached to a different decoded role', () => {
    const task = { result: { ...initialNativeAgentExecution(runtime), nativeImageReview: { imageResultPolicy: policy } } };
    expect(() => nativeAgentTerminalResult(task as never, 'failed', {})).toThrow();
  });
  it.each(['valid', 'missing-cp', 'cp-policy', 'review-hash', 'raw-link'] as const)('terminal policy partition retains tagged final proof: %s', change => {
    const f = imageFixture();
    const saved = f.task.result as unknown as { nativeAgentExecution: Record<string, unknown>; nativeImageReview: Record<string, unknown> };
    saved.nativeAgentExecution.checkpoint = structuredClone(f.next);
    Object.assign(saved.nativeImageReview, { state: 'completed', review: { stage: 'generated-image', ...f.cp.imageIdentity,
      ...f.cp.target, decision: 'accepted', summary: 'Matches the source.', repairInstruction: null,
      responseHash: change === 'review-hash' ? 'a'.repeat(64) : f.next.validatedFinal.responseHash } });
    if (change === 'missing-cp') delete saved.nativeAgentExecution.checkpoint;
    if (change === 'cp-policy') Reflect.deleteProperty(saved.nativeAgentExecution.checkpoint as object, 'imageResultPolicy');
    if (change === 'raw-link') (saved.nativeAgentExecution.checkpoint as typeof f.next).validatedFinal.rawCheckpoint = f.next.serializedSha256;
    if (change === 'valid') expect(nativeAgentTerminalResult(f.task as never, 'succeeded', { assetId: 'task' })).toHaveProperty('assetId', 'task');
    else expect(() => nativeAgentTerminalResult(f.task as never, 'succeeded', { assetId: 'task' })).toThrow();
  });
  it('requires explicit trusted image-only opt-in without upgrading legacy runtime objects', () => {
    expect(initialize(runtime, 'image-review', policy)?.nativeAgentExecution).toHaveProperty('imageResultPolicy', policy);
    expect(initialNativeAgentExecution({ ...runtime, imageResultPolicy: policy } as typeof runtime, 'image-review')?.nativeAgentExecution)
      .not.toHaveProperty('imageResultPolicy');
    for (const profile of ['paper-illustration', 'paper-author', 'paper-understanding', 'paper-source-review', 'journal-editor']) {
      expect(() => initialize(runtime, profile, policy)).toThrow();
      expect(() => readNativeAgentExecution({ nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile, imageResultPolicy: policy } })).toThrow();
    }
    expect(() => initialize(runtime, 'image-review', 'image-review-tool-final-v2')).toThrow();
  });
  it('finalizes the original raw CP under the current reclaimed task attempt after its model deadline', async () => {
    const f = imageFixture();
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 2, expected: f.cp as never,
      next: f.next as never, paidCompletion: false, validatedFinalization: true });
    expect(readNativeAgentExecution(f.task.result)?.checkpoint).toEqual(f.next);
    expect(f.task.result).toHaveProperty('nativeAgentObjects', [{ objectKey: f.cp.objectKey }]);
  });
  it('retains a definitely received raw-only paid reply after lease loss without inventing decoded facts', async () => {
    const f = imageFixture();
    const started = { ...f.cp } as Record<string, unknown>;
    started.state = 'started'; delete started.received; delete started.responseHash; delete started.finishReason; delete started.hasToolCalls;
    Object.assign(f.task.result.nativeAgentExecution!, { checkpoint: started });
    f.task.status = 'failed';
    const raw = { ...f.cp, serializedSha256: 'e'.repeat(64), objectKey: `derived/native-agent/${'e'.repeat(64)}.json`, received: 'raw-only' } as Record<string, unknown>;
    delete raw.responseHash; delete raw.finishReason; delete raw.hasToolCalls;
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: started as never,
      next: raw as never, paidCompletion: true });
    expect(readNativeAgentExecution(f.task.result)?.checkpoint).toEqual(raw);
    expect(raw).not.toHaveProperty('responseHash'); expect(raw).not.toHaveProperty('finishReason'); expect(raw).not.toHaveProperty('hasToolCalls');
  });
  it('does not reopen a tagged visual receipt as another paid turn', async () => {
    const f = imageFixture(); f.task.executionAttempt = 1;
    const next = { ...f.cp, state: 'started', turnCount: 3 } as Record<string, unknown>;
    delete next.received; delete next.responseHash; delete next.finishReason; delete next.hasToolCalls;
    const result = f.task.result as unknown as { nativeImageReview: { preparedAt: number; deadlineAt: number } };
    result.nativeImageReview.preparedAt = Date.now(); result.nativeImageReview.deadlineAt = result.nativeImageReview.preparedAt + 300000;
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: f.cp as never,
      next: next as never, paidCompletion: false })).rejects.toThrow();
  });
  it.each(['paid', 'stale-lease', 'task-stopped', 'raw-hash', 'target', 'turn', 'image', 'raw-link', 'existing-final', 'lost-cas'])(
    'refuses pure finalization on %s', async change => {
      const f = imageFixture();
      if (change === 'task-stopped') f.task.status = 'failed';
      if (change === 'raw-hash') f.next.responseHash = 'a'.repeat(64);
      if (change === 'target') f.next.target = { ...f.next.target, promptHash: 'a'.repeat(64) };
      if (change === 'turn') f.next.turnCount = 3;
      if (change === 'image') f.next.imageIdentity = { ...f.next.imageIdentity, parentIdentity: 'changed' };
      if (change === 'raw-link') f.next.validatedFinal.rawCheckpoint = 'a'.repeat(64);
      if (change === 'existing-final') Object.assign(f.cp, { validatedFinal: f.next.validatedFinal });
      if (change === 'lost-cas') f.mockTx.agentTask.updateMany = async () => ({ count: 0 });
      await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: change === 'stale-lease' ? 1 : 2,
        expected: f.cp as never, next: f.next as never, paidCompletion: change === 'paid', validatedFinalization: true })).rejects.toThrow();
    });
});
describe('image source explicit trig core receipts', () => {
  const imageContract = 'image-source-explicit-trig-v1';
  const imageResult = () => initialNativeAgentExecution(runtime, 'paper-illustration', imageContract)!;
  const imageFixture = () => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, imageResult());
    return f;
  };

  it('initializes and reads only the exact image capability on the illustration profile', () => {
    const expected = { nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile: 'paper-illustration', planningContract: imageContract } };
    const result = imageResult();
    expect(result).toEqual(expected);
    const read = readNativeAgentExecution(result)!;
    expect(read).toEqual(expected.nativeAgentExecution);
    expect(read).not.toBe(result.nativeAgentExecution);
    read.model = 'changed clone';
    expect(result.nativeAgentExecution.model).toBe(runtime.model);
  });

  it('does not opt an unmarked runtime or disabled installation into the image capability', () => {
    const historical = initialNativeAgentExecution(runtime, 'paper-illustration')!;
    expect(initialNativeAgentExecution({ ...runtime, planningContract: imageContract } as typeof runtime,
      'paper-illustration')).toEqual(historical);
    expect(historical.nativeAgentExecution).not.toHaveProperty('planningContract');
    expect(initialNativeAgentExecution(undefined, 'paper-illustration', imageContract)).toBeUndefined();
  });

  it.each(['image-source-explicit-trig-v2', 'IMAGE-source-explicit-trig-v1', 'image-source-explicit-trig-v1 '])(
    'rejects a non-exact image capability %s', planningContract => {
      const initialize = initialNativeAgentExecution as (...args: unknown[]) => unknown;
      expect(() => initialize(runtime, 'paper-illustration', planningContract)).toThrow('binding');
      const marker = initialNativeAgentExecution(runtime, 'paper-illustration')!.nativeAgentExecution;
      expect(() => readNativeAgentExecution({ nativeAgentExecution: { ...marker, planningContract } })).toThrow('binding');
    });

  it.each(['paper-understanding', 'paper-author', 'paper-source-review', 'journal-editor', 'image-review'] as const)(
    'never grants the image planning capability to %s', profile => {
      expect(() => initialNativeAgentExecution(runtime, profile, imageContract)).toThrow('binding');
      expect(() => readNativeAgentExecution({ nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile,
        planningContract: imageContract } })).toThrow();
    });

  it('retains the exact image capability through started, paid completion and terminal preservation', async () => {
    const f = imageFixture(), expectedExecution = readNativeAgentExecution(f.task.result)!;
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined,
      next: reference('started'), paidCompletion: false, expectedExecution });
    expect(readNativeAgentExecution(f.task.result)).toHaveProperty('planningContract', imageContract);
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'),
      next: reference('completed'), paidCompletion: true, expectedExecution });
    const marker = readNativeAgentExecution(f.task.result)!;
    expect(nativeAgentTerminalResult(f.task as never, 'failed', { reason: 'stopped' }))
      .toHaveProperty('nativeAgentExecution', marker);
    expect(() => nativeAgentTerminalResult(f.task as never, 'failed', {
      nativeAgentExecution: { ...marker, planningContract: 'video-optional-audio-v1' },
    })).toThrow('binding');
  });

  it.each(['remove', 'to-video', 'from-unmarked', 'from-video'] as const)(
    'rejects a changed authority marker before the checkpoint read: %s', async change => {
      const f = imageFixture();
      if (change === 'from-unmarked') delete f.task.result.nativeAgentExecution!.planningContract;
      if (change === 'from-video') f.task.result.nativeAgentExecution!.planningContract = 'video-optional-audio-v1';
      const expectedExecution = readNativeAgentExecution(f.task.result)!;
      if (change === 'remove') delete f.task.result.nativeAgentExecution!.planningContract;
      else f.task.result.nativeAgentExecution!.planningContract = change === 'to-video' ? 'video-optional-audio-v1' : imageContract;
      await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined,
        next: reference('started'), paidCompletion: false, expectedExecution })).rejects.toThrow('binding');
      expect(f.task.result.nativeAgentExecution).not.toHaveProperty('checkpoint');
    });

  it.each(['remove', 'to-video'] as const)('rejects image marker %s between read and CAS', async change => {
    const f = imageFixture(), update = f.mockTx.agentTask.updateMany;
    const expectedExecution = readNativeAgentExecution(f.task.result)!;
    f.mockTx.agentTask.findUnique = async () => structuredClone(f.task);
    f.mockTx.agentTask.updateMany = async args => {
      if (change === 'remove') delete f.task.result.nativeAgentExecution!.planningContract;
      else f.task.result.nativeAgentExecution!.planningContract = 'video-optional-audio-v1';
      return update(args);
    };
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined,
      next: reference('started'), paidCompletion: false, expectedExecution })).rejects.toThrow('binding');
    expect(f.task.result.nativeAgentExecution).not.toHaveProperty('checkpoint');
  });
});

describe('native Agent server-owned execution receipts', () => {
  it('reads the exact optional video contract without changing historical initialization', () => {
    const historical = initialNativeAgentExecution(runtime, 'paper-illustration')!;
    expect(historical.nativeAgentExecution).not.toHaveProperty('planningContract');
    const marked = { nativeAgentExecution: { ...historical.nativeAgentExecution, planningContract: 'video-optional-audio-v1' } };
    expect(readNativeAgentExecution(marked)).toEqual(marked.nativeAgentExecution);
    const initialize = initialNativeAgentExecution as (...args: unknown[]) => unknown;
    expect(initialize(runtime, 'paper-illustration', 'video-optional-audio-v1')).toEqual(marked);
    expect(initialNativeAgentExecution({ ...runtime, planningContract: 'video-optional-audio-v1' } as typeof runtime,
      'paper-illustration')).toEqual(historical);
  });
  it.each([null, undefined, '', 'video-optional-audio-v2', 1, {}, ['video-optional-audio-v1']])('rejects malformed planning contract %j', planningContract => {
    const marker = initialNativeAgentExecution(runtime, 'paper-illustration')!.nativeAgentExecution;
    expect(() => readNativeAgentExecution({ nativeAgentExecution: { ...marker, planningContract } })).toThrow('binding');
    const initialize = initialNativeAgentExecution as (...args: unknown[]) => unknown;
    expect(() => initialize(runtime, 'paper-illustration', planningContract)).toThrow('binding');
  });
  it.each(['paper-understanding', 'paper-author', 'paper-source-review', 'journal-editor', 'image-review'] as const)(
    'does not allow the video planning marker on %s', profile => {
      const initialize = initialNativeAgentExecution as (...args: unknown[]) => unknown;
      expect(() => initialize(runtime, profile, 'video-optional-audio-v1')).toThrow();
      expect(() => readNativeAgentExecution({ nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile,
        planningContract: 'video-optional-audio-v1' } })).toThrow();
    });
  it('preserves the full marked contract through started, paid completion and terminal adoption', async () => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, { nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile: 'paper-illustration',
      planningContract: 'video-optional-audio-v1' } });
    const expectedExecution = readNativeAgentExecution(f.task.result)!;
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined, next: reference('started'), paidCompletion: false, expectedExecution });
    expect(readNativeAgentExecution(f.task.result)).toHaveProperty('planningContract', 'video-optional-audio-v1');
    await compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: reference('started'), next: reference('completed'), paidCompletion: true, expectedExecution });
    const marker = readNativeAgentExecution(f.task.result)!;
    expect(nativeAgentTerminalResult(f.task as never, 'failed', { reason: 'stopped' })).toHaveProperty('nativeAgentExecution', marker);
    const changed = { ...marker }; delete changed.planningContract;
    expect(() => nativeAgentTerminalResult(f.task as never, 'failed', { nativeAgentExecution: changed })).toThrow('binding');
  });
  it('rejects a planning contract changed between the checkpoint read and result CAS', async () => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, { nativeAgentExecution: { ...runtime, kind: 'hermes-agent', profile: 'paper-illustration',
      planningContract: 'video-optional-audio-v1' } });
    const update = f.mockTx.agentTask.updateMany;
    f.mockTx.agentTask.findUnique = async () => structuredClone(f.task);
    f.mockTx.agentTask.updateMany = async args => {
      Reflect.deleteProperty(f.task.result.nativeAgentExecution!, 'planningContract');
      return update(args);
    };
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined,
      next: reference('started'), paidCompletion: false })).rejects.toThrow('binding');
    expect(f.task.result.nativeAgentExecution).not.toHaveProperty('checkpoint');
  });
  it.each(['add', 'remove'] as const)('rejects a marker %s before the CAS read when the caller supplies its original execution', async change => {
    const f = fixture(); f.task.kind = 'presentation.generate';
    Object.assign(f.task.result, initialNativeAgentExecution(runtime, 'paper-illustration'));
    if (change === 'remove') Object.assign(f.task.result.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    const expectedExecution = readNativeAgentExecution(f.task.result)!;
    if (change === 'add') Object.assign(f.task.result.nativeAgentExecution!, { planningContract: 'video-optional-audio-v1' });
    else delete f.task.result.nativeAgentExecution!.planningContract;
    await expect(compareNativeAgentCheckpoint(f.tx, { taskId: 'task', executionAttempt: 1, expected: undefined,
      next: reference('started'), paidCompletion: false, expectedExecution }))
      .rejects.toThrow('binding');
    expect(f.task.result.nativeAgentExecution).not.toHaveProperty('checkpoint');
  });
  it('routes native narrative video and explicit video bases to the same profile without upgrading legacy image revisions', () => {
    const payload = { kind: 'interactive_html', storyboard: { output: 'video', narrative: true } };
    expect(supportsNativeIllustration(payload)).toBe(true);
    expect(supportsNativeIllustration({ ...payload, storyboard: { output: 'video' } })).toBe(false);
    expect(supportsNativeIllustration({ ...payload, storyboard: { ...payload.storyboard, baseAssetId: 'old-plan', revisionSceneIndex: 2 } })).toBe(true);
    expect(supportsNativeIllustration({ ...payload, storyboard: { output: 'image', narrative: true, baseAssetId: 'old-plan' } })).toBe(false);
    expect(supportsNativeIllustration({ ...payload, storyboard: { ...payload.storyboard, revisionTaskId: 'old-task' } })).toBe(false);
    expect(supportsNativeIllustration({ ...payload, storyboard: { output: 'image', narrative: true } })).toBe(true);
  });
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
  it('accepts the bounded paper-author continuation budget without extending other native profiles', () => {
    const author = initialNativeAgentExecution(runtime, 'paper-author')!;
    author.nativeAgentExecution.checkpoint = reference('completed', 33);
    expect(readNativeAgentExecution(author)?.checkpoint?.turnCount).toBe(33);

    const illustration = initialNativeAgentExecution(runtime, 'paper-illustration')!;
    illustration.nativeAgentExecution.checkpoint = reference('completed', 33);
    expect(() => readNativeAgentExecution(illustration)).toThrow('binding');
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
