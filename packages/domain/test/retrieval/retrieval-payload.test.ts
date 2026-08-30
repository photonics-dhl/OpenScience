import { describe, expect, it } from 'vitest';
import { parseSourceRetrievePayload } from '../../src/retrieval/retrieve-payload';

describe('source.retrieve payload', () => {
  it('normalizes a bounded provider-neutral query', () => {
    expect(parseSourceRetrievePayload({ query: '  ultrafast carrier dynamics  ' })).toEqual({
      query: 'ultrafast carrier dynamics',
      providers: ['semantic_scholar', 'tavily'],
      limit: 10,
      includeFullText: false,
    });
  });

  it('accepts an explicit legal full-text identifier', () => {
    expect(parseSourceRetrievePayload({
      query: 'paper', providers: ['scansci'], includeFullText: true, identifier: '10.1000/test', limit: 1,
    })).toMatchObject({ providers: ['scansci'], includeFullText: true, identifier: '10.1000/test' });
  });

  it('rejects unknown fields, provider duplication and ambiguous full-text requests', () => {
    expect(() => parseSourceRetrievePayload({ query: 'x', secret: 'no' })).toThrow();
    expect(() => parseSourceRetrievePayload({ query: 'x', providers: ['tavily', 'tavily'] })).toThrow();
    expect(() => parseSourceRetrievePayload({ query: 'x', includeFullText: true })).toThrow();
    expect(() => parseSourceRetrievePayload({ query: 'x', providers: ['scansci'], includeFullText: true })).toThrow();
  });
});
