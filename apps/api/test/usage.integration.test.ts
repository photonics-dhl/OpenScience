import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { buildApp } from '../src/app';

/**
 * P1A-7 Task 7/8 集成测试（云上执行）：真实 PG/Redis，policy 读写 + credit 追加幂等 + /usage 聚合 + 审计。
 * 前置：dev 栈已起（stack:up）且迁移已 deploy（含 migration 6）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const repoRoot = path.resolve(__dirname, '../../..');

async function makeApp() {
  return buildApp({
    prisma,
    redis,
    mailer,
    audit: createPrismaAuditSink(prisma),
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: 'integration-secret',
    secureCookies: false,
  });
}

function createInviteCode(email: string): string {
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts/invite.mjs'), 'create', '--email', email], {
    encoding: 'utf8',
  });
  const match = out.match(/[A-Z2-9]{20}/);
  if (!match) throw new Error(`invite.mjs 输出未含邀请码: ${out}`);
  return match[0];
}

async function latestOutboxCode(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } });
  const match = mail?.bodyText.match(/\d{6}/);
  if (!match) throw new Error(`outbox 中未找到 ${email} 的验证码`);
  return match[0];
}

async function registerAndVerify(app: Awaited<ReturnType<typeof makeApp>>, email: string): Promise<string> {
  const code = createInviteCode(email);
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { invitationCode: code, email, password: 'Passw0rd123', displayName: email.split('@')[0] },
  });
  const verifyCode = await latestOutboxCode(email);
  const verified = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code: verifyCode } });
  expect(verified.statusCode).toBe(200);
  const cookie = verified.cookies.find((c) => c.name === 'openscience_session');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

async function promoteToAdmin(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  await prisma.user.update({ where: { id: user!.id }, data: { platformRole: 'platform_admin' } });
  return user!.id;
}

afterAll(async () => {
  await prisma.usageLedger.deleteMany();
  await prisma.quotaPolicy.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.mailOutbox.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1A-7 配额/账务（云上）', () => {
  it('admin PUT quota-policy → 列表可见 + 审计行', async () => {
    const app = await makeApp();
    const adminCookie = await registerAndVerify(app, 'usage-admin@example.com');
    await promoteToAdmin('usage-admin@example.com');
    const adminId = (await prisma.user.findUnique({ where: { email: 'usage-admin@example.com' } }))!.id;

    const put = await app.inject({
      method: 'PUT',
      url: '/admin/quota-policies/ai_credit',
      cookies: { openscience_session: adminCookie },
      payload: { scope: 'global', limit: 999 },
    });
    expect(put.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: '/admin/quota-policies',
      cookies: { openscience_session: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const found = list.json().policies.find((p: { resource: string }) => p.resource === 'ai_credit');
    expect(found).toMatchObject({ scope: 'global', limit: 999 });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'quota.policy.upsert', actorId: adminId } });
    expect(audit).not.toBeNull();
    expect((audit!.metadata as Record<string, unknown>).limit).toBe(999);
    await app.close();
  });

  it('admin POST credits 追加 → 余额聚合 + 幂等键重放不重复', async () => {
    const app = await makeApp();
    const adminCookie = await registerAndVerify(app, 'usage-admin2@example.com');
    await promoteToAdmin('usage-admin2@example.com');
    await registerAndVerify(app, 'usage-target@example.com');
    const target = (await prisma.user.findUnique({ where: { email: 'usage-target@example.com' } }))!.id;

    const topup = await app.inject({
      method: 'POST',
      url: '/admin/credits',
      cookies: { openscience_session: adminCookie },
      headers: { 'idempotency-key': 'topup-1' },
      payload: { userId: target, amount: 100, reason: '测试追加' },
    });
    expect(topup.statusCode).toBe(201);
    expect(topup.json()).toMatchObject({ balance: 100 });

    // 同 idempotency-key 重放 → 409（唯一约束），余额仍 100
    const replay = await app.inject({
      method: 'POST',
      url: '/admin/credits',
      cookies: { openscience_session: adminCookie },
      headers: { 'idempotency-key': 'topup-1' },
      payload: { userId: target, amount: 100, reason: '测试追加' },
    });
    expect(replay.statusCode).toBe(409);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'quota.credit.topup', targetId: target } });
    expect(audit).not.toBeNull();
    await app.close();
  });

  it('非 admin 访问 admin 端点 → 403', async () => {
    const app = await makeApp();
    const userCookie = await registerAndVerify(app, 'usage-nonadmin@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/admin/quota-policies',
      cookies: { openscience_session: userCookie },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('登录用户 /usage 返回 user + workspace 级限额与用量', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'usage-viewer@example.com');
    await prisma.quotaPolicy.create({
      data: { scope: 'global', scopeKey: null, resource: 'ai_credit', limitValue: 500 },
    });
    await prisma.usageLedger.create({
      data: { userId: (await prisma.user.findUnique({ where: { email: 'usage-viewer@example.com' } }))!.id, resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-08' },
    });
    const res = await app.inject({ method: 'GET', url: '/usage', cookies: { openscience_session: cookie } });
    expect(res.statusCode).toBe(200);
    const credit = res.json().user.find((i: { resource: string }) => i.resource === 'ai_credit');
    // limit 值受前序用例 PUT 影响（共享库），只断言存在性 + 本用例插入的 used=500
    expect(credit).toMatchObject({ used: 500, allowed: true });
    expect(typeof credit.limit).toBe('number');
    expect(credit.remaining).toBeGreaterThanOrEqual(0);
    // 已验证邮箱自动拥有个人 workspace → workspace 级数组非空
    expect(res.json().workspaces.length).toBeGreaterThan(0);
    await app.close();
  });

  it('未登录 /usage → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/usage' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
