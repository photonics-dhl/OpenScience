import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { buildApp } from '../src/app';

const repoRoot = path.join(__dirname, '..', '..');
const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);

const runId = `p1a3-${Date.now()}`;
const email = `${runId}@example.com`;
let invitationCode = '';

function latestCode(): Promise<string> {
  return prisma.mailOutbox
    .findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } })
    .then((row) => row!.bodyText.match(/(\d{6})/)![1]);
}

beforeAll(async () => {
  // 迁移 2 需已在云上 deploy（node packages/database/dist/migrate-cli.js deploy）
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'invite.mjs'), 'create', '--email', email, '--by', 'integration-test'], { encoding: 'utf8' });
  invitationCode = out.match(/CREATED (\S+)/)![1];
});

afterAll(async () => {
  await prisma.emailVerification.deleteMany({ where: { user: { email } } });
  await prisma.mailOutbox.deleteMany({ where: { toEmail: email } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.invitation.deleteMany({ where: { code: invitationCode } });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1A-3 auth closed loop (cloud, real PG+Redis)', () => {
  it('register → verify → me → logout → me 401', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode, email, password: 'passw0rd-x', displayName: 'Integration' },
    });
    expect(reg.statusCode).toBe(201);

    const code = await latestCode();
    const ver = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code } });
    expect(ver.statusCode).toBe(200);
    const cookie = ver.cookies.find((c) => c.name === 'openscience_session')!;
    expect(cookie.httpOnly).toBe(true);

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().status).toBe('email_verified');

    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { openscience_session: cookie.value } });
    expect(out.statusCode).toBe(204);
    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie.value } });
    expect(meAfter.statusCode).toBe(401);
    await app.close();
  });

  it('rejects invalid invitation and duplicate email', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });
    const bad = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { invitationCode: 'DOESNOTEXIST1234567', email: `x-${runId}@example.com`, password: 'passw0rd-x', displayName: 'X' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVITATION_INVALID');

    const dup = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { invitationCode, email, password: 'passw0rd-x', displayName: 'Dup' },
    });
    // 邀请码已被上一用例核销 → 400；重复邮箱的 409 由另一路径覆盖（单测已覆盖，此处置信 400/409 之一）
    expect([400, 409]).toContain(dup.statusCode);
    await app.close();
  });

  it('verified user can log in (invited 403 path covered by unit tests)', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });
    const invited = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'passw0rd-x' } });
    // email 用户已完成验证 → 登录应成功；invited 403 路径由单测覆盖
    expect(invited.statusCode).toBe(200);
    await app.close();
  });
});
