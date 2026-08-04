import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { assignPublicId, buildExportPackage, createPersonalWorkspace, validateExportPackage } from '@openscience/domain';
import { createStorageAdapter, getBlobStorageKey, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-10 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起，迁移 9+ 已 deploy。
 * 用例：生成导出包 → 脱库纯文件校验（§5.3 MUST）→ 哈希一致 → 附件匹配。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const storage = createStorageAdapter(storageConfigFromEnv());
const repoRoot = path.resolve(__dirname, '../../..');
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

function uploadForm({ workspaceId, logicalPath, file }: { workspaceId: string; logicalPath: string; file: Buffer }) {
  const boundary = `----integration${Date.now()}`;
  const parts = Buffer.concat([
    fieldPart(boundary, 'workspaceId', workspaceId),
    fieldPart(boundary, 'logicalPath', logicalPath),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${logicalPath}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: parts, contentType: `multipart/form-data; boundary=${boundary}` };
}

function fieldPart(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}

async function uploadArtifact(app: Awaited<ReturnType<typeof makeApp>>, cookie: string, wsId: string, logicalPath: string, file: Buffer): Promise<string> {
  const form = uploadForm({ workspaceId: wsId, logicalPath, file });
  const res = await app.inject({ method: 'POST', url: '/artifacts/upload', cookies: { openscience_session: cookie }, payload: form.body, headers: { 'content-type': form.contentType } });
  expect(res.statusCode).toBe(201);
  createdBlobKeys.add(getBlobStorageKey(res.json().artifact.blobSha256));
  return res.json().artifact.artifactId;
}

afterAll(async () => {
  for (const key of createdBlobKeys) {
    try { await storage.deleteObject(key); } catch { /* 无害 */ }
  }
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

describe('P1B-10 /versions/:id/export（云上）', () => {
  it('生成导出包 → 脱库纯文件校验 Schema + 哈希一致', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'exp1@example.com');
    const wsId = await getPersonalWorkspace('exp1@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Export RO' } });
    const ro = createRo.json().researchObject;
    const figId = await uploadArtifact(app, cookie, wsId, 'fig.png', Buffer.from('export-fig-content'));
    const codeId = await uploadArtifact(app, cookie, wsId, 'main.py', Buffer.from('print("hi")'));

    const commit = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: {
        message: 'v1', version: 1,
        sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' },
        artifacts: [
          { logicalPath: 'fig.png', artifactId: figId },
          { logicalPath: 'main.py', artifactId: codeId },
        ],
      },
    });
    const versionId = commit.json().commit.versionId;

    // 用 domain buildExportPackage 直接拿文件清单（绕过 zip 解包）
    // manifest.objectId 需 OSR ID（§5.3 pattern）→ 先分配公开 ID（发布语义）
    const userId = (await prisma.user.findUnique({ where: { email: 'exp1@example.com' } }))!.id;
    await assignPublicId({ prisma, storage, mailer }, { userId, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    const files = await buildExportPackage(
      { prisma, storage, mailer },
      { userId, versionId },
    );
    expect(files.some((f) => f.path === 'manifest.json')).toBe(true);
    expect(files.some((f) => f.path === 'sdf/core.json')).toBe(true);
    expect(files.some((f) => f.path === 'manuscript/paper.md')).toBe(true);
    expect(files.some((f) => f.path === 'figures/fig.png')).toBe(true); // 图片归位
    expect(files.some((f) => f.path === 'code/main.py')).toBe(true); // 代码归位
    expect(files.some((f) => f.path === 'versions/index.json')).toBe(true);
    expect(files.some((f) => f.path === 'provenance/audit.json')).toBe(true);

    // 脱库校验（§5.3 MUST）
    const result = await validateExportPackage(files);
    expect(result.valid).toBe(true);
    await app.close();
  });

  it('export API 返回 zip', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'exp2@example.com');
    const wsId = await getPersonalWorkspace('exp2@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Zip RO' } });
    const ro = createRo.json().researchObject;
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1 } });
    const versionId = commit.json().commit.versionId;

    const res = await app.inject({ method: 'GET', url: `/versions/${versionId}/export`, cookies: { openscience_session: cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toContain('open-science-object.zip');
    // ZIP 魔数 PK\x03\x04
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
    await app.close();
  });

  it('越权导出 → 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'expa@example.com');
    const cookieB = await registerAndVerify(app, 'expb@example.com');
    const wsA = await getPersonalWorkspace('expa@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Secret' } });
    const ro = createRo.json().researchObject;
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookieA }, payload: { message: 'v1', version: 1 } });
    const versionId = commit.json().commit.versionId;

    const res = await app.inject({ method: 'GET', url: `/versions/${versionId}/export`, cookies: { openscience_session: cookieB } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
