import type { Membership, Prisma, Workspace } from '@prisma/client';
import { WorkspaceError } from './errors';

type MembershipDb = Pick<Prisma.TransactionClient, 'workspace' | 'membership'>;

async function findMembership(
  db: MembershipDb,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  return { workspace, membership };
}

/** 成员身份前置：空间不存在或当前用户非成员，统一 404（不泄露空间存在性）。 */
export async function requireMembership(
  deps: { prisma: MembershipDb },
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  return findMembership(deps.prisma, workspaceId, userId);
}

/** Transaction-aware write guard: membership and archived state are read from one snapshot. */
export async function requireActiveMembership(
  db: MembershipDb,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const result = await findMembership(db, workspaceId, userId);
  requireActive(result.workspace);
  return result;
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
