import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { assignPublicId, createPersonalWorkspace, computeContentSha256 } from '@openscience/domain';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-6 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起（含 minio + bucket openscience-dev），迁移 10 已 deploy。
 * 用例：ID 生成 / ID 不复用 / 版本 ID 递增 / 公开 URL 匿名访问 / private 404。
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

async function getUser(email: string) {
  return prisma.user.findUnique({ where: { email } })!;
}

afterAll(async () => {
  await prisma.publication.deleteMany();
  await prisma.identifier.deleteMany();
  await prisma.manifestEntry.deleteMany();
  await prisma.versionManifest.deleteMany();
  await prisma.version.deleteMany();
  await prisma.changeSet.deleteMany();
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

describe('P1B-6 /research 公开 URL + 标识（云上）', () => {
  it('assignPublicId → publicId + publicVersionId，公开 URL 匿名可读', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'i1@example.com');
    const user = await getUser('i1@example.com');
    const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
    // 建 RO + 改 public + commit v1
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws!.id, title: 'Public RO' } });
    const ro = createRo.json().researchObject;
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1 } });
    const v1 = commit.json().commit.versionId;
    // 设为 public
    await app.inject({ method: 'PATCH', url: `/research-objects/${ro.id}`, cookies: { openscience_session: cookie }, payload: { version: 2, visibility: 'public' } });
    // 分配公开 ID（模拟发布动作，P1B-7 实装发布时触发）
    const idResult = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    expect(idResult.publicId).toMatch(/^OSR-\d{4}-\d{6}$/);

    // 匿名访问
    const roView = await app.inject({ method: 'GET', url: `/research/${idResult.publicId}` });
    expect(roView.statusCode).toBe(200);
    expect(roView.json().research.title).toBe('Public RO');

    const vView = await app.inject({ method: 'GET', url: `/research/${idResult.publicId}/v/1` });
    expect(vView.statusCode).toBe(200);
    expect(vView.json().version.publicVersionId).toBe(`${idResult.publicId}-v1`);
    void v1;
    await app.close();
  });

  it('ID 永不复用：同 RO 两次分配 → 同 publicId，不新增 Identifier', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'i2@example.com');
    const user = await getUser('i2@example.com');
    const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws!.id, title: 'Idem RO' } });
    const ro = createRo.json().researchObject;

    const first = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    const second = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 2, prefix: 'OSR' });
    expect(second.publicId).toBe(first.publicId);
    expect(second.publicVersionId).toBe(`${first.publicId}-v2`);
    const idCount = await prisma.identifier.count({ where: { publicId: first.publicId } });
    expect(idCount).toBe(1);
    await app.close();
  });

  it('版本 ID 递增：v1/v2 → -v1/-v2', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'i3@example.com');
    const user = await getUser('i3@example.com');
    const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws!.id, title: 'Versions' } });
    const ro = createRo.json().researchObject;

    const a = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    const b = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 2, prefix: 'OSR' });
    expect(a.publicVersionId).toBe(`${a.publicId}-v1`);
    expect(b.publicVersionId).toBe(`${a.publicId}-v2`);
    await app.close();
  });

  it('private RO → /research 404（匿名不可见）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'i4@example.com');
    const user = await getUser('i4@example.com');
    const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws!.id, title: 'Private' } });
    const ro = createRo.json().researchObject;
    const idResult = await assignPublicId({ prisma, storage, mailer }, { userId: user!.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });

    const view = await app.inject({ method: 'GET', url: `/research/${idResult.publicId}` });
    expect(view.statusCode).toBe(404);
    await app.close();
  });

  it('contentSha256 聚合 + Publication 只追加', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'i5@example.com');
    const user = await getUser('i5@example.com');
    const ws = await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } });
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: ws!.id, title: 'Hash' } });
    const ro = createRo.json().researchObject;
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1 } });
    const v1 = commit.json().commit.versionId;

    const manifest = await prisma.versionManifest.findUnique({ where: { versionId: v1 }, include: { entries: true } });
    const sha = computeContentSha256((manifest?.entries ?? []).map((e) => ({ logicalPath: e.logicalPath, blobSha256: e.blobSha256 })));
    // 发布记录（§6.2 只追加）
    await prisma.publication.create({
      data: { versionId: v1, publicVersionId: `${ro.id}-v1`, contentSha256: sha, publishedAt: new Date() },
    });
    const pubs = await prisma.publication.findMany({ where: { versionId: v1 } });
    expect(pubs).toHaveLength(1);
    expect(pubs[0].contentSha256).toBe(sha);
    // 重复发布 → 追加（不覆盖）
    await prisma.publication.create({
      data: { versionId: v1, publicVersionId: `${ro.id}-v1-again`, contentSha256: sha, publishedAt: new Date() },
    });
    expect(await prisma.publication.count({ where: { versionId: v1 } })).toBe(2);
    await app.close();
  });
});
