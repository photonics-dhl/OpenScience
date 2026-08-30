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
  db.workspaces.push({ id: 'workspace-personal', type: 'personal', ownerId: user.id, name: 'Personal', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'membership-personal', workspaceId: 'workspace-personal', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
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
    expect(response.json()).toMatchObject({ researchObject: { id: expect.any(String) }, session: { id: expect.any(String) }, task: { kind: 'source.retrieve' } });
    expect(db.agentTasks[0]?.payload).toEqual({ query: 'attosecond dynamics', providers: ['scansci'], limit: 1, includeFullText: true, identifier: '10.1038/nature12373' });
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
    expect((await request({ query: 'x', target: { kind: 'research_object', researchObjectId: 'not-a-uuid' } }, { 'idempotency-key': 'invalid-target' })).statusCode).toBe(400);
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
});
