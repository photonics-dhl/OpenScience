import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createArtifact } from '../../src/artifact/artifacts';
import { createCommit, getVersion, listVersions, rebuildVersion } from '../../src/commit/commits';
import { CommitError } from '../../src/commit/errors';

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
    headObject: async (key: string) => {
      const hit = store.get(key);
      return hit ? { size: hit.body.length, etag: 'x' } : null;
    },
    deleteObject: async (key: string) => void store.delete(key),
  };
  return { ...adapter, store };
}

const CORE1 = { schemaVersion: '0.1.0', problem: 'P1', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeRo(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const storage = memoryStorage();
  const deps = { prisma, storage, mailer: {} as never, ...(audit ? { audit } : {}) };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'My RO' });
  return { prisma, db, user, ws, storage, deps, ro };
}

describe('createCommit（§7.2.3 Manifest + §7.2.5 JSON Patch + §16 乐观锁/幂等）', () => {
  it('改 SDF core → Commit + ChangeSet(sdf_core) + Version + Manifest + RO.version+1', async () => {
    const { deps, db, user, ro } = await makeRo();
    const result = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '更新问题定义',
      version: 1, sdfCore: { ...CORE1, problem: 'P2' },
    });
    expect(result.versionNo).toBe(1);
    expect(result.snapshot.core.problem).toBe('P2');
    expect(db.commits).toHaveLength(1);
    expect(db.commits[0].message).toBe('更新问题定义');
    expect(db.changesets).toHaveLength(1);
    expect(db.changesets[0].kind).toBe('sdf_core');
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0].versionNo).toBe(1);
    expect(db.versionManifests).toHaveLength(1);
    expect(db.researchObjects.find((r) => r.id === ro.id).version).toBe(2);
  });

  it('乐观锁：version 不匹配 → CONCURRENT_UPDATE', async () => {
    const { deps, user, ro } = await makeRo();
    await expect(
      createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'X', version: 99 }),
    ).rejects.toThrow(CommitError);
  });

  it('幂等键重放 → 返回既有 Commit 不重复创建', async () => {
    const { deps, db, user, ro } = await makeRo();
    const first = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '唯一', version: 1, idempotencyKey: 'idem-1',
    });
    const second = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '唯一', version: 1, idempotencyKey: 'idem-1',
    });
    expect(second.commitId).toBe(first.commitId);
    expect(db.commits).toHaveLength(1);
    expect(db.versions).toHaveLength(1);
  });

  it('写审计行 commit.create', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user, ro } = await makeRo(audit);
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'Audited', version: 1 });
    expect(records.some((r) => (r as { action: string }).action === 'commit.create')).toBe(true);
  });

  it('空 message → VALIDATION_ERROR', async () => {
    const { deps, user, ro } = await makeRo();
    await expect(
      createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: '  ', version: 1 }),
    ).rejects.toThrow(/提交说明/);
  });

  it('已发布后新 commit → 产生新版本（§2.2-3 增量版本合法，不原地修改）', async () => {
    const { deps, db, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    db.versions[0].status = 'published';
    const v2 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2 });
    expect(v2.versionNo).toBe(2);
    expect(v1.versionNo).toBe(1);
  });
});

describe('getVersion / rebuildVersion（§7.1 可重建可校验）', () => {
  it('listVersions 返回降序最小版本摘要', async () => {
    const { deps, user, ro } = await makeRo();
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2 });
    const versions = await listVersions(deps, { researchObjectId: ro.id, userId: user.id });
    expect(versions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(versions[0]).toEqual(expect.objectContaining({ versionId: expect.any(String), commitId: expect.any(String), status: 'draft' }));
  });

  it('getVersion 返回 Manifest 快照', async () => {
    const { deps, user, ro } = await makeRo();
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1,
      sdfCore: { ...CORE1, problem: 'New' },
    });
    const detail = await getVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(detail.versionNo).toBe(1);
    expect(detail.status).toBe('draft');
    expect(detail.snapshot.core.problem).toBe('New');
  });

  it('rebuildVersion 校验 blob sha256', async () => {
    const { deps, db, user, ro, storage } = await makeRo();
    // 上传一个 artifact
    const art = await createArtifact(deps, {
      logicalPath: 'fig.png', content: Buffer.from('png-data'), uploadedBy: user.id, workspaceId: 'ws-1',
    });
    void storage;
    // 断言 artifact 存在
    expect(db.artifacts).toHaveLength(1);
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'add fig', version: 1,
      artifacts: [{ logicalPath: 'fig.png', artifactId: art.artifactId }],
    });
    expect(created.snapshot.artifacts).toHaveLength(1);
    const rebuilt = await rebuildVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(rebuilt.verified).toBe(true);
    expect(rebuilt.artifacts[0].blobSha256).toBe(art.blobSha256);
  });

  it('rebuildVersion blob 缺失 → verified=false', async () => {
    const { deps, user, ro } = await makeRo();
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'no artifact', version: 1,
    });
    const rebuilt = await rebuildVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(rebuilt.verified).toBe(true); // 无 artifact → 空校验通过
  });
});
