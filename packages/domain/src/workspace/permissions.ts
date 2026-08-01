import type { Membership, WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';

/**
 * P1A-5 RBAC：workspace 动作×角色矩阵（唯一事实源）。
 * API 守卫（apps/api workspace-guard）与 domain 内 requireAction 双层共源，均以本表为准。
 * 平台级角色（User.platformRole：moderator / platform_admin，迁移 4 预留）不参与本矩阵，
 * 未来平台守卫在 API 层单独判定；1B–1D 资源（RO/Branch/PR）各自导出矩阵片段复用 can() 机制。
 * C/D 类动作（member.leave / invitation.accept|decline / 认证即可端点）不经本矩阵，见 design spec §2。
 */

export const WORKSPACE_ACTIONS = [
  'workspace.read',
  'workspace.update',
  'workspace.archive',
  'workspace.transfer',
  'member.list',
  'member.change_role',
  'member.remove',
  'invitation.create',
  'invitation.revoke',
] as const;

export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number];

const ALL_ROLES: readonly WorkspaceRole[] = ['owner', 'maintainer', 'author', 'contributor', 'reviewer', 'viewer'];

export const ROLE_PERMISSIONS: Record<WorkspaceAction, readonly WorkspaceRole[]> = {
  'workspace.read': ALL_ROLES,
  'workspace.update': ['owner', 'maintainer'],
  'workspace.archive': ['owner'],
  'workspace.transfer': ['owner'],
  'member.list': ALL_ROLES,
  'member.change_role': ['owner'],
  'member.remove': ['owner', 'maintainer'],
  'invitation.create': ['owner', 'maintainer'],
  'invitation.revoke': ['owner', 'maintainer'],
};

export function can(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_PERMISSIONS[action].includes(role);
}

/** domain 纵深判定：角色不足抛 FORBIDDEN（与既有 requireRole 语义一致）。 */
export function requireAction(membership: Pick<Membership, 'role'>, action: WorkspaceAction): void {
  if (!can(membership.role, action)) throw new WorkspaceError('FORBIDDEN', '权限不足');
}
