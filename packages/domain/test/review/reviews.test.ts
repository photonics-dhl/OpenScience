import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { getBlobStorageKey } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { createBranch } from '../../src/branch/branches';
import { createPullRequest } from '../../src/pr/prs';
import { createReview, listReviews, mergePullRequest, assessHighRisk } from '../../src/review/reviews';
import { getResearchRecord, getResearchRecordSource } from '../../src/commit/research-record';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import { createBlockSourceLocator } from '../../src/research-intelligence/source-locator';
import { updateClaim, deleteClaim, deleteEvidence } from '../../src/research-intelligence/claim-evidence-service';

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

async function makeGraphPr() {
  const f = await makeRoWithPr();
  const source = f.db.versions.find(v => v.versionNo === 2)!;
  const bytes = Buffer.from('Source quote');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const artifactId = '00000000-0000-4000-8000-000000009901';
  await f.deps.storage.putObject(getBlobStorageKey(hash), bytes);
  f.db.artifacts.push({ id: artifactId, workspaceId: 'ws-1', logicalPath: 'source.txt', blobSha256: hash, size: BigInt(bytes.length), mimeType: 'text/plain' });
  const manifest = f.db.versionManifests.find(m => m.versionId === source.id)!;
  f.db.manifestEntries.push({ id: 'source-entry', manifestId: manifest.id, logicalPath: 'source.txt', artifactId, blobSha256: hash });
  const sourceMap = { artifactId, contentHash: hash, parser: { name: 'fixture', version: '1' }, pages: [{ page: 1, width: 600, height: 800,
    blocks: [{ id: 'source-block', kind: 'paragraph' as const, text: bytes.toString(), boundingBox: { x: 0, y: 0, width: 100, height: 20 }, parser: { name: 'fixture', version: '1' }, transformations: [] }] }] };
  const sourceMapRef = await persistDocumentSourceMapReference(f.deps.storage, sourceMap, 'succeeded');
  const root = await f.deps.prisma.claimNode.create({ data: {
    researchObjectId: f.ro.id, versionId: source.id, kind: 'core', statement: 'Source claim',
    assessment: 'supported', extractionStatus: 'succeeded', conditions: [], limitations: [], provenance: {},
  } });
  await f.deps.prisma.claimNode.create({ data: {
    researchObjectId: f.ro.id, versionId: source.id, parentClaimId: root.id, kind: 'supporting',
    statement: 'Source child', assessment: 'missing', extractionStatus: 'needs_review', conditions: [], limitations: [], provenance: {},
  } });
  const evidence = await f.deps.prisma.evidenceRecord.create({ data: {
    researchObjectId: f.ro.id, versionId: source.id, workspaceId: 'ws-1', claimId: root.id,
    artifactId, kind: 'passage', title: 'Original evidence', exactQuote: 'Source quote', relation: 'supports',
    locator: createBlockSourceLocator(sourceMap, 'source-block', { charRange: { start: 0, end: bytes.length } }) as never,
    contentHash: hash, extractionStatus: 'succeeded', verifiedByUserId: f.owner.id,
    provenance: { source: 'human', sourceMapRef } as never,
  } });
  return { ...f, source, root, evidence };
}

describe('merge research graph continuity', () => {
  it.each(['unchanged', 'edit', 'delete'] as const)('freezes the merge graph and continues its current rows: %s', async mode => {
    const f = await makeGraphPr();
    const author = seedUser(f.db, { id: 'merged-author', displayName: 'Merged author' });
    await f.deps.prisma.pullRequest.update({ where: { id: f.pr.id }, data: {
      newContributors: [{ userId: author.id }], codeLicense: 'Apache-2.0',
    } });
    await mergePullRequest(f.deps, { prId: f.pr.id, userId: f.owner.id, confirmHighRisk: true });
    const merged = f.db.versions.toSorted((a, b) => b.versionNo - a.versionNo)[0]!;
    expect(merged.id).not.toBe(f.source.id);
    const claims = f.db.claimNodes.filter(c => c.versionId === merged.id);
    expect(claims).toHaveLength(2);
    const root = claims.find(c => c.kind === 'core')!;
    expect(root.id).not.toBe(f.root.id);
    expect(claims.find(c => c.kind === 'supporting')!.parentClaimId).toBe(root.id);
    expect(root).toMatchObject({ assessment: 'missing', extractionStatus: 'needs_review' });
    const evidence = f.db.evidenceRecords.find(e => e.versionId === merged.id)!;
    expect(evidence).toMatchObject({ claimId: root.id, exactQuote: 'Source quote', verifiedByUserId: null, extractionStatus: 'needs_review' });
    expect(evidence.id).not.toBe(f.evidence.id);
    const scope = { researchObjectId: f.ro.id, versionId: merged.id, userId: f.owner.id };
    const frozen = await getResearchRecord(f.deps, scope);
    expect(frozen.record.identity.platformAuthors).toContainEqual(expect.objectContaining({ name: 'Merged author' }));
    expect(frozen.record.identity.licenses).toContainEqual({ type: 'code', identifier: 'Apache-2.0' });
    expect(frozen.record.claims).toHaveLength(2);
    expect((await getResearchRecordSource(f.deps, { ...scope, evidenceId: evidence.id })).text).toBe('Source quote');
    if (mode === 'edit') await updateClaim(f.deps, { ...scope, claimId: root.id, expectedUpdatedAt: root.updatedAt, patch: { statement: 'Edited after merge' } });
    if (mode === 'delete') {
      await deleteEvidence(f.deps, { ...scope, evidenceId: evidence.id, expectedUpdatedAt: evidence.updatedAt });
      const child = claims.find(c => c.kind === 'supporting')!;
      await deleteClaim(f.deps, { ...scope, claimId: child.id, expectedUpdatedAt: child.updatedAt });
      await deleteClaim(f.deps, { ...scope, claimId: root.id, expectedUpdatedAt: root.updatedAt });
    }
    const revision = f.db.researchObjects.find(r => r.id === f.ro.id)!.version;
    expect(revision).toBeGreaterThan(merged.versionNo);
    const next = await createCommit(f.deps, { researchObjectId: f.ro.id, userId: f.owner.id, version: revision, message: 'Continue merged work', sdfCore: CORE,
      artifacts: [{ artifactId: evidence.artifactId, logicalPath: 'source.txt' }] });
    expect(next.versionNo).toBeGreaterThan(merged.versionNo);
    const continued = await getResearchRecord(f.deps, { ...scope, versionId: next.versionId });
    expect(continued.record.claims).toHaveLength(mode === 'delete' ? 0 : 2);
    expect(continued.record.evidence).toHaveLength(mode === 'delete' ? 0 : 1);
    if (mode !== 'delete') expect((await getResearchRecordSource(f.deps, { ...scope, versionId: next.versionId, evidenceId: continued.record.evidence[0].id })).text).toBe('Source quote');
    if (mode !== 'delete') expect(continued.record.claims).toContainEqual(expect.objectContaining({ statement: mode === 'edit' ? 'Edited after merge' : 'Source claim' }));
    expect(await getResearchRecord(f.deps, scope)).toEqual(frozen);
  });

  it('uses the logical source tip and allocates beyond sparse existing versions and RO revisions', async () => {
    const f = await makeGraphPr();
    await f.deps.prisma.researchObject.update({ where: { id: f.ro.id }, data: { version: 8 } });
    const tip = await createCommit(f.deps, { researchObjectId: f.ro.id, userId: f.owner.id, version: 8, branchId: f.feature.id, message: 'Latest source', sdfCore: CORE });
    for (const commit of f.db.commits) commit.createdAt = new Date('2026-09-07T00:00:00Z');
    await mergePullRequest(f.deps, { prId: f.pr.id, userId: f.owner.id, confirmHighRisk: false });
    const merged = f.db.versions.toSorted((a, b) => b.versionNo - a.versionNo)[0]!;
    expect(merged).toMatchObject({ commitId: tip.commitId, versionNo: 9 });
    expect(f.db.researchObjects.find(r => r.id === f.ro.id)!.version).toBe(10);
    expect(f.db.claimNodes.filter(c => c.versionId === merged.id)).toHaveLength(2);
  });

  it('rolls back graph, manifest, revision, authors, licenses, branch and PR if freezing fails', async () => {
    const f = await makeGraphPr();
    const before = structuredClone(f.db);
    const original = f.deps.prisma.version.update.bind(f.deps.prisma.version);
    const fail = vi.spyOn(f.deps.prisma.version, 'update').mockImplementation(async args => {
      if (args.data.researchRecord) throw new Error('injected freeze failure');
      return original(args);
    });
    await expect(mergePullRequest(f.deps, { prId: f.pr.id, userId: f.owner.id, confirmHighRisk: false })).rejects.toThrow('injected freeze failure');
    fail.mockRestore();
    expect(f.db).toEqual(before);
  });

  it('repairs the allocation fence when a legacy merge left RO revision behind versionNo', async () => {
    const f = await makeGraphPr();
    await f.deps.prisma.version.update({ where: { id: f.source.id }, data: { versionNo: 20 } });
    await mergePullRequest(f.deps, { prId: f.pr.id, userId: f.owner.id, confirmHighRisk: false });
    expect(f.db.versions.map(v => v.versionNo)).toEqual([1, 20, 21]);
    expect(f.db.researchObjects.find(r => r.id === f.ro.id)!.version).toBe(22);
    const next = await createCommit(f.deps, { researchObjectId: f.ro.id, userId: f.owner.id, version: 22, message: 'Continue legacy merge' });
    expect(next.versionNo).toBe(22);
  });

  it('rechecks PR state inside the transaction so duplicate merge requests allocate only once', async () => {
    const f = await makeGraphPr();
    const input = { prId: f.pr.id, userId: f.owner.id, confirmHighRisk: false };
    const outcomes = await Promise.allSettled([mergePullRequest(f.deps, input), mergePullRequest(f.deps, input)]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1);
    expect(f.db.versions.map(v => v.versionNo)).toEqual([1, 2, 3]);
    expect(f.db.researchObjects.find(r => r.id === f.ro.id)!.version).toBe(4);
  });
});
