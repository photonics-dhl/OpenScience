import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { reconcileHermesResearchRuns } from '@openscience/domain';
import { sourceCompositionRecoveryFixture, sourceReviewPacketFailureFixture, sourceSavedCompositionFixture } from '../../../packages/domain/test/agent/source-composition-recovery-fixture';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function fixture(packet: boolean | 'saved' = false) {
  const f = packet === 'saved' ? await sourceSavedCompositionFixture() : packet ? await sourceReviewPacketFailureFixture() : await sourceCompositionRecoveryFixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.redis.lpush });
  const token = await createSession(redis, { userId: f.input.userId, status: 'email_verified' });
  const app = await buildApp({ prisma: f.prisma, redis, storage: f.storage, audit: f.deps.audit,
    mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  apps.push(app);
  const url = `/research-objects/${f.ids.ro}/hermes-runs/${f.run.id}`;
  const cookies = { openscience_session: token };
  return { ...f, app, url, cookies, post: (key = 'same-browser', payload: unknown = { expectedVersion: f.run.version }) =>
    app.inject({ method: 'POST', url: `${url}/retry-generation`, cookies, headers: { 'idempotency-key': key }, payload }) };
}

describe('existing retry-generation final composition HTTP contract', () => {
  it('offers one native review of the saved paid composition and hides its private proof', async () => {
    const f = await fixture('saved'); const version = f.run.version;
    const get = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(get.statusCode).toBe(200);
    expect(get.json().run).toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-review-fresh', chargeableAttempts: 1 });
    expect(get.body).not.toMatch(/savedCompositionCandidate|rejectedOutputs|providerAuditId|draftClaims/);
    const tasks = f.db.agentTasks.length; const ledger = f.db.usageLedger.length;
    const [first, second] = await Promise.all([f.post('saved-tab-one', { expectedVersion: version }),
      f.post('saved-tab-two', { expectedVersion: version })]);
    expect(first.statusCode).toBe(202); expect(second.statusCode).toBe(202);
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toHaveLength(ledger + 1);
    expect((await f.post('saved-tab-one', { expectedVersion: version })).statusCode).toBe(202);
    expect(f.db.usageLedger).toHaveLength(ledger + 1);
  });
  it('denies a changed saved reply over HTTP without charging another task', async () => {
    const f = await fixture('saved');
    const last = f.db.agentTasks.at(-1)!;
    (last.result as { scientificReview: { rejectedOutputs: { text: string }[] } }).scientificReview.rejectedOutputs[1]!.text += ' ';
    const tasks = f.db.agentTasks.length; const ledger = structuredClone(f.db.usageLedger);
    const denied = await f.post('changed-paid-reply');
    expect(denied.statusCode).toBe(400); expect(denied.json().error.code).toBe('VALIDATION_ERROR');
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toEqual(ledger);
  });
  it('projects and replays one paid independent continuation for an exact initial local overflow', async () => {
    const f = await fixture(true); const version = f.run.version;
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200); expect(read.json().run).toMatchObject({
      canRetryGeneration: true, generationRecovery: 'source-review-independent', chargeableAttempts: 1 });
    expect(read.body).not.toMatch(/packetFailureEvidence|unverifiedSummaries|draftClaims|semanticStage/);
    const debits = f.db.usageLedger.length; const tasks = f.db.agentTasks.length;
    const [first, replay] = await Promise.all([f.post('packet-browser', { expectedVersion: version }), f.post('packet-browser', { expectedVersion: version })]);
    expect(first.statusCode).toBe(202); expect(replay.statusCode).toBe(202); expect(first.json()).toEqual(replay.json());
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toHaveLength(debits + 1);
    const dispatches = f.redis.lpush.mock.calls.length;
    expect((await f.post('packet-browser', { expectedVersion: version })).statusCode).toBe(202);
    expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    expect((await f.post('different-packet-browser', { expectedVersion: version })).statusCode).toBe(409);
    expect(f.db.usageLedger).toHaveLength(debits + 1);
  });

  it('denies a locally marked packet failure if any provider call was already recorded', async () => {
    const f = await fixture(true);
    const taskId = f.db.ingestionTasks.find(row => row.id === f.source.id)!.agentTaskId;
    f.db.auditLogs.push({ id: 'unexpected-provider-call', action: 'ai.gateway.call', requestId: taskId, actorId: null,
      targetType: 'ai_gateway', metadata: { operation: 'scientific_review' } });
    const before = structuredClone(f.db); const denied = await f.post('not-local');
    expect(denied.statusCode).toBe(400); expect(denied.json().error.code).toBe('VALIDATION_ERROR'); expect(f.db).toEqual(before);
  });

  it.each(['failed_retryable', 'failed_blocked'])('replays the same terminal %s operation without restarting or charging', async state => {
    const f = await fixture(); const version = f.run.version;
    expect((await f.post('terminal-replay', { expectedVersion: version })).statusCode).toBe(202);
    Object.assign(f.db.agentTasks.at(-1)!, { status: 'failed', error: 'Later transport failure' });
    Object.assign(f.db.ingestionTasks.find(row => row.id === f.source.id)!, { state, error: 'Later transport failure' });
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ failed: 1, errors: 0 });
    const before = structuredClone(f.db); const dispatches = f.redis.lpush.mock.calls.length;
    const replay = await f.post('terminal-replay', { expectedVersion: version });
    expect(replay.statusCode).toBe(202); expect(replay.json().run).toMatchObject({ id: f.run.id, status: 'failed' });
    expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
  });

  it('projects the paid final-only continuation and accepts/replays it once without exposing private science', async () => {
    const f = await fixture(); const old = structuredClone(f.failed);
    const ledger = f.db.usageLedger.length; const tasks = f.db.agentTasks.length;
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run).toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-composition', chargeableAttempts: 1 });
    expect(read.body).not.toMatch(/sourceMapRef|semanticStage|rejectedOutputs|draftClaims/);
    const version = f.run.version;
    const [first, replay] = await Promise.all([f.post('same-browser', { expectedVersion: version }), f.post('same-browser', { expectedVersion: version })]);
    expect(first.statusCode).toBe(202); expect(replay.statusCode).toBe(202);
    expect(first.json()).toEqual(replay.json()); expect(first.json().run).toMatchObject({ id: f.run.id, status: 'running' });
    expect(f.db.usageLedger).toHaveLength(ledger + 1); expect(f.db.agentTasks).toHaveLength(tasks + 1);
    expect(f.db.agentTasks.find(row => row.id === old.id)).toEqual(old);
    const dispatches = f.redis.lpush.mock.calls.length;
    expect((await f.post('same-browser', { expectedVersion: version })).statusCode).toBe(202);
    expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    expect((await f.post('different-browser', { expectedVersion: version })).statusCode).toBe(409);
    expect(f.db.usageLedger).toHaveLength(ledger + 1);
  });

  it.each(['stale-version', 'viewer', 'nonmember', 'receipt', 'map'])(
    'denies %s against current persisted authority before adding a task or debit', async change => {
      const f = await fixture(); const payload = { expectedVersion: f.run.version };
      if (change === 'stale-version') payload.expectedVersion--;
      if (change === 'viewer') f.db.memberships[0].role = 'viewer';
      if (change === 'nonmember') f.db.memberships.length = 0;
      if (change === 'receipt') f.db.auditLogs.splice(f.db.auditLogs.findIndex(row =>
        row.action === 'ingestion.task.system_analysis_refresh' && row.metadata.newAgentTaskId === f.failed.id), 1);
      if (change === 'map') f.failed.result.scientificReview.semanticStage.source.sourceMapHash = 'e'.repeat(64);
      const before = structuredClone(f.db);
      const response = await f.post('denied', payload);
      expect(response.statusCode).toBe(change === 'stale-version' ? 409 : ['viewer', 'nonmember'].includes(change) ? 403 : 400);
      expect(response.json().error.code).toBe(change === 'stale-version' ? 'CONCURRENT_UPDATE'
        : ['viewer', 'nonmember'].includes(change) ? 'FORBIDDEN' : 'VALIDATION_ERROR');
      expect(f.db).toEqual(before);
    });

  it.each([{ expectedVersion: 0 }, { expectedVersion: 1, sourceMapRef: {} }, { expectedVersion: '1' }])(
    'rejects malformed recovery input without trusting client source or mode (%j)', async payload => {
      const f = await fixture(); const before = structuredClone(f.db);
      expect((await f.post('invalid', payload)).statusCode).toBe(400); expect(f.db).toEqual(before);
    });
});
