import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { buildApp } from '../src/app';

/**
 * P1B-2 Task 7 集成测试（云上执行）：真 PG/Redis。
 * 迁移 7 后：创建私有 RO → SDF 详情 → 乐观锁 → 越权 404 → 审计。
 * 前置：dev 栈已起，迁移 7 已 deploy。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const repoRoot = path.resolve(__dirname, '../../..');

async function makeApp() {
  return buildApp({
    prisma, redis, mailer,
    audit: createPrismaAuditSink(prisma),
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: 'integration-secret',
    secureCookies: false,
  });
}

function createInviteCode(email: string): string {
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts/invite.mjs'), 'create', '--email', email], { encoding: 'utf8' });
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
  await app.inject({ method: 'POST', url: '/auth/register', payload: { invitationCode: code, email, password: 'Passw0rd123', displayName: email.split('@')[0] } });
  const verifyCode = await latestOutboxCode(email);
  const verified = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code: verifyCode } });
  expect(verified.statusCode).toBe(200);
  return verified.cookies.find((c) => c.name === 'openscience_session')!.value;
}

async function getPersonalWorkspace(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
  expect(ws).not.toBeNull();
  return ws!.id;
}

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.usageLedger.deleteMany();
  await prisma.quotaPolicy.deleteMany();
  await prisma.sdfNode.deleteMany();
  await prisma.sdfDocument.deleteMany();
  await prisma.researchObject.deleteMany();
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

describe('P1B-2 RO/SDF（云上）', () => {
  it('创建私有 RO → 详情含 SDF + 六 node + 审计', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'ro1@example.com');
    const wsId = await getPersonalWorkspace('ro1@example.com');

    const create = await app.inject({
      method: 'POST',
      url: '/research-objects',
      cookies: { openscience_session: cookie },
      payload: { workspaceId: wsId, title: 'My first RO' },
    });
    expect(create.statusCode).toBe(201);
    const ro = create.json().researchObject;
    expect(ro.status).toBe('draft');
    expect(ro.visibility).toBe('private');

    const detail = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().researchObject.sdf.nodes).toHaveLength(6);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'research_object.create', targetId: ro.id } });
    expect(audit).not.toBeNull();
    await app.close();
  });

  it('乐观锁：version 过期 PATCH → 409；正确 version 更新成功', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'ro2@example.com');
    const wsId = await getPersonalWorkspace('ro2@example.com');
    const create = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'v1' } });
    const ro = create.json().researchObject;

    const bad = await app.inject({
      method: 'PATCH', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookie },
      payload: { version: 99, title: 'x' },
    });
    expect(bad.statusCode).toBe(409);

    const good = await app.inject({
      method: 'PATCH', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookie },
      payload: { version: 1, title: 'v2' },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().researchObject.title).toBe('v2');
    expect(good.json().researchObject.version).toBe(2);
    await app.close();
  });

  it('SDF 读写：非法 core 400；合法更新成功', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'ro3@example.com');
    const wsId = await getPersonalWorkspace('ro3@example.com');
    const create = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'S' } });
    const ro = create.json().researchObject;

    // 非法（缺字段）
    const bad = await app.inject({
      method: 'PUT', url: `/sdf/${ro.id}`, cookies: { openscience_session: cookie },
      payload: { version: 1, core: { schemaVersion: '0.1.0', problem: 'only' } },
    });
    expect(bad.statusCode).toBe(400);

    // 合法
    const core = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };
    const good = await app.inject({
      method: 'PUT', url: `/sdf/${ro.id}`, cookies: { openscience_session: cookie },
      payload: { version: 1, core },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().sdf.core.problem).toBe('P');
    await app.close();
  });

  it('跨 workspace 越权 → 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'roa@example.com');
    const cookieB = await registerAndVerify(app, 'rob@example.com');
    const wsA = await getPersonalWorkspace('roa@example.com');
    const create = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Secret' } });
    const ro = create.json().researchObject;

    // B 用户访问 A 的 RO → 404（非成员）
    const res = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookieB } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('未登录 → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/research-objects', payload: { workspaceId: 'x', title: 'y' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
