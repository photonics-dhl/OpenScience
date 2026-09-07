import { freezeResearchRecord } from '../commit/research-record-snapshot';
import { createHash, randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { createArtifact } from '../artifact/artifacts';
import { createAgentSession, dispatchAgentTask, projectAgentTaskResult, submitAgentTask, type AgentDeps } from '../agent/agent';
import { requireActive, requireMembership } from '../workspace/helpers';
import { WorkspaceError } from '../workspace/errors';
import { recordAudit } from '../workspace/audit';
import { validateSdfCore, validateSdfDraftCore } from '@openscience/sdf-schema';
import { createCommit, type CreateCommitResult } from '../commit/commits';
import { ResearchObjectError } from '../research-object/errors';
import { SDF_NODE_TYPES } from '../research-object/types';
import type { SdfDocumentView } from '../research-object/sdf';
import { carryIngestionEvidence, writeIngestionEvidence } from './ingestion-evidence';
import { IngestionError } from './errors';
import { assertIngestionContent, assertSupportedIngestionFile } from './format-policy';
import type { ActionableIngestionTaskView, IngestionBatchView, IngestionFileInput, IngestionTaskView } from './ingestion-types';

export type IngestionDeps = AgentDeps & { storage: StorageAdapter };

const INGESTION_WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);

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
      batch: input.researchObjectId === undefined ? { userId: input.userId } : { researchObjectId: input.researchObjectId },
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
): Promise<IngestionTaskView> {
  const task = await deps.prisma.ingestionTask.findUnique({
    where: { id: input.taskId }, include: { artifact: true, batch: { include: { researchObject: true } } },
  });
  if (!task) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  await authorizeIngestionWrite(deps, { userId: input.userId, researchObjectId: task.batch.researchObject.id });
  if (task.state !== 'failed_retryable') throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only retryable failures can be retried');
  const claimed = await deps.prisma.ingestionTask.updateMany({
    where: { id: task.id, state: 'failed_retryable' }, data: { state: 'queued', retryCount: { increment: 1 }, error: null },
  });
  if (claimed.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only retryable failures can be retried');
  const updated = await deps.prisma.ingestionTask.findUnique({ where: { id: task.id }, include: { artifact: true } });
  if (!updated) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion task not found');
  if (updated.agentTaskId) {
    await deps.prisma.agentTask.update({ where: { id: updated.agentTaskId }, data: { dispatchedAt: null } });
    try {
      await dispatchAgentTask(deps, updated.agentTaskId);
    } catch (error) {
      await deps.prisma.ingestionTask.updateMany({
        where: { id: updated.id, state: 'queued' },
        data: { state: 'failed_retryable', error: 'Queue dispatch unavailable' },
      });
      throw error;
    }
  }
  return taskToView(updated);
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
  input: { userId: string; taskId: string; version: number; core: Record<string, string> },
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
          if (task.state !== 'needs_review') throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only tasks awaiting review can be confirmed');
          const check = ro.status === 'draft' ? validateSdfDraftCore(input.core) : validateSdfCore(input.core);
          if (!check.ok) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不符合 core Schema');
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
          if (latest) await carryIngestionEvidence(scoped, { researchObjectId: ro.id, previousVersionId: latest.id, versionId: commit.versionId });
          await writeIngestionEvidence(scoped, { task, versionId: commit.versionId, core: input.core });
          await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: commit.versionId });
          const updated = await tx.ingestionTask.updateMany({ where: { id: task.id, state: 'needs_review' }, data: { state: 'confirmed', error: null } });
          if (updated.count !== 1) throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Task changed while confirming');
          await recordAudit(deps, tx, { actorId: input.userId, action: 'ingestion.confirm', workspaceId: ro.workspaceId,
            targetType: 'ingestion_task', targetId: task.id, metadata: { versionId: commit.versionId, evidenceStatus: 'needs_review' } }, ctx);
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
