import { describe, expect, it, vi } from 'vitest';
import { executeSourceRetrieval } from '../../src/retrieval/orchestrator';

describe('source retrieval orchestration', () => {
  it('persists normalized sources with provider-neutral rights and no raw provider response', async () => {
    const persist = vi.fn(async ({ source, rights }) => ({
      id: `saved-${source.provider}`, provider: source.provider, title: source.title, sourceUrl: source.sourceUrl, rights,
    }));
    const result = await executeSourceRetrieval({ query: 'ultrafast', providers: ['semantic_scholar', 'tavily'], limit: 2 }, {
      semanticScholar: { search: async () => ({
        status: 'succeeded', provider: 'semantic_scholar', sources: [{
          provider: 'semantic_scholar', providerRecordId: 'p1', title: 'Paper', sourceUrl: 'https://example.org/paper',
          authors: [], identifiers: {}, access: { kind: 'open_access', license: 'CC-BY-4.0' },
        }],
      }) },
      tavily: { search: async () => ({
        status: 'succeeded', provider: 'tavily', sources: [{
          provider: 'tavily', providerRecordId: 'w1', title: 'Web', sourceUrl: 'https://example.org/web',
          authors: [], identifiers: {}, access: { kind: 'unknown' },
        }],
      }) },
      scansci: { acquire: vi.fn() },
      persist,
    });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]?.rights.downloadPolicy).toBe('downloadable');
    expect(result.sources[1]?.rights.downloadPolicy).toBe('source_link_only');
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('does not persist full text when the rights checker declines caching', async () => {
    const persist = vi.fn();
    const result = await executeSourceRetrieval({
      query: 'paper', providers: ['scansci'], includeFullText: true, identifier: '10.1000/test', limit: 1,
    }, {
      semanticScholar: { search: vi.fn() },
      tavily: { search: vi.fn() },
      scansci: { acquire: async () => ({
        status: 'succeeded', provider: 'scansci', route: 'open_access', sourceUrl: 'https://example.org/paper.pdf',
        bytes: Buffer.from('%PDF'), contentHash: 'a'.repeat(64), mimeType: 'application/pdf', access: { kind: 'open_access' },
      }) },
      persist,
    }, { institutionalSubjectId: 'a'.repeat(64) });
    expect(result.providers).toEqual([{ provider: 'scansci', status: 'blocked', code: 'open_license_missing' }]);
    expect(persist).not.toHaveBeenCalled();
  });
});
