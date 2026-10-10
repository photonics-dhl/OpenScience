import type { AgentTask } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import {
  HermesVideoUnavailableError, isHermesVideoTask, isDirectNativeVideoStoryboard, readNativeAgentExecution, requireHermesVideoReady,
  type AgentDeps, type HermesVideoReadinessDeps,
} from '@openscience/domain';

export const VIDEO_READINESS_HOLD = new HermesVideoUnavailableError().message;
type VideoTaskAdmissionDeps = Pick<AgentDeps, 'prisma'> & HermesVideoReadinessDeps;
type VideoTaskSnapshot = Pick<AgentTask, 'id' | 'kind' | 'status' | 'error' | 'executionAttempt' | 'updatedAt' | 'dispatchedAt'>;
type VideoTaskAdmissionSnapshot = VideoTaskSnapshot & Pick<AgentTask, 'sessionId' | 'progress' | 'payload' | 'result' | 'interestContext' | 'retryCount'>;
type PendingVideoAdmission = { expectedPendingTask: VideoTaskAdmissionSnapshot };
const admissionFields = ['id', 'kind', 'status', 'sessionId', 'progress', 'error', 'retryCount', 'executionAttempt',
  'payload', 'result', 'interestContext', 'dispatchedAt', 'updatedAt'] as const;

function firstNativePlan(task: VideoTaskAdmissionSnapshot): boolean {
  if (task.status !== 'pending' || task.error !== null || task.executionAttempt !== 0 || task.retryCount !== 0
    || !isDirectNativeVideoStoryboard(task.payload) || !task.result || Array.isArray(task.result)
    || typeof task.result !== 'object' || Object.keys(task.result).length !== 1) return false;
  try {
    const marker = readNativeAgentExecution(task.result);
    return marker?.profile === 'paper-illustration' && !Object.hasOwn(marker, 'checkpoint');
  } catch { return false; }
}

function audioAdmission(task: Pick<AgentTask, 'id' | 'kind' | 'payload' | 'result' | 'executionAttempt'>) {
  const payload = task.payload as Record<string, unknown> | null;
  const video = payload?.video as Record<string, unknown> | null;
  const purpose = task.kind === 'presentation.generate' && payload?.kind === 'video' && video?.purpose === 'audio-audition'
    ? 'audio-audition' as const : undefined;
  const grant = (task.result as Record<string, unknown> | null)?.audioAuditionGrant as Record<string, unknown> | null;
  // Routing only: the handler still rechecks current authority and can only adopt the original operation.
  const recovery = purpose && grant?.schemaVersion === 1 && grant.purpose === purpose && grant.taskId === task.id
    && Number.isSafeInteger(grant.executionAttempt) && Number(grant.executionAttempt) > 0
    && Number(grant.executionAttempt) <= task.executionAttempt && typeof grant.inputHash === 'string' && /^[a-f0-9]{64}$/u.test(grant.inputHash);
  return { purpose, recovery };
}

function nextUpdatedAt(task: VideoTaskSnapshot): Date {
  return new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1));
}

/** Park in the existing DB outbox without consuming an execution attempt. */
export async function parkPendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskSnapshot): Promise<boolean> {
  const updatedAt = nextUpdatedAt(task);
  const parked = await deps.prisma.agentTask.updateMany({
    where: { id: task.id, status: 'pending', error: task.error, executionAttempt: task.executionAttempt, updatedAt: task.updatedAt },
    data: { error: VIDEO_READINESS_HOLD, dispatchedAt: task.dispatchedAt ?? updatedAt, updatedAt },
  });
  return parked.count === 1;
}

/** A successful release is durable even if the worker exits before outbox dispatch. */
export async function releasePendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskSnapshot): Promise<boolean> {
  const released = await deps.prisma.agentTask.updateMany({
    where: { id: task.id, status: 'pending', error: VIDEO_READINESS_HOLD, executionAttempt: task.executionAttempt, updatedAt: task.updatedAt },
    data: { error: null, dispatchedAt: null, updatedAt: nextUpdatedAt(task) },
  });
  return released.count === 1;
}

/** null means normal claim may proceed; false preserves the caller's processing entry. */
export async function admitPendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskAdmissionSnapshot): Promise<boolean | PendingVideoAdmission | null> {
  if (task.status !== 'pending' || !['presentation.generate', 'sdf.extract'].includes(task.kind)) return null;
  const current = await deps.prisma.agentTask.findUnique({ where: { id: task.id } });
  if (!current || current.deletedAt || admissionFields.some(field => !isDeepStrictEqual(current[field], task[field]))) return false;
  // Intent lookup also awaits DB reads: a non-video result must not reopen an
  // unfenced claim of the poller's earlier payload.
  if (!await isHermesVideoTask(deps.prisma, task.id)) return { expectedPendingTask: current };
  if (firstNativePlan(current)) return { expectedPendingTask: current };
  const audio = audioAdmission(current);
  try { if (!audio.recovery) await requireHermesVideoReady(deps, audio.purpose); }
  catch (error) {
    if (!(error instanceof HermesVideoUnavailableError)) throw error;
    if (await parkPendingVideoTask(deps, task)) return true;
    // A dispatch ACK may win after the poller's read. Retry once from a fresh
    // pending snapshot so the held-row maintenance can resume it without restart.
    const current = await deps.prisma.agentTask.findUnique({ where: { id: task.id } });
    if (!current || current.deletedAt || current.status !== 'pending' || current.kind !== task.kind
      || current.executionAttempt !== task.executionAttempt || current.retryCount !== task.retryCount
      || current.error !== task.error || current.sessionId !== task.sessionId
      || !isDeepStrictEqual(current.payload, task.payload) || !isDeepStrictEqual(current.result, task.result)
      || !isDeepStrictEqual(current.interestContext, task.interestContext)
      || !await isHermesVideoTask(deps.prisma, current.id)) return false;
    return parkPendingVideoTask(deps, current);
  }
  return current.error === VIDEO_READINESS_HOLD ? releasePendingVideoTask(deps, current) : { expectedPendingTask: current };
}

/** Only pending held rows are released; Redis is owned by the existing outbox dispatcher. */
export async function recoverHeldVideoTasks(deps: VideoTaskAdmissionDeps, limit = 50): Promise<number> {
  const tasks = await deps.prisma.agentTask.findMany({
    where: { status: 'pending', error: VIDEO_READINESS_HOLD, deletedAt: null }, orderBy: { updatedAt: 'asc' }, take: limit,
  });
  let released = 0;
  for (const task of tasks) {
    if (!await isHermesVideoTask(deps.prisma, task.id)) continue;
    const audio = audioAdmission(task);
    try { if (!audio.recovery) await requireHermesVideoReady(deps, audio.purpose); }
    catch (error) { if (error instanceof HermesVideoUnavailableError) continue; throw error; }
    if (await releasePendingVideoTask(deps, task)) released++;
  }
  return released;
}

export function createVideoReadinessResumeScheduler(options: { intervalMs?: number; now?: () => number } = {}) {
  const clock = options.now ?? (() => performance.now()); const intervalMs = options.intervalMs ?? 60_000;
  let nextAt = Number.NEGATIVE_INFINITY;
  return async (deps: VideoTaskAdmissionDeps): Promise<number> => {
    const current = clock(); if (current < nextAt) return 0;
    nextAt = current + intervalMs;
    return recoverHeldVideoTasks(deps);
  };
}
