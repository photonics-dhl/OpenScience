import type { AgentTask } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import {
  HermesVideoUnavailableError, isHermesVideoTask, requireHermesVideoReady,
  type AgentDeps, type HermesVideoReadinessDeps,
} from '@openscience/domain';

export const VIDEO_READINESS_HOLD = new HermesVideoUnavailableError().message;
type VideoTaskAdmissionDeps = Pick<AgentDeps, 'prisma'> & HermesVideoReadinessDeps;
type VideoTaskSnapshot = Pick<AgentTask, 'id' | 'kind' | 'status' | 'error' | 'executionAttempt' | 'updatedAt' | 'dispatchedAt'>;
type VideoTaskAdmissionSnapshot = VideoTaskSnapshot & Pick<AgentTask, 'sessionId' | 'payload' | 'result' | 'interestContext' | 'retryCount'>;

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
export async function admitPendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskAdmissionSnapshot): Promise<boolean | null> {
  if (task.status !== 'pending' || !['presentation.generate', 'sdf.extract'].includes(task.kind)
    || !await isHermesVideoTask(deps.prisma, task.id)) return null;
  try { await requireHermesVideoReady(deps); }
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
  return task.error === VIDEO_READINESS_HOLD ? releasePendingVideoTask(deps, task) : null;
}

/** Only pending held rows are released; Redis is owned by the existing outbox dispatcher. */
export async function recoverHeldVideoTasks(deps: VideoTaskAdmissionDeps, limit = 50): Promise<number> {
  const tasks = await deps.prisma.agentTask.findMany({
    where: { status: 'pending', error: VIDEO_READINESS_HOLD, deletedAt: null }, orderBy: { updatedAt: 'asc' }, take: limit,
  });
  let released = 0;
  for (const task of tasks) {
    if (!await isHermesVideoTask(deps.prisma, task.id)) continue;
    try { await requireHermesVideoReady(deps); }
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
