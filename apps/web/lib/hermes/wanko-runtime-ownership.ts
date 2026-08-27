interface WankoMotionTarget {
  group: string;
  index: number;
}

export interface WankoMotionSwitch {
  acceptedAction(): string;
  dispose(): void;
  request(actionKey: string, target: WankoMotionTarget | null, priority: number): void;
  settled(): Promise<void>;
}

type StartMotion = (group: string, index: number, priority: number) => Promise<boolean>;

const wankoAbortError = () => new DOMException('Wanko Live2D initialization aborted', 'AbortError');

export function createWankoMotionSwitch(
  startMotion: StartMotion,
  interruptMotions: () => void,
  forcePriority: number,
  setIdleMotionEnabled: (enabled: boolean) => void = () => {},
): WankoMotionSwitch {
  let acceptedActionKey = '';
  let disposed = false;
  let generation = 0;
  let explicitSettle = false;
  let requestedActionKey = '';
  let pending: Promise<void> = Promise.resolve();

  const request = (actionKey: string, target: WankoMotionTarget | null, priority: number) => {
    if (disposed || actionKey === acceptedActionKey || actionKey === requestedActionKey) return;
    const requestGeneration = ++generation;
    if (!target) {
      explicitSettle = true;
      requestedActionKey = '';
      setIdleMotionEnabled(false);
      interruptMotions();
      acceptedActionKey = actionKey;
      pending = Promise.resolve();
      return;
    }
    explicitSettle = false;
    setIdleMotionEnabled(true);
    requestedActionKey = actionKey;
    pending = (async () => {
      let accepted = await startMotion(target.group, target.index, priority);
      if (disposed || requestGeneration !== generation) {
        if (!disposed && accepted && explicitSettle) interruptMotions();
        return;
      }
      if (!accepted) {
        interruptMotions();
        accepted = await startMotion(target.group, target.index, forcePriority);
      }
      if (disposed || requestGeneration !== generation) {
        if (!disposed && accepted && explicitSettle) interruptMotions();
        return;
      }
      requestedActionKey = '';
      if (accepted) acceptedActionKey = actionKey;
    })().catch(() => {
      if (requestGeneration === generation) requestedActionKey = '';
    });
  };

  return {
    acceptedAction: () => acceptedActionKey,
    dispose() {
      disposed = true;
      generation += 1;
      explicitSettle = false;
      requestedActionKey = '';
    },
    request,
    settled: () => pending,
  };
}

export async function claimAbortableWankoResource<T>(
  pendingResource: Promise<T>,
  signal: AbortSignal | undefined,
  dispose: (resource: T) => void,
): Promise<T> {
  if (signal?.aborted) {
    void pendingResource.then(dispose, () => undefined);
    throw wankoAbortError();
  }
  let claimed = false;
  const guardedResource = pendingResource.then((resource) => {
    if (signal?.aborted && !claimed) dispose(resource);
    return resource;
  });
  if (!signal) {
    const resource = await guardedResource;
    claimed = true;
    return resource;
  }
  let rejectAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort?.(wankoAbortError());
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const resource = await Promise.race([guardedResource, aborted]);
    if (signal.aborted) {
      dispose(resource);
      throw wankoAbortError();
    }
    claimed = true;
    return resource;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
