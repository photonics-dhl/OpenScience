import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { createManagedStyleOperation, discardRejectedManagedStyleOperation, loadManagedStyleOperation, managedStyleStorageKey,
  saveManagedStyleOperation, submitManagedStyleOperation } from '../lib/presentation/managed-illustration-style';

vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(),
  createHermesArtStyleContinuation: vi.fn(), getCurrentUser: vi.fn(), getHermesResearchRun: vi.fn() }));
const scope = { actorId: 'author', researchObjectId: 'ro', versionId: 'version', imageAssetId: 'image-2', storyboardAssetId: 'plan', sceneIndex: 2 };
const capability: api.HermesArtStyleCapability = { ...scope, runId: 'exact-parent', expectedVersion: 8, maxAgentTasks: 2,
  choices: [{ styleId: 'article:watercolor', name: 'Watercolor', reason: 'Shows this relation.' }] };
const run = { id: 'child', actorId: scope.actorId, researchObjectId: scope.researchObjectId, versionId: scope.versionId } as api.HermesResearchRun;
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } } as Storage;
  const operation = createManagedStyleOperation(scope, capability, 'article:watercolor');
  return { storage, operation };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getCurrentUser).mockResolvedValue({ userId: scope.actorId, platformRole: 'user' } as api.CurrentUser);
  vi.mocked(api.createHermesArtStyleContinuation).mockResolvedValue({ run, taskIds: { storyboard: 'plan-task', sceneImage: null } });
  vi.mocked(api.getHermesResearchRun).mockResolvedValue({ run });
});

it('persists exact payload and key before the ordinary-author POST, preserving selected scene 2', async () => {
  const { storage, operation } = fixture();
  vi.mocked(api.createHermesArtStyleContinuation).mockImplementationOnce(async () => {
    expect(loadManagedStyleOperation(storage, scope)).toEqual(operation);
    return { run, taskIds: { storyboard: 'plan-task', sceneImage: null } };
  });
  expect(await submitManagedStyleOperation(operation, storage, () => true)).toEqual(run);
  expect(api.getCurrentUser).toHaveBeenCalledWith({ fresh: true });
  expect(api.createHermesArtStyleContinuation).toHaveBeenCalledWith('ro', 'exact-parent', {
    expectedVersion: 8, versionId: 'version', imageAssetId: 'image-2', sceneIndex: 2, style: 'article:watercolor',
  }, operation.key, undefined);
  expect(loadManagedStyleOperation(storage, scope)?.childRunId).toBe('child');
});

it('restores a lost response with exactly the same key and payload without needing renewed capability', async () => {
  const { storage, operation } = fixture();
  vi.mocked(api.createHermesArtStyleContinuation).mockRejectedValueOnce(new Error('response lost'));
  await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow('response lost');
  const restored = loadManagedStyleOperation(storage, scope)!;
  // No load/effect submits anything, and no capability lookup is required to replay this receipt.
  expect(api.createHermesArtStyleContinuation).toHaveBeenCalledTimes(1);
  await submitManagedStyleOperation(restored, storage, () => true);
  expect(vi.mocked(api.createHermesArtStyleContinuation).mock.calls[1]).toEqual(vi.mocked(api.createHermesArtStyleContinuation).mock.calls[0]);
});

it('reopens the accepted child through the existing run read without another POST', async () => {
  const { storage, operation } = fixture();
  await submitManagedStyleOperation(operation, storage, () => true);
  await submitManagedStyleOperation(loadManagedStyleOperation(storage, scope)!, storage, () => true);
  expect(api.getHermesResearchRun).toHaveBeenCalledWith('ro', 'child', undefined);
  expect(api.createHermesArtStyleContinuation).toHaveBeenCalledTimes(1);
});

it('does not replace an unresolved request but allocates a new key for a later selection', async () => {
  const { storage, operation } = fixture();
  saveManagedStyleOperation(storage, operation);
  const next = createManagedStyleOperation(scope, capability, 'article:watercolor');
  expect(next.key).not.toBe(operation.key);
  expect(() => saveManagedStyleOperation(storage, next)).toThrow('styleStorageError');
  await submitManagedStyleOperation(operation, storage, () => true);
  expect(() => saveManagedStyleOperation(storage, next)).not.toThrow();
});

it('allows explicit reset only after a known no-mutation CAS rejection, then uses fresh version and key', async () => {
  const { storage, operation } = fixture();
  vi.mocked(api.createHermesArtStyleContinuation).mockRejectedValueOnce(new api.ApiClientError('CONCURRENT_UPDATE', 'Parent run changed', 409));
  await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow('managedRequestStale');
  const restored = loadManagedStyleOperation(storage, scope)!;
  expect(restored.rejection).toBe('concurrent_update');
  await expect(submitManagedStyleOperation(restored, storage, () => true)).rejects.toThrow('managedRequestStale');
  expect(api.createHermesArtStyleContinuation).toHaveBeenCalledTimes(1);
  discardRejectedManagedStyleOperation(storage, restored);
  const fresh = createManagedStyleOperation(scope, { ...capability, expectedVersion: 9 }, 'article:watercolor');
  expect(fresh.key).not.toBe(operation.key);
  await submitManagedStyleOperation(fresh, storage, () => true);
  expect(vi.mocked(api.createHermesArtStyleContinuation).mock.calls[1][2].expectedVersion).toBe(9);
});

it.each([['IDEMPOTENCY_CONFLICT', 409], ['CONCURRENT_UPDATE', 500], ['NETWORK_ERROR', 0]] as const)(
  'does not discard uncertain or unrelated errors (%s/%s)', async (code, status) => {
    const { storage, operation } = fixture();
    vi.mocked(api.createHermesArtStyleContinuation).mockRejectedValueOnce(new api.ApiClientError(code, 'Failure', status));
    await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow('Failure');
    expect(loadManagedStyleOperation(storage, scope)?.rejection).toBeUndefined();
    expect(() => discardRejectedManagedStyleOperation(storage, operation)).toThrow('styleStorageError');
    expect(loadManagedStyleOperation(storage, scope)?.key).toBe(operation.key);
  });

it('blocks a fresh actor mismatch, changed scope and failed storage before any POST', async () => {
  const { storage, operation } = fixture();
  vi.mocked(api.getCurrentUser).mockResolvedValueOnce({ userId: 'other' } as api.CurrentUser);
  await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow('styleScopeChanged');
  await expect(submitManagedStyleOperation(operation, storage, () => false)).rejects.toThrow('styleScopeChanged');
  storage.setItem = () => { throw new Error('storage disabled'); };
  await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow();
  expect(api.createHermesArtStyleContinuation).not.toHaveBeenCalled();
});

it('rejects mismatched discovery and corrupt or foreign recovery records', () => {
  const { storage, operation } = fixture();
  for (const changed of [{ imageAssetId: 'different' }, { storyboardAssetId: 'different' }, { sceneIndex: 0 }, { versionId: 'different' }]) {
    expect(() => createManagedStyleOperation(scope, { ...capability, ...changed }, 'article:watercolor')).toThrow('styleScopeChanged');
  }
  expect(() => createManagedStyleOperation(scope, capability, 'unoffered')).toThrow('styleScopeChanged');
  saveManagedStyleOperation(storage, operation);
  expect(loadManagedStyleOperation(storage, { ...scope, actorId: 'other' })).toBeUndefined();
  storage.setItem(managedStyleStorageKey(scope), JSON.stringify({ ...operation, payload: { ...operation.payload, sceneIndex: 0 } }));
  expect(() => loadManagedStyleOperation(storage, scope)).toThrow('styleStorageError');
});

it('locks concurrent clicks and does not accept a late result after account/view change', async () => {
  const { storage, operation } = fixture();
  let current = true;
  let finishIdentity!: (value: api.CurrentUser) => void;
  vi.mocked(api.getCurrentUser).mockImplementationOnce(() => new Promise(resolve => { finishIdentity = resolve; }));
  const first = submitManagedStyleOperation(operation, storage, () => current);
  await expect(submitManagedStyleOperation(operation, storage, () => current)).rejects.toThrow('styleOperationBusy');
  current = false;
  finishIdentity({ userId: scope.actorId, platformRole: 'user' } as api.CurrentUser);
  await expect(first).rejects.toThrow('styleScopeChanged');
  expect(api.createHermesArtStyleContinuation).not.toHaveBeenCalled();
});

it('does not route to a foreign child or record a result after the scope changes in flight', async () => {
  const { storage, operation } = fixture();
  vi.mocked(api.createHermesArtStyleContinuation).mockResolvedValueOnce({ run: { ...run, actorId: 'other' }, taskIds: { storyboard: 'task', sceneImage: null } });
  await expect(submitManagedStyleOperation(operation, storage, () => true)).rejects.toThrow('styleScopeChanged');
  expect(loadManagedStyleOperation(storage, scope)?.childRunId).toBeUndefined();
  let current = true;
  vi.mocked(api.createHermesArtStyleContinuation).mockImplementationOnce(async () => {
    current = false; return { run, taskIds: { storyboard: 'task', sceneImage: null } };
  });
  await expect(submitManagedStyleOperation(operation, storage, () => current)).rejects.toThrow('styleScopeChanged');
  expect(loadManagedStyleOperation(storage, scope)?.childRunId).toBeUndefined();
});
