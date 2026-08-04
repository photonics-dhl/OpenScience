import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, getBlobStorageKey, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-4 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起（含 minio + bucket openscience-dev），迁移 9 已 deploy。
 * 用例：Commit→Manifest→重建校验 / 未变 Artifact 复用 Blob / 乐观锁 / 公开不可变 / 幂等键 / 越权。
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

function uploadForm({ workspaceId, logicalPath, file, filename = 'file.bin' }: {
  workspaceId: string; logicalPath: string; file: Buffer; filename?: string;
}): { body: Buffer; contentType: string } {
  const boundary = `----integration${Date.now()}`;
  const parts = Buffer.concat([
    fieldPart(boundary, 'workspaceId', workspaceId),
    fieldPart(boundary, 'logicalPath', logicalPath),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: parts, contentType: `multipart/form-data; boundary=${boundary}` };
}

function fieldPart(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function uploadArtifact(app: Awaited<ReturnType<typeof makeApp>>, cookie: string, wsId: string, logicalPath: string, file: Buffer): Promise<string> {
  const form = uploadForm({ workspaceId: wsId, logicalPath, file });
  const res = await app.inject({ method: 'POST', url: '/artifacts/upload', cookies: { openscience_session: cookie }, payload: form.body, headers: { 'content-type': form.contentType } });
  expect(res.statusCode).toBe(201);
  const artifactId = res.json().artifact.artifactId;
  createdBlobKeys.add(getBlobStorageKey(res.json().artifact.blobSha256));
  return artifactId;
}

afterAll(async () => {
  for (const key of createdBlobKeys) {
    try { await storage.deleteObject(key); } catch { /* 无害 */ }
  }
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

describe('P1B-4 /commits + /versions（云上，真 MinIO）', () => {
  it('Commit→Manifest→重建校验：改 SDF core，rebuild 哈希匹配', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'v1@example.com');
    const wsId = await getPersonalWorkspace('v1@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'V1 RO' } });
    const ro = createRo.json().researchObject;

    const commit = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: '更新问题', version: 1, sdfCore: { ...CORE, problem: '新版问题' } },
    });
    expect(commit.statusCode).toBe(201);
    const result = commit.json().commit;
    expect(result.versionNo).toBe(1);
    expect(result.snapshot.core.problem).toBe('新版问题');

    const detail = await app.inject({ method: 'GET', url: `/versions/${result.versionId}`, cookies: { openscience_session: cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().version.snapshot.core.problem).toBe('新版问题');

    const rebuild = await app.inject({ method: 'GET', url: `/versions/${result.versionId}/rebuild`, cookies: { openscience_session: cookie } });
    expect(rebuild.statusCode).toBe(200);
    expect(rebuild.json().version.verified).toBe(true);
    await app.close();
  });

  it('未变化 Artifact 复用 Blob：两次 commit 引用同 blobSha256', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'v2@example.com');
    const wsId = await getPersonalWorkspace('v2@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Reuse' } });
    const ro = createRo.json().researchObject;
    const artId = await uploadArtifact(app, cookie, wsId, 'fig.png', PNG);

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'add fig', version: 1, artifacts: [{ logicalPath: 'fig.png', artifactId: artId }] },
    });
    expect(c1.statusCode).toBe(201);
    const sha1 = c1.json().commit.snapshot.artifacts[0].blobSha256;

    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v2 keep fig', version: 2, artifacts: [{ logicalPath: 'fig.png', artifactId: artId }] },
    });
    expect(c2.statusCode).toBe(201);
    const sha2 = c2.json().commit.snapshot.artifacts[0].blobSha256;
    expect(sha2).toBe(sha1); // 复用 Blob（§7.2.4）
    await app.close();
  });

  it('乐观锁：version 过期 → 409', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'v3@example.com');
    const wsId = await getPersonalWorkspace('v3@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Lock' } });
    const ro = createRo.json().researchObject;

    const res = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'stale', version: 99 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONCURRENT_UPDATE');
    await app.close();
  });

  it('幂等键：同 key 重发 → 同 commit，不重复', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'v4@example.com');
    const wsId = await getPersonalWorkspace('v4@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Idem' } });
    const ro = createRo.json().researchObject;
    const headers = { 'idempotency-key': 'idem-commit-1' };

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, headers,
      payload: { message: 'unique', version: 1 },
    });
    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, headers,
      payload: { message: 'unique', version: 1 },
    });
    expect(c1.statusCode).toBe(201);
    expect(c2.json().commit.commitId).toBe(c1.json().commit.commitId);
    await app.close();
  });

  it('越权：非成员 commit → 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'va@example.com');
    const cookieB = await registerAndVerify(app, 'vb@example.com');
    const wsA = await getPersonalWorkspace('va@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Secret' } });
    const ro = createRo.json().researchObject;

    const res = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookieB },
      payload: { message: 'hack', version: 1 },
    });
    expect(res.statusCode).toBe(404); // 非成员 → 404（requireMembership）
    await app.close();
  });

  it('公开不可变：published 版本后 commit → 409', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'v6@example.com');
    const wsId = await getPersonalWorkspace('v6@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Immutable' } });
    const ro = createRo.json().researchObject;

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v1', version: 1 },
    });
    expect(c1.statusCode).toBe(201);
    // 直接改 DB 状态为 published（P1B-7 发布状态机未实装，测试模拟已发布）
    await prisma.version.update({ where: { id: c1.json().commit.versionId }, data: { status: 'published' } });

    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v2', version: 2 },
    });
    expect(c2.statusCode).toBe(409);
    expect(c2.json().error.code).toBe('VERSION_PUBLISHED');
    await app.close();
  });
});
