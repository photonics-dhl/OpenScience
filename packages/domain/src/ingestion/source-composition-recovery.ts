import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS, validateSdfDraftCore } from '@openscience/sdf-schema';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { requireActiveMembership } from '../workspace/helpers';
import { findSavedIngestionCommit } from './saved-source-commit';
import { parseDocumentSourceMapReference, type DocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { areSourceCompositionDraftClaimsValid } from './reviewed-claim-suggestions';
import { MAX_CANONICAL_CORE_CHARS } from './canonical-evidence-contract';

export const SOURCE_COMPOSITION_RECOVERY_ACTION = 'hermes.research_run.source_composition_recovery';
export const SOURCE_COMPOSITION_RECOVERY_PREFIX = 'ingestion-analysis-final-compose:';
export type HermesSavedSourceCompositionCandidate = { structuredAttempt: number; responseHash: string; providerAuditId: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string'
  && (empty || !!value.trim()) && value.length <= max;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const roles = new Set(['owner', 'maintainer', 'author', 'contributor']);

/** Called only after the saved reading-stage identity and envelope have been proven. */
function sourceCompositionProvidedPassageIds(stage: Record<string, unknown>): string[] {
  if (stage.kind === 'semantic_reduce') return [...new Set((stage.passageBindings as Array<Record<string, string[]>>)
    .flatMap(binding => [...binding.sourcePassageIds!, ...binding.qualifierPassageIds!]))];
  return [...new Set(SDF_CORE_FIELDS.flatMap(field => (record(record(stage.reduction).fields)[field] as Array<Record<string, string[]>>)
    .flatMap(point => point.evidenceIds!)))];
}

function exhaustedFinalComposition(result: Record<string, unknown>, schemaOnly = true): boolean {
  const core = record(result.core); const review = record(result.scientificReview);
  const diagnostics = record(result.fieldDiagnostics); const details = record(result.fieldDiagnosticsDetails);
  const evidence = record(result.evidence); const segments = record(result.evidenceSegments);
  return exact(core, ['schemaVersion', ...SDF_CORE_FIELDS]) && core.schemaVersion === '0.1.0'
    && exact(diagnostics, [...SDF_CORE_FIELDS]) && exact(details, [...SDF_CORE_FIELDS])
    && exact(evidence, [...SDF_CORE_FIELDS]) && exact(segments, [...SDF_CORE_FIELDS])
    && result.reason === 'canonical_partial_validation_exhausted' && Array.isArray(result.needsMoreInformation)
    && isDeepStrictEqual([...result.needsMoreInformation].sort(), [...SDF_CORE_FIELDS].sort())
    && SDF_CORE_FIELDS.every(field => core[field] === '' && diagnostics[field] === 'malformed_item'
      && (schemaOnly ? details[field] === 'scientificReview=SCHEMA_VALIDATION'
        : typeof details[field] === 'string' && /^scientificReview=[a-zA-Z_]{1,100}$/.test(details[field] as string))
      && record(evidence[field]).quote === '' && record(evidence[field]).locator === ''
      && Array.isArray(segments[field]) && (segments[field] as unknown[]).length === 0)
    && review.kind === 'model_self_check' && review.contractVersion === '4' && review.status === 'blocked_scientific_review'
    && review.provider === null && review.model === null && review.promptHash === undefined && review.responseHash === undefined
    && review.finishReason === undefined && review.usage === undefined && review.sourceAgentTaskId === undefined
    && review.draftClaims === undefined && result.reviewedClaimSuggestions === undefined;
}

/** This proves the persisted reading-stage envelope, not scientific acceptance of its assertions. */
function completeSavedSemanticStage(result: Record<string, unknown>, reference: DocumentSourceMapReference): boolean {
  const review = record(result.scientificReview); const stage = record(review.semanticStage);
  const source = record(stage.source); const usage = record(stage.usage); const reduction = record(stage.reduction);
  if (!exact(stage, ['kind', 'source', 'provider', 'model', 'promptHash', 'responseHash', 'finishReason', 'usage', 'passageBindings', 'reduction'])
    || !['semantic_reduce', 'source_bridge'].includes(String(stage.kind)) || stage.finishReason !== 'stop'
    || !text(stage.provider, Number.MAX_SAFE_INTEGER) || !text(stage.model, Number.MAX_SAFE_INTEGER) || !hash(stage.promptHash) || !hash(stage.responseHash)
    || !exact(source, ['artifactId', 'contentHash', 'sourceMapHash']) || source.artifactId !== reference.artifactId
    || source.contentHash !== reference.contentHash || source.sourceMapHash !== reference.serializedSha256
    || !exact(usage, ['inputTokens', 'outputTokens']) || !count(usage.inputTokens) || !count(usage.outputTokens)
    || !exact(reduction, ['fields', 'chosenRepresentativeCase'])
    || (reduction.chosenRepresentativeCase !== null && !text(reduction.chosenRepresentativeCase, 240))
    || !Array.isArray(stage.passageBindings) || !hash(review.reviewedCandidateHash)) return false;
  const bindings = new Set<string>();
  const passageIds = (value: unknown, required: boolean): value is string[] => Array.isArray(value)
    && (!required || value.length > 0) && value.length <= 32 && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && /^P\d{5}$/.test(id));
  for (const raw of stage.passageBindings) {
    const binding = record(raw);
    if (!exact(binding, ['observationId', 'sourcePassageIds', 'qualifierPassageIds']) || !text(binding.observationId, Number.MAX_SAFE_INTEGER)
      || bindings.has(binding.observationId) || !passageIds(binding.sourcePassageIds, true)
      || !passageIds(binding.qualifierPassageIds, false)) return false;
    bindings.add(binding.observationId);
  }
  if (stage.kind === 'source_bridge' ? bindings.size !== 0 : bindings.size === 0) return false;
  const fields = record(reduction.fields); const referenced = new Set<string>(); let total = 0;
  if (!exact(fields, [...SDF_CORE_FIELDS])) return false;
  for (const field of SDF_CORE_FIELDS) {
    const points = fields[field];
    if (!Array.isArray(points) || points.length > 4) return false;
    total += points.length;
    for (const raw of points) {
      const point = record(raw);
      if (!exact(point, ['statement', 'type', 'conditionCase', 'comparison', 'operation', 'evidenceIds'])
        || !text(point.statement, 1200) || !text(point.conditionCase, 600, true)
        || !['calculation', 'observation', 'author_assumption', 'author_interpretation', 'bounded_synthesis'].includes(String(point.type))
        || !Array.isArray(point.evidenceIds) || !point.evidenceIds.length || point.evidenceIds.length > 32
        || new Set(point.evidenceIds).size !== point.evidenceIds.length
        || point.evidenceIds.some(id => typeof id !== 'string' || (stage.kind === 'semantic_reduce' ? !bindings.has(id) : !/^P\d{5}$/.test(id)))) return false;
      for (const id of point.evidenceIds) referenced.add(id as string);
      for (const [name, keys] of [['comparison', ['quantity', 'relation', 'baseline']], ['operation', ['input', 'operator', 'variable', 'output']]] as const) {
        if (point[name] === null) continue;
        const relation = record(point[name]);
        if (!exact(relation, [...keys]) || keys.some(key => !text(relation[key], 400))) return false;
      }
    }
  }
  return total > 0 && total <= 18 && (!(fields.results as unknown[]).length ? reduction.chosenRepresentativeCase === null : true)
    && (stage.kind !== 'semantic_reduce' || (bindings.size === referenced.size && [...bindings].every(id => referenced.has(id))));
}

export async function hasOrdinarySourceTaskDebit(tx: Prisma.TransactionClient, taskId: string, actorId: string): Promise<boolean> {
  const row = await tx.usageLedger.findUnique({ where: { idempotencyKey: `agent-task-reserve:${taskId}` } });
  return Boolean(row && row.userId === actorId && row.resource === 'ai_credit' && BigInt(row.delta) === -1n
    && row.kind === 'consume' && row.reason === 'Agent task reservation sdf.extract'
    && isDeepStrictEqual(row.metadata, { taskId, kind: 'sdf.extract', policy: 'charged-on-submit' }));
}

/** At most one explicit final composition; history=true proves lineage without granting execution. */
export async function inspectHermesSourceCompositionRecovery(tx: Prisma.TransactionClient, runId: string,
  replacementTaskId?: string, history = false) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: runId }, include: { researchObject: true, steps: true } });
  if (!run || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.researchObject.deletedAt
    || run.researchObject.status !== 'draft'
    || (!history && (run.versionId !== null || run.sourceClaimIds.length || run.sourceReviewDigest
      || !(replacementTaskId ? ['running', 'awaiting_source_review'].includes(run.status) : run.status === 'failed')))) return null;
  const canonical = run.steps.filter(step => step.stage === 'source_ingestion');
  const compositions = run.steps.filter(step => step.stage === 'source_composition').sort((a, b) => a.ordinal - b.ordinal);
  if (canonical.length !== 1 || canonical[0]!.ordinal !== 0 || compositions.length !== (replacementTaskId ? 2 : 1)
    || compositions.some((step, index) => step.ordinal !== index || !step.agentTaskId || step.presentationAssetId !== null)
    || compositions[0]!.status !== 'failed'
    || (!history && run.steps.length !== canonical.length + compositions.length)) return null;
  const sourceStep = canonical[0]!; const failedStep = compositions[0]!; const replacementStep = compositions[1];
  if (!sourceStep.ingestionTaskId || !sourceStep.artifactId || !failedStep.agentTaskId
    || (replacementTaskId && replacementStep?.agentTaskId !== replacementTaskId)
    || compositions.some(step => step.ingestionTaskId !== sourceStep.ingestionTaskId || step.artifactId !== sourceStep.artifactId)) return null;
  const source = await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId }, include: { artifact: true, batch: true } });
  const failed = await tx.agentTask.findUnique({ where: { id: failedStep.agentTaskId }, include: { session: true } });
  const replacement = replacementTaskId ? await tx.agentTask.findUnique({ where: { id: replacementTaskId }, include: { session: true } }) : null;
  if (!source || !failed || source.artifactId !== sourceStep.artifactId || source.artifact.deletedAt || source.artifact.bytesPurgedAt
    || source.artifact.workspaceId !== run.researchObject.workspaceId || source.batch.userId !== run.actorId
    || source.batch.researchObjectId !== run.researchObjectId || source.retryCount !== 0
    || sourceStep.agentTaskId !== source.agentTaskId || (!history && source.agentTaskId !== (replacementTaskId ?? failed.id))
    || !(replacementTaskId ? ['queued', 'parsing', 'needs_review', ...(history ? ['confirmed', 'failed_retryable', 'failed_blocked'] : [])].includes(source.state) : source.state === 'needs_review')
    || failed.status !== 'succeeded' || failed.executionAttempt !== 1 || failed.retryCount !== 0
    || (replacementTaskId && !replacement)) return null;
  const result = record(failed.result); const review = record(result.scientificReview);
  let reference: DocumentSourceMapReference;
  try { reference = parseDocumentSourceMapReference(result.sourceMapRef); } catch { return null; }
  if (reference.parserStatus !== 'succeeded' || reference.artifactId !== source.artifactId || reference.contentHash !== source.artifact.blobSha256
    || result.canonicalExtractionContract !== 'grounded-passages-v2' || !exhaustedFinalComposition(result)
    || !isDeepStrictEqual(review.compositionSkill, { id: 'scientific-summary', version: '6' })
    || result.reviewedClaimSuggestions !== undefined || !completeSavedSemanticStage(result, reference)) return null;
  const initialRows = await tx.auditLog.findMany({ where: { action: 'ingestion.task.system_analysis_refresh', actorId: null,
    workspaceId: run.researchObject.workspaceId, targetType: 'ingestion_task', targetId: source.id,
    metadata: { path: ['newAgentTaskId'], equals: failed.id } }, take: 2 });
  const initial = record(initialRows[0]?.metadata);
  if (initialRows.length !== 1 || initial.executor !== 'hermes' || initial.authorizedByUserId !== run.actorId
    || initial.runId !== run.id || initial.stage !== 'source_composition' || initial.policy !== 'scientific_review_v4'
    || initial.artifactId !== source.artifactId || initial.sourceMapSha256 !== reference.serializedSha256
    || initial.creditPolicy !== 'charged_ingestion_analysis_refresh' || typeof initial.oldAgentTaskId !== 'string') return null;
  const parent = await tx.agentTask.findUnique({ where: { id: initial.oldAgentTaskId }, include: { session: true } });
  if (!parent || parent.status !== 'succeeded' || parent.id === failed.id) return null;
  const key = `ingestion-analysis-refresh:${source.id}:${parent.id}:scientific-review-v4`;
  if (failed.idempotencyKey !== key || failed.session.idempotencyKey !== `${key}:session`) return null;
  for (const task of [parent, failed, ...(replacement ? [replacement] : [])]) {
    if (task.deletedAt || task.kind !== 'sdf.extract' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.kind !== 'ingestion' || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
      || !isDeepStrictEqual(task.payload, { artifactId: source.artifactId, researchObjectId: run.researchObjectId })
      || !await hasOrdinarySourceTaskDebit(tx, task.id, run.actorId)) return null;
  }
  try { if (!isDeepStrictEqual(parseDocumentSourceMapReference(record(parent.result).sourceMapRef), reference)) return null; } catch { return null; }
  const recoveryKey = `${SOURCE_COMPOSITION_RECOVERY_PREFIX}${source.id}:${failed.id}`;
  const rows = await tx.auditLog.findMany({ where: { action: SOURCE_COMPOSITION_RECOVERY_ACTION, targetType: 'hermes_research_run',
    targetId: run.id, actorId: run.actorId, workspaceId: run.researchObject.workspaceId }, take: 2 });
  const receipt = rows[0]; const metadata = record(receipt?.metadata);
  if (replacement) {
    if (rows.length !== 1 || replacement.idempotencyKey !== recoveryKey || !hash(metadata.requestDigest)
      || replacement.session.idempotencyKey !== `${recoveryKey}:hermes-recovery:${metadata.requestDigest}`
      || metadata.oldAgentTaskId !== failed.id || metadata.newAgentTaskId !== replacement.id
      || metadata.ingestionTaskId !== source.id || metadata.artifactId !== source.artifactId
      || metadata.sourceMapSha256 !== reference.serializedSha256 || metadata.reviewedCandidateHash !== review.reviewedCandidateHash
      || metadata.semanticPromptHash !== record(review.semanticStage).promptHash || metadata.semanticResponseHash !== record(review.semanticStage).responseHash
      || metadata.creditPolicy !== 'fresh_task_charge' || metadata.chargeableAttempts !== 1
      || metadata.noReanalysis !== true || metadata.noProviderSwitch !== true || typeof metadata.clientIdempotencyKey !== 'string'
      || !metadata.clientIdempotencyKey.trim() || replacement.retryCount !== 0) return null;
    if (replacement.status === 'succeeded') {
      const final = record(replacement.result); const finalReview = record(final.scientificReview);
      try {
        if (final.canonicalExtractionContract !== 'grounded-passages-v2' || finalReview.kind !== 'model_self_check' || finalReview.contractVersion !== '4'
          || finalReview.reviewedCandidateHash !== review.reviewedCandidateHash
          || !isDeepStrictEqual(finalReview.semanticStage, review.semanticStage)
          || !isDeepStrictEqual(parseDocumentSourceMapReference(final.sourceMapRef), reference)) return null;
      } catch { return null; }
    }
  } else if (rows.length) return null;
  if (!history) {
    if (await findSavedIngestionCommit(tx, { taskId: source.id, researchObjectId: run.researchObjectId })
      || await tx.commit.findUnique({ where: { idempotencyKey: `ingestion-confirm:${source.id}` } })
      || await tx.hermesResearchStep.findFirst({ where: { stage: 'source_ingestion', ingestionTaskId: source.id,
        runId: { not: run.id }, run: { status: { notIn: ['succeeded', 'failed', 'stopped'] } } }, select: { id: true } })
      || await tx.agentTask.count({ where: { kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } }) !== 0) return null;
    const authority = await requireActiveMembership(tx, run.researchObject.workspaceId, run.actorId).catch(() => null);
    if (!authority || authority.workspace.status !== 'active' || !roles.has(authority.membership.role)) return null;
  }
  return { run, source, failed, parent, replacement, sourceStep, failedStep, replacementStep, reference, recoveryKey, receipt };
}

/** Read-only history proof for selecting ordinal one in the existing review and storyboard contracts. */
export async function inspectHermesRecoveredSourceComposition(tx: Prisma.TransactionClient, runId: string) {
  const steps = await tx.hermesResearchStep.findMany({ where: { runId, stage: 'source_composition', ordinal: 1 }, take: 2 });
  const step = steps.length === 1 ? steps[0] : null;
  return step?.agentTaskId ? inspectHermesSourceCompositionRecovery(tx, runId, step.agentTaskId, true) : null;
}

/** A paid reply can be read as a private candidate; its failed task and phase remain immutable. */
export async function inspectHermesSavedCompositionCandidate(tx: Prisma.TransactionClient, runId: string) {
  const proof = await inspectHermesRecoveredSourceComposition(tx, runId);
  if (!proof?.replacement || proof.replacement.status !== 'succeeded' || proof.replacement.executionAttempt !== 1
    || proof.replacementStep?.status !== 'failed' || !(proof.source.artifact.mimeType === 'application/pdf'
      || proof.source.artifact.logicalPath.toLowerCase().endsWith('.pdf'))) return null;
  const result = record(proof.replacement.result); const review = record(result.scientificReview);
  if (!exhaustedFinalComposition(result, false) || !Array.isArray(review.rejectedOutputs)
    || review.rejectedOutputs.length !== 2) return null;
  const output = record(review.rejectedOutputs.at(-1));
  if (output.kind !== 'schema_validation' || output.structuredAttempt !== 2 || output.finishReason !== 'stop'
    || !['composition_problem_summary_length', 'composition_insight_summary_length', 'composition_method_summary_length',
      'composition_results_summary_length', 'composition_limitations_summary_length', 'composition_reproducibility_summary_length',
      'composition_draft_claims'].includes(String(output.diagnostic))
    || typeof output.text !== 'string' || output.omissionReason !== undefined || output.byteLength !== Buffer.byteLength(output.text)
    || Number(output.byteLength) > 131_072 || !hash(output.promptHash) || !hash(output.responseHash)
    || createHash('sha256').update(output.text).digest('hex') !== output.responseHash
    || output.model !== 'MiniMax-M3' || typeof output.provider !== 'string' || !/^minimax-key-\d+-model-\d+$/.test(output.provider)) return null;
  let parsed: Record<string, unknown>;
  try { parsed = record(JSON.parse(output.text)); } catch { return null; }
  if (!exact(parsed, ['fields', 'needsMoreEvidence', 'draftClaims']) || !isDeepStrictEqual(parsed.needsMoreEvidence, [])) return null;
  const fields = record(parsed.fields); const providedIds = sourceCompositionProvidedPassageIds(record(review.semanticStage));
  if (!exact(fields, [...SDF_CORE_FIELDS]) || SDF_CORE_FIELDS.some(field => {
    const item = record(fields[field]); const ids = item.sourcePassageIds;
    return !exact(item, ['summary', 'sourcePassageIds']) || !text(item.summary, MAX_CANONICAL_CORE_CHARS)
      || /\bP\s*\d{5}\b/iu.test(String(item.summary)) || !Array.isArray(ids) || !ids.length || ids.length > 64
      || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !providedIds.includes(id));
  }) || !areSourceCompositionDraftClaimsValid(parsed.draftClaims, providedIds)
    || !(parsed.draftClaims as unknown[]).some(raw => record(raw).kind === 'core')) return null;
  const audits = await tx.auditLog.findMany({ where: { action: 'ai.gateway.call', requestId: proof.replacement.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 });
  if (audits.length !== 2) return null;
  for (const [index, raw] of review.rejectedOutputs.entries()) {
    const receipt = record(raw); const metadata = record(audits[index]?.metadata); const usage = record(receipt.usage);
    if (audits[index]?.actorId !== null || audits[index]?.targetType !== 'ai_gateway'
      || audits[index]?.requestId !== proof.replacement.id || audits[index]?.action !== 'ai.gateway.call'
      || receipt.structuredAttempt !== index + 1 || !['json_parse', 'schema_validation'].includes(String(receipt.kind))
      || receipt.finishReason !== 'stop' || typeof receipt.text !== 'string' || receipt.omissionReason !== undefined
      || receipt.byteLength !== Buffer.byteLength(receipt.text) || Number(receipt.byteLength) > 131_072
      || !hash(receipt.responseHash) || createHash('sha256').update(receipt.text).digest('hex') !== receipt.responseHash
      || !hash(receipt.promptHash) || metadata.promptHash !== receipt.promptHash
      || metadata.operation !== 'text' || metadata.outcome !== 'succeeded'
      || metadata.provider !== receipt.provider || metadata.model !== receipt.model || metadata.finishReason !== 'stop'
      || receipt.model !== output.model || receipt.provider !== output.provider
      || metadata.maxOutputTokens !== 65_536 || metadata.retryCount !== 0 || metadata.fallbackReason !== null || metadata.error !== null
      || !exact(usage, ['inputTokens', 'outputTokens']) || !count(usage.inputTokens) || !count(usage.outputTokens)
      || metadata.inputTokens !== usage.inputTokens || metadata.outputTokens !== usage.outputTokens) return null;
  }
  const audit = audits[1]!;
  return { ...proof, savedCompositionCandidate: { structuredAttempt: 2, responseHash: output.responseHash,
    providerAuditId: audit!.id } satisfies HermesSavedSourceCompositionCandidate };
}

export async function requireHermesSourceCompositionRecoveryExecution(tx: Prisma.TransactionClient,
  input: { ownerTaskId: string; ingestionTaskId: string; sourceAgentTaskId: string; executionAttempt: number }) {
  const steps = await tx.hermesResearchStep.findMany({ where: { stage: 'source_composition', ordinal: 1, agentTaskId: input.ownerTaskId }, take: 2 });
  const proof = steps.length === 1 ? await inspectHermesSourceCompositionRecovery(tx, steps[0]!.runId, input.ownerTaskId) : null;
  if (!proof || proof.source.id !== input.ingestionTaskId || proof.failed.id !== input.sourceAgentTaskId
    || proof.replacement?.status !== 'running' || proof.replacement.executionAttempt !== input.executionAttempt
    || !Number.isSafeInteger(input.executionAttempt) || input.executionAttempt < 1
    || !['queued', 'parsing'].includes(proof.source.state)) throw new Error('[blocked] Final source composition recovery authority changed');
  return { runId: proof.run.id, taskId: proof.replacement.id, sourceMapRef: proof.reference, previousResult: proof.failed.result };
}

/** Runs inside the existing terminal task transaction immediately before storing the result. */
export async function requireHermesSourceCompositionRecoveryResult(tx: Prisma.TransactionClient,
  task: { id: string; idempotencyKey: string | null; executionAttempt: number; result: unknown }, incoming: unknown) {
  const key = /^ingestion-analysis-final-compose:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(task.idempotencyKey ?? '');
  if (!key) throw new Error('[blocked] Final source composition task identity changed');
  const proof = await requireHermesSourceCompositionRecoveryExecution(tx, { ownerTaskId: task.id, ingestionTaskId: key[1]!,
    sourceAgentTaskId: key[2]!, executionAttempt: task.executionAttempt });
  const result = record(incoming); const review = record(result.scientificReview);
  const previous = record(proof.previousResult); const previousReview = record(previous.scientificReview);
  const checkpoint = record(task.result);
  try {
    if (!isDeepStrictEqual(parseDocumentSourceMapReference(checkpoint.sourceMapRef), proof.sourceMapRef)
      || !isDeepStrictEqual(parseDocumentSourceMapReference(result.sourceMapRef), proof.sourceMapRef)
      || !isDeepStrictEqual(review.semanticStage, previousReview.semanticStage)
      || review.reviewedCandidateHash !== previousReview.reviewedCandidateHash
      || !isDeepStrictEqual(review.compositionSkill, previousReview.compositionSkill)
      || result.canonicalExtractionContract !== 'grounded-passages-v2' || review.kind !== 'model_self_check'
      || review.contractVersion !== '4' || review.sourceAgentTaskId !== undefined || result.reviewedClaimSuggestions !== undefined)
      throw new Error('Final source composition identity changed');
    if (exhaustedFinalComposition(result, false)) return;
    const core = record(result.core); const claims = review.draftClaims;
    if (review.status !== 'review_received' || result.reason || Object.keys(record(result.fieldDiagnostics)).length
      || !validateSdfDraftCore(core).ok || SDF_CORE_FIELDS.some(field => typeof core[field] !== 'string' || !String(core[field]).trim()
        || String(core[field]).length > MAX_CANONICAL_CORE_CHARS || /\bP\s*\d{5}\b/iu.test(String(core[field])))
      || !isDeepStrictEqual(result.needsMoreInformation, []) || !Array.isArray(claims) || !claims.length
      || JSON.stringify(claims).length > 8000
      || !hash(review.promptHash) || !hash(review.responseHash) || review.finishReason !== 'stop'
      || !text(review.provider, Number.MAX_SAFE_INTEGER) || !text(review.model, Number.MAX_SAFE_INTEGER)) throw new Error('Final composition candidate is incomplete');
    const providedIds = sourceCompositionProvidedPassageIds(record(previousReview.semanticStage));
    if (!areSourceCompositionDraftClaimsValid(claims, providedIds) || !claims.some(raw => record(raw).kind === 'core'))
      throw new Error('Final composition draft Claims are invalid');
  } catch { throw new Error('[blocked] Final source composition result changed or is incomplete'); }
}
