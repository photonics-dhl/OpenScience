import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('journal reviewed actions', () => {
  it('sends revision-bound reviewer and publish commands with explicit human confirmation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/csrf-token') return Promise.resolve(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ article: {}, release: { versionNo: 2, publicId: 'OSR-1', url: '/research/OSR-1/v/2' } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { assignJournalReviewer, previewJournalDois, publishJournalArticle, reviewAdminServiceRequest } = await import('../lib/journal-api');
    await assignJournalReviewer('journal-1', 'article-1', { revision: 4, reviewerId: 'reviewer-1' });
    await previewJournalDois('journal-1', ['10.1000/a']);
    await reviewAdminServiceRequest('service-1', { status: 'quoted', expectedStatus: 'submitted', note: '方案已发送' });
    await publishJournalArticle('journal-1', 'article-1', { revision: 5, requestKey: 'publish-5' });
    expect(fetchMock).toHaveBeenCalledWith('/api/journals/journal-1/articles/article-1/reviewer', expect.objectContaining({ method: 'POST', body: JSON.stringify({ revision: 4, reviewerId: 'reviewer-1' }) }));
    expect(fetchMock).toHaveBeenCalledWith('/api/journals/journal-1/articles/preview', expect.objectContaining({ method: 'POST', body: JSON.stringify({ dois: ['10.1000/a'] }) }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/journals/service-requests/service-1/review', expect.objectContaining({ method: 'POST', body: JSON.stringify({ status: 'quoted', expectedStatus: 'submitted', note: '方案已发送' }) }));
    expect(fetchMock).toHaveBeenCalledWith('/api/journals/journal-1/articles/article-1/publish', expect.objectContaining({ method: 'POST', body: JSON.stringify({ revision: 5, requestKey: 'publish-5', humanConfirmed: true }) }));
  });
});
