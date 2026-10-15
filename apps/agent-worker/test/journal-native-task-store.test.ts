import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createJournalNativeTaskStore } from '../src/native-agent/journal-task-store';
import { readNativeAgentExecution } from '@openscience/domain';
import type { NativeAgentSessionState } from '../src/native-agent/session';

vi.mock('@openscience/domain', async load => ({ ...await load<typeof import('@openscience/domain')>(), lockTrashReferences: vi.fn() }));
const journalText = { jobId: 'job', sourceDigest: 'a'.repeat(64), revision: 3, sourceTextSha256: 'b'.repeat(64) };
const runtime = { runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3' };
function fixture() {
  const task = { id: 'task', kind: 'journal.generate', status: 'running', executionAttempt: 1, deletedAt: null as Date | null,
    result: { nativeAgentExecution: { kind: 'hermes-agent', profile: 'journal-editor', ...runtime } } as Record<string, unknown> };
  const objects = new Map<string, Buffer>(); let authorized = true; let inTransaction = false;
  const tx = { agentTask: { findUnique: async () => task, updateMany: async ({ where, data }: { where: { result: { equals: unknown } }; data: { result: Record<string, unknown> } }) => {
    if (JSON.stringify(where.result.equals) !== JSON.stringify(task.result)) return { count: 0 };
    task.result = data.result; return { count: 1 };
  } } };
  const prisma = { ...tx, async $transaction<T>(fn: (value: typeof tx) => Promise<T>) { inTransaction = true; try { return await fn(tx); } finally { inTransaction = false; } } };
  const storage = { async headObject(key: string) { const bytes = objects.get(key); return bytes ? { size: bytes.length } : null; },
    async putObject(key: string, bytes: Buffer) { objects.set(key, Buffer.from(bytes)); return { key, size: bytes.length, etag: key }; },
    async getObject(key: string) { const bytes = objects.get(key)!; return { size: bytes.length, body: Readable.from([bytes]) }; } };
  const store = () => createJournalNativeTaskStore({ prisma: prisma as never, storage: storage as never, taskId: 'task', executionAttempt: 1,
    execution: readNativeAgentExecution(task.result)!, journalText, authorize: async () => { if (!authorized) throw new Error('journal authority revoked'); } });
  const state: NativeAgentSessionState = { kind: 'hermes-native-agent', binding: { taskId: 'task', sourceKind: 'journal-text', journalText,
    ...runtime, allowedTools: ['skills_list', 'skill_view', 'paper_read'], maxTurns: 3, maxOutputTokens: 100,
    maxTotalOutputTokens: 300, maxInputBytes: 1000, deadlineAt: Date.now() + 100_000 },
    initialMessages: [{ role: 'user', content: 'fixed' }], turns: [{ state: 'started',
      target: { provider: 'minimax', model: runtime.model, promptHash: 'c'.repeat(64) },
      request: { messages: [{ role: 'user', content: 'fixed' }], options: {} }, effectiveOptions: {} }] };
  const completed = (): NativeAgentSessionState => ({ ...state, turns: [{ ...state.turns[0]!, state: 'completed', response: {
    text: 'paid answer', provider: 'minimax', model: runtime.model, promptHash: 'c'.repeat(64), finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 1 } } }] });
  return { task, objects, storage, tx, store, state, completed, revoke: () => { authorized = false; }, get inTransaction() { return inTransaction; } };
}

describe('journal native paid checkpoint store', () => {
  it.each(['start', 'paid'] as const)('rejects an image-only received turn before any %s storage or checkpoint write', async mode => {
    const f = fixture(); const store = f.store();
    if (mode === 'paid') await store.compareAndSet(null, f.state);
    const before = structuredClone(f.task.result);
    const put = vi.spyOn(f.storage, 'putObject'); const update = vi.spyOn(f.tx.agentTask, 'updateMany');
    const first = f.state.turns[0]!;
    const received: NativeAgentSessionState = { ...f.state, turns: [{ state: 'received',
      target: first.target, request: first.request, effectiveOptions: first.effectiveOptions,
      received: { policy: 'image-review-tool-final-v1', provider: 'minimax', status: 200, body: '{invalid' } }] };
    await expect(mode === 'paid' ? store.complete(f.state, received) : store.compareAndSet(null, received)).rejects.toThrow('changed');
    expect(put).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(f.task.result).toEqual(before);
  });
  it('keeps started and completed receipts private and rejects concurrent CAS', async () => {
    const f = fixture(); const first = f.store(); const other = f.store();
    await first.compareAndSet(null, f.state);
    await expect(other.compareAndSet(null, { ...f.state, initialMessages: [{ role: 'user', content: 'changed' }] })).rejects.toThrow('changed');
    expect(await f.store().read()).toEqual(f.state);
    expect(JSON.stringify(f.task.result)).not.toContain('initialMessages');
    await first.complete(f.state, f.completed());
    expect(await f.store().read()).toEqual(f.completed());
  });
  it('saves a paid response after revoke but forbids new provider publication', async () => {
    const f = fixture(); const store = f.store(); await store.compareAndSet(null, f.state);
    f.revoke(); f.task.status = 'failed'; // The journal job was cancelled while HTTP was in flight.
    await store.complete(f.state, f.completed());
    expect(await store.read()).toEqual(f.completed());
    let submitted = false;
    await expect(store.publish(f.state, async () => { submitted = true; return 'wrong'; })).rejects.toThrow('revoked');
    expect(submitted).toBe(false);
  });
  it('does not reissue an old started turn after its completed receipt was saved', async () => {
    const f = fixture(); const store = f.store(); await store.compareAndSet(null, f.state);
    await store.complete(f.state, f.completed());
    let submitted = false;
    await expect(store.publish(f.state, async () => { submitted = true; return 'duplicate'; })).rejects.toThrow('changed');
    expect(submitted).toBe(false);
  });
  it('starts the provider only while the final journal authority transaction is held', async () => {
    const f = fixture(); const store = f.store(); await store.compareAndSet(null, f.state);
    let resolve!: (answer: string) => void;
    const sent = store.publish(f.state, () => { expect(f.inTransaction).toBe(true); return new Promise<string>(yes => { resolve = yes; }); });
    for (let i = 0; i < 20 && !resolve; i++) await new Promise(yes => setTimeout(yes, 0));
    expect(resolve).toBeDefined(); expect(f.inTransaction).toBe(false);
    resolve('paid'); expect(await sent).toBe('paid');
  });
});
