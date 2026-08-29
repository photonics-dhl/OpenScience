import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { SearchStorage } from '../src/storage';

const TENANT = '11111111-1111-4111-8111-111111111111';
const RESEARCH_OBJECT = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const SOURCE_VERSION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTENT_HASH = 'a'.repeat(64);
const CHUNK = 'b'.repeat(64);
const TASK = '55555555-5555-4555-8555-555555555555';
const OTHER_TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CURRENT_TASK = '66666666-6666-4666-8666-666666666666';
const LEASE = '7'.repeat(64);
const SOURCE_MAP_HASH = '8'.repeat(64);
const SOURCE_CREATED_AT = new Date('2026-08-27T08:00:00.000Z');
const MODEL_IDENTITY = {
  modelVersionId: '44444444-4444-4444-8444-444444444444',
  modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
  sourceSha256: '1'.repeat(64),
  packageFreezeSha256: '2'.repeat(64),
  modelManifestSha256: '3'.repeat(64),
};

function chunk() {
  return {
    id: CHUNK,
    artifactId: ARTIFACT,
    contentHash: CONTENT_HASH,
    ordinal: 0,
    language: 'en' as const,
    text: 'bounded pulse',
    tokenCount: 2,
    locators: [{ artifactId: ARTIFACT, contentHash: CONTENT_HASH, blockId: 'block-1', page: 1 }],
    claimIds: [],
    lexicalTerms: ['bounded', 'pulse'],
    termFrequencies: { bounded: 1, pulse: 1 },
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK,
    workspaceId: TENANT,
    researchObjectId: RESEARCH_OBJECT,
    artifactId: ARTIFACT,
    sourceVersionId: SOURCE_VERSION,
    sourceVersionNo: 1,
    contentHash: CONTENT_HASH,
    modelVersionId: MODEL_IDENTITY.modelVersionId,
    sourceGenerationSha256: SOURCE_MAP_HASH,
    sourceCreatedAt: SOURCE_CREATED_AT,
    status: 'running',
    attemptCount: 1,
    leaseToken: LEASE,
    fenceOwnerTaskId: TASK,
    fenceOwnerCreatedAt: SOURCE_CREATED_AT,
    fenceOwnerAttempt: 1,
    leaseExpiresAt: new Date(Date.now() + 60_000),
    isCurrent: false,
    ...overrides,
  };
}

function vectorDraft() {
  const vector = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
  vector.writeFloatLE(1, 0);
  return {
    chunkId: CHUNK,
    vector,
    vectorSha256: createHash('sha256').update(vector).digest('hex'),
    norm: 1,
  };
}

describe('leased index generation storage', () => {
  it('claims a model-bound generation with a content-free lease', async () => {
    const row = task();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: { upsert: vi.fn(async () => row) },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.beginIndexTask({
      taskId: TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      leaseToken: LEASE,
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'run', taskId: TASK, leaseToken: LEASE });
  });

  it('does not replace a live search lease within the same core execution epoch', async () => {
    const updateMany = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: { upsert: vi.fn(async () => task()), updateMany },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.beginIndexTask({
      taskId: TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      leaseToken: '9'.repeat(64),
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'skip', taskId: TASK, status: 'running' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('coalesces a different core task while the canonical generation lease is live', async () => {
    const updateMany = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: { upsert: vi.fn(async () => task()), updateMany },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.beginIndexTask({
      taskId: OTHER_TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      leaseToken: '9'.repeat(64),
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'skip', taskId: TASK, status: 'running' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('persists a replacement lease owner so that owner can recover after its own crash', async () => {
    const firstLease = 'c'.repeat(64);
    const recoveryLease = 'd'.repeat(64);
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const upsert = vi.fn()
      .mockResolvedValueOnce(task({
        status: 'failed', leaseToken: null, leaseExpiresAt: null,
      }))
      .mockResolvedValueOnce(task({
        status: 'running', attemptCount: 2, leaseToken: firstLease,
        fenceOwnerTaskId: OTHER_TASK, fenceOwnerAttempt: 1, leaseExpiresAt: new Date(Date.now() + 60_000),
      }));
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: { upsert, updateMany },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);
    const base = {
      taskId: OTHER_TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      modelIdentity: MODEL_IDENTITY,
    };

    await expect(storage.beginIndexTask({ ...base, leaseToken: firstLease, executionAttempt: 1 }))
      .resolves.toEqual({ action: 'run', taskId: TASK, leaseToken: firstLease });
    await expect(storage.beginIndexTask({ ...base, leaseToken: recoveryLease, executionAttempt: 2 }))
      .resolves.toEqual({ action: 'run', taskId: TASK, leaseToken: recoveryLease });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TASK, status: 'running', attemptCount: 2 }),
      data: expect.objectContaining({
        leaseToken: recoveryLease, fenceOwnerTaskId: OTHER_TASK, fenceOwnerAttempt: 2,
      }),
    }));
  });

  it('rejects an older authorized epoch after a newer epoch failed', async () => {
    const updateMany = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: {
        upsert: vi.fn(async () => task({
          status: 'failed',
          attemptCount: 2,
          leaseToken: null,
          leaseExpiresAt: null,
          fenceOwnerTaskId: TASK,
          fenceOwnerCreatedAt: SOURCE_CREATED_AT,
          fenceOwnerAttempt: 2,
        })),
        updateMany,
      },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.beginIndexTask({
      taskId: TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      leaseToken: 'e'.repeat(64),
      executionAttempt: 1,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'skip', taskId: TASK, status: 'failed' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('terminalizes an exhausted running generation and clears its lease identity', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: MODEL_IDENTITY.modelVersionId }]),
      searchIndexTask: {
        upsert: vi.fn(async () => task({ attemptCount: 3 })),
        updateMany,
      },
      searchChunk: { deleteMany },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.beginIndexTask({
      taskId: TASK,
      tenantId: TENANT,
      researchObjectId: RESEARCH_OBJECT,
      artifactId: ARTIFACT,
      sourceVersionId: SOURCE_VERSION,
      sourceVersionNo: 1,
      contentHash: CONTENT_HASH,
      sourceGenerationSha256: SOURCE_MAP_HASH,
      sourceCreatedAt: SOURCE_CREATED_AT,
      leaseToken: 'e'.repeat(64),
      executionAttempt: 2,
      modelIdentity: MODEL_IDENTITY,
    })).resolves.toEqual({ action: 'skip', taskId: TASK, status: 'failed' });
    expect(deleteMany).toHaveBeenCalledWith({ where: { indexTaskId: TASK, active: false } });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'failed', errorCode: 'attempts_exhausted', leaseToken: null, leaseExpiresAt: null,
      }),
    }));
  });

  it('renews only the matching running lease', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const storage = new SearchStorage({ searchIndexTask: { updateMany } } as never);

    await expect(storage.renewIndexTaskLease({ taskId: TASK, leaseToken: LEASE })).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: TASK, status: 'running', leaseToken: LEASE },
      data: { leaseExpiresAt: expect.any(Date) },
    }));
  });

  it('marks an abandoned inactive generation failed and removes its staged rows', async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      searchIndexTask: { findUnique: vi.fn(async () => task()), updateMany },
      searchChunk: { deleteMany },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.failIndexTask({ taskId: TASK, leaseToken: LEASE })).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({ where: { indexTaskId: TASK, active: false } });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: TASK, status: 'running', leaseToken: LEASE },
      data: expect.objectContaining({
        status: 'failed', errorCode: 'index_storage_unavailable',
      }),
    }));
  });

  it('stages inactive chunks without changing the current generation', async () => {
    const create = vi.fn(async () => ({}));
    const transaction = {
      searchIndexTask: { findUnique: vi.fn(async () => task()) },
      searchChunk: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create,
      },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await storage.stageIndexGeneration({ taskId: TASK, leaseToken: LEASE, chunks: [chunk()] });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: CHUNK, indexTaskId: TASK, active: false }) });
  });

  it('atomically activates chunks, dense rows and terminal status', async () => {
    const calls: string[] = [];
    const transaction = {
      $executeRaw: vi.fn(async () => { calls.push('lock'); return 1; }),
      searchIndexTask: {
        findUnique: vi.fn(async () => task()),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ data }: { data: { status?: string } }) => { calls.push(data.status ?? 'current'); return {}; }),
      },
      searchChunk: {
        findMany: vi.fn(async () => [{ id: CHUNK }]),
        updateMany: vi.fn(async () => { calls.push('chunks'); return { count: 1 }; }),
      },
      searchEmbedding: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => { calls.push('embedding'); return {}; }),
      },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.finalizeIndexGeneration({
      taskId: TASK, leaseToken: LEASE, status: 'succeeded', embeddings: [vectorDraft()],
    })).resolves.toEqual({ activated: true });
    expect(calls).toEqual(['lock', 'chunks', 'chunks', 'embedding', 'succeeded']);
  });

  it('turns a delayed older task into an idempotent no-op', async () => {
    const updateMany = vi.fn();
    const transaction = {
      $executeRaw: vi.fn(async () => 1),
      searchIndexTask: {
        findUnique: vi.fn(async () => task()),
        findFirst: vi.fn(async () => task({
          id: CURRENT_TASK,
          sourceVersionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          sourceVersionNo: 2,
          sourceCreatedAt: new Date('2026-08-27T07:00:00.000Z'),
          isCurrent: true,
          status: 'succeeded',
          leaseToken: null,
        })),
        update: vi.fn(async () => ({})),
      },
      searchChunk: { findMany: vi.fn(async () => [{ id: CHUNK }]), updateMany },
      searchEmbedding: { deleteMany: vi.fn(), upsert: vi.fn() },
    };
    const storage = new SearchStorage({
      $transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as never);

    await expect(storage.finalizeIndexGeneration({
      taskId: TASK, leaseToken: LEASE, status: 'succeeded', embeddings: [vectorDraft()],
    })).resolves.toEqual({ activated: false });
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction.searchEmbedding.upsert).not.toHaveBeenCalled();
  });

  it('rejects malformed embedding bytes before opening a transaction', async () => {
    const client = { $transaction: vi.fn() };
    const storage = new SearchStorage(client as never);
    await expect(storage.finalizeIndexGeneration({
      taskId: TASK,
      leaseToken: LEASE,
      status: 'succeeded',
      embeddings: [{ chunkId: CHUNK, vector: Buffer.alloc(4), vectorSha256: '0'.repeat(64), norm: 1 }],
    })).rejects.toThrow('embedding batch');
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
