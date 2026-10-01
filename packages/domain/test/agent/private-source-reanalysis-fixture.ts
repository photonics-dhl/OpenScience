import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import type { Prisma } from '@prisma/client';
import { fixture, fields } from './direct-source-review-fixture';
import { seedHistoricalIndependentSourceReview } from './historical-source-review-fixture';
import { createHermesResearchRun, reconcileHermesResearchRuns, retryHermesGeneration } from '../../src/agent/research-run';
import { ensureHermesIngestionReview } from '../../src/ingestion/ingestion-service';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';

/** Real historical recovery producers, followed by the exhausted technical successor seen in LIVE. */
export async function privateSourceReanalysisFixture() {
  const f = fixture();
  f.ids.run = '3aaa6e8c-8168-4a12-9ccb-03e6c7b70c5c';
  f.db.hermesResearchRuns[0].id = f.ids.run; f.input.runId = f.ids.run;
  for (const step of f.db.hermesResearchSteps) step.runId = f.ids.run;
  f.db.researchObjects[0].visibility = 'private';
  await retryHermesGeneration(f.deps, f.input);
  const fresh = f.db.agentTasks.at(-1)!;
  Object.assign(fresh, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.failedResult) });
  for (const call of f.db.auditLogs.filter(row => row.requestId === f.ids.failed))
    f.db.auditLogs.push({ ...structuredClone(call), id: `${call.id}-fresh`, requestId: fresh.id });
  const stop = () => {
    f.db.hermesResearchSteps.at(-1)!.status = 'failed';
    f.db.hermesResearchSteps[0].status = 'succeeded';
    f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  };
  stop();
  const text = JSON.stringify({ fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
    sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [], claimSuggestions: [{ parentClientKey: 'missing' }] });
  fresh.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=source_unmaterializable');
  fresh.result.scientificReview.rejectedOutputs = [{ structuredAttempt: 2, kind: 'schema_validation',
    diagnostic: 'claims_source_unmaterializable', provider: 'primary', model: 'MiniMax-M3', promptHash: '2'.repeat(64),
    responseHash: createHash('sha256').update(text).digest('hex'), byteLength: Buffer.byteLength(text),
    usage: { inputTokens: 100, outputTokens: 100 }, finishReason: 'stop', text }];
  await retryHermesGeneration(f.deps, { ...f.input, expectedVersion: f.db.hermesResearchRuns[0].version, idempotencyKey: 'saved' });
  const saved = f.db.agentTasks.at(-1)!;
  const savedReceipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === saved.id)!;
  Object.assign(savedReceipt.metadata, { recoveryClass: 'saved_source_review_output_correction', noProviderSwitch: true });
  for (const key of ['reviewMode', 'reviewProvider', 'reviewModel', 'noRuntimeFallback']) delete savedReceipt.metadata[key];
  Object.assign(saved, { status: 'succeeded', executionAttempt: 1, result: structuredClone(fresh.result) });
  saved.result.scientificReview.rejectedOutputs[0].structuredAttempt = 1;
  const call = f.db.auditLogs.find(row => row.requestId === fresh.id && row.metadata.promptHash === '2'.repeat(64))!;
  f.db.auditLogs.push({ ...structuredClone(call), id: 'saved-call', requestId: saved.id });
  stop();
  const root = seedHistoricalIndependentSourceReview(f);
  Object.assign(root, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.failedResult) });
  root.result.scientificReview = { ...root.result.scientificReview, kind: 'independent_review',
    provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', attemptId: '00000000-0000-5000-8000-000000000777' };
  root.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=unavailable');
  f.db.auditLogs.push({ id: 'web-call', action: 'ai.gateway.call', requestId: root.id, actorId: null, targetType: 'ai_gateway',
    metadata: { operation: 'scientific_review', outcome: 'failed', provider: 'chatgpt-web-science-review',
      model: 'chatgpt-web/6-pro', promptHash: 'c'.repeat(64), inputContentHash: 'a'.repeat(64),
      fallbackReason: null, retryCount: 0, error: 'scientific_review_failed' } });
  stop();
  const verifier = vi.fn(async () => true);
  await retryHermesGeneration({ ...f.deps, canRetrySourceReviewBeforeSubmission: verifier }, {
    ...f.input, expectedVersion: f.db.hermesResearchRuns[0].version, idempotencyKey: 'technical' });
  const current = f.db.agentTasks.at(-1)!;
  Object.assign(current, { status: 'succeeded', executionAttempt: 1, result: structuredClone(root.result) });
  stop(); f.db.hermesResearchRuns[0].version = 22;

  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: async (key, body) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.concat(await (body as Readable).toArray());
      objects.set(key, bytes); return { key, size: bytes.length, etag: 'test' }; },
    getObject: vi.fn(async key => { const bytes = objects.get(key); if (!bytes) throw new Error('missing source map');
      return { body: Readable.from([bytes]), size: bytes.length }; }),
    headObject: async key => objects.has(key) ? { size: objects.get(key)!.length, etag: 'test' } : null,
    deleteObject: async key => { objects.delete(key); },
  };
  const reference = await persistDocumentSourceMapReference(storage, { artifactId: f.ids.artifact, contentHash: 'a'.repeat(64),
    parser: { name: 'fixture', version: '1' }, pages: [{ page: 1, width: 600, height: 800,
      blocks: [{ id: 'block', kind: 'paragraph', text: 'Full original source.', boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        parser: { name: 'fixture', version: '1' }, transformations: [] }] }] }, 'succeeded');
  for (const task of f.db.agentTasks) {
    task.result.sourceMapRef = reference;
    task.result.scientificReview.semanticStage.source.sourceMapHash = reference.serializedSha256;
  }
  for (const row of f.db.auditLogs) {
    if (row.metadata.notSubmittedRecovery) row.metadata.notSubmittedRecovery.input.sourceMapHash = reference.serializedSha256;
  }
  f.db.artifacts[0].logicalPath = 'original.pdf';
  f.db.artifacts[0].mimeType = 'application/pdf';
  // Fill missing relational/filter behavior in the shared in-memory DB, not business outcomes.
  const hydrateTask = (task: typeof current | undefined) => task ? { ...task,
    session: f.db.agentSessions.find(session => session.id === task.sessionId) } : null;
  const ingestionRead = f.prisma.ingestionTask.findUnique.bind(f.prisma.ingestionTask);
  const ingestionCreate = f.prisma.ingestionTask.create.bind(f.prisma.ingestionTask);
  Object.assign(f.prisma.ingestionTask, { create: (args: Prisma.IngestionTaskCreateArgs) => ingestionCreate({ ...args,
    data: { agentTaskId: null, ...args.data } as Prisma.IngestionTaskUncheckedCreateInput }) });
  Object.assign(f.prisma.ingestionTask, { findUnique: async (args: Prisma.IngestionTaskFindUniqueArgs) => {
    const row = await ingestionRead(args);
    return row && args.include?.agentTask ? { ...row, agentTask: hydrateTask(f.db.agentTasks.find(task => task.id === row.agentTaskId)) } : row;
  } });
  const batchRead = f.prisma.ingestionBatch.findUnique.bind(f.prisma.ingestionBatch);
  Object.assign(f.prisma.ingestionBatch, { findUnique: async (args: Prisma.IngestionBatchFindUniqueArgs) => {
    const row = await batchRead(args);
    return row && args.include?.tasks ? { ...row, tasks: f.db.ingestionTasks.filter(task => task.batchId === row.id)
      .map(task => ({ ...task, artifact: f.db.artifacts.find(artifact => artifact.id === task.artifactId),
        agentTask: hydrateTask(f.db.agentTasks.find(candidate => candidate.id === task.agentTaskId)) })) } : row;
  } });
  Object.assign(f.prisma.agentTask, { findFirst: async (args?: Prisma.AgentTaskFindFirstArgs) => f.db.agentTasks.find(task => {
    const session = f.db.agentSessions.find(candidate => candidate.id === task.sessionId);
    const where = args?.where ?? {};
    return task.kind === where.kind && ['pending', 'running'].includes(task.status)
      && !task.deletedAt && session?.researchObjectId === f.ids.ro
      && task.payload.artifactId === f.ids.artifact && task.id !== (where.id as { not?: string })?.not;
  }) ?? null });
  const runRead = f.prisma.hermesResearchRun.findUnique.bind(f.prisma.hermesResearchRun);
  const runCreate = f.prisma.hermesResearchRun.create.bind(f.prisma.hermesResearchRun);
  Object.assign(f.prisma.hermesResearchRun, { create: async (args: Prisma.HermesResearchRunCreateArgs) => {
    const run = await runCreate(args);
    for (const step of f.db.hermesResearchSteps.filter(step => step.runId === run.id)) step.presentationAssetId ??= null;
    return run;
  } });
  Object.assign(f.prisma.hermesResearchRun, { findUnique: async (args: Prisma.HermesResearchRunFindUniqueArgs) => {
    const row = await runRead({ ...args, where: { ...args.where,
      ...(args.where.id ? { id: args.where.id.toLowerCase() } : {}) } });
    return row && (args.where.version === undefined || row.version === args.where.version) ? row : null;
  } });
  const stepRead = f.prisma.hermesResearchStep.findFirst.bind(f.prisma.hermesResearchStep);
  Object.assign(f.prisma.hermesResearchStep, { findFirst: async (args: Prisma.HermesResearchStepFindFirstArgs) => {
    if (args.where?.stage !== 'source_ingestion' || !args.where.ingestionTaskId) return stepRead(args);
    return f.db.hermesResearchSteps.find(step => step.stage === 'source_ingestion' && step.ingestionTaskId === args.where!.ingestionTaskId
      && step.runId !== (args.where!.runId as { not?: string })?.not
      && f.db.hermesResearchRuns.some(run => run.id === step.runId && !['succeeded', 'failed', 'stopped'].includes(run.status))) ?? null;
  } });
  Object.assign(f.prisma.hermesResearchRun, { findFirst: async (args: Prisma.HermesResearchRunFindFirstArgs) =>
    f.db.hermesResearchRuns.find(run => run.actorId === args.where?.actorId && run.researchObjectId === args.where?.researchObjectId
      && run.profile === args.where?.profile && f.db.hermesResearchSteps.some(step => step.runId === run.id
        && step.ingestionTaskId === args.where?.steps?.some?.ingestionTaskId && step.stage === 'source_ingestion')) ?? null });
  Object.assign(f.prisma.hermesResearchStep, { findMany: async (args: Prisma.HermesResearchStepFindManyArgs) => {
    const where = args.where ?? {};
    return f.db.hermesResearchSteps.filter(step => {
      if (Array.isArray(where.OR)) return where.OR.some(part => part.agentTaskId === step.agentTaskId || part.ingestionTaskId === step.ingestionTaskId);
      return (where.stage === undefined || step.stage === where.stage) && (where.agentTaskId === undefined || step.agentTaskId === where.agentTaskId)
        && (where.ingestionTaskId === undefined || step.ingestionTaskId === where.ingestionTaskId)
        && (typeof where.runId !== 'string' || step.runId === where.runId)
        && (typeof where.ordinal === 'number' ? step.ordinal === where.ordinal
          : where.ordinal?.gt !== undefined ? step.ordinal > where.ordinal.gt : true);
    }).slice(0, args.take ?? f.db.hermesResearchSteps.length);
  } });
  const input = { userId: f.input.actorId, taskId: f.ids.source, sourceAgentTaskId: current.id,
    processingConsent: true, idempotencyKey: 'new-paid-1',
    sourceReanalysis: { intent: 'new_paid_private_analysis' as const, sourceRunId: f.ids.run, expectedRunVersion: 22 } };
  verifier.mockClear();
  return { ...f, root, current, reference, storage, objects, verifier, input,
    deps: { ...f.deps, storage, canRetrySourceReviewBeforeSubmission: verifier } };
}

export type PrivateSourceReanalysisFixture = Awaited<ReturnType<typeof privateSourceReanalysisFixture>>;

export async function advancePrivateSourceReanalysisToReview(f: PrivateSourceReanalysisFixture, ingestionTaskId: string,
  stage: 'source_review' | 'source_composition' = 'source_review', runKey = 'fresh-normal-narrative') {
  const original = f.db.agentTasks.find(task => f.db.ingestionTasks.find(source => source.id === ingestionTaskId)?.agentTaskId === task.id)!;
  Object.assign(original, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.anchorResult) });
  if (stage === 'source_composition') {
    delete original.result.scientificReview.semanticStage;
    original.result.scientificReview.kind = 'model_self_check';
    original.result.scientificReview.contractVersion = '4';
    original.result.scientificReview.status = 'blocked_scientific_review';
    original.result.reason = 'canonical_partial_validation_exhausted';
  }
  f.db.ingestionTasks.find(source => source.id === ingestionTaskId)!.state = 'needs_review';
  const run = await createHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro,
    ingestionTaskIds: [ingestionTaskId], idempotencyKey: runKey, generation: {
      profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'auto', instruction: 'Explain the paper',
    } });
  await reconcileHermesResearchRuns(f.deps);
  await ensureHermesIngestionReview(f.deps, { actorId: f.input.userId, runId: run.id, taskId: ingestionTaskId });
  return { run, original, successor: f.db.agentTasks.at(-1)! };
}
