import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createArtifact, getArtifact } from '../../src/artifact/artifacts';
import { checkUploadQuota } from '../../src/artifact/quota';
import { ArtifactError } from '../../src/artifact/errors';

/** 内存 StorageAdapter：模拟 MinIO put/get/head/delete（含 sha256 校验）。 */
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
      return { body: Buffer.toWeb(hit.body) as unknown as NodeJS.ReadableStream, size: hit.body.length };
    },
    headObject: async (key: string) => {
      const hit = store.get(key);
      return hit ? { size: hit.body.length, etag: 'x' } : null;
    },
    deleteObject: async (key: string) => void store.delete(key),
  };
  return { ...adapter, store };
}

function makeDeps(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = {
    id: 'ws-1', type: 'team', name: 'Lab', status: 'active',
    ownerId: user.id, createdAt: new Date(), updatedAt: new Date(),
  };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const storage = memoryStorage();
  return {
    prisma, db, user, ws, storage,
    deps: { prisma, storage, mailer: {} as never, ...(audit ? { audit } : {}) },
  };
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 魔数
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe('createArtifact（§7.2.2 元数据 + §7.1 去重）', () => {
  it('上传 → Blob + Artifact 入库，返回元数据', async () => {
    const { deps, db, user } = makeDeps();
    const result = await createArtifact(deps, {
      logicalPath: 'figures/fig1.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1',
    });
    expect(result.artifactId).toBeTruthy();
    expect(result.mimeType).toBe('image/png'); // 魔数检测
    expect(result.size).toBe(PNG.length);
    expect(result.blobSha256).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(result.alreadyExists).toBe(false);
    expect(db.blobs).toHaveLength(1);
    expect(db.artifacts).toHaveLength(1);
    expect(db.artifacts[0]).toMatchObject({ logicalPath: 'figures/fig1.png', blobSha256: result.blobSha256 });
  });

  it('相同内容再次上传 → 去重，已有 Blob 复用，新 Artifact 新增', async () => {
    const { deps, db, user } = makeDeps();
    await createArtifact(deps, { logicalPath: 'a.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' });
    const second = await createArtifact(deps, { logicalPath: 'b.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' });
    expect(second.alreadyExists).toBe(true);
    expect(db.blobs).toHaveLength(1); // 去重：一个 Blob
    expect(db.artifacts).toHaveLength(2); // 两个 Artifact
  });

  it('未知魔数内容 → mimeType=null（Design Gate：允许上传）', async () => {
    const { deps, user } = makeDeps();
    const result = await createArtifact(deps, {
      logicalPath: 'data.bin', content: Buffer.from('no magic number at all'), uploadedBy: user.id, workspaceId: 'ws-1',
    });
    expect(result.mimeType).toBeNull();
  });

  it('逻辑路径校验：相对路径/隐藏文件 → VALIDATION_ERROR', async () => {
    const { deps, user } = makeDeps();
    await expect(
      createArtifact(deps, { logicalPath: '../evil', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' }),
    ).rejects.toThrow(ArtifactError);
    await expect(
      createArtifact(deps, { logicalPath: '.hidden', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' }),
    ).rejects.toThrow(ArtifactError);
  });

  it('非成员上传 → 404（requireMembership 语义）', async () => {
    const { deps, db } = makeDeps();
    const outsider = seedUser(db, { id: 'outsider' });
    await expect(
      createArtifact(deps, { logicalPath: 'x.png', content: PNG, uploadedBy: outsider.id, workspaceId: 'ws-1' }),
    ).rejects.toThrow(/空间不存在/);
  });

  it('写审计行 artifact.create（含 alreadyExists）', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user } = makeDeps(audit);
    await createArtifact(deps, { logicalPath: 'a.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: 'artifact.create', targetType: 'artifact',
      metadata: expect.objectContaining({ blobSha256: expect.any(String), alreadyExists: false }),
    });
  });
});

describe('getArtifact', () => {
  it('成员查详情（含 Blob）', async () => {
    const { deps, user } = makeDeps();
    const created = await createArtifact(deps, { logicalPath: 'a.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' });
    const detail = await getArtifact(deps, { userId: user.id, artifactId: created.artifactId });
    expect(detail.logicalPath).toBe('a.png');
    expect(detail.mimeType).toBe('image/png');
    expect(detail.blobSha256).toBe(created.blobSha256);
  });

  it('非成员查 → 404', async () => {
    const { deps, db, user } = makeDeps();
    const created = await createArtifact(deps, { logicalPath: 'a.png', content: PNG, uploadedBy: user.id, workspaceId: 'ws-1' });
    const outsider = seedUser(db, { id: 'outsider2' });
    await expect(getArtifact(deps, { userId: outsider.id, artifactId: created.artifactId })).rejects.toThrow(/空间不存在/);
  });
});

describe('checkUploadQuota（§13.3 单文件大小）', () => {
  it('超配额 → FILE_TOO_LARGE', async () => {
    const { prisma, db, user } = makeDeps();
    db.quotaPolicies.push({
      id: 'q-1', scope: 'workspace', scopeKey: 'ws-1', resource: 'file_size_bytes',
      limitValue: 100n, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const err = await checkUploadQuota({ prisma }, { workspaceId: 'ws-1', fileSize: 200 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArtifactError);
    expect((err as ArtifactError).code).toBe('FILE_TOO_LARGE');
    void user;  });

  it('未超配额 → 通过', async () => {
    const { prisma, db } = makeDeps();
    db.quotaPolicies.push({
      id: 'q-2', scope: 'workspace', scopeKey: 'ws-1', resource: 'file_size_bytes',
      limitValue: 100n, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(checkUploadQuota({ prisma }, { workspaceId: 'ws-1', fileSize: 50 })).resolves.toBeUndefined();
  });

  it('无配额配置 → 放行（null = 无限制）', async () => {
    const { prisma } = makeDeps();
    await expect(checkUploadQuota({ prisma }, { workspaceId: 'ws-1', fileSize: 999999 })).resolves.toBeUndefined();
  });
});
