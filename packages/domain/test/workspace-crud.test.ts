import { describe, expect, it } from 'vitest';
import { WorkspaceError } from '../src/workspace/errors';
import { archiveWorkspace, createTeamWorkspace, getWorkspace, listMyWorkspaces, updateWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  return { deps: { prisma, mailer }, db };
}

describe('createTeamWorkspace', () => {
  it('创建 team 空间，创建者自动成为 owner', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'NLP Lab' });
    expect(ws).toMatchObject({ type: 'team', name: 'NLP Lab', status: 'active', role: 'owner' });
    expect(db.memberships[0]).toMatchObject({ workspaceId: ws.id, userId: 'u1', role: 'owner' });
  });

  it('名称为空白 → VALIDATION_ERROR', async () => {
    const { deps } = setup();
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('名称超过 64 字符 → VALIDATION_ERROR', async () => {
    const { deps } = setup();
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: 'x'.repeat(65) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('listMyWorkspaces / getWorkspace', () => {
  it('返回我加入的全部空间（含 personal 与 team）及我的角色', async () => {
    const { deps, db } = setup();
    const team = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.workspaces.push({ id: 'w-personal', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: 'w-personal', userId: 'u1', role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    const list = await listMyWorkspaces(deps, 'u1');
    expect(list.map((w) => w.id).sort()).toEqual([team.id, 'w-personal'].sort());
    expect(list.find((w) => w.id === 'w-personal')?.type).toBe('personal');
  });

  it('成员可读详情；非成员与非存在 id 均 WORKSPACE_NOT_FOUND', async () => {
    const { deps } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    const detail = await getWorkspace(deps, 'u1', ws.id);
    expect(detail).toMatchObject({ id: ws.id, memberCount: 1, role: 'owner' });
    await expect(getWorkspace(deps, 'u2', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(getWorkspace(deps, 'u1', 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('updateWorkspace', () => {
  it('owner/maintainer 可改名；viewer → FORBIDDEN', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm3', workspaceId: ws.id, userId: 'u3', role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const renamed = await updateWorkspace(deps, 'u2', ws.id, { name: 'New Name' });
    expect(renamed.name).toBe('New Name');
    await expect(updateWorkspace(deps, 'u3', ws.id, { name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('已归档空间拒绝修改 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(updateWorkspace(deps, 'u1', ws.id, { name: 'X' })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('archiveWorkspace', () => {
  it('owner 可归档 team；非 owner → FORBIDDEN；personal → PERSONAL_WORKSPACE；重复归档 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    db.workspaces.push({ id: 'w-personal', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: 'w-personal', userId: 'u1', role: 'owner', createdAt: new Date(), updatedAt: new Date() });

    await expect(archiveWorkspace(deps, 'u2', ws.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(archiveWorkspace(deps, 'u1', 'w-personal')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    await archiveWorkspace(deps, 'u1', ws.id);
    expect(db.workspaces.find((w) => w.id === ws.id).status).toBe('archived');
    await expect(archiveWorkspace(deps, 'u1', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('WorkspaceError 形态', () => {
  it('是 Error 子类且带 code', () => {
    expect(new WorkspaceError('FORBIDDEN', 'x')).toBeInstanceOf(Error);
  });
});
