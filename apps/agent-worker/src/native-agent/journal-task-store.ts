import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import { lockTrashReferences, readNativeAgentExecution, type NativeAgentExecution, type WorkspaceDeps } from '@openscience/domain';
import type { NativeAgentSessionState, NativeAgentSessionStore } from './session';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 128 * 1024 * 1024;
type Receipt = { taskId: string; objectKey: string; serializedSha256: string; size: number; executionAttempt: number;
  jobId: string; sourceDigest: string; revision: number; sourceTextSha256: string; turnCount: number; state: 'started' | 'completed';
  target: { provider: string; model: string; promptHash: string }; responseHash?: string; finishReason?: string; hasToolCalls?: boolean };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function blocked(): never { throw new Error('[blocked] Journal native checkpoint or authority changed'); }

/** Reuses the native session's paid started/completed protocol with a journal-text receipt. */
export function createJournalNativeTaskStore(input: { prisma: WorkspaceDeps['prisma']; storage: StorageAdapter; taskId: string; executionAttempt: number;
  execution: NativeAgentExecution;
  journalText: { jobId: string; sourceDigest: string; revision: number; sourceTextSha256: string };
  authorize: (tx: Prisma.TransactionClient) => Promise<void> }): NativeAgentSessionStore {
  const known = new Map<string, Receipt>();
  async function current(db: Pick<Prisma.TransactionClient, 'agentTask'>) {
    const task = await db.agentTask.findUnique({ where: { id: input.taskId } });
    const marker = readNativeAgentExecution(task?.result);
    if (!task || task.deletedAt || task.kind !== 'journal.generate' || marker?.profile !== 'journal-editor'
      || task.executionAttempt !== input.executionAttempt || !record(task.result)
      || marker.runtimeId !== input.execution.runtimeId || marker.skillCatalogueId !== input.execution.skillCatalogueId
      || marker.model !== input.execution.model) blocked();
    return task;
  }
  function receipt(state: NativeAgentSessionState | null): Receipt | undefined {
    if (!state) return undefined;
    const value = known.get(sha(JSON.stringify(state)));
    if (!value) blocked();
    return value;
  }
  function parseReceipt(value: unknown): Receipt | undefined {
    if (value === undefined) return undefined;
    if (!record(value) || value.taskId !== input.taskId || value.jobId !== input.journalText.jobId
      || value.sourceDigest !== input.journalText.sourceDigest || value.revision !== input.journalText.revision
      || value.sourceTextSha256 !== input.journalText.sourceTextSha256 || value.executionAttempt !== input.executionAttempt
      || typeof value.serializedSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.serializedSha256)
      || value.objectKey !== `derived/native-agent/${value.serializedSha256}.json` || !Number.isSafeInteger(value.size)
      || Number(value.size) < 1 || Number(value.size) > MAX_BYTES || !['started', 'completed'].includes(String(value.state))) blocked();
    return value as Receipt;
  }
  async function save(previous: NativeAgentSessionState | null, next: NativeAgentSessionState, paidCompletion: boolean) {
    const old = receipt(previous);
    const binding = next.binding;
    if (binding.sourceKind !== 'journal-text' || binding.taskId !== input.taskId || !isDeepStrictEqual(binding.journalText, input.journalText)
      || binding.runtimeId !== input.execution.runtimeId || binding.skillCatalogueId !== input.execution.skillCatalogueId
      || binding.model !== input.execution.model) blocked();
    const turn = next.turns.at(-1);
    if (!turn || (paidCompletion ? turn.state !== 'completed' : turn.state !== 'started')) blocked();
    const bytes = Buffer.from(JSON.stringify(next));
    if (bytes.length > MAX_BYTES) blocked();
    const hash = sha(bytes);
    const candidate: Receipt = { taskId: input.taskId, objectKey: `derived/native-agent/${hash}.json`, serializedSha256: hash,
      size: bytes.length, executionAttempt: input.executionAttempt, ...input.journalText, turnCount: next.turns.length,
      state: turn.state, target: turn.target,
      ...(turn.state === 'completed' ? { responseHash: sha(turn.response.text), finishReason: turn.response.finishReason,
        hasToolCalls: Boolean(turn.response.toolCalls?.length) } : {}) };
    // Register the object before the CAS so task trash can account for a losing or revoked write.
    await input.prisma.$transaction(async tx => {
      await lockTrashReferences(tx); const task = await current(tx);
      const result = task.result as Record<string, unknown>;
      const refs = Array.isArray(result.nativeAgentObjects) ? result.nativeAgentObjects : [];
      if (refs.some(ref => record(ref) && ref.objectKey === candidate.objectKey)) return;
      const changed = await tx.agentTask.updateMany({ where: { id: task.id, result: { equals: task.result as Prisma.InputJsonValue } },
        data: { result: { ...result, nativeAgentObjects: [...refs, { objectKey: candidate.objectKey }] } as Prisma.InputJsonObject } });
      if (changed.count !== 1) blocked();
    }, { isolationLevel: 'Serializable' });
    const object = await input.storage.headObject(candidate.objectKey);
    if (object && object.size !== bytes.length) blocked();
    if (!object) await input.storage.putObject(candidate.objectKey, bytes, { contentType: 'application/json', sha256: hash });
    await input.prisma.$transaction(async tx => {
      await lockTrashReferences(tx);
      if (!paidCompletion) await input.authorize(tx);
      const task = await current(tx); const result = task.result as Record<string, unknown>;
      const now = parseReceipt(result.journalNativeCheckpoint);
      if (!isDeepStrictEqual(now, old)) blocked();
      if (paidCompletion) {
        if (!old || old.state !== 'started' || candidate.state !== 'completed' || candidate.turnCount !== old.turnCount
          || !isDeepStrictEqual(candidate.target, old.target)) blocked();
      } else if (candidate.state !== 'started' || candidate.turnCount !== (old?.turnCount ?? 0) + 1 || old?.state === 'started') blocked();
      const changed = await tx.agentTask.updateMany({ where: { id: task.id, status: task.status, executionAttempt: input.executionAttempt,
        result: { equals: task.result as Prisma.InputJsonValue } },
        data: { result: { ...result, journalNativeCheckpoint: candidate } as Prisma.InputJsonObject } });
      if (changed.count !== 1) blocked();
    }, { isolationLevel: 'Serializable' });
    known.set(hash, candidate);
  }
  return {
    async read() {
      const task = await current(input.prisma);
      const cp = parseReceipt((task.result as Record<string, unknown>).journalNativeCheckpoint);
      if (!cp) return null;
      const object = await input.storage.getObject(cp.objectKey);
      if (object.size !== cp.size) blocked();
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of object.body) { const part = Buffer.from(chunk); size += part.length; if (size > cp.size) blocked(); chunks.push(part); }
      const bytes = Buffer.concat(chunks);
      if (size !== cp.size || sha(bytes) !== cp.serializedSha256) blocked();
      const state = JSON.parse(bytes.toString('utf8')) as NativeAgentSessionState;
      const turn = state.turns.at(-1);
      if (state.kind !== 'hermes-native-agent' || state.binding.sourceKind !== 'journal-text'
        || !isDeepStrictEqual(state.binding.journalText, input.journalText) || state.binding.taskId !== input.taskId
        || state.binding.runtimeId !== input.execution.runtimeId || state.binding.skillCatalogueId !== input.execution.skillCatalogueId
        || state.binding.model !== input.execution.model
        || state.turns.length !== cp.turnCount || turn?.state !== cp.state || !isDeepStrictEqual(turn.target, cp.target)
        || (turn.state === 'completed' && (sha(turn.response.text) !== cp.responseHash || turn.response.finishReason !== cp.finishReason
          || Boolean(turn.response.toolCalls?.length) !== cp.hasToolCalls))) blocked();
      known.set(cp.serializedSha256, cp);
      return state;
    },
    compareAndSet: (previous, next) => save(previous, next, false),
    complete: (previous, next) => save(previous, next, true),
    async publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>): Promise<T> {
      const cp = receipt(started); let sent: Promise<T> | undefined;
      try {
        await input.prisma.$transaction(async tx => {
          await lockTrashReferences(tx); await input.authorize(tx);
          const task = await current(tx);
          if (!isDeepStrictEqual(parseReceipt((task.result as Record<string, unknown>).journalNativeCheckpoint), cp)) blocked();
          sent = submit(); void sent.catch(() => undefined);
        }, { isolationLevel: 'Serializable' });
      } catch (error) { if (!sent) throw error; }
      if (!sent) blocked();
      return sent;
    },
  };
}
