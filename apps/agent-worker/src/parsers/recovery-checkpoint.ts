import type { PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentSourceMapReference } from '@openscience/domain';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** A partial map is reusable only for the explicitly authorized, current ingestion retry. */
export async function requirePartialParserRecovery(prisma: PrismaClient, input: {
  taskId: string; actorId: string; workspaceId: string; researchObjectId: string;
  artifactId: string; retryCount: number; executionAttempt: number; reference: DocumentSourceMapReference;
}): Promise<void> {
  const source = await prisma.ingestionTask.findFirst({ where: { agentTaskId: input.taskId }, include: { batch: true } });
  if (!source || source.agentTaskId !== input.taskId || source.artifactId !== input.artifactId
    || !['queued', 'parsing'].includes(source.state) || source.retryCount !== input.retryCount
    || ![1, 2].includes(input.retryCount) || input.executionAttempt !== input.retryCount + 1
    || source.batch.userId !== input.actorId || source.batch.researchObjectId !== input.researchObjectId) {
    throw new Error('[blocked] Parser recovery source changed');
  }
  const receipts = await prisma.auditLog.findMany({ where: {
    action: 'ingestion.task.retry', actorId: input.actorId, workspaceId: input.workspaceId,
    targetType: 'ingestion_task', targetId: source.id,
    AND: [{ metadata: { path: ['retryAttempt'], equals: input.retryCount } },
      { metadata: { path: ['agentTaskId'], equals: input.taskId } }],
  }, take: 2 });
  if (receipts.length !== 1) throw new Error('[blocked] Parser recovery receipt is missing or ambiguous');
  const metadata = record(receipts[0]!.metadata);
  const previous = record(metadata.previousParserResult);
  if (metadata.recovery !== 'unresolved_parser_pages' || metadata.agentTaskId !== input.taskId
    || metadata.retryAttempt !== input.retryCount || metadata.previousExecutionAttempt !== input.executionAttempt - 1
    || metadata.previousRetryCount !== input.retryCount - 1 || metadata.previousAgentRetryCount !== input.retryCount - 1
    || previous.status !== 'needs_review' || previous.reason !== 'unresolved pages remain'
    || Object.hasOwn(previous, 'core') || !isDeepStrictEqual(previous.sourceMapRef, input.reference)) {
    throw new Error('[blocked] Parser recovery receipt does not match saved source');
  }
  const bindings = await prisma.hermesResearchStep.findMany({ where: {
    ingestionTaskId: source.id, stage: 'source_ingestion', run: { profile: 'visual-narrative-v1' },
  }, include: { run: { include: { researchObject: true, steps: true } } }, take: 2 });
  if (bindings.length === 0) {
    if (metadata.runId !== undefined || metadata.sourceStepId !== undefined)
      throw new Error('[blocked] Parser recovery run binding is missing');
    return;
  }
  const step = bindings[0]!, run = step.run;
  if (bindings.length !== 1 || metadata.runId !== run.id || metadata.sourceStepId !== step.id
    || metadata.explicitUserAction !== true || metadata.possibleDuplicateProviderCharge !== true
    || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey
    || typeof metadata.requestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.requestDigest)
    || !Number.isSafeInteger(metadata.previousVersion) || run.version !== Number(metadata.previousVersion) + 1
    || step.agentTaskId !== input.taskId || step.artifactId !== input.artifactId || step.status !== 'waiting'
    || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId
    || run.status !== 'running' || run.maxAgentTasks !== 9 || run.versionId !== null
    || run.sourceClaimIds.length !== 0 || run.steps.length !== 1
    || run.researchObject.deletedAt || run.researchObject.status !== 'draft'
    || run.researchObject.workspaceId !== input.workspaceId) {
    throw new Error('[blocked] Parser recovery run authority changed');
  }
}
