import { createHash, randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { createArtifact } from '../artifact/artifacts';
import { createAgentSession, dispatchAgentTask, submitAgentTask, type AgentDeps } from '../agent/agent';
import { requireActive, requireMembership } from '../workspace/helpers';
import { WorkspaceError } from '../workspace/errors';
import { recordAudit } from '../workspace/audit';
import { IngestionError } from './errors';
import { assertSupportedIngestionFile } from './format-policy';
import type { IngestionBatchView, IngestionFileInput, IngestionTaskView } from './ingestion-types';

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
  input.files.forEach((file) => assertSupportedIngestionFile(file.filename, file.mimeType));
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
