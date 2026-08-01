import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

async function setup() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'test-secret', secureCookies: false });
  const loginAs = async (userId: string, email: string): Promise<string> => {
    db.users.push({ id: userId, email, displayName: 'User', passwordHash: 'x', status: 'email_verified', createdAt: new Date(), updatedAt: new Date() });
    return createSession(redis, { userId, status: 'email_verified' });
  };
  const authed = (token: string) => ({ cookies: { openscience_session: token } });
  const createTeam = async (token: string): Promise<string> => {
    const res = await app.inject({ method: 'POST', url: '/workspaces', ...authed(token), payload: { name: 'Lab' } });
    return res.json().id;
  };
  return { app, db, authed, loginAs, createTeam };
}

describe('P1A-5 workspace 授权守卫', () => {
  it('viewer 带非法 body PATCH → 403（守卫先于 body 校验）', async () => {
    const { app, db, authed, loginAs, createTeam } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(t1);
    db.memberships.push({ id: 'm-v', workspaceId: id, userId: U2, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, ...authed(t2), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('非成员 PATCH → 404 WORKSPACE_NOT_FOUND', async () => {
    const { app, authed, loginAs, createTeam } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(t1);
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, ...authed(t2), payload: { name: 'X' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('无 session PATCH → 401 SESSION_INVALID', async () => {
    const { app, loginAs, createTeam } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(t1);
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_INVALID');
  });

  it('非法 uuid 路径参数 → 400（zod 在守卫内先行校验，不落到 prisma）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const res = await app.inject({ method: 'PATCH', url: '/workspaces/not-a-uuid', ...authed(t1), payload: { name: 'X' } });
    expect(res.statusCode).toBe(400);
  });

  it('maintainer PATCH → 200（守卫与 domain 双层放行）', async () => {
    const { app, db, authed, loginAs, createTeam } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(t1);
    db.memberships.push({ id: 'm-m', workspaceId: id, userId: U2, role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, ...authed(t2), payload: { name: 'Renamed' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renamed');
  });
});
