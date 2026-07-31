import type { WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import { requireActive, requireMembership, requireRole, requireTeam } from './helpers';
import type { WorkspaceDeps } from './types';

export interface MemberInfo {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: Date;
}

export async function listMembers(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<MemberInfo[]> {
  await requireMembership(deps, workspaceId, userId);
  const rows = await deps.prisma.membership.findMany({ where: { workspaceId } });
  const out: MemberInfo[] = [];
  for (const m of rows) {
    const user = await deps.prisma.user.findUnique({ where: { id: m.userId } });
    // 真实库中 FK 保证 user 存在；缺失行（如测试数据不全）时用回退值，不静默丢成员。
    out.push({ userId: m.userId, email: user?.email ?? '', displayName: user?.displayName ?? '', role: m.role, joinedAt: m.createdAt });
  }
  return out;
}

/** 变更角色（仅 owner）。改 owner 请走 transferOwnership。 */
export async function changeMemberRole(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  targetUserId: string,
  newRole: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  if (newRole === 'owner') throw new WorkspaceError('VALIDATION_ERROR', '变更所有权请使用转让接口');
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '该用户不是成员');
  if (target.role === 'owner') {
    const owners = await deps.prisma.membership.count({ where: { workspaceId, role: 'owner' } });
    if (owners <= 1) throw new WorkspaceError('LAST_OWNER', '空间至少保留一名 Owner');
  }
  // audit(2.6): workspace.member.changeRole
  await deps.prisma.membership.update({ where: { id: target.id }, data: { role: newRole as WorkspaceRole } });
}

/** 移除成员：owner 可移除任意非 owner；maintainer 只能移除普通成员；owner 不可被移除（先转让）。 */
export async function removeMember(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  requireTeam(workspace);
  requireActive(workspace);
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '该用户不是成员');
  if (target.role === 'owner') throw new WorkspaceError('FORBIDDEN', 'Owner 不可被移除，请先转让所有权');
  if (membership.role === 'maintainer' && target.role === 'maintainer') {
    throw new WorkspaceError('FORBIDDEN', 'Maintainer 不能移除同级成员');
  }
  // audit(2.6): workspace.member.remove
  await deps.prisma.membership.delete({ where: { id: target.id } });
}

/** 主动退出：owner 退出后剩余 owner 必须 ≥1（否则须先转让）。 */
export async function leaveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireTeam(workspace);
  if (membership.role === 'owner') {
    const owners = await deps.prisma.membership.count({ where: { workspaceId, role: 'owner' } });
    if (owners <= 1) throw new WorkspaceError('LAST_OWNER', 'Owner 退出前须先转让所有权');
  }
  // audit(2.6): workspace.member.leave
  await deps.prisma.membership.delete({ where: { id: membership.id } });
}

/** 转让所有权（仅 owner，team）：原 owner 降 maintainer、新 owner 升任、ownerId 更新，三步同事务。 */
export async function transferOwnership(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  newOwnerId: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
  });
  if (!target) throw new WorkspaceError('VALIDATION_ERROR', '新 Owner 必须是空间成员');
  // audit(2.6): workspace.transfer
  await deps.prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { role: 'maintainer' } });
    await tx.membership.update({ where: { id: target.id }, data: { role: 'owner' } });
    await tx.workspace.update({ where: { id: workspaceId }, data: { ownerId: newOwnerId } });
  });
}
