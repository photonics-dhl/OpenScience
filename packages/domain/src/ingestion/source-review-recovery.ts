import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { automaticIngestionReviewStage } from './automatic-review';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { findSavedIngestionCommit } from './saved-source-commit';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const absentOrEmptyRecord = (value: unknown) => value === undefined
  || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const CONTRACT_REPAIR_CLASS = 'accepted_review_claim_contract_missing' as const;
type ContractRepairEvidence = {
  reviewedCandidateHash: string; promptHash: string; responseHash: string;
  reviewSkill: { id: 'scientific-critical-thinking'; version: '3' };
};

/** Read-only eligibility for an explicit paid recovery, never spend authorization or scientific approval. */
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
  const compositionStep = compositions[0]!;
  if (!sourceStep.ingestionTaskId || !sourceStep.artifactId || !originalStep.agentTaskId || !compositionStep.agentTaskId
    || run.steps.some(step => step.ingestionTaskId !== sourceStep.ingestionTaskId || step.artifactId !== sourceStep.artifactId
      || step.presentationAssetId !== null)) return null;
  const source = await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId },
    include: { artifact: true, batch: true } });
  const reviewTasks = await tx.agentTask.findMany({ where: { id: { in: reviews.map(step => step.agentTaskId!) } }, include: { session: true } });
  const byId = new Map(reviewTasks.map(task => [task.id, task]));
  if (reviewTasks.length !== reviews.length) return null;
  const failed = byId.get(originalStep.agentTaskId!);
  const composition = await tx.agentTask.findUnique({ where: { id: compositionStep.agentTaskId }, include: { session: true } });
  const replacement = replacementTaskId ? byId.get(replacementTaskId) : null;
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
  if (replacement && (replacement.retryCount !== 0 || replacement.executionAttempt > 1
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
  try {
    if (automaticIngestionReviewStage({ artifactId: source.artifactId, artifact: source.artifact, agentTask: composition }) !== 'source_review'
      || originalReview.contractVersion !== '4') return null;
  } catch { return null; }
  for (const step of failedSteps) {
    const task = byId.get(step.agentTaskId!)!;
    if (task.status !== 'succeeded' || task.executionAttempt !== 1 || task.retryCount !== 0) return null;
    const result = record(task.result);
    const review = record(result.scientificReview);
    const details = record(result.fieldDiagnosticsDetails);
    const diagnostics = record(result.fieldDiagnostics);
    const summaries = record(result.unverifiedSummaries);
    const ids = record(result.unverifiedSourcePassageIds);
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
  // A replacement after an unclassified failure or accepted-contract gap must carry the explicit
  // user action receipt; the read-only availability query never creates it.
  for (const step of reviews.filter(step => step.ordinal > 0)) {
    const predecessorId = reviews[step.ordinal - 1]!.agentTaskId!;
    const contractEvidence = contractRepairs.get(predecessorId);
    if (!genericFailureTaskIds.has(predecessorId) && !contractEvidence) continue;
    const receipt = await tx.auditLog.findFirst({ where: {
      action: 'hermes.research_run.source_review_recovery', targetType: 'hermes_research_run', targetId: run.id,
      actorId: run.actorId, metadata: { path: ['newAgentTaskId'], equals: step.agentTaskId! },
    } });
    const metadata = record(receipt?.metadata);
    const task = byId.get(step.agentTaskId!)!;
    if (!receipt || metadata.explicitUserAction !== true || metadata.oldAgentTaskId !== predecessorId
      || metadata.compositionSourceAgentTaskId !== composition.id || metadata.ordinal !== step.ordinal
      || task.session.idempotencyKey !== `${task.idempotencyKey}:hermes-recovery:${metadata.requestDigest}`) return null;
    if (contractEvidence && (metadata.recoveryClass !== CONTRACT_REPAIR_CLASS
      || !isDeepStrictEqual(metadata.contractEvidence, contractEvidence)
      || metadata.possibleDuplicateProviderCharge !== true || metadata.noProviderSwitch !== true)) return null;
  }
  if (replacement?.status === 'succeeded') {
    const finalResult = record(replacement.result);
    const finalReview = record(finalResult.scientificReview);
    try {
      if (finalReview.sourceAgentTaskId !== composition.id || finalReview.reviewedCandidateHash !== candidateHash
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
    recoveryClass: contractRepairs.has(failed.id) ? CONTRACT_REPAIR_CLASS : 'service_failure' as const,
    contractEvidence: contractRepairs.get(failed.id) };
}

/** Worker exception to current-source equality: only the committed current recovery may use its unchanged v4 parent. */
export async function requireHermesSourceReviewRecoveryBinding(tx: Prisma.TransactionClient, input: {
  ownerTaskId: string; ingestionTaskId: string; failedTaskId: string; compositionTaskId: string;
}): Promise<void> {
  const steps = await tx.hermesResearchStep.findMany({ where: { stage: 'source_review', ordinal: { gt: 0 }, agentTaskId: input.ownerTaskId }, take: 2 });
  const proof = steps.length === 1 ? await inspectHermesSourceReviewRecovery(tx, steps[0]!.runId, input.ownerTaskId) : null;
  if (!proof || proof.source.id !== input.ingestionTaskId || proof.failed.id !== input.failedTaskId
    || proof.composition.id !== input.compositionTaskId || proof.replacement?.status !== 'running') {
    throw new Error('[blocked] Source review recovery binding changed');
  }
}
