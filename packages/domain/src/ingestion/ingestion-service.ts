import { freezeResearchRecord } from '../commit/research-record-snapshot';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { createArtifact } from '../artifact/artifacts';
import { AI_CREDIT_RESOURCE, createAgentSession, dispatchAgentTask, findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction, projectAgentTaskResult, submitAgentTask, type AgentDeps } from '../agent/agent';
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
import type { ActionableIngestionTaskView, IngestionBatchView, IngestionFileInput, IngestionTaskView } from './ingestion-types';

export type IngestionDeps = AgentDeps & { storage: StorageAdapter };

const INGESTION_WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);

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
  if (!ro) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
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
    where: { id: input.batchId }, include: { researchObject: true, tasks: { include: { artifact: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!batch) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion batch not found');
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
  if (!task) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
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
    if (!ro) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
    await requireMembership(deps, ro.workspaceId, input.userId);
  }
  const tasks = await deps.prisma.ingestionTask.findMany({
    where: {
      batch: input.researchObjectId === undefined
        ? { userId: input.userId, researchObject: { status: { not: 'archived' } } }
        : { researchObjectId: input.researchObjectId },
      state: { in: [...ACTIONABLE_INGESTION_STATES] },
    },
    include: { artifact: true, batch: { include: { researchObject: true } } },
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
        if (!task) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
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
        if (!authorizedFailedRetry && !legacyProposalFailure && !canonicalAllMissingRecovery && !parserRecovery && !passageBudgetRecovery) {
          throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only retryable extraction failures can be retried');
        }
        const recovery = passageBudgetRecovery ? 'canonical_passage_budget' : parserRecovery ? 'unresolved_parser_pages'
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
            status: legacyProposalFailure || canonicalAllMissingRecovery || parserRecovery || passageBudgetRecovery ? 'succeeded' : 'failed',
            ...(canonicalAllMissingRecovery ? { executionAttempt: 2 }
              : authorizedFailedRetry || parserRecovery || passageBudgetRecovery ? { executionAttempt: retryAttempt } : {}),
          },
          data: {
            status: 'pending', progress: 0, result: Prisma.JsonNull, error: null, dispatchedAt: null,
            retryCount: { increment: 1 },
          },
        });
        if (resetAgent.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction retry is no longer available');
        const claimed = await tx.ingestionTask.updateMany({
          where: { id: task.id, agentTaskId: task.agentTaskId, state: task.state, retryCount: retryAttempt - 1 },
          data: { state: 'queued', retryCount: { increment: 1 }, error: null },
        });
        if (claimed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Extraction retry is no longer available');
        await recordAudit(deps, tx, {
          actorId: input.userId, action: 'ingestion.task.retry', workspaceId: workspace.id,
          targetType: 'ingestion_task', targetId: task.id,
          metadata: { recovery, agentTaskId: task.agentTaskId, retryAttempt,
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

/** Explicit paid refresh for a narrowly recognized extraction generation. */
export async function refreshIngestionAnalysis(
  deps: IngestionDeps,
  input: {
    userId: string;
    taskId: string;
    sourceAgentTaskId: string;
    compositionSourceAgentTaskId?: string;
    processingConsent: boolean;
  },
  ctx: AuditContext = {},
): Promise<IngestionTaskView> {
  if (!input.processingConsent) throw new IngestionError('PROCESSING_CONSENT_REQUIRED', 'Processing consent is required');
  const initial = await deps.prisma.ingestionTask.findUnique({
    where: { id: input.taskId }, include: { artifact: true, batch: { include: { researchObject: true } } },
  });
  if (!initial) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  const { workspace, membership } = await requireActiveMembership(deps.prisma, initial.batch.researchObject.workspaceId, input.userId);
  if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
  if (initial.batch.userId !== input.userId || initial.artifact.workspaceId !== workspace.id) {
    throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion analysis source is unavailable');
  }
  if (input.compositionSourceAgentTaskId) {
    const stableKey = `ingestion-analysis-compose:${input.taskId}:${input.sourceAgentTaskId}:${input.compositionSourceAgentTaskId}:scientific-summary-v3`;
    const replay = await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
    const currentAgent = await deps.prisma.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
    const compositionSource = await deps.prisma.agentTask.findUnique({
      where: { id: input.compositionSourceAgentTaskId }, include: { session: true },
    });
    const currentPayload = currentAgent?.payload && typeof currentAgent.payload === 'object' && !Array.isArray(currentAgent.payload)
      ? currentAgent.payload as Record<string, unknown> : null;
    const compositionPayload = compositionSource?.payload && typeof compositionSource.payload === 'object' && !Array.isArray(compositionSource.payload)
      ? compositionSource.payload as Record<string, unknown> : null;
    const currentPolicy = currentAgent ? unconfirmedAnalysisRefreshPolicy(currentAgent.result, initial.artifact) : undefined;
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
            include: { artifact: true, batch: { include: { researchObject: true } } },
          });
          if (!source) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
          const { workspace, membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.userId);
          if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
          if (source.batch.userId !== input.userId || source.artifact.workspaceId !== workspace.id) {
            throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion composition source is unavailable');
          }

          const transactionReplay = await tx.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
          const transactionCurrent = await tx.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
          const transactionComposition = await tx.agentTask.findUnique({
            where: { id: input.compositionSourceAgentTaskId! }, include: { session: true },
          });
          const transactionCurrentPayload = transactionCurrent?.payload && typeof transactionCurrent.payload === 'object'
            && !Array.isArray(transactionCurrent.payload) ? transactionCurrent.payload as Record<string, unknown> : null;
          const transactionCompositionPayload = transactionComposition?.payload && typeof transactionComposition.payload === 'object'
            && !Array.isArray(transactionComposition.payload) ? transactionComposition.payload as Record<string, unknown> : null;
          const transactionPolicy = transactionCurrent ? unconfirmedAnalysisRefreshPolicy(transactionCurrent.result, source.artifact) : undefined;
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
            return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
          }

          if (source.agentTaskId !== input.sourceAgentTaskId || source.state !== 'needs_review'
            || source.retryCount !== initial.retryCount || transactionCurrent.retryCount !== source.retryCount
            || await savedConfirmation({ ...deps, prisma: tx as IngestionDeps['prisma'] }, source.id, source.batch.researchObjectId)) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only the current scoped unconfirmed extraction can be composed');
          }
          const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
            userId: input.userId,
            researchObjectId: source.batch.researchObjectId,
            kind: 'ingestion',
            title: `Ingestion scientific composition ${source.id}`,
            idempotencyKey: `${stableKey}:session`,
          }, ctx);
          const { task: replacement } = await persistAgentTaskInTransaction(deps, tx, {
            sessionId: session.id,
            userId: input.userId,
            kind: 'sdf.extract',
            payload: { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId },
            idempotencyKey: stableKey,
          }, ctx);
          const changed = await tx.ingestionTask.updateMany({
            where: { id: source.id, agentTaskId: input.sourceAgentTaskId, state: 'needs_review', retryCount: initial.retryCount },
            data: { agentTaskId: replacement.id, state: 'queued', retryCount: 0, error: null },
          });
          if (changed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Ingestion composition source changed while refreshing');
          await recordAudit(deps, tx, {
            actorId: input.userId,
            action: 'ingestion.task.analysis_refresh',
            workspaceId: workspace.id,
            targetType: 'ingestion_task',
            targetId: source.id,
            metadata: {
              policy: 'scientific_summary_v3_composition',
              oldAgentTaskId: input.sourceAgentTaskId,
              compositionSourceAgentTaskId: input.compositionSourceAgentTaskId,
              newAgentTaskId: replacement.id,
              artifactId: source.artifactId,
              sourceMapSha256: sourceMapProof.serializedSha256,
              creditPolicy: 'charged_ingestion_analysis_refresh',
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
    await dispatchAgentTask(deps, replay.id);
    return taskToView(initial);
  }
  const oldAgent = await deps.prisma.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
  const oldPayload = oldAgent?.payload && typeof oldAgent.payload === 'object' && !Array.isArray(oldAgent.payload)
    ? oldAgent.payload as Record<string, unknown> : null;
  const policy = oldAgent ? unconfirmedAnalysisRefreshPolicy(oldAgent.result, initial.artifact) : undefined;
  if (!policy) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'This extraction is not eligible for analysis refresh');
  const allowedRetries = policy === 'user_requested_reanalysis' ? initial.retryCount : policy === 'grounded_passages_v1' ? 2 : policy === 'grounded_passages_v2' ? 1 : 0;
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
          include: { artifact: true, batch: { include: { researchObject: true } } },
        });
        if (!source) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { workspace, membership } = await requireActiveMembership(tx, source.batch.researchObject.workspaceId, input.userId);
        if (!INGESTION_WRITE_ROLES.has(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
        if (source.batch.userId !== input.userId || source.artifact.workspaceId !== workspace.id) {
          throw new IngestionError('INGESTION_NOT_FOUND', 'Legacy ingestion source is unavailable');
        }

        const transactionReplay = await tx.agentTask.findUnique({ where: { idempotencyKey: stableKey }, include: { session: true } });
        if (transactionReplay) {
          const payload = transactionReplay.payload && typeof transactionReplay.payload === 'object' && !Array.isArray(transactionReplay.payload) ? transactionReplay.payload as Record<string, unknown> : null;
          if (source.agentTaskId !== transactionReplay.id || transactionReplay.kind !== 'sdf.extract'
            || transactionReplay.session.userId !== input.userId || transactionReplay.session.researchObjectId !== source.batch.researchObjectId
            || transactionReplay.session.status !== 'active' || !payload || !exactRecordKeys(payload, ['artifactId', 'researchObjectId'])
            || payload.artifactId !== source.artifactId || payload.researchObjectId !== source.batch.researchObjectId) {
            throw new IngestionError('VALIDATION_ERROR', 'Legacy refresh replay scope does not match');
          }
          return tx.ingestionTask.findUniqueOrThrow({ where: { id: source.id }, include: { artifact: true } });
        }

        const oldAgent = await tx.agentTask.findUnique({ where: { id: input.sourceAgentTaskId }, include: { session: true } });
        if (source.agentTaskId !== input.sourceAgentTaskId || source.state !== 'needs_review' || source.retryCount !== initial.retryCount
          || !oldAgent || oldAgent.id !== input.sourceAgentTaskId || oldAgent.kind !== 'sdf.extract'
          || oldAgent.status !== 'succeeded' || oldAgent.retryCount !== source.retryCount || !validRefreshSourceExecution(policy, source.id, oldAgent)
          || oldAgent.session.userId !== input.userId || oldAgent.session.researchObjectId !== source.batch.researchObjectId
          || oldAgent.session.status !== 'active' || unconfirmedAnalysisRefreshPolicy(oldAgent.result, source.artifact) !== policy) {
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

        const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
          userId: input.userId,
          researchObjectId: source.batch.researchObjectId,
          kind: 'ingestion',
          title: `Ingestion analysis refresh ${source.id}`,
          idempotencyKey: `${stableKey}:session`,
        }, ctx);
        const { task: replacement } = await persistAgentTaskInTransaction(deps, tx, {
          sessionId: session.id,
          userId: input.userId,
          kind: 'sdf.extract',
          payload: { artifactId: source.artifactId, researchObjectId: source.batch.researchObjectId },
          idempotencyKey: stableKey,
        }, ctx);
        const changed = await tx.ingestionTask.updateMany({
          where: { id: source.id, agentTaskId: input.sourceAgentTaskId, state: 'needs_review', retryCount: initial.retryCount },
          data: { agentTaskId: replacement.id, state: 'queued', retryCount: 0, error: null },
        });
        if (changed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Legacy extraction changed while refreshing');
        await recordAudit(deps, tx, {
          actorId: input.userId,
          action: 'ingestion.task.analysis_refresh',
          workspaceId: workspace.id,
          targetType: 'ingestion_task',
          targetId: source.id,
          metadata: { policy, oldAgentTaskId: input.sourceAgentTaskId, newAgentTaskId: replacement.id, artifactId: source.artifactId,
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
  if (!initial) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
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
        if (!source) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
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
}

function confirmationView(commit: CreateCommitResult): IngestionConfirmation {
  return {
    commitId: commit.commitId, versionId: commit.versionId, versionNo: commit.versionNo,
    version: commit.versionNo + 1, evidenceStatus: 'needs_review',
    missingFields: SDF_NODE_TYPES.filter(field => !String(commit.snapshot.core[field] ?? '').trim()),
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

async function savedConfirmation(deps: IngestionDeps, taskId: string, researchObjectId: string): Promise<CreateCommitResult | null> {
  const commit = await deps.prisma.commit.findUnique({ where: { idempotencyKey: `ingestion-confirm:${taskId}` } });
  if (!commit || commit.researchObjectId !== researchObjectId) return null;
  const version = await deps.prisma.version.findFirst({ where: { commitId: commit.id } });
  if (!version) return null;
  const manifest = await deps.prisma.versionManifest.findUnique({ where: { versionId: version.id }, include: { entries: true } });
  if (!manifest) return null;
  return { commitId: commit.id, versionId: version.id, versionNo: version.versionNo,
    snapshot: { core: manifest.coreJson as Record<string, unknown>, artifacts: manifest.entries } };
}

/** Durable RO-scoped material history, including completed imports and their fixed versions. */
export async function getResearchObjectIngestion(deps: IngestionDeps, input: { userId: string; researchObjectId: string }) {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
  await requireMembership(deps, ro.workspaceId, input.userId);
  const rows = await deps.prisma.ingestionTask.findMany({
    where: { batch: { researchObjectId: ro.id } }, include: { artifact: true }, orderBy: { updatedAt: 'desc' },
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
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await deps.prisma.$transaction(async tx => {
        const scoped = { ...deps, prisma: tx as IngestionDeps['prisma'] };
        const task = await tx.ingestionTask.findUnique({ where: { id: input.taskId },
          include: { artifact: true, agentTask: true, batch: { include: { researchObject: true } } } });
        if (!task) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
        const { researchObject: ro } = await authorizeIngestionWrite(scoped, { userId: input.userId, researchObjectId: task.batch.researchObjectId });
        let commit = await savedConfirmation(scoped, task.id, ro.id);
        if (!commit) {
          if (!input.sourceAgentTaskId || task.agentTaskId !== input.sourceAgentTaskId) {
            throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Analysis changed; review the current proposal before confirming');
          }
          if (task.state !== 'needs_review') throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only tasks awaiting review can be confirmed');
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
            sdfCore: input.core, artifacts, message: `Confirm import: ${task.artifact.logicalPath}`, idempotencyKey: `ingestion-confirm:${task.id}` }, ctx, tx);
          await tx.sdfDocument.update({ where: { researchObjectId: ro.id }, data: { coreJson: input.core } });
          for (const nodeType of SDF_NODE_TYPES) await tx.sdfNode.update({
            where: { sdfDocumentId_nodeType: { sdfDocumentId: document.id, nodeType } }, data: { content: input.core[nodeType] ?? '' },
          });
          const replacementClaimIds = await writeIngestionEvidence(scoped, { task, versionId: commit.versionId, core: input.core });
          if (latest) await carryVersionEvidence(tx, {
            researchObjectId: ro.id, previousVersionId: latest.id, versionId: commit.versionId, replacementClaimIds,
          });
          await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: commit.versionId });
          const updated = await tx.ingestionTask.updateMany({ where: { id: task.id, agentTaskId: input.sourceAgentTaskId, state: 'needs_review' }, data: { state: 'confirmed', error: null } });
          if (updated.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Task changed while confirming');
          await recordAudit(deps, tx, { actorId: input.userId, action: 'ingestion.confirm', workspaceId: ro.workspaceId,
            targetType: 'ingestion_task', targetId: task.id, metadata: { versionId: commit.versionId, sourceAgentTaskId: input.sourceAgentTaskId, evidenceStatus: 'needs_review' } }, ctx);
        }
        const core = commit.snapshot.core as Record<string, string>;
        return { task: { ...taskToView(task), state: 'confirmed', error: null },
          sdf: { core, nodes: SDF_NODE_TYPES.map(nodeType => ({ nodeType, content: core[nodeType] ?? '' })) }, confirmation: confirmationView(commit) };
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue;
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
