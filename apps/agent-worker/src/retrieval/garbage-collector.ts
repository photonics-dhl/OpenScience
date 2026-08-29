import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';

const LEASE_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_MS, 60_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 12));
}

interface GarbageCollectorDeps {
  prisma: PrismaClient;
  storage: StorageAdapter;
}

export async function collectExpiredTemporaryDocuments(
  deps: GarbageCollectorDeps,
  input: { workerId: string; now?: Date; limit?: number },
): Promise<{ claimed: number; deleted: number; failed: number }> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 20;
  if (!input.workerId.trim() || input.workerId.length > 100) throw new Error('GC workerId is invalid');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('GC limit is invalid');
  const candidates = await deps.prisma.temporaryDocument.findMany({
    where: {
      OR: [
        { state: 'active', expiresAt: { lte: now } },
        { state: 'staging', createdAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } },
        { state: 'cleanup_failed', cleanupRetryAt: { lte: now } },
        { state: 'deleting', cleanupLeaseUntil: { lte: now } },
      ],
    },
    select: { id: true, objectKey: true, state: true, cleanupFenceToken: true, cleanupAttempts: true },
    orderBy: [{ cleanupRetryAt: 'asc' }, { expiresAt: 'asc' }],
    take: limit,
  });
  let claimed = 0;
  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const fence = randomUUID();
    const claim = await deps.prisma.temporaryDocument.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { state: 'active', expiresAt: { lte: now } },
          { state: 'staging', createdAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } },
          { state: 'cleanup_failed', cleanupRetryAt: { lte: now } },
          { state: 'deleting', cleanupLeaseUntil: { lte: now } },
        ],
      },
      data: {
        state: 'deleting',
        cleanupOwner: input.workerId,
        cleanupLeaseUntil: new Date(now.getTime() + LEASE_MS),
        cleanupFenceToken: fence,
        cleanupRetryAt: null,
        cleanupAttempts: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (claim.count !== 1) continue;
    claimed += 1;
    try {
      await deps.storage.deleteObject(candidate.objectKey);
      const finalized = await deps.prisma.temporaryDocument.updateMany({
        where: { id: candidate.id, state: 'deleting', cleanupFenceToken: fence },
        data: {
          state: 'deleted',
          deletedAt: new Date(),
          cleanupOwner: null,
          cleanupLeaseUntil: null,
          cleanupFenceToken: null,
          cleanupRetryAt: null,
          lastErrorCode: null,
        },
      });
      if (finalized.count === 1) deleted += 1;
    } catch {
      const marked = await deps.prisma.temporaryDocument.updateMany({
        where: { id: candidate.id, state: 'deleting', cleanupFenceToken: fence },
        data: {
          state: 'cleanup_failed',
          cleanupOwner: null,
          cleanupLeaseUntil: null,
          cleanupFenceToken: null,
          cleanupRetryAt: new Date(now.getTime() + retryDelayMs(candidate.cleanupAttempts + 1)),
          lastErrorCode: 'object_delete_failed',
        },
      });
      if (marked.count === 1) failed += 1;
    }
  }
  return { claimed, deleted, failed };
}
