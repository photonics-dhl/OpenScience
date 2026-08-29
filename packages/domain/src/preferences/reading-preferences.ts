import type { WorkspaceDeps } from '../workspace/types';

export type ReadingPreferenceErrorCode = 'PREFERENCE_VERSION_CONFLICT' | 'INVALID_READING_PREFERENCE';

export class ReadingPreferenceError extends Error {
  constructor(public readonly code: ReadingPreferenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReadingPreferenceError';
  }
}

export interface ReadingPreferenceState {
  evidenceDefaultCollapsed: boolean;
  version: number;
}

type ReadingPreferenceDeps = Pick<WorkspaceDeps, 'prisma' | 'audit'>;

export async function getReadingPreference(
  deps: Pick<ReadingPreferenceDeps, 'prisma'>,
  userId: string,
): Promise<ReadingPreferenceState> {
  const row = await deps.prisma.readingPreference.findUnique({ where: { userId } });
  return row
    ? { evidenceDefaultCollapsed: row.evidenceDefaultCollapsed, version: row.version }
    : { evidenceDefaultCollapsed: false, version: 0 };
}

function concurrencyConflict(error: unknown): boolean {
  return error instanceof Error && ['P2002', 'P2034'].includes((error as Error & { code?: string }).code ?? '');
}

export async function updateReadingPreference(
  deps: ReadingPreferenceDeps,
  input: {
    userId: string;
    evidenceDefaultCollapsed: boolean;
    expectedVersion: number;
  },
): Promise<ReadingPreferenceState> {
  if (typeof input.evidenceDefaultCollapsed !== 'boolean'
    || !Number.isSafeInteger(input.expectedVersion)
    || input.expectedVersion < 0) {
    throw new ReadingPreferenceError('INVALID_READING_PREFERENCE', 'invalid reading preference update');
  }

  try {
    return await deps.prisma.$transaction(async (tx) => {
      const current = await tx.readingPreference.findUnique({ where: { userId: input.userId } });
      if (!current) {
        if (input.expectedVersion !== 0) {
          throw new ReadingPreferenceError('PREFERENCE_VERSION_CONFLICT', 'reading preference version conflict');
        }
        const created = await tx.readingPreference.create({ data: {
          userId: input.userId,
          evidenceDefaultCollapsed: input.evidenceDefaultCollapsed,
        } });
        await deps.audit?.record({
          actorId: input.userId,
          action: 'reading_preference.update',
          targetType: 'reading_preference',
          targetId: input.userId,
          metadata: { evidenceDefaultCollapsed: created.evidenceDefaultCollapsed, fromVersion: 0, toVersion: created.version },
        }, tx);
        return { evidenceDefaultCollapsed: created.evidenceDefaultCollapsed, version: created.version };
      }
      if (current.version !== input.expectedVersion) {
        throw new ReadingPreferenceError('PREFERENCE_VERSION_CONFLICT', 'reading preference version conflict');
      }
      if (current.evidenceDefaultCollapsed === input.evidenceDefaultCollapsed) {
        return { evidenceDefaultCollapsed: current.evidenceDefaultCollapsed, version: current.version };
      }
      const updated = await tx.readingPreference.updateMany({
        where: { userId: input.userId, version: input.expectedVersion },
        data: {
          evidenceDefaultCollapsed: input.evidenceDefaultCollapsed,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ReadingPreferenceError('PREFERENCE_VERSION_CONFLICT', 'reading preference version conflict');
      }
      const next = { evidenceDefaultCollapsed: input.evidenceDefaultCollapsed, version: input.expectedVersion + 1 };
      await deps.audit?.record({
        actorId: input.userId,
        action: 'reading_preference.update',
        targetType: 'reading_preference',
        targetId: input.userId,
        metadata: { evidenceDefaultCollapsed: next.evidenceDefaultCollapsed, fromVersion: input.expectedVersion, toVersion: next.version },
      }, tx);
      return next;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof ReadingPreferenceError) throw error;
    if (concurrencyConflict(error)) {
      throw new ReadingPreferenceError('PREFERENCE_VERSION_CONFLICT', 'reading preference version conflict', { cause: error });
    }
    throw error;
  }
}
