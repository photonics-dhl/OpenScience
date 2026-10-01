import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { runPublicationReview, getPublicationReview } from '../../src/review/publish-review';

function memoryStorage(): StorageAdapter {
  const store = new Map<string, { body: Buffer }>();
  return {
    putObject: async (key, body) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      store.set(key, { body: buf });
      return { key, size: buf.length, etag: 'x' };
    },
    getObject: async (key) => {
      const hit = store.get(key);
      if (!hit) throw new Error(`Object not found: ${key}`);
      return { body: Readable.from([hit.body]), size: hit.body.length };
    },
    headObject: async (key) => (store.has(key) ? { size: store.get(key)!.body.length, etag: 'x' } : null),
    deleteObject: async (key) => void store.delete(key),
  };
}

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'pv-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: memoryStorage() };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE });
  db.claimNodes.push({
    id: 'review-core', researchObjectId: ro.id, versionId: commit.versionId, parentClaimId: null,
    kind: 'core', statement: 'Synthetic review contribution', assessment: 'missing', conditions: [], limitations: [],
    extractionStatus: 'succeeded', provenance: { source: 'human' },
  });
  return { deps, db, user, ro, versionId: commit.versionId };
}

describe('runPublicationReview（§11.1 七类硬阻断 + §15 AIReview）', () => {
  it.each(['viewer', 'reviewer', 'contributor'])('%s cannot overwrite a passed canonical review', async (role) => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    await runPublicationReview(deps, { versionId, userId: user.id });
    const saved = structuredClone(db.aiReviews[0]);
    db.memberships[0].role = role;
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toEqual([saved]);
  });

  it('publication review rechecks a demotion before writing the canonical verdict', async () => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const prisma = deps.prisma as unknown as { $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown> };
    const transaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = async (callback, options) => {
      db.memberships[0].role = 'viewer';
      return transaction(callback, options);
    };
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it.each(['viewer', 'reviewer', 'contributor'])('%s cannot trigger the automated publication review, even as creator', async (role) => {
    const { deps, db, user, versionId } = await makeDeps();
    db.memberships[0].role = role;
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it('正常版本（完整 core + 许可 + manifest + 发布者）→ passed', async () => {
    const { deps, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('passed');
    expect(review.hardBlocks).toHaveLength(0);
    // AIReview 记录稳定可引用（§11.3）
    const saved = await getPublicationReview(deps, { versionId, userId: user.id });
    expect(saved?.status).toBe('passed');
  });

  it('缺许可 → blocked（§6.3）', async () => {
    const { deps, user, versionId } = await makeDeps();
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('blocked');
    expect(review.hardBlocks.some((b) => b.code === 'license_missing')).toBe(true);
  });

  it('Contributor 不能覆盖发布审核（§3.3）', async () => {
    const { deps, db, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: db.users[0].id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const collab = seedUser(db, { id: 'pv-collab' });
    db.memberships.push({ id: 'm-2', workspaceId: 'ws-1', userId: collab.id, role: 'contributor', createdAt: new Date(), updatedAt: new Date() });
    await expect(runPublicationReview(deps, { versionId, userId: collab.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('版本无 manifest → blocked manifest_invalid（§7）', async () => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    // 删 manifest → manifest_invalid
    db.versionManifests = db.versionManifests.filter((m) => m.versionId !== versionId);
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('blocked');
    expect(review.hardBlocks.some((b) => b.code === 'manifest_invalid')).toBe(true);
  });
});
