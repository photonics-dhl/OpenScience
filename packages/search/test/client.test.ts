import { describe, expect, it } from 'vitest';

type SearchClient = {
  $disconnect(): Promise<void>;
};

type SearchModule = {
  createSearchPrismaClient(options?: { datasourceUrl?: string; env?: NodeJS.ProcessEnv }): SearchClient;
};

async function loadSearchModule(): Promise<SearchModule> {
  return await import('../src') as unknown as SearchModule;
}

describe('createSearchPrismaClient', () => {
  it('fails closed when production has no independent search database URL', async () => {
    const { createSearchPrismaClient } = await loadSearchModule();

    expect(() => createSearchPrismaClient({ env: { NODE_ENV: 'production' } })).toThrow(/SEARCH_DATABASE_URL/);
  });

  it('creates a lazy search client without connecting to the database', async () => {
    const { createSearchPrismaClient } = await loadSearchModule();
    const client = createSearchPrismaClient({
      datasourceUrl: 'postgresql://search-user:search-pass@127.0.0.1:1/isolated_search',
    });

    expect(typeof client.$disconnect).toBe('function');
    await expect(client.$disconnect()).resolves.toBeUndefined();
  });
});
