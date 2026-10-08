import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { fixture, fields } from './direct-source-review-fixture';
import { automaticIngestionReview, automaticIngestionReviewStage } from '../../src/ingestion/automatic-review';
import { ensureHermesIngestionReview, materializeHermesIngestion } from '../../src/ingestion/ingestion-service';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { persistDocumentSourceMapReference, loadDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import { createBlockSourceLocator } from '../../src/research-intelligence/source-locator';
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
async function newRunAuthorFixture() {
  const f = await storedAuthorFixture();
  f.author.result.scientificReview.profile = 'paper-author';
  f.db.hermesResearchSteps.length = 0; f.db.hermesResearchRuns.length = 0;
  f.db.researchObjects[0]!.visibility = 'private';
  f.db.usageLedger.push({ id: 'author-debit', userId: f.input.actorId, resource: 'ai_credit', delta: -1,
    kind: 'consume', reason: 'Agent task reservation sdf.extract', idempotencyKey: `agent-task-reserve:${f.author.id}`,
    metadata: { taskId: f.author.id, kind: 'sdf.extract', policy: 'charged-on-submit' } });
  Object.assign(f.prisma.hermesResearchRun, { findFirst: async ({ where }: { where: { actorId: string; researchObjectId: string; profile: string } }) =>
    f.db.hermesResearchRuns.find(row => row.actorId === where.actorId && row.researchObjectId === where.researchObjectId && row.profile === where.profile) ?? null });
  const create = f.prisma.hermesResearchRun.create.bind(f.prisma.hermesResearchRun);
  vi.spyOn(f.prisma.hermesResearchRun, 'create').mockImplementation(async args => {
    const run = await create(args);
    // Mirror the database's nullable column defaults in the shared in-memory fixture.
    for (const step of f.db.hermesResearchSteps) step.presentationAssetId ??= null;
    for (const step of (run as unknown as { steps: Array<{ presentationAssetId: unknown }> }).steps) step.presentationAssetId ??= null;
    return run;
  });
  const updateSteps = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
  vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockImplementation(async args => {
    const ids = (args.where?.id as { in?: string[] } | undefined)?.in;
    if (!ids) return updateSteps(args);
    const rows = f.db.hermesResearchSteps.filter(step => ids.includes(step.id)
      && f.db.agentTasks.find(task => task.id === step.agentTaskId)?.status === 'succeeded');
    for (const row of rows) Object.assign(row, args.data);
    return { count: rows.length };
  });
  const request = { actorId: f.input.actorId, researchObjectId: f.ids.ro, ingestionTaskIds: [f.ids.source],
    idempotencyKey: 'new-native-author-run', generation: { profile: 'visual-narrative-v1' as const,
      maxAgentTasks: 9 as const, locale: 'en' as const, style: 'auto', instruction: 'Explain the paper' } };
  return { ...f, request };
}
async function waitingAuthorFixture(output?: 'video') {
  const f = await newRunAuthorFixture(); const completed = structuredClone(f.author.result);
  if (output) Object.assign(f.deps, { videoEnabled: true, readVideoReadiness: async () => true });
  f.author.status = 'running'; f.author.result = initialNativeAgentExecution(runtime, 'paper-author');
  f.db.ingestionTasks[0]!.state = 'parsing';
  const request = output ? { ...f.request, generation: { ...f.request.generation, output } } : f.request;
  const run = await createHermesResearchRun(f.deps, request); f.ids.run = run.id;
  f.author.status = 'succeeded'; f.author.result = completed; f.db.ingestionTasks[0]!.state = 'needs_review';
  expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 1, errors: 0 });
  return { ...f, run };
}

describe('new automatic runs use the existing independent Native reviewer', () => {
  it('does not pay for a reviewer when video readiness closes after the author starts', async () => {
    const f = await newRunAuthorFixture(); let ready = true;
    Object.assign(f.deps, { videoEnabled: true, readVideoReadiness: async () => ready });
    const completedAuthor = structuredClone(f.author.result);
    f.author.status = 'running'; f.author.result = initialNativeAgentExecution(runtime, 'paper-author');
    f.db.ingestionTasks[0]!.state = 'parsing';
    const request = { ...f.request, generation: { ...f.request.generation, output: 'video' as const } };
    const run = await createHermesResearchRun(f.deps, request); f.ids.run = run.id;
    const before = { tasks: f.db.agentTasks.length, ledger: f.db.usageLedger.length };
    ready = false;
    f.author.status = 'succeeded'; f.author.result = completedAuthor; f.db.ingestionTasks[0]!.state = 'needs_review';
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.agentTasks).toHaveLength(before.tasks);
    expect(f.db.usageLedger).toHaveLength(before.ledger);
    expect(await getHermesResearchRun(f.deps, { actorId: f.input.actorId, researchObjectId: f.ids.ro, runId: run.id }))
      .toMatchObject({ id: run.id, generationHold: 'video-api-pending' });
    const paused = structuredClone(f.db);
    await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, runId: run.id, taskId: f.ids.source }))
      .rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(f.db).toEqual(paused);
    ready = true;
    f.db.hermesResearchRuns.find(row => row.id === run.id)!.lastReconciledAt = new Date(0);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.agentTasks).toHaveLength(before.tasks + 1);
    expect(f.db.usageLedger).toHaveLength(before.ledger + 1);
    expect(readNativeAgentExecution(f.db.agentTasks.at(-1)!.result)?.profile).toBe('paper-source-review');
    await ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, runId: run.id, taskId: f.ids.source });
    expect(f.db.agentTasks).toHaveLength(before.tasks + 1);
    expect(f.db.usageLedger).toHaveLength(before.ledger + 1);
  });

  it('atomically creates a real reviewer and canonical steps while preserving the paid author self-check', async () => {
    const f = await newRunAuthorFixture(); const author = structuredClone(f.author);
    const tx = vi.spyOn(f.prisma, '$transaction');
    const run = await createHermesResearchRun(f.deps, f.request);
    const reviewer = f.db.agentTasks.at(-1)!;
    expect(reviewer.id).not.toBe(author.id);
    expect(readNativeAgentExecution(reviewer.result)?.profile).toBe('paper-source-review');
    expect(f.db.agentTasks[0]).toEqual(author);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
    expect(run).toMatchObject({ status: 'running', maxAgentTasks: 9, steps: [
      { stage: 'source_ingestion', agentTaskId: reviewer.id, status: 'waiting' },
      { stage: 'source_review', agentTaskId: reviewer.id, status: 'waiting' },
    ] });
    expect(tx).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'queued', agentTaskId: reviewer.id });
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });
  it('returns the same persisted run without creating or charging another reviewer on request replay', async () => {
    const f = await newRunAuthorFixture(); const run = await createHermesResearchRun(f.deps, f.request);
    const before = structuredClone(f.db);
    expect(await createHermesResearchRun(f.deps, f.request)).toEqual(run);
    expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });
  it('rolls back the run, reviewer, session, debit and source change when the reviewer receipt fails', async () => {
    const f = await newRunAuthorFixture(); const before = structuredClone(f.db);
    const audit = f.deps.audit!.record.bind(f.deps.audit);
    vi.spyOn(f.deps.audit!, 'record').mockImplementation(async (event, tx) => {
      if (event.action === 'ingestion.task.system_analysis_refresh') throw new Error('receipt unavailable');
      return audit(event, tx);
    });
    await expect(createHermesResearchRun(f.deps, f.request)).rejects.toThrow('receipt unavailable');
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
  it('does not replace an already recorded historical run whose author was consumed directly', async () => {
    const f = await newRunAuthorFixture();
    const legacy = await createHermesResearchRun(f.deps, { ...f.request, generation: undefined });
    Object.assign(f.db.hermesResearchRuns[0]!, { profile: f.request.generation.profile, maxAgentTasks: 9,
      generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper' },
      requestDigest: createHash('sha256').update(JSON.stringify({ actorId: f.request.actorId, researchObjectId: f.request.researchObjectId,
        ingestionTaskIds: f.request.ingestionTaskIds, generation: f.request.generation })).digest('hex') });
    const before = structuredClone(f.db);
    expect(await createHermesResearchRun(f.deps, f.request)).toMatchObject({ id: legacy.id, steps: legacy.steps });
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
  it('commits before dispatching and preserves the durable outbox when dispatch fails', async () => {
    const f = await newRunAuthorFixture();
    const transaction = f.prisma.$transaction.bind(f.prisma); let committed = false;
    vi.spyOn(f.prisma, '$transaction').mockImplementation(async (...args) => {
      const result = await transaction(...args); committed = true; return result;
    });
    f.redis.lpush.mockImplementationOnce(async () => { expect(committed).toBe(true); throw new Error('queue unavailable'); });
    await expect(createHermesResearchRun(f.deps, f.request)).rejects.toThrow('queue unavailable');
    expect(f.db.agentTasks).toHaveLength(2);
    expect(f.db.agentTasks[1]!).toMatchObject({ status: 'pending', dispatchedAt: null });
    const before = structuredClone(f.db);
    await expect(createHermesResearchRun(f.deps, f.request)).resolves.toMatchObject({ id: f.db.hermesResearchRuns[0]!.id });
    expect(f.db).toEqual(before);
  });
  it('serializes concurrent same-key requests into one reviewer and ordinary debit', async () => {
    const f = await newRunAuthorFixture();
    const results = await Promise.all([createHermesResearchRun(f.deps, f.request), createHermesResearchRun(f.deps, f.request)]);
    expect(results[0]!.id).toBe(results[1]!.id); expect(f.db.agentTasks).toHaveLength(2);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
  });
  it.each(['pending', 'running'] as const)('waits for the %s Native author without transferring its source, then initializes exactly one reviewer', async status => {
    const f = await newRunAuthorFixture(); const completed = structuredClone(f.author.result);
    f.author.status = status; f.author.result = initialNativeAgentExecution(runtime, 'paper-author');
    f.db.ingestionTasks[0]!.state = status === 'pending' ? 'queued' : 'parsing';
    const beforeLedger = structuredClone(f.db.usageLedger);
    const run = await createHermesResearchRun(f.deps, f.request); f.ids.run = run.id;
    expect(run.steps).toMatchObject([
      { stage: 'source_ingestion', agentTaskId: f.author.id, status: 'waiting' },
      { stage: 'source_review', agentTaskId: null, status: 'waiting' },
    ]);
    expect(f.db.agentTasks).toHaveLength(1); expect(f.db.usageLedger).toEqual(beforeLedger);
    expect(f.redis.lpush).not.toHaveBeenCalled();
    expect(f.db.ingestionTasks[0]!.agentTaskId).toBe(f.author.id);
    expect(await createHermesResearchRun(f.deps, f.request)).toEqual(run);
    f.author.status = 'running';
    const findSource = f.prisma.ingestionTask.findUnique.bind(f.prisma.ingestionTask);
    vi.spyOn(f.prisma.ingestionTask, 'findUnique').mockImplementation(args => {
      const agentTaskId = args.where.agentTaskId;
      if (!agentTaskId) return findSource(args);
      const source = f.db.ingestionTasks.find(row => row.agentTaskId === agentTaskId);
      return source ? findSource({ ...args, where: { id: source.id } }) : Promise.resolve(null);
    });
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.author.id, executionAttempt: 1 })).resolves.toBeDefined();
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ errors: 0, advanced: 0, failed: 0 });
    f.author.status = 'succeeded'; f.author.result = completed; f.db.ingestionTasks[0]!.state = 'needs_review';
    for (let i = 0; i < 2 && f.db.agentTasks.length === 1; i++)
      expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ errors: 0, failed: 0 });
    expect(f.db.agentTasks).toHaveLength(2); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
    const reviewer = f.db.agentTasks[1]!;
    expect(readNativeAgentExecution(reviewer.result)?.profile).toBe('paper-source-review');
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review')).toHaveLength(1);
    expect(f.db.hermesResearchSteps.find(step => step.stage === 'source_ingestion')!.agentTaskId).toBe(reviewer.id);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.agentTasks).toHaveLength(2); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    const execution = runningReviewerFixture(f);
    await expect(requireHermesSourceReviewExecution(f.prisma as never, execution.binding)).resolves.toMatchObject({ mode: 'agent' });
  });
  it('serializes completion polling into one reviewer and fills the original waiting phase', async () => {
    const f = await waitingAuthorFixture(); const phaseId = f.db.hermesResearchSteps.find(step => step.stage === 'source_review')!.id;
    const input = { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source };
    await Promise.all([ensureHermesIngestionReview(f.deps, input), ensureHermesIngestionReview(f.deps, input)]);
    expect(f.db.agentTasks).toHaveLength(2); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review')).toHaveLength(1);
    expect(f.db.hermesResearchSteps.find(step => step.id === phaseId)!.agentTaskId).toBe(f.db.agentTasks[1]!.id);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });
  it('does not charge a direct reviewer while video readiness is closed', async () => {
    const f = await waitingAuthorFixture('video');
    const readVideoReadiness = vi.fn(async () => false);
    const deps = { ...f.deps, videoEnabled: true, readVideoReadiness };
    const input = { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source };
    await expect(ensureHermesIngestionReview(deps, input)).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(readVideoReadiness).toHaveBeenCalled();
    expect(f.db.agentTasks).toHaveLength(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    readVideoReadiness.mockResolvedValue(true);
    expect(await ensureHermesIngestionReview(deps, input)).toBe('queued');
    expect(f.db.agentTasks).toHaveLength(2);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(2);
  });
  it.each(['ordinal', 'source', 'artifact', 'error', 'asset', 'duplicate', 'foreign-task', 'family', 'checkpoint',
    'membership', 'phase-cas', 'source-cas', 'run-cas', 'audit'] as const)(
    'rejects %s drift without a reviewer debit or source transfer when filling the waiting phase', async change => {
      const f = await waitingAuthorFixture(); const phase = f.db.hermesResearchSteps.find(step => step.stage === 'source_review')!;
      if (change === 'ordinal') phase.ordinal = 1;
      if (change === 'source') phase.ingestionTaskId = 'foreign';
      if (change === 'artifact') phase.artifactId = 'foreign';
      if (change === 'error') phase.error = 'changed';
      if (change === 'asset') phase.presentationAssetId = 'foreign';
      if (change === 'duplicate') f.db.hermesResearchSteps.push({ ...phase, id: 'duplicate' });
      if (change === 'foreign-task') phase.agentTaskId = 'foreign';
      if (change === 'family') f.author.result.nativeAgentExecution.profile = 'paper-understanding';
      if (change === 'checkpoint') f.author.result.nativeAgentExecution.checkpoint.finishReason = 'length';
      if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
      if (change === 'phase-cas') {
        const update = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
        vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockImplementation(args =>
          args.where?.agentTaskId === null ? Promise.resolve({ count: 0 }) : update(args));
      }
      if (change === 'source-cas') vi.spyOn(f.prisma.ingestionTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'run-cas') vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'audit') {
        const audit = f.deps.audit!.record.bind(f.deps.audit);
        vi.spyOn(f.deps.audit!, 'record').mockImplementation(async (event, tx) => {
          if (event.action === 'ingestion.task.system_analysis_refresh') throw new Error('receipt unavailable');
          return audit(event, tx);
        });
      }
      const before = structuredClone(f.db);
      await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source })).rejects.toThrow();
      expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    });
  it('preserves a failed author and leaves the waiting reviewer uncharged', async () => {
    const f = await newRunAuthorFixture();
    f.author.status = 'running'; f.author.result = initialNativeAgentExecution(runtime, 'paper-author');
    f.db.ingestionTasks[0]!.state = 'parsing';
    await createHermesResearchRun(f.deps, f.request); const ledger = structuredClone(f.db.usageLedger);
    f.author.status = 'failed'; f.author.error = 'author failed';
    f.db.ingestionTasks[0]!.state = 'failed_blocked'; f.db.ingestionTasks[0]!.error = f.author.error;
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ failed: 1, errors: 0 });
    expect(f.db.agentTasks).toHaveLength(1); expect(f.db.usageLedger).toEqual(ledger);
    expect(f.db.hermesResearchRuns[0]!.status).toBe('failed'); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
  it.each(['checkpoint', 'author-response', 'source-map', 'map-bytes', 'membership', 'session', 'source-cas', 'run-cas',
    'reviewer-cas', 'runtime', 'storage', 'audit', 'other-run'] as const)(
    'does not leave a new run or debit when %s proof changes', async change => {
      const f = await newRunAuthorFixture();
      if (change === 'checkpoint') f.cp.finishReason = 'length';
      if (change === 'author-response') f.author.result.scientificReview.responseHash = '9'.repeat(64);
      if (change === 'source-map') f.db.artifacts[0]!.blobSha256 = '9'.repeat(64);
      if (change === 'map-bytes') vi.spyOn(f.deps.storage, 'getObject').mockResolvedValue({ size: 3, body: Readable.from([Buffer.from('bad')]) });
      if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
      if (change === 'session') f.db.agentSessions[0]!.status = 'closed';
      if (change === 'source-cas') vi.spyOn(f.prisma.ingestionTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'run-cas') vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'reviewer-cas') vi.spyOn(f.prisma.agentTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
      if (change === 'other-run') vi.spyOn(f.prisma.hermesResearchStep, 'findFirst').mockResolvedValueOnce({ id: 'foreign-run-step' } as never);
      const deps = { ...f.deps, ...(change === 'runtime' ? { nativeAgentRuntime: undefined } : {}),
        ...(change === 'storage' ? { storage: undefined } : {}), ...(change === 'audit' ? { audit: undefined } : {}) };
      const before = structuredClone(f.db);
      await expect(createHermesResearchRun(deps, f.request)).rejects.toThrow();
      expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    });
  it('binds the reviewer to an author with a self-check and adopts only the actual independent terminal result', async () => {
    const f = await newRunAuthorFixture(); const original = structuredClone(f.author);
    const run = await createHermesResearchRun(f.deps, f.request); f.ids.run = run.id;
    const review = runningReviewerFixture(f);
    await expect(requireHermesSourceReviewExecution(f.prisma as never, review.binding)).resolves.toMatchObject({ mode: 'agent' });
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: review.reviewer.id, executionAttempt: 1 })).resolves.toBeDefined();
    await markTaskProgress(f.deps, { taskId: review.reviewer.id, status: 'succeeded', expectedExecutionAttempt: 1, result: review.result });
    await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: run.id })).resolves.toBe('ready');
    expect(f.db.agentTasks[0]).toEqual(original);
    expect(f.db.agentTasks[1]!.result.scientificReview).toMatchObject({ profile: 'paper-source-review', sourceAgentTaskId: original.id });
  });
  it('continues from the independent result to private Claims and a Native plan, then holds before any image task', async () => {
    const f = await newRunAuthorFixture();
    const map = await loadDocumentSourceMapReference(f.deps.storage, f.author.result.sourceMapRef);
    const quote = map.pages[0]!.blocks[0]!.text!;
    const locator = createBlockSourceLocator(map, 'source', { charRange: { start: 0, end: quote.length } });
    Object.assign(f.author.result, { core: { schemaVersion: '0.1.0', ...fields(() => quote) },
      evidence: fields(() => ({ quote, locator: 'passages:P00001' })),
      evidenceSegments: fields(() => [{ quote, sourceLocator: locator }]),
      evidenceLocation: fields(() => ({ status: 'located', matching: 'exact', sourceLocator: locator })),
    });
    f.author.result.scientificReview.fieldReviews = fields(() => ({ verdict: 'accepted', summary: quote, sourcePassageIds: ['P00001'], issues: [] }));
    f.author.result.scientificReview.draftClaims[0].statement = quote; f.author.result.reviewedClaimSuggestions[0].statement = quote;
    Object.assign(f.db.researchObjects[0]!, { version: 1 });
    f.db.sdfDocuments.push({ id: 'doc', researchObjectId: f.ids.ro, coreJson: f.author.result.core });
    f.db.sdfNodes.push(...Object.keys(f.author.result.scientificReview.fieldReviews).map(nodeType => ({ id: `node-${nodeType}`, sdfDocumentId: 'doc', nodeType, content: quote })));
    f.db.branches.push({ id: 'main-branch', researchObjectId: f.ids.ro, name: 'main', headCommitId: null });
    Object.assign(f.prisma.evidenceRecord, { createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      f.db.evidenceRecords.push(...data); return { count: data.length };
    } });
    const deps = { ...f.deps, nativeSceneImageEnabled: false };
    const completed = structuredClone(f.author.result);
    f.author.status = 'running'; f.author.result = initialNativeAgentExecution(runtime, 'paper-author');
    f.db.ingestionTasks[0]!.state = 'parsing';
    const run = await createHermesResearchRun(deps, f.request); f.ids.run = run.id;
    f.author.status = 'succeeded'; f.author.result = completed; f.db.ingestionTasks[0]!.state = 'needs_review';
    for (let i = 0; i < 2; i++) expect(await reconcileHermesResearchRuns(deps)).toMatchObject({ errors: 0, failed: 0 });
    const review = runningReviewerFixture(f);
    await markTaskProgress(deps, { taskId: review.reviewer.id, status: 'succeeded', expectedExecutionAttempt: 1, result: review.result });
    for (let i = 0; i < 3 && f.db.hermesResearchRuns[0]!.status !== 'awaiting_claim_review'; i++) {
      expect(await reconcileHermesResearchRuns(deps)).toMatchObject({ errors: 0, failed: 0, stopped: 0 });
    }
    expect(f.db.hermesResearchRuns[0]!).toMatchObject({ status: 'awaiting_claim_review', maxAgentTasks: 9 });
    expect(f.db.ingestionTasks[0]!).toMatchObject({ state: 'confirmed', agentTaskId: review.reviewer.id });
    expect(f.db.claimNodes).toHaveLength(1); expect(f.db.evidenceRecords).toHaveLength(1);
    expect(await reconcileHermesResearchRuns(deps)).toMatchObject({ errors: 0, advanced: 1 });
    const planner = f.db.agentTasks.find(task => task.kind === 'presentation.generate')!;
    expect(readNativeAgentExecution(planner.result)?.profile).toBe('paper-illustration');
    expect(planner.payload.hermesRunAuthority).toMatchObject({ runId: run.id, stage: 'storyboard', profile: 'visual-narrative-v1' });
    // Complete only the fixture's planner. This tests orchestration and cannot prove scientific/art quality.
    planner.status = 'succeeded';
    const row = f.db.hermesResearchRuns[0]!;
    f.db.presentationAssets.push({ id: planner.id, researchObjectId: f.ids.ro, versionId: row.versionId, kind: 'interactive_html',
      status: 'draft', contentHash: 'fixture-plan', provenance: {}, createdAt: new Date(), updatedAt: new Date() });
    for (const claimId of row.sourceClaimIds) f.db.presentationAssetClaims.push({ presentationAssetId: planner.id,
      claimId, researchObjectId: f.ids.ro, versionId: row.versionId });
    expect(await reconcileHermesResearchRuns(deps)).toMatchObject({ errors: 0, advanced: 1 });
    expect(await getHermesResearchRun(deps, { actorId: f.input.actorId, researchObjectId: f.ids.ro, runId: run.id }))
      .toMatchObject({ status: 'awaiting_storyboard_review', generationHold: 'image-api-pending' });
    const beforeTasks = structuredClone(f.db.agentTasks); const beforeLedger = structuredClone(f.db.usageLedger);
    await reconcileHermesResearchRuns(deps);
    f.db.presentationAssets[0]!.status = 'approved';
    await reconcileHermesResearchRuns(deps);
    expect(f.db.agentTasks).toEqual(beforeTasks); expect(f.db.usageLedger).toEqual(beforeLedger);
    expect(f.db.hermesResearchSteps.some(step => step.stage === 'scene_image')).toBe(false);
    expect(f.db.hermesResearchRuns[0]!.status).toBe('awaiting_storyboard_review');
  });
});
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
  it('projects a readiness hold for failed video source initialization recovery without changing its paid history', async () => {
    const f = await initializationFailureFixture();
    f.db.hermesResearchRuns[0]!.generationSettings = { locale: 'en', style: 'auto', instruction: 'Explain the paper', output: 'video' };
    const readVideoReadiness = vi.fn(async () => false);
    const deps = { ...f.deps, videoEnabled: true, readVideoReadiness };
    const before = structuredClone(f.db);
    const closed = await getHermesResearchRun(deps, f.input);
    expect(closed).toMatchObject({ id: f.ids.run, status: 'failed', version: f.input.expectedVersion,
      canRetryGeneration: false, chargeableAttempts: 1, generationRecovery: 'source-review-fresh', generationHold: 'video-api-pending' });
    expect(f.db).toEqual(before);
    readVideoReadiness.mockResolvedValue(true);
    const reopened = await getHermesResearchRun(deps, f.input);
    expect(reopened).toMatchObject({ id: f.ids.run, status: 'failed', version: f.input.expectedVersion,
      canRetryGeneration: true, chargeableAttempts: 1, generationRecovery: 'source-review-fresh' });
    expect(reopened.generationHold).toBeUndefined();
    expect(f.db).toEqual(before);
  });

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
  return runningReviewerFixture(f);
}
function runningReviewerFixture(f: Awaited<ReturnType<typeof storedAuthorFixture>>) {
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
  it('persists the author self-check through actual confirm and Claim/Evidence reconciliation', async () => {
    const f = await storedAuthorFixture(); f.author.result.scientificReview.profile = 'paper-author';
    const map = await loadDocumentSourceMapReference(f.deps.storage, f.author.result.sourceMapRef);
    const quote = map.pages[0]!.blocks[0]!.text!;
    const locator = createBlockSourceLocator(map, 'source', { charRange: { start: 0, end: quote.length } });
    Object.assign(f.author.result, {
      core: { schemaVersion: '0.1.0', ...fields(() => quote) },
      evidence: fields(() => ({ quote, locator: 'passages:P00001' })),
      evidenceSegments: fields(() => [{ quote, sourceLocator: locator }]),
      evidenceLocation: fields(() => ({ status: 'located', matching: 'exact', sourceLocator: locator })),
    });
    f.author.result.scientificReview.fieldReviews = fields(() => ({ verdict: 'accepted', summary: quote, sourcePassageIds: ['P00001'], issues: [] }));
    f.author.result.scientificReview.draftClaims[0].statement = quote;
    f.author.result.reviewedClaimSuggestions[0].statement = quote;
    Object.assign(f.db.researchObjects[0]!, { version: 1, visibility: 'private' });
    f.db.sdfDocuments.push({ id: 'doc', researchObjectId: f.ids.ro, coreJson: f.author.result.core });
    f.db.sdfNodes.push(...Object.keys(f.author.result.scientificReview.fieldReviews).map(nodeType => ({ id: `node-${nodeType}`, sdfDocumentId: 'doc', nodeType, content: quote })));
    f.db.branches.push({ id: 'main-branch', researchObjectId: f.ids.ro, name: 'main', headCommitId: null });
    Object.assign(f.prisma.evidenceRecord, { createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      f.db.evidenceRecords.push(...data); return { count: data.length };
    } });
    const beforeLedger = structuredClone(f.db.usageLedger);
    await materializeHermesIngestion(f.deps, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source });
    const originalTransaction = f.prisma.$transaction.bind(f.prisma);
    const diagnostics: string[] = [];
    vi.spyOn(f.prisma, '$transaction').mockImplementation(async (...args) => {
      try { return await originalTransaction(...args); }
      catch (error) { diagnostics.push(String(error)); throw error; }
    });
    const result = await reconcileHermesResearchRuns(f.deps);
    expect(result.errors, diagnostics.join('\n')).toBe(0);
    expect(f.db.hermesResearchRuns[0]).toMatchObject({ status: 'awaiting_claim_review' });
    expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'confirmed', agentTaskId: f.author.id });
    expect(f.db.hermesResearchSteps.some(step => step.stage === 'source_review')).toBe(false);
    expect(f.db.agentTasks.some(task => task.result?.nativeAgentExecution?.profile === 'paper-source-review')).toBe(false);
    expect(f.db.usageLedger).toEqual(beforeLedger);
    expect(f.db.claimNodes).toHaveLength(1);
    expect(f.db.evidenceRecords).toHaveLength(1);
    expect(f.db.auditLogs.find(row => row.action === 'ingestion.system_materialize')).toMatchObject({ metadata: {
      sourceAgentTaskId: f.author.id, reviewResponseHash: f.cp.responseHash,
    } });
  });
  it('uses the new author source self-check without another independent model stage', async () => {
    const f = authorFixture(); f.author.result.scientificReview.profile = 'paper-author';
    const before = structuredClone(f.db);
    expect(automaticIngestionReviewStage(f.source)).toBe('ready');
    expect(automaticIngestionReview(f.source)).toMatchObject({ agentTaskId: f.author.id, responseHash: f.cp.responseHash });
    for (let i = 0; i < 2; i++) {
      await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run }))
        .resolves.toBe('ready');
    }
    expect(f.db.agentTasks).toEqual(before.agentTasks);
    expect(f.db.agentSessions).toEqual(before.agentSessions);
    expect(f.db.usageLedger).toEqual(before.usageLedger);
    expect(f.db.hermesResearchSteps).toEqual(before.hermesResearchSteps);
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });
  it.each(['missing-cp', 'partial-cp', 'tool-calls', 'field-core-drift', 'source-drift', 'missing-claims', 'wrong-response'] as const)(
    'rejects an incomplete new author self-check (%s)', change => {
      const f = authorFixture(); f.author.result.scientificReview.profile = 'paper-author';
      if (change === 'missing-cp') delete f.author.result.nativeAgentExecution.checkpoint;
      if (change === 'partial-cp') f.cp.finishReason = 'length';
      if (change === 'tool-calls') f.cp.hasToolCalls = true;
      if (change === 'field-core-drift') f.author.result.core.method = 'different';
      if (change === 'source-drift') f.source.artifact.blobSha256 = '9'.repeat(64);
      if (change === 'missing-claims') delete f.author.result.reviewedClaimSuggestions;
      if (change === 'wrong-response') f.author.result.scientificReview.responseHash = '9'.repeat(64);
      expect(() => automaticIngestionReview(f.source)).toThrow();
      expect(() => automaticIngestionReviewStage(f.source)).toThrow();
    });
  it.each(['membership', 'source-step', 'existing-review', 'existing-review-foreign', 'failed-run'] as const)(
    'preserves run authority and paid phase lineage for a new author (%s)', async change => {
      const f = authorFixture(); f.author.result.scientificReview.profile = 'paper-author';
      if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
      if (change === 'source-step') f.db.hermesResearchSteps[0]!.agentTaskId = 'foreign';
      if (change.startsWith('existing-review')) f.db.hermesResearchSteps.push({ ...f.db.hermesResearchSteps[0]!,
        id: 'existing-review', stage: 'source_review',
        ...(change === 'existing-review-foreign' ? { agentTaskId: 'original-paid-reviewer' } : {}) });
      if (change === 'failed-run') f.db.hermesResearchRuns[0]!.status = 'failed';
      const before = structuredClone(f.db);
      await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run })).rejects.toThrow();
      if (change.startsWith('existing-review')) await expect(materializeHermesIngestion(f.deps,
        { actorId: f.input.actorId, taskId: f.ids.source, runId: f.ids.run })).rejects.toThrow('lineage changed');
      expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    });
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
    expect(run.steps.some(step => step.stage === 'source_review')).toBe(true);
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 0, errors: 0 });
    expect(f.db.hermesResearchRuns[0]!.status).toBe('running');
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
