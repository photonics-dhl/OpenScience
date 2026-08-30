import { describe, expect, it } from 'vitest';
import { observeScanSciProviderState } from '../../src';

/* eslint-disable @typescript-eslint/no-explicit-any -- transactional Prisma fake intentionally models a dynamic client surface */

type ProviderStatus = 'healthy' | 'auth_required';

function sqlText(query: unknown): string {
  const strings = (query as { strings?: readonly string[] })?.strings;
  return strings ? strings.join('?') : String(query);
}

function createProviderStateHarness() {
  const db = {
    providerState: undefined as undefined | { status: ProviderStatus; generation: number },
    users: [
      { id: 'admin-a', platformRole: 'platform_admin' },
      { id: 'admin-b', platformRole: 'platform_admin' },
      { id: 'ordinary-user', platformRole: 'user' },
    ],
    audit: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
  };
  let queue = Promise.resolve();
  let auditFailure = false;
  let notificationFailureUserId: string | undefined;
  let transactionAttempts = 0;
  const transactionFailures: unknown[] = [];

  function createClient() {
    return {
      $transaction: async (work: (tx: any) => Promise<unknown>) => {
        transactionAttempts += 1;
        const injected = transactionFailures.shift();
        if (injected) throw injected;
        let release!: () => void;
        const previous = queue;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        const snapshot = structuredClone(db);
        const tx = {
          $executeRaw: async (query: unknown) => {
            const text = sqlText(query);
            if (text.includes('DO UPDATE SET "status" = \'healthy\'')) {
              db.providerState = db.providerState
                ? { ...db.providerState, status: 'healthy' }
                : { status: 'healthy', generation: 0 };
              return 1;
            }
            if (text.includes('ON CONFLICT ("provider") DO NOTHING')) {
              db.providerState ??= { status: 'healthy', generation: 0 };
              return 1;
            }
            throw new Error(`unexpected execute statement: ${text}`);
          },
          $queryRaw: async (query: unknown) => {
            const text = sqlText(query);
            if (!text.includes('SET "status" = \'auth_required\'')) throw new Error(`unexpected query statement: ${text}`);
            if (!db.providerState || db.providerState.status === 'auth_required') return [];
            db.providerState = { status: 'auth_required', generation: db.providerState.generation + 1 };
            return [{ generation: db.providerState.generation }];
          },
          user: {
            findMany: async ({ where }: any) => db.users
              .filter(({ platformRole }) => platformRole === where.platformRole)
              .map(({ id }) => ({ id })),
          },
          auditLog: {
            create: async ({ data }: any) => {
              db.audit.push(data);
              if (auditFailure) throw new Error('audit unavailable');
              return data;
            },
          },
          notification: {
            create: async ({ data }: any) => {
              if (db.notifications.some(({ idempotencyKey }) => idempotencyKey === data.idempotencyKey)) {
                throw Object.assign(new Error('duplicate notification'), { code: 'P2002' });
              }
              db.notifications.push(data);
              if (notificationFailureUserId === data.userId) throw new Error(`notification unavailable for ${data.userId}`);
              return data;
            },
          },
        };
        try {
          return await work(tx);
        } catch (error) {
          db.providerState = snapshot.providerState;
          db.users.splice(0, db.users.length, ...snapshot.users);
          db.audit.splice(0, db.audit.length, ...snapshot.audit);
          db.notifications.splice(0, db.notifications.length, ...snapshot.notifications);
          throw error;
        } finally {
          release();
        }
      },
    };
  }

  return {
    db,
    createClient,
    injectAuditFailure(value: boolean) { auditFailure = value; },
    injectNotificationFailure(userId?: string) { notificationFailureUserId = userId; },
    injectTransactionFailure(error: unknown) { transactionFailures.push(error); },
    transactionAttempts() { return transactionAttempts; },
  };
}

const authObservation = { kind: 'auth_required' as const, actorId: 'ordinary-user', taskId: 'task-a' };

describe('durable ScanSci provider state', () => {
  it('creates one generation, audit, and per-admin notification across concurrent auth observations', async () => {
    const harness = createProviderStateHarness();
    const result = await Promise.all([
      observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation),
      observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation),
    ]);

    expect(result.filter(({ transitioned }) => transitioned)).toHaveLength(1);
    expect(harness.db.providerState).toEqual({ status: 'auth_required', generation: 1 });
    expect(harness.db.audit).toHaveLength(1);
    expect(harness.db.notifications).toHaveLength(2);
    expect(harness.db.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'external_retrieval.auth_required:scansci:1:admin-a' }),
      expect.objectContaining({ idempotencyKey: 'external_retrieval.auth_required:scansci:1:admin-b' }),
    ]));
  });

  it('retains auth state for other failures, clears only raw success, then advances generation', async () => {
    const harness = createProviderStateHarness();
    const firstClient = harness.createClient();
    await expect(observeScanSciProviderState({ prisma: firstClient as any }, authObservation))
      .resolves.toEqual({ transitioned: true, generation: 1 });
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation))
      .resolves.toEqual({ transitioned: false });
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, {
      ...authObservation, kind: 'other_failure', taskId: 'task-other-failure',
    })).resolves.toEqual({ transitioned: false });
    expect(harness.db.providerState).toEqual({ status: 'auth_required', generation: 1 });
    expect(harness.db.audit).toHaveLength(1);
    expect(harness.db.notifications).toHaveLength(2);

    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, {
      ...authObservation, kind: 'succeeded', taskId: 'task-success',
    })).resolves.toEqual({ transitioned: false });
    expect(harness.db.providerState).toEqual({ status: 'healthy', generation: 1 });
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, {
      ...authObservation, kind: 'other_failure', taskId: 'task-later-failure',
    })).resolves.toEqual({ transitioned: false });
    expect(harness.db.providerState).toEqual({ status: 'healthy', generation: 1 });

    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, {
      ...authObservation, taskId: 'task-generation-two',
    })).resolves.toEqual({ transitioned: true, generation: 2 });
    expect(harness.db.providerState).toEqual({ status: 'auth_required', generation: 2 });
    expect(harness.db.audit).toHaveLength(2);
    expect(harness.db.notifications).toHaveLength(4);
    expect(harness.db.notifications.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'external_retrieval.auth_required:scansci:1:admin-a',
      'external_retrieval.auth_required:scansci:1:admin-b',
      'external_retrieval.auth_required:scansci:2:admin-a',
      'external_retrieval.auth_required:scansci:2:admin-b',
    ]);
  });

  it('rolls back state and side effects when the audit write fails, then commits one complete retry', async () => {
    const harness = createProviderStateHarness();
    harness.injectAuditFailure(true);
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation))
      .rejects.toThrow(/audit unavailable/);
    expect(harness.db.providerState).toBeUndefined();
    expect(harness.db.audit).toHaveLength(0);
    expect(harness.db.notifications).toHaveLength(0);

    harness.injectAuditFailure(false);
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation))
      .resolves.toEqual({ transitioned: true, generation: 1 });
    expect(harness.db.providerState).toEqual({ status: 'auth_required', generation: 1 });
    expect(harness.db.audit).toHaveLength(1);
    expect(harness.db.notifications).toHaveLength(2);
  });

  it.each(['admin-a', 'admin-b'])('rolls back state, audit, and every notification when %s notification fails', async (adminId) => {
    const harness = createProviderStateHarness();
    harness.injectNotificationFailure(adminId);
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation))
      .rejects.toThrow(new RegExp(`notification unavailable for ${adminId}`));
    expect(harness.db.providerState).toBeUndefined();
    expect(harness.db.audit).toHaveLength(0);
    expect(harness.db.notifications).toHaveLength(0);

    harness.injectNotificationFailure();
    await expect(observeScanSciProviderState({ prisma: harness.createClient() as any }, authObservation))
      .resolves.toEqual({ transitioned: true, generation: 1 });
    expect(harness.db.audit).toHaveLength(1);
    expect(harness.db.notifications).toHaveLength(2);
  });

  it('retries P2034 at most three times and propagates other failures immediately', async () => {
    const recovered = createProviderStateHarness();
    recovered.injectTransactionFailure(Object.assign(new Error('serialization one'), { code: 'P2034' }));
    recovered.injectTransactionFailure(Object.assign(new Error('serialization two'), { code: 'P2034' }));
    await expect(observeScanSciProviderState({ prisma: recovered.createClient() as any }, {
      ...authObservation, kind: 'succeeded',
    })).resolves.toEqual({ transitioned: false });
    expect(recovered.transactionAttempts()).toBe(3);

    const exhausted = createProviderStateHarness();
    const finalSerialization = Object.assign(new Error('serialization three'), { code: 'P2034' });
    exhausted.injectTransactionFailure(Object.assign(new Error('serialization one'), { code: 'P2034' }));
    exhausted.injectTransactionFailure(Object.assign(new Error('serialization two'), { code: 'P2034' }));
    exhausted.injectTransactionFailure(finalSerialization);
    await expect(observeScanSciProviderState({ prisma: exhausted.createClient() as any }, authObservation))
      .rejects.toBe(finalSerialization);
    expect(exhausted.transactionAttempts()).toBe(3);

    const nonSerializable = createProviderStateHarness();
    const auditUnavailable = new Error('database unavailable');
    nonSerializable.injectTransactionFailure(auditUnavailable);
    await expect(observeScanSciProviderState({ prisma: nonSerializable.createClient() as any }, authObservation))
      .rejects.toBe(auditUnavailable);
    expect(nonSerializable.transactionAttempts()).toBe(1);
  });
});
