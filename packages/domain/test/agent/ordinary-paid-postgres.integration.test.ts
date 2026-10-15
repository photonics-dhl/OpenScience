import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { PrismaClient, UsageLedger } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import type { AgentDeps } from '../../src/agent/agent';

type Write = { phase: string; count: number };
type Event = { type: string; phase?: string; count?: number; writes?: Write[];
  backendPid?: number; childPid?: number; error?: unknown; code?: string | null };
type Domain = typeof import('../../src/index');
type Support = {
  validatedTestUrl(): string;
  loadRuntime(): { domain: Domain; worker: { recoverProcessingQueue(deps: unknown): Promise<number> } };
  createClient(): PrismaClient;
  warm(client: PrismaClient): Promise<number>;
  observeClient(client: PrismaClient, taskId: string, options: { emit(event: Event): void;
    afterWrite?: (write: Write) => Promise<void> }): PrismaClient;
  deps(client: PrismaClient): AgentDeps;
  safeError(error: unknown): unknown;
  MESSAGES: unknown[]; PRODUCT: Record<string, unknown>; RESPONSE: Record<string, unknown>;
  VISUALIZATION_PLAN: Record<string, unknown>; VISUALIZATION_RESPONSE: Record<string, unknown>;
};
const childFile = resolve(__dirname, 'fixtures/ordinary-paid-postgres-child.cjs');
const support = createRequire(__filename)(childFile) as Support;
support.validatedTestUrl(); // Fails before beforeAll or any client constructor; no default/dev URL.

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolveLatch => { release = resolveLatch; });
  return { promise, release };
}

const children = new Set<FixtureChild>();
const releases: Array<() => void> = [];
const pending: Array<Promise<unknown>> = [];
function outcome<T>(operation: Promise<T>) {
  const result = operation.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  pending.push(result); return result;
}

class FixtureChild {
  readonly process: ChildProcess;
  readonly events: Event[] = [];
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  private exit?: { code: number | null; signal: NodeJS.Signals | null };
  private changed = new Set<() => void>();
  backendPid = 0;
  responseReleased = false;

  constructor(taskId: string, mode: string) {
    this.process = fork(childFile, [taskId, mode], { env: { ...process.env, DATABASE_URL: support.validatedTestUrl() },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.process.on('message', event => { this.events.push(event as Event); this.notify(); });
    this.process.on('error', error => { this.events.push({ type: 'failure', error: support.safeError(error) }); this.notify(); });
    this.exited = new Promise(resolveExit => this.process.once('exit', (code, signal) => {
      this.exit = { code, signal }; this.notify(); resolveExit(this.exit);
    }).once('error', () => {
      if (!this.process.pid) { this.exit = { code: -1, signal: null }; this.notify(); resolveExit(this.exit); }
    }));
    children.add(this);
  }
  private notify() { for (const listener of this.changed) listener(); }
  send(token: string) {
    if (token === 'response') this.responseReleased = true;
    if (this.process.connected) this.process.send({ token });
  }
  async wait(type: string, phase?: string, budget = 2_000): Promise<Event> {
    const deadline = Date.now() + budget;
    while (true) {
      const failure = this.events.find(event => event.type === 'failure');
      if (failure) throw new Error(`Child failure: ${JSON.stringify(failure.error)}`);
      const found = this.events.find(event => event.type === type && (phase === undefined || event.phase === phase));
      if (found) return found;
      if (this.exit) throw new Error(`Child exited before ${type}: ${JSON.stringify(this.exit)}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Missing child event ${type}/${phase ?? ''}`);
      await new Promise<void>(resolveWait => {
        const finish = () => { clearTimeout(timer); this.changed.delete(finish); resolveWait(); };
        const timer = setTimeout(finish, remaining); this.changed.add(finish);
      });
    }
  }
  async ready() {
    const ready = await this.wait('ready', undefined, 10_000); // Cold module loading/warmup has no held transaction.
    assert.equal(ready.childPid, this.process.pid);
    assert.ok(ready.backendPid && ready.backendPid > 0); this.backendPid = ready.backendPid;
    console.info(JSON.stringify({ event: 'child-ready-before-transaction', childPid: ready.childPid, backendPid: this.backendPid }));
  }
  calls() { return this.events.filter(event => event.type === 'provider-start').length; }
  committed(phase: string) { return this.events.filter(event => event.type === 'committed')
    .flatMap(event => event.writes ?? []).filter(write => write.phase === phase).reduce((sum, write) => sum + write.count, 0); }
  async killed() {
    assert.equal(this.process.kill('SIGKILL'), true, 'Owned child must actually accept SIGKILL');
    const exit = await this.exited; assert.deepEqual(exit, { code: null, signal: 'SIGKILL' });
    console.info(JSON.stringify({ event: 'owned-child-exit', childPid: this.process.pid, backendPid: this.backendPid, ...exit }));
  }
  async completed() {
    await this.wait('done'); assert.deepEqual(await this.exited, { code: 0, signal: null });
  }
}

let runtime: ReturnType<Support['loadRuntime']>;
let db: PrismaClient, cancelling: PrismaClient, observer: PrismaClient;
let dbPid: number, cancelPid: number, observerPid: number;

beforeAll(async () => {
  runtime = support.loadRuntime(); // Normal compiled packages, never source-alias imports at runtime.
  db = support.createClient(); cancelling = support.createClient(); observer = support.createClient();
  [dbPid, cancelPid, observerPid] = await Promise.all([db, cancelling, observer].map(support.warm));
  assert.equal(new Set([dbPid, cancelPid, observerPid]).size, 3, 'Independent warmed backends required');
  console.info(JSON.stringify({ event: 'parent-backends-warm-before-transactions', dbPid, cancelPid, observerPid }));
});

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const child of children) for (const token of ['response', 'terminal', 'commit', 'resume', 'start']) child.send(token);
  await Promise.allSettled(pending.splice(0));
  for (const child of children) {
    // Cleanup termination is never counted as A/N1's observed SIGKILL evidence.
    const finished = await Promise.race([child.exited.then(() => true), delay(2_000).then(() => false)]);
    if (!finished) { child.process.kill('SIGKILL'); await child.exited; }
  }
  children.clear();
});
afterAll(async () => { await Promise.all([db, cancelling, observer].filter(Boolean).map(client => client.$disconnect())); });

type Seed = { taskId: string; sessionId: string; userId: string; payload: { concept: string }; ledger: UsageLedger[] };
async function seed(): Promise<Seed> {
  const userId = randomUUID(), sessionId = randomUUID(), taskId = randomUUID();
  const payload = { concept: `Original synthetic concept ${taskId}` };
  await db.user.create({ data: { id: userId, email: `${userId}@ordinary-pg.invalid`, passwordHash: 'not-a-login',
    displayName: 'Synthetic PG actor', status: 'email_verified' } });
  await db.agentSession.create({ data: { id: sessionId, userId, kind: 'general', researchObjectId: null } });
  await db.agentTask.create({ data: { id: taskId, sessionId, kind: 'visualization.plan', payload } });
  await db.usageLedger.create({ data: { userId, resource: 'ai_credit', delta: -1n, kind: 'consume',
    idempotencyKey: `agent-task-reserve:${taskId}` } });
  return { taskId, sessionId, userId, payload, ledger: await db.usageLedger.findMany({ where: { userId }, orderBy: { id: 'asc' } }) };
}

async function launch(f: Seed, mode: string) {
  const child = new FixtureChild(f.taskId, mode); await child.ready();
  assert.equal(new Set([dbPid, cancelPid, observerPid, child.backendPid]).size, 4);
  child.send('start'); return child;
}
async function published(f: Seed, mode = 'ordinary') {
  const child = await launch(f, mode);
  await child.wait('provider-start'); await child.wait('publish-committed');
  assert.equal(child.calls(), 1); return child;
}

async function waitBlocked(waiter: number, holder: number) {
  const deadline = Date.now() + 1_500; // Within the original default interactive transaction budget; never increased.
  while (Date.now() < deadline) {
    // Observer is a separate one-connection client issuing autocommit reads, never a cached observer transaction.
    const rows = await observer.$queryRaw<Array<{ waitType: string | null; blockers: number[] }>>`
      SELECT wait_event_type AS "waitType", pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE pid = ${waiter}`;
    if (rows[0]?.waitType === 'Lock' && rows[0].blockers.includes(holder)) {
      console.info(JSON.stringify({ event: 'actual-pg-lock-wait', waiter, holder, ...rows[0] })); return;
    }
    await delay(10);
  }
  throw new Error(`No actual PG blocking pair for known backends ${waiter}/${holder}`);
}

function assertNoReplay(calls: number, claimed: boolean) {
  assert.equal(calls, 0, 'ordinary prepared receipt forbids replay');
  assert.equal(claimed, false, 'ordinary prepared receipt denies a fresh claim');
}
function assertCancelBeforeResponse(committed: boolean, released: boolean) {
  assert.equal(committed, true, 'cancel commits before synthetic model response release');
  assert.equal(released, false, 'synthetic response is still deferred');
}
function designatedFailure(check: () => void, message: string, actual: unknown, expected: unknown) {
  let failure: unknown;
  try { check(); } catch (error) { failure = error; }
  assert.ok(failure instanceof AssertionError, 'Only the nominated assertion is a valid negative control');
  assert.ok(failure.message.startsWith(message));
  assert.equal(failure.operator, 'strictEqual'); assert.equal(failure.actual, actual); assert.equal(failure.expected, expected);
}

async function evidence(f: Seed, state: 'prepared' | 'completed', originalAttempt = 1) {
  const task = await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
  const receipt = runtime.domain.readOrdinaryStructuredReceipt(task.result);
  assert.ok(receipt);
  assert.deepEqual(receipt.identity, { taskId: f.taskId, kind: 'visualization.plan', executionAttempt: originalAttempt,
    sessionId: f.sessionId, userId: f.userId, researchObjectId: null });
  const entry = f.ledger[0]!;
  assert.deepEqual(JSON.parse(receipt.sourceJson), { payload: f.payload, messages: support.MESSAGES,
    reservation: { id: entry.id, userId: entry.userId, idempotencyKey: entry.idempotencyKey,
      resource: entry.resource, delta: String(entry.delta), kind: entry.kind } });
  assert.equal(receipt.attempts.length, 1); const attempt = receipt.attempts[0]!;
  assert.equal(attempt.state, state); assert.equal(attempt.ordinal, 0);
  assert.equal(attempt.target.provider, 'ordinary-pg-synthetic'); assert.equal(attempt.target.model, 'requested-pg-model');
  assert.match(attempt.target.promptHash, /^[a-f0-9]{64}$/u);
  if (state === 'completed') assert.equal(attempt.responseJson, JSON.stringify(support.RESPONSE));
  assert.deepEqual(await db.usageLedger.findMany({ where: { userId: f.userId }, orderBy: { id: 'asc' } }), f.ledger);
  const view = await runtime.domain.getAgentTask(support.deps(db), { userId: f.userId, taskId: f.taskId });
  assert.equal(Object.hasOwn(view.result ?? {}, 'ordinaryStructuredReceipt'), false);
  assert.equal(JSON.stringify(view).includes('Private original source'), false);
  assert.equal(JSON.stringify(view).includes('not-an-owned-object'), false);
  return { task, receipt, view, audits: await db.auditLog.findMany({ where: { action: 'agent.task.cancel', targetId: f.taskId } }) };
}
async function assertStopped(f: Seed) {
  const facts = await evidence(f, 'completed');
  assert.equal(facts.task.status, 'failed'); assert.equal(facts.task.executionAttempt, 2);
  assert.equal(facts.task.error, runtime.domain.AGENT_TASK_OWNED_STOP_REASON);
  assert.deepEqual(facts.view.result ?? {}, {}); assert.equal(facts.view.canRetry, false);
  assert.equal(facts.audits.length, 1);
  assert.deepEqual(facts.audits[0]!.metadata, { previousStatus: 'running', previousExecutionAttempt: 1,
    executionAttempt: 2, reason: runtime.domain.AGENT_TASK_OWNED_STOP_REASON });
}
function cancel(f: Seed, prisma = cancelling) {
  return runtime.domain.cancelAgentTask(support.deps(prisma), { userId: f.userId, taskId: f.taskId, expectedExecutionAttempt: 1 });
}
async function safeCase(run: () => Promise<void>) {
  try { await run(); } catch (error) {
    if (error instanceof AssertionError) throw error;
    throw new Error(`PG integration failed: ${JSON.stringify(support.safeError(error))}`);
  }
}

describe('ordinary paid receipt actual PostgreSQL and owned process loss', () => {
  it('A: committed prepare survives SIGKILL and blocks actual startup recovery and a new process claim', () => safeCase(async () => {
    const f = await seed(), child = await launch(f, 'prepare-crash');
    await child.wait('prepare-committed'); await evidence(f, 'prepared'); // Independently visible before kill.
    assert.equal(child.committed('prepare'), 1); await child.killed();
    const processing = [f.taskId], queue: string[] = [];
    const redis = { lrange: async () => [...processing], lindex: async () => processing.at(-1) ?? null,
      lrem: async (_key: string, _count: number, id: string) => { const at = processing.indexOf(id); if (at < 0) return 0; processing.splice(at, 1); return 1; },
      lpush: async (_key: string, id: string) => queue.unshift(id),
      rpoplpush: async () => { const id = processing.pop(); if (id) queue.unshift(id); return id ?? null; } };
    assert.equal(await runtime.worker.recoverProcessingQueue({ ...support.deps(db), redis }), 0);
    assert.deepEqual(queue, []); assert.deepEqual(processing, []); // Removed only after durable HOLD, not orphaned pending work.
    const held = await evidence(f, 'prepared');
    assert.equal(held.task.status, 'failed'); assert.equal(held.task.executionAttempt, 1);
    assert.equal(held.task.error, runtime.domain.ORDINARY_STRUCTURED_HOLD);
    assert.equal(held.audits.length, 0);
    const restarted = await launch(f, 'ordinary'); await restarted.wait('no-claim'); await restarted.completed();
    assertNoReplay(child.calls() + restarted.calls(), restarted.events.some(event => event.type === 'claimed'));
  }));

  it('B: cancellation commits before a late full response, which stays private under the original attempt', () => safeCase(async () => {
    const f = await seed(), child = await published(f);
    const stopped = await cancel(f); assert.equal(stopped.outcome, 'applied');
    assertCancelBeforeResponse(stopped.outcome === 'applied', child.responseReleased);
    // Actual task and audit visibility, not only a Provider-start or pending cancel Promise.
    assert.equal((await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } })).executionAttempt, 2);
    const audits = await db.auditLog.findMany({ where: { action: 'agent.task.cancel', targetId: f.taskId } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0]!.metadata, { previousStatus: 'running', previousExecutionAttempt: 1,
      executionAttempt: 2, reason: runtime.domain.AGENT_TASK_OWNED_STOP_REASON });
    child.send('response'); await child.wait('body-saved'); child.send('terminal');
    await child.wait('terminal-denied'); await child.completed();
    await assertStopped(f); assert.equal(child.calls(), 1); assert.equal(child.committed('settle'), 1);
    assert.equal(child.committed('terminal'), 0);
  }));

  it('C1: a real terminal row lock wins, then Serializable cancel returns terminal without another fee or audit', () => safeCase(async () => {
    const f = await seed(), child = await published(f, 'hold-terminal');
    child.send('response'); await child.wait('body-saved'); await evidence(f, 'completed'); child.send('terminal');
    await child.wait('terminal-held');
    const events: Event[] = [], observed = support.observeClient(cancelling, f.taskId, { emit: event => events.push(event) });
    const stopped = outcome(cancel(f, observed));
    await waitBlocked(cancelPid, child.backendPid); child.send('commit');
    await child.wait('terminal-success'); await child.completed();
    const result = await stopped; if (result.error) throw result.error; assert.equal(result.value!.outcome, 'terminal');
    const facts = await evidence(f, 'completed');
    assert.equal(facts.task.status, 'succeeded'); assert.equal(facts.task.executionAttempt, 1);
    assert.deepEqual(facts.view.result, support.PRODUCT); assert.equal(facts.audits.length, 0);
    assert.equal(child.committed('settle'), 1); assert.equal(child.committed('terminal'), 1); assert.equal(child.calls(), 1);
    assert.equal(events.filter(event => event.type === 'committed').flatMap(event => event.writes ?? [])
      .filter(write => write.phase === 'stop').reduce((sum, write) => sum + write.count, 0), 0);
    console.info(JSON.stringify({ case: 'C1', events })); // Real P2034/retry only, if it occurred.
  }));

  it('C2: an actual stopped-row winner makes the waiting old terminal CAS lose without erasing saved evidence', () => safeCase(async () => {
    const f = await seed(), child = await published(f);
    child.send('response'); await child.wait('body-saved'); await evidence(f, 'completed');
    const held = latch(), release = latch(), events: Event[] = []; releases.push(release.release);
    const observed = support.observeClient(cancelling, f.taskId, { emit: event => events.push(event), afterWrite: async write => {
      if (write.phase === 'stop' && write.count === 1) { held.release(); await release.promise; }
    } });
    const stopped = outcome(cancel(f, observed));
    await Promise.race([held.promise, stopped.then(value => { throw value.error ?? new Error('Cancel did not reach held stop CAS'); })]);
    child.send('terminal'); await child.wait('cas-enter', 'terminal');
    await waitBlocked(child.backendPid, cancelPid); release.release();
    const result = await stopped; if (result.error) throw result.error; assert.equal(result.value!.outcome, 'applied');
    await child.wait('terminal-denied'); await child.completed(); await assertStopped(f);
    assert.ok(child.events.some(event => event.type === 'cas-return' && event.phase === 'terminal' && event.count === 0));
    assert.equal(child.committed('terminal'), 0); assert.equal(child.committed('settle'), 1); assert.equal(child.calls(), 1);
    assert.equal(events.filter(event => event.type === 'committed').flatMap(event => event.writes ?? [])
      .filter(write => write.phase === 'stop').reduce((sum, write) => sum + write.count, 0), 1);
    console.info(JSON.stringify({ case: 'C2', events }));
  }));

  it('N1: the same no-replay oracle rejects actual claim-only death followed by legitimate first submission', () => safeCase(async () => {
    const f = await seed(), child = await launch(f, 'claim-crash');
    await child.wait('claimed'); const claimed = await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
    assert.equal(claimed.status, 'running'); assert.equal(claimed.executionAttempt, 1);
    assert.equal(claimed.sessionId, f.sessionId); assert.deepEqual(claimed.payload, f.payload);
    assert.equal(runtime.domain.hasOrdinaryStructuredReceipt(claimed.result), false);
    await child.killed(); assert.equal(await runtime.domain.prepareAgentTaskForCrashRecovery(support.deps(db), f.taskId), true);
    const restarted = await published(f); restarted.send('response'); await restarted.wait('body-saved'); restarted.send('terminal');
    await restarted.wait('terminal-success'); await restarted.completed();
    assert.equal(restarted.calls(), 1); assert.ok(restarted.events.some(event => event.type === 'claimed'));
    designatedFailure(() => assertNoReplay(restarted.calls(), true), 'ordinary prepared receipt forbids replay', 1, 0);
    const facts = await evidence(f, 'completed', 2);
    assert.equal(facts.task.status, 'succeeded'); assert.equal(facts.task.executionAttempt, 2);
    assert.deepEqual(facts.view.result, support.PRODUCT); assert.equal(facts.audits.length, 0);
    assert.equal(restarted.committed('prepare'), 1); assert.equal(restarted.committed('settle'), 1);
  }));

  it('N2: the same cancellation oracle rejects a real model-wait holder with the exact advisory waiter PID', () => safeCase(async () => {
    const f = await seed(), child = await launch(f, 'hold-model');
    await child.wait('model-lock-held'); await child.wait('provider-start');
    let committed = false;
    const stopped = outcome(cancel(f).then(result => { committed = true; return result; }));
    try {
      await waitBlocked(cancelPid, child.backendPid);
      designatedFailure(() => assertCancelBeforeResponse(committed, child.responseReleased), 'cancel commits before synthetic model response release', false, true);
    } finally { child.send('response'); }
    const result = await stopped; if (result.error) throw result.error; assert.equal(result.value!.outcome, 'applied');
    await child.completed(); assert.equal(child.calls(), 1);
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
    assert.equal(task.status, 'failed'); assert.equal(task.executionAttempt, 2);
    assert.equal(task.error, runtime.domain.AGENT_TASK_OWNED_STOP_REASON); assert.deepEqual(task.payload, f.payload);
    assert.equal(runtime.domain.hasOrdinaryStructuredReceipt(task.result), false); // Deliberately wrong holder has no custody.
    assert.deepEqual(await db.usageLedger.findMany({ where: { userId: f.userId }, orderBy: { id: 'asc' } }), f.ledger);
    const audits = await db.auditLog.findMany({ where: { action: 'agent.task.cancel', targetId: f.taskId } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0]!.metadata, { previousStatus: 'running', previousExecutionAttempt: 1,
      executionAttempt: 2, reason: runtime.domain.AGENT_TASK_OWNED_STOP_REASON });
    const view = await runtime.domain.getAgentTask(support.deps(db), { taskId: f.taskId, userId: f.userId });
    assert.deepEqual(view.result ?? {}, {});
  }));
});

type MembershipSeed = Seed & { ownerId: string; workspaceId: string; researchObjectId: string; reserve: UsageLedger };
type Receipt = NonNullable<ReturnType<Domain['readOrdinaryStructuredReceipt']>>;

async function seedMembershipTask(): Promise<MembershipSeed> {
  const ownerId = randomUUID(), userId = randomUUID();
  for (const id of [ownerId, userId]) {
    const actor = await db.user.create({ data: { id, email: `${id}@membership-pg.invalid`, passwordHash: 'not-a-login',
      displayName: 'Synthetic membership actor', status: 'email_verified', platformRole: 'user' } });
    assert.equal(actor.platformRole, 'user'); // Never use admin auto-funding to get this fixture past billing.
  }
  const workspace = await db.workspace.create({ data: { type: 'team', ownerId, name: 'Synthetic membership boundary' } });
  await db.membership.createMany({ data: [
    { id: randomUUID(), workspaceId: workspace.id, userId: ownerId, role: 'owner' },
    { id: randomUUID(), workspaceId: workspace.id, userId, role: 'author' },
  ] });
  const ro = await db.researchObject.create({ data: { workspaceId: workspace.id, createdBy: ownerId,
    title: 'Private synthetic membership source' } });
  await db.usageLedger.create({ data: { userId, resource: 'ai_credit', delta: 10n, kind: 'admin_topup',
    idempotencyKey: `membership-initial-credit:${userId}` } });
  const session = await runtime.domain.createAgentSession(support.deps(db), { userId, researchObjectId: ro.id,
    kind: 'visualization', title: 'Synthetic visualization' });
  const payload = { concept: `Original membership visualization ${randomUUID()}` };
  // Exercise real member/finite credit/reservation/audit logic; queue scheduling is outside this group.
  const submitted = await runtime.domain.submitAgentTask(support.deps(db), { userId, sessionId: session.id,
    kind: 'visualization.plan', payload, idempotencyKey: `membership-task:${randomUUID()}`, dispatch: false });
  assert.equal(submitted.status, 'pending'); assert.equal(submitted.executionAttempt, 0);
  const ledger = await db.usageLedger.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  const reserve = await db.usageLedger.findUniqueOrThrow({ where: { idempotencyKey: `agent-task-reserve:${submitted.id}` } });
  assert.equal(ledger.length, 2); assert.equal(ledger.reduce((sum, row) => sum + row.delta, 0n), 9n);
  assert.equal(reserve.kind, 'consume'); assert.equal(reserve.delta, -1n); assert.equal(reserve.userId, userId);
  assert.deepEqual(reserve.metadata, { taskId: submitted.id, kind: 'visualization.plan', policy: 'charged-on-submit' });
  const audits = await db.auditLog.findMany({ where: { action: 'agent.task.submit', targetId: submitted.id } });
  assert.equal(audits.length, 1); assert.equal(audits[0]!.actorId, userId);
  assert.equal(audits[0]!.workspaceId, workspace.id); assert.equal(audits[0]!.targetType, 'agent_task');
  assert.deepEqual(audits[0]!.metadata, { kind: 'visualization.plan', sessionId: session.id, creditPolicy: 'charged-on-submit' });
  return { taskId: submitted.id, sessionId: session.id, userId, payload, ledger, reserve,
    ownerId, workspaceId: workspace.id, researchObjectId: ro.id };
}

async function membershipBindings(f: MembershipSeed) {
  const [task, session, ro, workspace] = await Promise.all([
    observer.agentTask.findUniqueOrThrow({ where: { id: f.taskId } }),
    observer.agentSession.findUniqueOrThrow({ where: { id: f.sessionId } }),
    observer.researchObject.findUniqueOrThrow({ where: { id: f.researchObjectId } }),
    observer.workspace.findUniqueOrThrow({ where: { id: f.workspaceId } }),
  ]);
  assert.equal(task.sessionId, session.id); assert.equal(task.kind, 'visualization.plan'); assert.deepEqual(task.payload, f.payload);
  assert.equal(session.userId, f.userId); assert.equal(session.researchObjectId, ro.id);
  assert.equal(ro.workspaceId, workspace.id); assert.equal(workspace.status, 'active');
  assert.equal(task.deletedAt, null); assert.equal(session.deletedAt, null); assert.equal(ro.deletedAt, null);
  return { task, session, ro, workspace };
}

async function membershipPrepared(f: MembershipSeed, child: FixtureChild) {
  await child.wait('prepare-committed');
  const binding = await membershipBindings(f);
  assert.equal(binding.task.status, 'running'); assert.equal(binding.task.executionAttempt, 1);
  assert.equal(binding.session.status, 'active');
  const original = runtime.domain.readOrdinaryStructuredReceipt(binding.task.result); assert.ok(original);
  assert.deepEqual(original.identity, { taskId: f.taskId, kind: 'visualization.plan', executionAttempt: 1,
    sessionId: f.sessionId, userId: f.userId, researchObjectId: f.researchObjectId });
  assert.equal(original.attempts.length, 1); assert.equal(original.attempts[0]!.state, 'prepared');
  const envelope = JSON.parse(original.sourceJson);
  assert.deepEqual(envelope.payload, f.payload);
  assert.ok(Array.isArray(envelope.messages) && envelope.messages.length >= 2);
  assert.equal(envelope.messages.at(-1).role, 'user'); assert.equal(envelope.messages.at(-1).content, f.payload.concept);
  assert.equal(envelope.messages[0].role, 'system');
  assert.deepEqual(envelope.reservation, { id: f.reserve.id, userId: f.userId, idempotencyKey: f.reserve.idempotencyKey,
    resource: 'ai_credit', delta: '-1', kind: 'consume' });
  assert.equal(child.committed('prepare'), 1);
  return { binding, original: structuredClone(original) };
}

async function membershipCustody(f: MembershipSeed, original: Receipt) {
  const task = await db.agentTask.findUniqueOrThrow({ where: { id: f.taskId } });
  const receipt = runtime.domain.readOrdinaryStructuredReceipt(task.result); assert.ok(receipt);
  assert.deepEqual(receipt.identity, original.identity); assert.equal(receipt.sourceJson, original.sourceJson);
  assert.equal(receipt.attempts.length, 1); assert.equal(receipt.attempts[0]!.ordinal, 0);
  assert.deepEqual(receipt.attempts[0]!.target, original.attempts[0]!.target);
  assert.equal(receipt.attempts[0]!.target.provider, 'ordinary-pg-synthetic');
  assert.equal(receipt.attempts[0]!.target.model, 'requested-pg-model');
  assert.deepEqual(task.payload, f.payload); assert.equal(task.executionAttempt, 1);
  assert.deepEqual(await db.usageLedger.findMany({ where: { userId: f.userId }, orderBy: { id: 'asc' } }), f.ledger);
  assert.equal(await db.usageLedger.count({ where: { userId: f.ownerId } }), 0);
  assert.equal(await db.agentTask.count({ where: { sessionId: f.sessionId } }), 1);
  assert.equal(await db.auditLog.count({ where: { action: 'agent.task.submit', targetId: f.taskId } }), 1);
  const view = await runtime.domain.getAgentTask(support.deps(db), { userId: f.userId, taskId: f.taskId });
  assert.equal(Object.hasOwn(view.result ?? {}, 'ordinaryStructuredReceipt'), false);
  assert.equal(JSON.stringify(view).includes('not-an-owned-object'), false);
  assert.equal(JSON.stringify(view).includes(f.payload.concept), false);
  return { task, receipt, view };
}

describe('ordinary publication membership', () => {
  it('allows one normally submitted author visualization through the actual planner when membership remains', () => safeCase(async () => {
    const f = await seedMembershipTask(), child = await launch(f, 'membership-publication');
    const { original } = await membershipPrepared(f, child);
    const member = await observer.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } } });
    assert.equal(member.role, 'author');
    // Pre-release both tokens: a wrong extra call must settle rather than turn into a timeout.
    child.send('response'); child.send('terminal'); child.send('resume'); await child.completed();
    assert.equal(child.calls(), 1); assert.ok(child.events.some(event => event.type === 'publish-committed'));
    assert.ok(child.events.some(event => event.type === 'terminal-success'));
    const facts = await membershipCustody(f, original);
    assert.equal(facts.task.status, 'succeeded'); assert.deepEqual(facts.view.result, { plan: support.VISUALIZATION_PLAN });
    assert.equal(facts.receipt.attempts[0]!.state, 'completed');
    assert.equal(facts.receipt.attempts[0]!.responseJson, JSON.stringify(support.VISUALIZATION_RESPONSE));
    assert.equal(child.committed('settle'), 1); assert.equal(child.committed('terminal'), 1);
    assert.equal(await observer.auditLog.count({ where: { action: 'workspace.member.remove', workspaceId: f.workspaceId } }), 0);
  }));

  it('does not dispatch after author removal committed and independently became visible before publication', () => safeCase(async () => {
    const f = await seedMembershipTask(), child = await launch(f, 'membership-publication');
    const { binding, original } = await membershipPrepared(f, child);
    await runtime.domain.removeMember(support.deps(cancelling), f.ownerId, f.workspaceId, f.userId);
    assert.equal(await observer.membership.findUnique({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } } }), null);
    const audits = await observer.auditLog.findMany({ where: { action: 'workspace.member.remove', workspaceId: f.workspaceId,
      actorId: f.ownerId, targetType: 'user', targetId: f.userId } });
    assert.equal(audits.length, 1); assert.deepEqual(audits[0]!.metadata, { role: 'author' });
    assert.deepEqual(await membershipBindings(f), binding); // No task/session/RO/workspace mutation explains a refusal.
    console.info(JSON.stringify({ event: 'membership-removal-commit-visible', taskId: f.taskId, workspaceId: f.workspaceId,
      ownerId: f.ownerId, removedActorId: f.userId, observerPid, auditId: audits[0]!.id, membershipAbsent: true }));
    child.send('response'); child.send('terminal'); child.send('resume'); await child.completed();
    // Test-first oracle: current-source misuse must fail here as actual1/expected0, never as timeout/import/SQL.
    assert.equal(child.calls(), 0, 'ordinary publication membership: revoked author must not dispatch');
    assert.ok(child.events.some(event => event.type === 'publication-denied' && event.code === 'OCR_EXTERNAL_PROCESSING_DENIED'));
    const rollbacks = child.events.filter(event => event.type === 'rollback');
    assert.ok(rollbacks.some(event => ['WORKSPACE_NOT_FOUND', 'OCR_EXTERNAL_PROCESSING_DENIED'].includes(event.code ?? '')));
    assert.ok(rollbacks.every(event => ['WORKSPACE_NOT_FOUND', 'OCR_EXTERNAL_PROCESSING_DENIED'].includes(event.code ?? '')),
      'An unrelated SQL/runtime rollback is not membership-denial evidence');
    assert.equal(child.events.some(event => event.type === 'body-saved' || event.type === 'terminal-success'), false);
    const facts = await membershipCustody(f, original);
    assert.equal(facts.task.status, 'failed'); assert.equal(facts.task.error, runtime.domain.ORDINARY_STRUCTURED_HOLD);
    assert.deepEqual(facts.view.result ?? {}, {});
    assert.ok(['prepared', 'unknown'].includes(facts.receipt.attempts[0]!.state));
    assert.equal(facts.receipt.attempts[0]!.responseJson, undefined);
    if (facts.receipt.attempts[0]!.state === 'unknown')
      assert.deepEqual(JSON.parse(facts.receipt.attempts[0]!.failureJson!), { code: 'publication_unconfirmed' });
    assert.equal(child.committed('prepare'), 1); assert.equal(child.committed('terminal'), 0);
  }));
});
