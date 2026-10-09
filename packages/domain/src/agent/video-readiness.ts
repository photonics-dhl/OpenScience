import type { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { requireSceneImageParent } from '../assets/scene-image';

export interface HermesVideoReadinessDeps {
  videoEnabled?: boolean;
  readVideoReadiness?: () => Promise<boolean>;
}

export class HermesVideoUnavailableError extends Error {
  readonly code = 'VIDEO_UNAVAILABLE';
  constructor() {
    super('Video generation is temporarily unavailable.');
    this.name = 'HermesVideoUnavailableError';
  }
}

export async function isHermesVideoReady(deps: HermesVideoReadinessDeps): Promise<boolean> {
  if (deps.videoEnabled !== true || typeof deps.readVideoReadiness !== 'function') return false;
  try { return await deps.readVideoReadiness() === true; } catch { return false; }
}

export async function requireHermesVideoReady(deps: HermesVideoReadinessDeps): Promise<void> {
  if (!await isHermesVideoReady(deps)) throw new HermesVideoUnavailableError();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function isHermesVideoRun(run: { profile: string | null; generationSettings?: unknown }): boolean {
  return run.profile === 'onchip-field-sampling-v1' || run.profile === 'content-driven-v1'
    || run.profile === 'visual-narrative-v1' && object(run.generationSettings).output === 'video';
}

async function hasAuditedVideoParserRetry(prisma: Prisma.TransactionClient,
  task: Prisma.AgentTaskGetPayload<{ include: { session: { include: { researchObject: true } } } }>, artifactId: string): Promise<boolean> {
  const { session } = task;
  if (!session.researchObject) return false;
  const workspaceId = session.researchObject.workspaceId;
  const audits = await prisma.auditLog.findMany({ where: { workspaceId, actorId: session.userId,
    action: 'ingestion.task.retry', targetType: 'ingestion_task',
    metadata: { path: ['agentTaskId'], equals: task.id } } });
  for (const audit of audits) {
    const metadata = object(audit.metadata);
    if (audit.action !== 'ingestion.task.retry' || audit.workspaceId !== workspaceId || audit.actorId !== session.userId
      || audit.targetType !== 'ingestion_task' || metadata.agentTaskId !== task.id
      || metadata.explicitUserAction !== true || metadata.possibleDuplicateProviderCharge !== true
      || typeof metadata.runId !== 'string' || typeof metadata.sourceStepId !== 'string'
      || typeof metadata.clientIdempotencyKey !== 'string' || !metadata.clientIdempotencyKey.trim() || metadata.clientIdempotencyKey.length > 200
      || typeof metadata.requestDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(metadata.requestDigest)
      || !Number.isInteger(metadata.previousVersion) || Number(metadata.previousVersion) < 1
      || !Number.isInteger(metadata.previousExecutionAttempt) || Number(metadata.previousExecutionAttempt) < 0
      || !['pending', 'running', 'succeeded', 'failed'].includes(task.status)
      || task.executionAttempt !== Number(metadata.previousExecutionAttempt) + (task.status === 'pending' ? 0 : 1)
      || !Number.isInteger(metadata.previousAgentRetryCount) || Number(metadata.previousAgentRetryCount) + 1 !== task.retryCount) continue;
    const run = await prisma.hermesResearchRun.findUnique({ where: { id: metadata.runId }, include: { steps: true } });
    if (!run || !isHermesVideoRun(run) || run.actorId !== session.userId || run.researchObjectId !== session.researchObjectId) continue;
    if (run.version !== metadata.previousVersion && run.version !== Number(metadata.previousVersion) + 1) continue;
    const step = run.steps.find(candidate => candidate.id === metadata.sourceStepId && candidate.stage === 'source_ingestion'
      && candidate.agentTaskId === task.id && candidate.ingestionTaskId === audit.targetId && candidate.artifactId === artifactId);
    if (!step?.ingestionTaskId) continue;
    const source = await prisma.ingestionTask.findUnique({ where: { id: step.ingestionTaskId }, include: { batch: true } });
    if (source && source.agentTaskId === task.id && source.artifactId === artifactId && source.batch.userId === session.userId
      && source.batch.researchObjectId === session.researchObjectId && metadata.retryAttempt === source.retryCount) return true;
  }
  return false;
}

/** Restrictive intent classification, never execution authority. Shared upload references are not ownership. */
export async function isHermesVideoTask(prisma: Prisma.TransactionClient, taskId: string): Promise<boolean> {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId }, include: { session: { include: { researchObject: true } } } });
  if (!task || task.deletedAt || task.session.deletedAt || !task.session.researchObject || task.session.researchObject.deletedAt) return false;
  const payload = object(task.payload);
  const session = task.session;
  if (payload.researchObjectId !== session.researchObjectId) return false;

  if (task.kind === 'presentation.generate') {
    if (payload.schemaVersion !== 1 || typeof payload.versionId !== 'string' || !Array.isArray(payload.sourceClaimIds)) return false;
    const authority = object(payload.hermesRunAuthority);
    if (payload.hermesRunAuthority !== undefined) {
      if (typeof authority.runId !== 'string') return false;
      const run = await prisma.hermesResearchRun.findUnique({ where: { id: authority.runId }, include: { steps: true } });
      if (!run || !isHermesVideoRun(run) || run.actorId !== session.userId || run.researchObjectId !== session.researchObjectId
        || run.versionId !== payload.versionId || run.profile !== authority.profile
        || !isDeepStrictEqual(run.sourceClaimIds, payload.sourceClaimIds)
        || !run.steps.some(step => step.agentTaskId === task.id && step.stage === authority.stage && step.ordinal === authority.ordinal
          && ['storyboard', 'scene_image', 'video'].includes(step.stage))) return false;
      return true;
    }
    if (payload.kind === 'video' && payload.video && typeof payload.video === 'object') return true;
    if (payload.kind === 'interactive_html' && object(payload.storyboard).output === 'video') return true;
    if (payload.kind === 'image' && payload.sceneImage) {
      try {
        const parent = await requireSceneImageParent(prisma, {
          researchObjectId: session.researchObjectId!, versionId: payload.versionId,
          sourceClaimIds: payload.sourceClaimIds as string[], sceneImage: payload.sceneImage as Parameters<typeof requireSceneImageParent>[1]['sceneImage'],
        });
        return parent?.view.output === 'video';
      } catch { return false; }
    }
    return false;
  }
  if (task.kind !== 'sdf.extract' || typeof payload.artifactId !== 'string') return false;
  const runs = await prisma.hermesResearchRun.findMany({ where: { actorId: session.userId, researchObjectId: session.researchObjectId!,
    steps: { some: { agentTaskId: task.id, stage: { in: ['source_composition', 'source_review'] } } } }, include: { steps: true } });
  for (const run of runs) {
    if (!isHermesVideoRun(run) || run.actorId !== session.userId || run.researchObjectId !== session.researchObjectId) continue;
    for (const step of run.steps) {
      if (!['source_composition', 'source_review'].includes(step.stage) || step.agentTaskId !== task.id
        || !step.ingestionTaskId || step.artifactId !== payload.artifactId
        || !run.steps.some(source => source.stage === 'source_ingestion' && source.ingestionTaskId === step.ingestionTaskId
          && source.artifactId === payload.artifactId)) continue;
      const source = await prisma.ingestionTask.findUnique({ where: { id: step.ingestionTaskId }, include: { batch: true } });
      if (source && source.artifactId === payload.artifactId && source.batch.userId === session.userId
        && source.batch.researchObjectId === session.researchObjectId) return true;
    }
  }
  if (await hasAuditedVideoParserRetry(prisma, task, payload.artifactId)) return true;
  const ingestion = await prisma.ingestionTask.findFirst({ where: { agentTaskId: task.id }, include: { batch: true } });
  if (!ingestion || ingestion.artifactId !== payload.artifactId || ingestion.batch.userId !== session.userId
    || ingestion.batch.researchObjectId !== session.researchObjectId) return false;

  for (const action of ['ingestion.task.analysis_refresh', 'ingestion.task.system_analysis_refresh']) {
    const internal = action === 'ingestion.task.system_analysis_refresh';
    const refreshes = await prisma.auditLog.findMany({ where: { action, actorId: internal ? null : session.userId,
      workspaceId: task.session.researchObject.workspaceId, targetType: 'ingestion_task', targetId: ingestion.id,
      metadata: { path: ['newAgentTaskId'], equals: task.id } } });
    for (const audit of refreshes) {
      const metadata = object(audit.metadata);
      if (audit.action !== action || audit.actorId !== (internal ? null : session.userId)
        || audit.workspaceId !== task.session.researchObject.workspaceId || audit.targetType !== 'ingestion_task' || audit.targetId !== ingestion.id
        || metadata.requestedOutput !== 'video' || metadata.newAgentTaskId !== task.id || metadata.artifactId !== ingestion.artifactId
        || typeof metadata.oldAgentTaskId !== 'string' || metadata.oldAgentTaskId === task.id
        || internal && (metadata.executor !== 'hermes' || metadata.authorizedByUserId !== session.userId)) continue;
      const previous = await prisma.agentTask.findUnique({ where: { id: metadata.oldAgentTaskId }, include: { session: true } });
      if (previous?.kind === 'sdf.extract' && previous.session.userId === session.userId
        && previous.session.researchObjectId === session.researchObjectId
        && object(previous.payload).artifactId === ingestion.artifactId && object(previous.payload).researchObjectId === session.researchObjectId) return true;
    }
  }

  const audits = await prisma.auditLog.findMany({ where: {
    action: 'ingestion.task.reanalyze', actorId: session.userId, workspaceId: task.session.researchObject.workspaceId,
    targetType: 'ingestion_task', targetId: ingestion.id,
  } });
  for (const audit of audits) {
    const metadata = object(audit.metadata);
    if (audit.actorId !== session.userId || audit.targetId !== ingestion.id || audit.targetType !== 'ingestion_task'
      || audit.workspaceId !== task.session.researchObject.workspaceId || audit.action !== 'ingestion.task.reanalyze'
      || ingestion.batch.agentSessionId !== session.id
      || metadata.newAgentTaskId !== task.id || metadata.artifactId !== ingestion.artifactId
      || typeof metadata.sourceIngestionTaskId !== 'string' || typeof metadata.sourceAgentTaskId !== 'string'
      || metadata.sourceIngestionTaskId === ingestion.id || metadata.sourceAgentTaskId === task.id) continue;
    const source = await prisma.ingestionTask.findUnique({ where: { id: metadata.sourceIngestionTaskId }, include: { batch: true } });
    const sourceAgent = await prisma.agentTask.findUnique({ where: { id: metadata.sourceAgentTaskId }, include: { session: true } });
    if (!source || source.artifactId !== ingestion.artifactId || source.batch.userId !== session.userId
      || source.batch.researchObjectId !== session.researchObjectId || !sourceAgent || sourceAgent.kind !== 'sdf.extract'
      || sourceAgent.session.userId !== session.userId || sourceAgent.session.researchObjectId !== session.researchObjectId
      || object(sourceAgent.payload).artifactId !== ingestion.artifactId || object(sourceAgent.payload).researchObjectId !== session.researchObjectId) continue;
    let fromVideoRun = false;
    if (metadata.sourceRunId !== undefined) {
      if (typeof metadata.sourceRunId !== 'string') continue;
      const run = await prisma.hermesResearchRun.findUnique({ where: { id: metadata.sourceRunId }, include: { steps: true } });
      if (!run || run.actorId !== session.userId || run.researchObjectId !== session.researchObjectId
        || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === source.id && step.artifactId === source.artifactId)) continue;
      fromVideoRun = isHermesVideoRun(run);
    }
    if (metadata.requestedOutput === 'video' || fromVideoRun) return true;
  }

  return false;
}
