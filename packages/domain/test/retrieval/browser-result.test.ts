import { describe, expect, it } from 'vitest';
import { isSourceRetrieveIdentifier, toBrowserSourceRetrieveResult } from '../../src/retrieval/browser-result';

describe('browser-safe source.retrieve result', () => {
  it('uses one exact DOI/arXiv grammar', () => {
    expect(isSourceRetrieveIdentifier('10.1038/nature12373')).toBe(true);
    expect(isSourceRetrieveIdentifier('arXiv:2401.01234v2')).toBe(true);
    expect(isSourceRetrieveIdentifier('10.invalid')).toBe(false);
    expect(isSourceRetrieveIdentifier('a paper title')).toBe(false);
  });

  it('keeps persisted identifiers and the stored active temporary-document expiry together', () => {
    expect(toBrowserSourceRetrieveResult({
      sources: [{ id: 'source-1', provider: 'scansci', title: 'Paper', sourceUrl: 'https://example.test/paper', identifiers: { doi: '10.1038/nature12373' }, rights: { cacheAllowed: true }, temporaryDocumentId: 'document-1', expiresAt: new Date('2026-09-02T00:00:00.000Z') }],
      providers: [{ provider: 'scansci', status: 'succeeded' }],
    })).toEqual({
      sources: [{ id: 'source-1', provider: 'scansci', title: 'Paper', sourceUrl: 'https://example.test/paper', identifiers: { doi: '10.1038/nature12373' }, rights: { cacheAllowed: true }, temporaryDocumentId: 'document-1', expiresAt: '2026-09-02T00:00:00.000Z' }],
      providers: [{ provider: 'scansci', status: 'succeeded' }],
    });
  });
});
