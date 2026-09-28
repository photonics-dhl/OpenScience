import { ApiClientError, getCurrentUser, getExistingHermesResearchRun, getIngestionTask, type IngestionTaskDetail } from './api';

export type IngestionReviewUpdate =
  | { state: 'scope_mismatch' }
  | { state: 'version_changed' }
  | { state: 'pending'; detail: IngestionTaskDetail }
  | { state: 'unavailable'; detail: IngestionTaskDetail }
  | { state: 'ready'; detail: IngestionTaskDetail; userId: string; runId?: string };

/** Read-only polling for the editor's selected ingestion source. */
export function startIngestionReviewPolling(
  scope: { researchObjectId: string; taskId: string; artifactId: string; version: number },
  callbacks: { onUpdate: (update: IngestionReviewUpdate) => void; onError: (cause: unknown) => void; onSettled: () => void },
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const schedule = (delay: number) => {
    if (!controller.signal.aborted) timer = setTimeout(() => { void read(); }, delay);
  };
  const read = async () => {
    try {
      const detail = await getIngestionTask(scope.taskId, controller.signal);
      if (controller.signal.aborted) return;
      if (detail?.researchObjectId !== scope.researchObjectId || detail.task?.id !== scope.taskId || detail.task.artifactId !== scope.artifactId) {
        callbacks.onUpdate({ state: 'scope_mismatch' }); return;
      }
      if (detail.version !== scope.version) { callbacks.onUpdate({ state: 'version_changed' }); return; }
      if (['queued', 'uploading', 'stored', 'parsing'].includes(detail.task.state)) {
        failures = 0;
        callbacks.onUpdate({ state: 'pending', detail });
        schedule(1500);
      } else if (detail.task.state !== 'needs_review') callbacks.onUpdate({ state: 'unavailable', detail });
      else {
        const [viewer, existing] = await Promise.all([
          getCurrentUser(), getExistingHermesResearchRun(scope.researchObjectId, scope.taskId, controller.signal),
        ]);
        if (!controller.signal.aborted) callbacks.onUpdate({ state: 'ready', detail, userId: viewer.userId, ...(existing.run ? { runId: existing.run.id } : {}) });
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      callbacks.onError(cause);
      const transient = cause instanceof TypeError || (cause instanceof ApiClientError
        && (cause.status === 0 || cause.status === 408 || cause.status === 429 || (cause.status >= 500 && cause.status < 600)));
      if (transient) {
        const delay = Math.min(30_000, 2000 * 2 ** failures);
        failures = Math.min(failures + 1, 4);
        schedule(Math.max(delay, cause instanceof ApiClientError ? cause.retryAfterMs ?? 0 : 0));
      }
    } finally { if (!controller.signal.aborted) callbacks.onSettled(); }
  };
  void read();
  return () => { controller.abort(); if (timer !== undefined) clearTimeout(timer); };
}
