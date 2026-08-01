import { describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

const U1 = '11111111-1111-4111-8111-111111111111';
const ADMIN = '33333333-3333-4333-8333-333333333333';

async function setup() {
  const { prisma, db } = createFakePrisma();
  // fake 无 auditLog 模型：测试内最小附加（不改 shared fake，保持其余 147 用例零影响）
  const findMany = vi.fn().mockResolvedValue([]);
  (prisma as any).auditLog = { findMany };
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'test-secret', secureCookies: false });
  const loginAs = async (userId: string, email: string, platformRole = 'user'): Promise<string> => {
    db.users.push({
      id: userId, email, displayName: 'User', passwordHash: 'x', status: 'email_verified',
      platformRole, createdAt: new Date(), updatedAt: new Date(),
    });
    return createSession(redis, { userId, status: 'email_verified' });
  };
  return { app, findMany, loginAs, authed: (t: string) => ({ cookies: { openscience_session: t } }) };
}

describe('P1A-6 /admin/audit-logs platform_admin 守卫', () => {
  it('无 session cookie → 401 SESSION_INVALID', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/admin/audit-logs' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_INVALID');
  });

  it('platformRole=user → 403 FORBIDDEN', async () => {
    const { app, authed, loginAs } = await setup();
    const token = await loginAs(U1, 'a@example.com');
    const res = await app.inject({ method: 'GET', url: '/admin/audit-logs', ...authed(token) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('platform_admin → 200 { items, nextCursor }，query 过滤透传到 prisma.where', async () => {
    const { app, findMany, authed, loginAs } = await setup();
    const token = await loginAs(ADMIN, 'admin@example.com', 'platform_admin');
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs?action=auth.login&limit=10',
      ...authed(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], nextCursor: null });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: 'auth.login' }),
      take: 11,
    }));
  });
});
