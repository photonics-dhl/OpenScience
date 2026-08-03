import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter, getBlobStorageKey, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1B-5 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 前置：dev 栈已起（含 minio + bucket openscience-dev），迁移 9 已 deploy。
 * 用例：v1→v2 全量 diff / 大二进制仅元数据 / 去重联合验证 / 越权 404。
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

function uploadForm({ workspaceId, logicalPath, file }: {
  workspaceId: string; logicalPath: string; file: Buffer;
}): { body: Buffer; contentType: string } {
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

const CORE1 = { schemaVersion: '0.1.0', problem: 'P1', insight: 'I', method: 'M', results: 'R1', limitations: 'L1', reproducibility: 'RP' };
const CORE2 = { schemaVersion: '0.1.0', problem: 'P2', insight: 'I', method: 'M', results: 'R2', limitations: 'L2', reproducibility: 'RP' };

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

describe('P1B-5 /versions comparison（云上，真 MinIO）', () => {
  it('v1→v2 全量 diff：SDF 变化 + 文件增删', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'd1@example.com');
    const wsId = await getPersonalWorkspace('d1@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Diff RO' } });
    const ro = createRo.json().researchObject;
    const figId = await uploadArtifact(app, cookie, wsId, 'fig.png', Buffer.from('fig-data-v1'));

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v1', version: 1, sdfCore: CORE1, artifacts: [{ logicalPath: 'fig.png', artifactId: figId }] },
    });
    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v2', version: 2, sdfCore: CORE2 },
    });
    const v1 = c1.json().commit.versionId;
    const v2 = c2.json().commit.versionId;

    const diff = await app.inject({ method: 'GET', url: `/versions/${v1}/comparison?to=${v2}`, cookies: { openscience_session: cookie } });
    expect(diff.statusCode).toBe(200);
    const types = new Set(diff.json().diff.changes.map((c: { type: string }) => c.type));
    expect(types.has('sdf_field')).toBe(true);
    expect(types.has('conclusion')).toBe(true);
    expect(types.has('text')).toBe(true);
    // v2 移除 fig.png（artifacts 缺省 = 空集合）→ file removed
    expect(types.has('file')).toBe(true);
    expect(diff.json().diff.changes.some((c: { type: string; kind: string }) => c.type === 'file' && c.kind === 'removed')).toBe(true);
    await app.close();
  });

  it('大二进制仅元数据（§7.2.6）：>1MB 文件 diff → metadata_only', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'd2@example.com');
    const wsId = await getPersonalWorkspace('d2@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Big' } });
    const ro = createRo.json().researchObject;
    const big1 = await uploadArtifact(app, cookie, wsId, 'big.bin', Buffer.alloc(2 * 1024 * 1024, 0x61));
    const big2 = await uploadArtifact(app, cookie, wsId, 'big.bin', Buffer.alloc(2 * 1024 * 1024, 0x62));

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'big1', version: 1, artifacts: [{ logicalPath: 'big.bin', artifactId: big1 }] },
    });
    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'big2', version: 2, artifacts: [{ logicalPath: 'big.bin', artifactId: big2 }] },
    });
    const diff = await app.inject({
      method: 'GET', url: `/versions/${c1.json().commit.versionId}/comparison?to=${c2.json().commit.versionId}`, cookies: { openscience_session: cookie },
    });
    const fileChanges = diff.json().diff.changes.filter((c: { type: string }) => c.type === 'file');
    expect(fileChanges).toHaveLength(1);
    expect(fileChanges[0].kind).toBe('metadata_only'); // §7.2.6 大二进制仅元数据
    expect(fileChanges[0].hunks).toBeUndefined();
    await app.close();
  });

  it('去重联合验证：未变 Artifact 复用 Blob（diff 不读内容）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'd3@example.com');
    const wsId = await getPersonalWorkspace('d3@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'Dedup' } });
    const ro = createRo.json().researchObject;
    const figId = await uploadArtifact(app, cookie, wsId, 'keep.png', Buffer.from('same-data'));

    const c1 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v1', version: 1, artifacts: [{ logicalPath: 'keep.png', artifactId: figId }] },
    });
    const c2 = await app.inject({
      method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie },
      payload: { message: 'v2', version: 2, artifacts: [{ logicalPath: 'keep.png', artifactId: figId }] },
    });
    // 两版本同 blob → diff 无 file change
    const diff = await app.inject({
      method: 'GET', url: `/versions/${c1.json().commit.versionId}/comparison?to=${c2.json().commit.versionId}`, cookies: { openscience_session: cookie },
    });
    expect(diff.json().diff.changes.filter((c: { type: string }) => c.type === 'file')).toEqual([]);
    // 去重：blob 只存一份
    const blobCount = await prisma.blob.count({ where: { sha256: c1.json().commit.snapshot.artifacts[0].blobSha256 } });
    expect(blobCount).toBe(1);
    await app.close();
  });

  it('越权：非成员 diff → 404', async () => {
    const app = await makeApp();
    const cookieA = await registerAndVerify(app, 'da@example.com');
    const cookieB = await registerAndVerify(app, 'db@example.com');
    const wsA = await getPersonalWorkspace('da@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookieA }, payload: { workspaceId: wsA, title: 'Secret' } });
    const ro = createRo.json().researchObject;
    const c1 = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookieA }, payload: { message: 'v1', version: 1 } });
    const v1 = c1.json().commit.versionId;

    const diff = await app.inject({ method: 'GET', url: `/versions/${v1}/comparison?to=${v1}`, cookies: { openscience_session: cookieB } });
    expect(diff.statusCode).toBe(404);
    await app.close();
  });
});
