import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditSink } from '@openscience/observability';
import { changeMemberRole, leaveWorkspace, removeMember, transferOwnership } from '../src/workspace/members';
import { archiveWorkspace, createTeamWorkspace, updateWorkspace } from '../src/workspace/workspaces';
import { acceptInvitation, declineInvitation, inviteMember, revokeInvitation } from '../src/workspace/invitations';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

const AT = new Date('2026-08-01T00:00:00.000Z');

function setup() {
  const { prisma, db } = createFakePrisma();
  const events: AuditEvent[] = [];
  const audit: AuditSink = { record: async (e) => { events.push(e); } };
  return { deps: { prisma, mailer: createFakeMailer(), now: () => AT, audit }, db, events };
}

function addMember(db: ReturnType<typeof createFakePrisma>['db'], workspaceId: string, userId: string, role: string) {
  db.memberships.push({ id: `m-${userId}`, workspaceId, userId, role, createdAt: AT, updatedAt: AT });
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

const CTX = { requestId: 'req-1', ip: '127.0.0.1' };

describe('workspace 写操作审计（Spec §17 全部写操作）', () => {
  it('workspace.create：审计行含 action/actor/ctx，且随业务产生', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' }, CTX);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'u1', action: 'workspace.create', workspaceId: ws.id,
      targetType: 'workspace', targetId: ws.id, requestId: 'req-1', ip: '127.0.0.1',
    });
  });

  it('workspace.update / archive：targetId 为空间 id', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await updateWorkspace(deps, 'u1', ws.id, { name: 'Lab2' }, CTX);
    await archiveWorkspace(deps, 'u1', ws.id, CTX);
    expect(events.map((e) => e.action)).toEqual(['workspace.create', 'workspace.update', 'workspace.archive']);
    const upd = events.find((e) => e.action === 'workspace.update');
    const arc = events.find((e) => e.action === 'workspace.archive');
    expect(upd).toMatchObject({ actorId: 'u1', targetType: 'workspace', targetId: ws.id, metadata: { name: 'Lab2' } });
    expect(arc).toMatchObject({ actorId: 'u1', targetType: 'workspace', targetId: ws.id, metadata: { status: 'archived' } });
  });

  it('workspace.member.changeRole：metadata 记 fromRole→toRole', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'reviewer', CTX);
    const ev = events.find((e) => e.action === 'workspace.member.changeRole');
    expect(ev).toMatchObject({ actorId: 'u1', targetType: 'user', targetId: 'u2', metadata: { fromRole: 'author', toRole: 'reviewer' } });
  });

  it('workspace.member.remove：actorId 为操作者，targetId 为被移除者', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await removeMember(deps, 'u1', ws.id, 'u2', CTX);
    const ev = events.find((e) => e.action === 'workspace.member.remove');
    expect(ev).toMatchObject({ actorId: 'u1', workspaceId: ws.id, targetType: 'user', targetId: 'u2', metadata: { role: 'author' } });
  });

  it('workspace.member.leave：actorId/targetId 均为退出者本人', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await leaveWorkspace(deps, 'u2', ws.id, CTX);
    const ev = events.find((e) => e.action === 'workspace.member.leave');
    expect(ev).toMatchObject({ actorId: 'u2', workspaceId: ws.id, targetType: 'user', targetId: 'u2', metadata: { role: 'author' } });
  });

  it('workspace.transfer：metadata 记 newOwnerId', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'maintainer');
    await transferOwnership(deps, 'u1', ws.id, 'u2', CTX);
    expect(events.find((e) => e.action === 'workspace.transfer')).toMatchObject({
      actorId: 'u1', workspaceId: ws.id, targetType: 'user', targetId: 'u2', metadata: { newOwnerId: 'u2' },
    });
  });

  it('workspace.invitation.create：metadata 不含邮箱明文', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'new@x.com', role: 'author' }, CTX);
    const ev = events.find((e) => e.action === 'workspace.invitation.create');
    expect(ev).toMatchObject({ actorId: 'u1', workspaceId: ws.id, targetType: 'invitation' });
    expect(JSON.stringify(ev?.metadata)).not.toContain('new@x.com');
  });

  it('workspace.invitation.accept：actorId 为受邀者', async () => {
    const { deps, db, events } = setup();
    const inv = await seedInvitation(db);
    await acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id, CTX);
    const ev = events.find((e) => e.action === 'workspace.invitation.accept');
    expect(ev).toMatchObject({ actorId: 'u9', workspaceId: 'w1', targetType: 'invitation', targetId: inv.id, metadata: { role: 'author' } });
  });

  it('workspace.invitation.decline：actorId 为受邀者', async () => {
    const { deps, db, events } = setup();
    const inv = await seedInvitation(db);
    await declineInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id, CTX);
    const ev = events.find((e) => e.action === 'workspace.invitation.decline');
    expect(ev).toMatchObject({ actorId: 'u9', workspaceId: 'w1', targetType: 'invitation', targetId: inv.id });
  });

  it('workspace.invitation.revoke：actorId 为操作者', async () => {
    const { deps, db, events } = setup();
    db.workspaces.push({ id: 'w1', type: 'team', name: 'Lab', ownerId: 'u1', status: 'active', createdAt: AT, updatedAt: AT });
    addMember(db, 'w1', 'u1', 'owner');
    const inv = await seedInvitation(db);
    await revokeInvitation(deps, 'u1', 'w1', inv.id, CTX);
    const ev = events.find((e) => e.action === 'workspace.invitation.revoke');
    expect(ev).toMatchObject({ actorId: 'u1', workspaceId: 'w1', targetType: 'invitation', targetId: inv.id });
  });

  it('sink throw → 业务操作 reject（同事务语义）', async () => {
    const { prisma } = createFakePrisma();
    const audit: AuditSink = { record: async () => { throw new Error('audit down'); } };
    const deps = { prisma, mailer: createFakeMailer(), audit };
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' })).rejects.toThrow('audit down');
  });

  it('audit 缺省：行为与现状完全一致（零审计零报错）', async () => {
    const { prisma, db } = createFakePrisma();
    const deps = { prisma, mailer: createFakeMailer() };
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    expect(db.workspaces).toHaveLength(1);
    expect(ws.role).toBe('owner');
  });
});
