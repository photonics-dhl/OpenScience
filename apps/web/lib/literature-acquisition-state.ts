import type { ApiClientError, AgentTaskView } from './api';

const STORAGE_PREFIX = 'openscience:literature:';
const NORMAL_POLL_DELAY_MS = 1_200;
const TRANSIENT_BACKOFF_MS = [1_200, 2_400, 4_800, 9_600, 15_000] as const;

type LiteratureTarget = 'personal' | `research-object:${string}`;
type IntentNamespace = { userId: string; target: LiteratureTarget };
type IntentContext = IntentNamespace & { input: { query: string; identifier?: string }; intentFingerprint?: string };
type PendingIntentOutcome = { kind: 'accepted' | 'recovered' } | { kind: 'failure'; status?: number };

function storageKey({ userId, target }: IntentNamespace): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${target}:pending:v1`;
}

export async function createLiteratureIntentFingerprint(input: IntentContext['input']): Promise<string> {
  const canonical = JSON.stringify({ query: input.query.trim(), identifier: input.identifier?.trim() ?? null });
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function acquirePendingLiteratureIntent(
  storage: Storage,
  context: IntentContext,
  createKey: () => string,
): Promise<{ status: 'ready'; key: string } | { status: 'blocked' }> {
  const key = storageKey(context);
  const fingerprint = context.intentFingerprint ?? await createLiteratureIntentFingerprint(context.input);
  const raw = storage.getItem(key);
  if (raw) {
    try {
      const pending = JSON.parse(raw) as { version?: unknown; key?: unknown; intentFingerprint?: unknown };
      if (pending.version === 1 && typeof pending.key === 'string' && typeof pending.intentFingerprint === 'string') {
        return pending.intentFingerprint === fingerprint ? { status: 'ready', key: pending.key } : { status: 'blocked' };
      }
    } catch { /* A corrupt browser record has no authority. */ }
    storage.removeItem(key);
  }
  const callerKey = createKey();
  storage.setItem(key, JSON.stringify({ version: 1, key: callerKey, intentFingerprint: fingerprint }));
  return { status: 'ready', key: callerKey };
}

function isAmbiguousSubmissionFailure(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function settlePendingLiteratureIntent(
  storage: Storage,
  context: IntentNamespace,
  outcome: PendingIntentOutcome,
): void {
  if (outcome.kind !== 'failure' || !isAmbiguousSubmissionFailure(outcome.status)) {
    storage.removeItem(storageKey(context));
  }
}

export function clearAllPendingLiteratureIntents(storage: Storage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key);
  }
}

function errorStatus(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof (error as ApiClientError).status === 'number'
    ? (error as ApiClientError).status
    : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isTransientPollFailure(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function startLiteratureTaskPolling<T extends Pick<AgentTaskView, 'status'>>(options: {
  taskId: string;
  getTask: (taskId: string, signal: AbortSignal) => Promise<T>;
  onTask: (task: T) => void;
  onReconnecting: (reconnecting: boolean) => void;
  onPermanentError?: (status: number) => void;
}): () => void {
  let stopped = false;
  let transientFailures = 0;
  let reconnecting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const schedule = (delay: number) => {
    timer = setTimeout(() => { void poll(); }, delay);
  };
  const poll = async () => {
    timer = undefined;
    const currentController = new AbortController();
    controller = currentController;
    try {
      const task = await options.getTask(options.taskId, currentController.signal);
      if (stopped) return;
      transientFailures = 0;
      if (reconnecting) {
        reconnecting = false;
        options.onReconnecting(false);
      }
      options.onTask(task);
      if (task.status === 'pending' || task.status === 'running') schedule(NORMAL_POLL_DELAY_MS);
    } catch (error) {
      if (stopped || isAbortError(error)) return;
      const status = errorStatus(error);
      if (!isTransientPollFailure(status)) {
        if (reconnecting) options.onReconnecting(false);
        if (status !== undefined) options.onPermanentError?.(status);
        return;
      }
      transientFailures += 1;
      if (!reconnecting) {
        reconnecting = true;
        options.onReconnecting(true);
      }
      schedule(TRANSIENT_BACKOFF_MS[Math.min(transientFailures - 1, TRANSIENT_BACKOFF_MS.length - 1)]!);
    } finally {
      if (controller === currentController) controller = undefined;
    }
  };

  schedule(NORMAL_POLL_DELAY_MS);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    controller?.abort();
  };
}
