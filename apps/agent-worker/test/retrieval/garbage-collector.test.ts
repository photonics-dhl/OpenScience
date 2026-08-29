import { describe, expect, it, vi } from 'vitest';
import { collectExpiredTemporaryDocuments } from '../../src/retrieval/garbage-collector';

describe('temporary document garbage collector', () => {
  it('uses a fencing token and retains a deleted provenance tombstone', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      temporaryDocument: {
        findMany: vi.fn(async () => [{ id: 'doc-1', objectKey: 'private-key', state: 'active', cleanupFenceToken: null, cleanupAttempts: 0 }]),
        updateMany: vi.fn(async (input: Record<string, unknown>) => {
          updates.push(input);
          return { count: 1 };
        }),
      },
    };
    const storage = { deleteObject: vi.fn(async () => undefined) };
    const result = await collectExpiredTemporaryDocuments({ prisma, storage } as never, {
      workerId: 'worker-1', now: new Date('2026-09-02T00:00:00.000Z'),
    });
    expect(result).toEqual({ claimed: 1, deleted: 1, failed: 0 });
    expect(storage.deleteObject).toHaveBeenCalledWith('private-key');
    expect(updates[0]?.data).toMatchObject({ state: 'deleting', cleanupOwner: 'worker-1' });
    const fence = (updates[0]?.data as Record<string, unknown>).cleanupFenceToken;
    expect(fence).toMatch(/^[0-9a-f-]{36}$/);
    expect(updates[1]?.where).toMatchObject({ id: 'doc-1', state: 'deleting', cleanupFenceToken: fence });
    expect(updates[1]?.data).toMatchObject({ state: 'deleted', cleanupFenceToken: null });
  });

  it('cannot finalize after losing the fence', async () => {
    const prisma = {
      temporaryDocument: {
        findMany: vi.fn(async () => [{ id: 'doc-1', objectKey: 'private-key', state: 'deleting', cleanupFenceToken: 'old', cleanupAttempts: 1 }]),
        updateMany: vi.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const result = await collectExpiredTemporaryDocuments({
      prisma, storage: { deleteObject: vi.fn(async () => undefined) },
    } as never, { workerId: 'worker-old', now: new Date('2026-09-02T00:00:00.000Z') });
    expect(result).toEqual({ claimed: 1, deleted: 0, failed: 0 });
  });
});
