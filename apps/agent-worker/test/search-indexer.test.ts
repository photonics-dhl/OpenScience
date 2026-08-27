import { describe, expect, it, vi } from 'vitest';
import type { DocumentSourceMap } from '@openscience/domain';

import type { AiGateway } from '@openscience/ai-gateway';

import { createHandlers } from '../src/index';
import { authorizeSearchIndexJob, createSearchIndexer, parseSearchIndexPayload } from '../src/search-indexer';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TASK = '55555555-5555-4555-8555-555555555555';
const RESEARCH_OBJECT = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const SOURCE_VERSION = '77777777-7777-4777-8777-777777777777';
const CONTENT_HASH = 'a'.repeat(64);
const SOURCE_CREATED_AT = new Date('2026-08-27T08:00:00.000Z');
const MODEL_IDENTITY = {
  modelVersionId: '44444444-4444-4444-8444-444444444444',
  modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
  sourceSha256: '1'.repeat(64),
  packageFreezeSha256: '2'.repeat(64),
  modelManifestSha256: '3'.repeat(64),
};

function sourceMap(text = 'measured pulse width is forty two femtoseconds'): DocumentSourceMap {
  const parser = { name: 'fixture', version: '1.0.0' };
  return {
    artifactId: ARTIFACT,
    contentHash: CONTENT_HASH,
    parser,
    pages: [{
      page: 1,
      width: 612,
      height: 792,
      blocks: [{
        id: 'paragraph-1', kind: 'paragraph', text,
        boundingBox: { x: 1, y: 1, width: 100, height: 20 },
        parser,
        transformations: [{ stage: 'extract_text', processor: parser }],
      }],
    }],
  };
}

function job(map = sourceMap()) {
  return {
    taskId: TASK,
    tenantId: TENANT,
    researchObjectId: RESEARCH_OBJECT,
    artifactId: ARTIFACT,
    sourceVersionId: SOURCE_VERSION,
    sourceVersionNo: 1,
    contentHash: CONTENT_HASH,
    sourceCreatedAt: SOURCE_CREATED_AT,
    sourceExecutionAttempt: 1,
    sourceMap: map,
    claimIdsByBlockId: { 'paragraph-1': ['claim-1'] },
  };
}

function unitVector(): number[] {
  return [1, ...Array.from({ length: 1023 }, () => 0)];
}

function dependencies() {
  const lexical = new Map<string, unknown>();
  const dense = new Map<string, unknown>();
  return {
    lexical,
    dense,
    storage: {
      beginIndexTask: vi.fn(async (input: { leaseToken: string }) => ({
        action: 'run' as const, taskId: TASK, leaseToken: input.leaseToken,
      })),
      stageIndexGeneration: vi.fn(async (input: { chunks: Array<{ id: string }> }) => {
        for (const chunk of input.chunks) lexical.set(chunk.id, chunk);
      }),
      finalizeIndexGeneration: vi.fn(async (input: { embeddings: Array<{ chunkId: string }> }) => {
        for (const embedding of input.embeddings) dense.set(embedding.chunkId, embedding);
        return { activated: true };
      }),
      renewIndexTaskLease: vi.fn(async () => undefined),
      failIndexTask: vi.fn(async () => undefined),
    },
    embedder: {
      embed: vi.fn(async ({ texts }: { texts: string[] }) => ({
        ...MODEL_IDENTITY,
        dimension: 1024 as const,
        vectors: texts.map(() => unitVector()),
      })),
    },
  };
}

describe('search indexer', () => {
  it('registers a strict internal search.index handler without exposing source text in its result', async () => {
    const deps = dependencies();
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });
    const handlers = createHandlers({} as AiGateway, { searchIndexer: indexer });
    const payload = { artifactId: ARTIFACT, sourceMap: sourceMap() };
    const workerDeps = {
      prisma: {
        agentTask: { findUnique: vi.fn(async () => ({
          id: TASK,
          kind: 'search.index',
          status: 'running',
          executionAttempt: 1,
          payload,
          createdAt: SOURCE_CREATED_AT,
          session: {
            userId: '66666666-6666-4666-8666-666666666666',
            researchObject: { id: RESEARCH_OBJECT, workspaceId: TENANT },
          },
        })) },
        artifact: { findUnique: vi.fn(async () => ({ id: ARTIFACT, workspaceId: TENANT, blobSha256: CONTENT_HASH })) },
        membership: { findUnique: vi.fn(async () => ({ id: 'membership-1' })) },
        version: { findFirst: vi.fn(async () => ({ id: SOURCE_VERSION, versionNo: 1 })) },
        claimNode: { findMany: vi.fn() },
      },
    };

    await expect(handlers['search.index']!(workerDeps as never, { id: TASK, payload, executionAttempt: 1 }))
      .resolves.toEqual({ status: 'succeeded', chunkCount: 1, denseChunkCount: 1, activated: true });
    expect(deps.storage.beginIndexTask).toHaveBeenCalledWith(expect.objectContaining({
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
    }));
    expect(() => parseSearchIndexPayload({ ...payload, injected: true })).toThrow(/unknown fields/i);
  });

  it('bounds and scopes claim mappings before any authority query', () => {
    const payload = { artifactId: ARTIFACT, versionId: SOURCE_VERSION, sourceMap: sourceMap() };
    const tooManyClaims = Array.from({ length: 33 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`);
    expect(() => parseSearchIndexPayload({
      ...payload,
      claimIdsByBlockId: { 'paragraph-1': tooManyClaims },
    })).toThrow(/claim mapping/i);
    expect(() => parseSearchIndexPayload({
      ...payload,
      claimIdsByBlockId: { 'unknown-block': [SOURCE_VERSION] },
    })).toThrow(/claim mapping/i);
  });

  it('uses the stored task payload and fails closed on cross-workspace artifacts', async () => {
    const authoritativePayload = { artifactId: ARTIFACT, sourceMap: sourceMap() };
    const prisma = {
      agentTask: { findUnique: vi.fn(async () => ({
        id: TASK,
        kind: 'search.index',
        status: 'running',
        executionAttempt: 1,
        payload: authoritativePayload,
        createdAt: SOURCE_CREATED_AT,
        session: {
          userId: '66666666-6666-4666-8666-666666666666',
          researchObject: { id: RESEARCH_OBJECT, workspaceId: TENANT },
        },
      })) },
      artifact: { findUnique: vi.fn(async () => ({
        id: ARTIFACT,
        workspaceId: '99999999-9999-4999-8999-999999999999',
        blobSha256: CONTENT_HASH,
      })) },
      membership: { findUnique: vi.fn() },
      version: { findFirst: vi.fn() },
      claimNode: { findMany: vi.fn() },
    };

    await expect(authorizeSearchIndexJob({ prisma } as never, { id: TASK, executionAttempt: 1 }))
      .rejects.toThrow(/authority mismatch/i);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    expect(prisma.version.findFirst).not.toHaveBeenCalled();
  });

  it('requires the artifact to be bound to the task research object manifest', async () => {
    const payload = { artifactId: ARTIFACT, sourceMap: sourceMap() };
    const prisma = {
      agentTask: { findUnique: vi.fn(async () => ({
        id: TASK,
        kind: 'search.index',
        status: 'running',
        executionAttempt: 1,
        payload,
        createdAt: SOURCE_CREATED_AT,
        session: {
          userId: '66666666-6666-4666-8666-666666666666',
          researchObject: { id: RESEARCH_OBJECT, workspaceId: TENANT },
        },
      })) },
      artifact: { findUnique: vi.fn(async () => ({ id: ARTIFACT, workspaceId: TENANT, blobSha256: CONTENT_HASH })) },
      membership: { findUnique: vi.fn(async () => ({ id: 'membership-1' })) },
      version: { findFirst: vi.fn(async () => null) },
      claimNode: { findMany: vi.fn() },
    };

    await expect(authorizeSearchIndexJob({ prisma } as never, { id: TASK, executionAttempt: 1 }))
      .rejects.toThrow(/version artifact scope mismatch/i);
  });

  it('is idempotent for the same artifact generation', async () => {
    const deps = dependencies();
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await indexer.index(job());
    await indexer.index(job());

    expect(deps.lexical.size).toBe(1);
    expect(deps.dense.size).toBe(1);
    expect(deps.storage.finalizeIndexGeneration).toHaveBeenCalledTimes(2);
  });

  it('includes canonical claim bindings in the persisted source generation identity', async () => {
    const deps = dependencies();
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await indexer.index({ ...job(), claimIdsByBlockId: { 'paragraph-1': ['claim-b', 'claim-a'] } });
    await indexer.index({ ...job(), claimIdsByBlockId: { 'paragraph-1': ['claim-a', 'claim-b'] } });
    await indexer.index({ ...job(), claimIdsByBlockId: { 'paragraph-1': ['claim-c'] } });

    const generationHashes = deps.storage.beginIndexTask.mock.calls
      .map(([input]) => input.sourceGenerationSha256);
    expect(generationHashes[0]).toBe(generationHashes[1]);
    expect(generationHashes[0]).not.toBe(generationHashes[2]);
  });

  it('scopes every chunk ID to the complete claim generation', async () => {
    const deps = dependencies();
    const map = sourceMap();
    const parser = map.parser;
    map.pages[0]!.blocks = [
      {
        id: 'reference-1', kind: 'reference',
        text: Array.from({ length: 600 }, (_, index) => `first${index}`).join(' '),
        boundingBox: { x: 1, y: 1, width: 100, height: 20 }, parser, transformations: [],
      },
      {
        id: 'reference-2', kind: 'reference',
        text: Array.from({ length: 600 }, (_, index) => `second${index}`).join(' '),
        boundingBox: { x: 1, y: 30, width: 100, height: 20 }, parser, transformations: [],
      },
    ];
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });
    await indexer.index({ ...job(map), claimIdsByBlockId: { 'reference-1': ['claim-a'] } });
    const firstIds = deps.storage.stageIndexGeneration.mock.calls[0]![0].chunks.map(({ id }) => id);
    await indexer.index({ ...job(map), claimIdsByBlockId: { 'reference-1': ['claim-b'] } });
    const secondIds = deps.storage.stageIndexGeneration.mock.calls[1]![0].chunks.map(({ id }) => id);

    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(secondIds.every((id) => !firstIds.includes(id))).toBe(true);
  });

  it('does not report a coalesced running generation as a completed core task', async () => {
    const deps = dependencies();
    deps.storage.beginIndexTask.mockResolvedValueOnce({
      action: 'skip', taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'running',
    });
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await expect(indexer.index(job())).rejects.toThrow('index_generation_running');
    expect(deps.storage.stageIndexGeneration).not.toHaveBeenCalled();
    expect(deps.storage.finalizeIndexGeneration).not.toHaveBeenCalled();
  });

  it('preserves the persisted needs-review reason for an exhausted generation', async () => {
    const deps = dependencies();
    deps.storage.beginIndexTask.mockResolvedValueOnce({
      action: 'skip', taskId: TASK, status: 'needs_review', errorCode: 'no_searchable_content',
    });
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await expect(indexer.index(job())).resolves.toEqual({
      status: 'needs_review', chunkCount: 0, errorCode: 'no_searchable_content',
    });
  });

  it('scopes chunk row IDs by model version so a model upgrade can stage concurrently', async () => {
    const deps = dependencies();
    const first = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });
    await first.index(job());
    const firstId = deps.storage.stageIndexGeneration.mock.calls[0]![0].chunks[0]!.id;
    deps.storage.stageIndexGeneration.mockClear();
    const second = createSearchIndexer({
      ...deps,
      modelIdentity: { ...MODEL_IDENTITY, modelVersionId: '88888888-8888-4888-8888-888888888888' },
    });
    await second.index(job());
    const secondId = deps.storage.stageIndexGeneration.mock.calls[0]![0].chunks[0]!.id;

    expect(firstId).not.toBe(secondId);
  });

  it('marks the leased search task failed when staging cannot complete', async () => {
    const deps = dependencies();
    deps.storage.stageIndexGeneration.mockRejectedValueOnce(new Error('database unavailable'));
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await expect(indexer.index(job())).rejects.toThrow('index_storage_unavailable');
    expect(deps.storage.failIndexTask).toHaveBeenCalledOnce();
  });

  it('renews the lease for each CPU embedding batch and compensates finalization failure', async () => {
    const deps = dependencies();
    deps.storage.finalizeIndexGeneration.mockRejectedValue(new Error('database unavailable'));
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await expect(indexer.index(job())).rejects.toThrow('index_storage_unavailable');
    expect(deps.storage.renewIndexTaskLease).toHaveBeenCalledOnce();
    expect(deps.storage.finalizeIndexGeneration).toHaveBeenCalledTimes(3);
    expect(deps.storage.failIndexTask).toHaveBeenCalledOnce();
  });

  it('rejects a stale source map before writing either generation', async () => {
    const deps = dependencies();
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    await expect(indexer.index(job(sourceMap('stale')))).resolves.toMatchObject({ status: 'succeeded' });
    await expect(indexer.index({ ...job(), contentHash: 'b'.repeat(64) })).rejects.toThrow(/content hash/i);
    expect(deps.storage.stageIndexGeneration).toHaveBeenCalledTimes(1);
  });

  it('keeps lexical chunks active and returns content-free needs_review when embedding fails', async () => {
    const deps = dependencies();
    deps.embedder.embed.mockRejectedValueOnce(new Error('transport failed'));
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    const result = await indexer.index(job());

    expect(result).toEqual({ status: 'needs_review', chunkCount: 1, errorCode: 'embedding_unavailable' });
    expect(deps.lexical.size).toBe(1);
    expect(deps.dense.size).toBe(0);
    expect(JSON.stringify(result)).not.toContain('measured pulse');
    expect(deps.storage.finalizeIndexGeneration).toHaveBeenCalledWith(expect.objectContaining({
      taskId: TASK, status: 'needs_review', errorCode: 'embedding_unavailable', embeddings: [],
    }));
  });

  it('embeds in batches of at most eight and commits dense rows once', async () => {
    const deps = dependencies();
    const map = sourceMap();
    const parser = map.parser;
    map.pages[0]!.blocks = Array.from({ length: 10 }, (_, blockIndex) => ({
      id: `paragraph-${blockIndex + 1}`,
      kind: 'paragraph' as const,
      text: Array.from({ length: 900 }, (_, index) => `pulse${blockIndex}-${index}`).join(' '),
      boundingBox: { x: 1, y: blockIndex * 20 + 1, width: 100, height: 20 },
      parser,
      transformations: [{ stage: 'extract_text' as const, processor: parser }],
    }));
    const indexer = createSearchIndexer({ ...deps, modelIdentity: MODEL_IDENTITY });

    const result = await indexer.index(job(map));

    expect(result).toMatchObject({ status: 'succeeded' });
    expect(deps.embedder.embed.mock.calls.every(([input]) => input.texts.length <= 8)).toBe(true);
    expect(deps.storage.finalizeIndexGeneration).toHaveBeenCalledOnce();
  });
});
