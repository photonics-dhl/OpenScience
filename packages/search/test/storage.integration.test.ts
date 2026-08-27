import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SearchStorage, createSearchPrismaClient, lexicalSearch } from '../src';
import { buildLexicalCandidateQuery } from '../src/storage';
import { Prisma } from '../generated/client';

const DATABASE_URL = process.env.SEARCH_TEST_DATABASE_URL;
const WORKSPACE_A = randomUUID();
const WORKSPACE_B = randomUUID();
const RESEARCH_OBJECT = randomUUID();
const ARTIFACT_A = randomUUID();
const ARTIFACT_B = randomUUID();
const CHUNK_A = createHash('sha256').update(`${WORKSPACE_A}:chunk-a`).digest('hex');
const CHUNK_B = createHash('sha256').update(`${WORKSPACE_B}:chunk-b`).digest('hex');
const COLLISION_CHUNK = createHash('sha256').update(`${WORKSPACE_B}:collision`).digest('hex');
const CORRUPT_TF_CHUNKS = Array.from({ length: 4 }, (_, index) =>
  createHash('sha256').update(`${WORKSPACE_A}:corrupt-tf:${index}`).digest('hex'));
const COMPRESSED_PAYLOAD_CHUNK = createHash('sha256').update(`${WORKSPACE_A}:compressed-payload`).digest('hex');
const HASH_A = createHash('sha256').update(`${WORKSPACE_A}:content`).digest('hex');
const HASH_B = createHash('sha256').update(`${WORKSPACE_B}:content`).digest('hex');

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

describe.skipIf(DATABASE_URL === undefined)('SearchStorage ECS integration', () => {
  const client = createSearchPrismaClient({ datasourceUrl: DATABASE_URL ?? 'postgresql://invalid' });
  const storage = new SearchStorage(client);
  let mutationAllowed = false;

  beforeAll(async () => {
    const expectedName = expectedDisposableDatabaseName();
    const rows = await client.$queryRaw<Array<{ name: string }>>(Prisma.sql`SELECT current_database() AS name`);
    if (rows[0]?.name !== expectedName) throw new Error('connected database identity does not match disposable URL');
    mutationAllowed = true;
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
  });

  afterAll(async () => {
    if (mutationAllowed) {
      await client.searchChunk.deleteMany({ where: { workspaceId: { in: [WORKSPACE_A, WORKSPACE_B] } } });
    }
    await client.$disconnect();
  });

  it('keeps candidates tenant-scoped and deterministically ranked', async () => {
    const result = await lexicalSearch({ storage, tenantId: WORKSPACE_A, query: 'pulse', limit: 20 });
    expect(result).toMatchObject({ status: 'ok', needsReviewCount: 0 });
    if (result.status !== 'ok') throw new Error('search storage unavailable');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: CHUNK_A, tenantId: WORKSPACE_A, rank: 1 });
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
