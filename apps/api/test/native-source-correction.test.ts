import { afterEach, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { nativeSourceCorrectionFixture } from '../../../packages/domain/test/agent/native-source-correction-fixture';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function apiFixture() {
  const f = await nativeSourceCorrectionFixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.redis.lpush });
  const token = await createSession(redis, { userId: f.input.userId, status: 'email_verified' });
  const app = await buildApp({ ...f.deps, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  apps.push(app);
  return { ...f, app, url: `/ingestion/${f.input.taskId}/reanalyze`, cookies: { openscience_session: token },
    body: { processingConsent: true, sourceAgentTaskId: f.author.id, sourceReanalysis: f.input.sourceReanalysis } };
}

it('uses the existing HTTP entry to create one Native revision and recover its lost response with the same key', async () => {
  const f = await apiFixture(); const before = structuredClone(f.db);
  const post = () => f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
    headers: { 'idempotency-key': f.input.idempotencyKey }, payload: f.body });
  const first = await post(); const replay = await post();
  expect(first.statusCode, first.body).toBe(202); expect(replay.statusCode, replay.body).toBe(202);
  expect(replay.json()).toEqual(first.json());
  expect(f.db.usageLedger).toHaveLength(before.usageLedger.length + 1);
  expect(f.db.agentTasks[0]).toEqual(before.agentTasks[0]); expect(f.db.versions).toEqual(before.versions);
  expect(first.body).not.toContain('nativeAgentExecution'); expect(first.body).not.toContain('authorCheckpointSha256');
});

it.each(['candidate', 'checkpoint', 'run-scope', 'consent'])('rejects caller-controlled %s in the new strict intent without creating a task', async variant => {
  const f = await apiFixture(); const before = structuredClone(f.db);
  const body: Record<string, unknown> = structuredClone(f.body);
  if (variant === 'candidate') body.sourceResult = f.author.result;
  if (variant === 'checkpoint') (body.sourceReanalysis as Record<string, unknown>).authorCheckpointSha256 = f.cp.serializedSha256;
  if (variant === 'run-scope') (body.sourceReanalysis as Record<string, unknown>).sourceRunId = f.ids.run;
  if (variant === 'consent') body.processingConsent = false;
  const response = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
    headers: { 'idempotency-key': 'bad-input' }, payload: body });
  expect(response.statusCode).toBe(400); expect(f.db).toEqual(before);
});

it('rejects a viewer before charging for a saved-source correction', async () => {
  const f = await apiFixture(); f.db.memberships[0]!.role = 'viewer'; const before = structuredClone(f.db);
  const response = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
    headers: { 'idempotency-key': 'viewer' }, payload: f.body });
  expect(response.statusCode).toBe(403); expect(f.db).toEqual(before);
});

it('does not fall back to a new full analysis when the saved Native author proof is absent', async () => {
  const f = await apiFixture(); delete f.author.result.nativeAgentExecution; const before = structuredClone(f.db);
  const response = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
    headers: { 'idempotency-key': 'no-author' }, payload: f.body });
  expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('VALIDATION_ERROR'); expect(f.db).toEqual(before);
});

it('fails closed on a lost-response replay whose correction receipt was removed', async () => {
  const f = await apiFixture();
  const post = () => f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
    headers: { 'idempotency-key': f.input.idempotencyKey }, payload: f.body });
  expect((await post()).statusCode).toBe(202);
  f.db.auditLogs.splice(f.db.auditLogs.findIndex(row => row.action === 'ingestion.task.reanalyze'), 1);
  const before = structuredClone(f.db); const response = await post();
  expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('INGESTION_NOT_RETRYABLE'); expect(f.db).toEqual(before);
});
