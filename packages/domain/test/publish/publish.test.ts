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
  const user = seedUser(db, { id: 'pub-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: {
    putObject: async () => ({ key: 'k', size: 0, etag: 'e' }),
    getObject: async () => ({ body: Readable.from([Buffer.from('')]), size: 0 }),
    headObject: async () => null, deleteObject: async () => undefined,
  } };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE });
  return { deps, db, user, ro, versionId: commit.versionId };
}

async function makePublishable() {
  const ctx = await makeDeps();
  await setLicenses(ctx.deps, { researchObjectId: ctx.ro.id, userId: ctx.user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
  const review = await runPublicationReview(ctx.deps, { versionId: ctx.versionId, userId: ctx.user.id });
  expect(review.status).toBe('passed');
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
    const { deps, user, versionId } = await makePublishable();
    await expect(
      publishVersion(deps, { versionId, userId: user.id, r3Confirmed: false, publicIdPrefix: 'OSR' }),
    ).rejects.toThrow(/R3 高影响/);
  });

  it('发布成功：publicId + publicVersionId + UTC 时间戳 + 哈希 + 免责声明 + 事件', async () => {
    const { deps, user, versionId } = await makePublishable();
    const published = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    expect(published.status).toBe('published');
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
  });

  it('幂等：已 published 再发布 → 返回既有（§2.2-3 不可原地修改）', async () => {
    const { deps, user, versionId } = await makePublishable();
    const first = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    const second = await publishVersion(deps, { versionId, userId: user.id, r3Confirmed: true, publicIdPrefix: 'OSR' });
    expect(second.publicId).toBe(first.publicId);
    expect(second.publicVersionId).toBe(first.publicVersionId);
    expect(second.contentSha256).toBe(first.contentSha256);
  });
});
