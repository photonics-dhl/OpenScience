import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { buildApp } from '../src/app';

/**
 * P1A-4 集成测试（云上执行）：真实 PG/Redis。
 * 前置：dev 栈已起（stack:up）且迁移 1-3 已 deploy（node packages/database/dist/migrate-cli.js deploy）。
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

describe('P1A-4 Workspace 集成（云上）', () => {
  it('全流程：验证邮箱自动建 personal → 建 team → 邀请 → accept → 转让 → 退出', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner@example.com');
    const authedOwner = { cookies: { openscience_session: ownerCookie } };

    // 邮箱验证通过 → 自动拥有 personal workspace
    const list = await app.inject({ method: 'GET', url: '/workspaces', ...authedOwner });
    expect(list.statusCode).toBe(200);
    const personal = list.json().workspaces.find((w: { type: string }) => w.type === 'personal');
    expect(personal).toBeDefined();
    expect(personal.role).toBe('owner');

    // 建 team 并邀请第二用户
    const team = await app.inject({ method: 'POST', url: '/workspaces', ...authedOwner, payload: { name: 'Cloud Lab' } });
    expect(team.statusCode).toBe(201);
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      ...authedOwner,
      payload: { email: 'member@example.com', role: 'author' },
    });
    expect(invited.statusCode).toBe(202);

    const memberCookie = await registerAndVerify(app, 'member@example.com');
    const authedMember = { cookies: { openscience_session: memberCookie } };
    const accepted = await app.inject({
      method: 'POST',
      url: `/workspaces/invitations/${invited.json().invitationId}/accept`,
      ...authedMember,
    });
    expect(accepted.statusCode).toBe(201);

    // 转让所有权 → 原 owner 退出
    const memberId = accepted.json().userId;
    const transferred = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/transfer`,
      ...authedOwner,
      payload: { newOwnerId: memberId },
    });
    expect(transferred.statusCode).toBe(204);
    const left = await app.inject({ method: 'POST', url: `/workspaces/${teamId}/leave`, ...authedOwner });
    expect(left.statusCode).toBe(204);
    const members = await app.inject({ method: 'GET', url: `/workspaces/${teamId}/members`, ...authedMember });
    expect(members.json().members).toHaveLength(1);
    expect(members.json().members[0]).toMatchObject({ userId: memberId, role: 'owner' });
    await app.close();
  });

  it('越权负向：非成员访问他人空间 → 404；无 session → 401', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner2@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'Private Lab' },
    });
    const outsiderCookie = await registerAndVerify(app, 'outsider@example.com');
    const detail = await app.inject({
      method: 'GET',
      url: `/workspaces/${team.json().id}`,
      cookies: { openscience_session: outsiderCookie },
    });
    expect(detail.statusCode).toBe(404);
    expect(detail.json().error.code).toBe('WORKSPACE_NOT_FOUND');
    const anon = await app.inject({ method: 'GET', url: `/workspaces/${team.json().id}` });
    expect(anon.statusCode).toBe(401);
    await app.close();
  });

  it('并发双 accept：恰好产生一条 membership（真实 PG 竞态路径）', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner3@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'Race Lab' },
    });
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      cookies: { openscience_session: ownerCookie },
      payload: { email: 'race@example.com', role: 'viewer' },
    });
    const raceCookie = await registerAndVerify(app, 'race@example.com');
    const invitationId = invited.json().invitationId;
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/workspaces/invitations/${invitationId}/accept`, cookies: { openscience_session: raceCookie } }),
      app.inject({ method: 'POST', url: `/workspaces/invitations/${invitationId}/accept`, cookies: { openscience_session: raceCookie } }),
    ]);
    for (const r of [r1, r2]) expect([201, 404]).toContain(r.statusCode);
    const raceUser = await prisma.user.findUnique({ where: { email: 'race@example.com' } });
    const rows = await prisma.membership.findMany({ where: { workspaceId: teamId, userId: raceUser!.id } });
    expect(rows).toHaveLength(1);
    await app.close();
  });
});

describe('P1A-5 RBAC 守卫（云上）', () => {
  it('viewer 成员 PATCH → 403；非法 body 也先 403（守卫先于 body 校验）', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'rbac-owner@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'RBAC Lab' },
    });
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      cookies: { openscience_session: ownerCookie },
      payload: { email: 'rbac-viewer@example.com', role: 'viewer' },
    });
    const viewerCookie = await registerAndVerify(app, 'rbac-viewer@example.com');
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
    expect(denied.json().error.code).toBe('FORBIDDEN');

    const deniedBadBody = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${teamId}`,
      cookies: { openscience_session: viewerCookie },
      payload: {},
    });
    expect(deniedBadBody.statusCode).toBe(403);
    await app.close();
  });

  it('非成员 PATCH → 404；无 session PATCH → 401', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'rbac-owner2@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'RBAC Lab 2' },
    });
    const outsiderCookie = await registerAndVerify(app, 'rbac-outsider@example.com');
    const res404 = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${team.json().id}`,
      cookies: { openscience_session: outsiderCookie },
      payload: { name: 'x' },
    });
    expect(res404.statusCode).toBe(404);
    expect(res404.json().error.code).toBe('WORKSPACE_NOT_FOUND');
    const res401 = await app.inject({ method: 'PATCH', url: `/workspaces/${team.json().id}`, payload: { name: 'x' } });
    expect(res401.statusCode).toBe(401);
    await app.close();
  });
});
