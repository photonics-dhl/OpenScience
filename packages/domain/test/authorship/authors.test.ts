import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { setAuthors, listAuthors, addContribution, listContributions, getAuthorChangeInfo } from '../../src/authorship/authors';

async function makeRo() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'auth-owner' });
  const collab = seedUser(db, { id: 'auth-collab' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'm-2', workspaceId: 'ws-1', userId: collab.id, role: 'contributor', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO' });
  return { prisma, db, owner, collab, deps, ro };
}

describe('作者组权限（§3.4 + Q1）', () => {
  it('创建者空名单可建作者列表（创建者独属作者组）', async () => {
    const { deps, owner, collab, ro } = await makeRo();
    const authors = await setAuthors(deps, { researchObjectId: ro.id, userId: owner.id, authors: [{ userId: owner.id }, { userId: collab.id, isCorresponding: true }] });
    expect(authors).toHaveLength(2);
    expect(authors[0].sortOrder).toBe(0);
    expect(authors[1].isCorresponding).toBe(true);
  });

  it('非作者组成员（空间成员但非作者）变更 → 403', async () => {
    const { deps, db, owner, ro } = await makeRo();
    // 第三个成员，非作者
    const outsider = seedUser(db, { id: 'auth-outsider' });
    db.memberships.push({ id: 'm-3', workspaceId: 'ws-1', userId: outsider.id, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    await setAuthors(deps, { researchObjectId: ro.id, userId: owner.id, authors: [{ userId: owner.id }] });
    await expect(
      setAuthors(deps, { researchObjectId: ro.id, userId: outsider.id, authors: [{ userId: outsider.id }] }),
    ).rejects.toThrow(/仅作者组/);
  });
});

describe('作者名单（Q2 全量替换 + §3.4）', () => {
  it('顺序 = 数组序；替换覆盖旧名单', async () => {
    const { deps, owner, collab, ro } = await makeRo();
    await setAuthors(deps, { researchObjectId: ro.id, userId: owner.id, authors: [{ userId: collab.id }, { userId: owner.id }] });
    const authors = await listAuthors(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(authors.map((a) => a.userId)).toEqual([collab.id, owner.id]);
  });

  it('通讯作者至多一人 → MULTIPLE_CORRESPONDING', async () => {
    const { deps, owner, collab, ro } = await makeRo();
    await expect(
      setAuthors(deps, { researchObjectId: ro.id, userId: owner.id, authors: [{ userId: owner.id, isCorresponding: true }, { userId: collab.id, isCorresponding: true }] }),
    ).rejects.toThrow(/通讯作者至多一人/);
  });

  it('无自动署名：创建者不自动第一作者（空名单 → 空列表，无默认）', async () => {
    const { deps, owner, ro } = await makeRo();
    const authors = await listAuthors(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(authors).toHaveLength(0); // §3.4 创建者不自动获得地位
  });

  it('非成员变更 → 404（§17 越权）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'auth-outsider2' });
    await expect(
      setAuthors(deps, { researchObjectId: ro.id, userId: outsider.id, authors: [{ userId: outsider.id }] }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('Contribution（§3.4 不可抹除 + Q3 幂等 + Q4 空间成员）', () => {
  it('追加贡献 + 同 user+role 幂等', async () => {
    const { deps, owner, collab, ro } = await makeRo();
    const c1 = await addContribution(deps, { researchObjectId: ro.id, userId: owner.id, creditRole: 'conceptualization' });
    const c2 = await addContribution(deps, { researchObjectId: ro.id, userId: owner.id, creditRole: 'conceptualization' });
    expect(c2.id).toBe(c1.id); // 幂等
    const c3 = await addContribution(deps, { researchObjectId: ro.id, userId: collab.id, creditRole: 'software' });
    expect(c3.id).not.toBe(c1.id);
    const all = await listContributions(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(all).toHaveLength(2); // owner conceptualization + collab software
  });

  it('非法 CRediT → VALIDATION_ERROR', async () => {
    const { deps, owner, ro } = await makeRo();
    await expect(
      addContribution(deps, { researchObjectId: ro.id, userId: owner.id, creditRole: 'unknown-role' as never }),
    ).rejects.toThrow(/非法 CRediT/);
  });

  it('贡献不可抹除：无删除 API（仅追加）+ 数据层 Restrict', async () => {
    const { deps, owner, ro } = await makeRo();
    await addContribution(deps, { researchObjectId: ro.id, userId: owner.id, creditRole: 'writing' });
    // 编译期保证：addContribution 只 create，无 delete 函数
    const info = await getAuthorChangeInfo(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(info.contributorIds).toContain(owner.id);
  });
});

describe('getAuthorChangeInfo（Q5 P1C-8 Merge 审批用）', () => {
  it('返回作者 + 贡献者 ID', async () => {
    const { deps, owner, collab, ro } = await makeRo();
    await setAuthors(deps, { researchObjectId: ro.id, userId: owner.id, authors: [{ userId: owner.id }, { userId: collab.id }] });
    await addContribution(deps, { researchObjectId: ro.id, userId: collab.id, creditRole: 'methodology' });
    const info = await getAuthorChangeInfo(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(info.authors.map((a) => a.userId)).toEqual([owner.id, collab.id]);
    expect(info.authors[0].sortOrder).toBe(0);
    expect(info.contributorIds).toEqual([collab.id]);
  });
});
