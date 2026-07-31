import type { Workspace, Membership, WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import type { WorkspaceDeps } from './types';

/** 成员身份前置：空间不存在或当前用户非成员，统一 404（不泄露空间存在性）。 */
export async function requireMembership(
  deps: WorkspaceDeps,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const workspace = await deps.prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  return { workspace, membership };
}

export function requireRole(membership: Membership, roles: WorkspaceRole[]): void {
  if (!roles.includes(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
}

export function requireActive(workspace: Workspace): void {
  if (workspace.status === 'archived') throw new WorkspaceError('WORKSPACE_ARCHIVED', '空间已归档，仅支持只读');
}

export function requireTeam(workspace: Workspace): void {
  if (workspace.type === 'personal') throw new WorkspaceError('PERSONAL_WORKSPACE', '个人空间不支持此操作');
}

export function validateWorkspaceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) throw new WorkspaceError('VALIDATION_ERROR', '名称长度需为 1-64 字符');
  return trimmed;
}
