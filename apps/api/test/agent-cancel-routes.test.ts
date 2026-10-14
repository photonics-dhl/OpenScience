import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const SESSION_ID = '00000000-0000-4000-8000-000000000701';
const TASK_ID = '00000000-0000-4000-8000-000000000702';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000703';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function fixture() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const user = seedUser(db, { id: '00000000-0000-4000-8000-000000000700' });
  const other = seedUser(db, { id: OTHER_USER_ID });
  db.agentSessions.push({ id: SESSION_ID, userId: user.id, researchObjectId: null, kind: 'extract', status: 'active', deletedAt: null });
  db.agentTasks.push({ id: TASK_ID, sessionId: SESSION_ID, kind: 'demo.echo', status: 'pending', progress: 0,
    retryCount: 0, executionAttempt: 0, dispatchedAt: null, deletedAt: null, error: null,
    payload: { message: 'preserve this payload' }, result: { nativeAgentExecution: { unit: 'private-unit' }, journalNativeCheckpoint: { token: 'secret' } },
    createdAt: new Date('2026-10-14T00:00:00Z'), updatedAt: new Date('2026-10-14T00:00:00Z') });
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  const otherToken = await createSession(redis, { userId: other.id, status: 'email_verified' });
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  const errors: Error[] = [];
  app.addHook('onError', async (_request, _reply, error) => { errors.push(error); });
  apps.push(app);
  return { app, db, errors, cookies: { openscience_session: token }, otherCookies: { openscience_session: otherToken } };
}

describe('POST /agent/tasks/:id/cancel', () => {
  it('requires authentication and a strict generation-bound body', async () => {
    const f = await fixture();
    const url = `/agent/tasks/${TASK_ID}/cancel`;
    expect((await f.app.inject({ method: 'POST', url, payload: { expectedExecutionAttempt: 0 } })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url, cookies: f.cookies, payload: { expectedExecutionAttempt: 0, reason: 'user' } })).statusCode).toBe(400);
    expect((await f.app.inject({ method: 'POST', url, cookies: f.cookies, payload: { expectedExecutionAttempt: -1 } })).statusCode).toBe(400);
  });

  it('stops only the owner generation, replays idempotently, rejects stale generations, and projects no private receipt', async () => {
    const f = await fixture();
    const request = { method: 'POST' as const, url: `/agent/tasks/${TASK_ID}/cancel`, cookies: f.cookies,
      payload: { expectedExecutionAttempt: 0 } };
    const applied = await f.app.inject(request);
    expect(applied.statusCode, f.errors[0]?.stack ?? applied.body).toBe(200);
    expect(applied.json().task).toMatchObject({ outcome: 'applied', status: 'failed', executionAttempt: 1, stopReason: 'user' });
    expect(applied.body).not.toMatch(/private-unit|journalNativeCheckpoint|nativeAgentExecution|secret/);
    const replay = await f.app.inject(request);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().task).toMatchObject({ outcome: 'alreadyApplied', executionAttempt: 1 });
    const stale = await f.app.inject({ ...request, payload: { expectedExecutionAttempt: 9 } });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(f.db.agentTasks[0]).toMatchObject({ status: 'failed', executionAttempt: 1 });
  });

  it('hides a task from another authenticated user', async () => {
    const f = await fixture();
    const response = await f.app.inject({ method: 'POST', url: `/agent/tasks/${TASK_ID}/cancel`, cookies: f.otherCookies,
      payload: { expectedExecutionAttempt: 0 } });
    expect(response.statusCode, f.errors[0]?.stack ?? response.body).toBe(404);
    expect(f.db.agentTasks[0]).toMatchObject({ status: 'pending', executionAttempt: 0 });
  });
});
