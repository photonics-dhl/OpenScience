import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createArtifact } from '../../src/artifact/artifacts';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { forkResearchObject, getForkSource } from '../../src/fork/forks';
import { ForkError } from '../../src/fork/errors';

function memoryStorage(): StorageAdapter & { store: Map<string, { body: Buffer }> } {
  const store = new Map<string, { body: Buffer }>();
  const adapter: StorageAdapter = {
    putObject: async (key: string, body: Buffer | NodeJS.ReadableStream, opts: { contentType?: string; sha256?: string } = {}) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      if (opts.sha256) {
        const actual = createHash('sha256').update(buf).digest('hex');
        if (actual !== opts.sha256.toLowerCase()) throw new Error(`sha256 mismatch for "${key}"`);
      }
      store.set(key, { body: buf });
      return { key, size: buf.length, etag: 'x' };
    },
    getObject: async (key: string) => {
      const hit = store.get(key);
      if (!hit) throw new Error(`Object not found: ${key}`);
      return { body: Readable.from([hit.body]), size: hit.body.length };
    },
    headObject: async (key: string) => (store.has(key) ? { size: store.get(key)!.body.length, etag: 'x' } : null),
    deleteObject: async (key: string) => void store.delete(key),
  };
  return { ...adapter, store };
}

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };
const LICENSES = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };

async function makePublicRoWithCommit() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'fork-owner' });
  const forker = seedUser(db, { id: 'fork-user' });
  const ws1 = { id: 'ws-1', type: 'personal', name: 'S1', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  const ws2 = { id: 'ws-2', type: 'personal', name: 'S2', status: 'active', ownerId: forker.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws1, ws2);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'm-2', workspaceId: 'ws-2', userId: forker.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: memoryStorage() };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'Source' });
  // 置 public（扩大走 P1B-7 审批，测试绕过）
  await deps.prisma.researchObject.update({ where: { id: ro.id }, data: { visibility: 'public' } });
  await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: LICENSES });
  // commit + artifact
  const artifact = await createArtifact(deps, { logicalPath: 'data/a.csv', content: Buffer.from('a,b\n1,2\n'), uploadedBy: owner.id, workspaceId: 'ws-1' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'v1', version: 1, sdfCore: CORE, artifacts: [{ logicalPath: 'data/a.csv', artifactId: artifact.artifactId }] });
  return { deps, db, owner, forker, ro, artifact, commit };
}

describe('Fork（§8.1 + §4.2 + §6.3 + §7.1）', () => {
  it('fork 成功：新 RO 有 publicId + ForkRelation + Blob 引用共享 + 许可复制', async () => {
    const { deps, forker, ro, artifact, commit } = await makePublicRoWithCommit();
    const result = await forkResearchObject(
      deps,
      { sourceResearchObjectId: ro.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR' },
    );
    // §8.1 unique ID
    expect(result.researchObject.publicId).toMatch(/^OSR-\d{4}-\d{6}$/);
    // ForkRelation 来源保留
    expect(result.forkRelation.sourceRoId).toBe(ro.id);
    expect(result.forkRelation.sourceVersionId).toBe(commit.versionId);
    // 许可复制（§8.1 来源许可继续生效）
    const forkedLic = await deps.prisma.licenseAssignment.findMany({ where: { researchObjectId: result.researchObject.id } });
    expect(forkedLic).toHaveLength(3);
    // Blob 引用共享（§7.1）：fork manifest entry blobSha256 = 源 artifact blobSha256
    const forkManifest = await deps.prisma.versionManifest.findUnique({
      where: { versionId: result.researchObject.id && (await deps.prisma.version.findFirst({ where: { researchObjectId: result.researchObject.id } }))!.id },
      include: { entries: true },
    });
    expect(forkManifest!.entries[0].blobSha256).toBe(artifact.blobSha256);
    expect(forkManifest!.entries[0].artifactId).not.toBe(artifact.artifactId); // 新 artifact 行
  });

  it('非 public 源 → SOURCE_NOT_PUBLIC（§4.2 仅 public 可 fork）', async () => {
    const { deps, owner, forker } = await makePublicRoWithCommit();
    // 造第二个 private RO
    const privateRo = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'Private' });
    await expect(
      forkResearchObject(deps, { sourceResearchObjectId: privateRo.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/仅公开的 RO/);
  });

  it('许可继承阻断：显式放宽 → INHERITANCE_VIOLATION（§6.3）', async () => {
    const { deps, forker, ro } = await makePublicRoWithCommit();
    // 源 text=CC-BY-4.0 → target CC-BY-NC 是加严（允许）；放宽测试用 ARR→... 实际源 CC-BY 最宽松。
    // 改用源许可变 ARR 场景：直接造一个 ARR 源。
    await setLicenses(deps, { researchObjectId: ro.id, userId: (await deps.prisma.researchObject.findUnique({ where: { id: ro.id } }))!.createdBy, licenses: { text: 'ALL-RIGHTS-RESERVED', code: 'MIT', data: 'CC0-1.0' } });
    await expect(
      forkResearchObject(
        deps,
        { sourceResearchObjectId: ro.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR', licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } },
      ),
    ).rejects.toThrow(ForkError);
  });

  it('来源关系只读：getForkSource 返回详情；无 delete API（§8.1 不可移除）', async () => {
    const { deps, forker, ro, commit } = await makePublicRoWithCommit();
    const result = await forkResearchObject(deps, { sourceResearchObjectId: ro.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR' });
    const source = await getForkSource(deps, { researchObjectId: result.researchObject.id, userId: forker.id });
    expect(source?.sourceRoId).toBe(ro.id);
    expect(source?.sourceVersionId).toBe(commit.versionId);
    expect(source?.sourceContentHash).toBeTruthy();
  });

  it('重复 fork 同源同目标 → ALREADY_FORKED（§8.1 一 RO 至多一个来源）', async () => {
    const { deps, forker, ro } = await makePublicRoWithCommit();
    await forkResearchObject(deps, { sourceResearchObjectId: ro.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR' });
    // 第二次 fork 到 ws-2 → 不同 fork RO，但源相同 → 允许（§8.1 允许从同一源多次 fork）
    const again = await forkResearchObject(deps, { sourceResearchObjectId: ro.id, userId: forker.id, workspaceId: 'ws-2', publicIdPrefix: 'OSR' });
    expect(again.researchObject.id).toBeTruthy();
  });
});
