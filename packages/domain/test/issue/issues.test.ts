import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { updateResearchObject } from '../../src/research-object/research-objects';
import { createIssue, listIssues, getIssue, updateIssueStatus, createComment } from '../../src/issue/issues';
import { IssueError } from '../../src/issue/errors';

async function makeRo(visibility: 'private' | 'invite_only' | 'public' = 'private') {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'issue-owner' });
  const viewer = seedUser(db, { id: 'issue-viewer' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'm-2', workspaceId: 'ws-1', userId: viewer.id, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO' });
  if (visibility !== 'private') {
    await updateResearchObject(deps, { userId: owner.id, roId: ro.id, version: 1, patch: { visibility } });
  }
  return { prisma, db, owner, viewer, deps, ro };
}

describe('可见性继承（§4.2）：Issue 读走 canAccessRo', () => {
  it('public RO：匿名可读 Issue 列表', async () => {
    const { deps, owner, ro } = await makeRo('public');
    await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: '复现失败', kind: 'failure' });
    const list = await listIssues(deps, { researchObjectId: ro.id });
    expect(list).toHaveLength(1);
  });

  it('private RO：非成员读 → 404（不泄露）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'issue-outsider' });
    await expect(listIssues(deps, { researchObjectId: ro.id, userId: outsider.id })).rejects.toThrow(/研究对象不存在/);
  });
});

describe('创建 Issue（§8 五类语义 + §17 越权）', () => {
  it('成员创建成功：status=open，kind 对齐', async () => {
    const { deps, owner, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: '方法质疑', kind: 'method_repro', body: '复现不了' });
    expect(issue.status).toBe('open');
    expect(issue.kind).toBe('method_repro');
    expect(issue.commentCount).toBe(0);
  });

  it('非成员创建 → 404（§17 越权）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'issue-outsider2' });
    await expect(
      createIssue(deps, { researchObjectId: ro.id, userId: outsider.id, title: 'x', kind: 'question' }),
    ).rejects.toThrow(/空间不存在/);
  });

  it('非法 kind → VALIDATION_ERROR', async () => {
    const { deps, owner, ro } = await makeRo();
    await expect(
      createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'vote' as never }),
    ).rejects.toThrow(IssueError);
  });

  it('空标题 → VALIDATION_ERROR', async () => {
    const { deps, owner, ro } = await makeRo();
    await expect(
      createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: '   ', kind: 'question' }),
    ).rejects.toThrow(/标题/);
  });
});

describe('状态机（Q1/Q3）：open/closed 流转 + 幂等 + 权限', () => {
  it('作者关闭 → 重开：合法流转', async () => {
    const { deps, owner, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'bug_report' });
    const closed = await updateIssueStatus(deps, { researchObjectId: ro.id, userId: owner.id, issueId: issue.id, status: 'closed' });
    expect(closed.status).toBe('closed');
    const reopened = await updateIssueStatus(deps, { researchObjectId: ro.id, userId: owner.id, issueId: issue.id, status: 'open' });
    expect(reopened.status).toBe('open');
  });

  it('幂等：同状态重复 → 直接成功', async () => {
    const { deps, owner, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'question' });
    await expect(
      updateIssueStatus(deps, { researchObjectId: ro.id, userId: owner.id, issueId: issue.id, status: 'open' }),
    ).resolves.toMatchObject({ status: 'open' });
  });

  it('viewer 成员关他人 Issue → FORBIDDEN（403）', async () => {
    const { deps, owner, viewer, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'question' });
    await expect(
      updateIssueStatus(deps, { researchObjectId: ro.id, userId: viewer.id, issueId: issue.id, status: 'closed' }),
    ).rejects.toThrow(/仅作者或空间成员/);
  });

  it('非成员关 → 404', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'issue-outsider3' });
    await expect(
      updateIssueStatus(deps, { researchObjectId: ro.id, userId: outsider.id, issueId: 'any', status: 'closed' }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('Comment（§15 多态：三 FK 至多一个 + 归属同 RO）', () => {
  it('挂接 Issue：评论成功 + 计数 + 详情含评论', async () => {
    const { deps, owner, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'suggestion' });
    const comment = await createComment(deps, { researchObjectId: ro.id, userId: owner.id, body: '我支持', issueId: issue.id });
    expect(comment.issueId).toBe(issue.id);
    const detail = await getIssue(deps, { researchObjectId: ro.id, userId: owner.id, issueId: issue.id });
    expect(detail.comments).toHaveLength(1);
    expect(detail.commentCount).toBe(1);
  });

  it('三 FK 全空 → COMMENT_TARGET_INVALID', async () => {
    const { deps, owner, ro } = await makeRo();
    await expect(
      createComment(deps, { researchObjectId: ro.id, userId: owner.id, body: '孤儿评论' }),
    ).rejects.toThrow(/必须且只能挂接一个目标/);
  });

  it('Issue 跨 RO → CROSS_RO_COMMENT', async () => {
    const { deps, owner, ro } = await makeRo();
    const ro2 = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO2' });
    const otherIssue = await createIssue(deps, { researchObjectId: ro2.id, userId: owner.id, title: 'other', kind: 'question' });
    await expect(
      createComment(deps, { researchObjectId: ro.id, userId: owner.id, body: '跨 RO', issueId: otherIssue.id }),
    ).rejects.toThrow(/目标 Issue 不属于/);
  });

  it('非成员评论 → 404（§17）', async () => {
    const { deps, db, owner, ro } = await makeRo();
    const issue = await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'question' });
    const outsider = seedUser(db, { id: 'issue-outsider4' });
    await expect(
      createComment(deps, { researchObjectId: ro.id, userId: outsider.id, body: 'x', issueId: issue.id }),
    ).rejects.toThrow(/空间不存在/);
  });
});
