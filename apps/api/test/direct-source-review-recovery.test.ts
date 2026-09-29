import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { fixture } from '../../../packages/domain/test/agent/direct-source-review-fixture';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function apiFixture() {
  const f = fixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.redis.lpush });
  const token = await createSession(redis, { userId: f.input.actorId, status: 'email_verified' });
  const app = await buildApp({ prisma: f.prisma, redis, audit: f.deps.audit, mailer: createFakeMailer(),
    cookieSecret: 'test-secret', secureCookies: false });
  apps.push(app);
  return { ...f, app, cookies: { openscience_session: token }, url: `/research-objects/${f.ids.ro}/hermes-runs/${f.ids.run}` };
}

describe('fresh source review recovery HTTP contract', () => {
  it('discloses fresh paid review on read and requires one explicit versioned idempotent POST', async () => {
    const f = await apiFixture();
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run).toMatchObject({ generationRecovery: 'source-review-fresh', chargeableAttempts: 1, canRetryGeneration: true });
    expect(read.body).not.toContain('sourceMapRef'); expect(read.body).not.toContain('unverifiedSummaries');
    expect(f.redis.lpush).not.toHaveBeenCalled();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': f.input.idempotencyKey }, payload: { expectedVersion: 7 } };
    const first = await f.app.inject(request);
    expect(first.statusCode).toBe(202);
    expect(first.json().run).toMatchObject({ id: f.ids.run, version: 8, status: 'running', maxAgentTasks: 9 });
    expect((await f.app.inject(request)).statusCode).toBe(202);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    expect((await f.app.inject({ ...request, payload: { expectedVersion: 8 } })).statusCode).toBe(409);
  });

  it('rejects source selection/grant expansion and reader POST without scheduling or charging', async () => {
    const f = await apiFixture();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'explicit' }, payload: { expectedVersion: 7 } };
    for (const extra of [{ compositionSourceAgentTaskId: f.ids.anchor }, { maxAgentTasks: 11 }, { savedOutputReused: true }])
      expect((await f.app.inject({ ...request, payload: { ...request.payload, ...extra } })).statusCode).toBe(400);
    expect((await f.app.inject({ ...request, headers: {} })).statusCode).toBe(400);
    f.db.memberships[0].role = 'viewer';
    const view = (await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies })).json().run;
    expect(view.canRetryGeneration).not.toBe(true);
    expect((await f.app.inject(request)).statusCode).toBe(403);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(0);
  });
});
