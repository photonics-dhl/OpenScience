import { describe, expect, it } from 'vitest';
import { hashPassword, type AuthDeps } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

function makeFakeDeps() {
  const db: any = { users: [], invitations: [], emailVerifications: [], mailOutbox: [] };
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
  const deps: AuthDeps & { secureCookies: boolean } = {
    prisma,
    redis,
    mailer: { send: async (m: any) => void sent.push(m) },
  };
  (deps as any).secureCookies = false;
  return { deps, db, sent, store };
}

async function makeApp() {
  const fakes = makeFakeDeps();
  const app = await buildApp({ ...fakes.deps, cookieSecret: 'test-secret' });
  return { app, ...fakes };
}

describe('/auth routes', () => {
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
    expect(res.json()).toEqual({ error: { code: 'SESSION_INVALID', message: '未登录' } });
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
    expect(unknown.json()).toEqual(wrongPw.json());
  });

  it('resend-code returns the same 202 for unknown emails', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/resend-code', payload: { email: 'ghost@example.com' } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
  });
});
