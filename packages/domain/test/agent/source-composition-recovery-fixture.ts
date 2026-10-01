import { vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { ensureHermesIngestionReview, reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { reconcileHermesResearchRuns, retryHermesGeneration } from '../../src/agent/research-run';
import { claimAgentTask } from '../../src/agent/agent';
import { advancePrivateSourceReanalysisToReview, privateSourceReanalysisFixture } from './private-source-reanalysis-fixture';
import { HERMES_INDEPENDENT_SOURCE_REVIEW } from '../../src/ingestion/source-review-recovery';

export async function sourceCompositionRecoveryFixture() {
  const f = await privateSourceReanalysisFixture();
  // The shared fake predates multiple source phases. Apply relational filters, not business decisions.
  Object.assign(f.prisma.hermesResearchStep, { updateMany: async ({ where, data }: Prisma.HermesResearchStepUpdateManyArgs) => {
    const rows = f.db.hermesResearchSteps.filter(step => {
      if (where?.id && (typeof where.id === 'string' ? step.id !== where.id : !where.id.in?.includes(step.id))) return false;
      for (const key of ['runId', 'stage', 'ordinal', 'status', 'agentTaskId', 'ingestionTaskId', 'artifactId'] as const)
        if (where?.[key] !== undefined && step[key] !== where[key]) return false;
      const taskFilter = where?.agentTask as Prisma.AgentTaskWhereInput | undefined;
      const task = f.db.agentTasks.find(row => row.id === step.agentTaskId);
      return !taskFilter || Boolean(task && (taskFilter.status === undefined || task.status === taskFilter.status)
        && (taskFilter.deletedAt === undefined || (task.deletedAt ?? null) === taskFilter.deletedAt));
    });
    for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
    return { count: rows.length };
  } });
  const source = await reanalyzeConfirmedIngestion(f.deps, f.input);
  const { run, original, successor: failed } = await advancePrivateSourceReanalysisToReview(f, source.id, 'source_composition');
  const semanticStage = { kind: 'semantic_reduce', source: { artifactId: f.ids.artifact, contentHash: f.reference.contentHash,
    sourceMapHash: f.reference.serializedSha256 }, provider: 'primary', model: 'MiniMax-M3', promptHash: 'c'.repeat(64),
    responseHash: 'd'.repeat(64), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 100 },
    passageBindings: [{ observationId: 'W1O1', sourcePassageIds: ['P00001'], qualifierPassageIds: [] }],
    reduction: { chosenRepresentativeCase: null, fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field,
      [{ statement: `Supported ${field}`, type: 'bounded_synthesis', conditionCase: '', comparison: null, operation: null,
        evidenceIds: ['W1O1'] }]])) } };
  const result = { ...structuredClone(f.anchorResult), reason: 'canonical_partial_validation_exhausted',
    core: { schemaVersion: '0.1.0', ...Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, ''])) },
    evidence: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { quote: '', locator: '' }])),
    evidenceSegments: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, []])), needsMoreInformation: [...SDF_CORE_FIELDS],
    fieldDiagnostics: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'malformed_item'])),
    fieldDiagnosticsDetails: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'scientificReview=SCHEMA_VALIDATION'])),
    scientificReview: { kind: 'model_self_check', contractVersion: '4', status: 'blocked_scientific_review', provider: null, model: null,
      compositionSkill: { id: 'scientific-summary', version: '6' }, semanticStage,
      reviewedCandidateHash: createHash('sha256').update(JSON.stringify(semanticStage.reduction)).digest('hex') } };
  Object.assign(failed, { status: 'succeeded', executionAttempt: 1, retryCount: 0, result });
  f.db.ingestionTasks.find(row => row.id === source.id)!.state = 'needs_review';
  for (let tick = 0; tick < 2; tick++) {
    f.db.hermesResearchRuns.find(row => row.id === run.id)!.lastReconciledAt = null;
    await reconcileHermesResearchRuns(f.deps);
  }
  const currentRun = f.db.hermesResearchRuns.find(row => row.id === run.id)!;
  return { ...f, source, run: currentRun,
    original: f.db.agentTasks.find(row => row.id === original.id)!, failed: f.db.agentTasks.find(row => row.id === failed.id)!,
    recoveryInput: { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: run.id,
      expectedVersion: currentRun.version, idempotencyKey: 'same-final-composition' } };
}

export function sourceCompositionCandidate(f: Awaited<ReturnType<typeof sourceCompositionRecoveryFixture>>) {
  const result = structuredClone(f.anchorResult);
  result.scientificReview.semanticStage = structuredClone(f.failed.result.scientificReview.semanticStage);
  result.scientificReview.reviewedCandidateHash = f.failed.result.scientificReview.reviewedCandidateHash;
  for (const field of Object.keys(result.evidence)) result.evidence[field]!.locator = 'passages:P00001';
  Object.assign(result.scientificReview, { usage: { inputTokens: 10, outputTokens: 10 }, draftClaims: [{ clientKey: 'core', kind: 'core',
    sourceField: 'insight', statement: 'Supported contribution', conditions: [], limitations: [],
    sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] });
  return result;
}

export async function sourceReviewPacketFailureFixture() {
  const f = await sourceCompositionRecoveryFixture(); await retryHermesGeneration(f.deps, f.recoveryInput);
  const composition = f.db.agentTasks.at(-1)!; const candidate = sourceCompositionCandidate(f);
  Object.assign(composition, { status: 'succeeded', executionAttempt: 1, result: candidate });
  const source = f.db.ingestionTasks.find(row => row.id === f.source.id)!;
  source.state = 'needs_review'; await reconcileHermesResearchRuns(f.deps);
  await ensureHermesIngestionReview(f.deps, { actorId: f.input.userId, runId: f.run.id, taskId: source.id });
  const review = f.db.agentTasks.at(-1)!;
  // This fixture represents an already persisted pre-Hermes-only Web packet failure.
  // The separate current-producer test must continue to create a model receipt.
  const historicalReceipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh'
    && row.metadata.newAgentTaskId === review.id)!;
  Object.assign(historicalReceipt.metadata, { policy: 'scientific_review_v4_independent', ...HERMES_INDEPENDENT_SOURCE_REVIEW });
  Object.assign(review, { status: 'succeeded', executionAttempt: 1, result: {
    ...structuredClone(candidate), reason: 'canonical_partial_validation_exhausted',
    core: { schemaVersion: candidate.core.schemaVersion, ...Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, ''])) },
    evidence: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { quote: '', locator: '' }])),
    evidenceSegments: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, []])), needsMoreInformation: [...SDF_CORE_FIELDS],
    fieldDiagnostics: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'malformed_item'])),
    fieldDiagnosticsDetails: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'scientificReview=required_review_context_too_large'])),
    unverifiedSummaries: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, candidate.core[field]])),
    unverifiedSourcePassageIds: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, ['P00001']])),
    scientificReview: { kind: 'independent_review', contractVersion: '5', status: 'awaiting_review_evidence',
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', attemptId: '11111111-1111-4111-8111-111111111111',
      reviewedCandidateHash: 'f'.repeat(64), sourceAgentTaskId: composition.id,
      compositionSkill: structuredClone(candidate.scientificReview.compositionSkill),
      semanticStage: structuredClone(candidate.scientificReview.semanticStage) },
  } });
  source.state = 'needs_review';
  for (let tick = 0; tick < 2; tick++) {
    f.db.hermesResearchRuns.find(row => row.id === f.run.id)!.lastReconciledAt = null; await reconcileHermesResearchRuns(f.deps);
  }
  const run = f.db.hermesResearchRuns.find(row => row.id === f.run.id)!;
  return { ...f, source: f.db.ingestionTasks.find(row => row.id === source.id)!, run,
    composition: f.db.agentTasks.find(row => row.id === composition.id)!, review: f.db.agentTasks.find(row => row.id === review.id)!,
    packetInput: { ...f.recoveryInput, expectedVersion: run.version, idempotencyKey: 'same-packet-review-recovery' } };
}

export async function exhaustedRecoveredCompositionFixture() {
  const f = await sourceReviewPacketFailureFixture();
  await retryHermesGeneration(f.deps, f.packetInput);
  const root = f.db.agentTasks.at(-1)!;
  Object.assign(root, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.review.result) });
  Object.assign(root.result.scientificReview, { status: 'blocked_scientific_review', attemptId: '22222222-2222-5222-8222-222222222222' });
  for (const field of Object.keys(root.result.fieldDiagnosticsDetails)) root.result.fieldDiagnosticsDetails[field] = 'scientificReview=unavailable';
  f.db.auditLogs.push({ id: 'recovered-packet-web-call', action: 'ai.gateway.call', requestId: root.id, actorId: null, targetType: 'ai_gateway',
    metadata: { operation: 'scientific_review', outcome: 'failed', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
      promptHash: 'c'.repeat(64), inputContentHash: f.reference.contentHash, fallbackReason: null, retryCount: 0, error: 'scientific_review_failed' } });
  const stop = () => {
    f.db.ingestionTasks.find(row => row.id === f.source.id)!.state = 'needs_review';
    f.db.hermesResearchSteps.find(row => row.stage === 'source_review' && row.agentTaskId === f.db.agentTasks.at(-1)!.id)!.status = 'failed';
    f.db.hermesResearchRuns.find(row => row.id === f.run.id)!.status = 'failed';
  };
  stop();
  const verifier = vi.fn(async () => true);
  await retryHermesGeneration({ ...f.deps, canRetrySourceReviewBeforeSubmission: verifier }, {
    ...f.packetInput, expectedVersion: f.db.hermesResearchRuns.find(row => row.id === f.run.id)!.version,
    idempotencyKey: 'last-packet-technical-successor' });
  const current = f.db.agentTasks.at(-1)!;
  Object.assign(current, { status: 'succeeded', executionAttempt: 1, result: structuredClone(root.result) });
  stop(); verifier.mockClear();
  const run = f.db.hermesResearchRuns.find(row => row.id === f.run.id)!;
  // Persisted LIVE parser step is complete; the shared fake does not run parser-step reconciliation.
  f.db.hermesResearchSteps.find(row => row.runId === run.id && row.stage === 'source_ingestion')!.status = 'succeeded';
  return { ...f, root, current, run, verifier, deps: { ...f.deps, canRetrySourceReviewBeforeSubmission: verifier },
    input: { ...f.input, taskId: f.source.id, sourceAgentTaskId: current.id, idempotencyKey: 'fresh-after-recovered-composition',
      sourceReanalysis: { intent: 'new_paid_private_analysis' as const, sourceRunId: run.id, expectedRunVersion: run.version } } };
}

export async function sourceSavedCompositionFixture() {
  const base = await sourceCompositionRecoveryFixture();
  await retryHermesGeneration(base.deps, base.recoveryInput);
  const owner = base.db.agentTasks.at(-1)!;
  await claimAgentTask(base.deps, owner.id);
  owner.result = { sourceMapRef: structuredClone(base.reference) };
  const f = { ...base, owner };
  const draft = sourceCompositionCandidate(f);
  draft.core.results = '条件'.repeat(131);
  const text = JSON.stringify({ fields: Object.fromEntries(Object.entries(draft.core).filter(([key]) => key !== 'schemaVersion')
    .map(([field, summary]) => [field, { summary, sourcePassageIds: ['P00001'] }])),
    needsMoreEvidence: [], draftClaims: draft.scientificReview.draftClaims });
  const output = { kind: 'schema_validation', diagnostic: 'composition_results_summary_length', structuredAttempt: 2,
    provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'f'.repeat(64),
    responseHash: createHash('sha256').update(text).digest('hex'), byteLength: Buffer.byteLength(text), text,
    finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 11 } };
  f.owner.status = 'succeeded'; f.owner.result = structuredClone(f.failed.result);
  const firstText = '{"fields":';
  const first = { ...output, structuredAttempt: 1, kind: 'json_parse', diagnostic: 'invalid_json', promptHash: 'e'.repeat(64),
    text: firstText, byteLength: Buffer.byteLength(firstText), responseHash: createHash('sha256').update(firstText).digest('hex') };
  f.owner.result.scientificReview.rejectedOutputs = [first, output];
  f.db.hermesResearchSteps.find(step => step.agentTaskId === f.owner.id && step.stage === 'source_composition')!.status = 'failed';
  f.db.hermesResearchRuns.find(run => run.id === f.run.id)!.status = 'failed';
  f.db.ingestionTasks.find(task => task.id === f.source.id)!.state = 'needs_review';
  for (const [index, receipt] of [first, output].entries()) f.db.auditLogs.push({
    id: index === 0 ? 'saved-first-compose-audit' : 'saved-paid-compose-audit', action: 'ai.gateway.call', targetType: 'ai_gateway',
    requestId: f.owner.id, actorId: null, createdAt: new Date(1_000 + index),
    metadata: { operation: 'text', outcome: 'succeeded', provider: receipt.provider, model: receipt.model,
      promptHash: receipt.promptHash, inputTokens: 10, outputTokens: 11, finishReason: 'stop', maxOutputTokens: 65536,
      retryCount: 0, fallbackReason: null, error: null } });
  const readAudits = f.prisma.auditLog.findMany.bind(f.prisma.auditLog);
  // This fixture preserves SQL ordering; insertion order is not provider-call ordinal.
  Object.assign(f.prisma.auditLog, { findMany: async (args: Prisma.AuditLogFindManyArgs) => {
    const rows = await readAudits({ ...args, take: undefined });
    if (args.orderBy) rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return args.take ? rows.slice(0, args.take) : rows;
  } });
  return { ...f, output, resumeInput: { ...f.recoveryInput, expectedVersion: f.run.version, idempotencyKey: 'saved-composition-review' } };
}
