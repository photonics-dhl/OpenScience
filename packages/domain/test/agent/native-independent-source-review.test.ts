import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { fixture, fields } from './direct-source-review-fixture';
import { automaticIngestionReview, automaticIngestionReviewStage } from '../../src/ingestion/automatic-review';
import { ensureHermesIngestionReview, materializeHermesIngestion } from '../../src/ingestion/ingestion-service';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import { claimAgentTask, markTaskProgress, persistAgentTaskInTransaction } from '../../src/agent/agent';
import { compareNativeAgentCheckpoint, initialNativeAgentExecution, readNativeAgentExecution, requireNativeAgentExecutionAuthority,
  type NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { createHermesResearchRun, getHermesResearchRun, reconcileHermesResearchRuns, retryHermesGeneration } from '../../src/agent/research-run';

const runtime = { runtimeId: 'installed-native-28d', skillCatalogueId: 'project-catalogue-28d', model: 'MiniMax-M3' };
function authorFixture() {
  const f = fixture(); f.db.agentTasks.splice(1); f.db.agentSessions.splice(1); f.db.auditLogs.length = 0;
  const author = f.db.agentTasks[0]!;
  Object.assign(author, { executionAttempt: 1, retryCount: 0 });
  const cp = { taskId: author.id, objectKey: `derived/native-agent/${'c'.repeat(64)}.json`, serializedSha256: 'c'.repeat(64), size: 100,
    artifactId: f.ids.artifact, documentSha256: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64), executionAttempt: 1, turnCount: 3,
    state: 'completed', target: { provider: 'primary', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) },
    responseHash: 'e'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  Object.assign(author.result, { nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-author', ...runtime, checkpoint: cp },
    reviewedClaimSuggestions: [{ clientKey: 'claim', sourceField: 'method', kind: 'core', statement: 'A supported method',
      conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] });
  Object.assign(author.result.scientificReview, { kind: 'hermes_agent_review', contractVersion: '5', ...runtime, ...cp.target,
    responseHash: cp.responseHash, fieldReviews: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`, sourcePassageIds: ['P00001'], issues: [] })),
    draftClaims: [{ clientKey: 'claim', sourceField: 'method', kind: 'core', statement: 'A supported method', conditions: [], limitations: [],
      sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] });
  delete author.result.scientificReview.semanticStage;
  f.db.hermesResearchSteps.splice(1); f.db.hermesResearchSteps[0]!.agentTaskId = author.id;
  f.db.ingestionTasks[0]!.agentTaskId = author.id; f.db.hermesResearchRuns[0]!.status = 'awaiting_source_review';
  const source = { ...f.db.ingestionTasks[0]!, artifact: f.db.artifacts[0]!, agentTask: author };
  return { ...f, author, cp, source, deps: { ...f.deps, nativeAgentRuntime: runtime } };
}
async function storedAuthorFixture() {
  const f = authorFixture(); const objects = new Map<string, Buffer>();
  const storage = { headObject: async () => null,
    putObject: async (key: string, body: Buffer) => { objects.set(key, body); return { key, size: body.length, etag: 'test' }; },
    getObject: async (key: string) => ({ size: objects.get(key)!.length, body: Readable.from([objects.get(key)!]) }),
  } as unknown as StorageAdapter;
  const ref = await persistDocumentSourceMapReference(storage, { artifactId: f.ids.artifact, contentHash: 'a'.repeat(64),
    parser: { name: 'fixture', version: '1' }, pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'source', kind: 'paragraph',
      text: 'The source model has specified assumptions and conditions.', boundingBox: { x: 1, y: 1, width: 90, height: 90 },
      parser: { name: 'fixture', version: '1' }, transformations: [] }] }] }, 'succeeded');
  f.author.result.sourceMapRef = ref; f.cp.sourceMapHash = ref.serializedSha256;
  return { ...f, deps: { ...f.deps, storage } };
}
async function queuedFixture(lose = false) {
  const f = await storedAuthorFixture();
  const before = structuredClone(f.db);
  if (lose) vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
  const deps = f.deps;
  const request = ensureHermesIngestionReview(deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run });
  return { ...f, deps, request, before };
}
const initializationError = 'Native independent reviewer runtime or grant is unavailable';
async function initializationFailureFixture() {
  const f = await storedAuthorFixture();
  f.db.researchObjects[0]!.visibility = 'private';
  f.db.usageLedger.push({ id: 'author-debit', userId: f.input.actorId, resource: 'ai_credit', delta: -1,
    kind: 'consume', reason: 'Agent task reservation sdf.extract', idempotencyKey: `agent-task-reserve:${f.author.id}`,
    metadata: { taskId: f.author.id, kind: 'sdf.extract', policy: 'charged-on-submit' } });
  expect(await reconcileHermesResearchRuns({ ...f.deps, nativeAgentRuntime: undefined })).toMatchObject({ failed: 1, errors: 0 });
  expect(f.db.hermesResearchRuns[0]).toMatchObject({ status: 'failed', error: initializationError });
  return { ...f, input: { ...f.input, expectedVersion: f.db.hermesResearchRuns[0]!.version } };
}

describe('native reviewer initialization failure recovery', () => {
  it.each(['older-source', 'current-source', 'current-run'] as const)(
    'scopes existing versions to the current ingestion/run, allowing reuse of the same PDF (%s)', async origin => {
      const f = await initializationFailureFixture();
      const key = origin === 'current-run' ? `hermes-ingestion:${f.ids.run}:${f.ids.source}`
        : `ingestion-confirm:${origin === 'current-source' ? f.ids.source : 'older-ingestion'}`;
      f.db.commits.push({ id: 'saved-commit', researchObjectId: f.ids.ro, idempotencyKey: key });
      f.db.versions.push({ id: 'saved-version', researchObjectId: f.ids.ro, commitId: 'saved-commit', status: 'draft', versionNo: 1 });
      f.db.versionManifests.push({ id: 'saved-manifest', versionId: 'saved-version' });
      f.db.manifestEntries.push({ id: 'saved-entry', manifestId: 'saved-manifest', artifactId: f.ids.artifact, blobSha256: 'a'.repeat(64) });
      const before = structuredClone(f.db);
      const view = await getHermesResearchRun(f.deps, f.input);
      if (origin === 'older-source') {
        expect(view).toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-review-fresh' });
        await expect(retryHermesGeneration(f.deps, f.input)).resolves.toMatchObject({ status: 'awaiting_source_review' });
        expect(f.db.agentTasks).toEqual(before.agentTasks); expect(f.db.usageLedger).toEqual(before.usageLedger);
        expect(f.db.commits).toEqual(before.commits); expect(f.db.versions).toEqual(before.versions);
      } else {
        expect(view.canRetryGeneration).not.toBe(true);
        await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
        expect(f.db).toEqual(before);
      }
    });
  it('recovers the actual failed reconcile without rerunning or charging the paid author, then ensures one reviewer', async () => {
    const f = await initializationFailureFixture(); const before = structuredClone(f.db);
    const tx = vi.spyOn(f.prisma, '$transaction');
    expect(await getHermesResearchRun(f.deps, f.input)).toMatchObject({ canRetryGeneration: true,
      generationRecovery: 'source-review-fresh', chargeableAttempts: 1 });
    expect(await retryHermesGeneration(f.deps, f.input)).toMatchObject({ id: f.ids.run, status: 'awaiting_source_review',
      version: f.input.expectedVersion + 1, maxAgentTasks: 9, error: null });
    expect(tx).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 30_000 });
    expect(f.db.agentTasks).toEqual(before.agentTasks); expect(f.db.agentSessions).toEqual(before.agentSessions);
    expect(f.db.usageLedger).toEqual(before.usageLedger); expect(f.db.hermesResearchSteps).toEqual(before.hermesResearchSteps);
    expect(f.redis.lpush).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) expect(await ensureHermesIngestionReview(f.deps,
      { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run })).toBe('queued');
    expect(f.db.agentTasks).toHaveLength(2); expect(f.db.agentTasks[0]).toEqual(before.agentTasks[0]);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
    expect(readNativeAgentExecution(f.db.agentTasks[1]!.result)?.profile).toBe('paper-source-review');
  });
  it.each([false, true])('replays a lost response before eligibility despite current run progress (reviewer created=%s)', async progress => {
    const f = await initializationFailureFixture(); await retryHermesGeneration(f.deps, f.input);
    if (progress) await ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run });
    const before = structuredClone(f.db);
    expect(await retryHermesGeneration(f.deps, f.input)).toMatchObject({ id: f.ids.run, version: before.hermesResearchRuns[0]!.version });
    expect(f.db).toEqual(before);
  });
  it('rejects reuse of the receipt key with a changed request', async () => {
    const f = await initializationFailureFixture(); await retryHermesGeneration(f.deps, f.input);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: f.input.expectedVersion + 1 }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['membership', 'scope'] as const)('still rejects revoked %s on receipt replay', async change => {
    const f = await initializationFailureFixture(); await retryHermesGeneration(f.deps, f.input);
    if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
    else f.db.researchObjects[0]!.status = 'published';
    const before = structuredClone(f.db);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.db).toEqual(before);
  });
  it.each(['stale-version', 'lost-cas'] as const)('does not charge or write a receipt on %s', async change => {
    const f = await initializationFailureFixture(); const before = structuredClone(f.db);
    if (change === 'lost-cas') vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, { ...f.input,
      expectedVersion: f.input.expectedVersion - (change === 'stale-version' ? 1 : 0) })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(f.db).toEqual(before);
  });
  it.each(['error', 'budget', 'version', 'claims', 'stage', 'checkpoint', 'source', 'debit', 'reviewer-task', 'reviewer-session'] as const)(
    'does not advertise or perform initialization recovery when %s proof changes', async change => {
      const f = await initializationFailureFixture(); const run = f.db.hermesResearchRuns[0]!;
      const key = `ingestion-analysis-compose:${f.ids.source}:${f.author.id}:${f.author.id}:scientific-review-v4`;
      if (change === 'error') run.error = 'Another source failure';
      if (change === 'budget') run.maxAgentTasks = 11;
      if (change === 'version') run.versionId = 'existing-version';
      if (change === 'claims') run.sourceClaimIds = ['existing-claim'];
      if (change === 'stage') f.db.hermesResearchSteps.push({ ...f.db.hermesResearchSteps[0], id: 'other-stage', stage: 'storyboard' });
      if (change === 'checkpoint') f.db.agentTasks[0]!.result.nativeAgentExecution.checkpoint.finishReason = 'length';
      if (change === 'source') f.db.artifacts[0]!.blobSha256 = '9'.repeat(64);
      if (change === 'debit') f.db.usageLedger.find(row => row.kind === 'consume')!.delta = 0;
      if (change === 'reviewer-task') f.db.agentTasks.push({ ...f.db.agentTasks[0], id: 'reviewer', idempotencyKey: key });
      if (change === 'reviewer-session') f.db.agentSessions.push({ ...f.db.agentSessions[0], id: 'reviewer-session', idempotencyKey: `${key}:session` });
      const before = structuredClone(f.db);
      expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toThrow();
      expect(f.db).toEqual(before);
    });
  it('requires the audit sink before changing recovery state', async () => {
    const f = await initializationFailureFixture(); const before = structuredClone(f.db);
    await expect(retryHermesGeneration({ ...f.deps, audit: undefined }, f.input)).rejects.toThrow();
    expect(f.db).toEqual(before);
  });
});
async function runningFixture() {
  const f = await queuedFixture(); await f.request;
  const reviewer = f.db.agentTasks.at(-1)!;
  reviewer.status = 'running'; reviewer.executionAttempt = 1;
  f.db.ingestionTasks[0]!.state = 'parsing';
  const cp = { ...structuredClone(f.cp), taskId: reviewer.id, serializedSha256: 'f'.repeat(64), objectKey: `derived/native-agent/${'f'.repeat(64)}.json` };
  Object.assign(reviewer.result, { sourceMapRef: structuredClone(f.author.result.sourceMapRef) });
  reviewer.result.nativeAgentExecution.checkpoint = cp;
  Object.assign(f.prisma, { trashEntry: { findFirst: async () => null } });
  const findSource = f.prisma.ingestionTask.findUnique.bind(f.prisma.ingestionTask);
  Object.assign(f.prisma.ingestionTask, { findUnique: async (args: { where: { id?: string; agentTaskId?: string }; include?: unknown }) => {
    if (!args.where.agentTaskId) return findSource(args as never);
    const row = f.db.ingestionTasks.find(item => item.agentTaskId === args.where.agentTaskId);
    return row ? findSource({ ...args, where: { id: row.id } } as never) : null;
  } });
  const binding = { ownerTaskId: reviewer.id, ingestionTaskId: f.ids.source, failedTaskId: f.author.id, compositionTaskId: f.author.id, executionAttempt: 1 };
  const result = { ...structuredClone(f.author.result), scientificReview: { ...structuredClone(f.author.result.scientificReview),
    profile: 'paper-source-review', sourceAgentTaskId: f.author.id, ...cp.target, responseHash: cp.responseHash } };
  delete result.nativeAgentExecution; delete result.scientificReview.draftClaims;
  return { ...f, reviewer, reviewerCp: cp, binding, result };
}

const nativePreflightError = '[blocked] Native author science/source data changed';
async function nativePreflightFailureFixture() {
  const f = await runningFixture();
  delete f.reviewer.result.nativeAgentExecution.checkpoint;
  await markTaskProgress(f.deps, { taskId: f.reviewer.id, status: 'failed', expectedExecutionAttempt: 1, error: nativePreflightError });
  expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ failed: 1, errors: 0 });
  expect(f.db.hermesResearchRuns[0]).toMatchObject({ status: 'failed', error: nativePreflightError });
  expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'failed_blocked', error: nativePreflightError });
  expect(f.db.hermesResearchSteps.every(step => step.status === 'failed')).toBe(true);
  f.redis.lpush.mockClear();
  return { ...f, input: { ...f.input, expectedVersion: f.db.hermesResearchRuns[0]!.version, idempotencyKey: 'native-preflight-resume' } };
}

describe('native reviewer zero-submit preflight recovery', () => {
  it('resumes the original paid reviewer and restores normal execution authority only after a new claim', async () => {
    const f = await nativePreflightFailureFixture(); const before = structuredClone(f.db);
    await expect(requireHermesSourceReviewExecution(f.prisma as never, f.binding)).rejects.toThrow();
    expect(await getHermesResearchRun(f.deps, f.input)).toMatchObject({ canRetryGeneration: true,
      generationRecovery: 'source-review-fresh', chargeableAttempts: 0 });
    const transaction = vi.spyOn(f.prisma, '$transaction');
    expect(await retryHermesGeneration(f.deps, f.input)).toMatchObject({ id: f.ids.run, status: 'running',
      version: f.input.expectedVersion + 1, maxAgentTasks: 9 });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 30_000 });
    expect(f.db.agentTasks).toHaveLength(before.agentTasks.length); expect(f.db.agentSessions).toEqual(before.agentSessions);
    expect(f.db.agentTasks[0]).toEqual(before.agentTasks[0]); expect(f.db.usageLedger).toEqual(before.usageLedger);
    expect(f.db.agentTasks.at(-1)).toMatchObject({ id: f.reviewer.id, status: 'pending', retryCount: 0, executionAttempt: 1,
      result: before.agentTasks.at(-1)!.result });
    expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'queued', agentTaskId: f.reviewer.id, retryCount: 0 });
    expect(f.db.hermesResearchSteps).toHaveLength(2);
    expect(f.db.hermesResearchSteps.every(step => step.status === 'waiting' && step.agentTaskId === f.reviewer.id)).toBe(true);
    expect(f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_resume')?.metadata).toMatchObject({
      recovery: 'native_source_review_preflight', previousRunError: nativePreflightError, previousTaskError: nativePreflightError,
      agentTaskId: f.reviewer.id, previousExecutionAttempt: 1, chargeableAttempts: 0, creditPolicy: 'reuse-original-reservation' });
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    await expect(requireHermesSourceReviewExecution(f.prisma as never, f.binding)).rejects.toThrow();
    expect(await claimAgentTask(f.deps, f.reviewer.id)).toMatchObject({ status: 'running', executionAttempt: 2 });
    await expect(requireHermesSourceReviewExecution(f.prisma as never, { ...f.binding, executionAttempt: 2 }))
      .resolves.toMatchObject({ mode: 'agent', taskId: f.reviewer.id, sourceAgentTaskId: f.author.id });
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.reviewer.id, executionAttempt: 2 })).resolves.toBeDefined();
  });
  it.each([false, true])('replays before eligibility without another dispatch or debit (claimed=%s)', async claimed => {
    const f = await nativePreflightFailureFixture(); await retryHermesGeneration(f.deps, f.input);
    if (claimed) await claimAgentTask(f.deps, f.reviewer.id);
    const before = structuredClone(f.db);
    await expect(retryHermesGeneration(f.deps, f.input)).resolves.toMatchObject({ id: f.ids.run });
    expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: f.input.expectedVersion + 1 }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    f.db.memberships[0]!.role = 'viewer';
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['stale-version', 'task-cas', 'source-cas', 'step-cas', 'run-cas', 'audit-write'] as const)(
    'rolls back every recovery write and preserves the paid result on %s failure', async change => {
      const f = await nativePreflightFailureFixture(); const before = structuredClone(f.db);
      if (change === 'task-cas') vi.spyOn(f.prisma.agentTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'source-cas') vi.spyOn(f.prisma.ingestionTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'step-cas') vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'run-cas') vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'audit-write') vi.spyOn(f.prisma.auditLog, 'create').mockRejectedValueOnce(new Error('audit write unavailable'));
      await expect(retryHermesGeneration(f.deps, { ...f.input,
        expectedVersion: f.input.expectedVersion - (change === 'stale-version' ? 1 : 0) })).rejects.toThrow();
      expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    });
  it.each(['checkpoint', 'objects', 'gateway-call', 'author-cp', 'receipt', 'debit', 'lease', 'source-error', 'step', 'commit', 'recovery-receipt'] as const)(
    'fails closed on %s and never gives the ordinary binder recovery permissions', async change => {
      const f = await nativePreflightFailureFixture(); const task = f.db.agentTasks.at(-1)!;
      if (change === 'checkpoint') task.result.nativeAgentExecution.checkpoint = f.reviewerCp;
      if (change === 'objects') task.result.nativeAgentObjects = [{ objectKey: 'prior-native-object' }];
      if (change === 'gateway-call') f.db.auditLogs.push({ action: 'ai.gateway.call', requestId: task.id });
      if (change === 'author-cp') { f.cp.serializedSha256 = '9'.repeat(64); f.cp.objectKey = `derived/native-agent/${f.cp.serializedSha256}.json`; }
      if (change === 'receipt') f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh')!.metadata.reviewMode = 'web';
      if (change === 'debit') f.db.usageLedger.find(row => row.kind === 'consume')!.delta = 0;
      if (change === 'lease') task.executionAttempt = 2;
      if (change === 'source-error') f.db.ingestionTasks[0]!.error = 'different';
      if (change === 'step') f.db.hermesResearchSteps[0]!.status = 'succeeded';
      if (change === 'commit') f.db.commits.push({ id: 'adopted', idempotencyKey: `hermes-ingestion:${f.ids.run}:${f.ids.source}` });
      if (change === 'recovery-receipt') f.db.auditLogs.push({ action: 'hermes.research_run.source_review_resume',
        targetType: 'hermes_research_run', targetId: f.ids.run, actorId: f.input.actorId, workspaceId: 'workspace',
        metadata: { recovery: 'native_source_review_preflight', agentTaskId: task.id, clientIdempotencyKey: 'another-key' } });
      const before = structuredClone(f.db);
      expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toThrow();
      await expect(requireHermesSourceReviewExecution(f.prisma as never, f.binding)).rejects.toThrow();
      expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    });
});

describe('native independent author/reviewer domain contract', () => {
  it('rejects author automatic consumption and chooses the existing review stage without a semanticStage', () => {
    const f = authorFixture();
    expect(() => automaticIngestionReview(f.source)).toThrow();
    expect(automaticIngestionReviewStage(f.source)).toBe('source_review');
  });
  it('rejects author direct automatic materialization', async () => {
    const f = authorFixture();
    await expect(materializeHermesIngestion(f.deps as never, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run }))
      .rejects.toThrow('Native paper author requires independent source review');
    expect(f.db.commits).toHaveLength(0);
  });
  it('assigns author only to fresh ordinary tasks and preserves exact old-profile replay', async () => {
    const f = authorFixture(); f.author.result.nativeAgentExecution.profile = 'paper-understanding';
    const input = { sessionId: f.author.sessionId, userId: f.input.actorId, kind: 'sdf.extract', payload: f.author.payload, idempotencyKey: f.author.idempotencyKey };
    expect((await persistAgentTaskInTransaction(f.deps, f.prisma as never, input)).replayed).toBe(true);
    expect(readNativeAgentExecution(f.author.result)?.profile).toBe('paper-understanding');
    const fresh = await persistAgentTaskInTransaction(f.deps, f.prisma as never, { ...input, idempotencyKey: 'fresh-author' });
    expect(readNativeAgentExecution(fresh.task.result)?.profile).toBe('paper-author');
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });
  it('replays before runtime initialization or debit even with exhausted credit and invalid fresh runtime config', async () => {
    const f = authorFixture(); f.author.result.nativeAgentExecution.profile = 'paper-understanding';
    f.db.usageLedger[0]!.delta = 0;
    const deps = { ...f.deps, nativeAgentRuntime: { ...runtime, runtimeId: '' } };
    const before = structuredClone(f.author.result);
    const replay = await persistAgentTaskInTransaction(deps, f.prisma as never, { sessionId: f.author.sessionId,
      userId: f.input.actorId, kind: 'sdf.extract', payload: f.author.payload, idempotencyKey: f.author.idempotencyKey });
    expect(replay.replayed).toBe(true); expect(replay.task.result).toEqual(before);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(0);
  });
  it.each(['paper-author', 'paper-source-review'] as const)('uses existing paid checkpoint CAS and late-reply preservation for %s', async profile => {
    const f = authorFixture(); const task = f.author;
    task.status = 'running'; task.result = { ...initialNativeAgentExecution(runtime, profile), sourceMapRef: f.source.agentTask.result.sourceMapRef };
    const started: NativeAgentCheckpointReference = { ...f.cp, state: 'started', turnCount: 1 } as NativeAgentCheckpointReference;
    delete started.responseHash; delete started.finishReason; delete started.hasToolCalls;
    await compareNativeAgentCheckpoint(f.prisma as never, { taskId: task.id, executionAttempt: 1, expected: undefined, next: started, paidCompletion: false });
    task.status = 'failed'; task.executionAttempt = 2;
    const completed: NativeAgentCheckpointReference = { ...f.cp, turnCount: 1, state: 'completed', serializedSha256: 'f'.repeat(64),
      objectKey: `derived/native-agent/${'f'.repeat(64)}.json` } as NativeAgentCheckpointReference;
    await compareNativeAgentCheckpoint(f.prisma as never, { taskId: task.id, executionAttempt: 1, expected: started, next: completed, paidCompletion: true });
    expect(task.status).toBe('failed'); expect(readNativeAgentExecution(task.result)?.checkpoint).toEqual(completed);
    await expect(compareNativeAgentCheckpoint(f.prisma as never, { taskId: task.id, executionAttempt: 1, expected: completed,
      next: { ...started, turnCount: 2 }, paidCompletion: false })).rejects.toThrow();
  });
  it('keeps the historical paper-understanding result directly consumable without creating an independent role', () => {
    const f = authorFixture(); f.author.result.nativeAgentExecution.profile = 'paper-understanding';
    delete f.author.result.scientificReview.draftClaims;
    expect(automaticIngestionReviewStage(f.source)).toBe('ready');
    expect(automaticIngestionReview(f.source).agentTaskId).toBe(f.author.id);
  });
  it.each(['missing-cp', 'partial-cp', 'tool-calls', 'missing-fields', 'missing-claims', 'field-core-drift', 'claim-source-drift'] as const)(
    'never schedules a review from an invalid actual author candidate (%s)', change => {
      const f = authorFixture();
      if (change === 'missing-cp') delete f.author.result.nativeAgentExecution.checkpoint;
      if (change === 'partial-cp') f.cp.finishReason = 'length';
      if (change === 'tool-calls') f.cp.hasToolCalls = true;
      if (change === 'missing-fields') delete f.author.result.scientificReview.fieldReviews;
      if (change === 'missing-claims') delete f.author.result.scientificReview.draftClaims;
      if (change === 'field-core-drift') f.author.result.core.method = 'different';
      if (change === 'claim-source-drift') f.author.result.scientificReview.draftClaims[0].sourceBindings[0].sourcePassageId = 'P99999';
      expect(() => automaticIngestionReviewStage(f.source)).toThrow();
    });
  it.each([false, true])('creates the actual review stage atomically with one ordinary debit (CAS loss=%s)', async lose => {
    const f = await queuedFixture(lose);
    if (lose) { await expect(f.request).rejects.toThrow(); expect(f.db).toEqual(f.before); return; }
    expect(await f.request).toBe('queued');
    const reviewer = f.db.agentTasks.at(-1)!;
    expect(readNativeAgentExecution(reviewer.result)?.profile).toBe('paper-source-review');
    expect(reviewer.result).not.toHaveProperty('nativeSourceReview'); expect(reviewer.result).not.toHaveProperty('sourceResult');
    expect(f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh')?.metadata)
      .toMatchObject({ reviewMode: 'agent', reviewProfile: 'paper-source-review', authorCheckpointSha256: f.cp.serializedSha256 });
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run })).toBe('queued');
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    reviewer.status = 'running'; reviewer.executionAttempt = 1;
    const proof = await requireHermesSourceReviewExecution(f.prisma as never, { ownerTaskId: reviewer.id, ingestionTaskId: f.ids.source,
      failedTaskId: f.author.id, compositionTaskId: f.author.id, executionAttempt: 1 });
    expect(proof).toEqual({ mode: 'agent', taskId: reviewer.id, runId: f.ids.run, sourceAgentTaskId: f.author.id,
      authorCheckpointSha256: f.cp.serializedSha256, sourceMapRef: f.author.result.sourceMapRef, sourceResult: f.author.result });
  });
  it('runs actual create/reconcile/ensure from the new author through the existing max9 review phase', async () => {
    const f = await queuedFixture(); await f.request;
    // Reset only this test's generated review to exercise normal run creation from its actual author output.
    f.db.agentTasks.splice(1); f.db.agentSessions.splice(1); f.db.auditLogs.length = 0;
    f.db.hermesResearchSteps.length = 0; f.db.hermesResearchRuns.length = 0;
    f.db.ingestionTasks[0]!.agentTaskId = f.author.id; f.db.ingestionTasks[0]!.state = 'needs_review';
    f.db.researchObjects[0]!.visibility = 'private';
    Object.assign(f.prisma.hermesResearchRun, { findFirst: async ({ where }: { where: { actorId: string; researchObjectId: string; profile: string } }) =>
      f.db.hermesResearchRuns.find(row => row.actorId === where.actorId && row.researchObjectId === where.researchObjectId && row.profile === where.profile) ?? null });
    const run = await createHermesResearchRun(f.deps, { actorId: f.input.actorId, researchObjectId: f.ids.ro,
      ingestionTaskIds: [f.ids.source], idempotencyKey: 'native-independent-run', generation: {
        profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'auto', instruction: 'Explain the paper' } });
    for (const step of f.db.hermesResearchSteps) step.presentationAssetId ??= null;
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 1, errors: 0 });
    expect(f.db.hermesResearchRuns[0]!.status).toBe('awaiting_source_review');
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: run.id })).toBe('queued');
    expect(readNativeAgentExecution(f.db.agentTasks.at(-1)!.result)?.profile).toBe('paper-source-review');
    expect(f.db.hermesResearchRuns[0]!.maxAgentTasks).toBe(9);
  });
  it.each(['audit-mode', 'audit-profile', 'audit-source', 'audit-actor', 'audit-run', 'audit-duplicate', 'checkpoint', 'author-profile',
    'author-status', 'author-lease', 'author-fields', 'author-claims', 'source', 'source-map', 'run', 'step', 'budget', 'actor',
    'member', 'session', 'author-session', 'debit', 'lease', 'dual-marker'] as const)('denies %s drift at resolver and every Native authority', async change => {
    const f = await runningFixture();
    await expect(requireHermesSourceReviewExecution(f.prisma as never, f.binding)).resolves.toMatchObject({ mode: 'agent' });
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.reviewer.id, executionAttempt: 1 })).resolves.toBeDefined();
    const audit = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh')!;
    if (change === 'audit-mode') audit.metadata.reviewMode = 'model';
    if (change === 'audit-profile') audit.metadata.reviewProfile = 'paper-understanding';
    if (change === 'audit-source') audit.metadata.sourceMapSha256 = '9'.repeat(64);
    if (change === 'audit-actor') audit.metadata.authorizedByUserId = 'foreign';
    if (change === 'audit-run') audit.metadata.runId = 'foreign';
    if (change === 'audit-duplicate') f.db.auditLogs.push(structuredClone(audit));
    if (change === 'checkpoint') { f.cp.serializedSha256 = '9'.repeat(64); f.cp.objectKey = `derived/native-agent/${f.cp.serializedSha256}.json`; }
    if (change === 'author-profile') f.author.result.nativeAgentExecution.profile = 'paper-understanding';
    if (change === 'author-status') f.author.status = 'failed';
    if (change === 'author-lease') f.author.executionAttempt++;
    if (change === 'author-fields') delete f.author.result.scientificReview.fieldReviews.method;
    if (change === 'author-claims') delete f.author.result.scientificReview.draftClaims;
    if (change === 'source') f.db.artifacts[0]!.blobSha256 = '9'.repeat(64);
    if (change === 'source-map') f.reviewer.result.sourceMapRef.size++;
    if (change === 'run') f.db.hermesResearchRuns[0]!.status = 'cancelled';
    if (change === 'step') f.db.hermesResearchSteps[0]!.agentTaskId = 'foreign';
    if (change === 'budget') f.db.hermesResearchRuns[0]!.maxAgentTasks = 10;
    if (change === 'actor') f.db.hermesResearchRuns[0]!.actorId = 'foreign';
    if (change === 'member') f.db.memberships[0]!.role = 'viewer';
    if (change === 'session') f.db.agentSessions.at(-1)!.status = 'closed';
    if (change === 'author-session') f.db.agentSessions[0]!.status = 'closed';
    if (change === 'debit') f.db.usageLedger.find(row => row.kind === 'consume')!.delta = 0;
    if (change === 'lease') f.reviewer.executionAttempt++;
    if (change === 'dual-marker') f.reviewer.result.nativeSourceReview = { mode: 'model-native', attempts: [] };
    await expect(requireHermesSourceReviewExecution(f.prisma as never, f.binding)).rejects.toThrow();
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.reviewer.id, executionAttempt: 1 })).rejects.toThrow();
  });
  it.each(['unchanged', 'receipt-kind', 'receipt-profile', 'receipt-author', 'receipt-response', 'checkpoint', 'run', 'lease'] as const)(
    'adopts reviewer terminal under Serializable with current lineage (%s)', async change => {
      const f = await runningFixture(); const transaction = vi.spyOn(f.prisma, '$transaction');
      if (change === 'receipt-kind') f.result.scientificReview.kind = 'model_self_check';
      if (change === 'receipt-profile') f.result.scientificReview.profile = 'paper-author';
      if (change === 'receipt-author') f.result.scientificReview.sourceAgentTaskId = 'foreign';
      if (change === 'receipt-response') f.result.scientificReview.responseHash = '9'.repeat(64);
      if (change === 'checkpoint') { f.cp.serializedSha256 = '9'.repeat(64); f.cp.objectKey = `derived/native-agent/${f.cp.serializedSha256}.json`; }
      if (change === 'run') f.db.hermesResearchRuns[0]!.status = 'cancelled';
      if (change === 'lease') f.reviewer.executionAttempt++;
      const adoption = markTaskProgress(f.deps, { taskId: f.reviewer.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result });
      if (change === 'unchanged') {
        await expect(adoption).resolves.toMatchObject({ status: 'succeeded' });
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
      } else { await expect(adoption).rejects.toThrow(); expect(f.reviewer.status).toBe('running'); }
    });
  it.each(['unchanged', 'author-cp', 'signed-receipt', 'role', 'source'] as const)('requires exact reviewed lineage before ready and direct materialization (%s)', async change => {
    const f = await runningFixture();
    await markTaskProgress(f.deps, { taskId: f.reviewer.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result });
    f.db.hermesResearchRuns[0]!.status = 'awaiting_source_review';
    const updateSteps = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
    Object.assign(f.prisma.hermesResearchStep, { updateMany: async (args: { where: { id?: { in: string[] } }; data: Record<string, unknown> }) => {
      if (!args.where.id?.in) return updateSteps(args as never);
      const rows = f.db.hermesResearchSteps.filter(row => args.where.id!.in.includes(row.id));
      for (const row of rows) Object.assign(row, args.data); return { count: rows.length };
    } });
    if (change === 'author-cp') { f.cp.serializedSha256 = '9'.repeat(64); f.cp.objectKey = `derived/native-agent/${f.cp.serializedSha256}.json`; }
    if (change === 'signed-receipt') f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh')!.metadata.reviewMode = 'web';
    if (change === 'role') f.reviewer.result.nativeAgentExecution.profile = 'paper-understanding';
    if (change === 'source') f.db.artifacts[0]!.blobSha256 = '9'.repeat(64);
    const ready = ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run });
    if (change === 'unchanged') await expect(ready).resolves.toBe('ready');
    else {
      await expect(ready).rejects.toThrow();
      const commitRead = vi.spyOn(f.prisma.commit, 'findUnique');
      await expect(materializeHermesIngestion(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run }))
        .rejects.toThrow(change === 'source' ? 'source changed' : 'Native independent reviewer source lineage changed');
      expect(commitRead).not.toHaveBeenCalled(); expect(f.db.commits).toHaveLength(0);
    }
  });
});
