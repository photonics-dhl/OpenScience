import { describe, expect, it } from 'vitest';

import { buildSearchIndexerFromEnv, loadSearchIndexRuntimeConfig } from '../src';

const HASH = 'a'.repeat(64);

describe('search indexing runtime configuration', () => {
  it('keeps the production indexing path disabled by default', () => {
    expect(loadSearchIndexRuntimeConfig({ NODE_ENV: 'production' })).toEqual({ enabled: false });
    expect(buildSearchIndexerFromEnv({ NODE_ENV: 'production' })).toBeUndefined();
  });

  it('fails closed when an enabled model identity is incomplete', () => {
    expect(() => loadSearchIndexRuntimeConfig({
      NODE_ENV: 'production',
      BGE_M3_ENABLED: 'true',
      SEARCH_DATABASE_URL: 'postgresql://search.invalid/openscience_search',
    })).toThrow(/BGE_M3_MODEL_VERSION_ID/);
  });

  it('builds the internal-only indexer from an exact model identity', () => {
    const env = {
      NODE_ENV: 'production',
      BGE_M3_ENABLED: 'true',
      SEARCH_DATABASE_URL: 'postgresql://search.invalid/openscience_search',
      BGE_M3_MODEL_VERSION_ID: '123e4567-e89b-42d3-a456-426614174000',
      BGE_M3_MODEL_REVISION: '5617a9f61b028005a4858fdac845db406aefb181',
      BGE_M3_SOURCE_SHA256: HASH,
      BGE_M3_PACKAGE_FREEZE_SHA256: HASH,
      BGE_M3_MODEL_MANIFEST_SHA256: HASH,
      EMBEDDING_WORKER_URL: 'http://embedding-worker:8080',
    };

    expect(loadSearchIndexRuntimeConfig(env)).toMatchObject({
      enabled: true,
      endpoint: 'http://embedding-worker:8080',
      modelIdentity: {
        modelVersionId: '123e4567-e89b-42d3-a456-426614174000',
        modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
      },
    });
    expect(buildSearchIndexerFromEnv(env)).toMatchObject({ index: expect.any(Function) });
  });

  it('rejects external endpoints and non-exact model revisions', () => {
    const base = {
      NODE_ENV: 'production',
      BGE_M3_ENABLED: 'true',
      SEARCH_DATABASE_URL: 'postgresql://search.invalid/openscience_search',
      BGE_M3_MODEL_VERSION_ID: '123e4567-e89b-42d3-a456-426614174000',
      BGE_M3_MODEL_REVISION: '5617a9f61b028005a4858fdac845db406aefb181',
      BGE_M3_SOURCE_SHA256: HASH,
      BGE_M3_PACKAGE_FREEZE_SHA256: HASH,
      BGE_M3_MODEL_MANIFEST_SHA256: HASH,
    };
    expect(() => loadSearchIndexRuntimeConfig({ ...base, EMBEDDING_WORKER_URL: 'https://example.com' }))
      .toThrow(/EMBEDDING_WORKER_URL/);
    expect(() => loadSearchIndexRuntimeConfig({ ...base, BGE_M3_MODEL_REVISION: 'main' }))
      .toThrow(/BGE_M3_MODEL_REVISION/);
  });
});
