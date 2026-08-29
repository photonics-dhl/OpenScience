import { describe, expect, it } from 'vitest';
import { hashPassword, type AuthDeps } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

function makeFakeDeps() {
  const db: any = { users: [], invitations: [], emailVerifications: [], mailOutbox: [], signupChallenges: [], researchIdentityProfiles: [] };
  let seq = 0;
  const nextId = () => `id-${++seq}`;
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u: any) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(db.users.find((u: any) => u.id === where.id), data),
    },
    invitation: {
      findUnique: async ({ where }: any) => db.invitations.find((i: any) => i.code === where.code) ?? null,
      update: async ({ where, data }: any) =>
        Object.assign(db.invitations.find((i: any) => i.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.invitations) {
          if (i.id === where.id && (where.usedBy === undefined || i.usedBy === where.usedBy) && (where.revokedAt === undefined || i.revokedAt === where.revokedAt)) {
            Object.assign(i, data);
            count++;
          }
        }
        return { count };
      },
    },
    emailVerification: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), attempts: 0, lockedUntil: null, verifiedAt: null, createdAt: new Date(), ...data };
        db.emailVerifications.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.emailVerifications.filter((v: any) => v.userId === where.userId && v.verifiedAt === null)[0] ?? null,
      update: async ({ where, data }: any) =>
        Object.assign(db.emailVerifications.find((v: any) => v.id === where.id), data),
      updateMany: async () => ({ count: 0 }),
    },
    signupChallenge: {
      findFirst: async ({ where }: any) =>
        db.signupChallenges
          .filter((challenge: any) => challenge.email === where.email && challenge.consumedAt === null)
          .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), attempts: 0, lockedUntil: null, consumedAt: null, createdAt: new Date(), ...data };
        db.signupChallenges.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const challenge of db.signupChallenges) {
          if (challenge.id === where.id && (where.consumedAt === undefined || challenge.consumedAt === where.consumedAt)) {
            Object.assign(challenge, data);
            count++;
          }
        }
        return { count };
      },
    },
    researchIdentityProfile: {
      create: async ({ data }: any) => {
        if (db.researchIdentityProfiles.some((row: any) => row.userId === data.userId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const row = { id: nextId(), profileVersion: 1, acceptedSignals: [], rejectedSignals: [], ...data };
        db.researchIdentityProfiles.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => db.researchIdentityProfiles.find((row: any) => row.userId === where.userId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = db.researchIdentityProfiles.find((row: any) => row.userId === where.userId);
        if (existing) return Object.assign(existing, update);
        const row = { id: nextId(), profileVersion: 1, acceptedSignals: [], rejectedSignals: [], ...create };
        db.researchIdentityProfiles.push(row);
        return row;
      },
    },
    mailOutbox: { create: async ({ data }: any) => ({ id: nextId(), ...data }) },
    $transaction: async (fn: any) => fn(prisma),
  };
  const store = new Map<string, string>();
  const redis: any = {
    set: async (k: string, v: string) => void store.set(k, v),
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => void store.delete(k),
    expire: async () => 1,
  };
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const verified: Array<{ id: string; email: string; displayName: string }> = [];
  const deps: AuthDeps & { secureCookies: boolean } = {
    prisma,
    redis,
    mailer: { send: async (m: any) => void sent.push(m) },
    onEmailVerified: async (_tx, user) => void verified.push(user),
  };
  (deps as any).secureCookies = false;
  return { deps, db, sent, store, verified };
}

async function makeApp() {
  const fakes = makeFakeDeps();
  const app = await buildApp({ ...fakes.deps, cookieSecret: 'test-secret' });
  return { app, ...fakes };
}

describe('/auth routes', () => {
  it('request-signup-code accepts the web wrapper email-only payload', async () => {
    const { app, sent } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/request-signup-code',
      payload: { email: 'researcher@example.com' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it('request then confirm signup creates a verified session and invokes workspace provisioning', async () => {
    const { app, sent, verified, db } = await makeApp();
    const requested = await app.inject({
      method: 'POST',
      url: '/auth/request-signup-code',
      payload: { email: 'full-flow@example.com' },
    });
    expect(requested.statusCode).toBe(202);
    const code = sent[0].text.match(/(\d{6})/)?.[1];
    expect(code).toBeTruthy();

    const confirmed = await app.inject({
      method: 'POST',
      url: '/auth/confirm-signup',
      payload: {
        email: 'full-flow@example.com',
        code,
        password: 'passw0rd-x',
        displayName: 'Full Flow',
        researchIdentity: {
          identities: ['author', 'reviewer'],
          primaryIdentity: 'author',
          disciplines: ['physics'],
          methods: ['spectroscopy'],
          topics: ['ultrafast optics'],
          languages: ['zh'],
        },
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({ status: 'email_verified' });
    expect(confirmed.cookies.find((cookie) => cookie.name === 'openscience_session')).toBeDefined();
    expect(verified).toEqual([expect.objectContaining({ email: 'full-flow@example.com' })]);
    expect(db.researchIdentityProfiles).toEqual([
      expect.objectContaining({
        identities: ['author', 'reviewer'],
        primaryIdentity: 'author',
        userId: confirmed.json().userId,
      }),
    ]);
  });

  it('updates a migration-backfilled invited profile when confirming signup', async () => {
    const { app, db, sent } = await makeApp();
    db.users.push({ id: 'legacy-invited', email: 'legacy-confirm@example.com', passwordHash: 'old', displayName: 'Legacy', status: 'invited' });
    db.researchIdentityProfiles.push({
      id: 'profile-legacy', userId: 'legacy-invited', identities: ['reader'], primaryIdentity: 'reader',
      disciplines: [], methods: [], topics: [], languages: [], acceptedSignals: [], rejectedSignals: [], profileVersion: 1,
    });
    await app.inject({ method: 'POST', url: '/auth/request-signup-code', payload: { email: 'legacy-confirm@example.com' } });
    const code = sent[0].text.match(/(\d{6})/)?.[1];
    const confirmed = await app.inject({
      method: 'POST', url: '/auth/confirm-signup', payload: {
        email: 'legacy-confirm@example.com', code, password: 'passw0rd-x', displayName: 'Legacy Updated',
        researchIdentity: { identities: ['author'], primaryIdentity: 'author', disciplines: ['physics'], methods: [], topics: [], languages: ['en'] },
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(db.researchIdentityProfiles).toHaveLength(1);
    expect(db.researchIdentityProfiles[0]).toMatchObject({ userId: 'legacy-invited', primaryIdentity: 'author', disciplines: ['physics'] });
  });

  it('maps cross-field identity validation failures to 400', async () => {
    const { app, sent } = await makeApp();
    await app.inject({ method: 'POST', url: '/auth/request-signup-code', payload: { email: 'invalid-profile@example.com' } });
    const code = sent[0].text.match(/(\d{6})/)?.[1];
    const response = await app.inject({
      method: 'POST', url: '/auth/confirm-signup', payload: {
        email: 'invalid-profile@example.com', code, password: 'passw0rd-x', displayName: 'Invalid',
        researchIdentity: { identities: ['reader'], primaryIdentity: 'author', disciplines: [], methods: [], topics: [], languages: [] },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_IDENTITY_PROFILE');
  });

  it('rejects invalid register bodies with 400 VALIDATION_ERROR', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode: 'X', email: 'not-an-email', password: 'short', displayName: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('register → verify-email sets session cookie → /me works → logout kills it', async () => {
    const { app, db, sent } = await makeApp();
    db.invitations.push({
      id: 'inv-1', code: 'CODE1234567890ABCDEF', email: null, createdBy: 'test',
      usedBy: null, usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode: 'CODE1234567890ABCDEF', email: 'e2e@example.com', password: 'passw0rd-x', displayName: 'E2E' },
    });
    expect(reg.statusCode).toBe(201);
    const code = sent[0].text.match(/(\d{6})/)![1];
    const ver = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email: 'e2e@example.com', code } });
    expect(ver.statusCode).toBe(200);
    expect(db.researchIdentityProfiles).toEqual([expect.objectContaining({ userId: ver.json().userId, primaryIdentity: 'reader' })]);
    const cookie = ver.cookies.find((c) => c.name === 'openscience_session');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie!.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('e2e@example.com');

    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { openscience_session: cookie!.value } });
    expect(out.statusCode).toBe(204);
    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie!.value } });
    expect(meAfter.statusCode).toBe(401);
  });

  it('logout without a cookie still returns 204', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(204);
  });

  it('/me without cookie is 401 with the unified body', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'SESSION_INVALID', message: '未登录', requestId: expect.any(String) } });
  });

  it('login unknown email vs wrong password: identical status and body', async () => {
    const { app, db } = await makeApp();
    db.users.push({
      id: 'u1', email: 'u@example.com', passwordHash: await hashPassword('passw0rd-x'),
      displayName: 'U', status: 'email_verified', createdAt: new Date(), updatedAt: new Date(),
    });
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ghost@example.com', password: 'passw0rd-x' } });
    const wrongPw = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'u@example.com', password: 'wr0ngpass' } });
    expect(unknown.statusCode).toBe(401);
    expect(wrongPw.statusCode).toBe(401);
    const unknownBody = unknown.json();
    const wrongPwBody = wrongPw.json();
    expect(unknownBody.error.requestId).toEqual(expect.any(String));
    expect(wrongPwBody.error.requestId).toEqual(expect.any(String));
    // 反枚举断言忽略逐请求变化的 requestId，其余字段必须完全一致
    delete unknownBody.error.requestId;
    delete wrongPwBody.error.requestId;
    expect(unknownBody).toEqual(wrongPwBody);
  });

  it('resend-code returns the same 202 for unknown emails', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/resend-code', payload: { email: 'ghost@example.com' } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
  });
});
