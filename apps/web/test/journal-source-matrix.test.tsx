import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('journal source rights matrix', () => {
  it('sends a revision-bound same-locator rebind with license and expiry evidence', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf-token') return Promise.resolve(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ sources: [], capability: {}, articleRevision: 9 }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { updateJournalArticleSourceRights } = await import('../lib/journal-api');
    const update = {
      revision: 8,
      rightsStatus: 'internal_processing_only' as const,
      sourceConfidence: 'verified' as const,
      permissions: {
        internalProcessing: true,
        derivativeGeneration: true,
        publicSource: false,
        publicDerivative: false,
        externalProcessing: true,
        figureReuse: false,
        derivativeIllustration: false,
      },
      evidence: { statement: 'contract on file', license: 'CC BY 4.0', expiresAt: '2027-01-01T00:00:00.000Z' },
      notes: 'contract on file',
      activeForGeneration: true,
    };
    await updateJournalArticleSourceRights('journal-1', 'article-1', 'source-1', update);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/journals/journal-1/articles/article-1/sources/source-1/rights',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(update) }),
    );
  });
});
