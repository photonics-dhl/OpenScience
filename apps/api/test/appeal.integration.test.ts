import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1D-7 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 申诉创建 → Moderator 队列 → 处理 → 审计 + 通知（§11.3/§3.3/§16/§17）。
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
  const m = out.match(/[A-Z2-9]{20}/);
  return m![0];
}
async function latestOutboxCode(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } });
  return mail!.bodyText.match(/\d{6}/)![0];
}
async function registerAndVerify(app: Awaited<ReturnType<typeof makeApp>>, email: string): Promise<string> {
  const code = createInviteCode(email);
  await app.inject({ method: 'POST', url: '/auth/register', payload: { invitationCode: code, email, password: 'Passw0rd123', displayName: 'x' } });
  const vc = await latestOutboxCode(email);
  await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code: vc } });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'Passw0rd123' } });
  return login.cookies.find((c) => c.name === 'openscience_session')!.value;
}
async function getPersonalWorkspace(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  return (await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } }))!.id;
}

afterAll(async () => {
  await prisma.appeal.deleteMany();
  await prisma.aiReview.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.licenseAssignment.deleteMany();
  await prisma.manifestEntry.deleteMany();
  await prisma.versionManifest.deleteMany();
  await prisma.version.deleteMany();
  await prisma.commit.deleteMany();
  await prisma.branch.updateMany({ data: { headCommitId: null } });
  await prisma.branch.deleteMany();
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

describe('P1D-7 审核申诉与 Moderator 队列（云上，迁移 17）', () => {
  it('申诉创建 → appellant 仅自己 → moderator 处理 → 审计 + 通知（§11.3/§3.3/§17）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'ap7@example.com');
    const wsId = await getPersonalWorkspace('ap7@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'AP7 RO' } });
    const ro = createRo.json().researchObject;
    // commit 无许可 → review blocked
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    const versionId = commit.json().commit.versionId;
    const review = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(review.json().review.status).toBe('blocked');

    // 提交申诉（§11.3）
    const appeal = await app.inject({ method: 'POST', url: '/appeals', cookies: { openscience_session: cookie }, payload: { versionId, reason: '许可其实已选，请人工复核' } });
    expect(appeal.statusCode).toBe(201);
    const appealId = appeal.json().appeal.id;

    // appeal.created 通知（§16）
    const notif = await prisma.notification.findFirst({ where: { type: 'appeal.created' } });
    expect(notif?.payload).toMatchObject({ appealId });

    // appellant 仅自己
    const mine = await app.inject({ method: 'GET', url: '/appeals', cookies: { openscience_session: cookie } });
    expect(mine.json().appeals).toHaveLength(1);

    // 普通用户（另一注册）看不到
    const cookieB = await registerAndVerify(app, 'ap7b@example.com');
    const other = await app.inject({ method: 'GET', url: '/appeals', cookies: { openscience_session: cookieB } });
    expect(other.json().appeals).toHaveLength(0);

    // 提升为 moderator（§3.3）
    const user = await prisma.user.findUnique({ where: { email: 'ap7b@example.com' } });
    await prisma.user.update({ where: { id: user!.id }, data: { platformRole: 'moderator' } });
    const queue = await app.inject({ method: 'GET', url: '/appeals', cookies: { openscience_session: cookieB } });
    expect(queue.json().appeals.some((a: { id: string }) => a.id === appealId)).toBe(true);

    // moderator 处理（§11.3 人工结果 + 审计）
    const resolve = await app.inject({ method: 'POST', url: `/appeals/${appealId}/resolve`, cookies: { openscience_session: cookieB }, payload: { decision: 'approved', note: '人工复核：许可已选，通过' } });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().appeal.status).toBe('resolved');
    expect(resolve.json().appeal.resolution).toMatchObject({ decision: 'approved' });
    const audit = await prisma.auditLog.count({ where: { action: 'appeal.resolve', targetId: appealId } });
    expect(audit).toBe(1);
    await app.close();
  });

  it('非 blocked 版本申诉 → 409；普通用户 resolve → 403（§11.3/§3.3）', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'ap8a@example.com');
    const cookieB = await registerAndVerify(app, 'ap8b@example.com');
    const wsA = await getPersonalWorkspace('ap8a@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'AP8 RO' } });
    const ro = createRo.json().researchObject;
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookieA }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookieA }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    const versionId = commit.json().commit.versionId;
    // passed 版本
    const review = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookieA } });
    expect(review.json().review.status).toBe('passed');

    // 非 blocked → 409
    const appeal = await app.inject({ method: 'POST', url: '/appeals', cookies: { openscience_session: cookieA }, payload: { versionId, reason: 'x' } });
    expect(appeal.statusCode).toBe(409);
    expect(appeal.json().error.code).toBe('REVIEW_NOT_BLOCKED');

    // 无许可 RO → blocked 版本 → 申诉 → 普通用户 resolve 403
    const createRo2 = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'AP8B RO' } });
    const ro2 = createRo2.json().researchObject;
    const commit2 = await app.inject({ method: 'POST', url: `/research-objects/${ro2.id}/commits`, cookies: { openscience_session: cookieA }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    const v2 = commit2.json().commit.versionId;
    const review2 = await app.inject({ method: 'POST', url: `/versions/${v2}/review`, cookies: { openscience_session: cookieA } });
    expect(review2.json().review.status).toBe('blocked');
    const appeal2 = await app.inject({ method: 'POST', url: '/appeals', cookies: { openscience_session: cookieA }, payload: { versionId: v2, reason: 'y' } });
    const appeal2Id = appeal2.json().appeal.id;
    const resolve403 = await app.inject({ method: 'POST', url: `/appeals/${appeal2Id}/resolve`, cookies: { openscience_session: cookieB }, payload: { decision: 'approved', note: 'x' } });
    expect(resolve403.statusCode).toBe(403);
    await app.close();
  });
});
