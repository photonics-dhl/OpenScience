import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('sends the selected research type and declared publication details through the real API client', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-create' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ researchObject: { id: 'paper', version: 1 } })));
  vi.stubGlobal('fetch', fetchMock);
  const { createResearchObject } = await import('../lib/api');
  const sdf = { core: { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '',
    researchType: 'published', originalAuthors: 'A. Researcher', originalJournal: 'A Journal', originalDoi: '10.1234/example' } };
  await createResearchObject({ workspaceId: 'workspace', title: 'A paper', sdf }, 'create-key');
  const [url, request] = fetchMock.mock.calls[1]!;
  expect(url).toBe('/api/research-objects');
  expect(JSON.parse(request.body)).toEqual({ workspaceId: 'workspace', title: 'A paper', sdf });
  expect(new Headers(request.headers).get('idempotency-key')).toBe('create-key');
});
