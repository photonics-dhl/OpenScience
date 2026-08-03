import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, getBlobStorageKey, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-3 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起（含 minio + bucket openscience-dev），迁移 8 已 deploy。
 * 用例：上传→下载回环 / 重复上传一个 Blob / 配额超限 413 / MIME 检测失败允许 / 越权 404 / 未登录 401。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const storage = createStorageAdapter(storageConfigFromEnv());
const repoRoot = path.resolve(__dirname, '../../..');
/** 追踪本测试创建的 MinIO 对象（blob storageKey），afterAll 清理——DB 清行但对象存储持久化，否则跨运行 alreadyExists 误命中。 */
const createdBlobKeys = new Set<string>();

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

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 魔数
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

/** multipart 上传 helper：构造 file 字段（@fastify/multipart 需要 form-data）。 */
function uploadForm({ workspaceId, logicalPath, file, filename = 'file.bin' }: {
  workspaceId: string; logicalPath: string; file: Buffer; filename?: string;
}): { body: Buffer; contentType: string; boundary: string } {
  const boundary = `----integration${Date.now()}`;
  const parts = Buffer.concat([
    fieldPart(boundary, 'workspaceId', workspaceId),
    fieldPart(boundary, 'logicalPath', logicalPath),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: parts, contentType: `multipart/form-data; boundary=${boundary}`, boundary };
}

function fieldPart(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}

/** 上传成功 → 记录 blob storageKey 到清理集合（afterAll 删 MinIO 对象，防跨运行残留）。 */
async function upload(app: Awaited<ReturnType<typeof makeApp>>, cookie: string, form: ReturnType<typeof uploadForm>) {
  const res = await app.inject({
    method: 'POST', url: '/artifacts/upload', cookies: { openscience_session: cookie },
    payload: form.body, headers: { 'content-type': form.contentType },
  });
  if (res.statusCode === 201) createdBlobKeys.add(getBlobStorageKey(res.json().artifact.blobSha256));
  return res;
}

afterAll(async () => {
  // 先删 MinIO 对象（本测试创建的 blob），再清 DB——否则对象存储持久化导致跨运行 alreadyExists 误命中
  for (const key of createdBlobKeys) {
    try { await storage.deleteObject(key); } catch { /* 对象不存在无害 */ }
  }
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

describe('P1B-3 /artifacts（云上，真 MinIO）', () => {
  it('上传→下载回环：内容一致 + MIME 检测 + 元数据', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'art1@example.com');
    const wsId = await getPersonalWorkspace('art1@example.com');
    const form = uploadForm({ workspaceId: wsId, logicalPath: 'figures/fig1.png', file: PNG, filename: 'fig1.png' });

    const up = await upload(app, cookie, form);
    expect(up.statusCode).toBe(201);
    const artifact = up.json().artifact;
    expect(artifact.mimeType).toBe('image/png'); // 魔数检测
    expect(artifact.size).toBe(PNG.length);
    expect(artifact.alreadyExists).toBe(false);

    const dl = await app.inject({
      method: 'GET', url: `/artifacts/${artifact.artifactId}/download`, cookies: { openscience_session: cookie },
    });
    expect(dl.statusCode).toBe(200);
    expect(createHash('sha256').update(dl.rawPayload).digest('hex')).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(dl.headers['content-type']).toBe('image/png');
    await app.close();
  });

  it('重复上传相同内容 → 一个 Blob，两个 Artifact', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'art2@example.com');
    const wsId = await getPersonalWorkspace('art2@example.com');
    const formA = uploadForm({ workspaceId: wsId, logicalPath: 'a.png', file: PNG, filename: 'a.png' });
    const formB = uploadForm({ workspaceId: wsId, logicalPath: 'b.png', file: PNG, filename: 'b.png' });

    const upA = await upload(app, cookie, formA);
    const upB = await upload(app, cookie, formB);
    expect(upA.json().artifact.blobSha256).toBe(upB.json().artifact.blobSha256);
    expect(upB.json().artifact.alreadyExists).toBe(true);

    const blobCount = await prisma.blob.count({ where: { sha256: upA.json().artifact.blobSha256 } });
    const artifactCount = await prisma.artifact.count({ where: { workspaceId: wsId } });
    expect(blobCount).toBe(1); // 去重：一个 Blob
    expect(artifactCount).toBe(2);
    await app.close();
  });

  it('配额超限 → 413（seed workspace file_size_bytes=1MB，上传 2MB）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'art3@example.com');
    const wsId = await getPersonalWorkspace('art3@example.com');
    await prisma.quotaPolicy.create({
      data: { scope: 'workspace', scopeKey: wsId, resource: 'file_size_bytes', limitValue: 1 * 1024 * 1024, updatedBy: null },
    });
    const big = Buffer.alloc(2 * 1024 * 1024, 0x61); // 2MB 随机填充
    const form = uploadForm({ workspaceId: wsId, logicalPath: 'big.bin', file: big, filename: 'big.bin' });

    const up = await app.inject({ method: 'POST', url: '/artifacts/upload', cookies: { openscience_session: cookie }, payload: form.body, headers: { 'content-type': form.contentType } });
    expect(up.statusCode).toBe(413);
    await app.close();
  });

  it('MIME 检测失败（无魔数内容）→ 允许上传，mimeType=null', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'art4@example.com');
    const wsId = await getPersonalWorkspace('art4@example.com');
    const content = Buffer.from('plain text no magic bytes whatsoever');
    const form = uploadForm({ workspaceId: wsId, logicalPath: 'notes.txt', file: content, filename: 'notes.txt' });

    const up = await upload(app, cookie, form);
    expect(up.statusCode).toBe(201);
    expect(up.json().artifact.mimeType).toBeNull();
    await app.close();
  });

  it('跨 workspace 越权下载 → 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'arta@example.com');
    const cookieB = await registerAndVerify(app, 'artb@example.com');
    const wsA = await getPersonalWorkspace('arta@example.com');
    const form = uploadForm({ workspaceId: wsA, logicalPath: 'secret.png', file: PNG, filename: 'secret.png' });
    const up = await upload(app, cookieA, form);
    const artifactId = up.json().artifact.artifactId;

    const dl = await app.inject({ method: 'GET', url: `/artifacts/${artifactId}/download`, cookies: { openscience_session: cookieB } });
    expect(dl.statusCode).toBe(404); // 非成员 → 404（requireMembership 语义）
    await app.close();
  });

  it('未登录 → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/artifacts/upload', payload: Buffer.from('x'), headers: { 'content-type': 'multipart/form-data; boundary=x' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
