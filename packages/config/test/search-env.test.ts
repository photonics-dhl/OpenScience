import { describe, expect, it } from 'vitest';

type SearchEnvModule = {
  DEFAULT_DEV_SEARCH_DATABASE_URL: string;
  loadSearchEnv(env?: NodeJS.ProcessEnv): { nodeEnv: string; databaseUrl: string };
};

async function loadModule(): Promise<SearchEnvModule> {
  return await import('../src') as unknown as SearchEnvModule;
}

describe('loadSearchEnv', () => {
  it('requires SEARCH_DATABASE_URL in production without falling back to the core database', async () => {
    const { loadSearchEnv } = await loadModule();

    expect(() => loadSearchEnv({ NODE_ENV: 'production' })).toThrow(/SEARCH_DATABASE_URL/);
  });

  it('uses a separate openscience_search database in development', async () => {
    const { loadSearchEnv, DEFAULT_DEV_SEARCH_DATABASE_URL } = await loadModule();

    expect(loadSearchEnv({})).toEqual({
      nodeEnv: 'development',
      databaseUrl: DEFAULT_DEV_SEARCH_DATABASE_URL,
    });
    expect(DEFAULT_DEV_SEARCH_DATABASE_URL).toContain('/openscience_search');
  });

  it('returns the explicitly injected search database URL unchanged', async () => {
    const { loadSearchEnv } = await loadModule();
    const databaseUrl = 'postgresql://search-user@search-host.example/semantic_index';

    expect(loadSearchEnv({ NODE_ENV: 'production', SEARCH_DATABASE_URL: databaseUrl })).toEqual({
      nodeEnv: 'production',
      databaseUrl,
    });
  });
});
