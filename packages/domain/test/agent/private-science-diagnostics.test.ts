import { describe, expect, it } from 'vitest';
import { getAgentTask, listAgentTasks, markTaskProgress, projectAgentTaskResult, retryAgentTask } from '../../src/agent/agent';
import { getIngestionTask } from '../../src/ingestion/ingestion-service';
import { initialNativeAgentExecution } from '../../src/agent/native-agent-execution';
import { fixture as historicalSourceFixture } from './direct-source-review-fixture';

it('projects only the minimal private audition playback DTO and keeps its grant, path, quote and provider identity server-side', () => {
  const stored = { purpose: 'audio-audition', inputHash: 'a'.repeat(64), audioAuditionGrant: { workerMaxEstimatedCoins: 200 },
    audioAudition: { taskId: 'task', sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'requires_revision',
      objectKey: 'presentation/private/audio.mp3', filePath: '/private/audition.mp3', audioTaskId: 'paid-provider-id',
      contentHash: 'b'.repeat(64), quote: { estimatedCoins: 22 }, coinsUsed: 22 } };
  const before = structuredClone(stored);
  expect(projectAgentTaskResult(stored, 'presentation.generate')).toEqual({ purpose: 'audio-audition', audioAudition: {
    taskId: 'task', sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'requires_revision',
  } });
  expect(stored).toEqual(before);
});

it('hides an authorized but not yet completed audition grant without manufacturing a playable result', () => {
  expect(projectAgentTaskResult({ audioAuditionGrant: { inputHash: 'secret-internal-binding' }, progressNote: 'Preparing narration' },
    'presentation.generate')).toEqual({ progressNote: 'Preparing narration' });
});

it.each([undefined, 'video', 'unknown'])('strips raw private audio metadata when the audition purpose is missing or wrong: %s', purpose => {
  const stored = { ...(purpose ? { purpose } : {}), progressNote: 'Preparing media',
    audioAudition: { objectKey: 'PRIVATE_OBJECT_KEY', filePath: 'PRIVATE_PATH', quote: { estimatedCoins: 22 } },
    audioAuditionGrant: { inputHash: 'PRIVATE_GRANT' } };
  expect(projectAgentTaskResult(stored, 'presentation.generate')).toEqual({ ...(purpose ? { purpose } : {}), progressNote: 'Preparing media' });
});

it('never projects private rejected scientific candidates into an API task result', () => {
  expect(projectAgentTaskResult({ assetId: 'asset', storyboardScienceDiagnostics: {
    candidates: [{ text: 'unreviewed private manuscript excerpt' }], sources: ['private source'],
  } }, 'presentation.generate')).toEqual({ assetId: 'asset' });
});

const privateCandidates = [{ text: 'PRIVATE_REJECTED_CANDIDATE', diagnostic: 'internal guard reason' }];
const privateOutputs = [{ text: 'PRIVATE_REJECTED_OUTPUT', attempt: 2, finishReason: 'length' }];
const privateDraftClaims = [{ statement: 'PRIVATE_UNREVIEWED_CLAIM' }];
const validReview = {
  status: 'review_received', contractVersion: '5', kind: 'model_self_check',
  fieldReviews: { method: { status: 'supported', summary: 'Grounded method' } },
  needsMoreEvidence: [], responseHash: 'c'.repeat(64), usage: { inputTokens: 20, outputTokens: 10 },
};
const sourceMapRef = {
  schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact-A', contentHash: 'a'.repeat(64),
  objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100,
};

for (const kind of ['sdf.extract', 'demo.echo']) {
  it.each([undefined, { invalid: true }, sourceMapRef])(`removes only private review diagnostics without mutating stored ${kind} results (sourceMapRef %j)`, reference => {
    const scientificReview = Object.freeze({ ...validReview, rejectedCandidates: privateCandidates,
      rejectedOutputs: privateOutputs, draftClaims: privateDraftClaims });
    const raw = Object.freeze({ core: { method: 'Original method' }, evidence: { method: { quote: 'Original evidence' } },
      scientificReview, ...(reference === undefined ? {} : { sourceMapRef: reference }) });
    const before = structuredClone(raw);
    const projected = projectAgentTaskResult(raw, kind)!;
    expect(projected.scientificReview).toEqual(validReview);
    expect(projected.scientificReview).not.toBe(scientificReview);
    expect(projected.core).toEqual(raw.core);
    expect(projected.evidence).toEqual(raw.evidence);
    expect(projected).not.toHaveProperty('sourceMapRef');
    expect(projected).not.toHaveProperty('sourceMapIdentity');
    expect(projected.sourceMapAvailable).toBe(reference === sourceMapRef ? true : undefined);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_REJECTED|PRIVATE_UNREVIEWED|rejectedCandidates|rejectedOutputs|draftClaims/);
    expect(raw).toEqual(before);
    expect(raw.scientificReview.rejectedCandidates).toBe(privateCandidates);
    expect(raw.scientificReview.rejectedOutputs).toBe(privateOutputs);
    expect(raw.scientificReview.draftClaims).toBe(privateDraftClaims);
  });

  it.each([null, 7, JSON.stringify({ rejectedOutputs: privateOutputs }), [{ rejectedCandidates: privateCandidates }]])(
    `omits malformed scientificReview rather than exposing embedded diagnostics for ${kind}: %j`, scientificReview => {
      const raw = { core: { method: 'Retained' }, scientificReview };
      expect(projectAgentTaskResult(raw, kind)).toEqual({ core: raw.core });
      expect(raw.scientificReview).toBe(scientificReview);
    },
  );
}

it.each(['get', 'list'] as const)('ordinary %s keeps its original Prisma access count for nonretryable rows', async operation => {
  const f = historicalSourceFixture();
  for (const task of f.db.agentTasks) Object.assign(task, {
    kind: 'demo.echo', status: 'succeeded', retryCount: 0, payload: {}, result: { echoed: task.id },
  });
  let reads = 0;
  Object.defineProperty(f.deps, 'prisma', { configurable: true, get: () => {
    if (++reads > 1) throw new Error('Unexpected ordinary retry dependency read');
    return f.prisma;
  } });
  const tasks = operation === 'get'
    ? [await getAgentTask(f.deps, { userId: f.input.actorId, taskId: f.ids.failed })]
    : await listAgentTasks(f.deps, { userId: f.input.actorId });
  expect(tasks.map(task => ({ id: task.id, result: task.result, canRetry: task.canRetry }))).toEqual(
    f.db.agentTasks.filter(task => operation === 'list' || task.id === f.ids.failed)
      .map(task => ({ id: task.id, result: { echoed: task.id }, canRetry: false })),
  );
  expect(reads).toBe(1);
});

it('actual ordinary historical consumers and succeeded retention preserve opaque extension values', async () => {
  const f = historicalSourceFixture();
  const task = f.db.agentTasks.find(row => row.id === f.ids.failed)!;
  const opaque = { selectedImageContext: { note: 'ordinary legacy extension' }, selectedImageReply: { text: 'ordinary legacy reply' },
    selectedImageReference: { note: 'ordinary legacy reference' }, selectedImageDraft: { values: [null, { text: 'ordinary legacy draft' }] } };
  Object.assign(task.result, structuredClone(opaque));
  const before = structuredClone(task.result);
  expect((await getAgentTask(f.deps, { userId: f.input.actorId, taskId: task.id })).result).toMatchObject(opaque);
  expect((await getIngestionTask(f.deps, { userId: f.input.actorId, taskId: f.ids.source })).task.result).toMatchObject(opaque);
  expect((await markTaskProgress(f.deps, { taskId: task.id, status: 'succeeded', result: { summary: 'must not replace history' } })).result).toMatchObject(opaque);
  expect(task.result).toEqual(before);
});

it('ordinary whole-result retry retains the same opaque values and original task identity', async () => {
  const f = historicalSourceFixture(), task = f.db.agentTasks.find(row => row.id === f.ids.failed)!;
  const opaque = { selectedImageContext: { note: 'ordinary retry extension' }, selectedImageReply: { text: 'ordinary retry reply' },
    selectedImageReference: { note: 'ordinary retry reference', assetId: 'opaque retry asset' },
    selectedImageDraft: { values: [null, { text: 'ordinary retry draft' }] } };
  const native = initialNativeAgentExecution({ runtimeId: 'installed', skillCatalogueId: 'installed', model: 'MiniMax-M3' }, 'paper-illustration');
  Object.assign(task, { kind: 'presentation.generate', payload: { kind: 'interactive_html', storyboard: { output: 'image' } },
    result: { ...native, ...structuredClone(opaque) },
    status: 'failed', error: 'Temporary processing failure', idempotencyKey: 'ordinary-retry' });
  const before = structuredClone({ id: task.id, sessionId: task.sessionId, payload: task.payload, result: task.result });
  const result = await retryAgentTask(f.deps, { userId: f.input.actorId, taskId: task.id });
  expect(result.id).toBe(task.id); expect(result.result).toEqual(opaque);
  expect({ id: task.id, sessionId: task.sessionId, payload: task.payload, result: task.result }).toEqual(before);
});

describe('task-bound selected projection', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const storyboardId = '00000000-0000-4000-8000-000000000011';
  const runtime = { runtimeId: 'installed-native', skillCatalogueId: 'installed-skills', model: 'MiniMax-M3' };
  function pending() {
    const binding = { researchObjectId: 'ro-A', versionId: 'version-A', assetId, contentHash: 'c'.repeat(64),
      objectKey: 'PRIVATE_PNG_OBJECT', mimeType: 'image/png', storyboardAssetId: storyboardId, parentIdentity: 'PRIVATE_PARENT_IDENTITY',
      parentContentHash: 'd'.repeat(64), sceneIndex: 0, sourceClaimIds: ['claim-A', 'claim-B'], sceneSourceClaimIds: ['claim-A'],
      sourceEvidenceIdentity: 'PRIVATE_SOURCE_EVIDENCE', claimContent: 'PRIVATE_CLAIMS', narrativeSourceIdentity: 'PRIVATE_PAPER_IDENTITY', sourceMapRef };
    const raw: Record<string, unknown> = { ...initialNativeAgentExecution(runtime, 'paper-illustration'), selectedImageContext: binding, sourceMapRef };
    const task = { id: 'selected-task-A', sessionId: 'session-A', kind: 'workspace.guide', executionAttempt: 0, result: raw,
      payload: { goal: 'Clarify the left connecting line', locale: 'en', route: 'research-object-edit', target: null,
        context: { tasks: [], researchObjects: [], presentation: { researchObjectId: binding.researchObjectId, versionId: binding.versionId, selectedImageAssetId: assetId } } } };
    return { binding, raw, task };
  }
  function checkpoint(f: ReturnType<typeof pending>, state: 'started' | 'completed' = 'completed') {
    const cp = { taskId: f.task.id, objectKey: `derived/native-agent/${'e'.repeat(64)}.json`, serializedSha256: 'e'.repeat(64),
      size: 100, artifactId: sourceMapRef.artifactId, documentSha256: sourceMapRef.contentHash, sourceMapHash: sourceMapRef.serializedSha256,
      executionAttempt: 1, turnCount: 1, state, target: { provider: 'PRIVATE_PROVIDER', model: runtime.model, promptHash: 'f'.repeat(64) },
      ...(state === 'completed' ? { responseHash: '9'.repeat(64), finishReason: 'stop', hasToolCalls: false } : {}) };
    Object.assign(f.raw.nativeAgentExecution as object, { checkpoint: cp }); f.task.executionAttempt = 1;
    return cp;
  }
  function hidden(result: Record<string, unknown> | null) {
    expect(result).not.toHaveProperty('selectedImageContext'); expect(result).not.toHaveProperty('selectedImageReply');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|objectKey|sourceBinding|replyToolCallId/);
  }
  it.each(['pending', 'started', 'uncertain', 'completed-before-adoption', 'failed-retry2', 'late'])(
    'keeps a valid minimal reference and hides private values for %s', state => {
      const f = pending();
      if (state !== 'pending') checkpoint(f, state === 'started' || state === 'uncertain' ? 'started' : 'completed');
      if (state === 'failed-retry2' || state === 'late') f.task.executionAttempt = 2;
      const before = structuredClone(f.raw), result = projectAgentTaskResult(f.raw, f.task.kind, f.task);
      hidden(result); expect(result?.selectedImageReference).toMatchObject({ assetId, versionId: 'version-A', sourceClaimIds: ['claim-A'] });
      expect(f.raw).toEqual(before);
    },
  );
  it.each(['question', 'explanation'] as const)('derives a bounded succeeded %s only from its exact stored source and paid target', kind => {
    const f = pending(), cp = checkpoint(f);
    f.raw.selectedImageReply = { kind, summary: 'A source-grounded answer.', sourceBinding: f.binding, target: cp.target,
      responseHash: '9'.repeat(64), replyToolCallId: 'actual-reply-tool-call' };
    Object.assign(f.raw, { summary: 'A source-grounded answer.', nextSteps: [], needsMoreInformation: kind === 'question' });
    const result = projectAgentTaskResult(f.raw, f.task.kind, f.task);
    hidden(result); expect(result?.selectedImageReference).toMatchObject({ assetId }); expect(result?.summary).toBe(f.raw.summary);
  });
  it.each(['missing-marker', 'bad-marker', 'missing-binding', 'bad-checkpoint', 'wrong-task', 'wrong-map', 'wrong-version',
    'null-request-member', 'wrong-kind', 'forged-public-reference', 'forged-public-draft', 'raw-A-context-B',
    'wrong-route', 'lost-scope', 'lost-context', 'lost-payload', 'wrong-row-kind', 'wrong-session', 'missing-row',
    'bad-private-binding', 'wrong-paid-target', 'future-checkpoint', 'wrong-source-claims'])(
    'quarantines %s without a decode-failure fallback or a public selected grant', change => {
      const f = pending();
      if (change === 'missing-marker') delete f.raw.nativeAgentExecution;
      if (change === 'bad-marker') f.raw.nativeAgentExecution = { kind: 'malformed', profile: 'paper-illustration' };
      if (change === 'missing-binding') delete f.raw.selectedImageContext;
      if (change === 'bad-checkpoint') Object.assign(f.raw.nativeAgentExecution as object, { checkpoint: { state: 'PRIVATE_UNCERTAIN' } });
      if (change === 'wrong-task') checkpoint(f).taskId = 'other-task';
      if (change === 'wrong-map') f.raw.sourceMapRef = { ...sourceMapRef, serializedSha256: '0'.repeat(64) };
      if (change === 'wrong-version') f.task.payload.context.presentation.versionId = 'other-version';
      if (change === 'null-request-member') Object.assign(f.task.payload.context.presentation, { selectedImageAssetId: null });
      if (change === 'wrong-kind') f.task.kind = 'sdf.extract';
      if (change === 'forged-public-reference') f.raw.selectedImageReference = { assetId: storyboardId, objectKey: 'PRIVATE_FORGED_REFERENCE' };
      if (change === 'forged-public-draft') f.raw.selectedImageDraft = { status: 'private-proposal', document: { text: 'PRIVATE_UNBOUND_DRAFT' } };
      if (change === 'raw-A-context-B') f.task.result = structuredClone(f.raw);
      if (change === 'wrong-route') f.task.payload.route = 'dashboard';
      if (change === 'lost-scope') Reflect.deleteProperty(f.task.payload.context, 'presentation');
      if (change === 'lost-context') Object.assign(f.task.payload, { context: null });
      if (change === 'lost-payload') Object.assign(f.task, { payload: null });
      if (change === 'wrong-session') f.task.sessionId = '';
      if (change === 'bad-private-binding') Object.assign(f.binding, { objectKey: null });
      if (change === 'wrong-paid-target') checkpoint(f).target.model = 'different-model';
      if (change === 'future-checkpoint') checkpoint(f).executionAttempt = 2;
      if (change === 'wrong-source-claims') f.binding.sourceClaimIds = ['unrelated'];
      const result = projectAgentTaskResult(f.raw, f.task.kind,
        change === 'missing-row' ? undefined : change === 'wrong-row-kind' ? { ...f.task, kind: 'sdf.extract' } : f.task);
      hidden(result); expect(result).not.toHaveProperty('selectedImageReference'); expect(result).not.toHaveProperty('selectedImageDraft');
    },
  );
  it('does not grant selected public DTOs through the old context-less call boundary', () => {
    const f = pending(), result = projectAgentTaskResult(f.raw, f.task.kind);
    hidden(result); expect(result).not.toHaveProperty('selectedImageReference');
  });
  it.each(['contextless', 'own-null', 'bad-marker', 'raw-A-row-B', 'contradictory-association'])(
    'hides all four sentinel fields for %s provenance', change => {
      const f = pending();
      Object.assign(f.raw, { selectedImageReply: { text: 'PRIVATE_SENTINEL_REPLY' },
        selectedImageReference: { note: 'PRIVATE_SENTINEL_REFERENCE' }, selectedImageDraft: { note: 'PRIVATE_SENTINEL_DRAFT' } });
      if (change === 'own-null') Object.assign(f.task.payload.context.presentation, { selectedImageAssetId: null });
      if (change === 'bad-marker') f.raw.nativeAgentExecution = { kind: 'malformed', profile: 'paper-illustration' };
      if (change === 'raw-A-row-B') f.task.result = structuredClone(f.raw);
      if (change === 'contradictory-association') Reflect.deleteProperty(f.task.payload.context.presentation, 'selectedImageAssetId');
      const result = projectAgentTaskResult(f.raw, f.task.kind, change === 'contextless' ? undefined : f.task);
      hidden(result); expect(result).not.toHaveProperty('selectedImageReference'); expect(result).not.toHaveProperty('selectedImageDraft');
    },
  );
  it('keeps an ordinary guide opaque extension only with the actual nonselected request', () => {
    const f = pending(); delete f.raw.nativeAgentExecution; delete f.raw.sourceMapRef;
    f.raw.selectedImageContext = { note: 'ordinary guide note' }; f.raw.selectedImageReply = { text: 'ordinary guide reply' };
    f.raw.selectedImageReference = { note: 'ordinary guide reference' }; f.raw.selectedImageDraft = { values: [null, 'ordinary guide draft'] };
    const payload = { ...f.task.payload, context: { ...f.task.payload.context, presentation: { researchObjectId: 'ro-A', versionId: 'version-A' } } };
    const task = { ...f.task, payload };
    expect(projectAgentTaskResult(f.raw, task.kind, task)).toEqual(f.raw);
  });
});
