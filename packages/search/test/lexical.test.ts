import { describe, expect, it } from 'vitest';

import { SearchStorage, lexicalSearch, scoreBm25 } from '../src';

const WORKSPACE_A = '00000000-0000-4000-8000-00000000000a';

describe('scoreBm25', () => {
  it('uses the fixed BM25 parameters from the retrieval contract', () => {
    expect(scoreBm25({
      tf: 3,
      df: 2,
      documentLength: 100,
      documentCount: 10,
      averageLength: 120,
    })).toBeCloseTo(2.414, 3);
  });

  it('returns zero for absent terms and invalid corpus statistics', () => {
    expect(scoreBm25({ tf: 0, df: 2, documentLength: 100, documentCount: 10, averageLength: 120 })).toBe(0);
    expect(scoreBm25({ tf: 2, df: 2, documentLength: 100, documentCount: 0, averageLength: 0 })).toBe(0);
  });
});

describe('lexicalSearch', () => {
  it('rejects empty and oversized queries before storage access', async () => {
    const storage = { lexicalCandidates: async () => { throw new Error('must not run'); } };

    await expect(lexicalSearch({ storage, tenantId: WORKSPACE_A, query: '   ', limit: 20 }))
      .rejects.toThrow(/query/);
    await expect(lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'x'.repeat(4_097), limit: 20 }))
      .rejects.toThrow(/query/);
  });

  it('ranks deterministically and uses chunk ID as the stable tie-break', async () => {
    const hydratedIds: string[][] = [];
    const storage = {
      lexicalCandidates: async () => ({
        status: 'ok' as const,
        corpus: { documentCount: 10, averageLength: 100 },
        documentFrequencies: { pulse: 2 },
        needsReviewCount: 0,
        candidates: [
          { id: 'b'.repeat(64), tenantId: WORKSPACE_A, tokenCount: 100, termFrequencies: { pulse: 3 } },
          { id: 'a'.repeat(64), tenantId: WORKSPACE_A, tokenCount: 100, termFrequencies: { pulse: 3 } },
        ],
      }),
      hydrateCandidates: async (input: { ids: string[] }) => {
        hydratedIds.push(input.ids);
        return ({
        status: 'ok' as const,
        needsReviewCount: 0,
        candidates: [
          { id: 'b'.repeat(64), tenantId: WORKSPACE_A, text: 'b', locators: [], claimIds: [] },
          { id: 'a'.repeat(64), tenantId: WORKSPACE_A, text: 'a', locators: [], claimIds: [] },
        ],
        });
      },
    };

    await expect(lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'pulse', limit: 20 }))
      .resolves.toMatchObject({
        status: 'ok',
        candidates: [
          { id: 'a'.repeat(64), tenantId: WORKSPACE_A, rank: 1 },
          { id: 'b'.repeat(64), tenantId: WORKSPACE_A, rank: 2 },
        ],
      });
    expect(hydratedIds).toEqual([['a'.repeat(64), 'b'.repeat(64)]]);
  });

  it('returns a bounded typed error without leaking connection details', async () => {
    const storage = {
      lexicalCandidates: async () => ({ status: 'unavailable' as const, code: 'search_storage_unavailable' as const }),
    };

    const result = await lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'pulse', limit: 20 });
    expect(result).toEqual({ status: 'unavailable', code: 'search_storage_unavailable', candidates: [] });
    expect(JSON.stringify(result)).not.toContain('postgresql://');
  });
});

describe('SearchStorage', () => {
  it('upserts through the compound tenant key so a cross-tenant ID collision fails closed', async () => {
    const upserts: unknown[] = [];
    const transaction = { searchChunk: { upsert: async (input: unknown) => { upserts.push(input); } } };
    const client = { $transaction: async (run: (value: typeof transaction) => Promise<void>) => run(transaction) };
    const storage = new SearchStorage(client as never);

    await storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: '00000000-0000-4000-8000-000000000010',
      chunks: [{
        id: 'a'.repeat(64), artifactId: '00000000-0000-4000-8000-000000000020', contentHash: '1'.repeat(64), ordinal: 0,
        language: 'en', text: 'pulse', tokenCount: 1,
        locators: [{ artifactId: '00000000-0000-4000-8000-000000000020', contentHash: '1'.repeat(64), blockId: 'a', page: 1 }], claimIds: [],
        lexicalTerms: ['pulse'], termFrequencies: { pulse: 1 },
      }],
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      where: { workspaceId_id: { workspaceId: WORKSPACE_A, id: 'a'.repeat(64) } },
    });
  });

  it('binds tenant scope into every lexical query', async () => {
    const calls: unknown[][] = [];
    const transaction = {
      $executeRaw: async () => 1,
      $queryRaw: async (...args: unknown[]) => {
        calls.push(args);
        if (calls.length === 1) return [{ document_count: 0, average_length: 0 }];
        if (calls.length === 2) return [{ count: 0 }];
        return [];
      },
    };
    const client = {
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    };
    const storage = new SearchStorage(client as never);

    const result = await storage.lexicalCandidates({ tenantId: WORKSPACE_A, query: 'pulse', terms: ['pulse'], limit: 20 });

    expect(result).toMatchObject({ status: 'ok' });
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => JSON.stringify(call).includes(WORKSPACE_A))).toBe(true);
  });

  it('revalidates direct storage calls before creating SQL', async () => {
    const storage = new SearchStorage({ $transaction: async () => { throw new Error('must not run'); } } as never);
    await expect(storage.lexicalCandidates({
      tenantId: WORKSPACE_A,
      query: 'pulse',
      terms: Array.from({ length: 513 }, (_, index) => `term${index}`),
      limit: 20,
    })).rejects.toThrow(/terms/);
    await expect(storage.lexicalCandidates({ tenantId: WORKSPACE_A, query: 'pulse', terms: ['pulse'], limit: 101 }))
      .rejects.toThrow(/limit/);
  });

  it('rejects oversized write batches and non-canonical lexical metadata before a transaction', async () => {
    const storage = new SearchStorage({ $transaction: async () => { throw new Error('must not run'); } } as never);
    const chunk = {
      id: 'a'.repeat(64), artifactId: '00000000-0000-4000-8000-000000000020', contentHash: '1'.repeat(64), ordinal: 0,
      language: 'en' as const, text: 'pulse', tokenCount: 1,
      locators: [{ artifactId: '00000000-0000-4000-8000-000000000020', contentHash: '1'.repeat(64), blockId: 'a', page: 1 }],
      claimIds: [], lexicalTerms: ['pulse'], termFrequencies: { pulse: 1 },
    };
    await expect(storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: '00000000-0000-4000-8000-000000000010',
      chunks: Array.from({ length: 101 }, (_, index) => ({ ...chunk, id: index.toString(16).padStart(64, '0') })),
    })).rejects.toThrow(/batch/);
    await expect(storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: '00000000-0000-4000-8000-000000000010',
      chunks: [{ ...chunk, claimIds: [42] as never }],
    })).rejects.toThrow(/metadata/);
    await expect(storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: '00000000-0000-4000-8000-000000000010',
      chunks: [{ ...chunk, lexicalTerms: ['other'], termFrequencies: { other: 1 } }],
    })).rejects.toThrow(/metadata/);
  });

  it('excludes invalid database locators and counts them for review', async () => {
    let queryCount = 0;
    const transaction = {
      $executeRaw: async () => 1,
      $queryRaw: async () => {
        queryCount += 1;
        if (queryCount === 1) return [{ payload_bytes: 100 }];
        return [{
          id: 'a'.repeat(64), tenant_id: WORKSPACE_A,
          artifact_id: '00000000-0000-4000-8000-000000000020', content_hash: '1'.repeat(64),
          text: 'pulse', locators: [42], claim_ids: [],
        }];
      },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.hydrateCandidates({ tenantId: WORKSPACE_A, ids: ['a'.repeat(64)] }))
      .resolves.toEqual({
        status: 'ok', candidates: [], needsReviewCount: 1,
      });
  });
});
