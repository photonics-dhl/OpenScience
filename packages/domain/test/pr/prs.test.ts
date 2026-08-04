import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { createBranch } from '../../src/branch/branches';
import { createPullRequest, listPullRequests, getPullRequest } from '../../src/pr/prs';

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
  changesMethod: true,
  changesData: false,
  changesConclusion: false,
  newContributors: [{ userId: 'user-x', creditRole: ['software'] as const }],
  dataLicense: 'CC-BY-4.0',
  codeLicense: 'MIT',
  conflictOfInterest: '无',
  autoChecks: {},
  requestsRelease: false,
};

async function makeRoWithBranches() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'pr-owner' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: memoryStorage() };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'PR RO' });
  await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: LICENSES });

  // main + feature 分支 + commits
  const c1 = await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'main v1', version: 1, sdfCore: CORE });
  const feature = await createBranch(deps, { researchObjectId: ro.id, userId: owner.id, name: 'feature/x' });
  await createCommit(deps, { researchObjectId: ro.id, userId: owner.id, message: 'feature work', version: 2, branchId: feature.id });
  const main = await deps.prisma.branch.findFirst({ where: { researchObjectId: ro.id, name: 'main' } });
  return { deps, db, owner, ro, feature, main: main!, mainCommitId: c1.commitId };
}

describe('创建 PR（§8.2 全声明 + §16 幂等 + §6.3 许可继承）', () => {
  it('完整声明创建成功 + Notification 事件 + 审计', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    const pr = await createPullRequest(
      deps,
      { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: '改进方法', body: '见 diff', ...PR_INPUT },
    );
    expect(pr.status).toBe('open');
    expect(pr.changedSdfFields).toEqual(['method']);
    expect(pr.dataLicense).toBe('CC-BY-4.0');
    // Notification pull_request.opened（§16 事件占位）
    const notifs = await deps.prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notifs.some((n: { type: string }) => n.type === 'pull_request.opened')).toBe(true);
  });

  it('§8.2 缺 changedFiles → VALIDATION_ERROR', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    await expect(
      createPullRequest(
        deps,
        { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, changedFiles: [] },
      ),
    ).rejects.toThrow(/必须声明变更的文件/);
  });

  it('非法 CRediT → VALIDATION_ERROR', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    await expect(
      createPullRequest(
        deps,
        { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, newContributors: [{ userId: 'u', creditRole: ['not-a-role'] as never }] },
      ),
    ).rejects.toThrow(/非法 CRediT/);
  });

  it('幂等键重放 → 返回既有 PR（不重复创建）', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    const input = { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, idempotencyKey: 'key-1' };
    const first = await createPullRequest(deps, input);
    const replay = await createPullRequest(deps, input);
    expect(replay.id).toBe(first.id);
    const all = await listPullRequests(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(all).toHaveLength(1);
  });

  it('许可继承：PR dataLicense 放宽 → INHERITANCE_VIOLATION（§6.3）', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    // 源 data=CUSTOM（仅同值）；PR 用 CC0 → 放宽被拒
    await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CUSTOM' } });
    await expect(
      createPullRequest(
        deps,
        { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT, dataLicense: 'CC0-1.0' },
      ),
    ).rejects.toThrow(/许可继承/);
  });

  it('跨 RO 分支 → CROSS_RO_BRANCH', async () => {
    const { deps, owner, ro, main } = await makeRoWithBranches();
    // 造第二个 RO 的 branch
    const ro2 = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO2' });
    await createCommit(deps, { researchObjectId: ro2.id, userId: owner.id, message: 'v1', version: 1 });
    const otherBranch = await deps.prisma.branch.findFirst({ where: { researchObjectId: ro2.id } });
    await expect(
      createPullRequest(
        deps,
        { researchObjectId: ro.id, userId: owner.id, sourceBranchId: otherBranch!.id, targetBranchId: main.id, title: 'x', ...PR_INPUT },
      ),
    ).rejects.toThrow(/源\/目标分支不属于/);
  });
});

describe('PR 详情 + §7.3 分支 diff', () => {
  it('详情含 diff（target tip → source tip 版本）', async () => {
    const { deps, owner, ro, feature, main } = await makeRoWithBranches();
    const pr = await createPullRequest(
      deps,
      { researchObjectId: ro.id, userId: owner.id, sourceBranchId: feature.id, targetBranchId: main.id, title: '改进', ...PR_INPUT },
    );
    const detail = await getPullRequest(deps, { researchObjectId: ro.id, userId: owner.id, prId: pr.id });
    expect(detail.diff).not.toBeNull();
    // diff 存在（main tip core → feature tip core；main 与 feature 同一 CORE → 无变化但仍返回结构）
    expect(detail.diff).toBeDefined();
  });

  it('非成员创建 → 404（§17 越权）', async () => {
    const { deps, db, ro, feature, main } = await makeRoWithBranches();
    const outsider = seedUser(db, { id: 'pr-outsider' });
    await expect(
      createPullRequest(
        deps,
        { researchObjectId: ro.id, userId: outsider.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', ...PR_INPUT },
      ),
    ).rejects.toThrow(/空间不存在/);
  });
});
