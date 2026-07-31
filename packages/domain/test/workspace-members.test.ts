import { describe, expect, it } from 'vitest';
import { changeMemberRole, leaveWorkspace, listMembers, removeMember, transferOwnership } from '../src/workspace/members';
import { createTeamWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  return { deps: { prisma, mailer }, db };
}

function addMember(db: ReturnType<typeof createFakePrisma>['db'], workspaceId: string, userId: string, role: string) {
  db.memberships.push({ id: `m-${userId}`, workspaceId, userId, role, createdAt: new Date(), updatedAt: new Date() });
}

describe('listMembers', () => {
  it('成员可见成员列表；非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    seedUser(db, { id: 'u2', email: 'b@example.com', displayName: 'Bob' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    const members = await listMembers(deps, 'u2', ws.id);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === 'u2')).toMatchObject({ email: 'b@example.com', role: 'author' });
    await expect(listMembers(deps, 'u3', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('changeMemberRole', () => {
  it('owner 可变更角色；maintainer → FORBIDDEN；改成 owner → VALIDATION_ERROR；目标非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    addMember(db, ws.id, 'u3', 'maintainer');

    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'reviewer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('reviewer');
    await expect(changeMemberRole(deps, 'u3', ws.id, 'u2', 'viewer')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u2', 'owner')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u9', 'viewer')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });

  it('降级最后一个 owner → LAST_OWNER；存在第二 owner 时允许降级', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u1', 'maintainer')).rejects.toMatchObject({ code: 'LAST_OWNER' });
    addMember(db, ws.id, 'u2', 'owner');
    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'maintainer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('maintainer');
  });

  it('personal 空间拒绝角色变更 → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');
    await expect(changeMemberRole(deps, 'u1', 'w-p', 'u1', 'viewer')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('removeMember', () => {
  it('owner 可移除任意非 owner；maintainer 只能移除普通成员；移除 owner → FORBIDDEN；目标非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'maintainer');
    addMember(db, ws.id, 'u3', 'author');
    addMember(db, ws.id, 'u4', 'owner');

    await expect(removeMember(deps, 'u2', ws.id, 'u2')).rejects.toMatchObject({ code: 'FORBIDDEN' }); // maintainer 移除 maintainer
    await expect(removeMember(deps, 'u1', ws.id, 'u4')).rejects.toMatchObject({ code: 'FORBIDDEN' }); // owner 不可被移除
    await expect(removeMember(deps, 'u1', ws.id, 'u9')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await removeMember(deps, 'u2', ws.id, 'u3'); // maintainer 移除 author：允许
    expect(db.memberships.find((m) => m.userId === 'u3')).toBeUndefined();
  });

  it('personal 空间拒绝移除成员 → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');
    await expect(removeMember(deps, 'u1', 'w-p', 'u1')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('leaveWorkspace', () => {
  it('普通成员可退出；最后一个 owner 退出 → LAST_OWNER；personal → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await leaveWorkspace(deps, 'u2', ws.id);
    expect(db.memberships.find((m) => m.userId === 'u2')).toBeUndefined();
    await expect(leaveWorkspace(deps, 'u1', ws.id)).rejects.toMatchObject({ code: 'LAST_OWNER' });
    await expect(leaveWorkspace(deps, 'u1', 'w-p')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('transferOwnership', () => {
  it('转让成功：原 owner 降 maintainer、新 owner 升任、ownerId 更新', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await transferOwnership(deps, 'u1', ws.id, 'u2');
    expect(db.memberships.find((m) => m.userId === 'u1').role).toBe('maintainer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('owner');
    expect(db.workspaces.find((w) => w.id === ws.id).ownerId).toBe('u2');
  });

  it('非 owner 发起 → FORBIDDEN；转给非成员 → VALIDATION_ERROR；personal → PERSONAL_WORKSPACE；已归档 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'maintainer');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await expect(transferOwnership(deps, 'u2', ws.id, 'u2')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(transferOwnership(deps, 'u1', ws.id, 'u9')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(transferOwnership(deps, 'u1', 'w-p', 'u1')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(transferOwnership(deps, 'u1', ws.id, 'u2')).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});
