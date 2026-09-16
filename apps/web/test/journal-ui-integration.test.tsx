import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicJournalRelease } from '../components/journals/PublicJournalRelease';
import { journalArticlePermissions } from '../components/journals/JournalArticleWorkbench';
import { shouldOfferHomepageActivation } from '../components/journals/JournalManagementWorkbench';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('journal role screens', () => {
  it('keeps an assigned reviewer read-only while retaining review decisions', () => {
    expect(journalArticlePermissions('reviewer')).toEqual({ edit: false, assign: false, review: true, publish: false });
    expect(journalArticlePermissions('owner')).toEqual({ edit: true, assign: true, review: true, publish: true });
    expect(journalArticlePermissions('editor')).toEqual({ edit: true, assign: false, review: false, publish: false });
  });
  it('offers first homepage publication only for an active unpublished journal', () => {
    expect(shouldOfferHomepageActivation({ status: 'active', homepagePublished: false })).toBe(true);
    expect(shouldOfferHomepageActivation({ status: 'active', homepagePublished: true })).toBe(false);
    expect(shouldOfferHomepageActivation({ status: 'reverification', homepagePublished: false })).toBe(false);
  });
});

describe('public journal derivative screen', () => {
  it('renders original identity, fixed derivative identity, six-field companion content, claims, evidence, FAQ and figure cards', () => {
    const markup = renderToStaticMarkup(createElement(PublicJournalRelease, { value: {
      metadata: { title: 'Original paper', doi: '10.1000/original', authors: ['Ada Author'], publishedDate: '2025-02-03', journalTitle: 'Journal A', originalUrl: 'https://doi.org/10.1000/original' },
      journal: { id: 'journal-1', slug: 'journal-a', name: 'Journal A' },
      versionNo: 3, url: '/research/OSR-1/v/3', publishedAt: '2026-09-15T00:00:00.000Z', license: 'CC BY 4.0',
      source: { kind: 'fulltext', label: 'publisher manuscript', url: 'https://publisher.example/paper' },
      draft: {
        summary: 'A checked derivative summary.', scope: 'fulltext', language: 'en',
        core: { problem: 'p', insight: 'i', method: 'm', results: 'r', limitations: 'l', reproducibility: 'x' },
        claims: [{ text: 'Claim one', kind: 'experimental', evidence: { quote: 'Measured value', locator: 'Results, paragraph 2' } }],
        figures: [{ label: 'Figure 1', purpose: 'Compare groups', finding: 'Group A increased', evidence: { quote: 'Group A increased', locator: 'Figure 1' } }],
        faq: [{ question: 'What changed?', answer: 'Group A increased.', evidence: { quote: 'Group A increased', locator: 'Results' } }],
      },
    } }));
    expect(markup).toContain('data-journal-derivative="true"');
    expect(markup).toContain('application/ld+json');
    expect(markup).toContain('"@type":"CreativeWork"');
    expect(markup).toContain('"isBasedOn":{"@type":"ScholarlyArticle"');
    expect(markup).toContain('DOI 10.1000/original');
    expect(markup).toContain('OpenScience 固定解读版本 v3');
    expect(markup).toContain('Claim one');
    expect(markup).toContain('Measured value');
    expect(markup).toContain('Figure 1');
    expect(markup).toContain('What changed?');
  });
});

describe('journal source upload payload', () => {
  it('uses a protected multipart request with the current revision, request key and selected file', async () => {
    let opened: [string, string] | undefined;
    let sent: FormData | undefined;
    const headers: Record<string, string> = {};
    class FakeXhr {
      status = 200; responseText = JSON.stringify({ job: { id: 'parse-1', state: 'pending' } }); withCredentials = false;
      onerror: (() => void) | null = null; onload: (() => void) | null = null;
      open(method: string, url: string) { opened = [method, url]; }
      setRequestHeader(name: string, value: string) { headers[name] = value; }
      send(body: FormData) { sent = body; this.onload?.(); }
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ csrfToken: 'csrf-journal' }), { status: 200 })));
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const { uploadJournalSourceFile } = await import('../lib/journal-api');
    const file = new File(['paper'], 'paper.md', { type: 'text/markdown' });
    await uploadJournalSourceFile('journal-1', 'article-1', { revision: 7, requestKey: 'upload-7', file });
    expect(opened).toEqual(['POST', '/api/journals/journal-1/articles/article-1/source-file']);
    expect(headers['x-csrf-token']).toBe('csrf-journal');
    expect(sent?.get('revision')).toBe('7');
    expect(sent?.get('requestKey')).toBe('upload-7');
    expect((sent?.get('file') as File).name).toBe('paper.md');
  });
});
