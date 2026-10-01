import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { initialNativeAgentExecution, readNativeAgentExecution } from '@openscience/domain';
import { createNativeTaskStore } from '../src/native-agent/task-store';
import type { NativeAgentSessionState } from '../src/native-agent/session';

const runtime = { runtimeId: 'fixture-runtime', skillCatalogueId: 'fixture-skills', model: 'MiniMax-M3' };
function fixture() {
  const task = { id: 'task', status: 'running', kind: 'sdf.extract', executionAttempt: 1, deletedAt: null as Date | null,
    session: { trashEntryId: null },
    result: { ...initialNativeAgentExecution(runtime), sourceMapRef: { schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'paper',
      contentHash: 'a'.repeat(64), serializedSha256: 'b'.repeat(64), objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, size: 100 } } };
  const objects = new Map<string, Buffer>(); const queuedCleanup: string[] = [];
  let authorized = true; let insideTransaction = false; let loseWrite = false;
  const tx = { $queryRaw: async () => [], $executeRaw: async () => 0,
    trashEntry: { findFirst: async () => task.deletedAt ? { id: 'trash', state: 'trashed' } : null },
    trashObjectCleanup: { upsert: async ({ where }: { where: { objectKey: string } }) => { queuedCleanup.push(where.objectKey); } },
    agentTask: { findUnique: async () => task, updateMany: async ({ where, data }: {
    where: { result: { equals: unknown }; executionAttempt: number }; data: { result: typeof task.result } }) => {
    if (JSON.stringify(where.result.equals) !== JSON.stringify(task.result) || where.executionAttempt !== task.executionAttempt) return { count: 0 };
    task.result = data.result; return { count: 1 };
  } } };
  const prisma = { ...tx, async $transaction<T>(fn: (db: typeof tx) => Promise<T>) { insideTransaction = true; try { return await fn(tx); } finally { insideTransaction = false; } } };
  const storage = { async putObject(key: string, bytes: Buffer) { objects.set(key, Buffer.from(bytes));
    if (loseWrite) { task.deletedAt = new Date(); throw new Error('write acknowledgment lost after deletion'); }
    return { key, size: bytes.length, etag: '' }; },
    async headObject(key: string) { const bytes = objects.get(key); return bytes ? { size: bytes.length, etag: '' } : null; },
    async getObject(key: string) { const bytes = objects.get(key)!; return { size: bytes.length, body: Readable.from([bytes]) }; }, async deleteObject(key: string) { objects.delete(key); } };
  const create = () => createNativeTaskStore({ prisma: prisma as never, storage: storage as never, taskId: task.id, executionAttempt: 1,
    execution: readNativeAgentExecution(task.result)!, authorize: async () => { if (!authorized || task.executionAttempt !== 1) throw new Error('authority revoked'); } });
  const state: NativeAgentSessionState = { kind: 'hermes-native-agent', binding: { taskId: 'task', artifactId: 'paper', documentSha256: 'a'.repeat(64),
    sourceMapHash: 'b'.repeat(64), ...runtime, allowedTools: [], maxTurns: 3, maxOutputTokens: 100, maxTotalOutputTokens: 300,
    maxInputBytes: 9000, deadlineAt: 10000 }, initialMessages: [{ role: 'user', content: 'fixed' }], turns: [{ state: 'started',
      target: { provider: 'fixture', model: runtime.model, promptHash: 'c'.repeat(64) }, request: { messages: [{ role: 'user', content: 'fixed' }], options: {} }, effectiveOptions: {} }] };
  const completed = () => ({ ...state, turns: [{ ...state.turns[0]!, state: 'completed' as const, response: { text: 'saved', provider: 'fixture', model: runtime.model,
    promptHash: 'c'.repeat(64), finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1 } } }] });
  return { task, objects, queuedCleanup, create, state, completed, revoke: () => { authorized = false; },
    loseWriteAfterDeletion: () => { loseWrite = true; }, get inTransaction() { return insideTransaction; } };
}
describe('native private task object store', () => {
  it('uses existing deleted-task cleanup when storage wrote bytes but lost its acknowledgment after deletion', async () => {
    const f = fixture(); f.loseWriteAfterDeletion();
    await expect(f.create().compareAndSet(null, f.state)).rejects.toThrow('write acknowledgment');
    expect(f.objects.size).toBe(1); expect(f.queuedCleanup).toEqual([...f.objects.keys()]);
    expect(readNativeAgentExecution(f.task.result)?.checkpoint).toBeUndefined();
  });
  it('registers a failed live-task write for existing private task cleanup without adopting a checkpoint', async () => {
    const f = fixture(); const store = f.create(); f.revoke();
    await expect(store.compareAndSet(null, f.state)).rejects.toThrow('revoked');
    expect(f.objects.size).toBe(1);
    const retained = (f.task.result as { nativeAgentObjects?: { objectKey: string }[] }).nativeAgentObjects;
    expect(retained).toEqual([...f.objects.keys()].map(objectKey => ({ objectKey })));
    expect(readNativeAgentExecution(f.task.result)?.checkpoint).toBeUndefined();
  });
  it('stores full native history privately before the task CAS and reloads it in another process', async () => {
    const f = fixture(); const store = f.create(); await store.compareAndSet(null, f.state);
    expect(f.objects.size).toBe(1); expect(JSON.stringify(f.task.result)).not.toContain('initialMessages');
    expect(await f.create().read()).toEqual(f.state);
  });
  it('retains an exact paid response after revoke or a changed lease without consumption permission', async () => {
    const f = fixture(); const store = f.create(); await store.compareAndSet(null, f.state);
    f.revoke(); f.task.executionAttempt = 2; f.task.status = 'failed'; await store.complete(f.state, f.completed());
    expect(await f.create().read()).toEqual(f.completed());
    await expect(store.publish(f.state, async () => 'must not send')).rejects.toThrow('revoked');
  });
  it.each(['bytes', 'task', 'deleted'])('rejects changed %s without exposing or consuming a private answer', async change => {
    const f = fixture(); await f.create().compareAndSet(null, f.state);
    const cp = readNativeAgentExecution(f.task.result)!.checkpoint!;
    if (change === 'bytes') f.objects.set(cp.objectKey, Buffer.alloc(cp.size));
    if (change === 'task') f.task.result.nativeAgentExecution!.checkpoint!.taskId = 'foreign';
    if (change === 'deleted') f.task.deletedAt = new Date();
    await expect(f.create().read()).rejects.toThrow();
  });
  it('invokes HTTP under the final authority transaction but waits for the model after it commits', async () => {
    const f = fixture(); const store = f.create(); await store.compareAndSet(null, f.state);
    let resolve!: (value: string) => void;
    const waiting = store.publish(f.state, () => { expect(f.inTransaction).toBe(true); return new Promise<string>(yes => { resolve = yes; }); });
    for (let i = 0; i < 20 && !resolve; i++) await new Promise(r => setTimeout(r, 0));
    expect(resolve).toBeDefined(); expect(f.inTransaction).toBe(false); resolve('paid answer'); expect(await waiting).toBe('paid answer');
  });
  it('checks publication again after a started receipt, instead of relying on the earlier authorization', async () => {
    const f = fixture(); const store = f.create(); await store.compareAndSet(null, f.state); f.revoke(); let sent = 0;
    await expect(store.publish(f.state, async () => { sent++; return 'wrong'; })).rejects.toThrow('revoked'); expect(sent).toBe(0);
  });
});
