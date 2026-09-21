import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { automaticIngestionReviewStage } from './automatic-review';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { findSavedIngestionCommit } from './saved-source-commit';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

/** Metadata-only proof for one service recovery; never treats an absent review as scientific approval. */
export async function inspectHermesSourceReviewRecovery(tx: Prisma.TransactionClient, runId: string,
  replacementTaskId?: string) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: runId },
    include: { steps: true, researchObject: true } });
  if (!run || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.versionId !== null
    || run.sourceClaimIds.length || run.sourceReviewDigest || run.researchObject.status !== 'draft' || run.researchObject.deletedAt
    || !(replacementTaskId ? ['running', 'awaiting_source_review'].includes(run.status) : run.status === 'failed')) return null;
  const canonical = run.steps.filter(step => step.stage === 'source_ingestion');
  const compositions = run.steps.filter(step => step.stage === 'source_composition');
  const reviews = run.steps.filter(step => step.stage === 'source_review').sort((a, b) => a.ordinal - b.ordinal);
  if (canonical.length !== 1 || canonical[0]!.ordinal !== 0 || compositions.length !== 1 || compositions[0]!.ordinal !== 0
    || reviews.length !== (replacementTaskId ? 2 : 1) || reviews[0]!.ordinal !== 0
    || (replacementTaskId && (reviews[1]!.ordinal !== 1 || reviews[1]!.agentTaskId !== replacementTaskId || reviews[0]!.status !== 'failed'))
    || run.steps.length !== canonical.length + compositions.length + reviews.length) return null;
  const sourceStep = canonical[0]!;
  const originalStep = reviews[0]!;
  const compositionStep = compositions[0]!;
  if (!sourceStep.ingestionTaskId || !sourceStep.artifactId || !originalStep.agentTaskId || !compositionStep.agentTaskId
    || run.steps.some(step => step.ingestionTaskId !== sourceStep.ingestionTaskId || step.artifactId !== sourceStep.artifactId
      || step.presentationAssetId !== null)) return null;
  const source = await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId },
    include: { artifact: true, batch: true } });
  const failed = await tx.agentTask.findUnique({ where: { id: originalStep.agentTaskId }, include: { session: true } });
  const composition = await tx.agentTask.findUnique({ where: { id: compositionStep.agentTaskId }, include: { session: true } });
  const replacement = replacementTaskId ? await tx.agentTask.findUnique({ where: { id: replacementTaskId }, include: { session: true } }) : null;
  if (!source || !failed || !composition || (replacementTaskId && !replacement)
    || source.agentTaskId !== (replacementTaskId ?? failed.id) || sourceStep.agentTaskId !== source.agentTaskId
    || source.artifactId !== sourceStep.artifactId || source.batch.userId !== run.actorId
    || source.batch.researchObjectId !== run.researchObjectId || source.artifact.workspaceId !== run.researchObject.workspaceId
    || source.artifact.deletedAt || source.artifact.bytesPurgedAt || source.retryCount !== 0
    || !(replacementTaskId ? ['queued', 'parsing', 'needs_review', 'confirmed'].includes(source.state) : source.state === 'needs_review')
    || failed.status !== 'succeeded' || failed.executionAttempt !== 1 || failed.retryCount !== 0
    || composition.status !== 'succeeded') return null;
  for (const task of [failed, composition, ...(replacement ? [replacement] : [])]) {
    const payload = record(task.payload);
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || Object.keys(payload).sort().join(',') !== 'artifactId,researchObjectId'
      || payload.artifactId !== source.artifactId || payload.researchObjectId !== run.researchObjectId) return null;
  }
  const originalKey = `ingestion-analysis-compose:${source.id}:${composition.id}:${composition.id}:scientific-review-v4`;
  const recoveryKey = `ingestion-analysis-compose:${source.id}:${failed.id}:${composition.id}:scientific-review-v4`;
  if (failed.idempotencyKey !== originalKey || (replacement && replacement.idempotencyKey !== recoveryKey)) return null;
  if (replacement && (replacement.retryCount !== 0 || replacement.executionAttempt > 1
    || !['pending', 'running', 'succeeded'].includes(replacement.status))) return null;
  const result = record(failed.result);
  const review = record(result.scientificReview);
  const original = record(composition.result);
  const originalReview = record(original.scientificReview);
  const originalCore = record(original.core);
  const details = record(result.fieldDiagnosticsDetails);
  const diagnostics = record(result.fieldDiagnostics);
  const summaries = record(result.unverifiedSummaries);
  const ids = record(result.unverifiedSourcePassageIds);
  const evidence = record(original.evidence);
  if (review.contractVersion !== '5' || review.kind !== 'model_self_check'
    || !['blocked_scientific_review', 'review_unavailable'].includes(String(review.status))
    || review.sourceAgentTaskId !== composition.id || originalReview.contractVersion !== '4'
    || review.provider != null || review.model != null || review.responseHash != null || review.fieldReviews != null
    || review.needsMoreEvidence != null || result.reviewedClaimSuggestions != null
    || !['canonical_partial_validation_exhausted', 'scientific_review_unavailable'].includes(String(result.reason))
    || typeof review.reviewedCandidateHash !== 'string' || !/^[a-f0-9]{64}$/.test(review.reviewedCandidateHash)
    || !isDeepStrictEqual(review.semanticStage, originalReview.semanticStage)
    || Object.keys(diagnostics).length !== SDF_CORE_FIELDS.length
    || SDF_CORE_FIELDS.some(field => !['malformed_item', 'scientific_review_unavailable'].includes(String(diagnostics[field]))
      || details[field] !== 'scientificReview=ALL_PROVIDERS_FAILED' || record(result.core)[field] !== ''
      || summaries[field] !== originalCore[field]
      || record(evidence[field]).locator !== `passages:${Array.isArray(ids[field]) ? (ids[field] as unknown[]).join(',') : ''}`)) return null;
  try {
    if (automaticIngestionReviewStage({ artifactId: source.artifactId, artifact: source.artifact, agentTask: composition }) !== 'source_review'
      || !isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), parseDocumentSourceMapReference(original.sourceMapRef))) return null;
    if (replacement?.status === 'succeeded') {
      const finalResult = record(replacement.result);
      const finalReview = record(finalResult.scientificReview);
      if (finalReview.sourceAgentTaskId !== composition.id || finalReview.reviewedCandidateHash !== review.reviewedCandidateHash
        || !isDeepStrictEqual(finalReview.semanticStage, originalReview.semanticStage)
        || !isDeepStrictEqual(parseDocumentSourceMapReference(finalResult.sourceMapRef), parseDocumentSourceMapReference(original.sourceMapRef))) return null;
    }
  } catch { return null; }
  // A task ID names one execution here. Audit failure, a successful response, schema
  // failure, output truncation, or an unknown provider category cannot authorize spend.
  const audit = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: failed.id },
    orderBy: { createdAt: 'asc' }, take: 17 });
  if (!audit.length || audit.length > 16) return null;
  const promptHashes = new Set<string>();
  const providerIndexes = new Set<number>();
  let primaryTransientFailure = false;
  for (const row of audit) {
    const call = record(row.metadata);
    if (row.actorId !== null || row.targetType !== 'ai_gateway' || call.operation !== 'text' || call.outcome !== 'failed'
      || typeof call.provider !== 'string' || !call.provider || typeof call.model !== 'string' || !call.model
      || typeof call.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(call.promptHash)
      || call.finishReason != null || call.outputTokens != null || call.responseBlockCounts != null
      || typeof call.retryCount !== 'number' || !Number.isSafeInteger(call.retryCount)
      || call.retryCount < 0 || providerIndexes.has(call.retryCount)
      || typeof call.error !== 'string' || !/^(provider_timeout|provider_transport|provider_http_[45]\d\d)$/.test(call.error)) return null;
    promptHashes.add(call.promptHash);
    providerIndexes.add(call.retryCount);
    // Recovery submits only to the primary. A fallback's transient failure must
    // not authorize resubmission to a primary that failed authentication or never ran.
    if (call.retryCount === 0) {
      if (call.fallbackReason !== null || !/^(provider_timeout|provider_transport|provider_http_(408|429|5\d\d))$/.test(call.error)) return null;
      primaryTransientFailure = true;
    }
  }
  if (promptHashes.size !== 1 || !primaryTransientFailure) return null;
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
  const sourceCount = compositions.length + reviews.length + (replacementTaskId ? 0 : 1);
  if (presentationCount !== 0 || sourceCount + presentationCount + 3 > run.maxAgentTasks) return null;
  return { run, source, failed, composition, replacement, sourceStep, originalStep, compositionStep,
    recoveryKey, auditIds: audit.map(row => row.id) };
}

/** Worker exception to current-source equality: only the committed ordinal-1 recovery may use its unchanged v4 parent. */
export async function requireHermesSourceReviewRecoveryBinding(tx: Prisma.TransactionClient, input: {
  ownerTaskId: string; ingestionTaskId: string; failedTaskId: string; compositionTaskId: string;
}): Promise<void> {
  const steps = await tx.hermesResearchStep.findMany({ where: { stage: 'source_review', ordinal: 1, agentTaskId: input.ownerTaskId }, take: 2 });
  const proof = steps.length === 1 ? await inspectHermesSourceReviewRecovery(tx, steps[0]!.runId, input.ownerTaskId) : null;
  if (!proof || proof.source.id !== input.ingestionTaskId || proof.failed.id !== input.failedTaskId
    || proof.composition.id !== input.compositionTaskId || proof.replacement?.status !== 'running') {
    throw new Error('[blocked] Source review recovery binding changed');
  }
}
