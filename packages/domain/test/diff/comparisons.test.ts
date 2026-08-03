import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { compareVersions } from '../../src/diff/comparisons';

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

const CORE1 = { schemaVersion: '0.1.0', problem: 'P1', insight: 'I', method: 'M', results: 'R1', limitations: 'L1', reproducibility: 'RP' };
const CORE2 = { schemaVersion: '0.1.0', problem: 'P2', insight: 'I', method: 'M', results: 'R2', limitations: 'L2', reproducibility: 'RP' };

async function makeRo() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const storage = memoryStorage();
  const deps = { prisma, storage, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  return { prisma, db, user, ws, storage, deps, ro };
}

describe('compareVersions（§7.3 确定性 diff）', () => {
  it('v1→v2 SDF 变化 → sdf_field + conclusion + text 变化', async () => {
    const { deps, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE1 });
    const v2 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2, sdfCore: CORE2 });

    const result = await compareVersions(deps, { userId: user.id, fromVersionId: v1.versionId, toVersionId: v2.versionId });
    const types = new Set(result.changes.map((c) => c.type));
    expect(types.has('sdf_field')).toBe(true);
    expect(types.has('conclusion')).toBe(true);
    expect(types.has('text')).toBe(true);
  });

  it('v1→v2 相同 → 空 changes', async () => {
    const { deps, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE1 });
    const v2 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2, sdfCore: CORE1 });

    const result = await compareVersions(deps, { userId: user.id, fromVersionId: v1.versionId, toVersionId: v2.versionId });
    expect(result.changes).toEqual([]);
  });

  it('跨 RO 两版本 → VALIDATION_ERROR', async () => {
    const { deps, db, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    // 另一 RO
    const ro2 = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO2' });
    const v2 = await createCommit(deps, { researchObjectId: ro2.id, userId: user.id, message: 'v2', version: 1 });
    void db;
    await expect(
      compareVersions(deps, { userId: user.id, fromVersionId: v1.versionId, toVersionId: v2.versionId }),
    ).rejects.toThrow(/不属于同一/);
  });

  it('非成员对比 → 404', async () => {
    const { deps, db, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    const v2 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2 });
    const outsider = seedUser(db, { id: 'outsider-diff' });
    await expect(
      compareVersions(deps, { userId: outsider.id, fromVersionId: v1.versionId, toVersionId: v2.versionId }),
    ).rejects.toThrow(/空间不存在/);
  });
});
