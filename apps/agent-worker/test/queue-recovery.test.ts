import { describe, expect, it } from 'vitest';
import { createResearchRunReconcileScheduler, reconcileResearchRunsTick, recoverProcessingQueue } from '../src/index';

describe('agent-worker durable queue recovery', () => {
  it('contains a research reconciler failure so normal queue polling can continue', async () => {
    const errors: unknown[] = [];
    const completed = await reconcileResearchRunsTick({} as never, async () => { throw new Error('database unavailable'); }, (error) => errors.push(error));
    expect(completed).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('throttles bounded reconciliation while queue polling stays frequent', async () => {
    let current = 0;
    let calls = 0;
    const tick = createResearchRunReconcileScheduler({
      intervalMs: 5_000,
      now: () => current,
      reconcile: async () => { calls += 1; return { inspected: 0, advanced: 0, failed: 0, stopped: 0, errors: 0 }; },
      onError: () => undefined,
    });
    expect(await tick({} as never)).toBe(true);
    current = 1_000;
    expect(await tick({} as never)).toBe(false);
    current = 5_000;
    expect(await tick({} as never)).toBe(true);
    expect(calls).toBe(2);
  });

  it('requeues abandoned pending/running tasks and discards terminal processing residues', async () => {
    const tasks = new Map([
      ['pending-task', { id: 'pending-task', status: 'pending' }],
      ['running-task', { id: 'running-task', status: 'running', error: null }],
      ['succeeded-task', { id: 'succeeded-task', status: 'succeeded' }],
    ]);
    const lists = new Map<string, string[]>([
      ['agent:queue', []],
      ['agent:queue:processing', ['pending-task', 'running-task', 'succeeded-task']],
    ]);
    const redis = {
      lindex: async (key: string, index: number) => {
        const rows = lists.get(key) ?? [];
        return rows[index < 0 ? rows.length + index : index] ?? null;
      },
      rpoplpush: async (source: string, destination: string) => {
        const value = lists.get(source)?.pop() ?? null;
        if (value) lists.set(destination, [value, ...(lists.get(destination) ?? [])]);
        return value;
      },
      lrem: async (key: string, _count: number, value: string) => {
        const before = lists.get(key) ?? [];
        lists.set(key, before.filter((entry) => entry !== value));
        return before.length - (lists.get(key)?.length ?? 0);
      },
    };
    const prisma = {
      agentTask: {
        findUnique: async ({ where }: { where: { id: string } }) => tasks.get(where.id) ?? null,
        updateMany: async ({ where, data }: {
          where: { id: string; status: string };
          data: { status: string; error: string };
        }) => {
          const task = tasks.get(where.id);
          if (!task || task.status !== where.status) return { count: 0 };
          Object.assign(task, data);
          return { count: 1 };
        },
      },
    };

    expect(await recoverProcessingQueue({ prisma, redis } as never)).toBe(2);
    expect(lists.get('agent:queue:processing')).toEqual([]);
    expect(new Set(lists.get('agent:queue'))).toEqual(new Set(['pending-task', 'running-task']));
    expect(tasks.get('running-task')).toMatchObject({ status: 'pending', error: null });
  });
});
