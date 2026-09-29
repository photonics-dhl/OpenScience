import { ApiClientError, createHermesArtStyleContinuation, getCurrentUser, getHermesResearchRun,
  type HermesArtStyleCapability, type HermesArtStyleContinuationRequest, type HermesResearchRun } from '@/lib/api';

export interface ManagedStyleScope {
  actorId: string;
  researchObjectId: string;
  versionId: string;
  imageAssetId: string;
  storyboardAssetId: string;
  sceneIndex: number;
}
export interface ManagedStyleOperation {
  scope: ManagedStyleScope;
  runId: string;
  key: string;
  payload: HermesArtStyleContinuationRequest;
  childRunId?: string;
  rejection?: 'concurrent_update';
}
export const managedStyleStorageKey = (scope: ManagedStyleScope) => `openscience:managed-image-style:${JSON.stringify([
  scope.actorId, scope.researchObjectId, scope.versionId, scope.imageAssetId, scope.storyboardAssetId, scope.sceneIndex,
])}`;
const inFlight = new Set<string>();

export function matchesManagedStyleCapability(scope: ManagedStyleScope, capability: HermesArtStyleCapability): boolean {
  return capability.versionId === scope.versionId && capability.imageAssetId === scope.imageAssetId
    && capability.storyboardAssetId === scope.storyboardAssetId && capability.sceneIndex === scope.sceneIndex
    && capability.maxAgentTasks === 2 && Number.isInteger(capability.expectedVersion) && capability.expectedVersion > 0;
}

export function createManagedStyleOperation(scope: ManagedStyleScope, capability: HermesArtStyleCapability, style: string): ManagedStyleOperation {
  if (!matchesManagedStyleCapability(scope, capability) || !capability.choices.some(choice => choice.styleId === style))
    throw new Error('styleScopeChanged');
  return { scope: { ...scope }, runId: capability.runId, key: crypto.randomUUID(), payload: {
    expectedVersion: capability.expectedVersion, versionId: scope.versionId,
    imageAssetId: scope.imageAssetId, sceneIndex: scope.sceneIndex, style,
  } };
}

export function loadManagedStyleOperation(storage: Storage, scope: ManagedStyleScope): ManagedStyleOperation | undefined {
  const raw = storage.getItem(managedStyleStorageKey(scope));
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as ManagedStyleOperation;
    const body = value.payload;
    if (!value.scope || managedStyleStorageKey(value.scope) !== managedStyleStorageKey(scope)
      || !value.runId || typeof value.runId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(value.key)
      || !body || Object.keys(body).sort().join(',') !== 'expectedVersion,imageAssetId,sceneIndex,style,versionId'
      || body.versionId !== scope.versionId || body.imageAssetId !== scope.imageAssetId || body.sceneIndex !== scope.sceneIndex
      || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || typeof body.style !== 'string' || !body.style.trim()
      || (value.childRunId !== undefined && (typeof value.childRunId !== 'string' || !value.childRunId))
      || (value.rejection !== undefined && (value.rejection !== 'concurrent_update' || Boolean(value.childRunId)))) throw new Error();
    return value;
  } catch { throw new Error('styleStorageError'); }
}

/** Explicit local reset only after the server's transactional no-mutation rejection. */
export function discardRejectedManagedStyleOperation(storage: Storage, operation: ManagedStyleOperation): void {
  const saved = loadManagedStyleOperation(storage, operation.scope);
  if (saved?.key !== operation.key || saved.rejection !== 'concurrent_update' || saved.childRunId)
    throw new Error('styleStorageError');
  const key = managedStyleStorageKey(operation.scope);
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw new Error('styleStorageError');
}

export function saveManagedStyleOperation(storage: Storage, operation: ManagedStyleOperation): void {
  const prior = loadManagedStyleOperation(storage, operation.scope);
  // A new selection must never replace an unresolved, possibly accepted POST.
  if (prior && !prior.childRunId && (prior.key !== operation.key || prior.runId !== operation.runId
    || JSON.stringify(prior.payload) !== JSON.stringify(operation.payload))) throw new Error('styleStorageError');
  const key = managedStyleStorageKey(operation.scope), text = JSON.stringify(operation);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text) throw new Error('styleStorageError');
}

/** Called only on an explicit click. Resume intentionally does not rediscover capabilities. */
export async function submitManagedStyleOperation(operation: ManagedStyleOperation, storage: Storage,
  isCurrent: () => boolean, signal?: AbortSignal): Promise<HermesResearchRun> {
  const identity = managedStyleStorageKey(operation.scope);
  if (inFlight.has(identity)) throw new Error('styleOperationBusy');
  inFlight.add(identity);
  const check = () => { if (!isCurrent() || signal?.aborted) throw new Error('styleScopeChanged'); };
  const verify = (run: HermesResearchRun) => {
    if (!run.id || run.id === operation.runId || run.actorId !== operation.scope.actorId
      || run.researchObjectId !== operation.scope.researchObjectId || run.versionId !== operation.scope.versionId)
      throw new Error('styleScopeChanged');
    return run;
  };
  try {
    check();
    if (operation.rejection) throw new Error('managedRequestStale');
    const viewer = await getCurrentUser({ fresh: true });
    check();
    if (viewer.userId !== operation.scope.actorId) throw new Error('styleScopeChanged');
    if (operation.childRunId) {
      const result = await getHermesResearchRun(operation.scope.researchObjectId, operation.childRunId, signal);
      check();
      if (result.run.id !== operation.childRunId) throw new Error('styleScopeChanged');
      return verify(result.run);
    }
    // Both the key and exact request survive a reload, transport loss or changed capability.
    saveManagedStyleOperation(storage, operation);
    check();
    let result;
    try {
      result = await createHermesArtStyleContinuation(operation.scope.researchObjectId, operation.runId,
        operation.payload, operation.key, signal);
    } catch (error) {
      check();
      // Backend checks an existing receipt before CAS. This exact 409 rolls
      // back the creation transaction; other conflicts/transport errors do not.
      if (error instanceof ApiClientError && error.status === 409 && error.code === 'CONCURRENT_UPDATE') {
        saveManagedStyleOperation(storage, { ...operation, rejection: 'concurrent_update' });
        operation.rejection = 'concurrent_update';
        throw new Error('managedRequestStale');
      }
      throw error;
    }
    check(); verify(result.run);
    operation.childRunId = result.run.id;
    saveManagedStyleOperation(storage, operation);
    return result.run;
  } finally { inFlight.delete(identity); }
}
