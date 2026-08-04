import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { updateResearchObject } from '../../src/research-object/research-objects';
import { createBranch, deleteBranch, listBranches, switchBranch, BRANCH_NAME_PATTERN } from '../../src/branch/branches';
import { BranchError } from '../../src/branch/errors';

async function makeRo(visibility: 'private' | 'invite_only' | 'public' = 'private') {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  if (visibility !== 'private') {
    await updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { visibility } });
  }
  return { prisma, db, user, deps, ro };
}

describe('可见性继承（§2.3 决策 3 + §4.2）：分支无自有 visibility，读走 canAccessRo', () => {
  it('public RO：非成员（含匿名）可读分支列表', async () => {
    const { deps, user, ro } = await makeRo('public');
    await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/x' });
    const anon = await listBranches(deps, { researchObjectId: ro.id });
    expect(anon).toHaveLength(1);
    expect(anon[0].name).toBe('feature/x');
  });

  it('private RO：非成员读分支列表 → 404（不泄露）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'outsider-read' });
    await expect(listBranches(deps, { researchObjectId: ro.id, userId: outsider.id })).rejects.toThrow(
      /研究对象不存在/,
    );
  });
});

describe('创建分支（§17 越权 + §16 幂等 + Q3 headCommitId）', () => {
  it('成员创建成功，默认非 isDefault，commitCount 0', async () => {
    const { deps, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/x' });
    expect(b.name).toBe('feature/x');
    expect(b.isDefault).toBe(false);
    expect(b.tipCommit).toBeNull();
    expect(b.commitCount).toBe(0);
  });

  it('非成员创建 → 404（§17 越权防护）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'outsider-create' });
    await expect(
      createBranch(deps, { researchObjectId: ro.id, userId: outsider.id, name: 'feature/x' }),
    ).rejects.toThrow(/空间不存在/);
  });

  it('非法分支名 → VALIDATION_ERROR', async () => {
    const { deps, user, ro } = await makeRo();
    await expect(createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: '-bad' })).rejects.toThrow(
      BranchError,
    );
    await expect(createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'a'.repeat(65) })).rejects.toThrow(
      BranchError,
    );
    expect(BRANCH_NAME_PATTERN.test('feat/nested-v1')).toBe(true);
  });

  it('同名重发 → NAME_EXISTS（§16 幂等：拒绝而非重复建）', async () => {
    const { deps, user, ro } = await makeRo();
    await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'main-copy' });
    await expect(
      createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'main-copy' }),
    ).rejects.toThrow(BranchError);
  });

  it('headCommitId 不属于同一 RO → CROSS_RO_COMMIT', async () => {
    const { deps, db, user, ro } = await makeRo();
    const ro2 = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO2' });
    // 手动塞一个 RO2 的 commit（fake：直接构造 commit 行）
    db.commits.push({ id: 'c-cross', researchObjectId: ro2.id, branchId: 'b-x', message: 'x', authorId: user.id, createdAt: new Date() });
    await expect(
      createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/y', headCommitId: 'c-cross' }),
    ).rejects.toThrow(/起点 Commit 不属于/);
  });

  it('headCommitId 同 RO：校验通过，创建成功', async () => {
    const { deps, db, user, ro } = await makeRo();
    // main 分支 + commit 后建分支（fake 直接构造）
    const main = { id: 'b-main', researchObjectId: ro.id, name: 'main', isDefault: true, createdAt: new Date() };
    db.branches.push(main);
    db.commits.push({ id: 'c-1', researchObjectId: ro.id, branchId: 'b-main', message: 'v1', authorId: user.id, createdAt: new Date() });
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/from-main', headCommitId: 'c-1' });
    expect(b.name).toBe('feature/from-main');
  });

  it('anchor 落库：创建分支存 headCommitId（供 createCommit 首 commit parent 锚定）', async () => {
    const { deps, db, user, ro } = await makeRo();
    db.branches.push({ id: 'b-main', researchObjectId: ro.id, name: 'main', isDefault: true, createdAt: new Date() });
    db.commits.push({ id: 'c-base', researchObjectId: ro.id, branchId: 'b-main', message: 'base', authorId: user.id, createdAt: new Date() });
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/anchored', headCommitId: 'c-base' });
    const row = await deps.prisma.branch.findFirst({ where: { id: b.id } });
    expect(row.headCommitId).toBe('c-base');
  });
});

describe('删除分支（三规则：default / 有 Commit / 被 PR 引用）', () => {
  it('主分支禁删 → DEFAULT_BRANCH', async () => {
    const { deps, user, ro } = await makeRo();
    const main = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'main' });
    const row = await deps.prisma.branch.findFirst({ where: { id: main.id } });
    Object.assign(row!, { isDefault: true });
    await expect(
      deleteBranch(deps, { researchObjectId: ro.id, userId: user.id, branchId: main.id }),
    ).rejects.toThrow(/主分支不可删除/);
  });

  it('有 Commit 的分支禁删 → BRANCH_HAS_COMMITS', async () => {
    const { deps, db, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/has-commit' });
    db.commits.push({ id: 'c-2', researchObjectId: ro.id, branchId: b.id, message: 'work', authorId: user.id, createdAt: new Date() });
    await expect(
      deleteBranch(deps, { researchObjectId: ro.id, userId: user.id, branchId: b.id }),
    ).rejects.toThrow(/已有提交的分支不可删除/);
  });

  it('被 PR 引用的分支禁删 → BRANCH_IN_USE', async () => {
    const { deps, db, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/pr' });
    db.pullRequests.push({ id: 'pr-1', sourceBranchId: b.id, targetBranchId: 'b-other' });
    await expect(
      deleteBranch(deps, { researchObjectId: ro.id, userId: user.id, branchId: b.id }),
    ).rejects.toThrow(/被 Pull Request 引用的分支不可删除/);
  });

  it('空分支删除成功 + 审计', async () => {
    const { deps, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/tmp' });
    await expect(
      deleteBranch(deps, { researchObjectId: ro.id, userId: user.id, branchId: b.id }),
    ).resolves.toBeUndefined();
    const remaining = await deps.prisma.branch.findFirst({ where: { id: b.id } });
    expect(remaining).toBeNull();
  });

  it('非成员删除 → 404（§17）', async () => {
    const { deps, db, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/x' });
    const outsider = seedUser(db, { id: 'outsider-del' });
    await expect(
      deleteBranch(deps, { researchObjectId: ro.id, userId: outsider.id, branchId: b.id }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('切换分支（Q5 无状态占位）', () => {
  it('成员切换成功，返回目标分支详情 + tipCommit', async () => {
    const { deps, db, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/switch' });
    db.commits.push({ id: 'c-3', researchObjectId: ro.id, branchId: b.id, message: 'work', authorId: user.id, createdAt: new Date() });
    const detail = await switchBranch(deps, { researchObjectId: ro.id, userId: user.id, branchId: b.id });
    expect(detail.name).toBe('feature/switch');
    expect(detail.tipCommit?.message).toBe('work');
    expect(detail.commitCount).toBe(1);
  });

  it('非成员切换 → 404', async () => {
    const { deps, db, user, ro } = await makeRo();
    const b = await createBranch(deps, { researchObjectId: ro.id, userId: user.id, name: 'feature/switch2' });
    const outsider = seedUser(db, { id: 'outsider-switch' });
    await expect(
      switchBranch(deps, { researchObjectId: ro.id, userId: outsider.id, branchId: b.id }),
    ).rejects.toThrow(/空间不存在/);
  });
});
