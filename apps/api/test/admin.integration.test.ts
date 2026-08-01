import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { buildApp } from '../src/app';

/**
 * P1A-6 Task 8 集成测试（云上执行）：真实 PG/Redis，审计落 audit_logs 表。
 * 前置：dev 栈已起（stack:up）且迁移已 deploy（node packages/database/dist/migrate-cli.js deploy）。
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

/** 注册 + 邮箱验证，返回 session cookie 值。 */
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

afterAll(async () => {
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

describe('P1A-6 审计落表（云上）', () => {
  it('POST /workspaces 成功后 audit_logs 出现 workspace.create 行', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'audit-owner@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: cookie },
      payload: { name: 'Audit Lab' },
    });
    expect(team.statusCode).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'audit-owner@example.com' } });
    const row = await prisma.auditLog.findFirst({
      where: { action: 'workspace.create', actorId: user!.id, workspaceId: team.json().id },
    });
    expect(row).not.toBeNull();
    expect(row!.requestId).toBeTruthy();
    await app.close();
  });

  it('POST /auth/login 成功后出现 auth.login 行（无 metadata.reason）', async () => {
    const app = await makeApp();
    await registerAndVerify(app, 'audit-login@example.com');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'audit-login@example.com', password: 'Passw0rd123' },
    });
    expect(login.statusCode).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: 'audit-login@example.com' } });
    const row = await prisma.auditLog.findFirst({ where: { action: 'auth.login', actorId: user!.id } });
    expect(row).not.toBeNull();
    expect((row!.metadata as Record<string, unknown> | null)?.reason).toBeUndefined();
    await app.close();
  });

  it('viewer PATCH → 403 且出现 authz.deny 行（metadata.reason=role_insufficient）', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'audit-rbac-owner@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'Audit RBAC Lab' },
    });
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      cookies: { openscience_session: ownerCookie },
      payload: { email: 'audit-rbac-viewer@example.com', role: 'viewer' },
    });
    const viewerCookie = await registerAndVerify(app, 'audit-rbac-viewer@example.com');
    const accepted = await app.inject({
      method: 'POST',
      url: `/workspaces/invitations/${invited.json().invitationId}/accept`,
      cookies: { openscience_session: viewerCookie },
    });
    expect(accepted.statusCode).toBe(201);

    const denied = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${teamId}`,
      cookies: { openscience_session: viewerCookie },
      payload: { name: 'x' },
    });
    expect(denied.statusCode).toBe(403);
    const viewer = await prisma.user.findUnique({ where: { email: 'audit-rbac-viewer@example.com' } });
    const row = await prisma.auditLog.findFirst({
      where: { action: 'authz.deny', actorId: viewer!.id, workspaceId: teamId },
    });
    expect(row).not.toBeNull();
    expect(row!.metadata).toMatchObject({ reason: 'role_insufficient', requiredAction: 'workspace.update' });
    await app.close();
  });
});

describe('P1A-6 /admin/audit-logs 守卫（云上）', () => {
  it('无 session→401；普通用户→403；platform_admin→200 且 ?action= 过滤生效', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'audit-admin@example.com');
    const authed = { cookies: { openscience_session: cookie } };

    // 造一条 workspace.create 审计行供过滤断言
    const team = await app.inject({ method: 'POST', url: '/workspaces', ...authed, payload: { name: 'Admin Lab' } });
    expect(team.statusCode).toBe(201);

    // 无 session → 401
    const anon = await app.inject({ method: 'GET', url: '/admin/audit-logs' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.code).toBe('SESSION_INVALID');

    // platformRole=user → 403
    const denied = await app.inject({ method: 'GET', url: '/admin/audit-logs', ...authed });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');

    // 直改 platformRole → 200
    const user = await prisma.user.findUnique({ where: { email: 'audit-admin@example.com' } });
    await prisma.user.update({ where: { id: user!.id }, data: { platformRole: 'platform_admin' } });
    const list = await app.inject({ method: 'GET', url: '/admin/audit-logs', ...authed });
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.json().items)).toBe(true);
    expect(list.json().items.length).toBeGreaterThan(0);
    expect(list.json()).toHaveProperty('nextCursor');

    // ?action=workspace.create 过滤生效
    const filtered = await app.inject({ method: 'GET', url: '/admin/audit-logs?action=workspace.create', ...authed });
    expect(filtered.statusCode).toBe(200);
    const items = filtered.json().items as { action: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.action === 'workspace.create')).toBe(true);
    await app.close();
  });
});
