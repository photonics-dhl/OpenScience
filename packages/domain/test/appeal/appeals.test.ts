import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { runPublicationReview } from '../../src/review/publish-review';
import { createAppeal, listAppeals, resolveAppeal } from '../../src/appeal/appeals';
import { Readable } from 'node:stream';

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'ap-owner' });
  const moderator = seedUser(db, { id: 'ap-mod', platformRole: 'moderator' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: {
    putObject: async () => ({ key: 'k', size: 0, etag: 'e' }),
    getObject: async () => ({ body: Readable.from([Buffer.from('')]), size: 0 }),
    headObject: async () => null, deleteObject: async () => undefined,
  } };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'v1', version: 1, sdfCore: CORE });
  return { deps, db, owner, moderator, ro, versionId: commit.versionId };
}

async function makeBlockedVersion() {
  const ctx = await makeDeps();
  // 无许可 → blocked（可申诉）
  const review = await runPublicationReview(ctx.deps, { versionId: ctx.versionId, userId: ctx.owner.id });
  expect(review.status).toBe('blocked');
  return ctx;
}

describe('createAppeal（§11.3 + §16 事件）', () => {
  it('blocked 版本申诉成功 + appeal.created 通知 + 审计', async () => {
    const { deps, owner, versionId } = await makeBlockedVersion();
    const appeal = await createAppeal(deps, { versionId, userId: owner.id, reason: '许可其实已选，审核误判' });
    expect(appeal.status).toBe('pending');
    expect(appeal.reason).toContain('误判');
    const notif = await deps.prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notif.some((n: { type: string }) => n.type === 'appeal.created')).toBe(true);
  });

  it('非 blocked（passed）→ REVIEW_NOT_BLOCKED', async () => {
    const { deps, owner, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    await runPublicationReview(deps, { versionId, userId: owner.id }); // passed
    await expect(
      createAppeal(deps, { versionId, userId: owner.id, reason: 'x' }),
    ).rejects.toThrow(/仅审核失败/);
  });

  it('同版本 pending 申诉去重 → ALREADY_PENDING', async () => {
    const { deps, owner, versionId } = await makeBlockedVersion();
    await createAppeal(deps, { versionId, userId: owner.id, reason: '第一次' });
    await expect(
      createAppeal(deps, { versionId, userId: owner.id, reason: '第二次' }),
    ).rejects.toThrow(/已有待处理申诉/);
  });
});

describe('listAppeals（§3.3 角色隔离）', () => {
  it('appellant 仅自己；moderator 看全部', async () => {
    const { deps, db, owner, moderator, versionId } = await makeBlockedVersion();
    // 第二个用户申诉别的版本（moderator 应看到全部）
    const other = seedUser(db, { id: 'ap-other', platformRole: 'user' });
    db.versions.push({ id: 'v-2', researchObjectId: 'ro-2', commitId: 'c', versionNo: 1, status: 'draft', createdAt: new Date() });
    db.researchObjects.push({ id: 'ro-2', workspaceId: 'ws-1', title: 'R2', createdBy: other.id, status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    db.aiReviews.push({ id: 'r-2', versionId: 'v-2', researchObjectId: 'ro-2', status: 'blocked', hardBlocks: [], warnings: [], createdAt: new Date() });
    db.appeals.push({ id: 'a-2', versionId: 'v-2', researchObjectId: 'ro-2', aiReviewId: 'r-2', appellantId: other.id, reason: 'x', status: 'pending', createdAt: new Date() });

    await createAppeal(deps, { versionId, userId: owner.id, reason: '我的' });
    // owner 仅自己
    const mine = await listAppeals(deps, { userId: owner.id });
    expect(mine).toHaveLength(1);
    expect(mine[0].appellantId).toBe(owner.id);
    // moderator 看全部（队列）
    const queue = await listAppeals(deps, { userId: moderator.id });
    expect(queue.length).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveAppeal（§3.3 仅 Moderator + §11.3 审计）', () => {
  it('moderator 处理 → resolved + resolution + 审计', async () => {
    const { deps, owner, moderator, versionId } = await makeBlockedVersion();
    const appeal = await createAppeal(deps, { versionId, userId: owner.id, reason: 'x' });
    const resolved = await resolveAppeal(deps, { userId: moderator.id, appealId: appeal.id, decision: 'approved', note: '人工复核通过' });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toMatchObject({ decision: 'approved', note: '人工复核通过' });
    expect(resolved.moderatorId).toBe(moderator.id);
    expect(resolved.resolvedAt).toBeTruthy();
  });

  it('普通用户 resolve → FORBIDDEN', async () => {
    const { deps, db, owner, versionId } = await makeBlockedVersion();
    const ordinary = seedUser(db, { id: 'ap-user', platformRole: 'user' });
    const appeal = await createAppeal(deps, { versionId, userId: owner.id, reason: 'x' });
    await expect(
      resolveAppeal(deps, { userId: ordinary.id, appealId: appeal.id, decision: 'approved', note: 'x' }),
    ).rejects.toThrow(/仅 Moderator\/Admin/);
  });

  it('已处理申诉再 resolve → NOT_FOUND', async () => {
    const { deps, owner, moderator, versionId } = await makeBlockedVersion();
    const appeal = await createAppeal(deps, { versionId, userId: owner.id, reason: 'x' });
    await resolveAppeal(deps, { userId: moderator.id, appealId: appeal.id, decision: 'rejected', note: '理由不足' });
    await expect(
      resolveAppeal(deps, { userId: moderator.id, appealId: appeal.id, decision: 'approved', note: 'x' }),
    ).rejects.toThrow(/已处理/);
  });
});
