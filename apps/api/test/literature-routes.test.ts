import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakeMailer, createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildApp } from '../src/app';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => void store.set(key, value),
    del: async (key: string) => void store.delete(key),
    expire: async () => 1,
    lpush: async () => 1,
    multi: () => {
      const commands: Array<[string, string]> = [];
      const chain = { incr: (key: string) => (commands.push(['incr', key]), chain), expire: () => chain, exec: async () => commands.map(() => [null, 1]) };
      return chain;
    },
  };
}

async function makeApp() {
  const { prisma, db } = createFakePrisma();
  const redis = makeRedis();
  const user = seedUser(db, { id: '00000000-0000-4000-8000-000000000001' });
  db.workspaces.push({ id: '00000000-0000-4000-8000-000000000011', type: 'personal', ownerId: user.id, name: 'Personal', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'membership-personal', workspaceId: '00000000-0000-4000-8000-000000000011', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.usageLedger.push({ id: 'credit', userId: user.id, resource: 'ai_credit', delta: 5, kind: 'grant', createdAt: new Date() });
  const token = await createSession(redis as never, { userId: user.id, status: 'email_verified' });
  const app = await buildApp({ prisma, redis: redis as never, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, security: { csrf: true }, rateLimitEnabled: true });
  const csrf = await app.inject({ method: 'GET', url: '/csrf-token' });
  const csrfCookie = csrf.cookies.find((cookie) => cookie.name === '_csrf');
  return { app, db, token, csrfToken: csrf.json().csrfToken as string, csrfCookie: csrfCookie!.value };
}

describe('POST /literature/acquisitions', () => {
  it('requires auth and CSRF, then returns 202 identities for the bounded acquisition contract', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const body = { query: 'attosecond dynamics', identifier: '10.1038/nature12373', target: { kind: 'personal' } };

    expect((await app.inject({ method: 'POST', url: '/literature/acquisitions', payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/literature/acquisitions', cookies: { _csrf: csrfCookie }, headers: { 'x-csrf-token': csrfToken }, payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token }, payload: body })).statusCode).toBe(403);
    const response = await app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': 'literature-1' }, payload: body,
    });

    expect(response.statusCode).toBe(202);
    expect(Object.keys(response.json()).sort()).toEqual(['researchObject', 'session', 'task']);
    expect(Object.keys(response.json().researchObject).sort()).toEqual(['createdAt', 'id', 'status', 'title', 'version', 'visibility', 'workspaceId']);
    expect(Object.keys(response.json().session).sort()).toEqual(['createdAt', 'id', 'kind', 'researchObjectId', 'status', 'title']);
    expect(Object.keys(response.json().task).sort()).toEqual(['canRetry', 'createdAt', 'error', 'executionAttempt', 'id', 'kind', 'progress', 'result', 'retryCount', 'sessionId', 'status', 'updatedAt']);
    expect(response.json().task.canRetry).toBe(false);
    expect(response.json().task.kind).toBe('source.retrieve');
    expect(db.agentTasks[0]?.payload).toEqual({ query: 'attosecond dynamics', providers: ['scansci'], limit: 1, includeFullText: true, identifier: '10.1038/nature12373', retryContractVersion: 1, target: { kind: 'personal' } });
    await app.close();
  });

  it('rejects missing idempotency, client-controlled provider fields, and malformed targets', async () => {
    const { app, token, csrfToken, csrfCookie } = await makeApp();
    const request = (payload: unknown, headers: Record<string, string> = {}) => app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, ...headers }, payload,
    });

    expect((await request({ query: 'x', target: { kind: 'personal' } })).statusCode).toBe(400);
    expect((await request({ query: 'x', providers: ['scansci'], target: { kind: 'personal' } }, { 'idempotency-key': 'invalid-fields' })).statusCode).toBe(400);
    expect((await request({ query: 'x', retryContractVersion: 1, target: { kind: 'personal' } }, { 'idempotency-key': 'reserved-marker' })).statusCode).toBe(400);
    expect((await request({ query: 'x', target: { kind: 'research_object', researchObjectId: 'not-a-uuid' } }, { 'idempotency-key': 'invalid-target' })).statusCode).toBe(400);
    await app.close();
  });

  it('requires one strict recovery target combination', async () => {
    const { app, token } = await makeApp();
    const get = (query: string) => app.inject({
      method: 'GET', url: `/agent/tasks?actionable=false&kind=source.retrieve&recovery=true${query}`,
      cookies: { openscience_session: token },
    });
    expect((await get('')).statusCode).toBe(400);
    expect((await get('&targetKind=research_object')).statusCode).toBe(400);
    expect((await get('&targetKind=personal&researchObjectId=00000000-0000-4000-8000-000000000701')).statusCode).toBe(400);
    expect((await get('&targetKind=personal')).statusCode).toBe(200);
    expect((await get('&targetKind=research_object&researchObjectId=00000000-0000-4000-8000-000000000701')).statusCode).toBe(200);
    await app.close();
  });

  it('scopes recovery before LIMIT across more than 20 newer tasks from another RO', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const user = db.users[0];
    const workspaceId = '00000000-0000-4000-8000-000000000011';
    const roA = '00000000-0000-4000-8000-000000000701';
    const roB = '00000000-0000-4000-8000-000000000702';
    db.memberships.push({ id: '00000000-0000-4000-8000-000000000703', workspaceId, userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    for (const [id, title] of [[roA, 'A'], [roB, 'B']] as const) {
      db.researchObjects.push({ id, workspaceId, createdBy: user.id, title, status: 'draft', visibility: 'private', version: 1, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() });
    }
    const acquire = (researchObjectId: string, key: string) => app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': key },
      payload: { query: `paper ${key}`, target: { kind: 'research_object', researchObjectId } },
    });
    const acquiredA = await acquire(roA, 'target-a');
    const acquiredB = await acquire(roB, 'target-b');
    const taskA = db.agentTasks.find((task) => task.id === acquiredA.json().task.id)!;
    const taskB = db.agentTasks.find((task) => task.id === acquiredB.json().task.id)!;
    Object.assign(taskA, { status: 'running', updatedAt: new Date('2026-08-30T00:00:00.000Z') });
    Object.assign(taskB, { status: 'running', updatedAt: new Date('2026-08-30T00:01:00.000Z') });
    for (let index = 0; index < 25; index += 1) {
      db.agentTasks.push({ ...taskB, id: `00000000-0000-4000-8000-${String(800 + index).padStart(12, '0')}`, status: 'succeeded', updatedAt: new Date(Date.parse('2026-08-30T00:02:00.000Z') + index * 1_000) });
    }

    const targetA = await app.inject({
      method: 'GET', url: `/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=research_object&researchObjectId=${roA}`,
      cookies: { openscience_session: token },
    });
    const personal = await app.inject({
      method: 'GET', url: '/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal',
      cookies: { openscience_session: token },
    });
    expect(targetA.json().tasks).toEqual([expect.objectContaining({ id: taskA.id, researchObjectId: roA })]);
    expect(personal.json().tasks).toEqual([]);
    expect(JSON.stringify(targetA.json())).not.toMatch(/paper target-a|paper target-b|payload|idempotencyKey/i);
    await app.close();
  });

  it('rejects JSON bodies larger than the literature contract limit', async () => {
    const { app, token, csrfToken, csrfCookie } = await makeApp();
    const response = await app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': 'oversize' },
      payload: { query: 'x', target: { kind: 'personal' }, ignored: 'x'.repeat(4_100) },
    });
    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it('rejects malformed identifiers and direct public source retrieval without side effects', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const headers = { 'x-csrf-token': csrfToken, 'idempotency-key': 'invalid-identifier' };
    const invalid = await app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie }, headers,
      payload: { query: 'attosecond dynamics', identifier: 'not-a-doi', target: { kind: 'personal' } },
    });
    const direct = await app.inject({
      method: 'POST', url: '/agent/tasks', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken },
      payload: { sessionId: '00000000-0000-4000-8000-000000000099', kind: 'source.retrieve', payload: {} },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    expect(direct.statusCode).toBe(400);
    expect(db.researchObjects).toHaveLength(0);
    expect(db.agentSessions).toHaveLength(0);
    expect(db.agentTasks).toHaveLength(0);
    await app.close();
  });

  it('rejects any public research-object request that claims a system idempotency key', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const victimId = '00000000-0000-4000-8000-000000000777';
    db.researchObjects.push({ id: victimId, workspaceId: '00000000-0000-4000-8000-000000000011', createdBy: victimId, title: 'Victim library', status: 'draft', visibility: 'private', version: 1, idempotencyKey: `system:personal-literature:${victimId}`, createdAt: new Date(), updatedAt: new Date() });
    const response = await app.inject({
      method: 'POST', url: '/research-objects', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': `system:personal-literature:${victimId}` },
      payload: { workspaceId: '00000000-0000-4000-8000-000000000011', title: 'Attacker claim' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(db.researchObjects).toHaveLength(1);
    await app.close();
  });

  it('lists only the signed-in user source tasks through the redacted public DTO', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    await app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': 'owned-list-task' },
      payload: { query: 'private owned query', target: { kind: 'personal' } },
    });
    const other = seedUser(db, { id: '00000000-0000-4000-8000-000000000002' });
    db.agentSessions.push({
      id: '00000000-0000-4000-8000-000000000802', userId: other.id, researchObjectId: null,
      kind: 'retrieval', title: '', status: 'active', idempotencyKey: 'other-session-secret', createdAt: new Date(), updatedAt: new Date(),
    });
    db.agentTasks.push({
      id: '00000000-0000-4000-8000-000000000803', sessionId: '00000000-0000-4000-8000-000000000802',
      kind: 'source.retrieve', status: 'pending', progress: 0, retryCount: 0, executionAttempt: 0,
      dispatchedAt: null, payload: { query: 'other user private query', identifier: '10.9999/private' }, interestContext: null,
      idempotencyKey: 'other-task-secret', result: null, error: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const response = await app.inject({
      method: 'GET', url: '/agent/tasks?actionable=false&kind=source.retrieve', cookies: { openscience_session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tasks).toHaveLength(1);
    expect(Object.keys(response.json().tasks[0]).sort()).toEqual([
      'canRetry', 'createdAt', 'error', 'executionAttempt', 'id', 'kind', 'progress', 'researchObjectId', 'result', 'retryCount', 'sessionId', 'status', 'updatedAt',
    ]);
    expect(JSON.stringify(response.json())).not.toMatch(/private owned query|other user private query|10\.9999\/private|other-.*-secret|payload|interestContext|dispatchedAt|idempotencyKey/);
    await app.close();
  });

  it('returns the globally authoritative recovery task before the 20-row history limit', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const acquired = await app.inject({
      method: 'POST', url: '/literature/acquisitions', cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, 'idempotency-key': 'recovery-history' },
      payload: { query: 'history seed', target: { kind: 'personal' } },
    });
    const owned = db.agentTasks.find((row) => row.id === acquired.json().task.id)!;
    Object.assign(owned, { status: 'succeeded', progress: 100, updatedAt: new Date('2026-08-30T00:30:00.000Z') });
    const base = new Date('2026-08-30T00:00:00.000Z').getTime();
    for (let index = 0; index < 25; index += 1) {
      db.agentTasks.push({
        ...owned,
        id: `00000000-0000-4000-8000-${String(900 + index).padStart(12, '0')}`,
        payload: { query: `private history ${index}`, target: { kind: 'personal' } }, idempotencyKey: `private-history-key-${index}`,
        createdAt: new Date(base + index * 1_000), updatedAt: new Date(base + index * 1_000),
      });
    }
    const activeId = '00000000-0000-4000-8000-000000000950';
    db.agentTasks.push({
      ...owned, id: activeId, status: 'running', progress: 40, payload: { ...owned.payload, query: 'older private active' },
      idempotencyKey: 'older-private-active-key', createdAt: new Date(base - 1_000), updatedAt: new Date(base - 1_000),
    });
    const other = seedUser(db, { id: '00000000-0000-4000-8000-000000000099' });
    db.agentSessions.push({ id: '00000000-0000-4000-8000-000000000951', userId: other.id, researchObjectId: null, kind: 'retrieval', title: '', status: 'active', idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() });
    db.agentTasks.push({
      ...owned, id: '00000000-0000-4000-8000-000000000952', sessionId: '00000000-0000-4000-8000-000000000951',
      status: 'running', payload: { ...owned.payload, query: 'other private active' }, idempotencyKey: 'other-private-active-key', updatedAt: new Date(base + 99_000),
    });

    const response = await app.inject({
      method: 'GET', url: '/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal', cookies: { openscience_session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tasks).toEqual([expect.objectContaining({ id: activeId, status: 'running' })]);
    expect(Object.keys(response.json().tasks[0]).sort()).toEqual([
      'canRetry', 'createdAt', 'error', 'executionAttempt', 'id', 'kind', 'progress', 'researchObjectId', 'result', 'retryCount', 'sessionId', 'status', 'updatedAt',
    ]);
    expect(JSON.stringify(response.json())).not.toMatch(/older private active|older-private-active-key|other private active|payload|idempotencyKey/);

    Object.assign(db.agentTasks.find((row) => row.id === activeId)!, { status: 'succeeded', progress: 100 });
    const eligibleId = '00000000-0000-4000-8000-000000000960';
    db.agentTasks.push({
      ...owned, id: eligibleId, status: 'failed', progress: 30, retryCount: 0, error: '[retryable] timeout',
      payload: owned.payload, idempotencyKey: 'eligible-private-key', createdAt: new Date(base - 3_000), updatedAt: new Date(base - 3_000),
    });
    db.agentTasks.push({
      ...owned, id: '00000000-0000-4000-8000-000000000961', status: 'failed', progress: 30, retryCount: 0,
      error: '[retryable] malformed', payload: { query: 'malformed private payload', target: { kind: 'personal' } }, idempotencyKey: 'malformed-private-key',
      createdAt: new Date(base + 40_000), updatedAt: new Date(base + 40_000),
    });
    const revokedWorkspaceId = '00000000-0000-4000-8000-000000000962';
    const revokedRoId = '00000000-0000-4000-8000-000000000963';
    const revokedSessionId = '00000000-0000-4000-8000-000000000964';
    db.workspaces.push({ id: revokedWorkspaceId, type: 'team', ownerId: db.users[0].id, name: 'Revoked', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.researchObjects.push({ id: revokedRoId, workspaceId: revokedWorkspaceId, createdBy: db.users[0].id, title: 'Revoked', status: 'draft', visibility: 'private', version: 1, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() });
    db.agentSessions.push({ id: revokedSessionId, userId: db.users[0].id, researchObjectId: revokedRoId, kind: 'retrieval', title: '', status: 'active', idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() });
    db.agentTasks.push({
      ...owned, id: '00000000-0000-4000-8000-000000000965', sessionId: revokedSessionId, status: 'failed', progress: 30,
      retryCount: 0, error: '[retryable] revoked', payload: owned.payload, idempotencyKey: 'revoked-private-key',
      createdAt: new Date(base + 39_000), updatedAt: new Date(base + 39_000),
    });
    const eligibleResponse = await app.inject({
      method: 'GET', url: '/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal', cookies: { openscience_session: token },
    });
    expect(eligibleResponse.json().tasks).toEqual([expect.objectContaining({ id: eligibleId, status: 'failed', canRetry: true })]);
    expect(JSON.stringify(eligibleResponse.json())).not.toMatch(/malformed private payload|revoked-private-key|eligible-private-key|payload|idempotencyKey/);
    await app.close();
  });

  it('retries one failed source task in place without another task or debit and rejects unsafe retry states', async () => {
    const { app, db, token, csrfToken, csrfCookie } = await makeApp();
    const write = (url: string, idempotencyKey?: string, payload?: unknown) => app.inject({
      method: 'POST', url, cookies: { openscience_session: token, _csrf: csrfCookie },
      headers: { 'x-csrf-token': csrfToken, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      ...(payload === undefined ? {} : { payload }),
    });
    const acquired = await write('/literature/acquisitions', 'retry-owned-task', { query: 'Paper', identifier: '10.1038/nature12373', target: { kind: 'personal' } });
    const taskId = acquired.json().task.id as string;
    const task = db.agentTasks.find((row) => row.id === taskId)!;
    Object.assign(task, { status: 'failed', progress: 35, result: { stale: true }, error: '[retryable] upstream timeout' });
    const retryView = await app.inject({ method: 'GET', url: `/agent/tasks/${taskId}`, cookies: { openscience_session: token } });
    expect(retryView.json().task).toMatchObject({ id: taskId, canRetry: true });
    const taskCount = db.agentTasks.length;
    const debitCount = db.usageLedger.filter((entry) => entry.resource === 'ai_credit' && entry.delta < 0).length;

    const concurrent = await Promise.all([write(`/agent/tasks/${taskId}/retry`), write(`/agent/tasks/${taskId}/retry`)]);
    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const retried = concurrent.find(({ statusCode }) => statusCode === 200)!;
    expect(retried.json().task).toMatchObject({ id: taskId, status: 'pending', progress: 0, retryCount: 1, canRetry: false, result: null, error: null });
    expect(db.agentTasks).toHaveLength(taskCount);
    expect(db.usageLedger.filter((entry) => entry.resource === 'ai_credit' && entry.delta < 0)).toHaveLength(debitCount);
    Object.assign(task, { status: 'running' });
    expect((await write(`/agent/tasks/${taskId}/retry`)).statusCode).toBe(409);
    Object.assign(task, { status: 'failed', error: '[retryable] failed again' });
    expect((await write(`/agent/tasks/${taskId}/retry`)).statusCode).toBe(409);

    const blockedAcquisition = await write('/literature/acquisitions', 'blocked-owned-task', { query: 'Blocked', identifier: '10.1038/nature12373', target: { kind: 'personal' } });
    const blockedId = blockedAcquisition.json().task.id as string;
    Object.assign(db.agentTasks.find((row) => row.id === blockedId)!, { status: 'failed', error: '[blocked] policy denied' });
    expect((await write(`/agent/tasks/${blockedId}/retry`)).statusCode).toBe(409);
    await app.close();
  });
});
