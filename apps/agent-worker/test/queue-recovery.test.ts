import { describe, expect, it } from 'vitest';
import { recoverProcessingQueue } from '../src/index';

describe('agent-worker durable queue recovery', () => {
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
    expect(tasks.get('running-task')).toMatchObject({ status: 'failed', error: '[retryable] worker interrupted' });
  });
});
