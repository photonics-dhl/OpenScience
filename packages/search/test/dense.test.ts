import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cosineSimilarity, rankDenseCandidates } from '../src/dense';
import { SearchStorage } from '../src/storage';

const TENANT = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const MODEL_IDENTITY = {
  modelVersionId: '22222222-2222-4222-8222-222222222222',
  modelRevision: MODEL_REVISION,
  sourceSha256: '1'.repeat(64),
  packageFreezeSha256: '2'.repeat(64),
  modelManifestSha256: '3'.repeat(64),
};

describe('exact dense retrieval', () => {
  it('computes finite cosine similarity and rejects malformed vectors', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBe(1);
    expect(() => cosineSimilarity(new Float32Array([1]), new Float32Array([1, 0])))
      .toThrow('dense_vector_invalid');
    expect(() => cosineSimilarity(new Float32Array([Number.NaN, 0]), new Float32Array([1, 0])))
      .toThrow('dense_vector_invalid');
  });

  it('ranks stable ties by chunk ID and enforces the exact-scan bound', () => {
    const result = rankDenseCandidates({
      tenantId: TENANT,
      queryVector: new Float32Array([1, 0]),
      candidates: [
        { id: 'b'.repeat(64), tenantId: TENANT, vector: new Float32Array([1, 0]) },
        { id: 'a'.repeat(64), tenantId: TENANT, vector: new Float32Array([1, 0]) },
        { id: 'c'.repeat(64), tenantId: TENANT, vector: new Float32Array([0, 1]) },
      ],
      limit: 2,
    });
    expect(result).toEqual({
      status: 'ok',
      candidates: [
        { id: 'a'.repeat(64), score: 1, rank: 1 },
        { id: 'b'.repeat(64), score: 1, rank: 2 },
      ],
      needsReviewCount: 0,
    });

    expect(rankDenseCandidates({
      tenantId: TENANT,
      queryVector: new Float32Array([1, 0]),
      candidates: Array.from({ length: 10_001 }, (_, index) => ({
        id: index.toString(16).padStart(64, '0'), tenantId: TENANT, vector: new Float32Array([1, 0]),
      })),
      limit: 10,
    })).toEqual({ status: 'unavailable', code: 'dense_capacity_exceeded' });
  });

  it('omits tenant-mismatched and malformed candidates for review', () => {
    expect(rankDenseCandidates({
      tenantId: TENANT,
      queryVector: new Float32Array([1, 0]),
      candidates: [
        { id: 'a'.repeat(64), tenantId: '22222222-2222-4222-8222-222222222222', vector: new Float32Array([1, 0]) },
        { id: 'b'.repeat(64), tenantId: TENANT, vector: new Float32Array([2, 0]) },
        { id: 'c'.repeat(64), tenantId: TENANT, vector: new Float32Array([0, 1]) },
      ],
      limit: 10,
    })).toEqual({
      status: 'ok',
      candidates: [{ id: 'c'.repeat(64), score: 0, rank: 1 }],
      needsReviewCount: 2,
    });
  });

  it('loads only tenant-scoped hash-verified active model vectors', async () => {
    const rawVector = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
    rawVector.writeFloatLE(1, 0);
    const calls: unknown[][] = [];
    let queryCount = 0;
    const transaction = {
      $executeRaw: async () => 1,
      $queryRaw: async (...args: unknown[]) => {
        calls.push(args);
        queryCount += 1;
        if (queryCount === 1) return [{ id: MODEL_IDENTITY.modelVersionId }];
        return [{
          id: 'a'.repeat(64), tenant_id: TENANT, dimension: 1024,
          vector: rawVector, vector_sha256: createHash('sha256').update(rawVector).digest('hex'), norm: 1,
        }];
      },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    const result = await storage.denseCandidates({ tenantId: TENANT, modelIdentity: MODEL_IDENTITY });

    expect(result).toMatchObject({ status: 'ok', needsReviewCount: 0 });
    if (result.status !== 'ok') throw new Error('expected dense candidates');
    expect(result.candidates[0]?.vector[0]).toBe(1);
    expect(result.candidates[0]?.vector).toHaveLength(1024);
    expect(JSON.stringify(calls)).toContain(TENANT);
    expect(JSON.stringify(calls)).toContain('bge-m3');
    expect(JSON.stringify(calls)).toContain(MODEL_IDENTITY.modelVersionId);
    expect(JSON.stringify(calls)).toContain(MODEL_IDENTITY.modelManifestSha256);
  });

  it('distinguishes a missing model identity from an active model with no tenant vectors', async () => {
    const missingModelTransaction = {
      $executeRaw: async () => 1,
      $queryRaw: async () => [],
    };
    const missingModelStorage = new SearchStorage({
      $transaction: async (run: (value: typeof missingModelTransaction) => Promise<unknown>) => run(missingModelTransaction),
    } as never);
    await expect(missingModelStorage.denseCandidates({ tenantId: TENANT, modelIdentity: MODEL_IDENTITY }))
      .resolves.toEqual({ status: 'unavailable', code: 'model_identity_unavailable' });

    let queryCount = 0;
    const emptyCorpusTransaction = {
      $executeRaw: async () => 1,
      $queryRaw: async () => {
        queryCount += 1;
        return queryCount === 1 ? [{ id: MODEL_IDENTITY.modelVersionId }] : [];
      },
    };
    const emptyCorpusStorage = new SearchStorage({
      $transaction: async (run: (value: typeof emptyCorpusTransaction) => Promise<unknown>) => run(emptyCorpusTransaction),
    } as never);
    await expect(emptyCorpusStorage.denseCandidates({ tenantId: TENANT, modelIdentity: MODEL_IDENTITY }))
      .resolves.toEqual({ status: 'ok', candidates: [], needsReviewCount: 0 });
    expect(queryCount).toBe(2);
  });

  it('records content-free bounded query metrics only', async () => {
    const writes: unknown[] = [];
    const transaction = {
      $executeRaw: async () => 1,
      searchQueryMetric: { create: async (input: unknown) => { writes.push(input); } },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);
    await storage.recordQueryMetric({
      tenantId: TENANT,
      queryHash: createHash('sha256').update('sensitive query').digest('hex'),
      lexicalAvailable: true,
      denseAvailable: false,
      resultCount: 1,
      totalLatencyMs: 7,
      errorCode: 'embedding_unavailable',
    });
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes)).not.toContain('sensitive query');
    await expect(storage.recordQueryMetric({
      tenantId: TENANT,
      queryHash: 'not-a-hash',
      lexicalAvailable: true,
      denseAvailable: true,
      resultCount: 0,
      totalLatencyMs: 1,
    })).rejects.toThrow('metric');
  });
});
