import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, type AgentTaskView } from '../lib/api';
import {
  acquirePendingLiteratureIntent,
  clearAllPendingLiteratureIntents,
  settlePendingLiteratureIntent,
  startLiteratureTaskPolling,
} from '../lib/literature-acquisition-state';

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length() { return this.entries.size; }
  clear() { this.entries.clear(); }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string) { this.entries.delete(key); }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  snapshot() { return [...this.entries.entries()]; }
}

const runningTask: AgentTaskView = {
  id: 'task-running', sessionId: 'session-1', kind: 'source.retrieve', status: 'running', progress: 20,
  retryCount: 0, executionAttempt: 1, result: { sources: [{ id: 'old-source' }] }, error: null,
  createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('unresolved literature acquisition intent', () => {
  it.each([undefined, 408, 429, 500, 503])('reuses one caller key after ambiguous status %s and reload', async (status) => {
    const storage = new MemoryStorage();
    const context = { userId: 'user-a', target: 'personal' as const, input: { query: 'Ultrafast optics', identifier: '10.1038/nature12373' } };
    const first = await acquirePendingLiteratureIntent(storage, context, () => 'caller-key-1');
    settlePendingLiteratureIntent(storage, context, { kind: 'failure', status });
    const restored = await acquirePendingLiteratureIntent(storage, context, () => 'caller-key-2');

    expect(first).toEqual({ status: 'ready', key: 'caller-key-1' });
    expect(restored).toEqual({ status: 'ready', key: 'caller-key-1' });
  });

  it('blocks a different unresolved intent and stores no raw query, identifier, provider, or credential', async () => {
    const storage = new MemoryStorage();
    const context = { userId: 'user-a', target: 'personal' as const, input: { query: 'Ultrafast optics', identifier: '10.1038/nature12373' } };
    await acquirePendingLiteratureIntent(storage, context, () => 'caller-key-1');

    await expect(acquirePendingLiteratureIntent(storage, {
      ...context, input: { query: 'Different paper', identifier: 'arXiv:2401.01234' },
    }, () => 'caller-key-2')).resolves.toEqual({ status: 'blocked' });

    const serialized = JSON.stringify(storage.snapshot());
    expect(serialized).not.toContain('Ultrafast optics');
    expect(serialized).not.toContain('10.1038/nature12373');
    expect(serialized).not.toMatch(/provider|credential|password|cookie/i);
    expect(JSON.parse(storage.snapshot()[0]![1])).toEqual({
      version: 1,
      key: 'caller-key-1',
      intentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    { kind: 'accepted' as const },
    { kind: 'recovered' as const },
    { kind: 'failure' as const, status: 400 },
    { kind: 'failure' as const, status: 404 },
  ])('clears after authoritative outcome $kind/$status', async (outcome) => {
    const storage = new MemoryStorage();
    const context = { userId: 'user-a', target: 'personal' as const, input: { query: 'Paper' } };
    await acquirePendingLiteratureIntent(storage, context, () => 'caller-key-1');
    settlePendingLiteratureIntent(storage, context, outcome);

    await expect(acquirePendingLiteratureIntent(storage, context, () => 'caller-key-2'))
      .resolves.toEqual({ status: 'ready', key: 'caller-key-2' });
  });

  it('namespaces unresolved intents by user and target and clears every namespace on logout', async () => {
    const storage = new MemoryStorage();
    await acquirePendingLiteratureIntent(storage, { userId: 'user-a', target: 'personal', input: { query: 'Paper' } }, () => 'key-a');
    await acquirePendingLiteratureIntent(storage, { userId: 'user-b', target: 'personal', input: { query: 'Paper' } }, () => 'key-b');

    expect(storage.snapshot().map(([key]) => key)).toEqual(expect.arrayContaining([
      expect.stringContaining('user-a'), expect.stringContaining('user-b'),
    ]));
    clearAllPendingLiteratureIntents(storage);
    expect(storage.length).toBe(0);
  });
});

describe('literature task polling', () => {
  it('uses exact capped transient backoff, preserves the prior task, clears warning on recovery, and stops terminally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const callTimes: number[] = [];
    const getTask = vi.fn(async () => {
      callTimes.push(Date.now());
      if (callTimes.length <= 5) throw new ApiClientError('TEMPORARY', 'temporary', 503);
      if (callTimes.length === 6) return { ...runningTask, progress: 80 };
      return { ...runningTask, status: 'succeeded' as const, progress: 100, result: { sources: [{ id: 'final-source' }] } };
    });
    let current = runningTask;
    const reconnecting: boolean[] = [];
    startLiteratureTaskPolling({
      taskId: runningTask.id,
      getTask,
      onTask: (task) => { current = task; },
      onReconnecting: (value) => reconnecting.push(value),
    });

    await vi.advanceTimersByTimeAsync(34_199);
    expect(callTimes).toEqual([1_200, 2_400, 4_800, 9_600, 19_200]);
    expect(current).toBe(runningTask);
    expect(reconnecting).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1);
    expect(callTimes).toEqual([1_200, 2_400, 4_800, 9_600, 19_200, 34_200]);
    expect(current).toMatchObject({ progress: 80, result: runningTask.result });
    expect(reconnecting).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(1_200);
    expect(current).toMatchObject({ status: 'succeeded', result: { sources: [{ id: 'final-source' }] } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getTask).toHaveBeenCalledTimes(7);
  });

  it.each([401, 403, 404])('reports permanent status %s and stops without replacing the task', async (status) => {
    vi.useFakeTimers();
    const getTask = vi.fn().mockRejectedValue(new ApiClientError('PERMANENT', 'permanent', status));
    const onTask = vi.fn();
    const onReconnecting = vi.fn();
    const onPermanentError = vi.fn();
    startLiteratureTaskPolling({ taskId: runningTask.id, getTask, onTask, onReconnecting, onPermanentError });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getTask).toHaveBeenCalledTimes(1);
    expect(onTask).not.toHaveBeenCalled();
    expect(onReconnecting).not.toHaveBeenCalled();
    expect(onPermanentError).toHaveBeenCalledWith(status);
  });

  it('clears a pending timer and aborts an in-flight request during cleanup', async () => {
    vi.useFakeTimers();
    const never = vi.fn(() => new Promise<AgentTaskView>(() => undefined));
    const stopBefore = startLiteratureTaskPolling({ taskId: 'before', getTask: never, onTask: vi.fn(), onReconnecting: vi.fn() });
    stopBefore();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(never).not.toHaveBeenCalled();

    let observedSignal: AbortSignal | undefined;
    const stopDuring = startLiteratureTaskPolling({
      taskId: 'during',
      getTask: (taskId, signal) => {
        expect(taskId).toBe('during');
        observedSignal = signal;
        return new Promise<AgentTaskView>(() => undefined);
      },
      onTask: vi.fn(), onReconnecting: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(1_200);
    expect(observedSignal?.aborted).toBe(false);
    stopDuring();
    expect(observedSignal?.aborted).toBe(true);
  });
});
