import { ApiClientError, createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun, getHermesResearchRun, getHermesVideoCapability, getIngestionTask,
  isConfirmedIngestionReanalysisSource, reanalyzeConfirmedIngestion, type HermesNarrativeGeneration, type HermesResearchRun } from '@/lib/api';
import { loadPendingHermesRunStart, savePendingHermesRunStart, type HermesRunStartScope, type PendingHermesRunStart } from './draft-state';

function hasCurrentScientificReview(result: Record<string, unknown> | null): boolean {
  const review = result?.scientificReview;
  return Boolean(review && typeof review === 'object' && !Array.isArray(review)
    && (review as Record<string, unknown>).contractVersion === '5'
    && (review as Record<string, unknown>).status === 'review_received');
}

export function hasHermesRunOutput(run: Pick<HermesResearchRun, 'generationSettings'>, output?: 'video'): boolean {
  return (run.generationSettings?.output ?? 'image') === (output ?? 'image');
}

async function requireVideoReady(researchObjectId: string, check: () => void): Promise<void> {
  const capability = await getHermesVideoCapability(researchObjectId);
  check();
  if (capability?.canGenerateVideo !== true)
    throw new ApiClientError('VIDEO_UNAVAILABLE', 'Video generation is temporarily unavailable.', 503);
}

function latestPending(storage: Storage | null, scope: HermesRunStartScope, pending: PendingHermesRunStart, identityError: string): PendingHermesRunStart {
  const saved = loadPendingHermesRunStart(storage, scope);
  if (!saved) return pending;
  if (saved.key !== pending.key || (isRunPending(pending) && !isRunPending(saved))
    || (pending.sourceReanalysisKey && (saved.sourceReanalysisKey !== pending.sourceReanalysisKey
    || saved.sourceReanalysisOutput !== pending.sourceReanalysisOutput))) throw new Error(identityError);
  return saved;
}

function isRunPending(pending: PendingHermesRunStart): boolean {
  return pending.phase === 'run' || (pending.phase === undefined && !pending.sourceReanalysisKey);
}

/** Reopen a confirmed historical source through the existing paid reanalysis path before narrative creation. */
export async function prepareHermesNarrativeSource(input: {
  scope: HermesRunStartScope;
  pending: PendingHermesRunStart;
  storage: Storage | null;
  isCurrent(): boolean;
  identityError: string;
  storageError: string;
}): Promise<{ scope: HermesRunStartScope; pending: PendingHermesRunStart }> {
  const check = () => { if (!input.isCurrent()) throw new Error(input.identityError); };
  check();
  if (input.pending.generation.output !== input.scope.output
    || (input.pending.sourceReanalysisOutput !== undefined && (input.pending.sourceReanalysisOutput !== 'video'
      || !input.pending.sourceReanalysisKey || input.scope.output !== 'video'))) throw new Error(input.identityError);
  const viewer = await getCurrentUser({ fresh: true });
  check();
  if (viewer.userId !== input.scope.userId) throw new Error(input.identityError);
  let request = latestPending(input.storage, input.scope, input.pending, input.identityError);
  if (request.runId || isRunPending(request)) return { scope: input.scope, pending: request };
  const detail = await getIngestionTask(input.scope.ingestionTaskId);
  check();
  if (detail.researchObjectId !== input.scope.researchObjectId || detail.task.id !== input.scope.ingestionTaskId)
    throw new Error(input.identityError);
  request = latestPending(input.storage, input.scope, request, input.identityError);
  if (request.runId || isRunPending(request)) return { scope: input.scope, pending: request };
  if (!request.sourceReanalysisKey
    && (!isConfirmedIngestionReanalysisSource(detail.task) || hasCurrentScientificReview(detail.task.result))) {
    const pending = { ...request, phase: 'run' as const };
    if (!savePendingHermesRunStart(input.storage, input.scope, pending)) throw new Error(input.storageError);
    return { scope: input.scope, pending };
  }
  if (!detail.task.agentTaskId) throw new Error(input.identityError);
  if (input.scope.output === 'video' && (!request.sourceReanalysisKey || request.sourceReanalysisOutput !== 'video')) {
    await requireVideoReady(input.scope.researchObjectId, check);
    request = latestPending(input.storage, input.scope, request, input.identityError);
    if (request.runId || isRunPending(request)) return { scope: input.scope, pending: request };
  }
  const sourceReanalysisKey = request.sourceReanalysisKey ?? crypto.randomUUID();
  // Existing keys replay their original body, even if today's generation is video.
  const sourceReanalysisOutput = request.sourceReanalysisKey ? request.sourceReanalysisOutput : input.scope.output;
  const pendingWithKey = { ...request, sourceReanalysisKey, ...(sourceReanalysisOutput ? { sourceReanalysisOutput } : {}) };
  if (!request.sourceReanalysisKey
    && !savePendingHermesRunStart(input.storage, input.scope, pendingWithKey)) throw new Error(input.storageError);
  const task = sourceReanalysisOutput === 'video'
    ? await reanalyzeConfirmedIngestion(input.scope.ingestionTaskId, detail.task.agentTaskId, sourceReanalysisKey, undefined, 'video')
    : await reanalyzeConfirmedIngestion(input.scope.ingestionTaskId, detail.task.agentTaskId, sourceReanalysisKey);
  check();
  if (!task.id || task.id === input.scope.ingestionTaskId || task.artifactId !== detail.task.artifactId) throw new Error(input.identityError);
  const scope = { ...input.scope, ingestionTaskId: task.id };
  // The source receipt belongs to A. B now has a fixed run body and must never reuse A's source key.
  const pending = latestPending(input.storage, scope, { key: request.key, generation: request.generation,
    savedAt: request.savedAt, phase: 'run' }, input.identityError);
  if (!savePendingHermesRunStart(input.storage, scope, pending)) throw new Error(input.storageError);
  return { scope, pending };
}

/** Called only by the explicit create-and-illustrate submission, never by page loading. */
export async function startPaperNarrative(input: {
  scope: HermesRunStartScope;
  generation: HermesNarrativeGeneration;
  storage: Storage | null;
  isCurrent(): boolean;
  identityError: string;
  storageError: string;
}): Promise<HermesResearchRun> {
  const { scope, storage } = input;
  const check = () => { if (!input.isCurrent()) throw new Error(input.identityError); };
  check();
  if (input.generation.output !== scope.output) throw new Error(input.identityError);
  const viewer = await getCurrentUser({ fresh: true });
  check();
  if (viewer.userId !== scope.userId) throw new Error(input.identityError);
  const saved = loadPendingHermesRunStart(storage, scope);
  const verify = (run: HermesResearchRun, runScope = scope) => {
    if (run.actorId !== runScope.userId || run.researchObjectId !== runScope.researchObjectId || !hasHermesRunOutput(run, runScope.output)
      || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === runScope.ingestionTaskId))
      throw new Error(input.identityError);
    return run;
  };
  if (saved?.runId) {
    const result = await getHermesResearchRun(scope.researchObjectId, saved.runId);
    check();
    if (result.run.id !== saved.runId) throw new Error(input.identityError);
    return verify(result.run);
  }
  const existing = await getExistingHermesResearchRun(scope.researchObjectId, scope.ingestionTaskId, undefined, scope.output);
  check();
  if (existing.run) return verify(existing.run);
  // Preserve an uncertain submission's original scope, payload and key on every retry.
  if (!saved && scope.output === 'video') await requireVideoReady(scope.researchObjectId, check);
  const pending = saved ? latestPending(storage, scope, saved, input.identityError)
    : loadPendingHermesRunStart(storage, scope) ?? { key: crypto.randomUUID(), generation: input.generation, savedAt: Date.now(), phase: 'source' };
  if (pending.runId) {
    const result = await getHermesResearchRun(scope.researchObjectId, pending.runId);
    check();
    if (result.run.id !== pending.runId) throw new Error(input.identityError);
    return verify(result.run);
  }
  if (!savePendingHermesRunStart(storage, scope, pending)) throw new Error(input.storageError);
  check();
  const prepared = await prepareHermesNarrativeSource({ scope, pending, storage,
    isCurrent: input.isCurrent, identityError: input.identityError, storageError: input.storageError });
  check();
  if (prepared.pending.runId) {
    const result = await getHermesResearchRun(prepared.scope.researchObjectId, prepared.pending.runId);
    check();
    if (result.run.id !== prepared.pending.runId) throw new Error(input.identityError);
    return verify(result.run, prepared.scope);
  }
  const preparedExisting = await getExistingHermesResearchRun(prepared.scope.researchObjectId, prepared.scope.ingestionTaskId, undefined, prepared.scope.output);
  check();
  if (preparedExisting.run) return verify(preparedExisting.run, prepared.scope);
  if (prepared.scope.output === 'video') await requireVideoReady(prepared.scope.researchObjectId, check);
  const { run } = await createHermesResearchRun(prepared.scope.researchObjectId, [prepared.scope.ingestionTaskId], prepared.pending.key, prepared.pending.generation);
  check();
  verify(run, prepared.scope);
  savePendingHermesRunStart(storage, prepared.scope, { ...prepared.pending, runId: run.id });
  return run;
}
