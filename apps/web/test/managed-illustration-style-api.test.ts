import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('discovers the exact displayed image and posts the bounded continuation with CSRF and a fixed key', async () => {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/csrf-token'
    ? { csrfToken: 'csrf' } : { styleContinuation: null, run: { id: 'child' }, taskIds: { storyboard: 'plan', sceneImage: null } }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../lib/api');
  await api.getHermesImageArtStyleCapability('ro/one', 'v 1', 'displayed/image');
  const body = { expectedVersion: 4, versionId: 'v 1', imageAssetId: 'displayed/image', sceneIndex: 2, style: 'article:watercolor' };
  await api.createHermesArtStyleContinuation('ro/one', 'exact/run', body, 'fixed-request');
  const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(calls[0][0]).toBe('/api/research-objects/ro%2Fone/hermes-art-style-capability?versionId=v+1&imageAssetId=displayed%2Fimage');
  expect(calls[0][1].cache).toBe('no-store');
  const writes = calls.filter(([, init]) => init.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe('/api/research-objects/ro%2Fone/hermes-runs/exact%2Frun/art-style-continuations');
  expect(JSON.parse(writes[0][1].body as string)).toEqual(body);
  expect(writes[0][1].headers).toMatchObject({ 'idempotency-key': 'fixed-request', 'x-csrf-token': 'csrf' });
});
