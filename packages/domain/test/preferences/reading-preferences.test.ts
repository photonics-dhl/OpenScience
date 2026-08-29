import { describe, expect, it } from 'vitest';

import {
  ReadingPreferenceError,
  getReadingPreference,
  updateReadingPreference,
} from '../../src/preferences/reading-preferences';

function fixture() {
  const rows = new Map<string, { userId: string; evidenceDefaultCollapsed: boolean; version: number }>();
  const prisma = {
    readingPreference: {
      findUnique: async ({ where }: { where: { userId: string } }) => rows.get(where.userId) ?? null,
      create: async ({ data }: { data: { userId: string; evidenceDefaultCollapsed: boolean } }) => {
        if (rows.has(data.userId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { ...data, version: 1 };
        rows.set(data.userId, row);
        return row;
      },
      updateMany: async ({ where, data }: {
        where: { userId: string; version: number };
        data: { evidenceDefaultCollapsed: boolean; version: { increment: number } };
      }) => {
        const row = rows.get(where.userId);
        if (!row || row.version !== where.version) return { count: 0 };
        row.evidenceDefaultCollapsed = data.evidenceDefaultCollapsed;
        row.version += data.version.increment;
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  };
  return { deps: { prisma } as never, rows };
}

describe('reading preferences', () => {
  it('returns the expanded default without creating a database row', async () => {
    const { deps, rows } = fixture();
    await expect(getReadingPreference(deps, 'user-a')).resolves.toEqual({
      evidenceDefaultCollapsed: false,
      version: 0,
    });
    expect(rows.size).toBe(0);
  });

  it('creates once and treats an unchanged current write as idempotent', async () => {
    const { deps, rows } = fixture();
    await expect(updateReadingPreference(deps, {
      userId: 'user-a', evidenceDefaultCollapsed: true, expectedVersion: 0,
    })).resolves.toEqual({ evidenceDefaultCollapsed: true, version: 1 });
    await expect(updateReadingPreference(deps, {
      userId: 'user-a', evidenceDefaultCollapsed: true, expectedVersion: 1,
    })).resolves.toEqual({ evidenceDefaultCollapsed: true, version: 1 });
    expect(rows.size).toBe(1);
  });

  it('increments on change, rejects stale versions and isolates users', async () => {
    const { deps } = fixture();
    await updateReadingPreference(deps, { userId: 'user-a', evidenceDefaultCollapsed: true, expectedVersion: 0 });
    await updateReadingPreference(deps, { userId: 'user-b', evidenceDefaultCollapsed: false, expectedVersion: 0 });
    await expect(updateReadingPreference(deps, {
      userId: 'user-a', evidenceDefaultCollapsed: false, expectedVersion: 1,
    })).resolves.toEqual({ evidenceDefaultCollapsed: false, version: 2 });
    await expect(updateReadingPreference(deps, {
      userId: 'user-a', evidenceDefaultCollapsed: true, expectedVersion: 1,
    })).rejects.toMatchObject({ code: 'PREFERENCE_VERSION_CONFLICT' });
    await expect(getReadingPreference(deps, 'user-b')).resolves.toEqual({
      evidenceDefaultCollapsed: false, version: 1,
    });
  });

  it('rejects non-boolean values at the domain boundary', async () => {
    const { deps } = fixture();
    await expect(updateReadingPreference(deps, {
      userId: 'user-a', evidenceDefaultCollapsed: 'yes', expectedVersion: 0,
    } as never)).rejects.toBeInstanceOf(ReadingPreferenceError);
  });
});
