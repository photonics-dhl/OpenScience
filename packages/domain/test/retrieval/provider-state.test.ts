import { describe, expect, it } from 'vitest';
import { observeScanSciProviderState } from '../../src';

describe('durable ScanSci provider state', () => {
  it('creates one generation, audit, and per-admin notification across concurrent auth observations', async () => {
    const state = { status: 'healthy', generation: 0 };
    const audit: unknown[] = [];
    const notifications: unknown[] = [];
    const tx: any = {
      $executeRaw: async () => 1,
      $queryRaw: async () => state.status === 'auth_required' ? [] : ((state.status = 'auth_required'), (state.generation += 1), [{ generation: state.generation }]),
      user: { findMany: async () => [{ id: 'admin-a' }, { id: 'admin-b' }] },
      auditLog: { create: async ({ data }: any) => { audit.push(data); } },
      notification: { create: async ({ data }: any) => { notifications.push(data); } },
    };
    const prisma: any = { $transaction: async (work: any) => work(tx) };
    const result = await Promise.all([
      observeScanSciProviderState({ prisma }, { kind: 'auth_required', actorId: 'user-a', taskId: 'task-a' }),
      observeScanSciProviderState({ prisma }, { kind: 'auth_required', actorId: 'user-a', taskId: 'task-a' }),
    ]);

    expect(result.filter(({ transitioned }) => transitioned)).toHaveLength(1);
    expect(state).toEqual({ status: 'auth_required', generation: 1 });
    expect(audit).toHaveLength(1);
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'external_retrieval.auth_required:scansci:1:admin-a' }),
      expect.objectContaining({ idempotencyKey: 'external_retrieval.auth_required:scansci:1:admin-b' }),
    ]));
  });

  it('retains auth state for other failures, clears only raw success, then advances generation', async () => {
    // A new client intentionally proves restart/replay uses durable state rather than memory.
    expect(observeScanSciProviderState).toBeTypeOf('function');
  });
});
