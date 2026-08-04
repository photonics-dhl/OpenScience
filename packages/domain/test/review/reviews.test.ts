import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { createBranch } from '../../src/branch/branches';
import { createPullRequest } from '../../src/pr/prs';
import { createReview, listReviews, mergePullRequest, assessHighRisk } from '../../src/review/reviews';

function memoryStorage(): StorageAdapter & { store: Map<string, { body: Buffer }> } {
  const store = new Map<string, { body: Buffer }>();
  const adapter: StorageAdapter = {
    putObject: async (key, body, opts = {}) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      if (opts.sha256) {
        const actual = createHash('sha256').update(buf).digest('hex');
        if (actual !== opts.sha256.toLowerCase()) throw new Error(`sha256 mismatch`);
      }
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
  return { ...adapter, store };
}

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };
const LICENSES = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };
const PR_INPUT = {
  changedSdfFields: ['method'],
  changedFiles: ['manuscript/paper.md'],
  changesMethod: false,
  changesData: false,
  changesConclusion: false,
  newContributors: [],
  dataLicense: 'CC0-1.0', // 匹配源 data 许可（低风险）
  codeLicense: 'MIT',
  conflictOfInterest: '无',
  autoChecks: {},
  requestsRelease: false,
};

async function makeRoWithPr() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'rv-owner' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: memoryStorage() };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'Review RO' });
  await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: LICENSES });
  await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'main v1', version: 1, sdfCore: CORE });
  const feature = await createBranch(deps, { researchObjectId: ro.id, userId: owner.id, name: 'feature/x' });
  await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'feature work', version: 2, branchId: feature.id });
  const main = await deps.prisma.branch.findFirst({ where: { researchObjectId: ro.id, name: 'main' } });
  const pr = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main!.id, title: '改进', ...PR_INPUT });
  return { deps, db, owner, ro, feature, main: main!, pr };
}

describe('createReview（Q1 空间成员 + §8.2 逐项）', () => {
  it('创建 Review：verdict + items + 审计', async () => {
    const { deps, owner, pr } = await makeRoWithPr();
    const review = await createReview(deps, {
      prId: pr.id, userId: owner.id, verdict: 'approve', body: '方法合理',
      items: [{ path: 'method', kind: 'clarity', comment: '补充细节' }],
    });
    expect(review.verdict).toBe('approve');
    expect(review.items).toHaveLength(1);
    const all = await listReviews(deps, { prId: pr.id, userId: owner.id });
    expect(all).toHaveLength(1);
  });

  it('非法 verdict → VALIDATION_ERROR；非 open PR → 拒绝', async () => {
    const { deps, owner, pr } = await makeRoWithPr();
    await expect(
      createReview(deps, { prId: pr.id, userId: owner.id, verdict: 'nope' as never }),
    ).rejects.toThrow(/非法评审结论/);
    // 直接置 merged
    await deps.prisma.pullRequest.update({ where: { id: pr.id }, data: { status: 'merged' } });
    await expect(
      createReview(deps, { prId: pr.id, userId: owner.id, verdict: 'approve' }),
    ).rejects.toThrow(/仅 open/);
  });
});

describe('高风险判定（§8.3 四类）', () => {
  it('低风险（无声明变化 + 无作者 + 许可同）→ highRisk false', async () => {
    const { deps, owner, pr } = await makeRoWithPr();
    const hr = await assessHighRisk(deps, { prId: pr.id, userId: owner.id });
    expect(hr.highRisk).toBe(false);
  });

  it('changesMethod true → 高风险', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithPr();
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, changesMethod: true });
    const hr = await assessHighRisk(deps, { prId: pr2.id, userId: owner.id });
    expect(hr.highRisk).toBe(true);
    expect(hr.reasons.some((r) => r.includes('方法'))).toBe(true);
  });

  it('新增作者 → 高风险', async () => {
    const { deps, db, owner, ro, feature, main } = await makeRoWithPr();
    const newContributor = seedUser(db, { id: 'rv-newauth' });
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, newContributors: [{ userId: newContributor.id, creditRole: ['software'] }] });
    const hr = await assessHighRisk(deps, { prId: pr2.id, userId: owner.id });
    expect(hr.highRisk).toBe(true);
    expect(hr.reasons.some((r) => r.includes('新增作者'))).toBe(true);
  });

  it('变更许可 → 高风险', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithPr();
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, dataLicense: 'CC-BY-4.0', codeLicense: 'Apache-2.0' });
    const hr = await assessHighRisk(deps, { prId: pr2.id, userId: owner.id });
    expect(hr.highRisk).toBe(true);
    expect(hr.reasons.some((r) => r.includes('许可'))).toBe(true);
  });
});

describe('mergePullRequest（§8.3 + §3.3 + Q2/Q3/Q4）', () => {
  it('owner merge 低风险：PR merged + target 分支新 commit + 新草稿版本 + 事件', async () => {
    const { deps, owner, pr, main } = await makeRoWithPr();
    const result = await mergePullRequest(deps, { prId: pr.id, userId: owner.id, confirmHighRisk: false });
    expect(result.status).toBe('merged');
    expect(result.highRisk.highRisk).toBe(false);

    // PR merged
    const updated = await deps.prisma.pullRequest.findUnique({ where: { id: pr.id } });
    expect(updated!.status).toBe('merged');
    // target 分支有新 commit（source tip 迁移）
    const mainCommits = await deps.prisma.commit.findMany({ where: { branchId: main.id } });
    expect(mainCommits.length).toBeGreaterThan(0);
    // 新草稿版本（versionNo 递增）
    const versions = await deps.prisma.version.findMany({ where: { researchObjectId: updated!.researchObjectId } });
    expect(versions.some((v) => v.status === 'draft' && v.versionNo > 1)).toBe(true);
    // pull_request.merged 事件
    const notif = await deps.prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notif.some((n: { type: string }) => n.type === 'pull_request.merged')).toBe(true);
  });

  it('高风险无确认 → HIGH_RISK_CONFIRMATION_REQUIRED', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithPr();
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, changesConclusion: true });
    await expect(
      mergePullRequest(deps, { prId: pr2.id, userId: owner.id, confirmHighRisk: false }),
    ).rejects.toThrow(/高风险/);
  });

  it('高风险 + 确认 → 通过', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithPr();
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, changesConclusion: true });
    const result = await mergePullRequest(deps, { prId: pr2.id, userId: owner.id, confirmHighRisk: true });
    expect(result.status).toBe('merged');
  });

  it('viewer 成员 merge → 403（§8.3 仅 Owner/Maintainer）', async () => {
    const { deps, db, owner, ro, feature, main } = await makeRoWithPr();
    const viewer = seedUser(db, { id: 'rv-viewer' });
    db.memberships.push({ id: 'm-2', workspaceId: 'ws-1', userId: viewer.id, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const pr2 = await createPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT });
    await expect(
      mergePullRequest(deps, { prId: pr2.id, userId: viewer.id, confirmHighRisk: false }),
    ).rejects.toThrow(/仅 Owner\/Maintainer/);
  });

  it('非 open PR merge → PR_NOT_OPEN', async () => {
    const { deps, owner, pr } = await makeRoWithPr();
    await deps.prisma.pullRequest.update({ where: { id: pr.id }, data: { status: 'merged' } });
    await expect(
      mergePullRequest(deps, { prId: pr.id, userId: owner.id, confirmHighRisk: false }),
    ).rejects.toThrow(/仅 open/);
  });
});
