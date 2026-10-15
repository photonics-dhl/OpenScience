import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { AiGateway, AiGatewayError, type Provider } from '@openscience/ai-gateway';
import { lockTrashReferences, stopAgentTaskInTransaction, prepareAgentTaskForCrashRecovery, claimAgentTask } from '@openscience/domain';
import { createTaskScopedGateway, runWithWorkerExecution } from '../src/index';

const ID = 'af36958a-d6d0-4666-a69c-e3c60170b17f';
const OTHER = 'bf36958a-d6d0-4666-a69c-e3c60170b17f';
const KIND = 'visualization.plan' as const;
type Result = Awaited<ReturnType<Provider['complete']>>;
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Mutex {
  private tail = Promise.resolve();
  async acquire() {
    const previous = this.tail;
    const next = deferred<void>();
    this.tail = next.promise;
    await previous;
    return () => next.resolve();
  }
}
function live(id = ID) {
  return { id, kind: KIND as string, status: 'running', executionAttempt: 1, deletedAt: null as Date | null,
    error: null as string | null, payload: { concept: 'original source' }, result: null, retryCount: 0, progress: 10,
    createdAt: new Date(0), updatedAt: new Date(0), sessionId: 'session-1',
    session: { id: 'session-1', userId: 'user-1', status: 'active', deletedAt: null as Date | null,
      researchObjectId: null as string | null, researchObject: null as { id: string; workspaceId: string; deletedAt: Date | null } | null } };
}
/** Controlled transaction/lock model, not a PostgreSQL test. Real Gateway and Domain CAS helpers run above it. */
function fixture() {
  const states = new Map([[ID, live()], [OTHER, live(OTHER)]]);
  const workspaces = new Map([['workspace-1', { id: 'workspace-1', status: 'active' }]]);
  const memberships = new Map([['workspace-1:user-1', { workspaceId: 'workspace-1', userId: 'user-1', role: 'author' }]]);
  const workspace = { findUnique: async ({ where }: { where: { id: string } }) => structuredClone(workspaces.get(where.id) ?? null) };
  const membership = { findUnique: async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) => {
    const key = where.workspaceId_userId; return structuredClone(memberships.get(`${key.workspaceId}:${key.userId}`) ?? null);
  } };
  const global = new Mutex(); const rows = new Map([[ID, new Mutex()], [OTHER, new Mutex()]]);
  const events: string[] = []; const observers = new Map<string, Array<() => void>>();
  const emit = (name: string) => { events.push(name); for (const fn of observers.get(name) ?? []) fn(); observers.delete(name); };
  const next = (name: string) => { const event = deferred<void>(); observers.set(name, [...observers.get(name) ?? [], () => event.resolve()]); return event.promise; };
  type Tx = { releases: Array<() => void>; rows: Set<string>; global: boolean; admission: boolean; wrote: boolean };
  const transactions = new AsyncLocalStorage<Tx>();
  const controls: { commitError?: Error; prepareError?: Error; completionError?: Error; queryError?: Error;
    afterPrepare?: () => Promise<void>; completionFailures?: number;
    commitBarrier?: Promise<void>; rawRows?: unknown; admissions: number; failures: unknown[] } = { admissions: 0, failures: [] };
  async function lockRow(tx: Tx, id: string) {
    if (!tx.rows.has(id)) { tx.releases.push(await rows.get(id)!.acquire()); tx.rows.add(id); }
  }
  function taskModel(tx?: Tx) {
    return {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const task = states.get(where.id); return task ? structuredClone(task) : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const id = String(where.id); const release = tx ? (await lockRow(tx, id), undefined) : await rows.get(id)!.acquire();
        try {
          const task = states.get(id);
          if (!task || Object.entries(where).some(([key, value]) => key !== 'session' && key !== 'id'
            && !(key === 'result' && value && typeof value === 'object' && 'equals' in value
              ? value.equals === Prisma.AnyNull ? task.result == null : isDeepStrictEqual(task.result, value.equals)
              : isDeepStrictEqual(task[key as keyof typeof task], value)))) return { count: 0 };
          if (controls.completionError && (JSON.stringify(data.result) ?? '').includes('responseJson')) {
            const error = controls.completionError;
            if (controls.completionFailures !== undefined && --controls.completionFailures <= 0) controls.completionError = undefined;
            throw error;
          }
          if (tx) tx.wrote = true;
          for (const [key, value] of Object.entries(data)) {
            if (key === 'executionAttempt' && value && typeof value === 'object' && 'increment' in value) task.executionAttempt += Number(value.increment);
            else Object.assign(task, { [key]: value });
          }
          task.updatedAt = new Date(task.updatedAt.getTime() + 1); emit('updated'); return { count: 1 };
        } finally { release?.(); }
      },
    };
  }
  const prisma = {
    workspace, membership,
    agentTask: taskModel(),
    ingestionTask: { updateMany: async () => ({ count: 0 }) },
    usageLedger: { findUnique: async () => null },
    $transaction: async <T>(run: (tx: ReturnType<typeof client>) => Promise<T>, options?: { isolationLevel?: string }) => {
      const state: Tx = { releases: [], rows: new Set(), global: false, admission: false, wrote: false };
      const result = await transactions.run(state, async () => {
        try {
          const value = await run(client(state));
          if (state.admission) {
            expect(options?.isolationLevel).toBe('ReadCommitted');
            if (!state.wrote) {
              controls.admissions++; emit('admission:commit'); await controls.commitBarrier;
              if (controls.commitError) { const error = controls.commitError; controls.commitError = undefined; throw error; }
            } else {
              emit('evidence:commit');
              if (controls.prepareError) { const error = controls.prepareError; controls.prepareError = undefined; throw error; }
            }
          }
          return value;
        } catch (error) { controls.failures.push(error); throw error; }
        finally { for (const release of state.releases.reverse()) release(); }
      });
      if (state.admission && state.wrote && controls.afterPrepare) {
        const after = controls.afterPrepare; controls.afterPrepare = undefined; await after();
      }
      return result;
    },
  };
  function client(tx: Tx) {
    return { agentTask: taskModel(tx), workspace, membership,
      $executeRaw: async (strings: TemplateStringsArray) => {
        expect(strings.join('')).toContain('pg_advisory_xact_lock'); emit('global:request');
        tx.releases.push(await global.acquire()); tx.global = true; emit('global:locked'); return 1;
      },
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        expect(tx.global).toBe(true); expect(strings.join('')).toMatch(/SELECT id FROM agent_tasks WHERE id = .*FOR UPDATE/s);
        expect(values).toHaveLength(1); const id = String(values[0]); expect(rows.has(id)).toBe(true);
        if (controls.queryError) throw controls.queryError;
        tx.admission = true; emit('row:request'); await lockRow(tx, id); emit('row:locked');
        return Object.hasOwn(controls, 'rawRows') ? controls.rawRows : states.has(id) ? [{ id }] : [];
      },
    };
  }
  const calls: string[] = []; const response = deferred<Result>();
  const provider: Provider = { name: 'fixture', model: 'fixture', complete: async () => {
    calls.push('fixture'); emit('submit'); return response.promise;
  } };
  const gateway = new AiGateway({ providers: [provider] });
  const claim = { id: ID, executionAttempt: 1, payload: structuredClone(states.get(ID)!.payload) };
  const scoped = () => createTaskScopedGateway(gateway, prisma as never, claim, KIND);
  const execute = (bound = scoped(), context = { taskId: ID, executionAttempt: 1 }, options = {}) => runWithWorkerExecution(context, () =>
    bound.completeStructured((value): value is { ok: true } => Boolean(value && typeof value === 'object' && 'ok' in value && value.ok), [], options));
  const stop = (pause?: Promise<void>) => prisma.$transaction(async tx => {
    await lockTrashReferences(tx as never); emit('stop:locked'); await pause;
    return stopAgentTaskInTransaction(tx as never, { taskId: ID, expectedExecutionAttempt: 1 });
  }, { isolationLevel: 'ReadCommitted' });
  const finish = () => response.resolve({ text: '{"ok":true}', model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } });
  return { prisma, states, workspaces, memberships, global, rows, controls, events, next, calls, response, gateway, claim, scoped, execute, stop, finish,
    lockedAtProvider: () => Boolean(transactions.getStore()?.rows.has(ID)) };
}
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));

describe('ordinary structured claimed submission admission (simulated locks)', () => {
  it('does not publish after an uncertain prepare commit, even if another invocation sees its durable intent', async () => {
    const f = fixture(); f.controls.prepareError = new Error('fixture lost commit acknowledgement');
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.states.get(ID)!.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [{ state: 'prepared' }] } });
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]);
  });

  it('lets stop win between durable prepare and the locked publication', async () => {
    const f = fixture(); f.controls.afterPrepare = async () => { await f.stop(); };
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]); expect(f.states.get(ID)).toMatchObject({ status: 'failed', executionAttempt: 2 });
    expect(f.states.get(ID)!.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [{ state: 'unknown' }] } });
  });

  it('does not let another same-claim invocation publish the original prepared slot', async () => {
    const f = fixture(); const started = f.next('submit'); const first = outcome(f.execute()); await started;
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    f.finish(); expect((await first).value).toEqual({ ok: true }); expect(f.calls).toEqual(['fixture']);
  });
  it.each(['actor', 'researchObject', 'session'])('does not publish after the prepared %s binding changes', async change => {
    const f = fixture(); const task = f.states.get(ID)!;
    f.finish(); // A counterfactual unwanted call must settle, not merely time out.
    f.controls.afterPrepare = async () => {
      if (change === 'actor') task.session.userId = 'other-actor';
      if (change === 'researchObject') { task.session.researchObjectId = 'other-ro'; task.session.researchObject = { id: 'other-ro', workspaceId: 'workspace-1', deletedAt: null }; }
      if (change === 'session') { task.sessionId = 'other-session'; task.session.id = 'other-session'; }
    };
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]);
    expect(task.result).toMatchObject({ ordinaryStructuredReceipt: { identity: { sessionId: 'session-1', userId: 'user-1', researchObjectId: null } } });
  });

  it('does not use a real task reservation belonging to a different actor', async () => {
    const f = fixture(); Object.assign(f.prisma.usageLedger, { findUnique: async () => ({ id: 'old-reservation', userId: 'other-actor',
      idempotencyKey: `agent-task-reserve:${ID}`, resource: 'ai_credit', kind: 'consume', delta: -1n }) });
    f.finish();
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]); expect(f.states.get(ID)!.result).toBeNull();
  });

  it('saves full >128KiB source/response as opaque data and retains the reported model alias', async () => {
    const f = fixture(); const large = '原文'.repeat(70_000) + '\u0000\ud800';
    f.claim.payload.concept = large; f.states.get(ID)!.payload.concept = large;
    Object.assign(f.claim.payload, { objectKey: 'derived/not-owned' }); Object.assign(f.states.get(ID)!.payload, { objectKey: 'derived/not-owned' });
    const value = { ok: true, text: large, objectKey: 'derived/provider-not-owned' };
    f.response.resolve({ text: JSON.stringify(value), model: 'reported-alias', usage: { inputTokens: 21, outputTokens: 34 } });
    expect(await f.execute()).toEqual(value);
    const cp = (f.states.get(ID)!.result as unknown as { ordinaryStructuredReceipt: { sourceJson: string; attempts: Array<{ target: { model: string }; responseJson: string }> } }).ordinaryStructuredReceipt;
    expect(Buffer.byteLength(cp.sourceJson)).toBeGreaterThan(131_072);
    expect(JSON.parse(cp.sourceJson)).toMatchObject({ payload: { concept: large, objectKey: 'derived/not-owned' }, reservation: null });
    expect(JSON.parse(cp.attempts[0]!.responseJson)).toMatchObject({ text: JSON.stringify(value), model: 'reported-alias', usage: { inputTokens: 21, outputTokens: 34 } });
    expect(cp.attempts[0]!.target.model).toBe('fixture');
  });

  it.each(['json', 'schema', 'length'])('saves the returned %s rejection before the Gateway rejects it', async reason => {
    const f = fixture(); const response = { text: reason === 'json' ? 'invalid JSON' : '{"ok":false}', model: 'fixture',
      finishReason: reason === 'length' ? 'length' as const : 'stop' as const, usage: { inputTokens: 2, outputTokens: 3 } };
    f.response.resolve(response);
    await expect(f.execute(f.scoped(), undefined, { maxRetries: 0 })).rejects.toBeInstanceOf(AiGatewayError);
    expect(f.states.get(ID)!.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [{ state: 'completed', responseJson: JSON.stringify(response) }] } });
    expect(f.calls).toEqual(['fixture']);
  });

  it('allows the original next schema ordinal only after the preceding response was durably saved', async () => {
    const f = fixture(); let calls = 0;
    const gateway = new AiGateway({ providers: [{ name: 'repair', model: 'repair', complete: async () => ({
      text: ++calls === 1 ? 'invalid JSON' : '{"ok":true}', model: 'repair', usage: { inputTokens: 1, outputTokens: 1 },
    }) }] });
    const scoped = createTaskScopedGateway(gateway, f.prisma as never, f.claim, KIND);
    expect(await f.execute(scoped, undefined, { maxRetries: 1 })).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(f.states.get(ID)!.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [
      { ordinal: 0, state: 'completed' }, { ordinal: 1, state: 'completed' },
    ] } });
  });

  it.each([false, true])('completion persistence failure (transient=%s) never reruns a Provider or leaks an unsaved result', async transient => {
    const f = fixture(); f.controls.completionError = Object.assign(new Error('fixture completion write failure'), { code: 'P2034' });
    if (transient) f.controls.completionFailures = 1;
    f.finish(); const result = await outcome(f.execute());
    if (transient) expect(result.value).toEqual({ ok: true });
    else {
      expect(result.error).toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
      expect(f.states.get(ID)!.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [{ state: 'prepared' }] } });
      f.controls.completionError = undefined;
      await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    }
    expect(f.calls).toEqual(['fixture']);
  });

  it('retains the full late paid response privately after an owned stop', async () => {
    const f = fixture(); const started = f.next('submit'); const request = outcome(f.execute());
    await started; await f.stop(); f.finish(); await request;
    const receipt = (f.states.get(ID)!.result as unknown as { ordinaryStructuredReceipt?: { attempts: Array<{ responseJson?: string }> } })?.ordinaryStructuredReceipt;
    expect(receipt?.attempts[0]?.responseJson).toBe(JSON.stringify({ text: '{"ok":true}', model: 'fixture',
      finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } }));
    expect(f.states.get(ID)).toMatchObject({ status: 'failed', executionAttempt: 2 });
    expect(f.calls).toEqual(['fixture']);
  });
  it('retains the existing platform reservation reference without inventing a supplier invoice or charging again', async () => {
    const f = fixture(); const entry = { id: 'original-ledger', userId: 'user-1', resource: 'ai_credit', kind: 'consume',
      idempotencyKey: `agent-task-reserve:${ID}`, delta: -1n };
    Object.assign(f.prisma.usageLedger, { findUnique: async () => entry }); f.finish();
    await f.execute();
    const result = f.states.get(ID)!.result as unknown as { ordinaryStructuredReceipt: { sourceJson: string } };
    expect(JSON.parse(result.ordinaryStructuredReceipt.sourceJson).reservation).toEqual({ ...entry, delta: '-1' });
    expect(entry.delta).toBe(-1n); expect(f.calls).toEqual(['fixture']);
  });
  it.each(['review.analyze', 'visualization.plan', 'workspace.guide', 'presentation.figure-audit'] as const)(
    'admits the original live %s claim with its authoritative source scope', async kind => {
      const f = fixture(); const task = f.states.get(ID)!; task.kind = kind;
      task.session.researchObjectId = 'ro-1'; task.session.researchObject = { id: 'ro-1', workspaceId: 'workspace-1', deletedAt: null };
      Object.assign(task.payload, { researchObjectId: 'ro-1' }); Object.assign(f.claim.payload, { researchObjectId: 'ro-1' });
      f.finish(); const scoped = createTaskScopedGateway(f.gateway, f.prisma as never, f.claim, kind);
      await expect(f.execute(scoped)).resolves.toEqual({ ok: true }); expect(f.calls).toEqual(['fixture']);
    },
  );

  it.each(['before prepare', 'after prepare'])('blocks revoked RO membership %s without losing prepared custody', async timing => {
    const f = fixture(); const task = f.states.get(ID)!;
    task.session.researchObjectId = 'ro-1'; task.session.researchObject = { id: 'ro-1', workspaceId: 'workspace-1', deletedAt: null };
    const reservation = { id: 'original-ledger', userId: 'user-1', resource: 'ai_credit', kind: 'consume',
      idempotencyKey: `agent-task-reserve:${ID}`, delta: -1n };
    Object.assign(f.prisma.usageLedger, { findUnique: async () => reservation });
    const revoke = () => { f.memberships.delete('workspace-1:user-1'); };
    if (timing === 'before prepare') revoke();
    else f.controls.afterPrepare = async () => { revoke(); };
    f.finish();
    await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]);
    expect(task).toMatchObject({ status: 'running', executionAttempt: 1 });
    expect(reservation.delta).toBe(-1n);
    if (timing === 'before prepare') expect(task.result).toBeNull();
    else {
      const receipt = (task.result as unknown as { ordinaryStructuredReceipt: { sourceJson: string; attempts: unknown[] } }).ordinaryStructuredReceipt;
      expect(JSON.parse(receipt.sourceJson)).toEqual({ payload: f.claim.payload, messages: [], reservation: { ...reservation, delta: '-1' } });
      expect(receipt.attempts).toHaveLength(1);
      expect(receipt.attempts[0]).toMatchObject({ state: 'unknown', failureJson: JSON.stringify({ code: 'publication_unconfirmed' }) });
    }
  });

  it('keeps a submitted RO response privately after membership is revoked', async () => {
    const f = fixture(); const task = f.states.get(ID)!;
    task.session.researchObjectId = 'ro-1'; task.session.researchObject = { id: 'ro-1', workspaceId: 'workspace-1', deletedAt: null };
    const started = f.next('submit'); const request = outcome(f.execute());
    await started; f.memberships.delete('workspace-1:user-1'); f.finish(); await request;
    expect(f.calls).toEqual(['fixture']);
    expect(task.result).toMatchObject({ ordinaryStructuredReceipt: { attempts: [{ state: 'completed',
      responseJson: JSON.stringify({ text: '{"ok":true}', model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } }),
    }] } });
  });

  it('observes stop committed while admission waits on the global lock, before any real provider submit', async () => {
    const f = fixture(); const allowStop = deferred<void>(); const stopLocked = f.next('stop:locked');
    const stopping = f.stop(allowStop.promise); await stopLocked;
    const waiting = f.next('global:request'); const started = f.next('submit');
    const request = outcome(f.execute()); await Promise.race([waiting, started]);
    allowStop.resolve(); await stopping; f.finish();
    expect((await request).error).toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]); expect(f.states.get(ID)).toMatchObject({ status: 'failed', executionAttempt: 2 });
  });

  it('starts under both locks but lets cancellation commit before the model returns', async () => {
    const f = fixture(); const started = f.next('submit'); const request = outcome(f.execute());
    await started; const stopped = await f.stop();
    expect(stopped.applied).toBe(true); expect(f.controls.admissions).toBe(1);
    f.finish(); expect((await request).value).toEqual({ ok: true }); expect(f.calls).toEqual(['fixture']);
    expect(f.events.indexOf('row:locked')).toBeLessThan(f.events.indexOf('submit'));
    expect(f.states.get(ID)).toMatchObject({ status: 'failed', executionAttempt: 2 });
  });

  it('rejects a lease reset that wins before the admission row lock', async () => {
    const f = fixture(); const release = await f.rows.get(ID)!.acquire();
    const reset = prepareAgentTaskForCrashRecovery({ prisma: f.prisma } as never, ID);
    const row = f.next('row:request'); const started = f.next('submit'); const request = outcome(f.execute());
    await Promise.race([row, started]); release(); await reset; f.finish();
    expect((await request).error).toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' }); expect(f.calls).toEqual([]);
    await claimAgentTask({ prisma: f.prisma } as never, ID);
    expect(f.states.get(ID)).toMatchObject({ status: 'running', executionAttempt: 2 });
  });

  it('makes a later lease reset wait for sent to be established, not for the response', async () => {
    const f = fixture(); const commit = deferred<void>(); f.controls.commitBarrier = commit.promise;
    const started = f.next('submit'); const request = outcome(f.execute()); await started;
    let resetDone = false;
    const reset = prepareAgentTaskForCrashRecovery({ prisma: f.prisma } as never, ID).then(value => { resetDone = true; return value; });
    await new Promise(resolve => setImmediate(resolve)); expect(resetDone).toBe(false);
    commit.resolve(); await reset; expect(f.calls).toHaveLength(1);
    f.finish(); expect((await request).value).toEqual({ ok: true });
  });

  it('keeps the original provider Promise when the short transaction fails after start', async () => {
    const f = fixture(); f.controls.commitError = Object.assign(new Error('commit conflict'), { code: 'P2034' });
    const committed = f.next('admission:commit'); const started = f.next('submit'); const request = outcome(f.execute());
    await Promise.race([committed, started]); f.finish();
    expect((await request).value).toEqual({ ok: true }); expect(f.calls).toEqual(['fixture']); expect(f.controls.admissions).toBe(1);
  });

  it('fails closed on a pre-submit database error without entering provider fallback', async () => {
    const f = fixture(); f.controls.queryError = Object.assign(new Error('fixture row lock failure'), { code: 'P2034' });
    f.finish(); await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toEqual([]);
  });

  it('observes an early provider rejection while commit is pending and retains that original failure', async () => {
    const f = fixture(); const commit = deferred<void>(); f.controls.commitBarrier = commit.promise;
    f.controls.commitError = Object.assign(new Error('commit fixture failure'), { code: 'P2034' });
    const ready = f.next('admission:commit'); const request = outcome(f.execute()); await ready;
    const providerError = new Error('original fixture provider failure'); f.response.reject(providerError);
    await new Promise(resolve => setImmediate(resolve)); commit.resolve();
    const result = await request;
    expect(result.error).toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(JSON.stringify(f.states.get(ID)!.result)).not.toContain(providerError.message);
    expect(f.calls).toEqual(['fixture']); expect(f.controls.admissions).toBe(1);
  });

  it.each(['empty', 'wrong', 'multiple', 'unknown'])('refuses %s row-lock proof before provider start', async mode => {
    const f = fixture(); f.controls.rawRows = mode === 'empty' ? [] : mode === 'wrong' ? [{ id: OTHER }]
      : mode === 'multiple' ? [{ id: ID }, { id: ID }] : null;
    f.finish(); await expect(f.execute()).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' }); expect(f.calls).toEqual([]);
  });

  it.each(['kind', 'payload', 'deleted', 'session', 'ro', 'stale'])('refuses changed %s inside admission', async change => {
    const f = fixture(); const scoped = f.scoped(); const task = f.states.get(ID)!;
    if (change === 'kind') task.kind = 'presentation.generate';
    if (change === 'payload') task.payload = { concept: 'replacement source' };
    if (change === 'deleted') task.deletedAt = new Date();
    if (change === 'session') task.session.deletedAt = new Date();
    if (change === 'ro') { task.session.researchObjectId = 'ro-1'; task.session.researchObject = { id: 'ro-1', workspaceId: 'workspace-1', deletedAt: new Date() }; }
    if (change === 'stale') task.executionAttempt = 2;
    f.finish(); await expect(f.execute(scoped)).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' }); expect(f.calls).toEqual([]);
  });

  it('does not substitute another ALS task or an absent claim, and retains a frozen original payload', async () => {
    const f = fixture(); const scoped = f.scoped(); f.finish();
    await expect(f.execute(scoped, { taskId: OTHER, executionAttempt: 1 })).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    await expect(scoped.completeStructured((v): v is object => Boolean(v), [])).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    f.claim.payload.concept = 'mutated caller object';
    const response = await outcome(f.execute(scoped));
    expect(response.error, String(f.controls.failures[0])).toBeUndefined();
    expect(response.value).toEqual({ ok: true }); expect(f.calls).toHaveLength(1);
  });

  it('keeps beforeEach callbacks outside locks and refuses unknown submission owners', async () => {
    const f = fixture(); f.finish(); let hook = 0;
    await expect(f.execute(f.scoped(), undefined, { beforeEachProviderCall: async () => {
      await f.prisma.$transaction(async tx => { await lockTrashReferences(tx as never); hook++; });
    } })).resolves.toEqual({ ok: true }); expect(hook).toBe(1);
    await expect(f.execute(f.scoped(), undefined, { withProviderSubmission: async () => { throw new Error('must not trust'); } }))
      .rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(f.calls).toHaveLength(1);
  });

  it('denies schema repair after stop instead of submitting another ordinal', async () => {
    const f = fixture(); let calls = 0;
    const gateway = new AiGateway({ providers: [{ name: 'schema', model: 'schema', complete: async () => {
      calls++; await f.stop(); return { text: 'invalid JSON', model: 'schema', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const scoped = createTaskScopedGateway(gateway, f.prisma as never, f.claim, KIND);
    await expect(f.execute(scoped, undefined, { maxRetries: 2 })).rejects.toMatchObject({ code: 'OCR_EXTERNAL_PROCESSING_DENIED' });
    expect(calls).toBe(1);
  });

  it('does not infer a no-charge witness from an invoked provider failure, with or without stop', async () => {
    for (const stop of [true, false]) {
      const f = fixture(); const calls: string[] = [];
      const gateway = new AiGateway({ providers: [
        { name: 'first', model: 'first', complete: async () => { calls.push('first'); if (stop) await f.stop(); throw new Error('definite fixture failure'); } },
        { name: 'second', model: 'second', complete: async () => { calls.push('second'); return { text: '{"ok":true}', model: 'second', usage: { inputTokens: 1, outputTokens: 1 } }; } },
      ] });
      const scoped = createTaskScopedGateway(gateway, f.prisma as never, f.claim, KIND);
      await expect(f.execute(scoped)).rejects.toBeInstanceOf(AiGatewayError);
      expect(calls).toEqual(['first']);
    }
  });

  it('keeps parallel claimed tasks separate and permits a global guide without an RO', async () => {
    const f = fixture(); f.finish(); f.states.get(OTHER)!.kind = 'workspace.guide';
    const other = createTaskScopedGateway(f.gateway, f.prisma as never,
      { id: OTHER, executionAttempt: 1, payload: structuredClone(f.states.get(OTHER)!.payload) }, 'workspace.guide');
    await expect(Promise.all([f.execute(), f.execute(other, { taskId: OTHER, executionAttempt: 1 })])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(f.calls).toHaveLength(2);
  });
});
