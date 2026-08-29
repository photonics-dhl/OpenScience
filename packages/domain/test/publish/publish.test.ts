import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { runPublicationReview } from '../../src/review/publish-review';
import { transitionVersionStatus, publishVersion } from '../../src/publish/publish';

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const user = seedUser(db, { id: 'pub-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, audit: {
    record: async (event: { action: string; metadata?: Record<string, unknown> }) => { auditEvents.push(event); },
  }, storage: {
    putObject: async () => ({ key: 'k', size: 0, etag: 'e' }),
    getObject: async () => ({ body: Readable.from([Buffer.from('')]), size: 0 }),
    headObject: async () => null, deleteObject: async () => undefined,
  } };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE });
  return { deps, db, user, ro, versionId: commit.versionId, auditEvents };
}

async function makePublishable() {
  const ctx = await makeDeps();
  await setLicenses(ctx.deps, { researchObjectId: ctx.ro.id, userId: ctx.user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
  for (let index = 1; index <= 3; index += 1) {
    ctx.db.claimNodes.push({
      id: `claim-${index}`,
      researchObjectId: ctx.ro.id,
      versionId: ctx.versionId,
      parentClaimId: null,
      kind: 'core',
      statement: `Core claim ${index}`,
      assessment: 'missing',
      conditions: [],
      limitations: [],
      extractionStatus: 'succeeded',
      provenance: { source: 'human' },
    });
  }
  const review = await runPublicationReview(ctx.deps, { versionId: ctx.versionId, userId: ctx.user.id });
  expect(review.status).toBe('passed');
  await transitionVersionStatus(ctx.deps, { versionId: ctx.versionId, userId: ctx.user.id, status: 'under_review' });
  await transitionVersionStatus(ctx.deps, { versionId: ctx.versionId, userId: ctx.user.id, status: 'approved' });
  return ctx;
}

describe('状态机推进（§4.1）', () => {
  it('draft → under_review → approved 合法', async () => {
    const { deps, user, versionId } = await makeDeps();
    await transitionVersionStatus(deps, { versionId, userId: user.id, status: 'under_review' });
    const approved = await transitionVersionStatus(deps, { versionId, userId: user.id, status: 'approved' });
    expect(approved.status).toBe('approved');
  });

  it('draft → published 非法（需经 approved）', async () => {
    const { deps, user, versionId } = await makeDeps();
    await expect(
      transitionVersionStatus(deps, { versionId, userId: user.id, status: 'published' }),
    ).rejects.toThrow(/非法/);
  });

  it('approved → published 只能走原子 publishVersion 管线', async () => {
    const { deps, user, versionId } = await makeDeps();
    await transitionVersionStatus(deps, { versionId, userId: user.id, status: 'under_review' });
    await transitionVersionStatus(deps, { versionId, userId: user.id, status: 'approved' });

    await expect(
      transitionVersionStatus(deps, { versionId, userId: user.id, status: 'published' }),
    ).rejects.toThrow(/非法/);
  });
});

describe('publishVersion（§2.1-6 + 三重前置）', () => {
  it('缺 AI 审核 → REVIEW_NOT_PASSED', async () => {
    const { deps, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    await expect(
      publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/AI 发布审核未通过/);
  });

  it('缺许可 → LICENSE_MISSING', async () => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    await runPublicationReview(deps, { versionId, userId: user.id }); // passed
    // 删许可 → LICENSE_MISSING
    db.licenseAssignments = db.licenseAssignments.filter((l) => l.researchObjectId !== ro.id);
    await expect(
      publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/许可/);
  });

  it('缺 R3 确认 → R3_CONFIRMATION_REQUIRED（§9.4）', async () => {
    const { deps, db, user, ro, versionId } = await makePublishable();
    await expect(
      publishVersion(deps, { versionId, userId: user.id, r3Confirmed: false, publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/R3 高影响/);
    expect(db.researchObjects.find((item) => item.id === ro.id)?.visibility).toBe('private');
  });

  it('rejects a Viewer attempting to reuse another author\'s passed review', async () => {
    const { deps, db, user, versionId } = await makePublishable();
    const viewer = seedUser(db, { id: 'publication-viewer', email: 'viewer@example.com' });
    db.memberships.push({
      id: 'viewer-membership', workspaceId: 'ws-1', userId: viewer.id, role: 'viewer',
      createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(publishVersion(deps, {
      versionId, userId: viewer.id, r3Confirmed: true, publicIdPrefix: 'OSR',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(user.id).not.toBe(viewer.id);
  });

  it('缺少 3–7 个核心 Claim 时硬阻断发布', async () => {
    const { deps, db, user, versionId } = await makePublishable();
    db.claimNodes.length = 0;
    await runPublicationReview(deps, { versionId, userId: user.id });

    await expect(
      publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/3-7 core Claims/);
  });

  it('发布成功：R3 原子扩展公开可见性并记录来源 + ID + 时间戳 + 哈希 + 事件', async () => {
    const { deps, db, user, ro, versionId, auditEvents } = await makePublishable();
    const storedRo = db.researchObjects.find((item) => item.id === ro.id)!;
    storedRo.visibility = 'invite_only';
    const published = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    expect(published.status).toBe('published');
    expect(published.visibility).toBe('public');
    expect(storedRo.visibility).toBe('public');
    expect(published.publicId).toMatch(/^OSR-\d{4}-\d{6}$/);
    expect(published.publicVersionId).toMatch(/^OSR-\d{4}-\d{6}-v\d+$/);
    expect(published.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(published.publishedAt).toBeTruthy();

    // 免责声明（§6.2 固定文案）
    const pub = await deps.prisma.publication.findFirst({ where: { versionId } });
    expect(pub!.legalDisclaimer).toContain('不构成专利优先权');
    // version.published 事件
    const notif = await deps.prisma.notification.findMany({ where: { userId: user.id } });
    expect(notif.some((n: { type: string }) => n.type === 'version.published')).toBe(true);
    // 审计只追加
    expect(pub!.contentSha256).toBe(published.contentSha256);
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: 'publication.publish',
      metadata: expect.objectContaining({ visibilityFrom: 'invite_only', visibilityTo: 'public' }),
    }));
  });

  it('在 Serializable 发布事务内读取并验证 Claim 图', async () => {
    const { deps, user, versionId } = await makePublishable();
    const prisma = deps.prisma as never as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: { isolationLevel?: string }) => Promise<unknown>;
      claimNode: { findMany: (args: unknown) => Promise<unknown> };
    };
    const transaction = prisma.$transaction.bind(prisma);
    const findMany = prisma.claimNode.findMany.bind(prisma.claimNode);
    let inTransaction = false;
    let sawClaimReadInTransaction = false;
    let isolationLevel: string | undefined;
    prisma.$transaction = async (fn, options) => {
      isolationLevel = options?.isolationLevel;
      inTransaction = true;
      try {
        return await transaction(fn, options);
      } finally {
        inTransaction = false;
      }
    };
    prisma.claimNode.findMany = async (args) => {
      if (inTransaction) sawClaimReadInTransaction = true;
      return findMany(args);
    };

    await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    expect(isolationLevel).toBe('Serializable');
    expect(sawClaimReadInTransaction).toBe(true);
  });

  it('幂等：已 published 再发布 → 返回既有（§2.2-3 不可原地修改）', async () => {
    const { deps, user, versionId } = await makePublishable();
    const first = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    const second = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    expect(second.publicId).toBe(first.publicId);
    expect(second.publicVersionId).toBe(first.publicVersionId);
    expect(second.contentSha256).toBe(first.contentSha256);
    expect(second.visibility).toBe('public');
  });

  it('binds the Claim/Evidence narrative into the publication content hash', async () => {
    const firstContext = await makePublishable();
    const secondContext = await makePublishable();
    secondContext.db.claimNodes[0].statement = 'A materially different public Claim';
    await runPublicationReview(secondContext.deps, {
      versionId: secondContext.versionId, userId: secondContext.user.id,
    });

    const first = await publishVersion(firstContext.deps, {
      versionId: firstContext.versionId, userId: firstContext.user.id, r3Confirmed: true, publicIdPrefix: 'OSR',
    });
    const second = await publishVersion(secondContext.deps, {
      versionId: secondContext.versionId, userId: secondContext.user.id, r3Confirmed: true, publicIdPrefix: 'OSR',
    });

    expect(second.contentSha256).not.toBe(first.contentSha256);
  });
});
