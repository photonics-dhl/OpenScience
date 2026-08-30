import { describe, expect, it } from 'vitest';
import {
  parseDurableSourceRetrievePayload,
  parseSourceRetrieveRequestPayload,
} from '../../src/retrieval/retrieve-payload';
import { SOURCE_RETRIEVE_RETRY_PAYLOAD_PARITY_CASES } from '../helpers/retrieval-payload-parity';

describe('source.retrieve payload', () => {
  it('normalizes a bounded provider-neutral request without a persistence marker', () => {
    expect(parseSourceRetrieveRequestPayload({ query: '  ultrafast carrier dynamics  ' })).toEqual({
      query: 'ultrafast carrier dynamics',
      providers: ['semantic_scholar', 'tavily'],
      limit: 10,
      includeFullText: false,
    });
  });

  it('accepts an explicit legal full-text identifier', () => {
    expect(parseSourceRetrieveRequestPayload({
      query: 'paper', providers: ['scansci'], includeFullText: true, identifier: '10.1000/test', limit: 1,
    })).toMatchObject({ providers: ['scansci'], includeFullText: true, identifier: '10.1000/test' });
  });

  it('reserves the retry contract marker from ordinary request parsing', () => {
    expect(() => parseSourceRetrieveRequestPayload({
      query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1000/test', retryContractVersion: 1,
    })).toThrow(/unknown|reserved|retry/i);
  });

  it('accepts only an exact complete server-stamped durable payload', () => {
    const durable = {
      query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1000/test', retryContractVersion: 1, target: { kind: 'personal' },
    };
    expect(parseDurableSourceRetrievePayload(durable)).toEqual(durable);
    expect(() => parseDurableSourceRetrievePayload({ ...durable, retryContractVersion: undefined })).toThrow();
    expect(() => parseDurableSourceRetrievePayload({ query: 'paper', retryContractVersion: 1 })).toThrow();
    expect(() => parseDurableSourceRetrievePayload({ ...durable, injected: true })).toThrow();
    expect(() => parseDurableSourceRetrievePayload({ ...durable, target: undefined })).toThrow();
    expect(parseDurableSourceRetrievePayload({
      ...durable,
      target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000701' },
    })).toMatchObject({ target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000701' } });
    expect(parseDurableSourceRetrievePayload({
      ...durable,
      target: { kind: 'research_object', researchObjectId: '01991f8a-57b7-7cc2-8d1a-4490f4287520' },
    })).toMatchObject({ target: { kind: 'research_object', researchObjectId: '01991f8a-57b7-7cc2-8d1a-4490f4287520' } });
  });

  it('rejects unknown fields, provider duplication and ambiguous full-text requests', () => {
    expect(() => parseSourceRetrieveRequestPayload({ query: 'x', secret: 'no' })).toThrow();
    expect(() => parseSourceRetrieveRequestPayload({ query: 'x', providers: ['tavily', 'tavily'] })).toThrow();
    expect(() => parseSourceRetrieveRequestPayload({ query: 'x', includeFullText: true })).toThrow();
    expect(() => parseSourceRetrieveRequestPayload({ query: 'x', providers: ['scansci'], includeFullText: true })).toThrow();
  });

  it('matches every shared durable payload case in the JavaScript parser', () => {
    for (const candidate of SOURCE_RETRIEVE_RETRY_PAYLOAD_PARITY_CASES) {
      const parsed = () => parseDurableSourceRetrievePayload(candidate.payload);
      if (candidate.eligible) expect(parsed, candidate.name).not.toThrow();
      else expect(parsed, candidate.name).toThrow();
    }
  });
});
