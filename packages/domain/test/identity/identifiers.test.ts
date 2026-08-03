import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { assignPublicId, computeContentSha256 } from '../../src/identity/identifiers';

function memoryStorage(): StorageAdapter & { store: Map<string, { body: Buffer }> } {
  const store = new Map<string, { body: Buffer }>();
  const adapter: StorageAdapter = {
    putObject: async (key: string, body: Buffer | NodeJS.ReadableStream) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
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

async function makeRo() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date('2026-01-15T00:00:00Z'), updatedAt: new Date('2026-01-15T00:00:00Z') };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const storage = memoryStorage();
  const deps = { prisma, storage, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  return { prisma, db, user, ws, storage, deps, ro };
}

describe('assignPublicId（§6.1 发布时分配 + 永不复用）', () => {
  it('首次分配 → OSR-YYYY-NNNNNN + Identifier 行 + publicVersionId -vN', async () => {
    const { deps, db, user, ro } = await makeRo();
    const result = await assignPublicId(deps, { userId: user.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    expect(result.publicId).toBe('OSR-2026-000001'); // createdAt 年 2026 + seq 1
    expect(result.publicVersionId).toBe('OSR-2026-000001-v1');
    expect(db.identifiers).toHaveLength(1);
    expect(db.researchObjects.find((r) => r.id === ro.id).publicId).toBe('OSR-2026-000001');
  });

  it('同 RO 再次分配 → 复用 publicId（ID 永不复用 §6.1），版本 ID 递增', async () => {
    const { deps, db, user, ro } = await makeRo();
    const first = await assignPublicId(deps, { userId: user.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' });
    const second = await assignPublicId(deps, { userId: user.id, researchObjectId: ro.id, versionNo: 2, prefix: 'OSR' });
    expect(second.publicId).toBe(first.publicId);
    expect(second.publicVersionId).toBe('OSR-2026-000001-v2');
    expect(db.identifiers).toHaveLength(1); // 不新增 Identifier 行
  });

  it('全局递增：两个 RO → seq 递增', async () => {
    const { deps, db, user } = await makeRo();
    const ro2 = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO2' });
    const a = await assignPublicId(deps, { userId: user.id, researchObjectId: (db.researchObjects[0] as { id: string }).id, versionNo: 1, prefix: 'OSR' });
    const b = await assignPublicId(deps, { userId: user.id, researchObjectId: ro2.id, versionNo: 1, prefix: 'OSR' });
    expect(a.publicId).toBe('OSR-2026-000001');
    expect(b.publicId).toBe('OSR-2026-000002');
  });

  it('非成员 → 404', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'outsider-id' });
    await expect(
      assignPublicId(deps, { userId: outsider.id, researchObjectId: ro.id, versionNo: 1, prefix: 'OSR' }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('computeContentSha256（§6.2 版本内容哈希）', () => {
  it('按 logicalPath 排序后拼接 blobSha256 → SHA-256', () => {
    const entries = [
      { logicalPath: 'b.txt', blobSha256: 'bb'.repeat(32) },
      { logicalPath: 'a.txt', blobSha256: 'aa'.repeat(32) },
    ];
    const hash = computeContentSha256(entries);
    const expected = createHash('sha256').update('a.txt:' + 'aa'.repeat(32) + '\nb.txt:' + 'bb'.repeat(32)).digest('hex');
    expect(hash).toBe(expected);
  });

  it('顺序无关（排序后结果一致）', () => {
    const e1 = [{ logicalPath: 'a', blobSha256: 'x'.repeat(64) }, { logicalPath: 'b', blobSha256: 'y'.repeat(64) }];
    const e2 = [{ logicalPath: 'b', blobSha256: 'y'.repeat(64) }, { logicalPath: 'a', blobSha256: 'x'.repeat(64) }];
    expect(computeContentSha256(e1)).toBe(computeContentSha256(e2));
  });
});
