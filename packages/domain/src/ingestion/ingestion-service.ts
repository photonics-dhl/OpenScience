import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { createArtifact } from '../artifact/artifacts';
import { AGENT_TASK_QUEUE, createAgentSession, submitAgentTask, type AgentDeps } from '../agent/agent';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { IngestionError } from './errors';
import { assertSupportedIngestionFile } from './format-policy';
import type { IngestionBatchView, IngestionFileInput, IngestionTaskView } from './ingestion-types';

export type IngestionDeps = AgentDeps & { storage: StorageAdapter };

export async function createIngestionBatch(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string; processingConsent: boolean; files: IngestionFileInput[]; idempotencyKey?: string },
  ctx: AuditContext = {},
): Promise<IngestionBatchView> {
  if (!input.processingConsent) throw new IngestionError('PROCESSING_CONSENT_REQUIRED', 'Processing consent is required');
  if (input.files.length === 0) throw new IngestionError('VALIDATION_ERROR', 'At least one file is required');
  input.files.forEach((file) => assertSupportedIngestionFile(file.filename));

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new IngestionError('INGESTION_NOT_FOUND', 'Research object not found');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const stableKey = input.idempotencyKey ?? randomUUID();
  let batch = await deps.prisma.ingestionBatch.findUnique({ where: { idempotencyKey: stableKey } });
  if (batch && (batch.userId !== input.userId || batch.researchObjectId !== ro.id)) {
    throw new IngestionError('VALIDATION_ERROR', 'Idempotency key belongs to another ingestion request');
  }
  if (!batch) {
    try {
      batch = await deps.prisma.ingestionBatch.create({
        data: { researchObjectId: ro.id, userId: input.userId, idempotencyKey: stableKey },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        batch = await deps.prisma.ingestionBatch.findUnique({ where: { idempotencyKey: stableKey } });
      }
      if (!batch) throw error;
    }
  }
  let sessionId = batch.agentSessionId;
  if (!sessionId) {
    const session = await createAgentSession(deps, {
      userId: input.userId, researchObjectId: ro.id, kind: 'ingestion', title: `Ingestion ${batch.id}`,
    }, ctx);
    batch = await deps.prisma.ingestionBatch.update({ where: { id: batch.id }, data: { agentSessionId: session.id } });
    sessionId = session.id;
  }

  for (const [index, file] of input.files.entries()) {
    const artifact = await createArtifact(deps, {
      logicalPath: file.filename, content: file.content, mimeType: file.mimeType,
      uploadedBy: input.userId, workspaceId: ro.workspaceId, idempotencyKey: `${stableKey}:artifact:${index}`,
    }, ctx);
    const agentTask = await submitAgentTask(deps, {
      sessionId, userId: input.userId, kind: 'sdf.extract',
      payload: { artifactId: artifact.artifactId, researchObjectId: ro.id },
      idempotencyKey: `${stableKey}:extract:${index}`,
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
  }

  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'ingestion.batch.create', workspaceId: ro.workspaceId,
    targetType: 'ingestion_batch', targetId: batch.id, metadata: { researchObjectId: ro.id, fileCount: input.files.length },
  }, ctx);
  return getIngestionBatch(deps, { userId: input.userId, batchId: batch.id });
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
  await requireMembership(deps, task.batch.researchObject.workspaceId, input.userId);
  if (task.state !== 'failed_retryable') throw new IngestionError('INGESTION_NOT_RETRYABLE', 'Only retryable failures can be retried');
  const updated = await deps.prisma.ingestionTask.update({
    where: { id: task.id }, data: { state: 'queued', retryCount: { increment: 1 }, error: null }, include: { artifact: true },
  });
  if (updated.agentTaskId) await deps.redis.lpush(AGENT_TASK_QUEUE, updated.agentTaskId);
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
