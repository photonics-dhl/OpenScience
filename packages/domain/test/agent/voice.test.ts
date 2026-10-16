import { isDeepStrictEqual } from 'node:util';
import { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { sha256HexBuffer, type StorageAdapter } from '@openscience/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { claimAgentTask, getAgentTask, markTaskProgress, persistHermesVoiceTaskInTransaction, prepareAgentTaskForCrashRecovery,
  projectAgentTaskResult, recoverUndispatchedAgentTasks, retryAgentTask, submitAgentTask, taskToView } from '../../src/agent/agent';
import { finalizeHermesVoiceTask, findHermesVoiceSubmission, getHermesVoiceAudio, getHermesVoiceTask,
  loadHermesVoiceExecution, readHermesVoiceCheckpoint, resumeHermesVoiceTask, saveHermesVoiceCheckpoint,
  submitHermesVoiceReply, submitHermesVoiceTranscription, validateHermesVoiceRecording,
  withHermesVoiceSubmission, type HermesVoiceDeps } from '../../src/agent/voice';
import { HERMES_VOICE_MAX_RECORDING_BYTES, HERMES_VOICE_OWNED_STOP_REASON } from '../../src/agent/voice-contract';
import * as voiceContract from '../../src/agent/voice-contract';

// Exercise the eventual writer phase without changing the reader release source.
beforeEach(() => { vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true); });

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function wav(samples = 160, sample = 3): Buffer {
  const value = Buffer.alloc(44 + samples * 2, sample);
  value.write('RIFF', 0); value.writeUInt32LE(value.length - 8, 4); value.write('WAVEfmt ', 8);
  value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22);
  value.writeUInt32LE(16_000, 24); value.writeUInt32LE(32_000, 28);
  value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34); value.write('data', 36);
  value.writeUInt32LE(samples * 2, 40);
  return value;
}
function fixture(personal = false) {
  const { prisma, db } = createFakePrisma();
  Object.assign(prisma, { trashEntry: { findFirst: async () => null, findUnique: async () => null } });
  seedUser(db, { id: id(1) });
  db.usageLedger.push({ id: id(2), userId: id(1), resource: 'ai_credit', kind: 'grant', delta: 8 });
  db.workspaces.push({ id: id(3), status: 'active' });
  db.memberships.push({ id: id(4), workspaceId: id(3), userId: id(1), role: 'author' });
  db.researchObjects.push({ id: id(5), workspaceId: id(3), deletedAt: null });
  db.agentSessions.push({ id: id(6), userId: id(1), kind: 'workspace.guide', status: 'active',
    researchObjectId: personal ? null : id(5), deletedAt: null });
  db.agentTasks.push({ id: id(7), sessionId: id(6), kind: 'workspace.guide', status: 'succeeded', executionAttempt: 1,
    result: { summary: 'A saved Hermes answer.' }, deletedAt: null, error: null });
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const storage: StorageAdapter = {
    headObject: vi.fn(async key => { const object = objects.get(key); return object ? { size: object.bytes.length,
      contentType: object.contentType, sha256: sha256HexBuffer(object.bytes), etag: 'stored' } : null; }),
    putObject: vi.fn(async (key, body, options) => {
      if (!Buffer.isBuffer(body)) throw Error('Fixture accepts buffered object input');
      if (options?.sha256 && sha256HexBuffer(body) !== options.sha256) throw Error('checksum');
      objects.set(key, { bytes: Buffer.from(body), contentType: options?.contentType ?? '' });
      return { key, size: body.length, etag: 'stored' };
    }),
    getObject: vi.fn(async key => { const object = objects.get(key)!;
      return { body: Readable.from(object.bytes), size: object.bytes.length, contentType: object.contentType }; }),
    deleteObject: vi.fn(async key => { objects.delete(key); }),
  };
  const update = prisma.agentTask.updateMany.bind(prisma.agentTask);
  // JSON CAS and soft-delete filters are a required DB boundary absent from the common fake.
  vi.spyOn(prisma.agentTask, 'updateMany').mockImplementation(async args => {
    const row = db.agentTasks.find(task => task.id === args.where?.id);
    const equals = (args.where?.result as { equals?: unknown } | undefined)?.equals;
    if (equals !== undefined && !(equals === Prisma.AnyNull ? row?.result == null : isDeepStrictEqual(row?.result, equals))) return { count: 0 };
    if (args.where?.deletedAt === null && row?.deletedAt) return { count: 0 };
    return update(args);
  });
  const deps = { prisma, storage, mailer: {}, redis: { lpush: vi.fn(async () => 1) },
    voicePresets: [{ id: 'standard-1', name: 'Standard', languages: ['zh', 'en'], creditsPerRequest: 1 }] } as unknown as HermesVoiceDeps;
  const transcriptionInput = { userId: id(1), sessionId: id(6), idempotencyKey: id(20), recording: wav() };
  const replyInput = { userId: id(1), sourceTaskId: id(7), voiceId: 'standard-1', idempotencyKey: id(21) };
  const row = (taskId: string) => db.agentTasks.find(task => task.id === taskId)!;
  const submit = () => submitHermesVoiceTranscription(deps, transcriptionInput);
  const claim = async (taskId: string) => {
    expect(await claimAgentTask(deps, taskId)).not.toBeNull();
    return loadHermesVoiceExecution(deps, { taskId, executionAttempt: row(taskId).executionAttempt });
  };
  return { deps, prisma, db, storage, objects, row, transcriptionInput, replyInput, submit, claim };
}

describe('Hermes voice reader stage', () => {
  beforeEach(() => { vi.mocked(voiceContract.isHermesVoiceWriterEnabled).mockReturnValue(false); });
  async function paidBeforeReader() {
    const f = fixture();
    vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true);
    try {
      const task = await f.submit(), execution = await f.claim(task.id);
      const create = vi.fn(async () => ({ providerId: 'original-paid-before-reader', credits: 1 }));
      await withHermesVoiceSubmission(f.deps, execution, create);
      return { f, task, execution, create };
    } finally { vi.mocked(voiceContract.isHermesVoiceWriterEnabled).mockReturnValue(false); }
  }
  it('rejects direct new ASR and TTS before recording storage, task creation or accounting', async () => {
    const f = fixture();
    await expect(f.submit()).rejects.toThrow();
    await expect(submitHermesVoiceReply(f.deps, f.replyInput)).rejects.toThrow();
    expect(f.db.agentTasks).toHaveLength(1);
    expect(f.db.usageLedger).toHaveLength(1);
    expect(f.storage.headObject).not.toHaveBeenCalled();
    expect(f.storage.putObject).not.toHaveBeenCalled();
    expect(f.deps.redis.lpush).not.toHaveBeenCalled();
  });
  it('rejects the internal fresh producer instead of relying on its HTTP caller', async () => {
    const f = fixture();
    await expect(f.prisma.$transaction(tx => persistHermesVoiceTaskInTransaction(f.deps, tx, {
      userId: id(1), sessionId: id(6), kind: 'voice.reply', idempotencyKey: id(21),
      payload: { operation: 'reply', sourceTaskId: id(7), sourceExecutionAttempt: 1,
        spokenText: 'A saved Hermes answer.', voiceId: 'standard-1' },
    }))).rejects.toThrow();
    expect(f.db.agentTasks).toHaveLength(1);
    expect(f.db.usageLedger).toHaveLength(1);
  });
  it('rejects direct first publication before any checkpoint or supplier request', async () => {
    const f = fixture();
    const payload = { operation: 'reply' as const, sourceTaskId: id(7), sourceExecutionAttempt: 1,
      spokenText: 'A saved Hermes answer.', voiceId: 'standard-1' };
    f.db.agentTasks.push({ id: id(40), sessionId: id(6), kind: 'voice.reply', status: 'running',
      executionAttempt: 1, retryCount: 0, deletedAt: null, error: null, result: null, payload });
    const execution = await loadHermesVoiceExecution(f.deps, { taskId: id(40), executionAttempt: 1 });
    const create = vi.fn(async () => ({ providerId: 'must-not-publish' }));
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(f.row(id(40)).result).toBeNull();
    expect(f.db.usageLedger).toHaveLength(1);
    expect(await prepareAgentTaskForCrashRecovery(f.deps, id(40))).toBe(false);
    expect(f.row(id(40)).status).toBe('running');
  });
  it('hides an existing private checkpoint from the actual generic task query after revocation', async () => {
    const f = fixture();
    f.db.agentTasks.push({ id: id(40), sessionId: id(6), kind: 'voice.transcribe', status: 'failed',
      executionAttempt: 1, retryCount: 0, deletedAt: null, error: 'private supplier detail',
      result: { hermesVoice: { providerId: 'private-paid-id', transcript: 'private recording',
        request: { objectKey: 'derived/hermes-voice/private.wav' } } } });
    f.db.memberships.splice(0);
    const view = await getAgentTask(f.deps, { userId: id(1), taskId: id(40) });
    expect(view.result).toBeNull(); expect(view.canRetry).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/private-paid-id|private recording|private\.wav|private supplier detail/);
  });
  it('recovers a known paid ID under the reader without rearming first publication', async () => {
    const { f, task, create } = await paidBeforeReader();
    expect(await prepareAgentTaskForCrashRecovery(f.deps, task.id)).toBe(false);
    await resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id });
    const resumed = await f.claim(task.id);
    expect(resumed.checkpoint?.providerId).toBe('original-paid-before-reader');
    expect(resumed.checkpoint?.identity.executionAttempt).toBe(1);
    await expect(withHermesVoiceSubmission(f.deps, resumed, create)).rejects.toThrow('Voice reader stage');
    await saveHermesVoiceCheckpoint(f.deps, resumed.checkpoint!.identity, { phase: 'completed', transcript: 'Original paid result' });
    expect((await finalizeHermesVoiceTask(f.deps, resumed)).result?.transcript).toBe('Original paid result');
    expect(create).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });
  it('keeps unknown paid submission held under the reader without a new claim or POST', async () => {
    const f = fixture();
    vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true);
    const task = await f.submit(), execution = await f.claim(task.id);
    const create = vi.fn(async () => { throw new Error('Original response lost'); });
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow('Original response lost');
    vi.mocked(voiceContract.isHermesVoiceWriterEnabled).mockReturnValue(false);
    expect(await prepareAgentTaskForCrashRecovery(f.deps, task.id)).toBe(false);
    await expect(resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    await expect(retryAgentTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    expect(await claimAgentTask(f.deps, task.id)).toBeNull();
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.phase).toBe('submitting');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it.each(['stopped', 'deleted', 'revoked', 'attempt'])('reader preserves the paid receipt after %s without adopting it', async loss => {
    const { f, task, execution, create } = await paidBeforeReader();
    if (loss === 'stopped') Object.assign(f.row(task.id), { status: 'failed', error: HERMES_VOICE_OWNED_STOP_REASON, executionAttempt: 2 });
    if (loss === 'deleted') f.row(task.id).deletedAt = new Date();
    if (loss === 'revoked') f.db.memberships.splice(0);
    if (loss === 'attempt') f.row(task.id).executionAttempt = 2;
    const lifecycle = () => ({ status: f.row(task.id).status, error: f.row(task.id).error,
      executionAttempt: f.row(task.id).executionAttempt, deletedAt: f.row(task.id).deletedAt });
    const originalLifecycle = lifecycle();
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', transcript: 'Late original paid result' });
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.transcript).toBe('Late original paid result');
    expect(lifecycle()).toEqual(originalLifecycle);
    await expect(finalizeHermesVoiceTask(f.deps, execution)).rejects.toThrow();
    if (loss === 'attempt') {
      // A current owner may idempotently observe the newer running claim; the old claim still cannot adopt it.
      await expect(resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).resolves.toMatchObject({ status: 'running', executionAttempt: 2 });
      expect(lifecycle()).toEqual(originalLifecycle);
    } else await expect(resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect(projectAgentTaskResult(f.row(task.id).result, 'voice.transcribe')).toBeNull();
  });
});

describe('Hermes voice privacy', () => {
  it.each(['voice.transcribe', 'voice.reply'])('keeps %s vendor receipts and storage locations out of generic task reads', kind => {
    expect(projectAgentTaskResult({ hermesVoice: { providerId: 'paid-private-id',
      audio: { objectKey: 'derived/hermes-voice/private.mp3' }, transcript: 'private recording' } }, kind)).toBeNull();
  });
});

describe('Hermes voice recording and submission', () => {
  it('derives duration from the exact canonical WAV bytes including the 60 second boundary', () => {
    expect(validateHermesVoiceRecording(wav())).toEqual({ bytes: 364, durationSeconds: 0.01 });
    const max = wav(16_000 * 60);
    expect(max.length).toBe(HERMES_VOICE_MAX_RECORDING_BYTES);
    expect(validateHermesVoiceRecording(max).durationSeconds).toBe(60);
  });
  it.each(['short', 'long', 'extra', 'riff', 'fmt', 'pcm', 'channels', 'rate', 'byterate', 'align', 'bits', 'data', 'odd'])('rejects %s WAV transport before storage or debit', async mutation => {
    const f = fixture(); let bytes = wav();
    if (mutation === 'short') bytes = Buffer.alloc(42);
    if (mutation === 'long') bytes = wav(16_000 * 60 + 1);
    if (mutation === 'extra') bytes = Buffer.concat([bytes, Buffer.from('JUNK')]);
    if (mutation === 'riff') bytes.writeUInt32LE(1, 4);
    if (mutation === 'fmt') bytes.writeUInt32LE(18, 16);
    if (mutation === 'pcm') bytes.writeUInt16LE(3, 20);
    if (mutation === 'channels') bytes.writeUInt16LE(2, 22);
    if (mutation === 'rate') bytes.writeUInt32LE(44_100, 24);
    if (mutation === 'byterate') bytes.writeUInt32LE(1, 28);
    if (mutation === 'align') bytes.writeUInt16LE(1, 32);
    if (mutation === 'bits') bytes.writeUInt16LE(8, 34);
    if (mutation === 'data') bytes.writeUInt32LE(1, 40);
    if (mutation === 'odd') bytes = bytes.subarray(0, bytes.length - 1);
    await expect(submitHermesVoiceTranscription(f.deps, { ...f.transcriptionInput, recording: bytes })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.storage.putObject).not.toHaveBeenCalled(); expect(f.db.usageLedger).toHaveLength(1);
  });
  it('exact audio replay preserves original task, last credit and object; another recording cannot overwrite it', async () => {
    const f = fixture(); const first = await f.submit();
    f.db.usageLedger[0].delta = 1;
    expect((await f.submit()).id).toBe(first.id);
    expect(f.storage.putObject).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    await expect(submitHermesVoiceTranscription(f.deps, { ...f.transcriptionInput, recording: wav(160, 8) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.storage.putObject).toHaveBeenCalledTimes(1);
    expect((await findHermesVoiceSubmission(f.deps, { userId: id(1), idempotencyKey: id(20) })).id).toBe(first.id);
  });
  it('stores input before exposing or dispatching a task and removes only its confirmed unreferenced orphan on debit failure', async () => {
    const f = fixture(); f.db.usageLedger[0].delta = 0;
    await expect(f.submit()).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDIT' });
    expect(f.storage.putObject).toHaveBeenCalledTimes(1); expect(f.storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(f.db.agentTasks.filter(task => task.kind.startsWith('voice.'))).toHaveLength(0);
    expect(f.deps.redis.lpush).not.toHaveBeenCalled();
  });
  it('queues internal voice tasks through the existing outbox without making their kinds public generic submissions', async () => {
    const f = fixture(); const task = await f.submit(); f.row(task.id).dispatchedAt = null;
    expect(await recoverUndispatchedAgentTasks(f.deps)).toBe(1);
    await expect(submitAgentTask(f.deps, { userId: id(1), sessionId: id(6), kind: 'voice.reply',
      payload: { operation: 'reply', spokenText: 'arbitrary client text' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('Hermes voice current authority and source', () => {
  it.each(['owner', 'session', 'kind', 'trash', 'workspace', 'membership'])('requires live %s authority for reads and submission recovery', async mutation => {
    const f = fixture(); const task = await f.submit();
    if (mutation === 'owner') f.db.agentSessions[0].userId = id(88);
    if (mutation === 'session') f.db.agentSessions[0].status = 'closed';
    if (mutation === 'kind') f.db.agentSessions[0].kind = 'review';
    if (mutation === 'trash') f.db.researchObjects[0].deletedAt = new Date();
    if (mutation === 'workspace') f.db.workspaces[0].status = 'archived';
    if (mutation === 'membership') f.db.memberships.splice(0);
    await expect(getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    await expect(findHermesVoiceSubmission(f.deps, { userId: id(1), idempotencyKey: id(20) })).rejects.toThrow();
  });
  it('allows a personal guide session with no research object and still checks the owner', async () => {
    const f = fixture(true); const task = await f.submit();
    expect((await getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).result).toEqual({ operation: 'transcription' });
    await expect(getHermesVoiceTask(f.deps, { userId: id(99), taskId: task.id })).rejects.toThrow();
  });
  it('derives immutable speech only from the succeeded guide summary and the permitted standard catalog', async () => {
    const f = fixture(); const task = await submitHermesVoiceReply(f.deps, f.replyInput);
    expect(f.row(task.id).payload).toEqual({ operation: 'reply', sourceTaskId: id(7), sourceExecutionAttempt: 1,
      spokenText: 'A saved Hermes answer.', voiceId: 'standard-1' });
    await expect(submitHermesVoiceReply(f.deps, { ...f.replyInput, voiceId: 'custom-paid', idempotencyKey: id(32) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    f.db.agentTasks[0].result.summary = '改变'.repeat(200);
    await expect(submitHermesVoiceReply(f.deps, { ...f.replyInput, idempotencyKey: id(33) })).rejects.toThrow('1000');
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    await expect(getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
  });
  it('blocks source invalidation after intent preparation and before supplier creation', async () => {
    const f = fixture(); const task = await submitHermesVoiceReply(f.deps, f.replyInput); const execution = await f.claim(task.id);
    const transaction = f.prisma.$transaction.bind(f.prisma); let count = 0;
    f.prisma.$transaction = (async (...args: Parameters<typeof transaction>) => {
      const result = await transaction(...args); if (++count === 1) f.db.agentTasks[0].result.summary = 'Revised after preparation'; return result;
    }) as typeof f.prisma.$transaction;
    const create = vi.fn(async () => ({ providerId: 'must-not-create' }));
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled(); expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.phase).toBe('submitting');
  });
  it('orders final membership authority with bounded supplier creation', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const raw = f.prisma.$queryRaw.bind(f.prisma); const queries: string[] = [];
    f.prisma.$queryRaw = (async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      queries.push(Array.isArray(query) ? query.join('?') : (query as Prisma.Sql).sql); return raw(query as never, ...values);
    }) as typeof f.prisma.$queryRaw;
    await withHermesVoiceSubmission(f.deps, execution, async signal => {
      expect(queries.at(-1)).toContain('FOR KEY SHARE'); expect(signal.aborted).toBe(false);
      expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.phase).toBe('submitting'); return { providerId: 'known-id', credits: 0 };
    });
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)).toMatchObject({ phase: 'submitted', providerId: 'known-id', credits: 0 });
  });
  it('blocks a membership revocation that completes between preparation and supplier creation', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const transaction = f.prisma.$transaction.bind(f.prisma); let count = 0;
    f.prisma.$transaction = (async (...args: Parameters<typeof transaction>) => {
      const result = await transaction(...args); if (++count === 1) f.db.memberships.splice(0); return result;
    }) as typeof f.prisma.$transaction;
    const create = vi.fn(async () => ({ providerId: 'must-not-create' }));
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled(); expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.phase).toBe('submitting');
  });
  it('commits publication before awaiting the response so triggered ordinary task writers can finish', async () => {
    const f = fixture(true); const task = await f.submit(); const execution = await f.claim(task.id);
    seedUser(f.db, { id: id(80) });
    f.db.usageLedger.push({ id: id(81), userId: id(80), resource: 'ai_credit', kind: 'grant', delta: 4 });
    f.db.agentSessions.push({ id: id(82), userId: id(80), kind: 'workspace.guide', status: 'active', researchObjectId: null });
    const base = f.prisma; let nextTx = 0;
    const active = new Set<number>(); const owners = new Map<string, number>(); const changed = new Set<() => void>();
    async function lock(name: string, owner: number) {
      while (owners.has(name) && owners.get(name) !== owner) await new Promise<void>(resolve => changed.add(resolve));
      owners.set(name, owner);
    }
    // Model only the two actual trigger locks used here: global writer, then session FOR UPDATE.
    // It intentionally treats FOR SHARE as conflicting too; the live-parent trigger upgrades to FOR UPDATE.
    f.prisma.$transaction = (async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const owner = ++nextTx; active.add(owner);
      const tx = new Proxy(base, { get(target, key) {
        if (key === '$executeRaw') return async (query: TemplateStringsArray, ...values: unknown[]) => {
          if (query.join('').includes('pg_advisory_xact_lock(728413920)')) await lock('global', owner);
          return target.$executeRaw(query, ...values);
        };
        if (key === '$queryRaw') return async (query: TemplateStringsArray, ...values: unknown[]) => {
          if (/FROM agent_sessions.+FOR (?:UPDATE|SHARE)/u.test(query.join(''))) await lock(`session:${values[0]}`, owner);
          return target.$queryRaw(query, ...values);
        };
        if (key === 'agentTask') return new Proxy(target.agentTask, { get(delegate, operation) {
          const original = Reflect.get(delegate, operation);
          if (operation !== 'create' && operation !== 'updateMany') return typeof original === 'function' ? original.bind(delegate) : original;
          return async (args: { data: { sessionId?: string }; where?: { id?: string } }) => {
            await lock('global', owner);
            const sessionId = args.data.sessionId ?? f.row(args.where?.id ?? '').sessionId;
            await lock(`session:${sessionId}`, owner);
            return Reflect.apply(original, delegate, [args]);
          };
        } });
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      try { return await run(tx as unknown as Prisma.TransactionClient); }
      finally {
        active.delete(owner);
        for (const [name, heldBy] of owners) if (heldBy === owner) owners.delete(name);
        const waiting = [...changed]; changed.clear(); waiting.forEach(resolve => resolve());
      }
    }) as typeof f.prisma.$transaction;
    let started!: () => void, finish!: (value: { providerId: string }) => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const response = new Promise<{ providerId: string }>(resolve => { finish = resolve; });
    let publicationOwner = 0;
    const pending = withHermesVoiceSubmission(f.deps, execution, () => {
      publicationOwner = nextTx; expect(active.has(publicationOwner)).toBe(true);
      expect(owners.get(`session:${id(6)}`)).toBe(publicationOwner);
      started(); return response;
    });
    await began;
    const normal = submitAgentTask(f.deps, { userId: id(1), sessionId: id(6), kind: 'workspace.guide', payload: { goal: 'Ordinary same-session request' } });
    const unrelated = submitAgentTask(f.deps, { userId: id(80), sessionId: id(82), kind: 'workspace.guide', payload: { goal: 'Unrelated user request' } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const writersCompleted = await Promise.race([Promise.all([normal, unrelated]).then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 200); })]);
      expect(writersCompleted, 'Normal trigger writers must complete before the held supplier response').toBe(true);
      expect(active.has(publicationOwner)).toBe(false);
    } finally {
      clearTimeout(timer); finish({ providerId: 'one-started-request' });
      await Promise.all([pending, normal, unrelated]);
    }
  });
  it('orders short preparation, publication and finalization writes global-first like the live-parent triggers', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const transaction = f.prisma.$transaction.bind(f.prisma);
    const queryRaw = f.prisma.$queryRaw.bind(f.prisma); const executeRaw = f.prisma.$executeRaw.bind(f.prisma);
    let currentTransactionLocks: string[] = []; let rowWaits = 0;
    f.prisma.$transaction = (async (...args: Parameters<typeof transaction>) => {
      currentTransactionLocks = []; return transaction(...args);
    }) as typeof f.prisma.$transaction;
    f.prisma.$executeRaw = (async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      currentTransactionLocks.push(Array.isArray(query) ? query.join('?') : (query as Prisma.Sql).sql);
      return executeRaw(query as never, ...values);
    }) as typeof f.prisma.$executeRaw;
    f.prisma.$queryRaw = (async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.isArray(query) ? query.join('?') : (query as Prisma.Sql).sql;
      if (sql.includes('SELECT deleted_at FROM research_objects')) {
        rowWaits += 1;
        expect(currentTransactionLocks.some(lock => lock.includes('pg_advisory_xact_lock(728413920)'))).toBe(true);
      }
      return queryRaw(query as never, ...values);
    }) as typeof f.prisma.$queryRaw;
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'row-only-intent-and-adoption' }));
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', transcript: 'Saved result' });
    await finalizeHermesVoiceTask(f.deps, execution);
    expect(rowWaits).toBe(3);
  });
});

describe('Hermes voice paid recovery and private completion', () => {
  it('holds a crash with uncertain submission forever without another supplier POST, generic retry or resume', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const create = vi.fn(async () => { throw new Error('connection lost after request write'); });
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow('connection lost');
    expect(await prepareAgentTaskForCrashRecovery(f.deps, task.id)).toBe(false);
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).rejects.toThrow();
    expect(await claimAgentTask(f.deps, task.id)).toBeNull();
    await expect(retryAgentTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    await expect(resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect((await getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).result).toEqual({ operation: 'transcription', uncertain: true });
  });
  it('recovers a crash before any supplier intent through the existing claim without additional fee', async () => {
    const f = fixture(); const task = await f.submit(); await f.claim(task.id);
    expect(await prepareAgentTaskForCrashRecovery(f.deps, task.id)).toBe(true);
    const execution = await f.claim(task.id); expect(execution.identity.executionAttempt).toBe(2);
    expect(execution.checkpoint).toBeUndefined(); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });
  it('resumes only a saved supplier ID, preserving original paid identity across a new claim', async () => {
    const f = fixture(); const task = await f.submit(); const original = await f.claim(task.id);
    const create = vi.fn(async () => ({ providerId: 'saved-original', credits: 1 }));
    await withHermesVoiceSubmission(f.deps, original, create);
    expect(await prepareAgentTaskForCrashRecovery(f.deps, task.id)).toBe(false);
    expect((await resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).status).toBe('pending');
    const resumed = await f.claim(task.id); expect(resumed.identity.executionAttempt).toBe(2);
    expect(resumed.checkpoint?.identity.executionAttempt).toBe(1);
    await expect(withHermesVoiceSubmission(f.deps, resumed, create)).rejects.toThrow();
    await saveHermesVoiceCheckpoint(f.deps, resumed.checkpoint!.identity, { phase: 'completed', transcript: 'Please explain the result.' });
    const completed = await finalizeHermesVoiceTask(f.deps, resumed);
    expect(completed.result).toEqual({ operation: 'transcription', transcript: 'Please explain the result.' });
    expect(create).toHaveBeenCalledTimes(1); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });
  it('retains a received paid supplier ID if the final authority transaction fails after creation', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const transaction = f.prisma.$transaction.bind(f.prisma); let count = 0;
    f.prisma.$transaction = (async (...args: Parameters<typeof transaction>) => {
      const result = await transaction(...args); if (++count === 2) throw Error('transaction response lost'); return result;
    }) as typeof f.prisma.$transaction;
    const create = vi.fn(async () => ({ providerId: 'paid-response-before-tx-failure', credits: 0.5 }));
    await expect(withHermesVoiceSubmission(f.deps, execution, create)).resolves.toMatchObject({ phase: 'submitted', providerId: 'paid-response-before-tx-failure' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)).toMatchObject({ phase: 'submitted', providerId: 'paid-response-before-tx-failure', credits: 0.5 });
  });
  it('allows generic success only as an idempotent read after the dedicated authority finalizer', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'existing-original' }));
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', transcript: 'Correctable user transcript' });
    await expect(markTaskProgress(f.deps, { taskId: task.id, status: 'succeeded', expectedExecutionAttempt: 1,
      result: { transcript: 'forged bypass' } })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    await finalizeHermesVoiceTask(f.deps, execution);
    expect((await markTaskProgress(f.deps, { taskId: task.id, status: 'succeeded', expectedExecutionAttempt: 1 })).status).toBe('succeeded');
    expect((await getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).result?.transcript).toBe('Correctable user transcript');
  });
  it.each(['stopped', 'deleted', 'revoked', 'attempt'])('retains original paid receipt after %s without adopting or exposing it', async change => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'paid-before-loss' }));
    if (change === 'stopped') Object.assign(f.row(task.id), { status: 'failed', error: HERMES_VOICE_OWNED_STOP_REASON, executionAttempt: 2 });
    if (change === 'deleted') f.row(task.id).deletedAt = new Date();
    if (change === 'revoked') f.db.memberships.splice(0);
    if (change === 'attempt') f.row(task.id).executionAttempt = 2;
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', transcript: 'late paid private transcript' });
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.transcript).toBe('late paid private transcript');
    await expect(finalizeHermesVoiceTask(f.deps, execution)).rejects.toThrow();
    expect(projectAgentTaskResult(f.row(task.id).result, 'voice.transcribe')).toBeNull();
    if (change === 'stopped') {
      expect(f.row(task.id).error).toBe(HERMES_VOICE_OWNED_STOP_REASON);
      expect((await getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).result).toEqual({ operation: 'transcription' });
      await expect(resumeHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    }
  });
  it.each(['task', 'session', 'research-object'])('retains only the original paid result after %s trash under the real trigger maintenance rule', async deleted => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'paid-before-trash' }));
    if (deleted === 'task') f.row(task.id).deletedAt = new Date();
    if (deleted === 'session') f.db.agentSessions[0].deletedAt = new Date();
    if (deleted === 'research-object') f.db.researchObjects[0].deletedAt = new Date();
    const fieldsBefore = { ...f.row(task.id) }; delete fieldsBefore.result;
    let maintenance = false; const write = f.prisma.agentTask.updateMany.bind(f.prisma.agentTask);
    const raw = f.prisma.$executeRaw.bind(f.prisma); const transaction = f.prisma.$transaction.bind(f.prisma);
    f.prisma.$transaction = (async (...args: Parameters<typeof transaction>) => {
      maintenance = false; try { return await transaction(...args); } finally { maintenance = false; }
    }) as typeof f.prisma.$transaction;
    f.prisma.$executeRaw = (async (query: TemplateStringsArray, ...values: unknown[]) => {
      if (query.join('').includes("set_config('openscience.trash_mutation', 'on', true)")) maintenance = true;
      return raw(query, ...values);
    }) as typeof f.prisma.$executeRaw;
    f.prisma.agentTask.updateMany = (async args => {
      // Exact rejection in openscience_require_live_parent; maintenance is result-only and transaction-local.
      if (!maintenance) throw Object.assign(Error('Content is in trash'), { code: '55000' });
      expect(Object.keys(args.data)).toEqual(['result']); return write(args);
    }) as typeof f.prisma.agentTask.updateMany;
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', transcript: 'Private original paid result' });
    const fieldsAfter = { ...f.row(task.id) }; delete fieldsAfter.result; delete fieldsBefore.updatedAt; delete fieldsAfter.updatedAt;
    expect(fieldsAfter).toEqual(fieldsBefore);
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.transcript).toBe('Private original paid result');
    expect(maintenance).toBe(false);
    await expect(finalizeHermesVoiceTask(f.deps, execution)).rejects.toThrow();
  });
  it('does not enable trash maintenance for live receipts or a mismatched original identity', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    const raw = vi.spyOn(f.prisma, '$executeRaw');
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'live-receipt' }));
    const maintenanceCalls = () => raw.mock.calls.filter(args => Array.isArray(args[0]) && args[0].join('').includes('openscience.trash_mutation'));
    expect(maintenanceCalls()).toHaveLength(0);
    f.row(task.id).deletedAt = new Date();
    await expect(saveHermesVoiceCheckpoint(f.deps, { ...execution.identity, userId: id(99) },
      { phase: 'completed', transcript: 'Must not write' })).rejects.toThrow('身份不匹配');
    expect(maintenanceCalls()).toHaveLength(0);
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.phase).toBe('submitted');
  });
  it('never exposes supplier failures or lets a generic finalizer replace private receipts', async () => {
    const f = fixture(); const task = await f.submit(); const execution = await f.claim(task.id);
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'secret-supplier-id' }));
    await markTaskProgress(f.deps, { taskId: task.id, status: 'failed', expectedExecutionAttempt: 1,
      error: 'Provider secret https://example.test/private?key=x', result: { hermesVoice: 'forged' } });
    expect(readHermesVoiceCheckpoint(f.row(task.id).result)?.providerId).toBe('secret-supplier-id');
    const view = await getHermesVoiceTask(f.deps, { userId: id(1), taskId: task.id });
    expect(JSON.stringify(view)).not.toContain('secret'); expect(view.result).toEqual({ operation: 'transcription', canResume: true });
    expect(JSON.stringify(taskToView(f.row(task.id), true))).not.toContain('secret');
    expect(taskToView(f.row(task.id), true).canRetry).toBe(false);
  });
  it('returns audio only for its live source/owner and validated private stored MP3', async () => {
    const f = fixture(); const task = await submitHermesVoiceReply(f.deps, f.replyInput); const execution = await f.claim(task.id);
    await withHermesVoiceSubmission(f.deps, execution, async () => ({ providerId: 'reply-provider' }));
    const bytes = Buffer.from('ID3-trusted-gateway-fixture'); const audio = { objectKey: `derived/hermes-voice/${id(1)}/${task.id}/${sha256HexBuffer(bytes)}.mp3`,
      sha256: sha256HexBuffer(bytes), bytes: bytes.length, contentType: 'audio/mpeg' as const };
    f.objects.set(audio.objectKey, { bytes, contentType: audio.contentType });
    await saveHermesVoiceCheckpoint(f.deps, execution.identity, { phase: 'completed', audio });
    expect((await finalizeHermesVoiceTask(f.deps, execution)).result).toEqual({ operation: 'reply', audioReady: true, spokenText: 'A saved Hermes answer.' });
    expect(await getHermesVoiceAudio(f.deps, { userId: id(1), taskId: task.id })).toEqual(audio);
    f.objects.get(audio.objectKey)!.bytes = Buffer.from('tampered');
    await expect(getHermesVoiceAudio(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
    f.db.memberships.splice(0);
    await expect(getHermesVoiceAudio(f.deps, { userId: id(1), taskId: task.id })).rejects.toThrow();
  });
});
