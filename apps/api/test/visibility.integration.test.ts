import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-7 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起，迁移 11 已 deploy。
 * 用例：private 成员可见/非成员 404 / invite_only grant / 扩大阻断 / 缩小应用 / 绕过前端越权。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const storage = createStorageAdapter(storageConfigFromEnv());
const repoRoot = path.resolve(__dirname, '../../..');

async function makeApp() {
  return buildApp({
    prisma, redis, mailer, storage,
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

async function getUserId(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  return user!.id;
}

afterAll(async () => {
  await prisma.visibilityRequest.deleteMany();
  await prisma.visibilityGrant.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.identifier.deleteMany();
  await prisma.manifestEntry.deleteMany();
  await prisma.versionManifest.deleteMany();
  await prisma.version.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.branch.updateMany({ data: { headCommitId: null } }); // 迁移 13 锚点断开
  await prisma.commit.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.blob.deleteMany();
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

describe('P1B-7 可见性 + API 权限（云上）', () => {
  it('private RO：成员可见，非成员 404（跨 Workspace 越权）', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'va@example.com');
    const cookieB = await registerAndVerify(app, 'vb@example.com');
    const wsA = await getPersonalWorkspace('va@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Private RO' } });
    const ro = createRo.json().researchObject;

    const memberView = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookieA } });
    expect(memberView.statusCode).toBe(200);

    const outsiderView = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookieB } });
    expect(outsiderView.statusCode).toBe(404);
    await app.close();
  });

  it('invite_only：grant 命中可见，未 grant 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'vca@example.com');
    const cookieG = await registerAndVerify(app, 'vcb@example.com');
    const wsA = await getPersonalWorkspace('vca@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Invite Only' } });
    const ro = createRo.json().researchObject;
    const granteeId = await getUserId('vcb@example.com');

    // 改 invite_only（缩小/同级 → 直接应用，因 private→invite_only 是扩大！需先请求→但审批 Phase 1D）
    // 直接用 DB 改可见性模拟已批准（Phase 1D 前）
    await prisma.researchObject.update({ where: { id: ro.id }, data: { visibility: 'invite_only' } });

    // grant 前 → 404
    const before = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookieG } });
    expect(before.statusCode).toBe(404);

    // 授权
    const grant = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/visibility-grants`, cookies: { openscience_session: cookieA },
      payload: { granteeId },
    });
    expect(grant.statusCode).toBe(201);

    // grant 后 → 可见
    const after = await app.inject({ method: 'GET', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookieG } });
    expect(after.statusCode).toBe(200);
    await app.close();
  });

  it('扩大可见性（private→public）→ 阻断 + VisibilityRequest(pending)，RO 仍 private', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'vd@example.com');
    const ws = await getPersonalWorkspace('vd@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws, title: 'Expand' } });
    const ro = createRo.json().researchObject;

    const res = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/visibility`, cookies: { openscience_session: cookie },
      payload: { toVisibility: 'public' },
    });
    expect(res.statusCode).toBe(202); // 已记录请求
    expect(res.json().visibility.applied).toBe(false);
    const roAfter = await prisma.researchObject.findUnique({ where: { id: ro.id } });
    expect(roAfter!.visibility).toBe('private');
    const req = await prisma.visibilityRequest.findFirst({ where: { researchObjectId: ro.id } });
    expect(req).not.toBeNull();
    expect(req!.status).toBe('pending');
    await app.close();
  });

  it('缩小可见性（invite_only→private）→ 直接应用 200', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 've@example.com');
    const ws = await getPersonalWorkspace('ve@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws, title: 'Shrink' } });
    const ro = createRo.json().researchObject;
    await prisma.researchObject.update({ where: { id: ro.id }, data: { visibility: 'invite_only' } });

    const res = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/visibility`, cookies: { openscience_session: cookie },
      payload: { toVisibility: 'private' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().visibility.applied).toBe(true);
    const roAfter = await prisma.researchObject.findUnique({ where: { id: ro.id } });
    expect(roAfter!.visibility).toBe('private');
    await app.close();
  });

  it('绕过前端直调 API 越权（非成员 commit）→ 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'vf@example.com');
    const cookieB = await registerAndVerify(app, 'vg@example.com');
    const wsA = await getPersonalWorkspace('vf@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Bypass' } });
    const ro = createRo.json().researchObject;

    const commit = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookieB },
      payload: { message: 'hack', version: 1 },
    });
    expect(commit.statusCode).toBe(404); // 非成员 → 404
    await app.close();
  });
});
