import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { advancePrivateSourceReanalysisToReview, privateSourceReanalysisFixture } from '../../../packages/domain/test/agent/private-source-reanalysis-fixture';
import { exhaustedRecoveredCompositionFixture } from '../../../packages/domain/test/agent/source-composition-recovery-fixture';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function apiFixture(recoveredComposition = false) {
  const f = recoveredComposition ? await exhaustedRecoveredCompositionFixture() : await privateSourceReanalysisFixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.redis.lpush });
  const token = await createSession(redis, { userId: f.input.userId, status: 'email_verified' });
  const app = await buildApp({ prisma: f.prisma, redis, storage: f.storage, audit: f.deps.audit,
    mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  apps.push(app);
  return { ...f, app, cookies: { openscience_session: token }, url: `/ingestion/${f.input.taskId}/reanalyze`,
    body: { processingConsent: true, sourceAgentTaskId: f.current.id, sourceReanalysis: f.input.sourceReanalysis } };
}

describe('POST existing ingestion reanalyze paid private source HTTP contract', () => {
  it('uses the real recovered-composition history through the existing GET and POST without reopening it or charging twice', async () => {
    const f = await apiFixture(true); const before = structuredClone(f.db);
    const get = () => f.app.inject({ method: 'GET', url: `/research-objects/${f.ids.ro}/hermes-runs/${f.input.sourceReanalysis.sourceRunId}`, cookies: f.cookies });
    const view = await get(); expect(view.statusCode).toBe(200);
    expect(view.json().run.sourceReanalysis).toEqual({ ingestionTaskId: f.input.taskId, sourceAgentTaskId: f.current.id });
    const post = (key: string) => f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': key }, payload: f.body });
    const first = await post('recovered-first-tab'); const replay = await post('recovered-second-tab');
    expect(first.statusCode).toBe(202); expect(replay.statusCode).toBe(202); expect(first.json()).toEqual(replay.json());
    expect(f.db.usageLedger).toHaveLength(before.usageLedger.length + 1);
    expect(f.db.hermesResearchRuns).toEqual(before.hermesResearchRuns);
    expect(f.db.hermesResearchSteps).toEqual(before.hermesResearchSteps);
    expect(f.db.agentTasks.slice(0, before.agentTasks.length)).toEqual(before.agentTasks);
    expect(f.verifier).not.toHaveBeenCalled();
    expect((await get()).json().run.sourceReanalysis.existingIngestionTaskId).toBe(first.json().task.id);
  });
  it('returns the unchanged 202 task envelope and replays different keys without a new charge or private task fields', async () => {
    const f = await apiFixture(); const before = f.db.usageLedger.length;
    const post = (key: string) => f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': key }, payload: f.body });
    const [first, replay] = await Promise.all([post('first-browser'), post('another-browser')]);
    expect(first.statusCode).toBe(202); expect(replay.statusCode).toBe(202);
    expect(first.json()).toEqual(replay.json());
    expect(Object.keys(first.json())).toEqual(['task']);
    expect(first.json().task).toMatchObject({ state: 'queued', artifactId: f.ids.artifact, logicalPath: 'original.pdf' });
    expect(Object.keys(first.json().task).sort()).toEqual(['agentTaskId', 'artifactId', 'error', 'id', 'logicalPath', 'retryCount', 'state']);
    expect(first.body).not.toMatch(/sourceMapRef|objectKey|sourceReanalysis|new_paid_private_analysis/);
    expect(f.db.usageLedger).toHaveLength(before + 1);
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${f.ids.ro}/hermes-runs/${f.ids.run}`, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run.sourceReanalysis).toEqual({ ingestionTaskId: f.ids.source, sourceAgentTaskId: f.current.id,
      existingIngestionTaskId: first.json().task.id });
  });

  it('recovers the same HTTP operation after normal review advances its pointer, including UUID case and property order', async () => {
    const f = await apiFixture();
    const first = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': 'second-tab' }, payload: f.body });
    expect(first.statusCode).toBe(202);
    const { original, successor } = await advancePrivateSourceReanalysisToReview(f, first.json().task.id);
    expect(successor.id).not.toBe(original.id);
    const before = structuredClone(f.db); const dispatches = f.redis.lpush.mock.calls.length;
    const replay = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': 'lost-first-tab' }, payload: { ...f.body, sourceReanalysis: {
        expectedRunVersion: 22, sourceRunId: f.ids.run.toUpperCase(), intent: 'new_paid_private_analysis',
      } } });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().task).toMatchObject({ id: first.json().task.id, agentTaskId: successor.id });
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${f.ids.ro}/hermes-runs/${f.ids.run}`, cookies: f.cookies });
    expect(read.statusCode).toBe(200); expect(read.json().run.sourceReanalysis.existingIngestionTaskId).toBe(first.json().task.id);
    expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
  });

  it.each(['arbitrary-pointer', 'missing-receipt', 'successor-actor'])(
    'denies a changed %s after HTTP replay has progressed without a new task or debit', async change => {
      const f = await apiFixture();
      const first = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
        headers: { 'idempotency-key': 'new-operation' }, payload: f.body });
      expect(first.statusCode).toBe(202);
      const { successor } = await advancePrivateSourceReanalysisToReview(f, first.json().task.id);
      if (change === 'arbitrary-pointer') f.db.ingestionTasks.at(-1)!.agentTaskId = f.current.id;
      if (change === 'missing-receipt') f.db.auditLogs.splice(f.db.auditLogs.findIndex(row =>
        row.action === 'ingestion.task.system_analysis_refresh' && row.targetId === first.json().task.id), 1);
      if (change === 'successor-actor') f.db.agentSessions.find(row => row.id === successor.sessionId)!.userId = 'other';
      const before = structuredClone(f.db);
      const replay = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
        headers: { 'idempotency-key': 'denied-replay' }, payload: f.body });
      expect(replay.statusCode).toBe(409); expect(replay.json().error.code).toBe('INGESTION_NOT_RETRYABLE');
      const read = await f.app.inject({ method: 'GET', url: `/research-objects/${f.ids.ro}/hermes-runs/${f.ids.run}`, cookies: f.cookies });
      expect(read.statusCode).toBe(200); expect(read.json().run.sourceReanalysis).toBeUndefined();
      expect(f.db).toEqual(before);
    });

  it.each(['missing-consent', 'false-consent', 'missing-source', 'source-uuid', 'null-intent', 'intent-value', 'run-uuid',
    'missing-version', 'zero-version', 'negative-version', 'fractional-version', 'string-version', 'nested-ref', 'nested-mode',
    'top-ref', 'top-run', 'top-grant', 'missing-key', 'long-key'])(
    'rejects %s as strict HTTP body/header input before creating any task or debit', async change => {
      const f = await apiFixture();
      const payload: Record<string, unknown> = structuredClone(f.body);
      const nested = payload.sourceReanalysis as Record<string, unknown>;
      const headers = { 'idempotency-key': 'strict-contract' };
      if (change === 'missing-consent') delete payload.processingConsent;
      if (change === 'false-consent') payload.processingConsent = false;
      if (change === 'missing-source') delete payload.sourceAgentTaskId;
      if (change === 'source-uuid') payload.sourceAgentTaskId = 'other';
      if (change === 'null-intent') payload.sourceReanalysis = null;
      if (change === 'intent-value') nested.intent = 'recover_without_charge';
      if (change === 'run-uuid') nested.sourceRunId = 'not-a-uuid';
      if (change === 'missing-version') delete nested.expectedRunVersion;
      if (change === 'zero-version') nested.expectedRunVersion = 0;
      if (change === 'negative-version') nested.expectedRunVersion = -1;
      if (change === 'fractional-version') nested.expectedRunVersion = 22.5;
      if (change === 'string-version') nested.expectedRunVersion = '22';
      if (change === 'nested-ref') nested.sourceMapRef = f.reference;
      if (change === 'nested-mode') nested.mode = 'private';
      if (change === 'top-ref') payload.sourceMapRef = f.reference;
      if (change === 'top-run') payload.sourceRunId = f.ids.run;
      if (change === 'top-grant') payload.maxAgentTasks = 10;
      if (change === 'missing-key') delete (headers as Record<string, string>)['idempotency-key'];
      if (change === 'long-key') headers['idempotency-key'] = 'x'.repeat(65);
      const before = structuredClone(f.db);
      const response = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies, headers, payload });
      expect(response.statusCode).toBe(400); expect(f.db).toEqual(before);
    });

  it.each(['viewer', 'nonmember', 'wrong-owner', 'stale-version', 'changed-source'])(
    'denies %s against persisted scope and permission through HTTP', async change => {
      const f = await apiFixture();
      if (change === 'viewer') f.db.memberships[0].role = 'viewer';
      if (change === 'nonmember') f.db.memberships.length = 0;
      if (change === 'wrong-owner') f.db.ingestionBatches[0].userId = 'other';
      if (change === 'stale-version') f.body.sourceReanalysis.expectedRunVersion = 21;
      if (change === 'changed-source') f.body.sourceAgentTaskId = f.ids.anchor;
      const before = structuredClone(f.db);
      const response = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
        headers: { 'idempotency-key': 'denied' }, payload: f.body });
      expect(response.statusCode).toBe(change === 'viewer' ? 403 : change === 'nonmember' ? 404 : 409);
      expect(response.json().error.code).toBe(change === 'viewer' ? 'FORBIDDEN' : change === 'nonmember' ? 'WORKSPACE_NOT_FOUND' : 'INGESTION_NOT_RETRYABLE');
      expect(f.db).toEqual(before);
    });

  it('keeps the legacy body optional while arbitrary unconfirmed sources cannot use the private branch', async () => {
    const f = await apiFixture(); const before = structuredClone(f.db);
    const legacyBody = { processingConsent: true, sourceAgentTaskId: f.current.id };
    const legacy = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': 'legacy-body' }, payload: legacyBody });
    expect(legacy.statusCode).toBe(409); expect(legacy.json().error.code).toBe('INGESTION_NOT_RETRYABLE');
    f.db.hermesResearchSteps.length = 0;
    const unrelated = await f.app.inject({ method: 'POST', url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': 'no-chain' }, payload: f.body });
    expect(unrelated.statusCode).toBe(409); expect(unrelated.json().error.code).toBe('INGESTION_NOT_RETRYABLE');
    expect(f.db.agentTasks).toEqual(before.agentTasks); expect(f.db.usageLedger).toEqual(before.usageLedger);
  });

  it('still accepts the original confirmed-body contract with the same 202 task envelope', async () => {
    const f = await apiFixture();
    f.db.ingestionTasks[0].state = 'confirmed'; f.current.result = structuredClone(f.anchorResult);
    f.db.commits.push({ id: 'manual-save', idempotencyKey: `ingestion-confirm:${f.ids.source}`, researchObjectId: f.ids.ro });
    f.db.versions.push({ id: 'manual-version', commitId: 'manual-save', researchObjectId: f.ids.ro, versionNo: 1 });
    f.db.versionManifests.push({ id: 'manual-manifest', versionId: 'manual-version' });
    const payload = { processingConsent: true, sourceAgentTaskId: f.current.id };
    const request = { method: 'POST' as const, url: f.url, cookies: f.cookies,
      headers: { 'idempotency-key': 'legacy-confirmed' }, payload };
    const first = await f.app.inject(request); const replay = await f.app.inject(request);
    expect(first.statusCode).toBe(202); expect(replay.statusCode).toBe(202);
    expect(replay.json()).toEqual(first.json()); expect(Object.keys(first.json())).toEqual(['task']);
    expect(f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')!.metadata.intent).toBeUndefined();
  });
});
