import { createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun, getIngestionTask,
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
  const detail = await getIngestionTask(input.scope.ingestionTaskId);
  check();
  if (!isConfirmedIngestionReanalysisSource(detail.task) || hasCurrentScientificReview(detail.task.result)) {
    return { scope: input.scope, pending: input.pending };
  }
  if (!detail.task.agentTaskId) throw new Error(input.identityError);
  const sourceReanalysisKey = input.pending.sourceReanalysisKey ?? crypto.randomUUID();
  const pendingWithKey = { ...input.pending, sourceReanalysisKey };
  if (!input.pending.sourceReanalysisKey
    && !savePendingHermesRunStart(input.storage, input.scope, pendingWithKey)) throw new Error(input.storageError);
  const task = await reanalyzeConfirmedIngestion(input.scope.ingestionTaskId, detail.task.agentTaskId, sourceReanalysisKey);
  check();
  if (!task.id || task.id === input.scope.ingestionTaskId) throw new Error(input.identityError);
  const scope = { ...input.scope, ingestionTaskId: task.id };
  const pending = { ...pendingWithKey, runId: undefined };
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
  const existing = await getExistingHermesResearchRun(scope.researchObjectId, scope.ingestionTaskId, undefined, scope.output);
  check();
  const verify = (run: HermesResearchRun) => {
    if (run.actorId !== scope.userId || run.researchObjectId !== scope.researchObjectId || !hasHermesRunOutput(run, scope.output)
      || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === scope.ingestionTaskId))
      throw new Error(input.identityError);
    return run;
  };
  if (existing.run) return verify(existing.run);
  // Preserve an uncertain submission's original scope, payload and key on every retry.
  const pending = loadPendingHermesRunStart(storage, scope)
    ?? { key: crypto.randomUUID(), generation: input.generation, savedAt: Date.now() };
  if (!savePendingHermesRunStart(storage, scope, pending)) throw new Error(input.storageError);
  check();
  const prepared = await prepareHermesNarrativeSource({ scope, pending, storage,
    isCurrent: input.isCurrent, identityError: input.identityError, storageError: input.storageError });
  check();
  const { run } = await createHermesResearchRun(prepared.scope.researchObjectId, [prepared.scope.ingestionTaskId], prepared.pending.key, prepared.pending.generation);
  check();
  if (run.actorId !== prepared.scope.userId || run.researchObjectId !== prepared.scope.researchObjectId || !hasHermesRunOutput(run, prepared.scope.output)
    || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === prepared.scope.ingestionTaskId))
    throw new Error(input.identityError);
  savePendingHermesRunStart(storage, prepared.scope, { ...prepared.pending, runId: run.id });
  return run;
}
