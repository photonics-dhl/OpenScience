import { describe, expect, it, vi } from 'vitest';
import { createSemanticScholarAdapter } from '../../src/retrieval/semantic-scholar';

describe('Semantic Scholar retrieval adapter', () => {
  it('requests bounded explicit fields and normalizes provider data', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      total: 1,
      data: [{
        paperId: 'paper-1',
        title: 'Ultrafast transfer',
        abstract: 'A measured transfer.',
        year: 2026,
        venue: 'Open Science',
        citationCount: 7,
        authors: [{ authorId: 'a1', name: 'Ada Researcher' }],
        externalIds: { DOI: '10.1000/example', ArXiv: '2601.00001' },
        url: 'https://www.semanticscholar.org/paper/paper-1',
        isOpenAccess: true,
        openAccessPdf: { url: 'https://repository.example/paper.pdf', status: 'GOLD', license: 'CC-BY-4.0' },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = createSemanticScholarAdapter({ apiKey: 'test-key', fetchImpl, minimumIntervalMs: 0 });

    const result = await adapter.search({ query: ' ultrafast transfer ', limit: 3 });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected success');
    expect(result.sources[0]).toMatchObject({
      provider: 'semantic_scholar',
      providerRecordId: 'paper-1',
      title: 'Ultrafast transfer',
      sourceUrl: 'https://www.semanticscholar.org/paper/paper-1',
      authors: ['Ada Researcher'],
      identifiers: { doi: '10.1000/example', arxiv: '2601.00001' },
      openAccess: { url: 'https://repository.example/paper.pdf', status: 'GOLD', license: 'CC-BY-4.0' },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/graph/v1/paper/search?');
    expect(String(url)).toContain('query=ultrafast+transfer');
    expect(String(url)).toContain('limit=3');
    expect(String(url)).toContain('fields=paperId%2Ctitle%2Cabstract%2Cyear%2Cvenue%2CcitationCount%2Cauthors%2CexternalIds%2Curl%2CisOpenAccess%2CopenAccessPdf');
    expect(new Headers(init?.headers).get('x-api-key')).toBe('test-key');
  });

  it('returns a stable rate-limit state without leaking upstream content', async () => {
    const adapter = createSemanticScholarAdapter({
      fetchImpl: async () => new Response('provider says secret query', { status: 429 }),
      minimumIntervalMs: 0,
    });
    await expect(adapter.search({ query: 'query', limit: 5 })).resolves.toEqual({
      status: 'unavailable', provider: 'semantic_scholar', code: 'rate_limited', retryable: true,
    });
  });
});
