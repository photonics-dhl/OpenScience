import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceBindingFileId, sourceBindingIssue } from '../components/journals/JournalSourceRightsMatrix';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('journal source rights matrix', () => {
  it('binds an active uploaded PDF to the current article file without granting rights', () => {
    const current = { kind: 'fulltext' as const, label: 'Uploaded paper', url: 'https://example.test/paper', artifactId: 'artifact-current' };
    expect(sourceBindingIssue(current, 'editor_uploaded_pdf', '', true)).toBeNull();
    expect(sourceBindingFileId(current, true)).toBe('artifact-current');
    expect(sourceBindingFileId(current, false)).toBeUndefined();
    expect(sourceBindingIssue(current, 'abstract', '', true)).toMatch(/材料类型/);
    expect(sourceBindingIssue(current, 'editor_uploaded_pdf', 'https://elsewhere.test/paper', true)).toMatch(/网址不一致/);
  });

  it('requires exact current URL for an active URL-backed source', () => {
    const current = { kind: 'fulltext' as const, label: 'Publisher text', url: 'https://example.test/paper' };
    expect(sourceBindingIssue(current, 'publisher_full_text', 'https://example.test/paper', true)).toBeNull();
    expect(sourceBindingIssue(current, 'publisher_full_text', 'https://elsewhere.test/paper', true)).toMatch(/完全一致/);
    expect(sourceBindingIssue(current, 'publisher_full_text', '', true)).toMatch(/完全一致/);
    expect(sourceBindingFileId(current, true)).toBeUndefined();
    expect(sourceBindingIssue({ ...current, kind: 'metadata' }, 'publisher_full_text', current.url, true)).toMatch(/书目信息/);
    expect(sourceBindingIssue(current, 'publisher_full_text', 'https://elsewhere.test/paper', false)).toBeNull();
  });

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
