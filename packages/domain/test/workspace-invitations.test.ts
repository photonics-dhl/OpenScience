import { describe, expect, it } from 'vitest';
import { acceptInvitation, declineInvitation, inviteMember, listMyInvitations, revokeInvitation } from '../src/workspace/invitations';
import { createTeamWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

const AT = new Date('2026-07-29T00:00:00.000Z');

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  const deps = { prisma, mailer, now: () => AT };
  return { deps, db, mailer };
}

function addMember(db: ReturnType<typeof createFakePrisma>['db'], workspaceId: string, userId: string, role: string) {
  db.memberships.push({ id: `m-${userId}`, workspaceId, userId, role, createdAt: new Date(), updatedAt: new Date() });
}

async function seedInvitation(db: ReturnType<typeof createFakePrisma>['db'], overrides: Record<string, unknown> = {}) {
  const inv = {
    id: `inv-${db.workspaceInvitations.length + 1}`,
    workspaceId: 'w1',
    email: 'invitee@example.com',
    role: 'author',
    status: 'pending',
    invitedBy: 'u1',
    expiresAt: new Date(AT.getTime() + 7 * 24 * 3600 * 1000),
    respondedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
  db.workspaceInvitations.push(inv);
  return inv;
}

describe('inviteMember', () => {
  it('创建 pending 邀请（7 天过期 + 预指派角色）并发出通知邮件', async () => {
    const { deps, db, mailer } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    const { invitationId } = await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'x@example.com', role: 'author' });
    const inv = db.workspaceInvitations.find((i) => i.id === invitationId);
    expect(inv).toMatchObject({ status: 'pending', role: 'author', invitedBy: 'u1' });
    expect(inv.expiresAt.getTime() - AT.getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('x@example.com');
  });

  it('受邀邮箱已是成员 → ALREADY_MEMBER；同邮箱已有待邀 → INVITATION_PENDING_EXISTS', async () => {
    const { deps, db } = setup();
    seedUser(db, { id: 'u2', email: 'b@example.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'b@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'c@example.com', role: 'viewer' });
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'c@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'INVITATION_PENDING_EXISTS' });
  });

  it('author 邀请 → FORBIDDEN；personal → PERSONAL_WORKSPACE；archived → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await expect(inviteMember(deps, 'u2', { workspaceId: ws.id, email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(inviteMember(deps, 'u1', { workspaceId: 'w-p', email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('listMyInvitations', () => {
  it('只返回我的 pending 且未过期邀请，含空间名', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w1', type: 'team', name: 'Lab', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedInvitation(db, { id: 'ok' });
    await seedInvitation(db, { id: 'expired', expiresAt: new Date(AT.getTime() - 1000) });
    await seedInvitation(db, { id: 'other', email: 'someone@example.com' });
    await seedInvitation(db, { id: 'done', status: 'accepted' });
    const list = await listMyInvitations(deps, 'invitee@example.com');
    expect(list.map((i) => i.id)).toEqual(['ok']);
    expect(list[0].workspaceName).toBe('Lab');
  });
});

describe('acceptInvitation', () => {
  it('接受成功：创建 membership（预指派角色）+ 邀请转 accepted', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    const result = await acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(result).toMatchObject({ workspaceId: 'w1', userId: 'u9', role: 'author' });
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'accepted', respondedAt: AT });
  });

  it('重复 accept 幂等：返回同一 membership，不报错', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    const user = { userId: 'u9', email: 'invitee@example.com' };
    const first = await acceptInvitation(deps, user, inv.id);
    const second = await acceptInvitation(deps, user, inv.id);
    expect(second.id).toBe(first.id);
    expect(db.memberships.filter((m) => m.userId === 'u9')).toHaveLength(1);
  });

  it('accept 前已是成员（并发兜底路径）：upsert 返回既有 membership，不重复建行', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    addMember(db, 'w1', 'u9', 'viewer');
    const result = await acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(result.id).toBe('m-u9');
    expect(db.memberships.filter((m) => m.userId === 'u9')).toHaveLength(1);
  });

  it('邮箱不匹配 / 已过期 / 已 decline → 统一 WORKSPACE_NOT_FOUND（枚举面控制）', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    await expect(acceptInvitation(deps, { userId: 'u8', email: 'other@example.com' }, inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const expired = await seedInvitation(db, { id: 'exp', expiresAt: new Date(AT.getTime() - 1000) });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, expired.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const declined = await seedInvitation(db, { id: 'dec', status: 'declined' });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, declined.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('declineInvitation', () => {
  it('受邀者本人可 decline；重复 decline 或他人操作 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    await declineInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'declined', respondedAt: AT });
    await expect(declineInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const inv2 = await seedInvitation(db, { id: 'i2' });
    await expect(declineInvitation(deps, { userId: 'u8', email: 'other@example.com' }, inv2.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('revokeInvitation', () => {
  it('owner/maintainer 可撤销 pending 邀请；author → FORBIDDEN；不存在/已处理 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w1', type: 'team', name: 'Lab', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w1', 'u1', 'owner');
    addMember(db, 'w1', 'u2', 'author');
    const inv = await seedInvitation(db);

    await expect(revokeInvitation(deps, 'u2', 'w1', inv.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await revokeInvitation(deps, 'u1', 'w1', inv.id);
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'revoked' });
    await expect(revokeInvitation(deps, 'u1', 'w1', inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(revokeInvitation(deps, 'u1', 'w1', 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});
