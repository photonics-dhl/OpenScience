import { describe, expect, it, vi } from 'vitest';

import { createHybridSearchService } from '../src/service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '44444444-4444-4444-8444-444444444444';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const CONTENT_HASH = 'd'.repeat(64);
const CHUNK_A = 'a'.repeat(64);
const CHUNK_B = 'b'.repeat(64);
const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const MODEL_IDENTITY = {
  modelVersionId: '22222222-2222-4222-8222-222222222222',
  modelRevision: MODEL_REVISION,
  sourceSha256: '1'.repeat(64),
  packageFreezeSha256: '2'.repeat(64),
  modelManifestSha256: '3'.repeat(64),
};
const TELEMETRY_KEY = new Uint8Array(32).fill(7);

function unitVector(index: number): number[] {
  const vector = Array.from({ length: 1024 }, () => 0);
  vector[index] = 1;
  return vector;
}

function embeddingResult(index = 0) {
  return {
    modelRevision: MODEL_IDENTITY.modelRevision,
    sourceSha256: MODEL_IDENTITY.sourceSha256,
    packageFreezeSha256: MODEL_IDENTITY.packageFreezeSha256,
    modelManifestSha256: MODEL_IDENTITY.modelManifestSha256,
    dimension: 1024 as const,
    vectors: [unitVector(index)],
  };
}

function payload(id: string) {
  return {
    id,
    tenantId: TENANT,
    text: `bounded-${id[0]}`,
    locators: [{ artifactId: ARTIFACT, contentHash: CONTENT_HASH, blockId: `block-${id[0]}`, page: 1 }],
    claimIds: [],
  };
}

function createStorage() {
  return {
    lexicalCandidates: vi.fn(async () => ({
      status: 'ok' as const,
      corpus: { documentCount: 2, averageLength: 2 },
      documentFrequencies: { pulse: 1 },
      candidates: [{ id: CHUNK_A, tenantId: TENANT, tokenCount: 2, termFrequencies: { pulse: 1 } }],
      needsReviewCount: 0,
    })),
    denseCandidates: vi.fn(async () => ({
      status: 'ok' as const,
      candidates: [
        { id: CHUNK_B, tenantId: TENANT, vector: new Float32Array(unitVector(0)) },
        { id: CHUNK_A, tenantId: TENANT, vector: new Float32Array(unitVector(1)) },
      ],
      needsReviewCount: 0,
    })),
    hydrateCandidates: vi.fn(async ({ ids }: { ids: string[] }) => ({
      status: 'ok' as const,
      candidates: ids.map(payload),
      needsReviewCount: 0,
    })),
    recordQueryMetric: vi.fn(async () => undefined),
  };
}

describe('hybrid search service', () => {
  it('rejects invalid queries before invoking either retrieval channel', async () => {
    const storage = createStorage();
    const embedder = { embed: vi.fn(async () => { throw new Error('must not run'); }) };
    const service = createHybridSearchService({
      storage, embedder, modelIdentity: MODEL_IDENTITY, telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: '   ', limit: 10 })).rejects.toThrow('query');
    await expect(service.search({ tenantId: TENANT, query: 'x'.repeat(4_097), limit: 10 })).rejects.toThrow('query');
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(storage.lexicalCandidates).not.toHaveBeenCalled();
  });

  it('fuses lexical and dense ranks without recording query text', async () => {
    const storage = createStorage();
    const embedder = { embed: vi.fn(async () => embeddingResult()) };
    const service = createHybridSearchService({
      storage, embedder, modelIdentity: MODEL_IDENTITY, telemetryKey: TELEMETRY_KEY, now: () => 1_000,
    });

    const result = await service.search({ tenantId: TENANT, query: 'pulse', limit: 10 });

    expect(result).toMatchObject({ status: 'ok', mode: 'hybrid', needsReviewCount: 0 });
    if (result.status !== 'ok') throw new Error('expected hybrid response');
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([CHUNK_A, CHUNK_B]);
    expect(storage.recordQueryMetric).toHaveBeenCalledOnce();
    expect(JSON.stringify(storage.recordQueryMetric.mock.calls)).not.toContain('pulse');
    expect(storage.denseCandidates).toHaveBeenCalledWith({ tenantId: TENANT, modelIdentity: MODEL_IDENTITY });
    const metric = storage.recordQueryMetric.mock.calls[0]?.[0];
    expect(metric?.queryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('degrades to lexical-only when embedding is unavailable', async () => {
    const storage = createStorage();
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => { throw new Error('embedding_transport_unavailable'); }) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });

    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok',
      mode: 'lexical_only',
      degradationCode: 'embedding_unavailable',
      candidates: [{ id: CHUNK_A }],
    });
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });

  it('degrades when an injected embedder violates the 1024-dimension contract', async () => {
    const storage = createStorage();
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => ({ ...embeddingResult(), vectors: [[1, 0]] })) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'embedding_unavailable',
    });
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });

  it('degrades to lexical-only when the dense corpus exceeds capacity', async () => {
    const storage = createStorage();
    storage.denseCandidates.mockResolvedValueOnce({ status: 'unavailable', code: 'dense_capacity_exceeded' });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });

    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'dense_capacity_exceeded',
    });
  });

  it('preserves a dense storage failure instead of blaming the embedder', async () => {
    const storage = createStorage();
    storage.denseCandidates.mockResolvedValueOnce({ status: 'unavailable', code: 'search_storage_unavailable' });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });

    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'search_storage_unavailable',
    });
  });

  it('degrades explicitly when the configured model identity is not active', async () => {
    const storage = createStorage();
    storage.denseCandidates.mockResolvedValueOnce({ status: 'unavailable', code: 'model_identity_unavailable' });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'model_identity_unavailable',
    });
  });

  it('maps a rejected dense adapter to storage unavailability', async () => {
    const storage = createStorage();
    storage.denseCandidates.mockRejectedValueOnce(new Error('adapter failed'));
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'search_storage_unavailable',
    });
  });

  it('degrades before storage when the worker runtime identity differs', async () => {
    const storage = createStorage();
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => ({ ...embeddingResult(), modelManifestSha256: '4'.repeat(64) })) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });

    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toMatchObject({
      status: 'ok', mode: 'lexical_only', degradationCode: 'embedding_unavailable',
    });
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });

  it('counts a missing fused payload once through final hydration review', async () => {
    const storage = createStorage();
    storage.hydrateCandidates.mockResolvedValueOnce({ status: 'ok', candidates: [], needsReviewCount: 1 });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 1 })).resolves.toMatchObject({
      status: 'ok', candidates: [], needsReviewCount: 1,
    });
  });

  it('records a bounded metric when final hydration is unavailable', async () => {
    const storage = createStorage();
    storage.hydrateCandidates.mockResolvedValueOnce({ status: 'unavailable', code: 'search_storage_unavailable' });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });

    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toEqual({
      status: 'unavailable', code: 'search_storage_unavailable',
    });
    expect(storage.recordQueryMetric).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'search_storage_unavailable', resultCount: 0,
    }));
  });

  it('reports a final payload capacity failure distinctly', async () => {
    const storage = createStorage();
    storage.hydrateCandidates.mockResolvedValueOnce({ status: 'unavailable', code: 'lexical_capacity_exceeded' });
    const service = createHybridSearchService({
      storage,
      embedder: { embed: vi.fn(async () => embeddingResult()) },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: TELEMETRY_KEY,
    });
    await expect(service.search({ tenantId: TENANT, query: 'pulse', limit: 10 })).resolves.toEqual({
      status: 'unavailable', code: 'payload_capacity_exceeded',
    });
    expect(storage.recordQueryMetric).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'payload_capacity_exceeded',
    }));
  });

  it('requires a high-entropy telemetry key', () => {
    const storage = createStorage();
    expect(() => createHybridSearchService({
      storage,
      embedder: { embed: vi.fn() },
      modelIdentity: MODEL_IDENTITY,
      telemetryKey: new Uint8Array(31),
    })).toThrow('telemetry_key');
  });

  it('separates otherwise identical query fingerprints by tenant', async () => {
    const storage = createStorage();
    const embedder = { embed: vi.fn(async () => embeddingResult()) };
    const service = createHybridSearchService({
      storage, embedder, modelIdentity: MODEL_IDENTITY, telemetryKey: TELEMETRY_KEY,
    });

    await service.search({ tenantId: TENANT, query: 'pulse', limit: 10 });
    await service.search({ tenantId: OTHER_TENANT, query: 'pulse', limit: 10 });
    const firstHash = storage.recordQueryMetric.mock.calls[0]?.[0].queryHash;
    const secondHash = storage.recordQueryMetric.mock.calls[1]?.[0].queryHash;
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
    expect(secondHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstHash).not.toBe(secondHash);
  });
});
