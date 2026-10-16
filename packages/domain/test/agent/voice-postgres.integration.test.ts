import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createPrismaAuditSink } from '../../../database/dist/index';
import type { AgentDeps } from '../../src/agent/agent';
import type { HermesVoiceDeps } from '../../src/agent/voice';

type Domain = typeof import('../../src/index');
// Same isolated real PostgreSQL target; this fixture does not load the unrelated ordinary worker.
const requireRuntime = createRequire(__filename);
const support = {
  validatedTestUrl(): string {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL?.trim()) throw new Error('Explicit test database environment required');
    let url: URL;
    try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('Invalid test database target'); }
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55440' || url.pathname !== '/image_grant_test' || url.hash) throw new Error('Unapproved test database target');
    if ([...url.searchParams.keys()].some(key => key !== 'connection_limit')) throw new Error('Unapproved test database options');
    url.searchParams.set('connection_limit', '1');
    return url.toString();
  },
  loadRuntime(): { domain: Domain } { return { domain: requireRuntime(resolve(__dirname, '../../dist/index.js')) as Domain }; },
  createClient(): PrismaClient {
    const url = support.validatedTestUrl();
    const runtime = requireRuntime('@prisma/client') as typeof import('@prisma/client');
    return new runtime.PrismaClient({ datasources: { db: { url } } });
  },
  async warm(client: PrismaClient): Promise<number> {
    await client.$connect();
    const rows = await client.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    assert.equal(rows.length, 1); assert.ok(Number.isInteger(rows[0]?.pid) && rows[0]!.pid > 0);
    return rows[0]!.pid;
  },
  deps(prisma: PrismaClient): AgentDeps {
    const audit = createPrismaAuditSink(prisma);
    return { prisma, audit: { record: async (event, tx) => {
      assert.ok(tx, 'Audit must use the actual business transaction');
      await audit.record(event, tx);
    } } } as AgentDeps;
  },
};
support.validatedTestUrl();

function deferred<T>() {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolveValue = resolvePromise; });
  return { promise, resolve: resolveValue };
}
const releases: Array<() => void> = [];
const pending: Array<Promise<unknown>> = [];
function observed<T>(promise: Promise<T>) {
  const result = promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  pending.push(result); return result;
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Ordinary writer waited for the held provider response')), 2_000);
    })]);
  } finally { clearTimeout(timer); }
}

let domain: Domain;
let writerContract: Pick<Domain, 'isHermesVoiceWriterEnabled'>;
let db: PrismaClient, writer: PrismaClient, observer: PrismaClient;
let voicePid: number;
beforeAll(async () => {
  domain = support.loadRuntime().domain;
  writerContract = requireRuntime(resolve(__dirname, '../../dist/agent/voice-contract.js')) as typeof writerContract;
  db = support.createClient(); writer = support.createClient(); observer = support.createClient();
  const pids = await Promise.all([db, writer, observer].map(support.warm));
  assert.equal(new Set(pids).size, 3); voicePid = pids[0]!;
});
// The original publication races exercise the writer overlay; the installed reader source remains false.
beforeEach(() => { vi.spyOn(writerContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true); });
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  vi.restoreAllMocks();
});
afterAll(async () => { await Promise.all([db, writer, observer].filter(Boolean).map(client => client.$disconnect())); });

function deps(client = db): HermesVoiceDeps {
  const unused = async (): Promise<never> => { throw new Error('Reply receipt tests must not access object storage'); };
  const storage: StorageAdapter = { putObject: unused, getObject: unused, headObject: unused, deleteObject: unused };
  return { ...support.deps(client), storage,
    voicePresets: [{ id: 'synthetic-standard', name: 'Synthetic', languages: ['en'], creditsPerRequest: 1 }] };
}
async function seed() {
  const userId = randomUUID(), ownerId = randomUUID();
  for (const actorId of [userId, ownerId]) {
    await db.user.create({ data: { id: actorId, email: `${actorId}@voice-pg.invalid`, passwordHash: 'not-a-login',
      displayName: 'Synthetic voice actor', status: 'email_verified', platformRole: 'user' } });
  }
  const workspace = await db.workspace.create({ data: { type: 'team', ownerId, name: 'Synthetic voice boundary' } });
  await db.membership.createMany({ data: [{ workspaceId: workspace.id, userId: ownerId, role: 'owner' },
    { workspaceId: workspace.id, userId, role: 'author' }] });
  const ro = await db.researchObject.create({ data: { workspaceId: workspace.id, createdBy: userId, title: 'Private voice fixture' } });
  const session = await db.agentSession.create({ data: { userId, researchObjectId: ro.id, kind: 'workspace.guide' } });
  const source = await db.agentTask.create({ data: { sessionId: session.id, kind: 'workspace.guide', status: 'succeeded',
    executionAttempt: 1, payload: {}, result: { summary: 'A synthetic saved Hermes answer.' } } });
  await db.usageLedger.create({ data: { userId, resource: 'ai_credit', delta: 10n, kind: 'admin_topup',
    idempotencyKey: `voice-pg-credit:${userId}` } });
  const task = await domain.submitHermesVoiceReply(deps(), { userId, sourceTaskId: source.id,
    voiceId: 'synthetic-standard', idempotencyKey: randomUUID() });
  const claimed = await domain.claimAgentTask(deps(), task.id); assert.ok(claimed);
  const execution = await domain.loadHermesVoiceExecution(deps(), { taskId: task.id, executionAttempt: claimed.executionAttempt });
  return { userId, workspaceId: workspace.id, roId: ro.id, sessionId: session.id, taskId: task.id, execution };
}
async function published(f: Awaited<ReturnType<typeof seed>>) {
  const started = deferred<void>(); const response = deferred<{ providerId: string; credits: number }>();
  let calls = 0;
  releases.push(() => response.resolve({ providerId: 'synthetic-paid-task', credits: 1 }));
  const result = observed(domain.withHermesVoiceSubmission(deps(), f.execution, () => {
    calls++; started.resolve(); return response.promise;
  }));
  await started.promise;
  return { result, response, calls: () => calls };
}
async function assertVoiceTransactionReleased() {
  const deadline = Date.now() + 2_000;
  do {
    const rows = await observer.$queryRaw<Array<{ active: boolean }>>`
      SELECT xact_start IS NOT NULL AS active FROM pg_stat_activity WHERE pid = ${voicePid}`;
    if (rows[0]?.active === false) return;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail('Provider response was awaited inside the voice database transaction');
}
const lifecycle = (task: { status: string; error: string | null; executionAttempt: number; deletedAt: Date | null }) => ({
  status: task.status, error: task.error, executionAttempt: task.executionAttempt, deletedAt: task.deletedAt,
});

describe('Hermes voice with the installed PostgreSQL trash triggers', () => {
  it('reader blocks direct producers and initial publication without new rows, debit or private intent', async () => {
    const f = await seed();
    vi.mocked(writerContract.isHermesVoiceWriterEnabled).mockReturnValue(false);
    const taskCount = await db.agentTask.count({ where: { sessionId: f.sessionId } });
    const debitCount = await db.usageLedger.count({ where: { userId: f.userId, kind: 'consume' } });
    await assert.rejects(domain.submitHermesVoiceReply(deps(), { userId: f.userId,
      sourceTaskId: f.execution.payload.operation === 'reply' ? f.execution.payload.sourceTaskId : '',
      voiceId: 'synthetic-standard', idempotencyKey: randomUUID() }), /Voice reader stage/);
    await assert.rejects(domain.submitHermesVoiceTranscription(deps(), { userId: f.userId,
      sessionId: f.sessionId, idempotencyKey: randomUUID(), recording: Buffer.alloc(44) }), /Voice reader stage/);
    let calls = 0;
    await assert.rejects(domain.withHermesVoiceSubmission(deps(), f.execution, async () => {
      calls++; return { providerId: 'must-not-publish' };
    }), /Voice reader stage/);
    assert.equal(calls, 0);
    assert.equal(await db.agentTask.count({ where: { sessionId: f.sessionId } }), taskCount);
    assert.equal(await db.usageLedger.count({ where: { userId: f.userId, kind: 'consume' } }), debitCount);
    assert.equal((await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } })).result, null);
  });
  it('reader retains an original in-flight paid receipt and completes it without a second request', async () => {
    const f = await seed(), paid = await published(f);
    await assertVoiceTransactionReleased();
    vi.mocked(writerContract.isHermesVoiceWriterEnabled).mockReturnValue(false);
    paid.response.resolve({ providerId: 'synthetic-paid-task', credits: 1 });
    const received = await paid.result; assert.ifError(received.error);
    assert.equal(received.value?.providerId, 'synthetic-paid-task');
    const sha256 = 'f'.repeat(64);
    await domain.saveHermesVoiceCheckpoint(deps(), f.execution.identity, { phase: 'completed', credits: 1,
      audio: { objectKey: `derived/hermes-voice/${f.userId}/${f.taskId}/${sha256}.mp3`,
        sha256, bytes: 4, contentType: 'audio/mpeg' } });
    assert.equal((await domain.finalizeHermesVoiceTask(deps(), f.execution)).status, 'succeeded');
    assert.equal(paid.calls(), 1);
    assert.equal(await db.usageLedger.count({ where: { userId: f.userId, kind: 'consume' } }), 1);
  });
  it('commits publication and allows an actual same-session trigger writer while HTTP remains held', async () => {
    const f = await seed(); const paid = await published(f);
    await assertVoiceTransactionReleased();
    // INSERT runs the installed global advisory + parent FOR UPDATE triggers, not a mocked lock.
    const write = observed(writer.agentTask.create({ data: { sessionId: f.sessionId, kind: 'workspace.guide', payload: {} } }));
    const written = await bounded(write); assert.ifError(written.error); assert.ok(written.value);
    assert.equal(paid.calls(), 1);
    paid.response.resolve({ providerId: 'synthetic-paid-task', credits: 1 });
    const received = await paid.result; assert.ifError(received.error); assert.equal(received.value?.phase, 'submitted');
    console.info('VOICE_PG_PROVIDER_WAIT_OUTSIDE_TRANSACTION_AND_TRIGGER_WRITER_COMMITTED');
  });

  it.each(['task', 'session', 'research_object'] as const)('retains only the original paid receipt after %s trash', async kind => {
    const f = await seed(); const paid = await published(f); await assertVoiceTransactionReleased();
    const resourceId = kind === 'task' ? f.taskId : kind === 'session' ? f.sessionId : f.roId;
    await domain.moveToTrash(deps(writer), { userId: f.userId, kind, resourceId });
    const before = await writer.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
    assert.equal(before.status, 'failed');
    paid.response.resolve({ providerId: 'synthetic-paid-task', credits: 1 });
    const received = await paid.result; assert.ifError(received.error); assert.equal(received.value?.providerId, 'synthetic-paid-task');
    const sha256 = 'f'.repeat(64);
    const audio = { objectKey: `derived/hermes-voice/${f.userId}/${f.taskId}/${sha256}.mp3`, sha256, bytes: 4, contentType: 'audio/mpeg' as const };
    await domain.saveHermesVoiceCheckpoint(deps(), f.execution.identity, { phase: 'completed', audio, credits: 1 });
    const after = await writer.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
    assert.deepEqual(lifecycle(after), lifecycle(before)); assert.deepEqual(after.payload, before.payload);
    assert.equal(domain.readHermesVoiceCheckpoint(after.result)?.phase, 'completed');
    assert.ok(await writer.trashObjectCleanup.findUnique({ where: { objectKey: audio.objectKey } }));
    await assert.rejects(domain.finalizeHermesVoiceTask(deps(), f.execution));
    await assert.rejects(domain.getHermesVoiceTask(deps(), { userId: f.userId, taskId: f.taskId }));
    // Maintenance was transaction-local: an ordinary follow-up UPDATE still hits the real trigger.
    await assert.rejects(writer.agentTask.update({ where: { id: f.taskId }, data: { progress: 99 } }));
    assert.equal(paid.calls(), 1);
    assert.equal(await writer.usageLedger.count({ where: { userId: f.userId, kind: 'consume' } }), 1);
    console.info(`VOICE_PG_LATE_RECEIPT_RESULT_ONLY_${kind.toUpperCase()}`);
  });

  it('does not publish when membership revocation wins first', async () => {
    const f = await seed(); let calls = 0;
    await writer.membership.delete({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } } });
    await assert.rejects(domain.withHermesVoiceSubmission(deps(), f.execution, async () => {
      calls++; return { providerId: 'must-not-exist' };
    }));
    assert.equal(calls, 0);
  });

  it('retains the single published receipt but denies adoption after membership revocation', async () => {
    const f = await seed(); const paid = await published(f); await assertVoiceTransactionReleased();
    await bounded(writer.membership.delete({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } } }));
    paid.response.resolve({ providerId: 'synthetic-paid-task', credits: 1 });
    const received = await paid.result; assert.ifError(received.error);
    const sha256 = 'f'.repeat(64);
    await domain.saveHermesVoiceCheckpoint(deps(), f.execution.identity, { phase: 'completed', credits: 1,
      audio: { objectKey: `derived/hermes-voice/${f.userId}/${f.taskId}/${sha256}.mp3`, sha256, bytes: 4, contentType: 'audio/mpeg' } });
    await assert.rejects(domain.finalizeHermesVoiceTask(deps(), f.execution));
    await assert.rejects(domain.getHermesVoiceTask(deps(), { userId: f.userId, taskId: f.taskId }));
    assert.equal(paid.calls(), 1);
  });
});
