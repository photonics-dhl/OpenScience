import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { fixture, id } from '../../../packages/domain/test/agent/first-image-continuation-fixture';
import { createHermesFirstImageContinuation } from '../../../packages/domain/src/agent/first-image-continuation';
import { claimAgentTask } from '../../../packages/domain/src/agent/agent';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function apiFixture() {
  const f = fixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.deps.redis!.lpush });
  const token = await createSession(redis, { userId: id(1), status: 'email_verified' });
  const app = await buildApp({ prisma: f.prisma, redis, audit: f.deps.audit, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  apps.push(app);
  return { ...f, app, cookies: { openscience_session: token }, url: `/research-objects/${id(3)}/hermes-runs?originGuideTaskId=${id(15)}` };
}
describe('first-image exact origin HTTP recovery', () => {
  it('accepts a current scoped marker once and exposes only the persisted server run in the public task result', async () => {
    const f = await apiFixture();
    const request = { method: 'POST' as const, url: '/agent/tasks', cookies: f.cookies,
      headers: { 'idempotency-key': 'first-image-current-submit' }, payload: { sessionId: id(10), kind: 'workspace.guide', payload: f.input.payload } };
    const response = await f.app.inject(request);
    expect(response.statusCode).toBe(201);
    const taskId = response.json().task.id as string;
    const charged = structuredClone(f.db.usageLedger);
    expect((await f.app.inject(request)).json().task.id).toBe(taskId);
    expect(f.db.usageLedger).toEqual(charged);
    const claimed = await claimAgentTask(f.deps, taskId);
    const firstImageRun = await createHermesFirstImageContinuation(f.deps,
      { guideTaskId: taskId, executionAttempt: claimed!.executionAttempt!, payload: f.input.payload });
    Object.assign(f.db.agentTasks.find(task => task.id === taskId)!, { status: 'succeeded', result: {
      summary: 'Queued', nextSteps: [], needsMoreInformation: false, firstImageRun } });
    const read = await f.app.inject({ method: 'GET', url: `/agent/tasks/${taskId}`, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().task.result).toEqual({ summary: 'Queued', nextSteps: [], needsMoreInformation: false, firstImageRun });
    expect(f.db.agentTasks.filter(task => task.kind === 'presentation.generate')).toHaveLength(1);
  });
  it('denies a reader marker before submitting or charging a guide task', async () => {
    const f = await apiFixture(); f.db.memberships[0].role = 'viewer';
    const before = structuredClone(f.db.usageLedger);
    const response = await f.app.inject({ method: 'POST', url: '/agent/tasks', cookies: f.cookies,
      headers: { 'idempotency-key': 'reader-marker' }, payload: { sessionId: id(10), kind: 'workspace.guide', payload: f.input.payload } });
    expect(response.statusCode).toBe(403);
    expect(f.db.usageLedger).toEqual(before); expect(f.db.hermesResearchRuns).toHaveLength(0);
  });
  it('GET never starts a run and recovers a persisted run after the original guide loses its result', async () => {
    const f = await apiFixture();
    const read = () => f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect((await read()).json()).toEqual({ run: null });
    expect(f.db.hermesResearchRuns).toHaveLength(0);
    const started = await createHermesFirstImageContinuation(f.deps, f.input);
    f.db.agentTasks.find(t => t.id === id(15))!.status = 'failed';
    const ledger = structuredClone(f.db.usageLedger);
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json().run).toMatchObject({ id: started.runId, actorId: id(1), researchObjectId: id(3), versionId: id(4),
      status: 'generating_storyboard', canRetryGeneration: false });
    await read();
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(1);
  });
  it('rejects missing membership, other origin scope and query extensions without generating', async () => {
    const f = await apiFixture();
    await createHermesFirstImageContinuation(f.deps, f.input);
    const read = (url = f.url) => f.app.inject({ method: 'GET', url, cookies: f.cookies });
    expect((await read(f.url.replace(id(3), id(99)))).statusCode).toBe(404);
    expect((await read(`${f.url}&executionIntent=first-image`)).statusCode).toBe(400);
    const ledger = structuredClone(f.db.usageLedger);
    f.db.memberships.length = 0;
    expect((await read()).statusCode).toBe(404);
    expect(f.db.usageLedger).toEqual(ledger);
  });
});
