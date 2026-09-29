import { createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun, type HermesNarrativeGeneration, type HermesResearchRun } from '@/lib/api';
import { loadPendingHermesRunStart, savePendingHermesRunStart, type HermesRunStartScope } from './draft-state';

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
  const viewer = await getCurrentUser({ fresh: true });
  check();
  if (viewer.userId !== scope.userId) throw new Error(input.identityError);
  const existing = await getExistingHermesResearchRun(scope.researchObjectId, scope.ingestionTaskId);
  check();
  const verify = (run: HermesResearchRun) => {
    if (run.actorId !== scope.userId || run.researchObjectId !== scope.researchObjectId
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
  const { run } = await createHermesResearchRun(scope.researchObjectId, [scope.ingestionTaskId], pending.key, pending.generation);
  check();
  verify(run);
  savePendingHermesRunStart(storage, scope, { ...pending, runId: run.id });
  return run;
}
