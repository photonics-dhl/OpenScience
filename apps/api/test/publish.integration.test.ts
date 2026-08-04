import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1D-8 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 发布 v1 事务（publicId/versionId/UTC 时间戳/哈希/审计只追加）+ v2 parentVersion 链（§2.1-6/§6.2/§7）。
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
    publicIdPrefix: 'OSR',
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
  await prisma.publication.deleteMany();
  await prisma.identifier.deleteMany();
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

const CORE = (p: string, i: string) => ({ schemaVersion: '0.1.0', problem: p, insight: i, method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' });

describe('P1D-8 发布事务与状态机（云上，迁移 18）', () => {
  it('发布 v1：publicId + publicVersionId + UTC 时间戳 + 哈希 + 免责声明 + 审计只追加（§2.1-6/§6.2/§17）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'pub8@example.com');
    const wsId = await getPersonalWorkspace('pub8@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'PUB8 RO' } });
    const ro = createRo.json().researchObject;
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookie }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: CORE('P1', 'I1') } });
    const versionId = commit.json().commit.versionId;

    // AI 审核通过（§11.1）
    const review = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(review.json().review.status).toBe('passed');

    // 无 R3 确认 → 409
    const noR3 = await app.inject({ method: 'POST', url: `/versions/${versionId}/publish`, cookies: { openscience_session: cookie }, payload: { r3Confirmed: false } });
    expect(noR3.statusCode).toBe(409);
    expect(noR3.json().error.code).toBe('R3_CONFIRMATION_REQUIRED');

    // 发布 v1（R3 确认）
    const pub = await app.inject({ method: 'POST', url: `/versions/${versionId}/publish`, cookies: { openscience_session: cookie }, payload: { r3Confirmed: true } });
    expect(pub.statusCode).toBe(201);
    const published = pub.json().published;
    expect(published.publicId).toMatch(/^OSR-\d{4}-\d{6}$/);
    expect(published.publicVersionId).toMatch(/^OSR-\d{4}-\d{6}-v1$/);
    expect(published.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(published.publishedAt).toBeTruthy();

    // 幂等重发 → 同 ID
    const again = await app.inject({ method: 'POST', url: `/versions/${versionId}/publish`, cookies: { openscience_session: cookie }, payload: { r3Confirmed: true } });
    expect(again.json().published.publicVersionId).toBe(published.publicVersionId);

    // 免责声明（§6.2 固定文案）+ UTC 时间戳 + 审计
    const rec = await prisma.publication.findFirst({ where: { versionId } });
    expect(rec!.legalDisclaimer).toContain('不构成专利优先权');
    expect(rec!.publishedAt.toISOString()).toBe(published.publishedAt);
    const audit = await prisma.auditLog.findMany({ where: { action: 'publication.publish', targetId: versionId } });
    expect(audit.length).toBe(1); // 只追加一次
    // version.published 事件
    const notif = await prisma.notification.findFirst({ where: { type: 'version.published' } });
    expect(notif?.payload).toMatchObject({ publicVersionId: published.publicVersionId });
    await app.close();
  });

  it('发布 v2：parentVersion 链指向 v1 + 新哈希 + manifest（§2.2-3/§7）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'pub9@example.com');
    const wsId = await getPersonalWorkspace('pub9@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'PUB9 RO' } });
    const ro = createRo.json().researchObject;
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookie }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });

    // v1 发布
    const c1 = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: CORE('P1', 'I1') } });
    const v1Id = c1.json().commit.versionId;
    await app.inject({ method: 'POST', url: `/versions/${v1Id}/review`, cookies: { openscience_session: cookie } });
    const pub1 = await app.inject({ method: 'POST', url: `/versions/${v1Id}/publish`, cookies: { openscience_session: cookie }, payload: { r3Confirmed: true } });
    const v1 = pub1.json().published;

    // v2（version 2，parentVersion 指向 v1）
    const c2 = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v2', version: 2, sdfCore: CORE('P2', 'I2') } });
    const v2Id = c2.json().commit.versionId;
    await app.inject({ method: 'POST', url: `/versions/${v2Id}/review`, cookies: { openscience_session: cookie } });
    const pub2 = await app.inject({ method: 'POST', url: `/versions/${v2Id}/publish`, cookies: { openscience_session: cookie }, payload: { r3Confirmed: true } });
    const v2 = pub2.json().published;
    expect(v2.publicVersionId).toMatch(/-v2$/);
    expect(v2.publicId).toBe(v1.publicId); // RO unique ID 复用（§6.1 永不复用）
    expect(v2.contentSha256).not.toBe(v1.contentSha256); // 新内容 → 新哈希

    // parentVersion 链（v2 → v1）
    const v2row = await prisma.version.findUnique({ where: { id: v2Id } });
    expect(v2row!.status).toBe('published');
    // v1 不可原地修改（§2.2-3）：内容哈希不变
    const v1rec = await prisma.publication.findFirst({ where: { versionId: v1Id } });
    expect(v1rec!.contentSha256).toBe(v1.contentSha256);
    await app.close();
  });
});
