import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, type IngestionTaskDetail } from '../lib/api';
import { startIngestionReviewPolling } from '../lib/ingestion-review-polling';

const scope = { researchObjectId: 'ro-1', taskId: 'task-1', artifactId: 'artifact-1', version: 7 };
const detail = (state: IngestionTaskDetail['task']['state'] = 'parsing', taskId = scope.taskId): IngestionTaskDetail => ({
  researchObjectId: scope.researchObjectId, version: 7, batchId: 'batch-1',
  task: { id: taskId, artifactId: scope.artifactId, logicalPath: 'paper.pdf', state, retryCount: 0,
    error: null, agentTaskId: 'agent-1', result: null },
});
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const disposers: Array<() => void> = [];
function start(overrides: Partial<typeof scope> = {}) {
  const callbacks = { onUpdate: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };
  const dispose = startIngestionReviewPolling({ ...scope, ...overrides }, callbacks);
  disposers.push(dispose);
  return { ...callbacks, dispose };
}
function mockFetch(readTask: (url: string) => Promise<Response>) {
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return json({ userId: 'user-1' });
    if (url.includes('/hermes-runs')) return json({ run: null });
    return readTask(url);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('ingestion review polling', () => {
  it('only reads ingestion while parsing and hydrates reviewer/run once it is ready', async () => {
    let state: IngestionTaskDetail['task']['state'] = 'parsing';
    const fetcher = mockFetch(async () => json(detail(state)));
    const poll = start();
    await vi.advanceTimersByTimeAsync(4500);
    expect(fetcher.mock.calls.every(([url]) => url === '/api/ingestion/tasks/task-1')).toBe(true);
    expect(poll.onUpdate).toHaveBeenLastCalledWith({ state: 'pending', detail: detail() });
    state = 'needs_review';
    await vi.advanceTimersByTimeAsync(1500);
    expect(poll.onUpdate).toHaveBeenLastCalledWith({ state: 'ready', detail: detail(state), userId: 'user-1' });
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/hermes-runs'))).toHaveLength(1);
    const count = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(count);
  });

  it('recovers a 429 only after Retry-After and then delivers current state', async () => {
    let attempts = 0;
    const fetcher = mockFetch(async () => ++attempts === 1
      ? json({ error: { code: 'RATE_LIMITED', message: 'Wait' } }, 429, { 'retry-after': '9' }) : json(detail('needs_review')));
    const poll = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.onError).toHaveBeenCalledWith(expect.objectContaining({ status: 429, retryAfterMs: 9000 }));
    await vi.advanceTimersByTimeAsync(8999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ready' }));
    expect(poll.onError).toHaveBeenCalledTimes(1);
  });

  it('bounds consecutive network/server backoff and resets it after a successful pending read', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      if (attempts === 1) throw new TypeError('Network unavailable');
      return attempts === 7 ? json(detail()) : json({ error: { code: 'UNAVAILABLE', message: 'Temporary' } }, 503);
    });
    const poll = start();
    await vi.advanceTimersByTimeAsync(0);
    for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
      const before = attempts;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(attempts).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(before + 1);
    }
    expect(poll.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'pending' }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(attempts).toBe(8);
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(8);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(9);
  });

  it('recovers a limited run lookup by rereading the selected ingestion before showing its proposal', async () => {
    let runReads = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json({ userId: 'user-1' });
      if (url.includes('/hermes-runs')) return ++runReads === 1
        ? json({ error: { code: 'RATE_LIMITED', message: 'Wait' } }, 429, { 'retry-after': '12' }) : json({ run: { id: 'run-1' } });
      return json(detail('needs_review'));
    });
    vi.stubGlobal('fetch', fetcher);
    const poll = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.onUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(11999);
    expect(runReads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ready', runId: 'run-1' }));
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/ingestion/tasks/'))).toHaveLength(2);
  });

  it.each([401, 403, 404, 422])('does not retry permanent HTTP %i failures', async status => {
    const fetcher = mockFetch(async () => json({ error: { code: 'DENIED', message: 'Stop' } }, status));
    const poll = start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll.onError).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['researchObjectId', 'artifactId', 'taskId', 'version'] as const)('stops before auxiliary reads on changed %s', async field => {
    const value = detail('needs_review');
    if (field === 'researchObjectId') value.researchObjectId = 'another-ro';
    else if (field === 'artifactId') value.task.artifactId = 'another-artifact';
    else if (field === 'taskId') value.task.id = 'another-task';
    else value.version++;
    const fetcher = mockFetch(async () => json(value));
    const poll = start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll.onUpdate).toHaveBeenCalledWith({ state: field === 'version' ? 'version_changed' : 'scope_mismatch' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts a disposed source and ignores its late response after switching tasks', async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
    const fetcher = mockFetch(async url => url.endsWith('task-1') ? oldResponse : json(detail('needs_review', 'task-2')));
    const old = start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const oldSignal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]?.signal;
    old.dispose();
    const current = start({ taskId: 'task-2' });
    await vi.advanceTimersByTimeAsync(0);
    resolveOld(json(detail('needs_review')));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(oldSignal?.aborted).toBe(true);
    expect(old.onUpdate).not.toHaveBeenCalled();
    expect(old.onError).not.toHaveBeenCalled();
    expect(old.onSettled).not.toHaveBeenCalled();
    expect(current.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready', detail: detail('needs_review', 'task-2') }));
  });

  it('does not publish a late run lookup after disposal', async () => {
    let resolveRun!: (response: Response) => void;
    const lateRun = new Promise<Response>(resolve => { resolveRun = resolve; });
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json({ userId: 'user-1' });
      if (url.includes('/hermes-runs')) return lateRun;
      return json(detail('needs_review'));
    });
    vi.stubGlobal('fetch', fetcher);
    const poll = start();
    await vi.advanceTimersByTimeAsync(0);
    poll.dispose();
    resolveRun(json({ run: { id: 'old-run' } }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll.onUpdate).not.toHaveBeenCalled();
    expect(poll.onError).not.toHaveBeenCalled();
    expect(poll.onSettled).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('clears a pending backoff when disposed', async () => {
    const fetcher = mockFetch(async () => json({ error: { code: 'RATE_LIMITED', message: 'Wait' } }, 429, { 'retry-after': '60' }));
    const poll = start();
    await vi.advanceTimersByTimeAsync(0);
    poll.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retains Retry-After metadata without automatically retrying writes', async () => {
    const fetcher = vi.fn(async (url: string) => url === '/api/csrf-token' ? json({ csrfToken: 'csrf' })
      : json({ error: { code: 'RATE_LIMITED', message: 'Wait' } }, 429, { 'retry-after': '7' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(apiRequest('/api/ingestion/task-1/confirm', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 429, retryAfterMs: 7000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher.mock.calls.filter(([url]) => url !== '/api/csrf-token')).toHaveLength(1);
  });
});
