import { Prisma, type AgentTask } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import {
  HermesVideoUnavailableError, PresentationAssetError, classifyNativeVideoAudio, isHermesVideoTask, isDirectNativeVideoStoryboard,
  parsePresentationGenerationPayload, readNativeAgentExecution, requireHermesVideoReady, requireSceneImageParent, requireVideoGenerationParents,
  type AgentDeps, type HermesVideoReadinessDeps, type NativeAgentExecution,
} from '@openscience/domain';

export const VIDEO_READINESS_HOLD = new HermesVideoUnavailableError().message;
type VideoTaskAdmissionDeps = Pick<AgentDeps, 'prisma'> & HermesVideoReadinessDeps;
type VideoTaskSnapshot = Pick<AgentTask, 'id' | 'kind' | 'status' | 'error' | 'executionAttempt' | 'updatedAt' | 'dispatchedAt'>;
type VideoTaskAdmissionSnapshot = VideoTaskSnapshot & Pick<AgentTask, 'sessionId' | 'progress' | 'payload' | 'result' | 'interestContext' | 'retryCount'>;
type PendingVideoAdmission = { expectedPendingTask: VideoTaskAdmissionSnapshot };
const admissionFields = ['id', 'kind', 'status', 'sessionId', 'progress', 'error', 'retryCount', 'executionAttempt',
  'payload', 'result', 'interestContext', 'dispatchedAt', 'updatedAt'] as const;

function firstNativePlan(task: VideoTaskAdmissionSnapshot, error: string | null = null): boolean {
  if (task.kind !== 'presentation.generate' || task.status !== 'pending' || task.error !== error || task.executionAttempt !== 0 || task.retryCount !== 0
    || !isDirectNativeVideoStoryboard(task.payload) || !task.result || Array.isArray(task.result)
    || typeof task.result !== 'object' || Object.keys(task.result).length !== 1) return false;
  try {
    const marker = readNativeAgentExecution(task.result);
    return marker?.profile === 'paper-illustration' && !Object.hasOwn(marker, 'checkpoint');
  } catch { return false; }
}

/** NULL-CP future contracts have no saved tools to replay. Host readiness cannot supply those tools. */
function planningContractHold(task: Pick<AgentTask, 'kind' | 'payload' | 'result'>): boolean {
  if (task.kind !== 'presentation.generate' || !task.result || typeof task.result !== 'object' || Array.isArray(task.result)
    || !Object.hasOwn(task.result, 'nativeAgentExecution')) return false;
  const rawMarker = (task.result as Record<string, unknown>).nativeAgentExecution;
  if (!rawMarker || typeof rawMarker !== 'object' || Array.isArray(rawMarker)
    || !Object.hasOwn(rawMarker, 'planningContract')) return false;
  let compatibleShape = isDirectNativeVideoStoryboard(task.payload);
  if (!compatibleShape) {
    try {
      const payload = parsePresentationGenerationPayload(task.payload), settings = payload.storyboard;
      compatibleShape = payload.kind === 'interactive_html' && settings?.output === 'video' && settings.narrative === true
        && settings.baseAssetId !== undefined && settings.revisionSceneIndex !== undefined
        && payload.hermesRunAuthority === undefined && settings.narrativeSceneLimit === undefined
        && settings.revisionMode === undefined && settings.revisionTaskId === undefined
        && settings.revisionImageAssetId === undefined && settings.artSceneIndex === undefined;
    } catch { return false; }
  }
  if (!compatibleShape) return false;
  try {
    const marker = readNativeAgentExecution(task.result);
    return marker?.planningContract !== undefined && (!marker.checkpoint || marker.checkpoint.state === 'started');
  } catch { return true; }
}

function optionalFirstNativePlan(task: VideoTaskAdmissionSnapshot): boolean {
  return (task.error === null || task.error === VIDEO_READINESS_HOLD) && firstNativePlan(task, task.error)
    && readNativeAgentExecution(task.result)?.planningContract === 'video-optional-audio-v1';
}

function pendingSnapshotWhere(task: VideoTaskAdmissionSnapshot): Prisma.AgentTaskWhereInput {
  return { id: task.id, kind: task.kind, status: 'pending', deletedAt: null, error: task.error,
    sessionId: task.sessionId, progress: task.progress, retryCount: task.retryCount, executionAttempt: task.executionAttempt,
    dispatchedAt: task.dispatchedAt, updatedAt: task.updatedAt,
    payload: { equals: task.payload as Prisma.InputJsonValue },
    result: { equals: task.result === null ? Prisma.AnyNull : task.result as Prisma.InputJsonValue },
    interestContext: { equals: task.interestContext === null ? Prisma.AnyNull : task.interestContext as Prisma.InputJsonValue } };
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

async function persistedVideoAudio(deps: VideoTaskAdmissionDeps, task: Pick<AgentTask, 'kind' | 'payload'>) {
  const payload = task.payload as Record<string, unknown> | null;
  if (task.kind !== 'presentation.generate' || !payload) return undefined;
  const video = payload.video as Record<string, unknown> | null;
  const scene = payload.sceneImage as Record<string, unknown> | null;
  // Historical/unbound tasks keep their external readiness path. Client audio hints never grant a purpose.
  if (payload.kind !== 'video' && payload.kind !== 'image'
    || typeof (payload.kind === 'video' ? video : scene)?.storyboardAssetId !== 'string') return undefined;
  try {
    const parsed = parsePresentationGenerationPayload(payload);
    let document: unknown, identity: string | undefined;
    if (parsed.video) {
      const parents = await requireVideoGenerationParents(deps.prisma, parsed);
      if (parents?.nativeParent) { document = parents.storyboardView.document; identity = parents.identity; }
    } else if (parsed.sceneImage) {
      const parent = await requireSceneImageParent(deps.prisma, parsed);
      if (parent?.view.output === 'video' && parent.view.narrative === true) { document = parent.view.document; identity = parent.identity; }
    }
    if (identity === undefined) return undefined;
    const mode = classifyNativeVideoAudio(document);
    if (!mode) throw new HermesVideoUnavailableError();
    return { identity, mode, purpose: mode === 'native-first' ? mode : undefined };
  } catch (error) {
    if (error instanceof PresentationAssetError) throw new HermesVideoUnavailableError();
    throw error;
  }
}

async function requirePersistedVideoReady(deps: VideoTaskAdmissionDeps,
  task: Pick<AgentTask, 'id' | 'kind' | 'payload' | 'result' | 'executionAttempt'>): Promise<void> {
  const audio = audioAdmission(task);
  if (audio.recovery) return;
  if (audio.purpose) { await requireHermesVideoReady(deps, audio.purpose); return; }
  const parent = await persistedVideoAudio(deps, task);
  await requireHermesVideoReady(deps, parent?.purpose);
  // The host read awaits external state. Recheck the same authoritative parent before releasing or returning a claim snapshot.
  if (!isDeepStrictEqual(parent, await persistedVideoAudio(deps, task))) throw new HermesVideoUnavailableError();
}

function nextUpdatedAt(task: VideoTaskSnapshot): Date {
  return new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1));
}

/** Park in the existing DB outbox without consuming an execution attempt. */
export async function parkPendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskAdmissionSnapshot): Promise<boolean> {
  const updatedAt = nextUpdatedAt(task);
  const parked = await deps.prisma.agentTask.updateMany({
    where: pendingSnapshotWhere(task),
    data: { error: VIDEO_READINESS_HOLD, dispatchedAt: task.dispatchedAt ?? updatedAt, updatedAt },
  });
  return parked.count === 1;
}

/** A successful release is durable even if the worker exits before outbox dispatch. */
export async function releasePendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskAdmissionSnapshot,
  planningContract?: NativeAgentExecution['planningContract']): Promise<boolean> {
  if (task.status !== 'pending' || task.error !== VIDEO_READINESS_HOLD) return false;
  if (planningContract !== undefined) {
    // Compatible R2 callers release the original untouched row once; generic Host recovery cannot opt in.
    try {
      if (planningContract !== 'video-optional-audio-v1' || !firstNativePlan(task, VIDEO_READINESS_HOLD)
        || readNativeAgentExecution(task.result)?.planningContract !== planningContract) return false;
    } catch { return false; }
  } else if (planningContractHold(task)) return false;
  const released = await deps.prisma.agentTask.updateMany({
    where: pendingSnapshotWhere(task),
    data: { error: null, dispatchedAt: null, updatedAt: nextUpdatedAt(task) },
  });
  return released.count === 1;
}

/** null allows a normal claim; false requires current-state recovery before removing processing. */
export async function admitPendingVideoTask(deps: VideoTaskAdmissionDeps, task: VideoTaskAdmissionSnapshot): Promise<boolean | PendingVideoAdmission | null> {
  if (task.status !== 'pending' || !['presentation.generate', 'sdf.extract'].includes(task.kind)) return null;
  const current = await deps.prisma.agentTask.findUnique({ where: { id: task.id } });
  if (!current || current.deletedAt || admissionFields.some(field => !isDeepStrictEqual(current[field], task[field]))) return false;
  if (optionalFirstNativePlan(current)) {
    if (!await isHermesVideoTask(deps.prisma, current.id)) return false;
    return current.error === VIDEO_READINESS_HOLD
      ? releasePendingVideoTask(deps, current, 'video-optional-audio-v1') : { expectedPendingTask: current };
  }
  // Intent lookup also awaits DB reads: a non-video result must not reopen an
  // unfenced claim of the poller's earlier payload.
  const contractHeld = planningContractHold(current);
  if (!contractHeld && !await isHermesVideoTask(deps.prisma, task.id)) return { expectedPendingTask: current };
  if (!contractHeld && firstNativePlan(current)) return { expectedPendingTask: current };
  try {
    if (contractHeld) throw new HermesVideoUnavailableError();
    await requirePersistedVideoReady(deps, current);
  }
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
      || !planningContractHold(current) && !await isHermesVideoTask(deps.prisma, current.id)) return false;
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
    if (optionalFirstNativePlan(task)) {
      if (await isHermesVideoTask(deps.prisma, task.id)
        && await releasePendingVideoTask(deps, task, 'video-optional-audio-v1')) released++;
      continue;
    }
    if (planningContractHold(task)) continue;
    if (!await isHermesVideoTask(deps.prisma, task.id)) continue;
    try { await requirePersistedVideoReady(deps, task); }
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
