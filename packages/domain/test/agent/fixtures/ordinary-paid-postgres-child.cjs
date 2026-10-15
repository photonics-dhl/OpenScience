const assert = require('node:assert/strict');
const process = require('node:process');
const { resolve } = require('node:path');
const { URL } = require('node:url');

const ROOT = resolve(module.path, '../../../../..');
const MESSAGES = [{ role: 'user', content: 'Private original source for the ordinary PostgreSQL fixture.' }];
const PRODUCT = { ok: true, summary: 'Synthetic accepted value' };
const RESPONSE = { text: JSON.stringify(PRODUCT), model: 'reported-pg-model', finishReason: 'stop',
  usage: { inputTokens: 3, outputTokens: 5 }, providerContent: [{ objectKey: 'not-an-owned-object', text: 'Full synthetic response' }] };
const VISUALIZATION_PLAN = { explanation: 'Synthetic relationship for the membership fixture.',
  modelAssumptions: 'A conceptual fixture, not measured research.', script: 'result = 1',
  parameters: { scale: { value: 1, description: 'Synthetic scale' } }, visualizationType: 'schematic', dependencies: [] };
const VISUALIZATION_RESPONSE = { ...RESPONSE, text: JSON.stringify(VISUALIZATION_PLAN) };

// This function is also usable by the CI owner before migrate-cli. It loads no client.
function validatedTestUrl(env = process.env) {
  if (env.NODE_ENV !== 'test' || !env.DATABASE_URL?.trim()) throw new Error('Explicit test database environment required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid test database target'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '55440' || url.pathname !== '/image_grant_test' || url.hash) throw new Error('Unapproved test database target');
  if ([...url.searchParams.keys()].some(key => key !== 'connection_limit')) throw new Error('Unapproved test database options');
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}

function loadRuntime() {
  return {
    domain: require(resolve(ROOT, 'packages/domain/dist/index.js')),
    worker: require(resolve(ROOT, 'apps/agent-worker/dist/index.js')),
    gateway: require(resolve(ROOT, 'packages/ai-gateway/dist/index.js')),
  };
}

function createClient() {
  const url = validatedTestUrl(); // Before constructing any Prisma client; no development fallback.
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient({ datasources: { db: { url } } });
}

async function warm(client) {
  await client.$connect();
  const rows = await client.$queryRaw`SELECT pg_backend_pid() AS pid`;
  assert.equal(rows.length, 1); assert.ok(Number.isInteger(rows[0].pid) && rows[0].pid > 0);
  return rows[0].pid;
}

function phaseOf(data) {
  if (data.status === 'succeeded') return 'terminal';
  if (data.error === '[blocked] Execution stopped by its owner') return 'stop';
  if (data.status === 'failed') return 'failure'; // A denial transition is not a second private-response settlement.
  const state = data.result?.ordinaryStructuredReceipt?.attempts?.at(-1)?.state;
  if (state === 'prepared') return 'prepare';
  if (state === 'completed' || state === 'unknown') return 'settle';
  if (data.status === 'running' && data.executionAttempt?.increment === 1) return 'claim';
  return 'other';
}

// Observe only: original receiver/arguments/count/options and the real commit are retained.
function observeClient(client, taskId, { emit = () => {}, afterWrite = async () => {}, afterCommit = async () => {},
  afterMembershipRead } = {}) {
  return new Proxy(client, { get(target, property) {
    const value = Reflect.get(target, property);
    if (property !== '$transaction') return typeof value === 'function' ? value.bind(target) : value;
    return async (callback, ...options) => {
      if (typeof callback !== 'function') return target.$transaction(callback, ...options);
      const writes = [];
      let result;
      try {
        result = await target.$transaction(async tx => callback(new Proxy(tx, { get(actual, key) {
          const member = Reflect.get(actual, key);
          if (key === 'membership' && afterMembershipRead) return new Proxy(member, { get(delegate, operation) {
            const method = Reflect.get(delegate, operation);
            if (operation !== 'findUnique') return typeof method === 'function' ? method.bind(delegate) : method;
            return async (...args) => {
              const found = await Reflect.apply(method, delegate, args);
              await afterMembershipRead(args[0], found);
              return found;
            };
          } });
          if (key !== 'agentTask') return typeof member === 'function' ? member.bind(actual) : member;
          return new Proxy(member, { get(delegate, operation) {
            const method = Reflect.get(delegate, operation);
            if (operation !== 'updateMany') return typeof method === 'function' ? method.bind(delegate) : method;
            return async (...args) => {
              const own = args[0]?.where?.id === taskId;
              const phase = phaseOf(args[0]?.data ?? {});
              if (own) emit({ type: 'cas-enter', phase });
              const changed = await Reflect.apply(method, delegate, args);
              if (own) {
                const event = { phase, count: changed.count };
                writes.push(event); emit({ type: 'cas-return', ...event });
                await afterWrite(event);
              }
              return changed;
            };
          } });
        } })), ...options);
      } catch (error) {
        emit({ type: 'rollback', code: typeof error?.code === 'string' ? error.code : null });
        throw error;
      }
      emit({ type: 'committed', writes }); // Only after the actual transaction Promise resolves.
      await afterCommit(writes);
      return result;
    };
  } });
}

function deps(prisma) {
  return { prisma, audit: { record: async (event, tx) => {
    assert.ok(tx, 'Audit must use the actual business transaction');
    await tx.auditLog.create({ data: event });
  } } };
}

function safeError(error) {
  return { name: error?.name ?? 'UnknownError', code: typeof error?.code === 'string' ? error.code : null,
    sqlState: typeof error?.meta?.code === 'string' ? error.meta.code : null,
    frames: typeof error?.stack === 'string' ? error.stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 8) : [] };
}

async function main() {
  validatedTestUrl();
  assert.equal(typeof process.send, 'function', 'Fixture must be launched with its owned IPC channel');
  const { domain, worker, gateway } = loadRuntime(); // Load modules before any measured transaction.
  const client = createClient();
  const tokens = new Set(); const waiting = new Map();
  const gate = name => tokens.delete(name) ? Promise.resolve() : new Promise(resolveGate => waiting.set(name, resolveGate));
  process.on('message', message => {
    if (!message || typeof message.token !== 'string') return;
    const resume = waiting.get(message.token);
    if (resume) { waiting.delete(message.token); resume(); } else tokens.add(message.token);
  });
  const emit = event => { if (process.connected) process.send(event); };
  let requestStarted = false, publishCommitted = false, prepareCommitted = false, publicationReadHeld = false;
  const taskId = process.argv[2], mode = process.argv[3];
  assert.ok(taskId && ['prepare-crash', 'claim-crash', 'ordinary', 'hold-terminal', 'hold-model', 'membership-publication',
    'membership-read-revoke'].includes(mode));
  const readRevocation = mode === 'membership-read-revoke';
  const membershipPublication = mode === 'membership-publication' || readRevocation;
  const expectedMembership = readRevocation ? { workspaceId: process.argv[4], userId: process.argv[5] } : null;
  if (expectedMembership) assert.ok(expectedMembership.workspaceId && expectedMembership.userId);
  try {
    const pid = await warm(client);
    const observed = observeClient(client, taskId, { emit,
      ...(readRevocation ? { afterMembershipRead: async (query, found) => {
        if (!prepareCommitted) return;
        assert.deepEqual(query?.where?.workspaceId_userId, expectedMembership);
        assert.ok(found?.id); assert.equal(found.workspaceId, expectedMembership.workspaceId);
        assert.equal(found.userId, expectedMembership.userId); assert.equal(publicationReadHeld, false);
        publicationReadHeld = true;
        emit({ type: 'publication-membership-read', phase: 'publication', taskId, backendPid: pid,
          workspaceId: found.workspaceId, userId: found.userId, membershipId: found.id });
        await gate('membership-read-release');
      } } : {}),
      afterWrite: async event => {
        if (mode === 'hold-terminal' && event.phase === 'terminal' && event.count === 1) {
          emit({ type: 'terminal-held' }); await gate('commit');
        }
      },
      afterCommit: async writes => {
        if (writes.some(w => w.phase === 'prepare' && w.count === 1)) {
          prepareCommitted = true;
          emit({ type: 'prepare-committed' });
          if (mode === 'prepare-crash' || membershipPublication) await gate('resume');
        }
        if (requestStarted && !publishCommitted && writes.length === 0) {
          publishCommitted = true; emit({ type: 'publish-committed' });
        }
      } });
    emit({ type: 'ready', backendPid: pid, childPid: process.pid });
    await gate('start');
    const claim = await domain.claimAgentTask(deps(observed), taskId);
    if (!claim) { emit({ type: 'no-claim' }); return; }
    emit({ type: 'claimed', executionAttempt: claim.executionAttempt });
    if (mode === 'claim-crash') await gate('resume');
    const provider = { name: 'ordinary-pg-synthetic', model: 'requested-pg-model', complete: async () => {
      requestStarted = true; emit({ type: 'provider-start' }); await gate('response');
      return membershipPublication ? VISUALIZATION_RESPONSE : RESPONSE;
    } };
    if (mode === 'hold-model') {
      // Intentional negative control: an actual incorrect holder, never the candidate adapter.
      await client.$transaction(async tx => {
        await domain.lockTrashReferences(tx);
        const rows = await tx.$queryRaw`SELECT id FROM agent_tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
        assert.deepEqual(rows, [{ id: taskId }]); emit({ type: 'model-lock-held' });
        await provider.complete();
      });
      return;
    }
    const source = await client.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    let value;
    if (membershipPublication) {
      const handlers = worker.createHandlers(new gateway.AiGateway({ providers: [provider] }));
      try {
        value = await worker.runWithWorkerExecution({ taskId, executionAttempt: claim.executionAttempt }, () =>
          handlers['visualization.plan'](deps(observed), { id: taskId, payload: source.payload,
            interestContext: source.interestContext, executionAttempt: claim.executionAttempt, retryCount: claim.retryCount }));
      } catch (error) {
        if (error?.code !== 'OCR_EXTERNAL_PROCESSING_DENIED') throw error;
        await domain.markTaskProgress(deps(observed), { taskId, status: 'failed', error: error.message,
          expectedExecutionAttempt: claim.executionAttempt });
        emit({ type: 'publication-denied', code: error.code });
        return;
      }
    } else {
      const scoped = worker.createTaskScopedGateway(new gateway.AiGateway({ providers: [provider] }), observed,
        { id: taskId, executionAttempt: claim.executionAttempt, payload: source.payload }, 'visualization.plan');
      value = await worker.runWithWorkerExecution({ taskId, executionAttempt: claim.executionAttempt }, () =>
        scoped.completeStructured(result => result?.ok === true, MESSAGES));
    }
    emit({ type: 'body-saved' }); await gate('terminal');
    try {
      await domain.markTaskProgress(deps(observed), { taskId, status: 'succeeded', progress: 100,
        result: value, expectedExecutionAttempt: claim.executionAttempt });
      emit({ type: 'terminal-success' });
    } catch (error) {
      if (error?.code !== 'ILLEGAL_TRANSITION') throw error;
      emit({ type: 'terminal-denied', code: error.code });
    }
  } finally {
    await client.$disconnect();
  }
}

module.exports = { validatedTestUrl, loadRuntime, createClient, warm, observeClient, deps, safeError,
  MESSAGES, PRODUCT, RESPONSE, VISUALIZATION_PLAN, VISUALIZATION_RESPONSE };
if (require.main === module) {
  const report = event => new Promise(done => {
    if (process.connected) process.send(event, done); else { process.exitCode = 1; done(); }
  });
  main().then(() => report({ type: 'done' }), error => {
    process.exitCode = 1;
    return report({ type: 'failure', error: safeError(error) });
  }).finally(() => { if (process.connected) process.disconnect(); });
}
