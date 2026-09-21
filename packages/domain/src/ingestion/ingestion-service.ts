import { freezeResearchRecord } from '../commit/research-record-snapshot';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { createArtifact } from '../artifact/artifacts';
import { AI_CREDIT_RESOURCE, createAgentSession, dispatchAgentTask, findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction, persistSourceMapSearchIndexInTransaction, projectAgentTaskResult, submitAgentTask, type AgentDeps } from '../agent/agent';
import { AgentError } from '../agent/errors';
import { requireActive, requireActiveMembership, requireMembership } from '../workspace/helpers';
import { WorkspaceError } from '../workspace/errors';
import { recordAudit } from '../workspace/audit';
import { validateSdfCore, validateSdfDraftCore } from '@openscience/sdf-schema';
import { createCommit, type CreateCommitResult } from '../commit/commits';
import { ResearchObjectError } from '../research-object/errors';
import { SDF_NODE_TYPES } from '../research-object/types';
import type { SdfDocumentView } from '../research-object/sdf';
import { carryVersionEvidence, writeIngestionEvidence } from './ingestion-evidence';
import { IngestionError } from './errors';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { recordEntry } from '../usage/ledger';
import { assertIngestionContent, assertSupportedIngestionFile } from './format-policy';
import { isOwnedPrismaIdempotencyConflict } from '../prisma-idempotency-conflict';
import type { ActionableIngestionTaskView, IngestionBatchView, IngestionFileInput, IngestionTaskView } from './ingestion-types';
import { automaticIngestionReview, automaticIngestionReviewStage, requireUnchangedAutomaticCore, type HermesIngestionReviewStage } from './automatic-review';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { findSavedIngestionCommit, type SavedIngestionOrigin } from './saved-source-commit';
import { inspectHermesSourceReviewRecovery } from './source-review-recovery';

export type IngestionDeps = AgentDeps & { storage: StorageAdapter };

const INGESTION_WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const LEGACY_FULL_DOCUMENT_LIMIT_ERROR = '[blocked] Paper exceeds the full-document understanding limit; split the document into research sections before analysis';

function exactRecordKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}

function isCanonicalAllFieldsMissingResult(value: unknown, artifact: { id: string; blobSha256: string }): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!exactRecordKeys(result.core, ['schemaVersion', ...SDF_NODE_TYPES])) return false;
  const core = result.core;
  const evidenceSegments = result.evidenceSegments;
  const evidence = result.evidence;
  const needsMoreInformation = result.needsMoreInformation;
  if (core.schemaVersion !== '0.1.0' || SDF_NODE_TYPES.some((field) => core[field] !== '')) return false;
  if (!Array.isArray(needsMoreInformation) || needsMoreInformation.length !== SDF_NODE_TYPES.length
    || new Set(needsMoreInformation).size !== SDF_NODE_TYPES.length
    || SDF_NODE_TYPES.some((field) => !needsMoreInformation.includes(field))) return false;
  if (!exactRecordKeys(evidenceSegments, SDF_NODE_TYPES)
    || SDF_NODE_TYPES.some((field) => { const value = evidenceSegments[field]; return !Array.isArray(value) || value.length !== 0; })) return false;
  if (!exactRecordKeys(evidence, SDF_NODE_TYPES)
    || SDF_NODE_TYPES.some((field) => { const value = evidence[field]; return !exactRecordKeys(value, ['quote', 'locator'])
      || value.quote !== '' || value.locator !== ''; })) return false;
  try {
    const reference = parseDocumentSourceMapReference(result.sourceMapRef);
    return reference.parserStatus === 'succeeded' && reference.artifactId === artifact.id
      && reference.contentHash === artifact.blobSha256;
  } catch {
    return false;
  }
}

function isLegacyCharacterEvidenceResult(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!exactRecordKeys(result, ['core', 'evidence', 'needsMoreInformation'])
    || Object.hasOwn(result, 'sourceMapRef') || Object.hasOwn(result, 'evidenceSegments')) return false;
  const core = result.core;
  if (!exactRecordKeys(core, ['schemaVersion', ...SDF_NODE_TYPES]) || !validateSdfDraftCore(core).ok
    || SDF_NODE_TYPES.some((field) => typeof core[field] !== 'string')
    || !SDF_NODE_TYPES.some((field) => String(core[field]).trim())) return false;
  if (!exactRecordKeys(result.evidence, SDF_NODE_TYPES)) return false;
  const evidence = result.evidence;
  if (SDF_NODE_TYPES.some((field) => {
    const item = evidence[field];
    return !exactRecordKeys(item, ['quote', 'locator']) || typeof item.quote !== 'string' || typeof item.locator !== 'string'
      || (item.locator !== '' && !/^chars:\d+-\d+$/.test(item.locator));
  })) return false;
  return Array.isArray(result.needsMoreInformation)
    && result.needsMoreInformation.every((field) => SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number]));
}

const CANONICAL_DIAGNOSTICS = new Set([
  'malformed_item', 'missing_requires_empty', 'summary_required', 'segment_count_1_to_32',
  'duplicate_ids', 'unknown_ids', 'ordered_ids_required', 'contiguous_ids_required',
  'window_required', 'unknown_window', 'quote_required', 'quote_not_found', 'quote_ambiguous',
  'source_text_limit_8000', 'core_text_limit_4000', 'noncontiguous_block_passages',
]);
type AnalysisRefreshPolicy = 'legacy_character_evidence_v1' | 'native_pdf_fragmentation_v1'
  | 'canonical_window_contract_v1' | 'canonical_exact_quote_v1' | 'grounded_summary_v1' | 'grounded_passages_v1' | 'grounded_passages_v2'
  | 'scientific_review_v4' | 'user_requested_reanalysis';

function analysisRefreshPolicy(value: unknown, artifact: { id: string; blobSha256: string }): AnalysisRefreshPolicy | undefined {
  if (isLegacyCharacterEvidenceResult(value)) return 'legacy_character_evidence_v1';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  const diagnostics = result.fieldDiagnostics;
  const core = result.core;
  if (result.canonicalExtractionContract === 'grounded-passages-v2'
    && exactRecordKeys(core, ['schemaVersion', ...SDF_NODE_TYPES]) && validateSdfDraftCore(core).ok) {
    try {
      const reference = parseDocumentSourceMapReference(result.sourceMapRef);
      if (reference.parserStatus === 'succeeded' && reference.artifactId === artifact.id
        && reference.contentHash === artifact.blobSha256) {
        const review = result.scientificReview;
        const reviewed = review && typeof review === 'object' && !Array.isArray(review)
          && (review as Record<string, unknown>).status === 'review_received';
        return reviewed ? 'user_requested_reanalysis' : 'scientific_review_v4';
      }
    } catch { return undefined; }
  }
  if (result.canonicalExtractionContract === 'grounded-passages-v1'
    && result.reason === 'canonical_partial_validation_exhausted'
    && exactRecordKeys(core, ['schemaVersion', ...SDF_NODE_TYPES]) && validateSdfDraftCore(core).ok
    && diagnostics && typeof diagnostics === 'object' && !Array.isArray(diagnostics)) {
    const entries = Object.entries(diagnostics);
    if (entries.length && entries.every(([field, reason]) => SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number])
      && ['passage_ids_required', 'segment_count_1_to_32', 'source_text_limit_8000'].includes(String(reason)))) {
      try {
        const reference = parseDocumentSourceMapReference(result.sourceMapRef);
        if (reference.parserStatus === 'succeeded' && reference.artifactId === artifact.id
          && reference.contentHash === artifact.blobSha256) return 'grounded_passages_v2';
      } catch { return undefined; }
    }
  }
  if ((result.canonicalExtractionContract === 'exact-quote-v1'
      || (result.canonicalExtractionContract === 'grounded-summary-v1' && result.reason === 'canonical_partial_validation_exhausted'))
    && exactRecordKeys(core, ['schemaVersion', ...SDF_NODE_TYPES]) && validateSdfDraftCore(core).ok) {
    try {
      const reference = parseDocumentSourceMapReference(result.sourceMapRef);
      if (reference.parserStatus === 'succeeded' && reference.artifactId === artifact.id
        && reference.contentHash === artifact.blobSha256) return result.canonicalExtractionContract === 'grounded-summary-v1'
          ? 'grounded_passages_v1' : 'grounded_summary_v1';
    } catch { return undefined; }
  }
  if (result.reason !== 'canonical_partial_validation_exhausted' || !diagnostics
    || typeof diagnostics !== 'object' || Array.isArray(diagnostics)
    || !exactRecordKeys(core, ['schemaVersion', ...SDF_NODE_TYPES]) || !validateSdfDraftCore(core).ok
    || SDF_NODE_TYPES.some((field) => typeof core[field] !== 'string')
    || !SDF_NODE_TYPES.some((field) => String(core[field]).trim())) return undefined;
  const entries = Object.entries(diagnostics);
  if (entries.length === 0 || entries.some(([field, reason]) => !SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number])
    || typeof reason !== 'string' || !CANONICAL_DIAGNOSTICS.has(reason))) return undefined;
  try {
    const reference = parseDocumentSourceMapReference(result.sourceMapRef);
    if (reference.parserStatus !== 'succeeded' || reference.artifactId !== artifact.id
      || reference.contentHash !== artifact.blobSha256) return undefined;
    if (result.canonicalExtractionContract === 'windowed-source-v2'
      && entries.every(([, reason]) => reason === 'segment_count_1_to_32')) return 'canonical_exact_quote_v1';
    if (result.canonicalExtractionContract !== undefined) return undefined;
    if (entries.some(([, reason]) => reason === 'segment_count_1_to_32')) return 'native_pdf_fragmentation_v1';
    if (entries.every(([, reason]) => reason === 'contiguous_ids_required')) return 'canonical_window_contract_v1';
    return undefined;
  } catch { return undefined; }
}

function validRefreshSourceExecution(
  policy: AnalysisRefreshPolicy,
  ingestionTaskId: string,
  agent: { executionAttempt: number; retryCount: number; idempotencyKey: string | null },
): boolean {
  const expectedAttempt = agent.retryCount + 1;
  if (agent.executionAttempt === expectedAttempt) return true;
  if (policy !== 'scientific_review_v4' || agent.executionAttempt < expectedAttempt) return false;
  return new RegExp(`^ingestion-analysis-refresh:${ingestionTaskId}:[0-9a-f-]{36}:(?:grounded-passages-v[12]|scientific-review-v[34]|user-requested-reanalysis)$`).test(agent.idempotencyKey ?? '')
    || new RegExp(`^ingestion-analysis-reanalysis:${ingestionTaskId}:[0-9a-f-]{36}$`).test(agent.idempotencyKey ?? '');
}

function isOldFragmentedNativePdfMap(sourceMap: Awaited<ReturnType<typeof loadDocumentSourceMapReference>>): boolean {
  const oldVersion = '2.4.5+pdfjs-dist.5.4.296';
  const newVersion = '2.4.5+pdfjs-dist.5.4.296.line-runs.1';
  const blocks = sourceMap.pages.flatMap((page) => page.blocks);
  return sourceMap.parser.name === 'openscience-parser-cascade' && sourceMap.parser.version === '1.0.0'
    && blocks.some((block) => block.parser.name === 'pdf-parse-pdfjs-text-items' && block.parser.version === oldVersion
      && block.transformations.some((item) => item.stage === 'extract_text'
        && item.processor.name === 'pdf-parse-pdfjs-text-items' && item.processor.version === oldVersion))
    && !blocks.some((block) => block.parser.name === 'pdf-parse-pdfjs-text-items' && block.parser.version === newVersion
      || block.transformations.some((item) => item.processor.name === 'pdf-parse-pdfjs-text-items' && item.processor.version === newVersion));
}

function isLineRunNativePdfMap(sourceMap: Awaited<ReturnType<typeof loadDocumentSourceMapReference>>): boolean {
  const version = '2.4.5+pdfjs-dist.5.4.296.line-runs.1';
  const blocks = sourceMap.pages.flatMap((page) => page.blocks);
  return sourceMap.parser.name === 'openscience-parser-cascade' && sourceMap.parser.version === '1.0.0'
    && blocks.some((block) => block.parser.name === 'pdf-parse-pdfjs-text-items' && block.parser.version === version
      && block.transformations.some((item) => item.stage === 'extract_text'
        && item.processor.name === 'pdf-parse-pdfjs-text-items' && item.processor.version === version));
}

export async function authorizeIngestionWrite(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string },
) {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro || ro.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
  const { workspace, membership } = await requireMembership(deps, ro.workspaceId, input.userId);
  requireActive(workspace);
  if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
  return { researchObject: ro, workspace, membership };
}

export async function createIngestionBatch(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string; processingConsent: boolean; files: IngestionFileInput[]; idempotencyKey?: string },
  ctx: AuditContext = {},
): Promise<IngestionBatchView> {
  if (!input.processingConsent) throw new IngestionError('PROCESSING_CONSENT_REQUIRED', 'Processing consent is required');
  if (input.files.length === 0) throw new IngestionError('VALIDATION_ERROR', 'At least one file is required');
  input.files.forEach((file) => {
    assertSupportedIngestionFile(file.filename, file.mimeType);
    assertIngestionContent(file.filename, file.content);
  });
  const logicalPaths = planLogicalPaths(input.files.map((file) => file.filename));

  const { researchObject: ro } = await authorizeIngestionWrite(deps, input);

  const stableKey = input.idempotencyKey ?? randomUUID();
  const requestDigest = createHash('sha256').update(JSON.stringify(input.files.map((file, index) => ({
    filename: logicalPaths[index], mimeType: file.mimeType ?? null,
    sha256: createHash('sha256').update(file.content).digest('hex'),
  })))).digest('hex');
  let batch = await deps.prisma.ingestionBatch.findUnique({ where: { idempotencyKey: stableKey } });
  if (batch && (batch.userId !== input.userId || batch.researchObjectId !== ro.id || batch.requestDigest !== requestDigest)) {
    throw new IngestionError('VALIDATION_ERROR', 'Idempotency key belongs to another ingestion request');
  }
  if (!batch) {
    try {
      batch = await deps.prisma.ingestionBatch.create({
        data: { researchObjectId: ro.id, userId: input.userId, idempotencyKey: stableKey, requestDigest },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        batch = await deps.prisma.ingestionBatch.findUnique({ where: { idempotencyKey: stableKey } });
      }
      if (!batch) throw error;
    }
  }
  if (batch.userId !== input.userId || batch.researchObjectId !== ro.id || batch.requestDigest !== requestDigest) {
    throw new IngestionError('VALIDATION_ERROR', 'Idempotency key belongs to another ingestion request');
  }
  let sessionId = batch.agentSessionId;
  if (!sessionId) {
    const session = await createAgentSession(deps, {
      userId: input.userId, researchObjectId: ro.id, kind: 'ingestion', title: `Ingestion ${batch.id}`, idempotencyKey: `${stableKey}:session`,
    }, ctx);
    batch = await deps.prisma.ingestionBatch.update({ where: { id: batch.id }, data: { agentSessionId: session.id } });
    sessionId = session.id;
  }

  for (const [index, file] of input.files.entries()) {
    const artifact = await createArtifact(deps, {
      logicalPath: logicalPaths[index], content: file.content,
      uploadedBy: input.userId, workspaceId: ro.workspaceId, idempotencyKey: `${stableKey}:artifact:${index}`,
    }, ctx);
    const agentTask = await submitAgentTask(deps, {
      sessionId, userId: input.userId, kind: 'sdf.extract',
      payload: { artifactId: artifact.artifactId, researchObjectId: ro.id },
      idempotencyKey: `${stableKey}:extract:${index}`, dispatch: false,
    }, ctx);
    const existingTask = await deps.prisma.ingestionTask.findUnique({
      where: { batchId_artifactId: { batchId: batch.id, artifactId: artifact.artifactId } },
    });
    if (!existingTask) {
      await deps.prisma.ingestionTask.create({
        data: { batchId: batch.id, artifactId: artifact.artifactId, agentTaskId: agentTask.id, state: 'queued' },
      }).catch((error: unknown) => {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      });
    }
    await dispatchAgentTask(deps, agentTask.id);
  }

  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'ingestion.batch.create', workspaceId: ro.workspaceId,
    targetType: 'ingestion_batch', targetId: batch.id, metadata: { researchObjectId: ro.id, fileCount: input.files.length },
  }, ctx);
  return getIngestionBatch(deps, { userId: input.userId, batchId: batch.id });
}

function planLogicalPaths(filenames: string[]): string[] {
  const used = new Set<string>();
  return filenames.map((filename) => {
    if (!filename || filename.length > 255 || filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.startsWith('.')) {
      throw new IngestionError('VALIDATION_ERROR', 'Invalid ingestion filename');
    }
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : '';
    let candidate = filename;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${stem} (${suffix++})${extension}`;
    used.add(candidate);
    return candidate;
  });
}

export async function getIngestionBatch(
  deps: IngestionDeps,
  input: { userId: string; batchId: string },
): Promise<IngestionBatchView> {
  const batch = await deps.prisma.ingestionBatch.findUnique({
    where: { id: input.batchId }, include: { researchObject: true, tasks: { where: { artifact: { deletedAt: null }, OR: [{ agentTaskId: null }, { agentTask: { deletedAt: null } }] }, include: { artifact: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!batch || batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion batch not found');
  await requireMembership(deps, batch.researchObject.workspaceId, input.userId);
  return {
    batchId: batch.id, researchObjectId: batch.researchObjectId,
    tasks: batch.tasks.map(taskToView),
  };
}

export async function getIngestionTask(
  deps: IngestionDeps,
  input: { userId: string; taskId: string },
): Promise<{ task: IngestionTaskView & { result: Record<string, unknown> | null }; batchId: string; researchObjectId: string; version: number }> {
  const task = await deps.prisma.ingestionTask.findUnique({ where: { id: input.taskId }, include: { artifact: true, agentTask: true, batch: { include: { researchObject: true }, } } });
  if (!task || task.artifact.deletedAt || task.agentTask?.deletedAt || task.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  await requireMembership(deps, task.batch.researchObject.workspaceId, input.userId);
  const result = projectAgentTaskResult(task.agentTask?.result, task.agentTask?.kind ?? '');
  return { task: { ...taskToView(task), result }, batchId: task.batchId, researchObjectId: task.batch.researchObjectId, version: task.batch.researchObject.version };
}

const ACTIONABLE_INGESTION_STATES = [
  'queued', 'uploading', 'stored', 'parsing', 'needs_review', 'failed_retryable', 'failed_blocked',
] as const;

/** Dashboard defaults to caller-owned work; an authorized RO scope includes its members' work. */
export async function listActionableIngestionTasks(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId?: string },
): Promise<ActionableIngestionTaskView[]> {
  if (input.researchObjectId !== undefined) {
    const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
    if (!ro || ro.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
    await requireMembership(deps, ro.workspaceId, input.userId);
  }
  const tasks = await deps.prisma.ingestionTask.findMany({
    where: {
      batch: input.researchObjectId === undefined
        ? { userId: input.userId, researchObject: { deletedAt: null, status: { not: 'archived' } } }
        : { researchObjectId: input.researchObjectId },
      artifact: { deletedAt: null },
      OR: [{ agentTaskId: null }, { agentTask: { deletedAt: null } }],
      state: { in: [...ACTIONABLE_INGESTION_STATES] },
    },
    include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  return tasks.map((task) => ({
    ...taskToView(task),
    researchObjectId: task.batch.researchObjectId,
    researchTitle: task.batch.researchObject.title,
  }));
}

export async function retryIngestionTask(
  deps: IngestionDeps,
  input: { userId: string; taskId: string },
  ctx: AuditContext = {},
): Promise<IngestionTaskView> {
  let queued: Prisma.IngestionTaskGetPayload<{ include: { artifact: true } }> | null | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      queued = await deps.prisma.$transaction(async (tx) => {
        const task = await tx.ingestionTask.findUnique({
          where: { id: input.taskId }, include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } },
        });
        if (!task || task.artifact.deletedAt || task.agentTask?.deletedAt || task.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { workspace, membership } = await requireActiveMembership(tx, task.batch.researchObject.workspaceId, input.userId);
        if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
        const result = task.agentTask?.result;
        let legacyProposalFailure = false;
        let parserRecovery = false;
        let passageBudgetRecovery = false;
        if (task.state === 'needs_review' && task.retryCount >= 0 && task.retryCount < 2 && task.agentTask?.kind === 'sdf.extract'
          && task.agentTask.status === 'succeeded' && task.agentTask.retryCount === task.retryCount
          && result && typeof result === 'object' && !Array.isArray(result)) {
          const record = result as Record<string, unknown>;
          try {
            const reference = parseDocumentSourceMapReference(record.sourceMapRef);
            legacyProposalFailure = task.retryCount === 0 && record.status === 'needs_review' && record.reason === 'sdf-proposal-unavailable'
              && !Object.hasOwn(record, 'core') && reference.parserStatus === 'succeeded'
              && reference.artifactId === task.artifactId && reference.contentHash === task.artifact.blobSha256;
            if (task.retryCount === 0 && task.agentTask.executionAttempt === 1
              && record.sourceMapReused === true
              && /^ingestion-analysis-refresh:[0-9a-f-]{36}:[0-9a-f-]{36}:grounded-passages-v1$/.test(task.agentTask.idempotencyKey ?? '')
              && task.batch.userId === input.userId && record.canonicalExtractionContract === 'grounded-passages-v1'
              && record.reason === 'canonical_partial_validation_exhausted'
              && reference.parserStatus === 'succeeded' && reference.artifactId === task.artifactId
              && reference.contentHash === task.artifact.blobSha256
              && record.fieldDiagnostics && typeof record.fieldDiagnostics === 'object' && !Array.isArray(record.fieldDiagnostics)) {
              const entries = Object.entries(record.fieldDiagnostics);
              const session = await tx.agentSession.findUnique({ where: { id: task.agentTask.sessionId } });
              passageBudgetRecovery = entries.length > 0 && entries.every(([field, reason]) =>
                SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number])
                && ['passage_ids_required', 'segment_count_1_to_32', 'source_text_limit_8000'].includes(String(reason)))
                && session?.userId === input.userId && session.status === 'active'
                && session.researchObjectId === task.batch.researchObjectId;
            }
            if (record.status === 'needs_review' && record.reason === 'unresolved pages remain'
              && !Object.hasOwn(record, 'core') && reference.parserStatus === 'needs_review'
              && reference.artifactId === task.artifactId && reference.contentHash === task.artifact.blobSha256
              && task.agentTask.executionAttempt === task.retryCount + 1 && task.batch.userId === input.userId) {
              const session = await tx.agentSession.findUnique({ where: { id: task.agentTask.sessionId } });
              parserRecovery = session?.userId === input.userId && session.status === 'active'
                && session.researchObjectId === task.batch.researchObjectId;
            }
          } catch {
            legacyProposalFailure = false;
          }
        }
        const agentTask = task.agentTask;
        let parserCheckpoint: Prisma.InputJsonValue | undefined;
        let legacyFullDocumentLimitRecovery = false;
        if (agentTask?.kind === 'sdf.extract' && !task.artifact.bytesPurgedAt
          && task.artifact.workspaceId === workspace.id && task.batch.userId === input.userId
          && exactRecordKeys(agentTask.payload, ['artifactId', 'researchObjectId'])
          && agentTask.payload.artifactId === task.artifactId
          && agentTask.payload.researchObjectId === task.batch.researchObjectId) {
          const session = await tx.agentSession.findUnique({ where: { id: agentTask.sessionId } });
          if (session?.userId === input.userId && session.status === 'active' && !session.deletedAt
            && session.researchObjectId === task.batch.researchObjectId) {
            if (exactRecordKeys(result, ['sourceMapRef'])) {
              try {
                const reference = parseDocumentSourceMapReference(result.sourceMapRef);
                if (reference.parserStatus === 'succeeded' && reference.artifactId === task.artifactId
                  && reference.contentHash === task.artifact.blobSha256) {
                  parserCheckpoint = result as Prisma.InputJsonValue;
                }
              } catch { /* Invalid or incomplete results follow the existing reset policy. */ }
            }
            legacyFullDocumentLimitRecovery = task.state === 'failed_blocked' && task.retryCount === 0
              && task.error === LEGACY_FULL_DOCUMENT_LIMIT_ERROR
              && agentTask.status === 'failed' && agentTask.error === LEGACY_FULL_DOCUMENT_LIMIT_ERROR
              && agentTask.retryCount === 0 && agentTask.executionAttempt === 1
              && (result === null || parserCheckpoint !== undefined);
          }
        }
        const failedRetry = task.state === 'failed_retryable' && task.retryCount >= 0 && task.retryCount < 3
          && agentTask?.kind === 'sdf.extract' && agentTask.status === 'failed'
          && agentTask.retryCount === task.retryCount && agentTask.executionAttempt === task.retryCount + 1;
        let canonicalAllMissingRecovery = false;
        if (task.state === 'needs_review' && task.retryCount === 1 && agentTask?.kind === 'sdf.extract'
          && agentTask.status === 'succeeded' && agentTask.retryCount === 1
          && agentTask.executionAttempt === 2 && isCanonicalAllFieldsMissingResult(result, task.artifact)) {
          const session = await tx.agentSession.findUnique({ where: { id: agentTask.sessionId } });
          canonicalAllMissingRecovery = session?.userId === input.userId && session.status === 'active';
        }
        const retryAttempt = parserRecovery ? task.retryCount + 1 : canonicalAllMissingRecovery ? 2 : failedRetry ? task.retryCount + 1 : 1;
        let activeFailedRetryOwner = false;
        let paidFailedRetry = false;
        let compensatedSchemaRetry = false;
        if (failedRetry && agentTask) {
          const session = await tx.agentSession.findUnique({ where: { id: agentTask.sessionId } });
          if (session?.userId === input.userId && session.status === 'active') {
            activeFailedRetryOwner = true;
            if (task.retryCount === 1) {
              paidFailedRetry = true;
            } else if (task.retryCount === 2
              && task.error === agentTask.error
              && (agentTask.error === '结构化输出超过重试上限' || agentTask.error === 'canonical_validation_exhausted')) {
              const priorCharge = await tx.usageLedger.findUnique({
                where: { idempotencyKey: `agent-task-recovery:${agentTask.id}:2` },
                select: { userId: true, resource: true, delta: true, kind: true, reason: true, metadata: true },
              });
              const priorMetadata = priorCharge?.metadata && typeof priorCharge.metadata === 'object'
                && !Array.isArray(priorCharge.metadata) ? priorCharge.metadata as Record<string, unknown> : null;
              compensatedSchemaRetry = priorCharge?.userId === input.userId
                && priorCharge.resource === AI_CREDIT_RESOURCE && priorCharge.delta === BigInt(-1)
                && priorCharge.kind === 'consume' && priorCharge.reason === 'Agent task recovery sdf.extract'
                && Boolean(priorMetadata && exactRecordKeys(priorMetadata, ['taskId', 'kind', 'retryAttempt', 'policy'])
                  && priorMetadata.taskId === agentTask.id && priorMetadata.kind === 'sdf.extract'
                  && priorMetadata.retryAttempt === 2
                  && (priorMetadata.policy === 'charged-on-remediation' || priorMetadata.policy === 'charged-on-retry'));
            }
          }
        }
        const authorizedFailedRetry = failedRetry && activeFailedRetryOwner
          && (task.retryCount === 0 || paidFailedRetry || compensatedSchemaRetry);
        if (!authorizedFailedRetry && !legacyProposalFailure && !canonicalAllMissingRecovery && !parserRecovery
          && !passageBudgetRecovery && !legacyFullDocumentLimitRecovery) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only retryable extraction failures can be retried');
        }
        if (!deps.audit?.record) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction retry audit is unavailable');
        const recovery = legacyFullDocumentLimitRecovery ? 'legacy_full_document_limit'
          : passageBudgetRecovery ? 'canonical_passage_budget' : parserRecovery ? 'unresolved_parser_pages'
          : canonicalAllMissingRecovery ? 'canonical_all_fields_missing'
          : legacyProposalFailure ? 'legacy_sdf_proposal_unavailable'
            : compensatedSchemaRetry ? 'canonical_schema_exhaustion_compensation'
              : paidFailedRetry ? 'failed_retryable_paid' : 'failed_retryable';
        if (canonicalAllMissingRecovery || paidFailedRetry) {
          if (!agentTask) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction task is unavailable');
          const balance = await tx.usageLedger.aggregate({
            where: { userId: input.userId, resource: AI_CREDIT_RESOURCE }, _sum: { delta: true },
          });
          if (Number(balance._sum.delta ?? 0) <= 0) {
            throw new AgentError('INSUFFICIENT_CREDIT', 'AI Credit 不足（§2.4-7），请补充后再试');
          }
          await recordEntry(tx, {
            userId: input.userId, resource: AI_CREDIT_RESOURCE, delta: -1, kind: 'consume',
            reason: 'Agent task recovery sdf.extract', idempotencyKey: `agent-task-recovery:${agentTask.id}:${retryAttempt}`,
            metadata: { taskId: agentTask.id, kind: agentTask.kind, retryAttempt,
              policy: canonicalAllMissingRecovery ? 'charged-on-remediation' : 'charged-on-retry' },
          });
        }
        const resetAgent = await tx.agentTask.updateMany({
          where: {
            id: task.agentTaskId!, kind: 'sdf.extract', retryCount: retryAttempt - 1,
            sessionId: agentTask!.sessionId, deletedAt: null, error: agentTask!.error,
            payload: { equals: agentTask!.payload as Prisma.InputJsonValue },
            result: { equals: result === null ? Prisma.AnyNull : result as Prisma.InputJsonValue },
            status: legacyProposalFailure || canonicalAllMissingRecovery || parserRecovery || passageBudgetRecovery ? 'succeeded' : 'failed',
            ...(canonicalAllMissingRecovery ? { executionAttempt: 2 }
              : authorizedFailedRetry || parserRecovery || passageBudgetRecovery || legacyFullDocumentLimitRecovery
                ? { executionAttempt: retryAttempt } : {}),
          },
          data: {
            status: 'pending', progress: 0, result: parserCheckpoint ?? Prisma.JsonNull, error: null, dispatchedAt: null,
            retryCount: { increment: 1 },
          },
        });
        if (resetAgent.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction retry is no longer available');
        const claimed = await tx.ingestionTask.updateMany({
          where: { id: task.id, agentTaskId: task.agentTaskId, state: task.state, retryCount: retryAttempt - 1,
            artifactId: task.artifactId, error: task.error },
          data: { state: 'queued', retryCount: { increment: 1 }, error: null },
        });
        if (claimed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction retry is no longer available');
        await recordAudit(deps, tx, {
          actorId: input.userId, action: 'ingestion.task.retry', workspaceId: workspace.id,
          targetType: 'ingestion_task', targetId: task.id,
          metadata: { recovery, agentTaskId: task.agentTaskId, retryAttempt,
            previousState: task.state, previousError: task.error,
            previousAgentStatus: agentTask!.status, previousAgentError: agentTask!.error,
            previousExecutionAttempt: agentTask!.executionAttempt, previousRetryCount: task.retryCount,
            previousAgentRetryCount: agentTask!.retryCount, checkpointReused: parserCheckpoint !== undefined,
            ...(parserRecovery ? { previousParserResult: result } : {}),
            ...(passageBudgetRecovery ? { previousExtractionResult: result } : {}),
            creditPolicy: canonicalAllMissingRecovery ? 'charged-on-remediation'
              : paidFailedRetry ? 'charged-on-retry'
                : compensatedSchemaRetry ? 'reuse-paid-remediation' : 'reuse-original-reservation' },
        }, ctx);
        return tx.ingestionTask.findUnique({ where: { id: task.id }, include: { artifact: true } });
      }, { isolationLevel: 'Serializable' });
      break;
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  if (!queued) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  if (queued.agentTaskId) {
    await dispatchAgentTask(deps, queued.agentTaskId);
  }
  return taskToView(queued);
}

/** Upgrade only an unconfirmed older self-check; confirmed reanalysis retains its existing policy. */
function unconfirmedAnalysisRefreshPolicy(value: unknown, artifact: { id: string; blobSha256: string }): AnalysisRefreshPolicy | undefined {
  const policy = analysisRefreshPolicy(value, artifact);
  if (policy !== 'user_requested_reanalysis') return policy;
  const review = (value as Record<string, unknown>).scientificReview as Record<string, unknown>;
  const composition = review.compositionSkill;
  const needsSemanticComposition = composition === undefined
    || (exactRecordKeys(composition, ['id', 'version'])
      && composition.id === 'scientific-summary' && composition.version === '1');
  return review.kind === 'model_self_check' && review.status === 'review_received'
    && needsSemanticComposition ? 'scientific_review_v4' : policy;
}

function semanticCompositionSourceReference(value: unknown, artifact: { id: string; blobSha256: string }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  if (result.canonicalExtractionContract !== 'grounded-passages-v2'
    || !result.scientificReview || typeof result.scientificReview !== 'object' || Array.isArray(result.scientificReview)) return undefined;
  const review = result.scientificReview as Record<string, unknown>;
  if (!review.semanticStage || typeof review.semanticStage !== 'object' || Array.isArray(review.semanticStage)) return undefined;
  try {
    const reference = parseDocumentSourceMapReference(result.sourceMapRef);
    return reference.parserStatus === 'succeeded' && reference.artifactId === artifact.id
      && reference.contentHash === artifact.blobSha256 ? reference : undefined;
  } catch {
    return undefined;
  }
}

type HermesRefreshSource = Prisma.IngestionTaskGetPayload<{ include: {
  artifact: true; agentTask: true; batch: { include: { researchObject: true } };
} }>;

async function readHermesRefreshRun(tx: Prisma.TransactionClient, source: HermesRefreshSource, actorId: string, runId: string) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: runId }, include: { steps: true } });
  const sourceSteps = run?.steps.filter(step => step.stage === 'source_ingestion') ?? [];
  const sourcePayload = source.agentTask?.payload;
  if (!run || run.actorId !== actorId || source.batch.userId !== actorId || run.researchObjectId !== source.batch.researchObjectId
    || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.versionId !== null
    || !['running', 'awaiting_source_review'].includes(run.status) || source.batch.researchObject.status !== 'draft'
    || source.batch.researchObject.deletedAt || source.artifact.deletedAt || source.artifact.bytesPurgedAt
    || source.artifact.workspaceId !== source.batch.researchObject.workspaceId || !source.agentTask || source.agentTask.deletedAt
    || source.agentTask.kind !== 'sdf.extract' || !exactRecordKeys(sourcePayload, ['artifactId', 'researchObjectId'])
    || sourcePayload.artifactId !== source.artifactId || sourcePayload.researchObjectId !== source.batch.researchObjectId
    || sourceSteps.length !== 1 || sourceSteps[0]!.ingestionTaskId !== source.id
    || sourceSteps[0]!.artifactId !== source.artifactId || sourceSteps[0]!.agentTaskId !== source.agentTaskId) {
    throw new IngestionError('VALIDATION_ERROR', 'Hermes source review authorization or binding changed');
  }
  return run;
}

async function prepareHermesRefresh(tx: Prisma.TransactionClient, source: HermesRefreshSource, input: {
  userId: string; sourceAgentTaskId: string; reviewOnly?: boolean;
}, runId: string, replayId?: string) {
  const run = await readHermesRefreshRun(tx, source, input.userId, runId);
  const stage: HermesIngestionReviewStage = input.reviewOnly ? 'source_review' : 'source_composition';
  const previous = run.steps.find(step => step.stage === stage);
  if (replayId) {
    if (!previous || previous.ordinal !== 0 || previous.ingestionTaskId !== source.id || previous.artifactId !== source.artifactId
      || previous.agentTaskId !== replayId || source.agentTaskId !== replayId || source.agentTask?.status === 'failed')
      throw new IngestionError('VALIDATION_ERROR', 'Hermes source review replay does not match its recorded phase');
    return run;
  }
  if (run.status !== 'awaiting_source_review' || source.state !== 'needs_review' || source.agentTaskId !== input.sourceAgentTaskId
    || previous || automaticIngestionReviewStage(source) !== stage) {
    throw new IngestionError('VALIDATION_ERROR', 'Hermes permits each scientific composition and review upgrade only once');
  }
  // Both this operation and run creation use Serializable transactions. Reading
  // active references before the source CAS prevents a concurrent run from losing
  // the generation it bound; do not silently transfer another run's source.
  const other = await tx.hermesResearchStep.findFirst({ where: {
    stage: 'source_ingestion', ingestionTaskId: source.id, runId: { not: run.id },
    run: { status: { notIn: ['succeeded', 'failed', 'stopped'] } },
  }, select: { id: true } });
  if (other) throw new IngestionError('VALIDATION_ERROR', 'Another active Hermes run uses this source; automatic replacement is unavailable');
  const presentationCount = await tx.agentTask.count({ where: {
    kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id },
  } });
  const sourceCount = run.steps.filter(step => ['source_composition', 'source_review'].includes(step.stage)).length;
  if (presentationCount + sourceCount >= 9) throw new IngestionError('VALIDATION_ERROR', 'Hermes generation grant exhausted');
  return run;
}

async function recordHermesRefresh(tx: Prisma.TransactionClient, run: Awaited<ReturnType<typeof prepareHermesRefresh>>,
  source: HermesRefreshSource, replacementId: string, stage: HermesIngestionReviewStage) {
  const changed = await tx.hermesResearchStep.updateMany({ where: {
    runId: run.id, stage: 'source_ingestion', ingestionTaskId: source.id, artifactId: source.artifactId, agentTaskId: source.agentTaskId,
  }, data: { agentTaskId: replacementId, status: 'waiting', error: null } });
  if (changed.count !== 1) throw new IngestionError('VALIDATION_ERROR', 'Hermes canonical source changed during replacement');
  await tx.hermesResearchStep.create({ data: { runId: run.id, stage, ordinal: 0, status: 'waiting',
    ingestionTaskId: source.id, artifactId: source.artifactId, agentTaskId: replacementId } });
  const moved = await tx.hermesResearchRun.updateMany({ where: {
    id: run.id, version: run.version, status: 'awaiting_source_review', actorId: run.actorId,
    researchObjectId: run.researchObjectId, versionId: null,
  }, data: { status: 'running', version: { increment: 1 }, error: null } });
  if (moved.count !== 1) throw new IngestionError('VALIDATION_ERROR', 'Hermes run changed during source review upgrade');
}

/** Called only inside the existing run recovery transaction, under its version fence. */
export async function recoverHermesSourceReviewInTransaction(deps: AgentDeps, tx: Prisma.TransactionClient, input: {
  actorId: string; researchObjectId: string; runId: string; expectedVersion: number; requestDigest: string; idempotencyKey: string;
}, ctx: AuditContext = {}): Promise<string> {
  const proof = await inspectHermesSourceReviewRecovery(tx, input.runId);
  if (!proof || proof.run.actorId !== input.actorId || proof.run.researchObjectId !== input.researchObjectId
    || proof.run.version !== input.expectedVersion) throw new IngestionError('VALIDATION_ERROR', 'This source review has no safe source recovery');
  const { run, source, failed, composition, sourceStep, originalStep, recoveryKey } = proof;
  const { membership } = await requireActiveMembership(tx, run.researchObject.workspaceId, input.actorId);
  if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
  // The phase row and the new paid task are committed together. Never reset the
  // original reservation or overwrite the task that contains the failure evidence.
  const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
    userId: input.actorId, researchObjectId: run.researchObjectId, kind: 'ingestion',
    title: `Ingestion source review recovery ${source.id}`,
    idempotencyKey: `${recoveryKey}:hermes-recovery:${input.requestDigest}`,
  }, ctx);
  const { task, replayed } = await persistAgentTaskInTransaction(deps, tx, {
    sessionId: session.id, userId: input.actorId, kind: 'sdf.extract',
    payload: { artifactId: source.artifactId, researchObjectId: run.researchObjectId }, idempotencyKey: recoveryKey,
  }, ctx);
  if (replayed) throw new IngestionError('VALIDATION_ERROR', 'Source recovery task exists without its committed run binding');
  const changed = await tx.ingestionTask.updateMany({ where: {
    id: source.id, agentTaskId: failed.id, state: 'needs_review', retryCount: 0,
  }, data: { agentTaskId: task.id, state: 'queued', retryCount: 0, error: null } });
  const canonical = await tx.hermesResearchStep.updateMany({ where: {
    id: sourceStep.id, runId: run.id, stage: 'source_ingestion', agentTaskId: failed.id,
    ingestionTaskId: source.id, artifactId: source.artifactId,
  }, data: { agentTaskId: task.id, status: 'waiting', error: null } });
  const preserved = await tx.hermesResearchStep.updateMany({ where: {
    id: originalStep.id, runId: run.id, stage: 'source_review', ordinal: originalStep.ordinal, agentTaskId: failed.id,
  }, data: { status: 'failed', error: originalStep.error ?? (proof.recoveryClass === 'accepted_review_claim_contract_missing'
    ? 'Accepted source review is missing its required Claims contract; original candidate preserved'
    : proof.recoveryClass === 'schema_contract_retry_after_accepted_anchor'
      ? 'Source review output contract is incomplete; prior accepted draft and failed review preserved'
      : 'Source review service unavailable; original candidate preserved') } });
  await tx.hermesResearchStep.create({ data: { runId: run.id, stage: 'source_review', ordinal: proof.nextOrdinal,
    status: 'waiting', ingestionTaskId: source.id, artifactId: source.artifactId, agentTaskId: task.id } });
  const moved = await tx.hermesResearchRun.updateMany({ where: {
    id: run.id, actorId: input.actorId, researchObjectId: input.researchObjectId,
    status: 'failed', version: input.expectedVersion, versionId: null, profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9,
  }, data: { status: 'running', error: null, lastReconciledAt: null, version: { increment: 1 } } });
  if (changed.count !== 1 || canonical.count !== 1 || preserved.count !== 1 || moved.count !== 1)
    throw new IngestionError('VALIDATION_ERROR', 'Hermes source changed during source recovery');
  await recordAudit(deps, tx, { actorId: input.actorId, workspaceId: run.researchObject.workspaceId,
    action: 'hermes.research_run.source_review_recovery', targetType: 'hermes_research_run', targetId: run.id,
    metadata: { requestDigest: input.requestDigest, clientIdempotencyKey: input.idempotencyKey,
      explicitUserAction: true, possibleDuplicateProviderCharge: true, noProviderSwitch: true,
      previousVersion: input.expectedVersion, previousRunError: run.error, oldAgentTaskId: failed.id,
      compositionSourceAgentTaskId: composition.id, newAgentTaskId: task.id, serviceFailureAuditIds: proof.auditIds,
      serviceFailureClassifications: proof.failureClassifications,
      recoveryClass: proof.recoveryClass, contractRepairAuditIds: proof.contractRepairAuditIds,
      ...(proof.contractEvidence ? { contractEvidence: proof.contractEvidence } : {}),
      ...(proof.schemaContractEvidence ?? {}),
      stage: 'source_review', ordinal: proof.nextOrdinal, chargeableAttempts: 1, creditPolicy: 'new-review-task-charged;original-failure-preserved' } }, ctx);
  return task.id;
}

/** Upgrade to the existing v5 reviewed output under the run's durable grant. */
export async function ensureHermesIngestionReview(deps: IngestionDeps, input: {
  actorId: string; runId: string; taskId: string;
}): Promise<'ready' | 'queued'> {
  let selected: { stage: 'ready' | 'queued' | HermesIngestionReviewStage; sourceAgentTaskId: string } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      selected = await deps.prisma.$transaction(async tx => {
        const source = await tx.ingestionTask.findUnique({ where: { id: input.taskId },
          include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } } });
        if (!source) throw new IngestionError('VALIDATION_ERROR', 'Hermes source is unavailable');
        const { membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.actorId);
        if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
        const run = await readHermesRefreshRun(tx, source, input.actorId, input.runId);
        if (!source.agentTaskId || !source.agentTask) throw new IngestionError('VALIDATION_ERROR', 'Hermes source analysis is unavailable');
        if (['pending', 'running'].includes(source.agentTask.status) && ['queued', 'parsing'].includes(source.state))
          return { stage: 'queued' as const, sourceAgentTaskId: source.agentTaskId };
        if (!['needs_review', 'confirmed'].includes(source.state)) throw new IngestionError('VALIDATION_ERROR', 'Hermes source analysis failed or is incomplete');
        const stage = automaticIngestionReviewStage(source);
        if (stage === 'ready') {
          const phases = run.steps.filter(step => ['source_composition', 'source_review'].includes(step.stage));
          const recovery = phases.filter(step => step.stage === 'source_review' && step.ordinal > 0)
            .sort((a, b) => b.ordinal - a.ordinal)[0];
          const proof = recovery ? await inspectHermesSourceReviewRecovery(tx, run.id, source.agentTaskId) : null;
          if (recovery && (!proof || recovery.agentTaskId !== source.agentTaskId
            || source.agentTask.status !== 'succeeded'))
            throw new IngestionError('VALIDATION_ERROR', 'Recovered scientific review is not the bound final source');
          const completedPhases = proof ? phases.filter(step => !proof.failedSteps.some(failed => failed.id === step.id)) : phases;
          const completed = await tx.hermesResearchStep.updateMany({ where: { runId: run.id,
            id: { in: completedPhases.map(step => step.id) }, agentTask: { status: 'succeeded', deletedAt: null } },
          data: { status: 'succeeded', error: null } });
          if (completed.count !== completedPhases.length) throw new IngestionError('VALIDATION_ERROR', 'A Hermes source review phase failed or disappeared');
        } else {
          await prepareHermesRefresh(tx, source, { userId: input.actorId, sourceAgentTaskId: source.agentTaskId,
            ...(stage === 'source_review' ? { reviewOnly: true } : {}) }, input.runId);
        }
        return { stage, sourceAgentTaskId: source.agentTaskId };
      }, { isolationLevel: 'Serializable' });
      break;
    } catch (error) { if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue; throw error; }
  }
  if (!selected) throw new IngestionError('VALIDATION_ERROR', 'Hermes source review state changed');
  if (selected.stage === 'ready' || selected.stage === 'queued') return selected.stage;
  try {
    await refreshIngestionAnalysis(deps, { userId: input.actorId, taskId: input.taskId,
      sourceAgentTaskId: selected.sourceAgentTaskId, processingConsent: true,
      ...(selected.stage === 'source_review' ? { reviewOnly: true, compositionSourceAgentTaskId: selected.sourceAgentTaskId } : {}),
    }, {}, input.runId);
  } catch (error) {
    if (error instanceof IngestionError && error.code !== 'VALIDATION_ERROR')
      throw new IngestionError('VALIDATION_ERROR', error.message, error);
    throw error;
  }
  return 'queued';
}

async function requirePublicRefreshSource(tx: Prisma.TransactionClient, taskId: string): Promise<void> {
  const bound = await tx.hermesResearchStep.findFirst({ where: {
    stage: 'source_ingestion', ingestionTaskId: taskId,
    run: { profile: VISUAL_NARRATIVE_PROFILE },
  }, select: { id: true } });
  if (bound) throw new IngestionError('INGESTION_NOT_RETRYABLE',
    'This analysis belongs to a Hermes narrative run. Open the existing run to view its progress or failure; public reanalysis cannot replace its source.');
}

/** Explicit paid refresh for a narrowly recognized extraction generation. The fourth argument is server-only, never API input. */
export async function refreshIngestionAnalysis(
  deps: IngestionDeps,
  input: {
    userId: string;
    taskId: string;
    sourceAgentTaskId: string;
    compositionSourceAgentTaskId?: string;
    reviewOnly?: boolean;
    processingConsent: boolean;
  },
  ctx: AuditContext = {},
  internalRunId?: string,
): Promise<IngestionTaskView> {
  if (!input.processingConsent) throw new IngestionError('PROCESSING_CONSENT_REQUIRED', 'Processing consent is required');
  if (internalRunId && Boolean(input.compositionSourceAgentTaskId) !== Boolean(input.reviewOnly))
    throw new IngestionError('VALIDATION_ERROR', 'Hermes source upgrades use general composition or current-source review only');
  const refreshPolicy = (value: unknown, artifact: { id: string; blobSha256: string }) => {
    const policy = unconfirmedAnalysisRefreshPolicy(value, artifact);
    // Reuse the canonical SourceMap through the existing scientific refresh,
    // never the user-requested path that intentionally runs the parser again.
    return internalRunId && !input.reviewOnly ? 'scientific_review_v4' as const : policy;
  };
  const checkRefreshReplay = async (replacementId: string) => {
    await deps.prisma.$transaction(async tx => {
      const source = await tx.ingestionTask.findUnique({ where: { id: input.taskId },
        include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } } });
      if (!source) throw new IngestionError('VALIDATION_ERROR', 'Hermes source replay is unavailable');
      const { membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.userId);
      if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
      if (internalRunId) await prepareHermesRefresh(tx, source, input, internalRunId, replacementId);
      else await requirePublicRefreshSource(tx, source.id);
    }, { isolationLevel: 'Serializable' });
  };
  const initial = await deps.prisma.ingestionTask.findUnique({
    where: { id: input.taskId }, include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } },
  });
  if (!initial || initial.artifact.deletedAt || initial.agentTask?.deletedAt || initial.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  const { workspace, membership } = await requireActiveMembership(deps.prisma, initial.batch.researchObject.workspaceId, input.userId);
  if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
  if (initial.batch.userId !== input.userId || initial.artifact.workspaceId !== workspace.id) {
    throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion analysis source is unavailable');
  }
  if (!internalRunId) await requirePublicRefreshSource(deps.prisma, initial.id);
  if (input.reviewOnly && input.compositionSourceAgentTaskId !== input.sourceAgentTaskId) {
    throw new IngestionError('VALIDATION_ERROR', 'Review-only requires the current extraction as its source');
  }
  if (input.compositionSourceAgentTaskId) {
    const operation = input.reviewOnly ? 'scientific-review-v4' : 'scientific-summary-v3';
    const stableKey = `ingestion-analysis-compose:${input.taskId}:${input.sourceAgentTaskId}:${input.compositionSourceAgentTaskId}:${operation}`;
    const replay = await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
    const currentAgent = await deps.prisma.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
    const compositionSource = await deps.prisma.agentTask.findUnique({
      where: { id: input.compositionSourceAgentTaskId }, include: { session: true },
    });
    const currentPayload = currentAgent?.payload && typeof currentAgent.payload === 'object' && !Array.isArray(currentAgent.payload)
      ? currentAgent.payload as Record<string, unknown> : null;
    const compositionPayload = compositionSource?.payload && typeof compositionSource.payload === 'object' && !Array.isArray(compositionSource.payload)
      ? compositionSource.payload as Record<string, unknown> : null;
    const currentPolicy = currentAgent ? refreshPolicy(currentAgent.result, initial.artifact) : undefined;
    const compositionReference = semanticCompositionSourceReference(compositionSource?.result, initial.artifact);
    if (!currentAgent || currentAgent.kind !== 'sdf.extract' || currentAgent.status !== 'succeeded' || !currentPolicy
      || !validRefreshSourceExecution(currentPolicy, initial.id, currentAgent)
      || currentAgent.session.userId !== input.userId || currentAgent.session.researchObjectId !== initial.batch.researchObjectId
      || currentAgent.session.status !== 'active' || !currentPayload || !exactRecordKeys(currentPayload, ['artifactId', 'researchObjectId'])
      || currentPayload.artifactId !== initial.artifactId || currentPayload.researchObjectId !== initial.batch.researchObjectId
      || !compositionSource || compositionSource.kind !== 'sdf.extract' || compositionSource.status !== 'succeeded'
      || compositionSource.session.userId !== input.userId || compositionSource.session.researchObjectId !== initial.batch.researchObjectId
      || compositionSource.session.status !== 'active' || !compositionPayload
      || !exactRecordKeys(compositionPayload, ['artifactId', 'researchObjectId'])
      || compositionPayload.artifactId !== initial.artifactId || compositionPayload.researchObjectId !== initial.batch.researchObjectId
      || !compositionReference) {
      throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only a scoped successful semantic composition source can be resumed');
    }
    await loadDocumentSourceMapReference(deps.storage, compositionReference);

    if (replay) {
      const payload = replay.payload && typeof replay.payload === 'object' && !Array.isArray(replay.payload)
        ? replay.payload as Record<string, unknown> : null;
      if (initial.agentTaskId !== replay.id || replay.kind !== 'sdf.extract' || replay.session.userId !== input.userId
        || replay.session.researchObjectId !== initial.batch.researchObjectId || replay.session.status !== 'active'
        || !payload || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
        || payload.artifactId !== initial.artifactId || payload.researchObjectId !== initial.batch.researchObjectId) {
        throw new IngestionError('VALIDATION_ERROR', 'Semantic composition replay scope does not match');
      }
      await checkRefreshReplay(replay.id);
      await dispatchAgentTask(deps, replay.id);
      return taskToView(initial);
    }

    const allowedRetries = currentPolicy === 'user_requested_reanalysis' ? initial.retryCount
      : currentPolicy === 'grounded_passages_v1' ? 2 : currentPolicy === 'grounded_passages_v2' ? 1 : 0;
    if (initial.agentTaskId !== input.sourceAgentTaskId || initial.state !== 'needs_review'
      || initial.retryCount < 0 || initial.retryCount > allowedRetries || currentAgent.retryCount !== initial.retryCount
      || await savedConfirmation(deps, initial.id, initial.batch.researchObjectId)) {
      throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only the current scoped unconfirmed extraction can be composed');
    }
    const sourceMapProof = {
      objectKey: compositionReference.objectKey,
      serializedSha256: compositionReference.serializedSha256,
    };
    let queued: Prisma.IngestionTaskGetPayload<{ include: { artifact: true } }> | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        queued = await deps.prisma.$transaction(async (tx) => {
          const source = await tx.ingestionTask.findUnique({
            where: { id: input.taskId },
            include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } },
          });
          if (!source || source.artifact.deletedAt || source.agentTask?.deletedAt || source.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
          const { workspace, membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.userId);
          if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
          if (source.batch.userId !== input.userId || source.artifact.workspaceId !== workspace.id) {
            throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion composition source is unavailable');
          }
          // Keep the binding read and source replacement in the same Serializable
          // transaction as run creation, including failed runs and replay paths.
          if (!internalRunId) await requirePublicRefreshSource(tx, source.id);

          const transactionReplay = await tx.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
          const transactionCurrent = await tx.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
          const transactionComposition = await tx.agentTask.findUnique({
            where: { id: input.compositionSourceAgentTaskId! }, include: { session: true },
          });
          const transactionCurrentPayload = transactionCurrent?.payload && typeof transactionCurrent.payload === 'object'
            && !Array.isArray(transactionCurrent.payload) ? transactionCurrent.payload as Record<string, unknown> : null;
          const transactionCompositionPayload = transactionComposition?.payload && typeof transactionComposition.payload === 'object'
            && !Array.isArray(transactionComposition.payload) ? transactionComposition.payload as Record<string, unknown> : null;
          const transactionPolicy = transactionCurrent ? refreshPolicy(transactionCurrent.result, source.artifact) : undefined;
          const transactionReference = semanticCompositionSourceReference(transactionComposition?.result, source.artifact);
          if (!transactionCurrent || transactionCurrent.kind !== 'sdf.extract' || transactionCurrent.status !== 'succeeded'
            || transactionPolicy !== currentPolicy || !validRefreshSourceExecution(currentPolicy, source.id, transactionCurrent)
            || transactionCurrent.session.userId !== input.userId
            || transactionCurrent.session.researchObjectId !== source.batch.researchObjectId || transactionCurrent.session.status !== 'active'
            || !transactionCurrentPayload || !exactRecordKeys(transactionCurrentPayload, ['artifactId', 'researchObjectId'])
            || transactionCurrentPayload.artifactId !== source.artifactId
            || transactionCurrentPayload.researchObjectId !== source.batch.researchObjectId
            || !transactionComposition || transactionComposition.kind !== 'sdf.extract' || transactionComposition.status !== 'succeeded'
            || transactionComposition.session.userId !== input.userId
            || transactionComposition.session.researchObjectId !== source.batch.researchObjectId
            || transactionComposition.session.status !== 'active' || !transactionCompositionPayload
            || !exactRecordKeys(transactionCompositionPayload, ['artifactId', 'researchObjectId'])
            || transactionCompositionPayload.artifactId !== source.artifactId
            || transactionCompositionPayload.researchObjectId !== source.batch.researchObjectId
            || !transactionReference || transactionReference.objectKey !== sourceMapProof.objectKey
            || transactionReference.serializedSha256 !== sourceMapProof.serializedSha256) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Semantic composition scope changed while refreshing');
          }

          if (transactionReplay) {
            const payload = transactionReplay.payload && typeof transactionReplay.payload === 'object' && !Array.isArray(transactionReplay.payload)
              ? transactionReplay.payload as Record<string, unknown> : null;
            if (source.agentTaskId !== transactionReplay.id || transactionReplay.kind !== 'sdf.extract'
              || transactionReplay.session.userId !== input.userId
              || transactionReplay.session.researchObjectId !== source.batch.researchObjectId
              || transactionReplay.session.status !== 'active' || !payload
              || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
              || payload.artifactId !== source.artifactId || payload.researchObjectId !== source.batch.researchObjectId) {
              throw new IngestionError('VALIDATION_ERROR', 'Semantic composition replay scope does not match');
            }
            if (internalRunId) await prepareHermesRefresh(tx, source, input, internalRunId, transactionReplay.id);
            return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
          }

          if (source.agentTaskId !== input.sourceAgentTaskId || source.state !== 'needs_review'
            || source.retryCount !== initial.retryCount || transactionCurrent.retryCount !== source.retryCount
            || await savedConfirmation({ ...deps, prisma: tx as IngestionDeps['prisma'] }, source.id, source.batch.researchObjectId)) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only the current scoped unconfirmed extraction can be composed');
          }
          const hermesRun = internalRunId ? await prepareHermesRefresh(tx, source, input, internalRunId) : undefined;
          const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
            userId: input.userId,
            researchObjectId: source.batch.researchObjectId,
            kind: 'ingestion',
            title: `Ingestion scientific composition ${source.id}`,
            idempotencyKey: `${stableKey}:session`,
          }, ctx);
          const { task: replacement, replayed } = await persistAgentTaskInTransaction(deps, tx, {
            sessionId: session.id,
            userId: input.userId,
            kind: 'sdf.extract',
            payload: { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId },
            idempotencyKey: stableKey,
          }, ctx);
          if (hermesRun && replayed) throw new IngestionError('VALIDATION_ERROR', 'Hermes phase cannot adopt an unrecorded refresh replay');
          const changed = await tx.ingestionTask.updateMany({
            where: { id: source.id, agentTaskId: input.sourceAgentTaskId, state: 'needs_review', retryCount: initial.retryCount },
            data: { agentTaskId: replacement.id, state: 'queued', retryCount: 0, error: null },
          });
          if (changed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Ingestion composition source changed while refreshing');
          if (hermesRun) await recordHermesRefresh(tx, hermesRun, source, replacement.id, 'source_review');
          await recordAudit(deps, tx, {
            actorId: internalRunId ? null : input.userId,
            action: internalRunId ? 'ingestion.task.system_analysis_refresh' : 'ingestion.task.analysis_refresh',
            workspaceId: workspace.id,
            targetType: 'ingestion_task',
            targetId: source.id,
            metadata: {
              policy: input.reviewOnly ? 'scientific_review_v4_correction' : 'scientific_summary_v3_composition',
              oldAgentTaskId: input.sourceAgentTaskId,
              compositionSourceAgentTaskId: input.compositionSourceAgentTaskId,
              newAgentTaskId: replacement.id,
              artifactId: source.artifactId,
              sourceMapSha256: sourceMapProof.serializedSha256,
              creditPolicy: 'charged_ingestion_analysis_refresh',
              ...(internalRunId ? { executor: 'hermes', authorizedByUserId: input.userId, runId: internalRunId, stage: 'source_review' } : {}),
            },
          }, ctx);
          return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
        }, { isolationLevel: 'Serializable' });
        break;
      } catch (error) {
        if ((error as { code?: unknown }).code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
    if (!queued?.agentTaskId) throw new IngestionError('INGESTION_NOT_FOUND', 'Refreshed ingestion task not found');
    await dispatchAgentTask(deps, queued.agentTaskId);
    return taskToView(queued);
  }
  const keyPrefix = `ingestion-analysis-refresh:${input.taskId}:${input.sourceAgentTaskId}:`;
  const replay = await deps.prisma.agentTask.findFirst({
    where: { idempotencyKey: { in: [`${keyPrefix}legacy-character-evidence-v1`, `${keyPrefix}native-pdf-fragmentation-v1`, `${keyPrefix}canonical-window-contract-v1`, `${keyPrefix}canonical-exact-quote-v1`, `${keyPrefix}grounded-summary-v1`, `${keyPrefix}grounded-passages-v1`, `${keyPrefix}grounded-passages-v2`, `${keyPrefix}scientific-review-v3`, `${keyPrefix}scientific-review-v4`, `${keyPrefix}user-requested-reanalysis`] } },
    include: { session: true },
  });
  if (replay) {
    const payload = replay.payload && typeof replay.payload === 'object' && !Array.isArray(replay.payload) ? replay.payload as Record<string, unknown> : null;
    if (initial.agentTaskId !== replay.id || replay.kind !== 'sdf.extract' || replay.session.userId !== input.userId
      || replay.session.researchObjectId !== initial.batch.researchObjectId || replay.session.status !== 'active'
      || !payload || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
      || payload.artifactId !== initial.artifactId || payload.researchObjectId !== initial.batch.researchObjectId) {
      throw new IngestionError('VALIDATION_ERROR', 'Analysis refresh replay scope does not match');
    }
    await checkRefreshReplay(replay.id);
    await dispatchAgentTask(deps, replay.id);
    return taskToView(initial);
  }
  const oldAgent = await deps.prisma.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
  const oldPayload = oldAgent?.payload && typeof oldAgent.payload === 'object' && !Array.isArray(oldAgent.payload)
    ? oldAgent.payload as Record<string, unknown> : null;
  const policy = oldAgent ? refreshPolicy(oldAgent.result, initial.artifact) : undefined;
  if (!policy) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'This extraction is not eligible for analysis refresh');
  const sourceCompositionRetry = policy === 'scientific_review_v4' && !!internalRunId && !input.reviewOnly
    && automaticIngestionReviewStage(initial) === 'source_composition';
  const allowedRetries = policy === 'user_requested_reanalysis' ? initial.retryCount : policy === 'grounded_passages_v1' ? 2
    : policy === 'grounded_passages_v2' || sourceCompositionRetry ? 1 : 0;
  if (initial.agentTaskId !== input.sourceAgentTaskId || initial.state !== 'needs_review' || initial.retryCount < 0 || initial.retryCount > allowedRetries
    || !oldAgent || oldAgent.kind !== 'sdf.extract' || oldAgent.status !== 'succeeded' || oldAgent.retryCount !== initial.retryCount
    || !validRefreshSourceExecution(policy, initial.id, oldAgent) || oldAgent.session.userId !== input.userId
    || oldAgent.session.researchObjectId !== initial.batch.researchObjectId || oldAgent.session.status !== 'active'
    || !oldPayload || oldPayload.artifactId !== initial.artifactId || oldPayload.researchObjectId !== initial.batch.researchObjectId
    || await savedConfirmation(deps, initial.id, initial.batch.researchObjectId)) {
    throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only the scoped unconfirmed extraction can be refreshed');
  }

  let sourceMapProof: { objectKey: string; serializedSha256: string } | undefined;
  if (policy !== 'legacy_character_evidence_v1') {
    const reference = parseDocumentSourceMapReference((oldAgent!.result as Record<string, unknown>).sourceMapRef);
    const sourceMap = await loadDocumentSourceMapReference(deps.storage, reference);
    const affected = policy === 'scientific_review_v4' || policy === 'user_requested_reanalysis' || policy === 'grounded_summary_v1' || policy === 'grounded_passages_v1' || policy === 'grounded_passages_v2' ? true : policy === 'native_pdf_fragmentation_v1'
      ? isOldFragmentedNativePdfMap(sourceMap)
      : isLineRunNativePdfMap(sourceMap);
    if (!affected) {
      throw new IngestionError('INGESTION_NOT_RETRYABLE', 'This extraction does not use the affected analysis generation');
    }
    sourceMapProof = { objectKey: reference.objectKey, serializedSha256: reference.serializedSha256 };
  }
  const stableKey = `${keyPrefix}${policy.replaceAll('_', '-')}`;
  let queued: Prisma.IngestionTaskGetPayload<{ include: { artifact: true } }> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      queued = await deps.prisma.$transaction(async (tx) => {
        const source = await tx.ingestionTask.findUnique({
          where: { id: input.taskId },
          include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } },
        });
        if (!source || source.artifact.deletedAt || source.agentTask?.deletedAt || source.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { workspace, membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.userId);
        if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
        if (source.batch.userId !== input.userId || source.artifact.workspaceId !== workspace.id) {
          throw new IngestionError('INGESTION_NOT_FOUND', 'Legacy ingestion source is unavailable');
        }
        if (!internalRunId) await requirePublicRefreshSource(tx, source.id);

        const transactionReplay = await tx.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
        if (transactionReplay) {
          const payload = transactionReplay.payload && typeof transactionReplay.payload === 'object' && !Array.isArray(transactionReplay.payload) ? transactionReplay.payload as Record<string, unknown> : null;
          if (source.agentTaskId !== transactionReplay.id || transactionReplay.kind !== 'sdf.extract'
            || transactionReplay.session.userId !== input.userId || transactionReplay.session.researchObjectId !== source.batch.researchObjectId
            || transactionReplay.session.status !== 'active' || !payload || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
            || payload.artifactId !== source.artifactId || payload.researchObjectId !== source.batch.researchObjectId) {
            throw new IngestionError('VALIDATION_ERROR', 'Legacy refresh replay scope does not match');
          }
          if (internalRunId) await prepareHermesRefresh(tx, source, input, internalRunId, transactionReplay.id);
          return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
        }

        const oldAgent = await tx.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
        const sourceCompositionRetry = policy === 'scientific_review_v4' && !!internalRunId && !input.reviewOnly
          && automaticIngestionReviewStage(source) === 'source_composition';
        const allowedRetries = policy === 'user_requested_reanalysis' ? source.retryCount : policy === 'grounded_passages_v1' ? 2
          : policy === 'grounded_passages_v2' || sourceCompositionRetry ? 1 : 0;
        if (source.agentTaskId !== input.sourceAgentTaskId || source.state !== 'needs_review' || source.retryCount !== initial.retryCount
          || source.retryCount < 0 || source.retryCount > allowedRetries
          || !oldAgent || oldAgent.id !== input.sourceAgentTaskId || oldAgent.kind !== 'sdf.extract'
          || oldAgent.status !== 'succeeded' || oldAgent.retryCount !== source.retryCount || !validRefreshSourceExecution(policy, source.id, oldAgent)
          || oldAgent.session.userId !== input.userId || oldAgent.session.researchObjectId !== source.batch.researchObjectId
          || oldAgent.session.status !== 'active' || refreshPolicy(oldAgent.result, source.artifact) !== policy) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only the scoped unconfirmed extraction can be refreshed');
        }
        const oldPayload = oldAgent.payload && typeof oldAgent.payload === 'object' && !Array.isArray(oldAgent.payload) ? oldAgent.payload as Record<string, unknown> : null;
        if (!oldPayload || oldPayload.artifactId !== source.artifactId || oldPayload.researchObjectId !== source.batch.researchObjectId) {
          throw new IngestionError('VALIDATION_ERROR', 'Legacy extraction source does not match its artifact');
        }
        if (policy !== 'legacy_character_evidence_v1') {
          const reference = parseDocumentSourceMapReference((oldAgent.result as Record<string, unknown>).sourceMapRef);
          if (!sourceMapProof || reference.objectKey !== sourceMapProof.objectKey
            || reference.serializedSha256 !== sourceMapProof.serializedSha256) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction source map changed while refreshing');
          }
        }
        if (await savedConfirmation({ ...deps, prisma: tx as IngestionDeps['prisma'] }, source.id, source.batch.researchObjectId)) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Confirmed ingestion cannot be refreshed');
        }
        const hermesRun = internalRunId ? await prepareHermesRefresh(tx, source, input, internalRunId) : undefined;
        const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
          userId: input.userId,
          researchObjectId: source.batch.researchObjectId,
          kind: 'ingestion',
          title: `Ingestion analysis refresh ${source.id}`,
          idempotencyKey: `${stableKey}:session`,
        }, ctx);
        const { task: replacement, replayed } = await persistAgentTaskInTransaction(deps, tx, {
          sessionId: session.id,
          userId: input.userId,
          kind: 'sdf.extract',
          payload: { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId },
          idempotencyKey: stableKey,
        }, ctx);
        if (hermesRun && replayed) throw new IngestionError('VALIDATION_ERROR', 'Hermes phase cannot adopt an unrecorded refresh replay');
        const changed = await tx.ingestionTask.updateMany({
          where: { id: source.id, agentTaskId: input.sourceAgentTaskId, state: 'needs_review', retryCount: initial.retryCount },
          data: { agentTaskId: replacement.id, state: 'queued', retryCount: 0, error: null },
        });
        if (changed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Legacy extraction changed while refreshing');
        if (hermesRun) await recordHermesRefresh(tx, hermesRun, source, replacement.id, 'source_composition');
        await recordAudit(deps, tx, {
          actorId: internalRunId ? null : input.userId,
          action: internalRunId ? 'ingestion.task.system_analysis_refresh' : 'ingestion.task.analysis_refresh',
          workspaceId: workspace.id,
          targetType: 'ingestion_task',
          targetId: source.id,
          metadata: { policy, oldAgentTaskId: input.sourceAgentTaskId, newAgentTaskId: replacement.id, artifactId: source.artifactId,
            ...(internalRunId ? { executor: 'hermes', authorizedByUserId: input.userId, runId: internalRunId, stage: 'source_composition' } : {}),
            sourceMapSha256: sourceMapProof?.serializedSha256 ?? null, creditPolicy: 'charged_ingestion_analysis_refresh' },
        }, ctx);
        return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
      }, { isolationLevel: 'Serializable' });
      break;
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  if (!queued?.agentTaskId) throw new IngestionError('INGESTION_NOT_FOUND', 'Refreshed ingestion task not found');
  await dispatchAgentTask(deps, queued.agentTaskId);
  return taskToView(queued);
}

/** Starts a separately confirmable analysis generation without changing confirmed history. */
export async function reanalyzeConfirmedIngestion(
  deps: IngestionDeps,
  input: { userId: string; taskId: string; sourceAgentTaskId: string; processingConsent: boolean; idempotencyKey: string },
  ctx: AuditContext = {},
): Promise<IngestionTaskView> {
  if (!input.processingConsent) throw new IngestionError('PROCESSING_CONSENT_REQUIRED', 'Processing consent is required');
  if (!input.idempotencyKey || input.idempotencyKey.length > 64) throw new IngestionError('VALIDATION_ERROR', 'A bounded idempotency key is required');
  const initial = await deps.prisma.ingestionTask.findUnique({
    where: { id: input.taskId },
    include: { artifact: true, agentTask: { include: { session: true } }, batch: { include: { researchObject: true } } },
  });
  if (!initial || initial.artifact.deletedAt || initial.agentTask?.deletedAt || initial.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  const { workspace, membership } = await requireActiveMembership(deps.prisma, initial.batch.researchObject.workspaceId, input.userId);
  if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
  const sourceAgent = initial.agentTask;
  const sourcePayload = sourceAgent?.payload;
  if (initial.state !== 'confirmed' || initial.agentTaskId !== input.sourceAgentTaskId
    || initial.batch.userId !== input.userId || initial.artifact.workspaceId !== workspace.id
    || !sourceAgent || sourceAgent.kind !== 'sdf.extract' || sourceAgent.status !== 'succeeded'
    || sourceAgent.session.userId !== input.userId || sourceAgent.session.researchObjectId !== initial.batch.researchObjectId
    || !exactRecordKeys(sourcePayload, ['artifactId', 'researchObjectId'])
    || sourcePayload.artifactId !== initial.artifactId || sourcePayload.researchObjectId !== initial.batch.researchObjectId
    || analysisRefreshPolicy(sourceAgent.result, initial.artifact) !== 'user_requested_reanalysis'
    || !await savedConfirmation(deps, initial.id, initial.batch.researchObjectId)) {
    throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only a scoped confirmed extraction can create a new analysis draft');
  }
  const reference = parseDocumentSourceMapReference((sourceAgent.result as Record<string, unknown>).sourceMapRef);
  await loadDocumentSourceMapReference(deps.storage, reference);
  const sourceMapProof = { objectKey: reference.objectKey, serializedSha256: reference.serializedSha256 };
  const batchKey = `ingestion-reanalysis:${initial.id}:${input.idempotencyKey}`;
  const requestDigest = createHash('sha256').update(JSON.stringify({
    taskId: initial.id, sourceAgentTaskId: sourceAgent.id, artifactId: initial.artifactId,
    sourceMapSha256: sourceMapProof.serializedSha256,
  })).digest('hex');
  let queued: Prisma.IngestionTaskGetPayload<{ include: { artifact: true } }> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      queued = await deps.prisma.$transaction(async (tx) => {
        const source = await tx.ingestionTask.findUnique({
          where: { id: initial.id },
          include: { artifact: true, agentTask: { include: { session: true } }, batch: { include: { researchObject: true } } },
        });
        if (!source || source.artifact.deletedAt || source.agentTask?.deletedAt || source.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { workspace: transactionWorkspace, membership: transactionMembership } = await requireActiveMembership(
          tx, source.batch.researchObject.workspaceId, input.userId,
        );
        if (!INGESTION_WRITE_ROLES.has(transactionMembership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
        const scoped = { ...deps, prisma: tx as IngestionDeps['prisma'] };
        const transactionPayload = source.agentTask?.payload;
        if (source.state !== 'confirmed' || source.agentTaskId !== sourceAgent.id
          || source.batch.userId !== input.userId || source.batch.researchObjectId !== initial.batch.researchObjectId
          || source.artifactId !== initial.artifactId || source.artifact.workspaceId !== transactionWorkspace.id
          || !source.agentTask || source.agentTask.kind !== 'sdf.extract' || source.agentTask.status !== 'succeeded'
          || source.agentTask.session.userId !== input.userId || source.agentTask.session.researchObjectId !== initial.batch.researchObjectId
          || !exactRecordKeys(transactionPayload, ['artifactId', 'researchObjectId'])
          || transactionPayload.artifactId !== source.artifactId || transactionPayload.researchObjectId !== source.batch.researchObjectId
          || analysisRefreshPolicy(source.agentTask.result, source.artifact) !== 'user_requested_reanalysis'
          || !await savedConfirmation(scoped, source.id, source.batch.researchObjectId)) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Confirmed extraction changed while creating a new draft');
        }
        const replay = await tx.ingestionBatch.findUnique({
          where: { idempotencyKey: batchKey },
          include: { tasks: { include: { artifact: true, agentTask: { include: { session: true } } } } },
        });
        if (replay) {
          const candidate = replay.tasks[0];
          const payload = candidate?.agentTask?.payload;
          if (replay.userId !== input.userId || replay.researchObjectId !== initial.batch.researchObjectId
            || replay.requestDigest !== requestDigest || replay.tasks.length !== 1 || !candidate?.agentTask
            || candidate.artifactId !== initial.artifactId || candidate.agentTask.kind !== 'sdf.extract'
            || candidate.agentTask.session.userId !== input.userId
            || candidate.agentTask.session.researchObjectId !== initial.batch.researchObjectId
            || candidate.agentTask.idempotencyKey !== `ingestion-analysis-reanalysis:${candidate.id}:${sourceAgent.id}`
            || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
            || payload.artifactId !== initial.artifactId || payload.researchObjectId !== initial.batch.researchObjectId) {
            throw new IngestionError('VALIDATION_ERROR', 'Confirmed analysis replay scope does not match');
          }
          return tx.ingestionTask.findUniqueOrThrow({ where: { id: candidate.id }, include: { artifact: true } });
        }
        const transactionReference = parseDocumentSourceMapReference((source.agentTask.result as Record<string, unknown>).sourceMapRef);
        if (transactionReference.objectKey !== sourceMapProof.objectKey
          || transactionReference.serializedSha256 !== sourceMapProof.serializedSha256) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction source map changed while creating a new draft');
        }
        const batch = await tx.ingestionBatch.create({ data: {
          researchObjectId: source.batch.researchObjectId, userId: input.userId,
          idempotencyKey: batchKey, requestDigest,
        } });
        const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
          userId: input.userId, researchObjectId: source.batch.researchObjectId, kind: 'ingestion',
          title: `Ingestion reanalysis ${source.id}`, idempotencyKey: `${batchKey}:session`,
        }, ctx);
        await tx.ingestionBatch.update({ where: { id: batch.id }, data: { agentSessionId: session.id } });
        const newIngestion = await tx.ingestionTask.create({ data: {
          batchId: batch.id, artifactId: source.artifactId, state: 'queued',
        } });
        const { task: analysis } = await persistAgentTaskInTransaction(deps, tx, {
          sessionId: session.id, userId: input.userId, kind: 'sdf.extract',
          payload: { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId },
          idempotencyKey: `ingestion-analysis-reanalysis:${newIngestion.id}:${sourceAgent.id}`,
        }, ctx);
        const attached = await tx.ingestionTask.updateMany({
          where: { id: newIngestion.id, agentTaskId: null, state: 'queued' }, data: { agentTaskId: analysis.id },
        });
        if (attached.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'New analysis draft changed while attaching its task');
        await recordAudit(deps, tx, {
          actorId: input.userId, action: 'ingestion.task.reanalyze', workspaceId: transactionWorkspace.id,
          targetType: 'ingestion_task', targetId: newIngestion.id,
          metadata: { sourceIngestionTaskId: source.id, sourceAgentTaskId: sourceAgent.id, newAgentTaskId: analysis.id,
            artifactId: source.artifactId, sourceMapSha256: sourceMapProof.serializedSha256, confirmationPolicy: 'new_draft' },
        }, ctx);
        return tx.ingestionTask.findUniqueOrThrow({ where: { id: newIngestion.id }, include: { artifact: true } });
      }, { isolationLevel: 'Serializable' });
      break;
    } catch (error) {
      if (attempt < 2 && ['P2002', 'P2034'].includes(String((error as { code?: unknown }).code))) continue;
      throw error;
    }
  }
  if (!queued?.agentTaskId) throw new IngestionError('INGESTION_NOT_FOUND', 'New analysis draft was not created');
  await dispatchAgentTask(deps, queued.agentTaskId);
  return taskToView(queued);
}

export interface IngestionConfirmation {
  commitId: string;
  versionId: string;
  versionNo: number;
  /** RO optimistic lock immediately after this confirmation, not its current value. */
  version: number;
  evidenceStatus: 'needs_review';
  missingFields: string[];
  /** Present for system materialization; absence preserves the legacy manual response. */
  origin?: Extract<SavedIngestionOrigin, { executor: 'hermes' }>;
}

function confirmationView(commit: CreateCommitResult & { origin?: SavedIngestionOrigin }, origin = commit.origin): IngestionConfirmation {
  return {
    commitId: commit.commitId, versionId: commit.versionId, versionNo: commit.versionNo,
    version: commit.versionNo + 1, evidenceStatus: 'needs_review',
    missingFields: SDF_NODE_TYPES.filter(field => !String(commit.snapshot.core[field] ?? '').trim()),
    ...(origin?.executor === 'hermes' ? { origin } : {}),
  };
}

function assertReviewableIngestionProposal(task: { artifactId: string; artifact: { blobSha256: string }; agentTask: { result: unknown } | null }, core: Record<string, string>): void {
  const result = task.agentTask?.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new IngestionError('VALIDATION_ERROR', 'No reviewable SDF proposal is available');
  }
  const proposed = (result as Record<string, unknown>).core;
  if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)
    || !validateSdfDraftCore(proposed).ok
    || SDF_NODE_TYPES.some(field => typeof (proposed as Record<string, unknown>)[field] !== 'string')
    || !SDF_NODE_TYPES.some(field => String((proposed as Record<string, unknown>)[field]).trim())) {
    throw new IngestionError('VALIDATION_ERROR', 'No reviewable SDF proposal is available');
  }
  if (!SDF_NODE_TYPES.some(field => String(core[field] ?? '').trim())) {
    throw new IngestionError('VALIDATION_ERROR', 'An entirely empty SDF proposal cannot be confirmed');
  }
  const sourceMapRef = (result as Record<string, unknown>).sourceMapRef;
  if (sourceMapRef !== undefined) {
    try {
      const reference = parseDocumentSourceMapReference(sourceMapRef);
      if (reference.parserStatus !== 'succeeded' || reference.artifactId !== task.artifactId
        || reference.contentHash !== task.artifact.blobSha256) throw new Error('source fidelity incomplete');
    } catch (error) {
      throw new IngestionError('VALIDATION_ERROR', 'The extraction source still requires review', error);
    }
  }
}

async function savedConfirmation(deps: IngestionDeps, taskId: string, researchObjectId: string, key?: string): Promise<(CreateCommitResult & { origin?: SavedIngestionOrigin }) | null> {
  const saved = await findSavedIngestionCommit(deps.prisma, { taskId, researchObjectId, ...(key !== undefined ? { idempotencyKey: key } : {}) });
  if (!saved) return null;
  const { commit, version, manifest, origin } = saved;
  return { commitId: commit.id, versionId: version.id, versionNo: version.versionNo,
    snapshot: { core: manifest.coreJson as Record<string, unknown>, artifacts: manifest.entries }, origin };
}

/** Durable RO-scoped material history, including completed imports and their fixed versions. */
export async function getResearchObjectIngestion(deps: IngestionDeps, input: { userId: string; researchObjectId: string }) {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro || ro.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
  await requireMembership(deps, ro.workspaceId, input.userId);
  const rows = await deps.prisma.ingestionTask.findMany({
    where: { batch: { researchObjectId: ro.id }, artifact: { deletedAt: null }, OR: [{ agentTaskId: null }, { agentTask: { deletedAt: null } }] }, include: { artifact: true }, orderBy: { updatedAt: 'desc' },
  });
  const tasks = await Promise.all(rows.map(async task => {
    const saved = await savedConfirmation(deps, task.id, ro.id);
    return { ...taskToView(task), confirmation: saved ? confirmationView(saved) : null };
  }));
  return { researchObjectId: ro.id, version: ro.version, tasks,
    latestConfirmation: tasks.filter(task => task.confirmation).sort((a, b) => b.confirmation!.versionNo - a.confirmation!.versionNo)[0]?.confirmation ?? null };
}

/** A human confirmation creates one version, working SDF and source records atomically. */
export async function confirmIngestionTask(
  deps: IngestionDeps,
  input: { userId: string; taskId: string; version: number; sourceAgentTaskId: string; core: Record<string, string> },
  ctx: AuditContext = {},
): Promise<{ task: IngestionTaskView; sdf: SdfDocumentView; confirmation: IngestionConfirmation }> {
  return saveIngestionTask(deps, input, ctx);
}

/** Internal execution under a durable user grant; never records a human confirmation. */
export async function materializeHermesIngestion(deps: IngestionDeps, input: { actorId: string; runId: string; taskId: string }) {
  const task = await deps.prisma.ingestionTask.findUnique({ where: { id: input.taskId },
    include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } } });
  if (!task) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  const review = automaticIngestionReview(task);
  return saveIngestionTask(deps, { userId: input.actorId, taskId: input.taskId,
    version: task.batch.researchObject.version, sourceAgentTaskId: review.agentTaskId, core: review.core }, {}, input.runId);
}

async function saveIngestionTask(
  deps: IngestionDeps,
  input: { userId: string; taskId: string; version: number; sourceAgentTaskId: string; core: Record<string, string> },
  ctx: AuditContext,
  internalRunId?: string,
): Promise<{ task: IngestionTaskView; sdf: SdfDocumentView; confirmation: IngestionConfirmation }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const saved = await deps.prisma.$transaction(async tx => {
        const scoped = { ...deps, prisma: tx as IngestionDeps['prisma'] };
        const task = await tx.ingestionTask.findUnique({ where: { id: input.taskId },
          include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } } });
        if (!task || task.artifact.deletedAt || task.agentTask?.deletedAt || task.batch.researchObject.deletedAt) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { researchObject: ro } = await authorizeIngestionWrite(scoped, { userId: input.userId, researchObjectId: task.batch.researchObjectId });
        const internalReview = internalRunId ? automaticIngestionReview(task) : undefined;
        if (internalRunId) {
          const run = await tx.hermesResearchRun.findUnique({ where: { id: internalRunId }, include: { steps: true } });
          if (!run || run.actorId !== input.userId || run.researchObjectId !== ro.id || ro.status !== 'draft'
            || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.status !== 'awaiting_source_review'
            || run.steps.filter(step => step.stage === 'source_ingestion').length !== 1
            || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === task.id
              && step.agentTaskId === input.sourceAgentTaskId && step.artifactId === task.artifactId)) {
            throw new IngestionError('VALIDATION_ERROR', 'Hermes source authorization changed');
          }
          requireUnchangedAutomaticCore(internalReview!, input.core);
        }
        const commitKey = internalRunId ? `hermes-ingestion:${internalRunId}:${task.id}` : `ingestion-confirm:${task.id}`;
        let commit = await savedConfirmation(scoped, task.id, ro.id, commitKey);
        let indexTaskId: string | null = null;
        if (!commit) {
          if (!input.sourceAgentTaskId || task.agentTaskId !== input.sourceAgentTaskId) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Analysis changed; review the current proposal before confirming');
          }
          if (task.state !== 'needs_review' && !(internalRunId && task.state === 'confirmed')) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only reviewed extraction results can be saved');
          const check = ro.status === 'draft' ? validateSdfDraftCore(input.core) : validateSdfCore(input.core);
          if (!check.ok) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不符合 core Schema');
          assertReviewableIngestionProposal(task, input.core);
          const document = await tx.sdfDocument.findUnique({ where: { researchObjectId: ro.id } });
          if (!document) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不存在');
          const latest = await tx.version.findFirst({ where: { researchObjectId: ro.id }, orderBy: { versionNo: 'desc' } });
          const previous = latest ? await tx.versionManifest.findUnique({ where: { versionId: latest.id }, include: { entries: true } }) : null;
          const artifacts = (previous?.entries ?? []).map(entry => ({ logicalPath: entry.logicalPath, artifactId: entry.artifactId }));
          if (!artifacts.some(entry => entry.artifactId === task.artifactId)) {
            let logicalPath = task.artifact.logicalPath;
            if (artifacts.some(entry => entry.logicalPath === logicalPath)) logicalPath = `imports/${task.id}/${logicalPath}`;
            artifacts.push({ logicalPath, artifactId: task.artifactId });
          }
          commit = await createCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: input.version,
            sdfCore: input.core, artifacts, message: `${internalRunId ? 'Hermes reviewed import' : 'Confirm import'}: ${task.artifact.logicalPath}`, idempotencyKey: commitKey }, ctx, tx,
            internalRunId ? { executor: 'hermes', runId: internalRunId } : undefined);
          await tx.sdfDocument.update({ where: { researchObjectId: ro.id }, data: { coreJson: input.core } });
          for (const nodeType of SDF_NODE_TYPES) await tx.sdfNode.update({
            where: { sdfDocumentId_nodeType: { sdfDocumentId: document.id, nodeType } }, data: { content: input.core[nodeType] ?? '' },
          });
          // Automatic runs materialize the existing review's atomic Claims through
          // the Claim/Evidence bridge. Do not also create duplicate field Claims.
          if (!internalRunId) {
            const replacementClaimIds = await writeIngestionEvidence(scoped, { task, versionId: commit.versionId, core: input.core });
            if (latest) await carryVersionEvidence(tx, {
              researchObjectId: ro.id, previousVersionId: latest.id, versionId: commit.versionId, replacementClaimIds,
            });
          }
          await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: commit.versionId });
          const updated = await tx.ingestionTask.updateMany({ where: { id: task.id, agentTaskId: input.sourceAgentTaskId, state: task.state }, data: { state: 'confirmed', error: null } });
          if (updated.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Task changed while confirming');
          await recordAudit(deps, tx, { actorId: internalRunId ? null : input.userId, action: internalRunId ? 'ingestion.system_materialize' : 'ingestion.confirm', workspaceId: ro.workspaceId,
            targetType: 'ingestion_task', targetId: task.id, metadata: { versionId: commit.versionId, sourceAgentTaskId: input.sourceAgentTaskId, evidenceStatus: 'needs_review',
              ...(internalReview ? { executor: 'hermes', authorizedByUserId: input.userId, runId: internalRunId, reviewResponseHash: internalReview.responseHash } : {}) } }, ctx);
          let sourceReference;
          try { sourceReference = parseDocumentSourceMapReference((task.agentTask?.result as Record<string, unknown> | null)?.sourceMapRef); }
          catch { /* Legacy confirmations without a durable parser map remain valid. */ }
          if (sourceReference?.parserStatus === 'succeeded') {
            const indexTask = await persistSourceMapSearchIndexInTransaction(deps, tx, {
              sourceTaskId: input.sourceAgentTaskId, versionId: commit.versionId, userId: input.userId,
            }, ctx);
            if (indexTask.status === 'pending' && !indexTask.deletedAt) indexTaskId = indexTask.id;
          }
        }
        const core = commit.snapshot.core as Record<string, string>;
        return { task: { ...taskToView(task), state: 'confirmed' as const, error: null },
          sdf: { core, nodes: SDF_NODE_TYPES.map(nodeType => ({ nodeType, content: core[nodeType] ?? '' })) },
          confirmation: confirmationView(commit, internalRunId ? { executor: 'hermes', runId: internalRunId } : undefined),
          indexTaskId };
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
      const { indexTaskId, ...response } = saved;
      if (indexTaskId) {
        try { await dispatchAgentTask(deps, indexTaskId); } catch { /* Durable pending index dispatch is recovered by the existing worker loop. */ }
      }
      return response;
    } catch (error) {
      if (((error as { code?: string }).code === 'P2034' || isOwnedPrismaIdempotencyConflict(error)) && attempt < 2) continue;
      throw error;
    }
  }
}

function taskToView(task: {
  id: string; artifactId: string; agentTaskId: string | null; state: string; retryCount: number; error: string | null;
  artifact: { logicalPath: string };
}): IngestionTaskView {
  return {
    id: task.id, artifactId: task.artifactId, logicalPath: task.artifact.logicalPath,
    state: task.state as IngestionTaskView['state'], retryCount: task.retryCount,
    error: task.error, agentTaskId: task.agentTaskId,
  };
}
