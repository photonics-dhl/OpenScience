import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient as CorePrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SearchStorage, createSearchPrismaClient, lexicalSearch, createHybridSearchService } from '../src';
import { buildLexicalCandidateQuery } from '../src/storage';
import { Prisma } from '../generated/client';

const DATABASE_URL = process.env.SEARCH_TEST_DATABASE_URL;
const WORKSPACE_A = randomUUID();
const WORKSPACE_B = randomUUID();
const WORKSPACE_INDEX = randomUUID();
const RESEARCH_OBJECT = randomUUID();
const RESEARCH_OBJECT_INDEX = randomUUID();
const ARTIFACT_A = randomUUID();
const ARTIFACT_B = randomUUID();
const ARTIFACT_INDEX = randomUUID();
const SOURCE_VERSION_A = randomUUID();
const SOURCE_VERSION_B = randomUUID();
const CHUNK_A = createHash('sha256').update(`${WORKSPACE_A}:chunk-a`).digest('hex');
const CHUNK_B = createHash('sha256').update(`${WORKSPACE_B}:chunk-b`).digest('hex');
const COLLISION_CHUNK = createHash('sha256').update(`${WORKSPACE_B}:collision`).digest('hex');
const CORRUPT_TF_CHUNKS = Array.from({ length: 4 }, (_, index) =>
  createHash('sha256').update(`${WORKSPACE_A}:corrupt-tf:${index}`).digest('hex'));
const COMPRESSED_PAYLOAD_CHUNK = createHash('sha256').update(`${WORKSPACE_A}:compressed-payload`).digest('hex');
const HASH_A = createHash('sha256').update(`${WORKSPACE_A}:content`).digest('hex');
const HASH_B = createHash('sha256').update(`${WORKSPACE_B}:content`).digest('hex');
const INDEX_HASH_A = createHash('sha256').update(`${WORKSPACE_INDEX}:generation-a`).digest('hex');
const INDEX_CHUNK_A = createHash('sha256').update(`${WORKSPACE_INDEX}:chunk-a`).digest('hex');
const INDEX_CHUNK_B = createHash('sha256').update(`${WORKSPACE_INDEX}:chunk-b`).digest('hex');
const INDEX_CHUNK_C = createHash('sha256').update(`${WORKSPACE_INDEX}:chunk-c`).digest('hex');
const CORE_OWNER_TASK_A = randomUUID();
const CORE_OWNER_TASK_B = randomUUID();
const CORE_OWNER_TASK_C = randomUUID();
const INDEX_LEASE_A = '4'.repeat(64);
const INDEX_LEASE_B = '5'.repeat(64);
const INDEX_LEASE_C = '9'.repeat(64);
const INDEX_RECOVERY_LEASE = 'b'.repeat(64);
const INDEX_SOURCE_MAP_A = '6'.repeat(64);
const INDEX_SOURCE_MAP_B = '7'.repeat(64);
const INDEX_SOURCE_MAP_C = 'a'.repeat(64);
const MODEL_IDENTITY = {
  modelVersionId: randomUUID(),
  modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
  sourceSha256: '1'.repeat(64),
  packageFreezeSha256: '2'.repeat(64),
  modelManifestSha256: '3'.repeat(64),
};

function expectedDisposableDatabaseName(): string {
  if (process.env.SEARCH_TEST_MUTATION_CONFIRM !== 'DISPOSABLE_SEARCH_DB') {
    throw new Error('disposable search database mutation was not explicitly confirmed');
  }
  if (DATABASE_URL === undefined) throw new Error('disposable search database URL is absent');
  let databaseName: string;
  try {
    const url = new URL(DATABASE_URL);
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (process.env.SEARCH_DATABASE_URL !== undefined
      && new URL(process.env.SEARCH_DATABASE_URL).toString() === url.toString()) {
      throw new Error('production search database is forbidden');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'production search database is forbidden') throw error;
    throw new Error('disposable search database URL is invalid');
  }
  if (!/^openscience_search_test_[a-z0-9]{8,48}$/.test(databaseName)) {
    throw new Error('database name is not an approved disposable search database');
  }
  return databaseName;
}

// Search rows are validated against this isolated core lifecycle fixture; their index IDs remain independent from core task IDs.
function coreFixture(input: {
  workspaces: string[];
  objects: Array<{ id: string; workspaceId: string; deletedAt?: Date }>;
  artifacts: Array<{ id: string; workspaceId: string; contentHash: string }>;
  owners?: Array<{ id: string; researchObjectId: string }>;
}) {
  const url = process.env.JOURNAL_TEST_DATABASE_URL;
  const client = new CorePrismaClient({ datasources: { db: { url: url ?? 'postgresql://invalid' } } });
  const userId = randomUUID();
  const sessions = (input.owners ?? []).map(owner => ({ ...owner, sessionId: randomUUID() }));
  const hashes = [...new Set(input.artifacts.map(a => a.contentHash))];
  let mutationAllowed = false;
  return {
    client,
    async seed() {
      if (!url) throw new Error('isolated core test database URL is absent');
      const parsed = new URL(url);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/journal_test') {
        throw new Error('core fixture requires loopback journal_test');
      }
      const rows = await client.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
      if (rows[0]?.name !== 'journal_test') throw new Error('core database identity mismatch');
      mutationAllowed = true;
      await client.user.create({ data: { id: userId, email: `search-${userId}@example.test`,
        displayName: 'Synthetic search fixture', passwordHash: 'unusable-test-only' } });
      await client.workspace.createMany({ data: input.workspaces.map(id => ({ id, ownerId: userId, type: 'team', name: 'Synthetic search fixture' })) });
      await client.researchObject.createMany({ data: input.objects.map(row => ({ ...row, createdBy: userId, title: 'Synthetic search source' })) });
      await client.blob.createMany({ data: hashes.map(sha256 => ({ sha256, storageKey: `test-only/${sha256}`, size: 1n })) });
      await client.artifact.createMany({ data: input.artifacts.map(({ contentHash, ...row }) => ({ ...row,
        blobSha256: contentHash, logicalPath: 'synthetic.txt', size: 1n, uploadedBy: userId })) });
      for (const owner of sessions) {
        await client.agentSession.create({ data: { id: owner.sessionId, userId, researchObjectId: owner.researchObjectId, kind: 'research' } });
        // Inline legacy index payload: exact Native SourceMap authority is the later adapter's responsibility.
        await client.agentTask.create({ data: { id: owner.id, sessionId: owner.sessionId, kind: 'search.index', status: 'succeeded', payload: {} } });
      }
    },
    async dispose() {
      try {
        if (mutationAllowed) {
          await client.agentTask.deleteMany({ where: { id: { in: sessions.map(s => s.id) } } });
          await client.agentSession.deleteMany({ where: { id: { in: sessions.map(s => s.sessionId) } } });
          await client.researchObject.deleteMany({ where: { id: { in: input.objects.map(r => r.id) } } });
          await client.artifact.deleteMany({ where: { id: { in: input.artifacts.map(a => a.id) } } });
          await client.blob.deleteMany({ where: { sha256: { in: hashes } } });
          await client.workspace.deleteMany({ where: { id: { in: input.workspaces } } });
          await client.user.deleteMany({ where: { id: userId } });
        }
      } finally { await client.$disconnect(); }
    },
  };
}

describe.skipIf(DATABASE_URL === undefined)('SearchStorage ECS integration', () => {
  const client = createSearchPrismaClient({ datasourceUrl: DATABASE_URL ?? 'postgresql://invalid' });
  const deletedRo = randomUUID();
  const deletedChunk = createHash('sha256').update(deletedRo).digest('hex');
  const core = coreFixture({ workspaces: [WORKSPACE_A, WORKSPACE_B],
    objects: [{ id: RESEARCH_OBJECT, workspaceId: WORKSPACE_A }, { id: deletedRo, workspaceId: WORKSPACE_A, deletedAt: new Date() }],
    artifacts: [{ id: ARTIFACT_A, workspaceId: WORKSPACE_A, contentHash: HASH_A }, { id: ARTIFACT_B, workspaceId: WORKSPACE_B, contentHash: HASH_B }] });
  const storage = new SearchStorage(client, core.client);
  let mutationAllowed = false;

  beforeAll(async () => {
    const expectedName = expectedDisposableDatabaseName();
    const rows = await client.$queryRaw<Array<{ name: string }>>(Prisma.sql`SELECT current_database() AS name`);
    if (rows[0]?.name !== expectedName) throw new Error('connected database identity does not match disposable URL');
    mutationAllowed = true;
    await core.seed();
    await storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: RESEARCH_OBJECT,
      chunks: [{
        id: CHUNK_A, artifactId: ARTIFACT_A, contentHash: HASH_A, ordinal: 0,
        language: 'en', text: 'pulse pulse pulse experiment', tokenCount: 4,
        locators: [{ artifactId: ARTIFACT_A, contentHash: HASH_A, blockId: 'a', page: 1 }],
        claimIds: [], lexicalTerms: ['experiment', 'pulse'], termFrequencies: { pulse: 3, experiment: 1 },
      }],
    });
    await storage.upsertChunks({
      tenantId: WORKSPACE_B,
      researchObjectId: RESEARCH_OBJECT,
      chunks: [{
        id: CHUNK_B, artifactId: ARTIFACT_B, contentHash: HASH_B, ordinal: 0,
        language: 'en', text: 'pulse private tenant', tokenCount: 3,
        locators: [{ artifactId: ARTIFACT_B, contentHash: HASH_B, blockId: 'b', page: 1 }],
        claimIds: [], lexicalTerms: ['private', 'pulse', 'tenant'], termFrequencies: { pulse: 1, private: 1, tenant: 1 },
      }],
    });
    await client.searchModelVersion.create({ data: {
      id: MODEL_IDENTITY.modelVersionId,
      provider: 'BAAI',
      model: 'bge-m3',
      revision: MODEL_IDENTITY.modelRevision,
      dimension: 1024,
      sourceSha256: MODEL_IDENTITY.sourceSha256,
      packageFreezeSha256: MODEL_IDENTITY.packageFreezeSha256,
      modelManifestSha256: MODEL_IDENTITY.modelManifestSha256,
      status: 'active',
    } });
    const vector = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
    vector.writeFloatLE(1, 0);
    await client.searchEmbedding.create({ data: {
      workspaceId: WORKSPACE_A,
      chunkId: CHUNK_A,
      modelVersionId: MODEL_IDENTITY.modelVersionId,
      dimension: 1024,
      vector,
      vectorSha256: createHash('sha256').update(vector).digest('hex'),
      norm: 1,
    } });
  });

  afterAll(async () => {
    try { if (mutationAllowed) {
      await client.searchIndexTask.deleteMany({ where: { workspaceId: { in: [WORKSPACE_A, WORKSPACE_B, WORKSPACE_INDEX] } } });
      await client.searchChunk.deleteMany({ where: { workspaceId: { in: [WORKSPACE_A, WORKSPACE_B, WORKSPACE_INDEX] } } });
      await client.searchQueryMetric.deleteMany({ where: { workspaceId: { in: [WORKSPACE_A, WORKSPACE_B, WORKSPACE_INDEX] } } });
      await client.searchModelVersion.deleteMany({ where: { id: MODEL_IDENTITY.modelVersionId } });
    } } finally { await Promise.all([client.$disconnect(), core.dispose()]); }
  });

  it('filters deleted and wrong-workspace core sources without changing the live source', async () => {
    await storage.upsertChunks({ tenantId: WORKSPACE_A, researchObjectId: deletedRo, chunks: [{
      id: deletedChunk, artifactId: ARTIFACT_A, contentHash: HASH_A, ordinal: 0, language: 'en', text: 'deleted', tokenCount: 1,
      locators: [{ artifactId: ARTIFACT_A, contentHash: HASH_A, blockId: 'deleted', page: 1 }], claimIds: [],
      lexicalTerms: ['deleted'], termFrequencies: { deleted: 1 },
    }] });
    expect(await storage.hydrateCandidates({ tenantId: WORKSPACE_A, ids: [deletedChunk] }))
      .toMatchObject({ status: 'ok', candidates: [] });
    expect(await storage.hydrateCandidates({ tenantId: WORKSPACE_B, ids: [CHUNK_B] }))
      .toMatchObject({ status: 'ok', candidates: [] });
    expect(await storage.hydrateCandidates({ tenantId: WORKSPACE_A, ids: [CHUNK_A] }))
      .toMatchObject({ status: 'ok', candidates: [{ id: CHUNK_A }] });
  });

  it('keeps candidates tenant-scoped and deterministically ranked', async () => {
    const result = await lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'pulse', limit: 20 });
    expect(result).toMatchObject({ status: 'ok', needsReviewCount: 0 });
    if (result.status !== 'ok') throw new Error('search storage unavailable');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: CHUNK_A, tenantId: WORKSPACE_A, rank: 1 });
  });

  it('binds dense rows to the active full model identity and tenant', async () => {
    const result = await storage.denseCandidates({ tenantId: WORKSPACE_A, modelIdentity: MODEL_IDENTITY });
    expect(result).toMatchObject({ status: 'ok', needsReviewCount: 0 });
    if (result.status !== 'ok') throw new Error('dense storage unavailable');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.id).toBe(CHUNK_A);
    expect(result.candidates[0]?.vector[0]).toBe(1);

    await expect(storage.denseCandidates({ tenantId: WORKSPACE_B, modelIdentity: MODEL_IDENTITY }))
      .resolves.toEqual({ status: 'ok', candidates: [], needsReviewCount: 0 });
    await expect(storage.denseCandidates({
      tenantId: WORKSPACE_A,
      modelIdentity: { ...MODEL_IDENTITY, modelManifestSha256: '4'.repeat(64) },
    })).resolves.toEqual({ status: 'unavailable', code: 'model_identity_unavailable' });
  });

  it('persists content-free query telemetry through the bounded transaction', async () => {
    const queryHash = createHash('sha256').update(`${WORKSPACE_A}:opaque`).digest('hex');
    await storage.recordQueryMetric({
      tenantId: WORKSPACE_A,
      queryHash,
      lexicalAvailable: true,
      denseAvailable: true,
      resultCount: 1,
      lexicalLatencyMs: 2,
      denseLatencyMs: 3,
      totalLatencyMs: 4,
    });
    await expect(client.searchQueryMetric.findFirst({ where: { workspaceId: WORKSPACE_A, queryHash } }))
      .resolves.toMatchObject({ queryHash, lexicalAvailable: true, denseAvailable: true, resultCount: 1 });
  });

  it('stages generations, atomically flips lexical+dense state, and keeps an older replay inactive', async () => {
    const draft = (id: string, contentHash: string, text: string) => ({
      id,
      artifactId: ARTIFACT_INDEX,
      contentHash,
      ordinal: 0,
      language: 'en' as const,
      text,
      tokenCount: 2,
      locators: [{ artifactId: ARTIFACT_INDEX, contentHash, blockId: `block-${id.slice(0, 4)}`, page: 1 }],
      claimIds: [],
      lexicalTerms: text.split(' ').sort(),
      termFrequencies: Object.fromEntries(text.split(' ').map((term) => [term, 1])),
    });
    const vector = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
    vector.writeFloatLE(1, 0);
    const embedding = (chunkId: string) => ({
      chunkId,
      vector,
      vectorSha256: createHash('sha256').update(vector).digest('hex'),
      norm: 1,
    });

    const begunA = await storage.beginIndexTask({
      taskId: CORE_OWNER_TASK_A,
      tenantId: WORKSPACE_INDEX,
      researchObjectId: RESEARCH_OBJECT_INDEX,
      artifactId: ARTIFACT_INDEX,
      sourceVersionId: SOURCE_VERSION_A,
      sourceVersionNo: 1,
      contentHash: INDEX_HASH_A,
      sourceGenerationSha256: INDEX_SOURCE_MAP_A,
      sourceCreatedAt: new Date('2026-08-27T08:00:00.000Z'),
      leaseToken: INDEX_LEASE_A,
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    });
    expect(begunA).toMatchObject({ action: 'run', leaseToken: INDEX_LEASE_A });
    const searchTaskA = begunA.taskId;
    expect(searchTaskA).not.toBe(CORE_OWNER_TASK_A);
    await expect(client.searchIndexTask.findUnique({ where: { id: searchTaskA } }))
      .resolves.toMatchObject({ fenceOwnerTaskId: CORE_OWNER_TASK_A });
    await expect(storage.beginIndexTask({
      taskId: CORE_OWNER_TASK_A,
      tenantId: WORKSPACE_INDEX,
      researchObjectId: RESEARCH_OBJECT_INDEX,
      artifactId: ARTIFACT_INDEX,
      sourceVersionId: SOURCE_VERSION_A,
      sourceVersionNo: 1,
      contentHash: INDEX_HASH_A,
      sourceGenerationSha256: INDEX_SOURCE_MAP_A,
      sourceCreatedAt: new Date('2026-08-27T08:00:00.000Z'),
      leaseToken: INDEX_RECOVERY_LEASE,
      executionAttempt: 2,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'run', taskId: searchTaskA, leaseToken: INDEX_RECOVERY_LEASE });
    await storage.stageIndexGeneration({
      taskId: searchTaskA,
      leaseToken: INDEX_RECOVERY_LEASE,
      chunks: [draft(INDEX_CHUNK_A, INDEX_HASH_A, 'alpha pulse')],
    });
    await expect(storage.finalizeIndexGeneration({
      taskId: searchTaskA,
      leaseToken: INDEX_RECOVERY_LEASE,
      status: 'succeeded',
      embeddings: [embedding(INDEX_CHUNK_A)],
    })).resolves.toEqual({ activated: true });

    const begunB = await storage.beginIndexTask({
      taskId: CORE_OWNER_TASK_B,
      tenantId: WORKSPACE_INDEX,
      researchObjectId: RESEARCH_OBJECT_INDEX,
      artifactId: ARTIFACT_INDEX,
      sourceVersionId: SOURCE_VERSION_B,
      sourceVersionNo: 2,
      contentHash: INDEX_HASH_A,
      sourceGenerationSha256: INDEX_SOURCE_MAP_B,
      sourceCreatedAt: new Date('2026-08-27T09:00:00.000Z'),
      leaseToken: INDEX_LEASE_B,
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    });
    expect(begunB).toMatchObject({ action: 'run', leaseToken: INDEX_LEASE_B });
    const searchTaskB = begunB.taskId;
    expect(searchTaskB).not.toBe(CORE_OWNER_TASK_B);
    await expect(client.searchIndexTask.findUnique({ where: { id: searchTaskB } }))
      .resolves.toMatchObject({ fenceOwnerTaskId: CORE_OWNER_TASK_B });
    await storage.stageIndexGeneration({
      taskId: searchTaskB,
      leaseToken: INDEX_LEASE_B,
      chunks: [draft(INDEX_CHUNK_B, INDEX_HASH_A, 'beta pulse')],
    });

    // Staging is invisible: the prior lexical+dense generation remains current.
    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_A } }))
      .resolves.toMatchObject({ active: true });
    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_B } }))
      .resolves.toMatchObject({ active: false });
    await expect(storage.finalizeIndexGeneration({
      taskId: searchTaskB,
      leaseToken: INDEX_LEASE_B,
      status: 'needs_review',
      errorCode: 'embedding_unavailable',
      embeddings: [],
    })).resolves.toEqual({ activated: true });

    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_A } }))
      .resolves.toMatchObject({ active: false });
    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_B } }))
      .resolves.toMatchObject({ active: true });
    await expect(client.searchEmbedding.count({ where: { workspaceId: WORKSPACE_INDEX, chunkId: INDEX_CHUNK_A } }))
      .resolves.toBe(1);
    await expect(storage.denseCandidates({ tenantId: WORKSPACE_INDEX, modelIdentity: MODEL_IDENTITY }))
      .resolves.toEqual({ status: 'ok', candidates: [], needsReviewCount: 0 });

    // Reclaiming needs_review keeps the current lexical rows active until dense succeeds.
    const retryLease = '8'.repeat(64);
    await expect(storage.beginIndexTask({
      taskId: CORE_OWNER_TASK_B,
      tenantId: WORKSPACE_INDEX,
      researchObjectId: RESEARCH_OBJECT_INDEX,
      artifactId: ARTIFACT_INDEX,
      sourceVersionId: SOURCE_VERSION_B,
      sourceVersionNo: 2,
      contentHash: INDEX_HASH_A,
      sourceGenerationSha256: INDEX_SOURCE_MAP_B,
      sourceCreatedAt: new Date('2026-08-27T09:00:00.000Z'),
      leaseToken: retryLease,
      executionAttempt: 2,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'run', taskId: searchTaskB, leaseToken: retryLease });
    await storage.stageIndexGeneration({
      taskId: searchTaskB,
      leaseToken: retryLease,
      chunks: [draft(INDEX_CHUNK_B, INDEX_HASH_A, 'beta pulse')],
    });
    await expect(storage.finalizeIndexGeneration({
      taskId: searchTaskB,
      leaseToken: retryLease,
      status: 'succeeded',
      embeddings: [embedding(INDEX_CHUNK_B)],
    })).resolves.toEqual({ activated: true });
    await expect(client.searchIndexTask.findUnique({ where: { id: searchTaskB } }))
      .resolves.toMatchObject({ status: 'succeeded', attemptCount: 2, errorCode: null, isCurrent: true });
    const dense = await storage.denseCandidates({ tenantId: WORKSPACE_INDEX, modelIdentity: MODEL_IDENTITY });
    expect(dense).toMatchObject({ status: 'ok', needsReviewCount: 0 });
    if (dense.status !== 'ok') throw new Error('dense generation unavailable');
    expect(dense.candidates.map(({ id }) => id)).toEqual([INDEX_CHUNK_B]);

    // A delayed older source can finish successfully, but it cannot replace the current generation.
    const begunC = await storage.beginIndexTask({
      taskId: CORE_OWNER_TASK_C,
      tenantId: WORKSPACE_INDEX,
      researchObjectId: RESEARCH_OBJECT_INDEX,
      artifactId: ARTIFACT_INDEX,
      sourceVersionId: SOURCE_VERSION_A,
      sourceVersionNo: 1,
      contentHash: INDEX_HASH_A,
      sourceGenerationSha256: INDEX_SOURCE_MAP_C,
      sourceCreatedAt: new Date('2026-08-27T10:00:00.000Z'),
      leaseToken: INDEX_LEASE_C,
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    });
    expect(begunC).toMatchObject({ action: 'run', leaseToken: INDEX_LEASE_C });
    const searchTaskC = begunC.taskId;
    expect(searchTaskC).not.toBe(CORE_OWNER_TASK_C);
    await expect(client.searchIndexTask.findUnique({ where: { id: searchTaskC } }))
      .resolves.toMatchObject({ fenceOwnerTaskId: CORE_OWNER_TASK_C });
    await storage.stageIndexGeneration({
      taskId: searchTaskC,
      leaseToken: INDEX_LEASE_C,
      chunks: [draft(INDEX_CHUNK_C, INDEX_HASH_A, 'stale pulse')],
    });
    await expect(storage.finalizeIndexGeneration({
      taskId: searchTaskC,
      leaseToken: INDEX_LEASE_C,
      status: 'succeeded',
      embeddings: [embedding(INDEX_CHUNK_C)],
    })).resolves.toEqual({ activated: false });
    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_B } }))
      .resolves.toMatchObject({ active: true });
    await expect(client.searchChunk.findUnique({ where: { id: INDEX_CHUNK_C } }))
      .resolves.toMatchObject({ active: false });
    await expect(client.searchEmbedding.count({ where: { workspaceId: WORKSPACE_INDEX, chunkId: INDEX_CHUNK_C } }))
      .resolves.toBe(0);
  });

  it('fails closed on a real cross-tenant global chunk-ID collision', async () => {
    await storage.upsertChunks({
      tenantId: WORKSPACE_B,
      researchObjectId: RESEARCH_OBJECT,
      chunks: [{
        id: COLLISION_CHUNK, artifactId: ARTIFACT_B, contentHash: HASH_B, ordinal: 1,
        language: 'en', text: 'tenant b original', tokenCount: 3,
        locators: [{ artifactId: ARTIFACT_B, contentHash: HASH_B, blockId: 'collision', page: 1 }],
        claimIds: [], lexicalTerms: ['b', 'original', 'tenant'], termFrequencies: { tenant: 1, b: 1, original: 1 },
      }],
    });
    await expect(storage.upsertChunks({
      tenantId: WORKSPACE_A,
      researchObjectId: RESEARCH_OBJECT,
      chunks: [{
        id: COLLISION_CHUNK, artifactId: ARTIFACT_A, contentHash: HASH_A, ordinal: 1,
        language: 'en', text: 'tenant a overwrite', tokenCount: 3,
        locators: [{ artifactId: ARTIFACT_A, contentHash: HASH_A, blockId: 'collision', page: 1 }],
        claimIds: [], lexicalTerms: ['a', 'overwrite', 'tenant'], termFrequencies: { tenant: 1, a: 1, overwrite: 1 },
      }],
    })).rejects.toThrow();
    await expect(client.searchChunk.findUnique({ where: { id: COLLISION_CHUNK } }))
      .resolves.toMatchObject({ workspaceId: WORKSPACE_B, text: 'tenant b original' });
  });

  it('excludes a malformed TF row without making tenant search unavailable', async () => {
    const malformedFrequencies: unknown[] = ['not-a-number', 0, 1.5, 1e20];
    for (let index = 0; index < malformedFrequencies.length; index += 1) {
      await client.searchChunk.create({ data: {
        id: CORRUPT_TF_CHUNKS[index]!,
        workspaceId: WORKSPACE_A,
        researchObjectId: RESEARCH_OBJECT,
        artifactId: ARTIFACT_A,
        contentHash: HASH_A,
        ordinal: 90 + index,
        language: 'en',
        text: 'pulse malformed frequency',
        tokenCount: 3,
        locators: [{ artifactId: ARTIFACT_A, contentHash: HASH_A, blockId: `corrupt-tf-${index}`, page: 1 }],
        claimIds: [],
        lexicalTerms: ['frequency', 'malformed', 'pulse'],
        termFrequencies: { pulse: malformedFrequencies[index] } as Prisma.InputJsonValue,
        lexicalText: 'frequency malformed pulse',
        active: true,
      } });
    }

    const result = await lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'pulse', limit: 20 });
    expect(result).toMatchObject({ status: 'ok', needsReviewCount: 4 });
    if (result.status !== 'ok') throw new Error('search storage unavailable');
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([CHUNK_A]);
  });

  it('uses logical JSON bytes to reject a highly compressible hydration payload', async () => {
    const repeatedClaims = Array.from({ length: 45_000 }, () => 'x'.repeat(200));
    await client.searchChunk.create({ data: {
      id: COMPRESSED_PAYLOAD_CHUNK,
      workspaceId: WORKSPACE_A,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT_A,
      contentHash: HASH_A,
      ordinal: 99,
      language: 'en',
      text: 'compressed payload',
      tokenCount: 2,
      locators: [{ artifactId: ARTIFACT_A, contentHash: HASH_A, blockId: 'compressed', page: 1 }],
      claimIds: repeatedClaims,
      lexicalTerms: ['compressed', 'payload'],
      termFrequencies: { compressed: 1, payload: 1 },
      lexicalText: 'compressed payload',
      active: true,
    } });
    const sizes = await client.$queryRaw<Array<{ logical_bytes: number; physical_bytes: number }>>(Prisma.sql`
      SELECT octet_length("claim_ids"::text)::integer AS logical_bytes,
             pg_column_size("claim_ids")::integer AS physical_bytes
      FROM "search_chunks" WHERE "id" = ${COMPRESSED_PAYLOAD_CHUNK}
    `);
    expect(sizes[0]?.logical_bytes).toBeGreaterThan(8 * 1_024 * 1_024);
    expect(sizes[0]!.physical_bytes).toBeLessThan(sizes[0]!.logical_bytes);
    await expect(storage.hydrateCandidates({ tenantId: WORKSPACE_A, ids: [COMPRESSED_PAYLOAD_CHUNK] }))
      .resolves.toEqual({ status: 'unavailable', code: 'lexical_capacity_exceeded' });
  });

  it('keeps the exact production candidate SQL GIN-eligible with tenant indexes present', async () => {
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "search_chunks" (
        "id", "workspace_id", "research_object_id", "artifact_id", "content_hash", "ordinal",
        "language", "text", "token_count", "locators", "claim_ids", "lexical_terms",
        "term_frequencies", "lexical_text", "active"
      )
      SELECT repeat('f', 56) || lpad(to_hex(series), 8, '0'),
             ${WORKSPACE_A}::uuid, ${RESEARCH_OBJECT}::uuid, ${ARTIFACT_A}::uuid, ${HASH_A}, 1000 + series,
             'en', 'unrelated filler', 2,
             jsonb_build_array(jsonb_build_object(
               'artifactId', ${ARTIFACT_A}, 'contentHash', ${HASH_A},
               'blockId', 'gin-filler-' || series, 'page', 1
             )),
             '[]'::jsonb, '["filler", "unrelated"]'::jsonb,
             '{"filler": 1, "unrelated": 1}'::jsonb, 'filler unrelated', true
      FROM generate_series(1, 2048) AS series
    `);
    await client.$executeRaw(Prisma.sql`ANALYZE "search_chunks"`);
    const plan = await client.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`SET LOCAL enable_seqscan = off`);
      await transaction.$executeRaw(Prisma.sql`SET LOCAL enable_indexscan = off`);
      const query = buildLexicalCandidateQuery({
        tenantId: WORKSPACE_A,
        query: 'pulse experiment',
        terms: ['pulse', 'experiment'],
      });
      return transaction.$queryRaw<Array<{ 'QUERY PLAN': string }>>(Prisma.sql`EXPLAIN (COSTS OFF) ${query}`);
    });
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toContain('search_chunks_search_vector_idx');
    expect(text).toContain('BitmapOr');
  });
});

// Real Search DB fixture; the separate Core DB lifecycle boundary is injected.
// No embeddings/model calls: stored unit vectors exercise the production SQL and rankers.
describe.skipIf(DATABASE_URL === undefined)('SearchStorage exact generation integration', () => {
  const client = createSearchPrismaClient({ datasourceUrl: DATABASE_URL ?? 'postgresql://invalid' });
  const workspace = randomUUID();
  const generation = Object.freeze({ researchObjectId: randomUUID(), artifactId: randomUUID(),
    sourceVersionId: randomUUID(), contentHash: 'c'.repeat(64), fenceOwnerTaskId: randomUUID() });
  const foreign = { ...generation, researchObjectId: randomUUID(), fenceOwnerTaskId: randomUUID() };
  const taskId = randomUUID(), foreignTaskId = randomUUID();
  const chunkId = createHash('sha256').update(taskId).digest('hex');
  const foreignChunkId = createHash('sha256').update(foreignTaskId).digest('hex');
  const model = { ...MODEL_IDENTITY, modelVersionId: randomUUID() };
  const vector = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
  vector.writeFloatLE(1, 0);
  let mutationAllowed = false;
  let sourceLive = true;
  let lifecycleReads = 0;
  const core = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      $executeRaw: async () => 1,
      researchObject: { findMany: async () => {
        lifecycleReads += 1;
        return sourceLive ? [generation, foreign].map(s => ({ id: s.researchObjectId, workspaceId: workspace, deletedAt: null })) : [];
      } },
      artifact: { findMany: async () => [{ id: generation.artifactId, workspaceId: workspace, deletedAt: null, bytesPurgedAt: null }] },
      agentTask: { findMany: async () => [generation, foreign].map(s => ({ id: s.fenceOwnerTaskId,
        sessionId: workspace, payload: {}, deletedAt: null, session: { deletedAt: null } })) },
      version: { findMany: async () => [] },
    }),
  };
  const storage = new SearchStorage(client, core as never);
  const lexical = () => storage.lexicalCandidates({ tenantId: workspace, query: 'pulse', terms: ['pulse'], limit: 1, generation });
  const dense = () => storage.denseCandidates({ tenantId: workspace, modelIdentity: model, generation });
  const hydrate = () => storage.hydrateCandidates({ tenantId: workspace, ids: [chunkId, foreignChunkId], generation });
  const service = createHybridSearchService({ storage, modelIdentity: model, telemetryKey: new Uint8Array(32).fill(9),
    embedder: { embed: async () => ({ ...model, dimension: 1024, vectors: [Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0)] }) } });

  beforeAll(async () => {
    const expectedName = expectedDisposableDatabaseName();
    const rows = await client.$queryRaw<Array<{ name: string }>>(Prisma.sql`SELECT current_database() AS name`);
    if (rows[0]?.name !== expectedName) throw new Error('connected database identity does not match disposable URL');
    mutationAllowed = true;
    await client.searchModelVersion.create({ data: { id: model.modelVersionId, provider: 'BAAI', model: 'bge-m3',
      revision: model.modelRevision, dimension: 1024, sourceSha256: model.sourceSha256,
      packageFreezeSha256: model.packageFreezeSha256, modelManifestSha256: model.modelManifestSha256, status: 'active' } });
    for (const [scope, id, chunk, strength] of [[generation, taskId, chunkId, 1], [foreign, foreignTaskId, foreignChunkId, 8]] as const) {
      await client.searchIndexTask.create({ data: {
        id, workspaceId: workspace, researchObjectId: scope.researchObjectId, artifactId: scope.artifactId,
        sourceVersionId: scope.sourceVersionId, sourceVersionNo: 1, contentHash: scope.contentHash,
        sourceGenerationSha256: createHash('sha256').update(id).digest('hex'), sourceCreatedAt: new Date(),
        modelVersionId: model.modelVersionId, fenceOwnerTaskId: scope.fenceOwnerTaskId, status: 'succeeded', isCurrent: true,
      } });
      await client.searchChunk.create({ data: {
        id: chunk, workspaceId: workspace, researchObjectId: scope.researchObjectId, artifactId: scope.artifactId,
        sourceVersionId: scope.sourceVersionId, sourceVersionNo: 1, indexTaskId: id, contentHash: scope.contentHash,
        ordinal: 0, language: 'en', text: 'pulse '.repeat(strength), tokenCount: strength,
        locators: [{ artifactId: scope.artifactId, contentHash: scope.contentHash, blockId: chunk, page: 1 }],
        claimIds: [], lexicalTerms: ['pulse'], termFrequencies: { pulse: strength }, lexicalText: 'pulse', active: true,
      } });
      await client.searchEmbedding.create({ data: { workspaceId: workspace, chunkId: chunk,
        modelVersionId: model.modelVersionId, dimension: 1024, vector,
        vectorSha256: createHash('sha256').update(vector).digest('hex'), norm: 1 } });
    }
  });

  afterAll(async () => {
    if (mutationAllowed) {
      await client.searchChunk.deleteMany({ where: { workspaceId: workspace } });
      await client.searchIndexTask.deleteMany({ where: { workspaceId: workspace } });
      await client.searchQueryMetric.deleteMany({ where: { workspaceId: workspace } });
      await client.searchModelVersion.deleteMany({ where: { id: model.modelVersionId } });
    }
    await client.$disconnect();
  });

  it('excludes a stronger foreign RO before BM25 statistics and limit, and keeps the old unscoped result', async () => {
    const scoped = await lexical();
    expect(scoped).toMatchObject({ status: 'ok', corpus: { documentCount: 1, averageLength: 1 },
      documentFrequencies: { pulse: 1 }, candidates: [{ id: chunkId }] });
    expect(await lexicalSearch({ storage, tenantId: workspace, query: 'pulse', limit: 1, generation }))
      .toMatchObject({ status: 'ok', candidates: [{ id: chunkId, rank: 1 }] });
    expect(await lexicalSearch({ storage, tenantId: workspace, query: 'pulse', limit: 1 }))
      .toMatchObject({ status: 'ok', candidates: [{ id: foreignChunkId, rank: 1 }] });
    expect(await dense()).toMatchObject({ status: 'ok', candidates: [{ id: chunkId }] });
    const result = await service.searchGeneration({ tenantId: workspace, query: 'pulse', limit: 1, generation });
    expect(result).toMatchObject({ status: 'ok', mode: 'hybrid', candidates: [{ id: chunkId }] });
    expect(JSON.stringify(result)).not.toContain(generation.fenceOwnerTaskId);
    expect(lifecycleReads).toBeGreaterThan(0);
  });

  it.each([
    ['old-version', { sourceVersionId: randomUUID() }, { sourceVersionId: generation.sourceVersionId }],
    ['wrong-artifact', { artifactId: randomUUID() }, { artifactId: generation.artifactId }],
    ['wrong-content', { contentHash: 'e'.repeat(64) }, { contentHash: generation.contentHash }],
    ['inactive', { active: false }, { active: true }],
    ['legacy-no-generation', { indexTaskId: null }, { indexTaskId: taskId }],
  ] as const)('excludes %s at every retrieval phase', async (_name, change, restore) => {
    await client.searchChunk.update({ where: { id: chunkId }, data: change });
    try {
      expect(await lexical()).toMatchObject({ status: 'ok', corpus: { documentCount: 0 }, candidates: [] });
      expect(await dense()).toMatchObject({ status: 'ok', candidates: [] });
      expect(await hydrate()).toMatchObject({ status: 'ok', candidates: [] });
    } finally {
      await client.searchChunk.update({ where: { id: chunkId }, data: restore });
    }
  });

  it.each([
    ['wrong-owner', { fenceOwnerTaskId: randomUUID() }, { fenceOwnerTaskId: generation.fenceOwnerTaskId }],
    ['non-current', { isCurrent: false }, { isCurrent: true }],
    ['failed', { status: 'failed' }, { status: 'succeeded' }],
    ['needs-review', { status: 'needs_review' }, { status: 'succeeded' }],
    ['task-chunk-version-mismatch', { sourceVersionId: randomUUID() }, { sourceVersionId: generation.sourceVersionId }],
  ] as const)('excludes %s without falling back to the foreign RO', async (_name, change, restore) => {
    await client.searchIndexTask.update({ where: { id: taskId }, data: change });
    try {
      expect(await lexical()).toMatchObject({ status: 'ok', corpus: { documentCount: 0 }, candidates: [] });
      expect(await dense()).toMatchObject({ status: 'ok', candidates: [] });
      expect(await hydrate()).toMatchObject({ status: 'ok', candidates: [] });
    } finally {
      await client.searchIndexTask.update({ where: { id: taskId }, data: restore });
    }
  });

  it('keeps workspace and core lifecycle restrictions on a valid generation', async () => {
    expect(await storage.lexicalCandidates({ tenantId: randomUUID(), query: 'pulse', terms: ['pulse'], limit: 1, generation }))
      .toMatchObject({ status: 'ok', corpus: { documentCount: 0 }, candidates: [] });
    sourceLive = false;
    try { expect(await hydrate()).toMatchObject({ status: 'ok', candidates: [] }); }
    finally { sourceLive = true; }
  });

  it('excludes unrelated payload bytes before hydration capacity and loads only this source', async () => {
    await client.$executeRaw(Prisma.sql`UPDATE "search_chunks" SET "text" = repeat('x', 9 * 1024 * 1024) WHERE "id" = ${foreignChunkId}`);
    try {
      expect(await hydrate()).toMatchObject({ status: 'ok', candidates: [{ id: chunkId }] });
      expect(await storage.hydrateCandidates({ tenantId: workspace, ids: [chunkId, foreignChunkId] }))
        .toEqual({ status: 'unavailable', code: 'lexical_capacity_exceeded' });
    } finally { await client.searchChunk.update({ where: { id: foreignChunkId }, data: { text: 'pulse '.repeat(8) } }); }
  });

  it('excludes unrelated rows before lexical and dense corpus capacity', async () => {
    try {
      await client.$executeRaw(Prisma.sql`
        INSERT INTO "search_chunks" ("id", "workspace_id", "research_object_id", "artifact_id", "source_version_id", "index_task_id",
          "content_hash", "ordinal", "language", "text", "token_count", "locators", "claim_ids", "lexical_terms", "term_frequencies", "lexical_text", "active", "updated_at")
        SELECT md5(${workspace} || series::text) || md5('filler' || ${workspace} || series::text),
          "workspace_id", "research_object_id", "artifact_id", "source_version_id", "index_task_id", "content_hash", series,
          'en', 'pulse', 1, "locators", '[]'::jsonb, '["pulse"]'::jsonb, '{"pulse":1}'::jsonb, 'pulse', true, NOW()
        FROM "search_chunks" CROSS JOIN generate_series(1, 10001) AS series WHERE "id" = ${foreignChunkId}
      `);
      await client.$executeRaw(Prisma.sql`
        INSERT INTO "search_embeddings" ("id", "workspace_id", "chunk_id", "model_version_id", "dimension", "vector", "vector_sha256", "norm")
        SELECT md5(chunk."id")::uuid, chunk."workspace_id", chunk."id", embedding."model_version_id", embedding."dimension", embedding."vector", embedding."vector_sha256", embedding."norm"
        FROM "search_chunks" chunk CROSS JOIN "search_embeddings" embedding
        WHERE chunk."index_task_id" = ${foreignTaskId}::uuid AND chunk."ordinal" > 0 AND embedding."chunk_id" = ${foreignChunkId}
      `);
      expect(await lexical()).toMatchObject({ status: 'ok', corpus: { documentCount: 1 }, candidates: [{ id: chunkId }] });
      expect(await dense()).toMatchObject({ status: 'ok', candidates: [{ id: chunkId }] });
      expect(await storage.lexicalCandidates({ tenantId: workspace, query: 'pulse', terms: ['pulse'], limit: 1 }))
        .toEqual({ status: 'unavailable', code: 'lexical_capacity_exceeded' });
      expect(await storage.denseCandidates({ tenantId: workspace, modelIdentity: model }))
        .toEqual({ status: 'unavailable', code: 'dense_capacity_exceeded' });
    } finally { await client.searchChunk.deleteMany({ where: { indexTaskId: foreignTaskId, ordinal: { gt: 0 } } }); }
  }, 30_000);

  it('degrades honestly to this generation lexical results when BGE is unavailable', async () => {
    let requests = 0;
    const degraded = createHybridSearchService({ storage, modelIdentity: model, telemetryKey: new Uint8Array(32).fill(9),
      embedder: { embed: async () => { requests += 1; throw new Error('unavailable'); } } });
    expect(await degraded.searchGeneration({ tenantId: workspace, query: 'pulse', limit: 1, generation }))
      .toMatchObject({ status: 'ok', mode: 'lexical_only', degradationCode: 'embedding_unavailable', candidates: [{ id: chunkId }] });
    expect(requests).toBe(1);
  });
});
