import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readNativeSourceReview, type NativeSourceReviewIdentity } from './native-source-review';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { automaticIngestionReviewStage } from './automatic-review';
import { parseDocumentSourceMapReference, type DocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { findSavedIngestionCommit } from './saved-source-commit';
import { requireActiveMembership } from '../workspace/helpers';
import { inspectHermesRecoveredSourceComposition, inspectHermesSavedCompositionCandidate, hasOrdinarySourceTaskDebit, type HermesSavedSourceCompositionCandidate } from './source-composition-recovery';
import { readNativeAgentExecution, nativeAgentTerminalResult } from '../agent/native-agent-execution';
import { requireNativePaperAuthor } from './native-paper-author';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const absentOrEmptyRecord = (value: unknown) => value === undefined
  || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const CONTRACT_REPAIR_CLASS = 'accepted_review_claim_contract_missing' as const;
const SCHEMA_REPAIR_CLASS = 'schema_contract_retry_after_accepted_anchor' as const;
const DIRECT_COMPOSITION_REVIEW_CLASS = 'direct_composition_structured_review_failure' as const;
const SAVED_OUTPUT_CORRECTION_CLASS = 'saved_source_review_output_correction' as const;
const INDEPENDENT_REVIEW_CLASS = 'independent_source_review' as const;
const PACKET_OVERFLOW_REVIEW_CLASS = 'independent_source_review_packet_overflow' as const;
export const SOURCE_REVIEW_NOT_SUBMITTED = 'independent_source_review_not_submitted' as const;
export type SourceReviewNotSubmittedInput = { requestId: string; promptHash: string; artifactId: string;
  documentSha256: string; candidateHash: string; sourceMapHash: string };
export type SourceReviewNotSubmittedVerifier = (input: SourceReviewNotSubmittedInput) => Promise<boolean>;
export const HERMES_INDEPENDENT_SOURCE_REVIEW = {
  reviewMode: 'web', reviewProvider: 'chatgpt-web-science-review', reviewModel: 'chatgpt-web/6-pro',
} as const;
export type HermesSavedSourceReviewOutput = {
  sourceTaskId: string; structuredAttempt: number; text: string; responseHash: string;
  promptHash: string; provider: string; model: string; byteLength: number;
};
export type HermesAgentSourceReviewExecution = {
  mode: 'agent'; taskId: string; runId: string; sourceAgentTaskId: string; authorCheckpointSha256: string;
  sourceMapRef: DocumentSourceMapReference; sourceResult: Prisma.JsonValue;
};
export type HermesSourceReviewExecution = HermesAgentSourceReviewExecution | { mode: 'model'; savedOutput?: HermesSavedSourceReviewOutput;
  savedCompositionCandidate?: HermesSavedSourceCompositionCandidate;
  nativeSourceReview?: import('./native-source-review').NativeSourceReviewIdentity } | {
  mode: 'web'; provider: 'chatgpt-web-science-review'; model: 'chatgpt-web/6-pro';
  runId: string; taskId: string; savedOutput?: HermesSavedSourceReviewOutput;
  notSubmittedRecovery?: SourceReviewNotSubmittedInput;
};
type SourceReviewBindingInput = {
  ownerTaskId: string; ingestionTaskId: string; failedTaskId: string; compositionTaskId: string; executionAttempt: number;
};
const independentMode = (metadata: Record<string, unknown>) => metadata.reviewMode === 'web'
  && metadata.reviewProvider === HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider
  && metadata.reviewModel === HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel;
const initialReviewMode = (metadata: Record<string, unknown>): 'model' | 'web' | 'agent' | undefined => {
  if (metadata.policy === 'scientific_review_v4_correction' && metadata.reviewMode === 'agent'
    && metadata.reviewProfile === 'paper-source-review' && sha256(metadata.authorCheckpointSha256)
    && metadata.reviewProvider === undefined && metadata.reviewModel === undefined) return 'agent';
  if (metadata.policy === 'scientific_review_v4_independent') return independentMode(metadata) ? 'web' : undefined;
  if (metadata.policy === 'scientific_review_v4_correction' && metadata.reviewMode === undefined
    && metadata.reviewProvider === undefined && metadata.reviewModel === undefined) return 'model';
  return undefined;
};
type FreshReviewEvidence = { reviewedCandidateHash: string; structuredReviewAuditIds: string[];
  freshReview: true; savedOutputReused: false };
type PacketFailureEvidence = { sourceTaskId: string; compositionSourceAgentTaskId: string; initialReviewAuditId: string;
  reviewedCandidateHash: string; sourceMapSha256: string };
type SavedOutputEvidence = Omit<HermesSavedSourceReviewOutput, 'text'> & {
  reviewedCandidateHash: string; structuredReviewAuditIds: string[];
};

export type HermesPrivateSourceReanalysisInput = {
  intent: 'new_paid_private_analysis'; sourceRunId: string; expectedRunVersion: number;
};
export type HermesPrivateSourceReanalysisExecutionInput = {
  ownerTaskId: string; ingestionTaskId: string; sourceAgentTaskId: string; executionAttempt: number;
};
export type HermesPrivateSourceReanalysisExecution = { sourceMapRef: DocumentSourceMapReference };
const PRIVATE_SOURCE_REANALYSIS = 'new_paid_private_analysis' as const;
const PRIVATE_REANALYSIS_BATCH_PREFIX = 'ingestion-private-source-reanalysis:';
const SOURCE_WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validPrivateSourceReanalysisInput(value: unknown): value is HermesPrivateSourceReanalysisInput {
  const input = record(value);
  return Object.keys(input).sort().join(',') === 'expectedRunVersion,intent,sourceRunId'
    && input.intent === PRIVATE_SOURCE_REANALYSIS && uuid(input.sourceRunId)
    && typeof input.expectedRunVersion === 'number' && Number.isSafeInteger(input.expectedRunVersion) && input.expectedRunVersion > 0;
}

export function privateSourceReanalysisBatchKey(input: HermesPrivateSourceReanalysisInput): string {
  return `${PRIVATE_REANALYSIS_BATCH_PREFIX}${input.sourceRunId}:${input.expectedRunVersion}`;
}

/** A new paid intent after the recorded independent role and its sole technical successor are exhausted.
 * This reads historical receipts; it never asks the broker for zero-submit/refund authority. */
export async function inspectHermesPrivateSourceReanalysis(tx: Prisma.TransactionClient, input: HermesPrivateSourceReanalysisInput) {
  if (!validPrivateSourceReanalysisInput(input)) return null;
  const run = await tx.hermesResearchRun.findUnique({ where: { id: input.sourceRunId }, include: { steps: true, researchObject: true } });
  const settings = record(run?.generationSettings);
  if (!run || run.version !== input.expectedRunVersion || run.status !== 'failed' || run.profile !== VISUAL_NARRATIVE_PROFILE
    || run.maxAgentTasks !== 9 || run.versionId !== null || run.sourceClaimIds.length || run.sourceReviewDigest
    || run.researchObject.deletedAt || run.researchObject.status !== 'draft' || run.researchObject.visibility !== 'private'
    || Object.keys(settings).sort().join(',') !== 'instruction,locale,style' || !['zh', 'en'].includes(String(settings.locale))
    || typeof settings.style !== 'string' || !settings.style.trim() || settings.style.length > 100
    || typeof settings.instruction !== 'string' || !settings.instruction.trim() || settings.instruction.length > 1000) return null;
  const canonical = run.steps.filter(step => step.stage === 'source_ingestion');
  const reviews = run.steps.filter(step => step.stage === 'source_review').sort((a, b) => a.ordinal - b.ordinal);
  if (run.steps.some(step => step.stage === 'source_composition')) {
    const compositions = run.steps.filter(step => step.stage === 'source_composition').sort((a, b) => a.ordinal - b.ordinal);
    if (canonical.length !== 1 || canonical[0]!.ordinal !== 0 || canonical[0]!.status !== 'succeeded'
      || compositions.length !== 2 || compositions.some((step, index) => step.ordinal !== index
        || step.status !== (index === 0 ? 'failed' : 'succeeded'))
      || reviews.length !== 3 || reviews.some((step, index) => step.ordinal !== index || step.status !== 'failed')
      || run.steps.length !== 6 || run.steps.length + 3 > run.maxAgentTasks || !canonical[0]!.agentTaskId) return null;
    const history = await inspectCompletedHermesSourceReviewHistory(tx, run.id, canonical[0]!.agentTaskId);
    const recovered = history ? await inspectHermesRecoveredSourceComposition(tx, run.id) : null;
    if (!history?.replacement || !recovered?.replacement || history.reviewMode !== 'web'
      || history.recoveryClass !== SOURCE_REVIEW_NOT_SUBMITTED || !history.packetFailureEvidence
      || recovered.replacement.id !== history.composition.id || history.source.id !== recovered.source.id) return null;
    const { source, composition: anchor, replacement: current } = history;
    const reference = recovered.reference;
    if (source.state !== 'needs_review' || source.agentTaskId !== current.id
      || !isDeepStrictEqual(parseDocumentSourceMapReference(record(current.result).sourceMapRef), reference)) return null;
    const authority = await requireActiveMembership(tx, run.researchObject.workspaceId, run.actorId).catch(() => null);
    if (!authority || authority.workspace.status !== 'active' || !SOURCE_WRITE_ROLES.has(authority.membership.role)) return null;
    const tasks = await tx.agentTask.findMany({ where: { id: { in: reviews.map(step => step.agentTaskId!) } }, include: { session: true } });
    if (tasks.length !== reviews.length || tasks.some(task => task.session.kind !== 'ingestion')) return null;
    if (await findSavedIngestionCommit(tx, { taskId: source.id, researchObjectId: run.researchObjectId })
      || await tx.commit.findUnique({ where: { idempotencyKey: `ingestion-confirm:${source.id}` } })
      || await tx.commit.findUnique({ where: { idempotencyKey: `hermes-ingestion:${run.id}:${source.id}` } })) return null;
    return { run, source, current, anchor, reference,
      input: { intent: PRIVATE_SOURCE_REANALYSIS, sourceRunId: run.id, expectedRunVersion: run.version },
      historicalSessionIds: [...new Set([recovered.parent, recovered.failed, anchor, ...tasks].map(task => task.sessionId))] };
  }
  if (canonical.length !== 1 || canonical[0]!.ordinal !== 0 || !['succeeded', 'failed'].includes(canonical[0]!.status)
    || reviews.length < 3 || run.steps.length !== 1 + reviews.length || run.steps.length + 3 > 9
    || reviews.some((step, index) => step.ordinal !== index || step.status !== 'failed' || !step.agentTaskId)
    || new Set(reviews.map(step => step.agentTaskId)).size !== reviews.length) return null;
  const sourceStep = canonical[0]!;
  if (!sourceStep.ingestionTaskId || !sourceStep.artifactId || !sourceStep.agentTaskId
    || sourceStep.agentTaskId !== reviews.at(-1)!.agentTaskId
    || run.steps.some(step => step.ingestionTaskId !== sourceStep.ingestionTaskId || step.artifactId !== sourceStep.artifactId
      || step.presentationAssetId !== null)) return null;
  const source = await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId }, include: { artifact: true, batch: true } });
  if (!source || source.state !== 'needs_review' || source.retryCount !== 0 || source.agentTaskId !== sourceStep.agentTaskId
    || source.artifactId !== sourceStep.artifactId || source.batch.userId !== run.actorId || source.batch.researchObjectId !== run.researchObjectId
    || source.artifact.workspaceId !== run.researchObject.workspaceId || source.artifact.deletedAt || source.artifact.bytesPurgedAt) return null;
  const authority = await requireActiveMembership(tx, run.researchObject.workspaceId, run.actorId).catch(() => null);
  if (!authority) return null;
  const { workspace, membership } = authority;
  if (workspace.status !== 'active' || !SOURCE_WRITE_ROLES.has(membership.role)) return null;
  const tasks = await tx.agentTask.findMany({ where: { id: { in: reviews.map(step => step.agentTaskId!) } }, include: { session: true } });
  if (tasks.length !== reviews.length) return null;
  const byId = new Map(tasks.map(task => [task.id, task]));
  const current = byId.get(source.agentTaskId)!;
  const anchorId = record(record(byId.get(reviews[0]!.agentTaskId!)?.result).scientificReview).sourceAgentTaskId;
  if (!uuid(anchorId) || byId.has(anchorId)) return null;
  const anchor = await tx.agentTask.findUnique({ where: { id: anchorId }, include: { session: true } });
  if (!anchor) return null;
  let reference: DocumentSourceMapReference;
  try { reference = parseDocumentSourceMapReference(record(current.result).sourceMapRef); } catch { return null; }
  if (reference.parserStatus !== 'succeeded' || reference.artifactId !== source.artifactId || reference.contentHash !== source.artifact.blobSha256) return null;
  for (const task of [anchor, ...tasks]) {
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.status !== 'succeeded' || task.executionAttempt < 1
      || task.session.deletedAt || task.session.status !== 'active' || task.session.kind !== 'ingestion'
      || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || !isDeepStrictEqual(task.payload, { artifactId: source.artifactId, researchObjectId: run.researchObjectId })
      || record(task.result).canonicalExtractionContract !== 'grounded-passages-v2') return null;
    try { if (!isDeepStrictEqual(parseDocumentSourceMapReference(record(task.result).sourceMapRef), reference)) return null; } catch { return null; }
  }
  const receipts = new Map<string, Record<string, unknown>>();
  let previousVersion = 0;
  for (const step of reviews) {
    const task = byId.get(step.agentTaskId!)!;
    const predecessorId = step.ordinal === 0 ? anchor.id : reviews[step.ordinal - 1]!.agentTaskId!;
    const key = `ingestion-analysis-compose:${source.id}:${predecessorId}:${anchor.id}:scientific-review-v4`;
    const review = record(record(task.result).scientificReview);
    if (task.idempotencyKey !== key || task.retryCount !== 0 || review.sourceAgentTaskId !== anchor.id
      || review.status !== 'blocked_scientific_review' || review.contractVersion !== '5') return null;
    if (step.ordinal === 0) { if (task.session.idempotencyKey !== `${key}:session`) return null; continue; }
    const rows = await tx.auditLog.findMany({ where: { action: 'hermes.research_run.source_review_recovery',
      targetType: 'hermes_research_run', targetId: run.id, actorId: run.actorId, workspaceId: workspace.id,
      metadata: { path: ['newAgentTaskId'], equals: task.id } }, take: 2 });
    if (rows.length !== 1) return null;
    const metadata = record(rows[0]!.metadata);
    if (metadata.explicitUserAction !== true || metadata.oldAgentTaskId !== predecessorId || metadata.compositionSourceAgentTaskId !== anchor.id
      || metadata.stage !== 'source_review' || metadata.ordinal !== step.ordinal || !sha256(metadata.requestDigest)
      || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim()
      || !Number.isSafeInteger(metadata.previousVersion) || Number(metadata.previousVersion) <= previousVersion
      || Number(metadata.previousVersion) >= run.version || task.session.idempotencyKey !== `${key}:hermes-recovery:${metadata.requestDigest}`) return null;
    previousVersion = Number(metadata.previousVersion); receipts.set(task.id, metadata);
  }
  const root = byId.get(reviews.at(-2)!.agentTaskId!)!;
  const rootReceipt = receipts.get(root.id)!;
  const technical = receipts.get(current.id)!;
  const rootReview = record(record(root.result).scientificReview);
  const currentReview = record(record(current.result).scientificReview);
  const recovery = record(technical.notSubmittedRecovery);
  const recoveryInput = record(recovery.input);
  if (rootReceipt.recoveryClass !== INDEPENDENT_REVIEW_CLASS || !independentMode(rootReceipt) || rootReceipt.noRuntimeFallback !== true
    || rootReceipt.chargeableAttempts !== 1 || rootReceipt.creditPolicy !== 'new-review-task-charged;original-failure-preserved'
    || technical.recoveryClass !== SOURCE_REVIEW_NOT_SUBMITTED || !independentMode(technical) || technical.noRuntimeFallback !== true
    || technical.independentIntentTaskId !== root.id || technical.chargeableAttempts !== 0 || technical.creditPolicy !== 'reuse-original-reservation'
    || recovery.originalTaskId !== root.id || recovery.reservationIdempotencyKey !== `agent-task-reserve:${root.id}`
    || !isDeepStrictEqual(recoveryInput, { requestId: rootReview.attemptId, promptHash: recoveryInput.promptHash,
      artifactId: source.artifactId, documentSha256: reference.contentHash, candidateHash: rootReview.reviewedCandidateHash,
      sourceMapHash: reference.serializedSha256 }) || !sha256(recoveryInput.promptHash) || !sha256(rootReview.reviewedCandidateHash)
    || !uuid(rootReview.attemptId) || rootReview.kind !== 'independent_review' || currentReview.kind !== 'independent_review'
    || rootReview.provider !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider || rootReview.model !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel
    || currentReview.provider !== rootReview.provider || currentReview.model !== rootReview.model
    || currentReview.reviewedCandidateHash !== rootReview.reviewedCandidateHash) return null;
  const earlier = reviews.slice(1, -2).map(step => receipts.get(step.agentTaskId!)!.recoveryClass);
  if (earlier.some(value => ![DIRECT_COMPOSITION_REVIEW_CLASS, SAVED_OUTPUT_CORRECTION_CLASS].includes(value as typeof DIRECT_COMPOSITION_REVIEW_CLASS))
    || new Set(earlier).size !== earlier.length) return null;
  const calls = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: root.id }, take: 2 });
  const call = record(calls[0]?.metadata);
  const debit = await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${root.id}` } });
  if (calls.length !== 1 || calls[0]!.id !== recovery.auditId || calls[0]!.actorId !== null || calls[0]!.targetType !== 'ai_gateway'
    || call.operation !== 'scientific_review' || call.outcome !== 'failed' || call.provider !== rootReview.provider || call.model !== rootReview.model
    || call.promptHash !== recoveryInput.promptHash || call.inputContentHash !== reference.contentHash
    || call.retryCount !== 0 || call.fallbackReason !== null || call.error !== 'scientific_review_failed'
    || !debit || debit.id !== recovery.reservationLedgerId || debit.userId !== run.actorId || debit.resource !== 'ai_credit'
    || BigInt(debit.delta) !== -1n || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
    || !isDeepStrictEqual(debit.metadata, { taskId: root.id, kind: 'sdf.extract', policy: 'charged-on-submit' })) return null;
  if (await findSavedIngestionCommit(tx, { taskId: source.id, researchObjectId: run.researchObjectId })
    || await tx.commit.findUnique({ where: { idempotencyKey: `ingestion-confirm:${source.id}` } })
    || await tx.commit.findUnique({ where: { idempotencyKey: `hermes-ingestion:${run.id}:${source.id}` } })
    || await tx.hermesResearchStep.findFirst({ where: { stage: 'source_ingestion', ingestionTaskId: source.id,
      runId: { not: run.id }, run: { status: { notIn: ['succeeded', 'failed', 'stopped'] } } }, select: { id: true } })) return null;
  const persistedInput: HermesPrivateSourceReanalysisInput = { intent: PRIVATE_SOURCE_REANALYSIS,
    sourceRunId: run.id, expectedRunVersion: run.version };
  return { run, source, current, anchor, reference, input: persistedInput, historicalSessionIds: [anchor, ...tasks].map(task => task.sessionId) };
}
type PrivateSourceReanalysisProof = NonNullable<Awaited<ReturnType<typeof inspectHermesPrivateSourceReanalysis>>>;

/** Extend the existing reanalysis request digest with the paid intent and CAS identity. */
export function privateSourceReanalysisRequestDigest(proof: PrivateSourceReanalysisProof): string {
  return createHash('sha256').update(JSON.stringify({ taskId: proof.source.id, sourceAgentTaskId: proof.current.id,
    artifactId: proof.source.artifactId, sourceMapSha256: proof.reference.serializedSha256, sourceReanalysis: proof.input })).digest('hex');
}

export async function requireNoPrivateSourceReanalysisWriter(tx: Prisma.TransactionClient, proof: PrivateSourceReanalysisProof, exceptTaskId?: string) {
  if (await tx.agentTask.findFirst({ where: { kind: 'sdf.extract', status: { in: ['pending', 'running'] },
    deletedAt: null, ...(exceptTaskId ? { id: { not: exceptTaskId } } : {}),
    session: { researchObjectId: proof.run.researchObjectId, deletedAt: null, status: 'active' },
    payload: { path: ['artifactId'], equals: proof.source.artifactId } }, select: { id: true } }))
    throw new Error('[blocked] Private source analysis has an active writer');
}

/** A replay reads the same paid operation after its normal run advances; this grants no Worker execution. */
async function inspectPrivateReanalysisSuccessor(tx: Prisma.TransactionClient, proof: PrivateSourceReanalysisProof,
  sourceId: string, ownerTaskId: string, composition: Prisma.AgentTaskGetPayload<{ include: { session: true } }>) {
  const bindings = await tx.hermesResearchStep.findMany({ where: { stage: 'source_ingestion', ordinal: 0,
    ingestionTaskId: sourceId, artifactId: proof.source.artifactId, agentTaskId: ownerTaskId }, take: 2 });
  const run = bindings.length === 1 ? await tx.hermesResearchRun.findUnique({ where: { id: bindings[0]!.runId },
    include: { steps: true } }) : null;
  const owner = await tx.agentTask.findUnique({ where: { id: ownerTaskId }, include: { session: true } });
  const canonical = run?.steps.filter(step => step.stage === 'source_ingestion') ?? [];
  const reviews = run?.steps.filter(step => step.stage === 'source_review') ?? [];
  const compositions = run?.steps.filter(step => step.stage === 'source_composition') ?? [];
  let anchor = composition;
  if (run && compositions.length === 2) {
    const recovered = await inspectHermesRecoveredSourceComposition(tx, run.id);
    if (!recovered || recovered.parent.id !== composition.id || !recovered.replacement
      || !isDeepStrictEqual(recovered.reference, proof.reference)) return null;
    if (!reviews.length && recovered.replacement.id === ownerTaskId) return { owner: recovered.replacement, run };
    anchor = recovered.replacement;
  } else if (run && compositions.length === 1 && reviews.length === 1) {
    const step = compositions[0]!;
    const task = step.agentTaskId ? await tx.agentTask.findUnique({ where: { id: step.agentTaskId }, include: { session: true } }) : null;
    const initialRows = task ? await tx.auditLog.findMany({ where: { action: 'ingestion.task.system_analysis_refresh', actorId: null,
      targetType: 'ingestion_task', targetId: sourceId, workspaceId: proof.run.researchObject.workspaceId,
      metadata: { path: ['newAgentTaskId'], equals: task.id } }, take: 2 }) : [];
    const initial = record(initialRows[0]?.metadata);
    const debit = task ? await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${task.id}` } }) : null;
    const taskKey = `ingestion-analysis-refresh:${sourceId}:${composition.id}:scientific-review-v4`;
    if (!task || step.ordinal !== 0 || step.status !== 'succeeded' || step.ingestionTaskId !== sourceId
      || step.artifactId !== proof.source.artifactId || step.presentationAssetId !== null
      || task.status !== 'succeeded' || task.kind !== 'sdf.extract' || task.deletedAt || task.retryCount !== 0
      || task.session.deletedAt || task.session.status !== 'active' || task.session.kind !== 'ingestion'
      || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || task.idempotencyKey !== taskKey || task.session.idempotencyKey !== `${taskKey}:session`
      || !isDeepStrictEqual(task.payload, { artifactId: proof.source.artifactId, researchObjectId: run.researchObjectId })
      || initialRows.length !== 1 || initial.executor !== 'hermes' || initial.authorizedByUserId !== run.actorId || initial.runId !== run.id
      || initial.stage !== 'source_composition' || initial.policy !== 'scientific_review_v4' || initial.oldAgentTaskId !== composition.id
      || initial.artifactId !== proof.source.artifactId || initial.sourceMapSha256 !== proof.reference.serializedSha256
      || initial.creditPolicy !== 'charged_ingestion_analysis_refresh'
      || !debit || debit.userId !== run.actorId || debit.resource !== 'ai_credit' || BigInt(debit.delta) !== -1n
      || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
      || !isDeepStrictEqual(debit.metadata, { taskId: task.id, kind: 'sdf.extract', policy: 'charged-on-submit' })) return null;
    anchor = task;
  }
  const composing = compositions.length === 1 && reviews.length === 0;
  const phase = composing ? compositions[0]! : reviews[0];
  const key = composing ? `ingestion-analysis-refresh:${sourceId}:${composition.id}:scientific-review-v4`
    : `ingestion-analysis-compose:${sourceId}:${anchor.id}:${anchor.id}:scientific-review-v4`;
  if (!run || !owner || run.id === proof.run.id || run.actorId !== proof.run.actorId || run.researchObjectId !== proof.run.researchObjectId
    || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || canonical.length !== 1 || !phase
    || (!composing && (compositions.length > 2 || reviews.length !== 1))
    || !['running', 'awaiting_source_review', 'awaiting_claim_review', 'generating_storyboard', 'awaiting_storyboard_review',
      'generating_scene_images', 'awaiting_scene_images_review', 'generating_video', 'awaiting_video_review', 'succeeded', 'failed', 'stopped'].includes(run.status)
    || [canonical[0]!, phase].some(step => step.ordinal !== 0 || step.agentTaskId !== owner.id
      || step.ingestionTaskId !== sourceId || step.artifactId !== proof.source.artifactId || step.presentationAssetId !== null)
    || composition.status !== 'succeeded' || anchor.status !== 'succeeded' || owner.deletedAt || owner.kind !== 'sdf.extract' || owner.retryCount !== 0
    || owner.session.deletedAt || owner.session.status !== 'active' || owner.session.kind !== 'ingestion'
    || owner.session.userId !== run.actorId || owner.session.researchObjectId !== run.researchObjectId
    || owner.idempotencyKey !== key || owner.session.idempotencyKey !== `${key}:session`
    || !isDeepStrictEqual(owner.payload, { artifactId: proof.source.artifactId, researchObjectId: run.researchObjectId })) return null;
  const rows = await tx.auditLog.findMany({ where: { action: 'ingestion.task.system_analysis_refresh',
    targetType: 'ingestion_task', targetId: sourceId, actorId: null, workspaceId: proof.run.researchObject.workspaceId,
    metadata: { path: ['newAgentTaskId'], equals: owner.id } }, take: 2 });
  const metadata = record(rows[0]?.metadata);
  const reviewMode = composing ? undefined : initialReviewMode(metadata);
  if (rows.length !== 1 || metadata.executor !== 'hermes' || metadata.authorizedByUserId !== run.actorId || metadata.runId !== run.id
    || metadata.stage !== (composing ? 'source_composition' : 'source_review')
    || (composing ? metadata.policy !== 'scientific_review_v4' : !reviewMode || metadata.compositionSourceAgentTaskId !== anchor.id)
    || metadata.oldAgentTaskId !== anchor.id
    || metadata.artifactId !== proof.source.artifactId || metadata.sourceMapSha256 !== proof.reference.serializedSha256
    || metadata.creditPolicy !== 'charged_ingestion_analysis_refresh') return null;
  try {
    for (const task of [composition, anchor]) {
      if (record(task.result).canonicalExtractionContract !== 'grounded-passages-v2'
        || !isDeepStrictEqual(parseDocumentSourceMapReference(record(task.result).sourceMapRef), proof.reference)) return null;
    }
    if (owner.status === 'succeeded') {
      const result = record(owner.result); const review = record(result.scientificReview);
      if (result.canonicalExtractionContract !== 'grounded-passages-v2'
        || (composing ? review.kind !== 'model_self_check' || review.contractVersion !== '4'
          : review.contractVersion !== '5' || review.sourceAgentTaskId !== anchor.id
            || (reviewMode === 'web' ? review.kind !== 'independent_review'
              || review.provider !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider || review.model !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel
              : review.kind !== 'model_self_check'))
        || !isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), proof.reference)) return null;
    }
  } catch { return null; }
  return { owner, run };
}

/** Replay still proves the actor/source, persisted paid receipt, fixed batch, fresh session and task. */
export async function readHermesPrivateSourceReanalysisReplay(tx: Prisma.TransactionClient, proof: PrivateSourceReanalysisProof) {
  const batch = await tx.ingestionBatch.findUnique({ where: { idempotencyKey: privateSourceReanalysisBatchKey(proof.input) },
    include: { tasks: { include: { artifact: true, agentTask: { include: { session: true } } } } } });
  if (!batch) return null;
  const candidate = batch.tasks[0];
  const rows = candidate ? await tx.auditLog.findMany({ where: { action: 'ingestion.task.reanalyze',
    targetType: 'ingestion_task', targetId: candidate.id }, take: 2 }) : [];
  const receipt = rows[0]; const metadata = record(receipt?.metadata);
  const task = typeof metadata.newAgentTaskId === 'string'
    ? await tx.agentTask.findUnique({ where: { id: metadata.newAgentTaskId }, include: { session: true } }) : null;
  const debit = task ? await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${task.id}` } }) : null;
  if (batch.userId !== proof.run.actorId || batch.researchObjectId !== proof.run.researchObjectId
    || batch.requestDigest !== privateSourceReanalysisRequestDigest(proof) || batch.tasks.length !== 1 || !candidate || !task
    || candidate.id === proof.source.id || candidate.artifactId !== proof.source.artifactId || task.deletedAt || task.kind !== 'sdf.extract'
    || task.id === proof.current.id || task.session.deletedAt || task.session.status !== 'active' || task.session.kind !== 'ingestion'
    || proof.historicalSessionIds.includes(task.sessionId) || batch.agentSessionId !== task.sessionId
    || task.session.userId !== proof.run.actorId || task.session.researchObjectId !== proof.run.researchObjectId
    || task.session.idempotencyKey !== `${batch.idempotencyKey}:session`
    || task.idempotencyKey !== `ingestion-analysis-reanalysis:${candidate.id}:${proof.current.id}`
    || !isDeepStrictEqual(task.payload, { artifactId: proof.source.artifactId, researchObjectId: proof.run.researchObjectId })
    || rows.length !== 1 || receipt!.actorId !== proof.run.actorId || receipt!.workspaceId !== proof.run.researchObject.workspaceId
    || metadata.intent !== PRIVATE_SOURCE_REANALYSIS || metadata.sourceRunId !== proof.run.id || metadata.expectedRunVersion !== proof.run.version
    || metadata.creditPolicy !== 'fresh_task_charge' || metadata.confirmationPolicy !== 'new_draft'
    || metadata.sourceIngestionTaskId !== proof.source.id || metadata.sourceAgentTaskId !== proof.current.id
    || metadata.newAgentTaskId !== task.id || metadata.artifactId !== proof.source.artifactId || metadata.sourceMapSha256 !== proof.reference.serializedSha256
    || !debit || debit.userId !== proof.run.actorId || debit.resource !== 'ai_credit' || BigInt(debit.delta) !== -1n
    || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
    || !isDeepStrictEqual(debit.metadata, { taskId: task.id, kind: 'sdf.extract', policy: 'charged-on-submit' }))
    throw new Error('[blocked] Private source analysis replay binding changed');
  if (candidate.agentTaskId !== task.id) {
    const successor = candidate.agentTaskId
      ? await inspectPrivateReanalysisSuccessor(tx, proof, candidate.id, candidate.agentTaskId, task) : null;
    const successorDebit = successor ? await tx.usageLedger.findUnique({
      where: { idempotencyKey: `agent-task-reserve:${successor.owner.id}` },
    }) : null;
    if (!successor || successor.owner.id !== candidate.agentTaskId || successor.run.actorId !== proof.run.actorId
      || successor.run.researchObjectId !== proof.run.researchObjectId
      || !successorDebit || successorDebit.userId !== proof.run.actorId || successorDebit.resource !== 'ai_credit'
      || BigInt(successorDebit.delta) !== -1n || successorDebit.kind !== 'consume'
      || successorDebit.reason !== 'Agent task reservation sdf.extract'
      || !isDeepStrictEqual(successorDebit.metadata,
        { taskId: successor.owner.id, kind: 'sdf.extract', policy: 'charged-on-submit' }))
      throw new Error('[blocked] Private source analysis replay binding changed');
  }
  return candidate;
}

/** Worker seam: task payloads cannot choose a private mode or SourceMap. */
export async function resolveHermesPrivateSourceReanalysisExecution(tx: Prisma.TransactionClient,
  input: HermesPrivateSourceReanalysisExecutionInput): Promise<HermesPrivateSourceReanalysisExecution | null> {
  const ingestion = await tx.ingestionTask.findUnique({ where: { id: input.ingestionTaskId }, include: { batch: true } });
  const owner = await tx.agentTask.findUnique({ where: { id: input.ownerTaskId }, include: { session: true } });
  const rows = await tx.auditLog.findMany({ where: { action: 'ingestion.task.reanalyze',
    targetType: 'ingestion_task', targetId: input.ingestionTaskId }, take: 2 });
  const metadata = record(rows[0]?.metadata);
  const privateMarker = metadata.intent !== undefined || metadata.sourceRunId !== undefined || metadata.expectedRunVersion !== undefined
    || metadata.creditPolicy === 'fresh_task_charge'
    || ingestion?.batch.idempotencyKey?.startsWith(PRIVATE_REANALYSIS_BATCH_PREFIX)
    || owner?.session.idempotencyKey?.startsWith(PRIVATE_REANALYSIS_BATCH_PREFIX)
    || record(owner?.payload).sourceReanalysis !== undefined;
  if (!privateMarker) return null;
  const blocked = () => { throw new Error('[blocked] Private source analysis execution binding changed'); };
  const privateInput = { intent: metadata.intent, sourceRunId: metadata.sourceRunId, expectedRunVersion: metadata.expectedRunVersion };
  if (rows.length !== 1 || !validPrivateSourceReanalysisInput(privateInput)) return blocked();
  const proof = await inspectHermesPrivateSourceReanalysis(tx, privateInput);
  const replay = proof ? await readHermesPrivateSourceReanalysisReplay(tx, proof) : null;
  if (!proof || !owner || !ingestion || !replay || metadata.newAgentTaskId !== owner.id
    || replay.id !== input.ingestionTaskId || replay.agentTaskId !== owner.id
    || ingestion.agentTaskId !== owner.id || input.sourceAgentTaskId !== proof.current.id
    || owner.status !== 'running' || owner.executionAttempt !== input.executionAttempt || !Number.isSafeInteger(input.executionAttempt)
    || input.executionAttempt < 1 || !['queued', 'parsing'].includes(ingestion.state)) return blocked();
  await requireNoPrivateSourceReanalysisWriter(tx, proof, owner.id);
  return { sourceMapRef: proof.reference };
}

/** Verify the persisted response identity; the Worker still owns full source/Claims validation. */
function savedReviewOutput(taskId: string, review: Record<string, unknown>, result: Record<string, unknown>,
  originalCore: Record<string, unknown>, audit: Array<{ id: string; metadata: unknown }>, expectedAttempts = 2) {
  const outputs = review.rejectedOutputs;
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > 2
    || outputs.some((item, index) => !Number.isInteger(record(item).structuredAttempt)
      || Number(record(item).structuredAttempt) < 1 || Number(record(item).structuredAttempt) > 2
      || (index > 0 && Number(record(item).structuredAttempt) <= Number(record(outputs[index - 1]).structuredAttempt)))) return null;
  const last = record(outputs[outputs.length - 1]);
  const usage = record(last.usage);
  const call = record(audit[audit.length - 1]?.metadata);
  const diagnostic = typeof last.diagnostic === 'string' ? last.diagnostic : '';
  const claimsFailure = /^claims_(required_missing|invalid_structure|source_unmaterializable|core_missing)$/.exec(diagnostic);
  if (!claimsFailure || last.kind !== 'schema_validation' || last.finishReason !== 'stop'
    || last.structuredAttempt !== expectedAttempts || audit.length !== expectedAttempts || last.omissionReason != null
    || typeof last.text !== 'string' || !last.text || !sha256(last.responseHash) || !sha256(last.promptHash)
    || !tokenCount(last.byteLength) || last.byteLength > 131_072 || Buffer.byteLength(last.text, 'utf8') !== last.byteLength
    || createHash('sha256').update(last.text).digest('hex') !== last.responseHash
    || typeof last.provider !== 'string' || typeof last.model !== 'string'
    || last.provider !== call.provider || last.model !== call.model || last.promptHash !== call.promptHash
    || usage.inputTokens !== call.inputTokens || usage.outputTokens !== call.outputTokens
    || SDF_CORE_FIELDS.some(field => record(result.fieldDiagnosticsDetails)[field]
      !== `scientificReview=review_contract_incomplete;reviewedClaims=${claimsFailure[1]}`)) return null;
  let body: Record<string, unknown>;
  try {
    // Preserve the exact raw bytes for the assistant message; unwrap only for eligibility inspection.
    const text = last.text.trim();
    const json = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text)?.[1] ?? text;
    body = record(JSON.parse(json));
  } catch { return null; }
  const fields = record(body.fields);
  if (Object.keys(body).filter(key => key !== 'claimSuggestions').sort().join(',') !== 'fields,needsMoreEvidence'
    || !isDeepStrictEqual(body.needsMoreEvidence, [])
    || Object.keys(fields).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(',')
    || SDF_CORE_FIELDS.some(field => {
      const item = record(fields[field]);
      return Object.keys(item).sort().join(',') !== 'issues,sourcePassageIds,summary,verdict'
        || !['accepted', 'revised'].includes(String(item.verdict)) || typeof item.summary !== 'string' || !item.summary.trim()
        || !Array.isArray(item.issues) || !Array.isArray(item.sourcePassageIds) || !item.sourcePassageIds.length
        || new Set(item.sourcePassageIds).size !== item.sourcePassageIds.length
        || item.sourcePassageIds.some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
        || (item.verdict === 'accepted' && (item.summary !== originalCore[field]
          || item.summary !== record(result.unverifiedSummaries)[field]
          || !isDeepStrictEqual(item.sourcePassageIds, record(result.unverifiedSourcePassageIds)[field])));
    })) return null;
  const identity = { sourceTaskId: taskId, structuredAttempt: expectedAttempts,
    responseHash: last.responseHash, promptHash: last.promptHash, provider: last.provider, model: last.model, byteLength: last.byteLength };
  const output: HermesSavedSourceReviewOutput = { ...identity, text: last.text };
  const evidence: SavedOutputEvidence = { ...identity, reviewedCandidateHash: review.reviewedCandidateHash as string,
    structuredReviewAuditIds: audit.map(row => row.id) };
  return { output, evidence };
}
type ContractRepairEvidence = {
  reviewedCandidateHash: string; promptHash: string; responseHash: string;
  reviewSkill: { id: 'scientific-critical-thinking'; version: '3' };
};
type SchemaContractRepairEvidence = {
  scientificAnchorTaskId: string; failedContractTaskId: string; reviewedCandidateHash: string;
  scientificAnchorEvidence: ContractRepairEvidence; schemaContractAuditIds: string[];
};

/** Read-only eligibility for an explicit paid recovery, never spend authorization or scientific approval. */
export async function inspectHermesSourceReviewRecovery(tx: Prisma.TransactionClient, runId: string,
  replacementTaskId?: string, canRetryBeforeSubmission?: SourceReviewNotSubmittedVerifier) {
  return inspectHermesSourceReviewForPurpose(tx, runId, replacementTaskId, canRetryBeforeSubmission, 'execution');
}

/** Completed history proves only eligibility for a separate paid private analysis. */
async function inspectCompletedHermesSourceReviewHistory(tx: Prisma.TransactionClient, runId: string, replacementTaskId: string) {
  return inspectHermesSourceReviewForPurpose(tx, runId, replacementTaskId, undefined, 'completed-history');
}

async function inspectHermesSourceReviewForPurpose(tx: Prisma.TransactionClient, runId: string,
  replacementTaskId: string | undefined, canRetryBeforeSubmission: SourceReviewNotSubmittedVerifier | undefined,
  purpose: 'execution' | 'completed-history') {
  const history = purpose === 'completed-history';
  const run = await tx.hermesResearchRun.findUnique({ where: { id: runId },
    include: { steps: true, researchObject: true } });
  if (!run || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.versionId !== null
    || run.sourceClaimIds.length || run.sourceReviewDigest || run.researchObject.status !== 'draft' || run.researchObject.deletedAt
    || !(history ? run.status === 'failed' && Boolean(replacementTaskId)
      : replacementTaskId ? ['running', 'awaiting_source_review'].includes(run.status) : run.status === 'failed')) return null;
  const canonical = run.steps.filter(step => step.stage === 'source_ingestion');
  const compositions = run.steps.filter(step => step.stage === 'source_composition').sort((a, b) => a.ordinal - b.ordinal);
  const reviews = run.steps.filter(step => step.stage === 'source_review').sort((a, b) => a.ordinal - b.ordinal);
  const directComposition = compositions.length === 0;
  const recoveredComposition = compositions.length === 2 ? await inspectHermesRecoveredSourceComposition(tx, run.id) : null;
  if (canonical.length !== 1 || canonical[0]!.ordinal !== 0 || compositions.length > 2
    || (!directComposition && compositions.some((step, index) => step.ordinal !== index))
    || (compositions.length === 2 && !recoveredComposition)
    // Historical model recoveries and the independent role are distinguished by their receipts below.
    || reviews.length < (replacementTaskId ? 2 : 1)
    || reviews.some((step, index) => step.ordinal !== index || !step.agentTaskId)
    || (replacementTaskId && reviews[reviews.length - 1]!.agentTaskId !== replacementTaskId)
    || run.steps.length !== canonical.length + compositions.length + reviews.length) return null;
  // Keep room for a storyboard, one scene, and its bounded correction.
  const sourceCount = compositions.length + reviews.length + (replacementTaskId ? 0 : 1);
  if (sourceCount + 3 > run.maxAgentTasks) return null;
  const failedSteps = replacementTaskId ? reviews.slice(0, -1) : reviews;
  if (failedSteps.some((step, index) => (index < failedSteps.length - 1 || Boolean(replacementTaskId))
    ? step.status !== 'failed' : !['waiting', 'running', 'failed'].includes(step.status))) return null;
  const sourceStep = canonical[0]!;
  const originalStep = failedSteps[failedSteps.length - 1]!;
  if (directComposition && originalStep.status !== 'failed') return null;
  const compositionStep = compositions.at(-1);
  if (!sourceStep.ingestionTaskId || !sourceStep.artifactId || !originalStep.agentTaskId
    || (!directComposition && !compositionStep?.agentTaskId)
    || run.steps.some(step => step.ingestionTaskId !== sourceStep.ingestionTaskId || step.artifactId !== sourceStep.artifactId
      || step.presentationAssetId !== null)) return null;
  const source = await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId },
    include: { artifact: true, batch: true } });
  const reviewTasks = await tx.agentTask.findMany({ where: { id: { in: reviews.map(step => step.agentTaskId!) } }, include: { session: true } });
  const byId = new Map(reviewTasks.map(task => [task.id, task]));
  if (reviewTasks.length !== reviews.length) return null;
  const initialReview = record(record(byId.get(reviews[0]!.agentTaskId!)?.result).scientificReview);
  const packetLineage = !directComposition && initialReview.kind === 'independent_review'
    && initialReview.status === 'awaiting_review_evidence';
  const recoveryReceipts = new Map<string, Record<string, unknown>>();
  if (directComposition || packetLineage) {
    for (const step of reviews.filter(step => step.ordinal > 0)) {
      const receipts = await tx.auditLog.findMany({ where: {
        action: 'hermes.research_run.source_review_recovery', targetType: 'hermes_research_run', targetId: run.id,
        actorId: run.actorId, workspaceId: run.researchObject.workspaceId,
        metadata: { path: ['newAgentTaskId'], equals: step.agentTaskId! },
      }, take: 2 });
      if (receipts.length !== 1) return null;
      recoveryReceipts.set(step.agentTaskId!, record(receipts[0]!.metadata));
    }
  }
  const failed = byId.get(originalStep.agentTaskId!);
  if (readNativeSourceReview(failed?.result)?.attempts.some(a => a.state === 'started')) return null;
  const anchorId = directComposition
    ? record(record(byId.get(reviews[0]!.agentTaskId!)?.result).scientificReview).sourceAgentTaskId
    : compositionStep!.agentTaskId;
  if (typeof anchorId !== 'string' || !anchorId || reviews.some(step => step.agentTaskId === anchorId)) return null;
  const composition = await tx.agentTask.findUnique({ where: { id: anchorId }, include: { session: true } });
  const replacement = replacementTaskId ? byId.get(replacementTaskId) : null;
  if (history && (!replacement || replacement.status !== 'succeeded' || replacement.executionAttempt !== 1
    || replacement.retryCount !== 0 || reviews.at(-1)?.status !== 'failed' || source?.state !== 'needs_review'
    || record(record(replacement.result).scientificReview).kind !== 'independent_review'
    || record(record(replacement.result).scientificReview).contractVersion !== '5'
    || record(record(replacement.result).scientificReview).status !== 'blocked_scientific_review')) return null;
  if (!source || !failed || !composition || (replacementTaskId && !replacement)
    || source.agentTaskId !== (replacementTaskId ?? failed.id) || sourceStep.agentTaskId !== source.agentTaskId
    || source.artifactId !== sourceStep.artifactId || source.batch.userId !== run.actorId
    || source.batch.researchObjectId !== run.researchObjectId || source.artifact.workspaceId !== run.researchObject.workspaceId
    || source.artifact.deletedAt || source.artifact.bytesPurgedAt || source.retryCount !== 0
    || !(replacementTaskId ? ['queued', 'parsing', 'needs_review', 'confirmed'].includes(source.state) : source.state === 'needs_review')
    || failed.status !== 'succeeded' || failed.executionAttempt !== 1 || failed.retryCount !== 0
    || composition.status !== 'succeeded') return null;
  for (const task of [composition, ...reviewTasks]) {
    const payload = record(task.payload);
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || Object.keys(payload).sort().join(',') !== 'artifactId,researchObjectId'
      || payload.artifactId !== source.artifactId || payload.researchObjectId !== run.researchObjectId) return null;
  }
  const recoveryKey = `ingestion-analysis-compose:${source.id}:${failed.id}:${composition.id}:scientific-review-v4`;
  for (const step of reviews) {
    const task = byId.get(step.agentTaskId!)!;
    const predecessorId = step.ordinal === 0 ? composition.id : reviews[step.ordinal - 1]!.agentTaskId!;
    const key = `ingestion-analysis-compose:${source.id}:${predecessorId}:${composition.id}:scientific-review-v4`;
    if (task.idempotencyKey !== key) return null;
    if (step.ordinal === 0 && task.session.idempotencyKey !== `${key}:session`) return null;
    if (step.ordinal > 0) {
      const prefix = `${key}:hermes-recovery:`;
      if (!task.session.idempotencyKey?.startsWith(prefix)
        || !/^[a-f0-9]{64}$/.test(task.session.idempotencyKey.slice(prefix.length))) return null;
    }
  }
  const technicalReplacement = replacement && recoveryReceipts.get(replacement.id)?.recoveryClass === SOURCE_REVIEW_NOT_SUBMITTED;
  if (history && !technicalReplacement) return null;
  const isIndependentIntent = (value: unknown) => value === INDEPENDENT_REVIEW_CLASS || value === PACKET_OVERFLOW_REVIEW_CLASS;
  const independentReplacement = replacement && (isIndependentIntent(recoveryReceipts.get(replacement.id)?.recoveryClass) || technicalReplacement);
  const technicalRoots = failedSteps.filter(step => isIndependentIntent(recoveryReceipts.get(step.agentTaskId!)?.recoveryClass));
  if (technicalRoots.length > 1 || (technicalRoots.length && (technicalRoots[0]!.id !== originalStep.id
    || (replacement && !technicalReplacement) || run.steps.length + (replacement ? 0 : 1) + 3 > run.maxAgentTasks))) return null;
  let technicalRecovery: { input: SourceReviewNotSubmittedInput; originalTaskId: string; reservationLedgerId: string;
    reservationIdempotencyKey: string; auditId: string } | undefined;
  if (replacement && (replacement.retryCount !== 0 || (!independentReplacement && replacement.executionAttempt > 1)
    || !['pending', 'running', 'succeeded'].includes(replacement.status))) return null;
  const original = record(composition.result);
  const originalReview = record(original.scientificReview);
  const originalCore = record(original.core);
  const evidence = record(original.evidence);
  let candidateHash: string | undefined;
  const auditIds: string[] = [];
  const failureClassifications: string[] = [];
  const genericFailureTaskIds = new Set<string>();
  const contractRepairAuditIds: string[] = [];
  const contractRepairs = new Map<string, ContractRepairEvidence>();
  const schemaRepairs = new Map<string, SchemaContractRepairEvidence>();
  const freshReviews = new Map<string, FreshReviewEvidence>();
  const savedOutputs = new Map<string, NonNullable<ReturnType<typeof savedReviewOutput>>>();
  let packetFailureEvidence: PacketFailureEvidence | undefined;
  try {
    if (automaticIngestionReviewStage({ artifactId: source.artifactId, artifact: source.artifact, agentTask: composition }) !== 'source_review'
      || originalReview.contractVersion !== '4') return null;
  } catch { return null; }
  if (directComposition && (originalReview.kind !== 'model_self_check' || originalReview.status !== 'review_received'
    || !isDeepStrictEqual(originalReview.compositionSkill, { id: 'scientific-summary', version: '6' })
    || record(originalReview.semanticStage).kind !== 'semantic_reduce'
    || !isDeepStrictEqual(original.needsMoreInformation, []) || !sha256(originalReview.reviewedCandidateHash)
    || typeof originalReview.provider !== 'string' || !originalReview.provider
    || typeof originalReview.model !== 'string' || !originalReview.model
    || originalReview.finishReason !== 'stop' || !sha256(originalReview.promptHash) || !sha256(originalReview.responseHash))) return null;
  for (const step of failedSteps) {
    const task = byId.get(step.agentTaskId!)!;
    if (task.status !== 'succeeded' || task.executionAttempt !== 1 || task.retryCount !== 0) return null;
    const result = record(task.result);
    const review = record(result.scientificReview);
    const details = record(result.fieldDiagnosticsDetails);
    const diagnostics = record(result.fieldDiagnostics);
    const summaries = record(result.unverifiedSummaries);
    const ids = record(result.unverifiedSourcePassageIds);
    if (packetLineage && step.ordinal === 0) {
      const receipts = await tx.auditLog.findMany({ where: { action: 'ingestion.task.system_analysis_refresh',
        targetType: 'ingestion_task', targetId: source.id, actorId: null, workspaceId: run.researchObject.workspaceId,
        metadata: { path: ['newAgentTaskId'], equals: task.id } }, take: 2 });
      const initial = record(receipts[0]?.metadata);
      const calls = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: task.id }, take: 1 });
      const debit = await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${task.id}` } });
      let reference: DocumentSourceMapReference;
      try {
        reference = parseDocumentSourceMapReference(original.sourceMapRef);
        if (!isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), reference)) return null;
      } catch { return null; }
      if (step.status !== 'failed' || receipts.length !== 1 || calls.length || initial.executor !== 'hermes'
        || initial.authorizedByUserId !== run.actorId || initial.runId !== run.id || initial.stage !== 'source_review'
        || initial.artifactId !== source.artifactId || initial.oldAgentTaskId !== composition.id
        || initial.compositionSourceAgentTaskId !== composition.id || initial.sourceMapSha256 !== reference.serializedSha256
        || initial.policy !== 'scientific_review_v4_independent' || !independentMode(initial)
        || initial.creditPolicy !== 'charged_ingestion_analysis_refresh'
        || !debit || debit.userId !== run.actorId || debit.resource !== 'ai_credit' || BigInt(debit.delta) !== -1n
        || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
        || !isDeepStrictEqual(debit.metadata, { taskId: task.id, kind: 'sdf.extract', policy: 'charged-on-submit' })
        || review.contractVersion !== '5' || review.kind !== 'independent_review' || review.status !== 'awaiting_review_evidence'
        || review.provider !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider || review.model !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel
        || review.sourceAgentTaskId !== composition.id || !uuid(review.attemptId) || !sha256(review.reviewedCandidateHash)
        || !isDeepStrictEqual(review.semanticStage, originalReview.semanticStage)
        || !isDeepStrictEqual(review.compositionSkill, originalReview.compositionSkill)
        || ['promptHash', 'responseHash', 'usage', 'finishReason', 'fieldReviews', 'needsMoreEvidence', 'rejectedOutputs', 'rejectedCandidates']
          .some(key => review[key] !== undefined)
        || 'reviewedClaimSuggestions' in result || 'rejectedCandidates' in result
        || result.canonicalExtractionContract !== 'grounded-passages-v2' || result.reason !== 'canonical_partial_validation_exhausted'
        || !isDeepStrictEqual(result.needsMoreInformation, [...SDF_CORE_FIELDS])
        || record(result.core).schemaVersion !== originalCore.schemaVersion
        || Object.keys(record(result.core)).sort().join(',') !== ['schemaVersion', ...SDF_CORE_FIELDS].sort().join(',')
        || [diagnostics, details, summaries, ids, record(result.evidence), record(result.evidenceSegments)]
          .some(value => Object.keys(value).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(','))
        || SDF_CORE_FIELDS.some(field => {
          const locator = record(evidence[field]).locator;
          const originalIds = typeof locator === 'string' && /^passages:P\d{5}(?:,P\d{5})*$/.test(locator) ? locator.slice(9).split(',') : null;
          return record(result.core)[field] !== '' || diagnostics[field] !== 'malformed_item'
            || details[field] !== 'scientificReview=required_review_context_too_large'
            || summaries[field] !== originalCore[field] || !originalIds || !isDeepStrictEqual(ids[field], originalIds)
            || !isDeepStrictEqual(record(result.evidence)[field], { quote: '', locator: '' })
            || !isDeepStrictEqual(record(result.evidenceSegments)[field], []);
        })) return null;
      candidateHash = review.reviewedCandidateHash;
      packetFailureEvidence = { sourceTaskId: task.id, compositionSourceAgentTaskId: composition.id,
        initialReviewAuditId: receipts[0]!.id, reviewedCandidateHash: candidateHash, sourceMapSha256: reference.serializedSha256 };
      genericFailureTaskIds.add(task.id);
      failureClassifications.push('required_review_context_too_large');
      continue;
    }
    if (technicalRoots[0]?.id === step.id) {
      const reference = parseDocumentSourceMapReference(original.sourceMapRef);
      const calls = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: task.id }, take: 2 });
      const call = record(calls[0]?.metadata);
      const debit = await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${task.id}` } });
      if (calls.length !== 1 || calls[0]!.actorId !== null || calls[0]!.targetType !== 'ai_gateway'
        || call.operation !== 'scientific_review' || call.outcome !== 'failed'
        || call.provider !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider || call.model !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel
        || call.inputContentHash !== source.artifact.blobSha256 || !sha256(call.promptHash)
        || call.retryCount !== 0 || call.fallbackReason !== null || call.error !== 'scientific_review_failed'
        || review.kind !== 'independent_review' || review.status !== 'blocked_scientific_review' || review.contractVersion !== '5'
        || review.provider !== call.provider || review.model !== call.model || review.sourceAgentTaskId !== composition.id
        || typeof review.attemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(review.attemptId)
        || (review.promptHash !== undefined && review.promptHash !== call.promptHash) || review.responseHash !== undefined
        || review.fieldReviews !== undefined || review.needsMoreEvidence !== undefined || result.reviewedClaimSuggestions !== undefined
        || result.canonicalExtractionContract !== 'grounded-passages-v2' || review.reviewedCandidateHash !== candidateHash
        || !isDeepStrictEqual(review.semanticStage, originalReview.semanticStage)
        || !isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), reference)
        || !isDeepStrictEqual(result.needsMoreInformation, [...SDF_CORE_FIELDS])
        || Object.keys(details).length !== SDF_CORE_FIELDS.length
        || SDF_CORE_FIELDS.some(field => details[field] !== 'scientificReview=unavailable'
          || originalCore[field] !== summaries[field] || !Array.isArray(ids[field]) || !(ids[field] as unknown[]).length
          || (ids[field] as unknown[]).some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
          || record(evidence[field]).locator !== `passages:${(ids[field] as unknown[]).join(',')}`
          || record(result.core)[field] !== '' || diagnostics[field] !== 'malformed_item'
          || !isDeepStrictEqual(record(result.evidence)[field], { quote: '', locator: '' })
          || !isDeepStrictEqual(record(result.evidenceSegments)[field], []))
        || !debit || debit.userId !== run.actorId || debit.resource !== 'ai_credit' || BigInt(debit.delta) !== -1n
        || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
        || !isDeepStrictEqual(debit.metadata, { taskId: task.id, kind: 'sdf.extract', policy: 'charged-on-submit' })) return null;
      technicalRecovery = { input: { requestId: review.attemptId, promptHash: call.promptHash,
        artifactId: source.artifactId, documentSha256: reference.contentHash, candidateHash: candidateHash!, sourceMapHash: reference.serializedSha256 },
        originalTaskId: task.id, reservationLedgerId: debit.id, reservationIdempotencyKey: debit.idempotencyKey!, auditId: calls[0]!.id };
      if (!technicalReplacement && (!canRetryBeforeSubmission || !await canRetryBeforeSubmission(technicalRecovery.input))) return null;
      continue;
    }
    if (review.contractVersion !== '5' || review.kind !== 'model_self_check'
      || review.sourceAgentTaskId !== composition.id || result.canonicalExtractionContract !== 'grounded-passages-v2'
      || !sha256(review.reviewedCandidateHash)
      || (candidateHash !== undefined && review.reviewedCandidateHash !== candidateHash)
      || !isDeepStrictEqual(review.semanticStage, originalReview.semanticStage)) return null;
    candidateHash = review.reviewedCandidateHash;
    try {
      if (!isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), parseDocumentSourceMapReference(original.sourceMapRef))) return null;
    } catch { return null; }
    const audit = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: task.id },
      orderBy: { createdAt: 'asc' }, take: 17 });
    if (!audit.length || audit.length > 16) return null;
    if (directComposition) {
      const incomingReceipt = recoveryReceipts.get(task.id);
      // Once an independent task exists, a failed/unknown outcome cannot authorize a second intent.
      if (incomingReceipt?.recoveryClass === INDEPENDENT_REVIEW_CLASS) return null;
      const expectedAttempts = incomingReceipt?.recoveryClass === SAVED_OUTPUT_CORRECTION_CLASS ? 1 : 2;
      const schemaDetail = details[SDF_CORE_FIELDS[0]!];
      const savedFailure = typeof schemaDetail === 'string'
        && /^scientificReview=review_contract_incomplete;reviewedClaims=(required_missing|invalid_structure|source_unmaterializable|core_missing)$/.test(schemaDetail);
      if (review.status !== 'blocked_scientific_review'
        || !isDeepStrictEqual(review.reviewSkill, { id: 'scientific-critical-thinking', version: '5' })
        || !isDeepStrictEqual(review.compositionSkill, originalReview.compositionSkill)
        || review.fieldReviews != null || review.needsMoreEvidence != null || review.provider != null || review.model != null
        || review.promptHash != null || review.responseHash != null || review.usage != null || review.finishReason != null
        || 'reviewedClaimSuggestions' in result || 'rejectedCandidates' in review || 'rejectedCandidates' in result
        || result.reason !== 'canonical_partial_validation_exhausted'
        || !isDeepStrictEqual(result.needsMoreInformation, [...SDF_CORE_FIELDS])
        || record(result.core).schemaVersion !== originalCore.schemaVersion
        || Object.keys(record(result.core)).sort().join(',') !== ['schemaVersion', ...SDF_CORE_FIELDS].sort().join(',')
        || [diagnostics, details, summaries, ids, record(result.evidence), record(result.evidenceSegments)]
          .some(value => Object.keys(value).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(','))
        || SDF_CORE_FIELDS.some(field => diagnostics[field] !== 'malformed_item'
          || details[field] !== schemaDetail || (!savedFailure && schemaDetail !== 'scientificReview=STRUCTURED_JSON_INVALID')
          || record(result.core)[field] !== ''
          || summaries[field] !== originalCore[field] || !Array.isArray(ids[field]) || !(ids[field] as unknown[]).length
          || (ids[field] as unknown[]).some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
          || record(evidence[field]).locator !== `passages:${(ids[field] as unknown[]).join(',')}`
          || !isDeepStrictEqual(record(result.evidence)[field], { quote: '', locator: '' })
          || !isDeepStrictEqual(record(result.evidenceSegments)[field], []))
        || audit.length !== expectedAttempts) return null;
      for (const row of audit) {
        const call = record(row.metadata);
        if (row.requestId !== task.id || row.actorId !== null || row.targetType !== 'ai_gateway'
          || call.operation !== 'text' || call.outcome !== 'succeeded' || call.finishReason !== 'stop'
          || call.provider !== originalReview.provider || call.model !== originalReview.model
          || call.fallbackReason !== null || call.retryCount !== 0 || call.error !== null
          || !sha256(call.promptHash) || !tokenCount(call.inputTokens) || !tokenCount(call.outputTokens)) return null;
      }
      if (savedFailure) {
        const saved = savedReviewOutput(task.id, review, result, originalCore, audit, expectedAttempts);
        if (!saved) return null;
        savedOutputs.set(task.id, saved);
      } else {
        // The fresh-review slot belongs only to the initial failure.
        if (step.ordinal !== 0) return null;
        freshReviews.set(task.id, { reviewedCandidateHash: review.reviewedCandidateHash,
          structuredReviewAuditIds: audit.map(row => row.id), freshReview: true, savedOutputReused: false });
      }
      continue;
    }
    if (review.status === 'review_received') {
      // A historical accepted draft can lack the now-required Claims contract.
      // This permits another explicit review of the same draft, never a save or approval.
      const fieldReviews = record(review.fieldReviews);
      const usage = record(review.usage);
      if ('reviewedClaimSuggestions' in result
        || !isDeepStrictEqual(review.reviewSkill, { id: 'scientific-critical-thinking', version: '3' })
        || !isDeepStrictEqual(review.needsMoreEvidence, []) || !isDeepStrictEqual(result.needsMoreInformation, [])
        || (result.reason != null && result.reason !== '')
        || ![result.fieldDiagnostics, result.fieldDiagnosticsDetails, result.unverifiedSummaries,
          result.unverifiedSourcePassageIds].every(absentOrEmptyRecord)
        || !['core', 'evidence', 'evidenceSegments', 'needsMoreInformation'].every(key => isDeepStrictEqual(result[key], original[key]))
        || Object.keys(fieldReviews).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(',')
        || SDF_CORE_FIELDS.some(field => {
          const item = record(fieldReviews[field]);
          return item.verdict !== 'accepted' || !isDeepStrictEqual(item.issues, []) || item.summary !== originalCore[field]
            || !Array.isArray(item.sourcePassageIds) || !item.sourcePassageIds.length
            || item.sourcePassageIds.some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
            || record(evidence[field]).locator !== `passages:${item.sourcePassageIds.join(',')}`;
        })
        || typeof review.provider !== 'string' || !review.provider || typeof review.model !== 'string' || !review.model
        || !sha256(review.promptHash) || !sha256(review.responseHash) || review.finishReason !== 'stop'
        || !tokenCount(usage.inputTokens) || !tokenCount(usage.outputTokens) || audit.length > 2) return null;
      for (const row of audit) {
        const call = record(row.metadata);
        if (row.actorId !== null || row.targetType !== 'ai_gateway' || call.operation !== 'text' || call.outcome !== 'succeeded'
          || call.provider !== review.provider || call.model !== review.model || !sha256(call.promptHash)
          || call.fallbackReason !== null || call.retryCount !== 0 || call.error !== null || call.finishReason !== 'stop'
          || !tokenCount(call.inputTokens) || !tokenCount(call.outputTokens)) return null;
      }
      const finalCall = record(audit[audit.length - 1]!.metadata);
      if (finalCall.promptHash !== review.promptHash || finalCall.inputTokens !== usage.inputTokens
        || finalCall.outputTokens !== usage.outputTokens) return null;
      contractRepairs.set(task.id, { reviewedCandidateHash: review.reviewedCandidateHash,
        promptHash: review.promptHash, responseHash: review.responseHash,
        reviewSkill: { id: 'scientific-critical-thinking', version: '3' } });
      contractRepairAuditIds.push(...audit.map(row => row.id));
      continue;
    }
    const schemaDetail = details[SDF_CORE_FIELDS[0]!];
    if (typeof schemaDetail === 'string'
      && /^scientificReview=(SCHEMA_VALIDATION|review_contract_incomplete;reviewedClaims=(required_missing|invalid_structure|source_unmaterializable|core_missing))$/.test(schemaDetail)) {
      // Exactly one structural exhaustion may follow the independently verified
      // accepted draft. Successful provider calls alone are never scientific approval.
      const anchorTaskId = step.ordinal > 0 ? reviews[step.ordinal - 1]!.agentTaskId! : '';
      const anchorEvidence = contractRepairs.get(anchorTaskId);
      if (!anchorEvidence || contractRepairs.size !== 1 || schemaRepairs.size !== 0
        || review.status !== 'blocked_scientific_review'
        || !isDeepStrictEqual(review.reviewSkill, { id: 'scientific-critical-thinking', version: '3' })
        || review.fieldReviews != null || review.needsMoreEvidence != null || review.provider != null || review.model != null
        || review.promptHash != null || review.responseHash != null || review.usage != null || review.finishReason != null
        || 'reviewedClaimSuggestions' in result || 'rejectedCandidates' in review || 'rejectedCandidates' in result
        || result.reason !== 'canonical_partial_validation_exhausted'
        || !isDeepStrictEqual(result.needsMoreInformation, [...SDF_CORE_FIELDS])
        || [diagnostics, details, summaries, ids].some(value => Object.keys(value).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(','))
        || SDF_CORE_FIELDS.some(field => diagnostics[field] !== 'malformed_item' || details[field] !== schemaDetail
          || record(result.core)[field] !== '' || summaries[field] !== originalCore[field]
          || !Array.isArray(ids[field]) || !(ids[field] as unknown[]).length
          || (ids[field] as unknown[]).some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
          || !isDeepStrictEqual(record(result.evidence)[field], { quote: '', locator: '' })
          || !isDeepStrictEqual(record(result.evidenceSegments)[field], [])
          || record(evidence[field]).locator !== `passages:${Array.isArray(ids[field]) ? (ids[field] as unknown[]).join(',') : ''}`)
        || audit.length > 2) return null;
      const anchorReview = record(record(byId.get(anchorTaskId)!.result).scientificReview);
      for (const row of audit) {
        const call = record(row.metadata);
        if (row.actorId !== null || row.targetType !== 'ai_gateway' || call.operation !== 'text' || call.outcome !== 'succeeded'
          || call.provider !== anchorReview.provider || call.model !== anchorReview.model || !sha256(call.promptHash)
          || call.fallbackReason !== null || call.retryCount !== 0 || call.error !== null || call.finishReason !== 'stop'
          || !tokenCount(call.inputTokens) || !tokenCount(call.outputTokens)) return null;
      }
      schemaRepairs.set(task.id, { scientificAnchorTaskId: anchorTaskId, failedContractTaskId: task.id,
        reviewedCandidateHash: review.reviewedCandidateHash, scientificAnchorEvidence: anchorEvidence,
        schemaContractAuditIds: audit.map(row => row.id) });
      continue;
    }
    if (!['blocked_scientific_review', 'review_unavailable'].includes(String(review.status))
      || review.provider != null || review.model != null || review.responseHash != null || review.fieldReviews != null
      || review.needsMoreEvidence != null || result.reviewedClaimSuggestions != null
      || review.promptHash != null || review.usage != null || review.finishReason != null
      || !['canonical_partial_validation_exhausted', 'scientific_review_unavailable'].includes(String(result.reason))
      || Object.keys(diagnostics).length !== SDF_CORE_FIELDS.length
      || SDF_CORE_FIELDS.some(field => !['malformed_item', 'scientific_review_unavailable'].includes(String(diagnostics[field]))
        || details[field] !== 'scientificReview=ALL_PROVIDERS_FAILED' || record(result.core)[field] !== ''
        || summaries[field] !== originalCore[field]
        || !Array.isArray(ids[field]) || !(ids[field] as unknown[]).length
        || (ids[field] as unknown[]).some(id => typeof id !== 'string' || !/^P\d{5}$/.test(id))
        || !isDeepStrictEqual(record(result.evidence)[field], { quote: '', locator: '' })
        || !isDeepStrictEqual(record(result.evidenceSegments)[field], [])
        || record(evidence[field]).locator !== `passages:${Array.isArray(ids[field]) ? (ids[field] as unknown[]).join(',') : ''}`)) return null;
    // The service-failure branch never accepts a successful response, schema failure, or truncation.
    // Historical provider_error is unclassified: only the explicit retry action may
    // accept possible prior charges; it is not evidence of a transient root cause.
    const promptHashes = new Set<string>();
    const providerIndexes = new Set<number>();
    let primaryServiceFailure = false;
    for (const row of audit) {
      const call = record(row.metadata);
      if (row.actorId !== null || row.targetType !== 'ai_gateway' || call.operation !== 'text' || call.outcome !== 'failed'
        || typeof call.provider !== 'string' || !call.provider || typeof call.model !== 'string' || !call.model
        || typeof call.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(call.promptHash)
        || call.finishReason != null || call.outputTokens != null || call.responseBlockCounts != null
        || typeof call.retryCount !== 'number' || !Number.isSafeInteger(call.retryCount)
        || call.retryCount < 0 || providerIndexes.has(call.retryCount)
        || typeof call.error !== 'string' || !/^(provider_error|provider_timeout|provider_transport|provider_http_[45]\d\d)$/.test(call.error)) return null;
      if (call.error === 'provider_error') {
        if (review.status !== 'review_unavailable' || result.reason !== 'scientific_review_unavailable'
          || SDF_CORE_FIELDS.some(field => diagnostics[field] !== 'scientific_review_unavailable')) return null;
        genericFailureTaskIds.add(task.id);
      }
      promptHashes.add(call.promptHash);
      providerIndexes.add(call.retryCount);
      // Recovery submits only to the primary. A fallback's transient failure must
      // not authorize resubmission to a primary that failed authentication or never ran.
      if (call.retryCount === 0) {
        if (call.fallbackReason !== null || !/^(provider_error|provider_timeout|provider_transport|provider_http_(408|429|5\d\d))$/.test(call.error)) return null;
        primaryServiceFailure = true;
      }
      failureClassifications.push(call.error);
    }
    if (promptHashes.size !== 1 || !primaryServiceFailure) return null;
    auditIds.push(...audit.map(row => row.id));
  }
  if (schemaRepairs.size && contractRepairs.size !== 1) return null;
  let savedCorrectionCount = 0;
  let independentReviewCount = 0;
  let replacementUsesSavedOutput = false;
  // A replacement after an unclassified failure or accepted-contract gap must carry the explicit
  // user action receipt; the read-only availability query never creates it.
  for (const step of reviews.filter(step => step.ordinal > 0)) {
    const predecessorId = reviews[step.ordinal - 1]!.agentTaskId!;
    const contractEvidence = contractRepairs.get(predecessorId);
    const schemaEvidence = schemaRepairs.get(predecessorId);
    const directCompositionEvidence = freshReviews.get(predecessorId);
    const savedEvidence = savedOutputs.get(predecessorId)?.evidence;
    if (!genericFailureTaskIds.has(predecessorId) && predecessorId !== technicalRecovery?.originalTaskId
      && !contractEvidence && !schemaEvidence && !directComposition) continue;
    const receiptWhere = {
      action: 'hermes.research_run.source_review_recovery', targetType: 'hermes_research_run', targetId: run.id,
      actorId: run.actorId, metadata: { path: ['newAgentTaskId'], equals: step.agentTaskId! },
    };
    const receipt = directComposition || packetLineage ? { metadata: recoveryReceipts.get(step.agentTaskId!) }
      : await tx.auditLog.findFirst({ where: receiptWhere });
    const metadata = record(receipt?.metadata);
    const task = byId.get(step.agentTaskId!)!;
    if (!receipt || metadata.explicitUserAction !== true || metadata.oldAgentTaskId !== predecessorId
      || metadata.compositionSourceAgentTaskId !== composition.id || metadata.ordinal !== step.ordinal
      || task.session.idempotencyKey !== `${task.idempotencyKey}:hermes-recovery:${metadata.requestDigest}`) return null;
    if (packetFailureEvidence && predecessorId === packetFailureEvidence.sourceTaskId) {
      if (metadata.recoveryClass !== PACKET_OVERFLOW_REVIEW_CLASS || step.ordinal !== 1
        || !isDeepStrictEqual(metadata.packetFailureEvidence, packetFailureEvidence)
        || !independentMode(metadata) || metadata.noRuntimeFallback !== true || metadata.freshReview !== true
        || metadata.savedOutputReused !== false || metadata.possibleDuplicateProviderCharge !== false
        || metadata.chargeableAttempts !== 1 || metadata.creditPolicy !== 'new-review-task-charged;original-failure-preserved'
        || !sha256(metadata.requestDigest) || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim()) return null;
      const debit = await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${task.id}` } });
      if (!debit || debit.userId !== run.actorId || debit.resource !== 'ai_credit' || BigInt(debit.delta) !== -1n
        || debit.kind !== 'consume' || debit.reason !== 'Agent task reservation sdf.extract'
        || !isDeepStrictEqual(debit.metadata, { taskId: task.id, kind: 'sdf.extract', policy: 'charged-on-submit' })) return null;
      independentReviewCount++;
      continue;
    }
    if (metadata.recoveryClass === SOURCE_REVIEW_NOT_SUBMITTED) {
      if (!technicalReplacement || step.agentTaskId !== replacementTaskId || !technicalRecovery
        || predecessorId !== technicalRecovery.originalTaskId || !isDeepStrictEqual(metadata.notSubmittedRecovery, technicalRecovery)
        || metadata.chargeableAttempts !== 0 || metadata.creditPolicy !== 'reuse-original-reservation'
        || metadata.independentIntentTaskId !== predecessorId || !independentMode(metadata) || metadata.noRuntimeFallback !== true
        || !sha256(metadata.requestDigest) || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim()) return null;
      replacementUsesSavedOutput = true;
      continue;
    }
    if (directCompositionEvidence && (metadata.recoveryClass !== DIRECT_COMPOSITION_REVIEW_CLASS
      || metadata.reviewedCandidateHash !== directCompositionEvidence.reviewedCandidateHash
      || !isDeepStrictEqual(metadata.structuredReviewAuditIds, directCompositionEvidence.structuredReviewAuditIds)
      || metadata.freshReview !== true || metadata.savedOutputReused !== false
      || metadata.possibleDuplicateProviderCharge !== true || metadata.noProviderSwitch !== true
      || !sha256(metadata.requestDigest) || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim())) return null;
    if (directComposition && !directCompositionEvidence) {
      const independent = metadata.recoveryClass === INDEPENDENT_REVIEW_CLASS;
      if (!savedEvidence || (!independent && metadata.recoveryClass !== SAVED_OUTPUT_CORRECTION_CLASS)
        || !isDeepStrictEqual(metadata.savedOutputEvidence, savedEvidence)
        || metadata.freshReview !== false || metadata.savedOutputReused !== true
        || metadata.possibleDuplicateProviderCharge !== true
        || (independent ? !independentMode(metadata) || metadata.noRuntimeFallback !== true : metadata.noProviderSwitch !== true)
        || !sha256(metadata.requestDigest) || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim()) return null;
      if (independent) independentReviewCount++;
      else savedCorrectionCount++;
      if (step.agentTaskId === replacementTaskId) replacementUsesSavedOutput = true;
    }
    if (contractEvidence && (metadata.recoveryClass !== CONTRACT_REPAIR_CLASS
      || !isDeepStrictEqual(metadata.contractEvidence, contractEvidence)
      || metadata.possibleDuplicateProviderCharge !== true || metadata.noProviderSwitch !== true)) return null;
    if (schemaEvidence && (metadata.recoveryClass !== SCHEMA_REPAIR_CLASS
      || metadata.scientificAnchorTaskId !== schemaEvidence.scientificAnchorTaskId
      || metadata.failedContractTaskId !== predecessorId || metadata.reviewedCandidateHash !== schemaEvidence.reviewedCandidateHash
      || !isDeepStrictEqual(metadata.scientificAnchorEvidence, schemaEvidence.scientificAnchorEvidence)
      || !isDeepStrictEqual(metadata.schemaContractAuditIds, schemaEvidence.schemaContractAuditIds)
      || metadata.possibleDuplicateProviderCharge !== true || metadata.noProviderSwitch !== true)) return null;
  }
  if (savedCorrectionCount > 1 || independentReviewCount > 1 || (independentReviewCount && !independentReplacement && !technicalRecovery)) return null;
  const selectedSaved = savedOutputs.get(technicalRecovery
    ? String(recoveryReceipts.get(technicalRecovery.originalTaskId)?.oldAgentTaskId) : failed.id);
  const savedOutput = (!replacementTaskId || replacementUsesSavedOutput) ? selectedSaved?.output : undefined;
  const savedOutputEvidence = savedOutput ? selectedSaved?.evidence : undefined;
  const directCompositionEvidence = savedOutput ? undefined : freshReviews.get(failed.id);
  if (directComposition && !savedOutput && !directCompositionEvidence) return null;
  const reviewMode = packetFailureEvidence || technicalRecovery || independentReviewCount ? 'web' as const : 'model' as const;
  if (savedOutput && !replacement && savedCorrectionCount && reviewMode === 'model') return null;
  if (replacement?.status === 'succeeded') {
    const finalResult = record(replacement.result);
    const finalReview = record(finalResult.scientificReview);
    try {
      if (finalReview.sourceAgentTaskId !== composition.id || finalReview.reviewedCandidateHash !== candidateHash
        || (reviewMode === 'web' ? (finalReview.kind !== 'independent_review'
          || finalReview.provider !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider
          || finalReview.model !== HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel) : finalReview.kind !== 'model_self_check')
        || !isDeepStrictEqual(finalReview.semanticStage, originalReview.semanticStage)
        || !isDeepStrictEqual(parseDocumentSourceMapReference(finalResult.sourceMapRef), parseDocumentSourceMapReference(original.sourceMapRef))) return null;
    } catch { return null; }
  }
  const saved = await findSavedIngestionCommit(tx, { taskId: source.id, researchObjectId: run.researchObjectId });
  // A worker/reconciler restart after this run saved its final review must still
  // be able to complete source confirmation without paying for another review.
  if (replacement && source.state === 'confirmed') {
    const ownSaved = await findSavedIngestionCommit(tx, { taskId: source.id, researchObjectId: run.researchObjectId,
      idempotencyKey: `hermes-ingestion:${run.id}:${source.id}` });
    if (replacement.status !== 'succeeded' || !ownSaved || ownSaved.origin.executor !== 'hermes' || ownSaved.origin.runId !== run.id
      || (saved && (saved.origin.executor !== 'hermes' || saved.origin.runId !== run.id
        || saved.commit.id !== ownSaved.commit.id || saved.version.id !== ownSaved.version.id
        || saved.manifest.id !== ownSaved.manifest.id))) return null;
  } else if (saved || source.state === 'confirmed') return null;
  if (await tx.hermesResearchStep.findFirst({ where: { stage: 'source_ingestion', ingestionTaskId: source.id,
    runId: { not: run.id }, run: { status: { notIn: ['succeeded', 'failed', 'stopped'] } } }, select: { id: true } })) return null;
  const presentationCount = await tx.agentTask.count({ where: { kind: 'presentation.generate',
    payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  if (presentationCount !== 0 || sourceCount + presentationCount + 3 > run.maxAgentTasks) return null;
  return { run, source, failed, composition, replacement, sourceStep, originalStep, failedSteps, compositionStep,
    recoveryKey, nextOrdinal: reviews.length, auditIds, failureClassifications, contractRepairAuditIds,
    recoveryClass: technicalRecovery ? SOURCE_REVIEW_NOT_SUBMITTED : packetFailureEvidence ? PACKET_OVERFLOW_REVIEW_CLASS : reviewMode === 'web' ? INDEPENDENT_REVIEW_CLASS : savedOutput ? SAVED_OUTPUT_CORRECTION_CLASS : directCompositionEvidence ? DIRECT_COMPOSITION_REVIEW_CLASS : schemaRepairs.has(failed.id) ? SCHEMA_REPAIR_CLASS
      : contractRepairs.has(failed.id) ? CONTRACT_REPAIR_CLASS : 'service_failure' as const,
    directCompositionEvidence, savedOutputEvidence, savedOutput, reviewMode, technicalRecovery, packetFailureEvidence,
    contractEvidence: contractRepairs.get(failed.id), schemaContractEvidence: schemaRepairs.get(failed.id) };
}

/** Worker exception to current-source equality: only the committed current recovery may use its unchanged v4 parent. */
export async function requireHermesSourceReviewRecoveryBinding(tx: Prisma.TransactionClient, input: {
  ownerTaskId: string; ingestionTaskId: string; failedTaskId: string; compositionTaskId: string;
}): Promise<HermesSavedSourceReviewOutput | undefined> {
  const steps = await tx.hermesResearchStep.findMany({ where: { stage: 'source_review', ordinal: { gt: 0 }, agentTaskId: input.ownerTaskId }, take: 2 });
  const proof = steps.length === 1 ? await inspectHermesSourceReviewRecovery(tx, steps[0]!.runId, input.ownerTaskId) : null;
  if (!proof || proof.source.id !== input.ingestionTaskId || proof.failed.id !== input.failedTaskId
    || proof.composition.id !== input.compositionTaskId || proof.replacement?.status !== 'running'
    || proof.reviewMode === 'web'
    || (proof.savedOutput && proof.replacement.executionAttempt !== 1)) {
    throw new Error('[blocked] Source review recovery binding changed');
  }
  return proof.savedOutput;
}

/** Initial review uses the existing refresh receipt; a missing receipt never selects a provider. */
export async function inspectInitialHermesSourceReview(tx: Prisma.TransactionClient, ownerTaskId: string, savedCompositionHistory = false) {
  const steps = await tx.hermesResearchStep.findMany({ where: { stage: 'source_review', ordinal: 0, agentTaskId: ownerTaskId }, take: 2 });
  if (steps.length !== 1) return null;
  const step = steps[0]!;
  const run = await tx.hermesResearchRun.findUnique({ where: { id: step.runId }, include: { researchObject: true, steps: true } });
  const owner = await tx.agentTask.findUnique({ where: { id: ownerTaskId }, include: { session: true } });
  const source = step.ingestionTaskId ? await tx.ingestionTask.findUnique({ where: { id: step.ingestionTaskId },
    include: { artifact: true, batch: true } }) : null;
  const canonical = run?.steps.filter(item => item.stage === 'source_ingestion') ?? [];
  const reviews = run?.steps.filter(item => item.stage === 'source_review') ?? [];
  const compositions = run?.steps.filter(item => item.stage === 'source_composition') ?? [];
  const recoveredComposition = run && compositions.length === 2 ? await inspectHermesRecoveredSourceComposition(tx, run.id) : null;
  if (!run || !owner || !source || step.ordinal !== 0 || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9
    || (!savedCompositionHistory && (run.versionId !== null || run.sourceClaimIds.length || run.sourceReviewDigest
      || !['running', 'awaiting_source_review'].includes(run.status))) || run.researchObject.status !== 'draft' || run.researchObject.deletedAt
    || canonical.length !== 1 || reviews.length !== 1 || compositions.length > 2
    || (!savedCompositionHistory && run.steps.length !== 2 + compositions.length)
    || (compositions.length === 2 && !recoveredComposition)
    || run.steps.filter(item => !savedCompositionHistory || ['source_ingestion', 'source_composition', 'source_review'].includes(item.stage))
      .some(item => item.ingestionTaskId !== source.id || item.artifactId !== source.artifactId || item.presentationAssetId !== null)
    || canonical[0]!.agentTaskId !== owner.id || source.agentTaskId !== owner.id || source.retryCount !== 0
    || source.batch.userId !== run.actorId || source.batch.researchObjectId !== run.researchObjectId
    || source.artifact.workspaceId !== run.researchObject.workspaceId || source.artifact.deletedAt || source.artifact.bytesPurgedAt
    || !['queued', 'parsing', 'needs_review', 'confirmed'].includes(source.state) || owner.retryCount !== 0) return null;
  const receipts = await tx.auditLog.findMany({ where: { action: 'ingestion.task.system_analysis_refresh',
    targetType: 'ingestion_task', targetId: source.id, actorId: null, workspaceId: run.researchObject.workspaceId,
    metadata: { path: ['newAgentTaskId'], equals: owner.id } }, take: 2 });
  if (receipts.length !== 1) return null;
  const metadata = record(receipts[0]!.metadata);
  if (savedCompositionHistory && metadata.savedCompositionCandidate === undefined) return null;
  if (metadata.executor !== 'hermes' || metadata.authorizedByUserId !== run.actorId || metadata.runId !== run.id
    || metadata.stage !== 'source_review' || metadata.artifactId !== source.artifactId
    || typeof metadata.oldAgentTaskId !== 'string' || metadata.oldAgentTaskId !== metadata.compositionSourceAgentTaskId) return null;
  const reviewMode = initialReviewMode(metadata);
  if (!reviewMode) return null;
  const independent = reviewMode === 'web';
  const composition = await tx.agentTask.findUnique({ where: { id: metadata.oldAgentTaskId }, include: { session: true } });
  const reviewer = readNativeAgentExecution(owner.result);
  const author = readNativeAgentExecution(composition?.result);
  if (reviewMode === 'agent') {
    if (savedCompositionHistory || compositions.length || metadata.savedCompositionCandidate !== undefined
      || reviewer?.profile !== 'paper-source-review' || author?.profile !== 'paper-author'
      || Object.hasOwn(record(owner.result), 'nativeSourceReview') || Object.hasOwn(record(composition?.result), 'nativeSourceReview')
      || metadata.creditPolicy !== 'charged_ingestion_analysis_refresh' || owner.session.kind !== 'ingestion'
      || composition?.session.kind !== 'ingestion' || !['pending', 'running', 'succeeded'].includes(owner.status)
      || !['waiting', 'succeeded'].includes(step.status) || !['waiting', 'succeeded'].includes(canonical[0]!.status)
      || !await hasOrdinarySourceTaskDebit(tx, owner.id, run.actorId)) return null;
    const authority = await requireActiveMembership(tx, run.researchObject.workspaceId, run.actorId);
    if (authority.workspace.status !== 'active' || !SOURCE_WRITE_ROLES.has(authority.membership.role)) return null;
  } else if (reviewer?.profile === 'paper-source-review' || reviewer?.profile === 'paper-author' || author?.profile === 'paper-author') return null;
  const savedComposition = metadata.savedCompositionCandidate !== undefined
    ? await inspectHermesSavedCompositionCandidate(tx, run.id) : null;
  if (metadata.savedCompositionCandidate !== undefined && (!savedComposition || independent
    || !isDeepStrictEqual(metadata.savedCompositionCandidate, savedComposition.savedCompositionCandidate)
    || savedComposition.replacement?.id !== composition?.id || metadata.creditPolicy !== 'charged_ingestion_analysis_refresh'
    || metadata.noReanalysis !== true || metadata.noProviderSwitch !== true
    || !await hasOrdinarySourceTaskDebit(tx, owner.id, run.actorId))) return null;
  if (!composition || composition.status !== 'succeeded'
    || (recoveredComposition ? recoveredComposition.replacement?.id !== composition.id
      || recoveredComposition.replacementStep?.status !== (savedComposition ? 'failed' : 'succeeded')
      : compositions.some(item => item.ordinal !== 0 || item.agentTaskId !== composition.id || item.status !== 'succeeded'))) return null;
  const key = `ingestion-analysis-compose:${source.id}:${composition.id}:${composition.id}:scientific-review-v4`;
  if (owner.idempotencyKey !== key || owner.session.idempotencyKey !== `${key}:session`) return null;
  for (const task of [owner, composition]) {
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || !isDeepStrictEqual(task.payload, { artifactId: source.artifactId, researchObjectId: run.researchObjectId })) return null;
  }
  try {
    if (!savedComposition && automaticIngestionReviewStage({ artifactId: source.artifactId, artifact: source.artifact, agentTask: composition }) !== 'source_review') return null;
    const reference = parseDocumentSourceMapReference(record(composition.result).sourceMapRef);
    if (metadata.sourceMapSha256 !== reference.serializedSha256) return null;
    if (reviewMode === 'agent') {
      const candidate = requireNativePaperAuthor(composition);
      if (candidate.checkpoint.serializedSha256 !== metadata.authorCheckpointSha256
        || reference.artifactId !== source.artifactId || reference.contentHash !== source.artifact.blobSha256) return null;
      const result = record(owner.result);
      if (result.sourceMapRef !== undefined && !isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), reference)) return null;
      const cp = reviewer!.checkpoint;
      if (cp && (result.sourceMapRef === undefined || cp.taskId !== owner.id || cp.artifactId !== reference.artifactId
        || cp.documentSha256 !== reference.contentHash || cp.sourceMapHash !== reference.serializedSha256)) return null;
    }
    if (owner.status === 'succeeded') {
      const final = record(owner.result); const review = record(final.scientificReview);
      if ((reviewMode === 'agent' ? review.kind !== 'hermes_agent_review' || review.profile !== 'paper-source-review'
        : independent ? review.kind !== 'independent_review'
        || review.provider !== metadata.reviewProvider || review.model !== metadata.reviewModel : review.kind !== 'model_self_check')
        || review.sourceAgentTaskId !== composition.id
        || !isDeepStrictEqual(parseDocumentSourceMapReference(final.sourceMapRef), reference)
        || (reviewMode !== 'agent' && !isDeepStrictEqual(review.semanticStage, record(record(composition.result).scientificReview).semanticStage))) return null;
      if (reviewMode === 'agent') nativeAgentTerminalResult(owner, 'succeeded', final);
    }
  } catch { return null; }
  return { run, source, composition, owner, independent, reviewMode,
    ...(savedComposition ? { savedCompositionCandidate: savedComposition.savedCompositionCandidate } : {}) };
}

/** Resolve the recorded role, with fresh actor/source/lease checks before the existing submission. */
export async function requireHermesSourceReviewExecution(tx: Prisma.TransactionClient,
  input: SourceReviewBindingInput): Promise<HermesSourceReviewExecution> {
  const initial = input.failedTaskId === input.compositionTaskId;
  if (initial) {
    const bindings = await tx.hermesResearchStep.findMany({ where: {
      OR: [{ agentTaskId: input.ownerTaskId }, { ingestionTaskId: input.ingestionTaskId }],
    }, take: 1 });
    if (!bindings.length) return requireUnmanagedInitialReview(tx, input);
  }
  const first = initial ? await inspectInitialHermesSourceReview(tx, input.ownerTaskId) : null;
  const steps = initial ? [] : await tx.hermesResearchStep.findMany({ where: {
    stage: 'source_review', ordinal: { gt: 0 }, agentTaskId: input.ownerTaskId,
  }, take: 2 });
  const continuation = steps.length === 1 ? await inspectHermesSourceReviewRecovery(tx, steps[0]!.runId, input.ownerTaskId) : null;
  const proof = first ?? continuation;
  const owner = first?.owner ?? continuation?.replacement;
  if (!proof || !owner || owner.status !== 'running' || owner.executionAttempt !== input.executionAttempt
    || !Number.isSafeInteger(input.executionAttempt) || input.executionAttempt < 1
    || proof.source.id !== input.ingestionTaskId || proof.composition.id !== input.compositionTaskId
    || (continuation && continuation.failed.id !== input.failedTaskId)) throw new Error('[blocked] Source review binding changed');
  const { membership } = await requireActiveMembership(tx, proof.run.researchObject.workspaceId, proof.run.actorId);
  if (!['owner', 'maintainer', 'author', 'contributor'].includes(membership.role)) throw new Error('[blocked] Source review binding changed');
  if (first?.reviewMode === 'agent') {
    if (!['queued', 'parsing'].includes(first.source.state)
      || first.run.steps.some(step => step.status !== 'waiting')) throw new Error('[blocked] Source review execution phase changed');
    const candidate = requireNativePaperAuthor(first.composition);
    return { mode: 'agent', taskId: owner.id, runId: first.run.id, sourceAgentTaskId: first.composition.id,
      authorCheckpointSha256: candidate.checkpoint.serializedSha256, sourceMapRef: candidate.sourceMapRef, sourceResult: first.composition.result };
  }
  const savedOutput = continuation?.savedOutput;
  if (!(first?.independent || continuation?.reviewMode === 'web')) return { mode: 'model', ...(savedOutput ? { savedOutput } : {}),
    ...(first?.savedCompositionCandidate ? { savedCompositionCandidate: first.savedCompositionCandidate } : {}),
    ...nativeSourceRole(owner, proof.composition, proof.source.id, proof.source.artifact, savedOutput ? 1 : 2) };
  if (readNativeSourceReview(owner.result)) throw new Error('[blocked] Native source role cannot use historical Web review');
  return { mode: 'web', provider: HERMES_INDEPENDENT_SOURCE_REVIEW.reviewProvider, model: HERMES_INDEPENDENT_SOURCE_REVIEW.reviewModel,
    runId: proof.run.id, taskId: owner.id, ...(savedOutput ? { savedOutput } : {}),
    ...(continuation?.technicalRecovery ? { notSubmittedRecovery: continuation.technicalRecovery.input } : {}) };
}

async function requireUnmanagedInitialReview(tx: Prisma.TransactionClient, input: SourceReviewBindingInput): Promise<HermesSourceReviewExecution> {
  const blocked = () => { throw new Error('[blocked] Source review binding changed'); };
  const taskReceipt = { path: ['newAgentTaskId'], equals: input.ownerTaskId };
  const hermesReceipt = await tx.auditLog.findFirst({ where: {
    action: { in: ['ingestion.task.system_analysis_refresh', 'hermes.research_run.source_review_recovery'] }, metadata: taskReceipt,
  } });
  if (hermesReceipt) return blocked();
  const receipts = await tx.auditLog.findMany({ where: { action: 'ingestion.task.analysis_refresh', metadata: taskReceipt }, take: 2 });
  if (receipts.length !== 1) return blocked();
  const receipt = receipts[0]!; const metadata = record(receipt.metadata);
  if (metadata.runId != null || metadata.executor === 'hermes' || metadata.reviewMode != null
    || metadata.reviewProvider != null || metadata.reviewModel != null) return blocked();
  const owner = await tx.agentTask.findUnique({ where: { id: input.ownerTaskId }, include: { session: true } });
  const composition = await tx.agentTask.findUnique({ where: { id: input.compositionTaskId }, include: { session: true } });
  const source = await tx.ingestionTask.findUnique({ where: { id: input.ingestionTaskId }, include: {
    artifact: true, batch: { include: { researchObject: true } },
  } });
  if (!owner || !composition || !source || source.agentTaskId !== owner.id || source.retryCount !== owner.retryCount
    || !['queued', 'parsing'].includes(source.state) || owner.status !== 'running'
    || !Number.isSafeInteger(input.executionAttempt) || input.executionAttempt < 1 || owner.executionAttempt !== input.executionAttempt
    || composition.status !== 'succeeded' || source.batch.researchObject.deletedAt
    || source.artifact.deletedAt || source.artifact.bytesPurgedAt || source.artifact.workspaceId !== source.batch.researchObject.workspaceId) return blocked();
  if (receipt.actorId !== source.batch.userId || receipt.workspaceId !== source.artifact.workspaceId
    || receipt.targetType !== 'ingestion_task' || receipt.targetId !== source.id
    || metadata.policy !== 'scientific_review_v4_correction' || metadata.artifactId !== source.artifactId
    || metadata.oldAgentTaskId !== composition.id || metadata.compositionSourceAgentTaskId !== composition.id) return blocked();
  for (const task of [owner, composition]) {
    const profile = readNativeAgentExecution(task.result)?.profile;
    if (profile === 'paper-author' || profile === 'paper-source-review') return blocked();
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.userId !== source.batch.userId || task.session.researchObjectId !== source.batch.researchObjectId
      || !isDeepStrictEqual(task.payload, { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId })) return blocked();
  }
  const key = `ingestion-analysis-compose:${source.id}:${composition.id}:${composition.id}:scientific-review-v4`;
  if (owner.idempotencyKey !== key || owner.session.idempotencyKey !== `${key}:session`) return blocked();
  try {
    const result = record(composition.result); const review = record(result.scientificReview);
    const reference = parseDocumentSourceMapReference(result.sourceMapRef);
    if (result.canonicalExtractionContract !== 'grounded-passages-v2' || !review.semanticStage
      || typeof review.semanticStage !== 'object' || Array.isArray(review.semanticStage)
      || reference.parserStatus !== 'succeeded' || reference.artifactId !== source.artifactId
      || reference.contentHash !== source.artifact.blobSha256 || metadata.sourceMapSha256 !== reference.serializedSha256) return blocked();
  } catch { return blocked(); }
  const { membership } = await requireActiveMembership(tx, source.artifact.workspaceId, source.batch.userId);
  if (!['owner', 'maintainer', 'author', 'contributor'].includes(membership.role)) return blocked();
  return { mode: 'model', ...nativeSourceRole(owner, composition, source.id, source.artifact, 2) };
}

function nativeSourceRole(owner: { id: string; result: unknown }, composition: { id: string; result: unknown },
  ingestionTaskId: string, artifact: { id: string; blobSha256: string }, maxAttempts: 1 | 2): { nativeSourceReview?: NativeSourceReviewIdentity } {
  const cp = readNativeSourceReview(owner.result);
  if (!cp) return {};
  const ref = parseDocumentSourceMapReference(record(composition.result).sourceMapRef);
  const identity: NativeSourceReviewIdentity = { taskId: owner.id, ingestionTaskId, compositionTaskId: composition.id,
    artifactId: artifact.id, documentSha256: artifact.blobSha256, sourceMapHash: ref.serializedSha256, maxAttempts };
  if (cp.attempts.some(a => Object.entries(identity).some(([k, v]) => a[k as keyof NativeSourceReviewIdentity] !== v)))
    throw new Error('[blocked] Native source role binding changed');
  return { nativeSourceReview: identity };
}
