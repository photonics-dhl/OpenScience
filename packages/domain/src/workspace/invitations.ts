import type { WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import { requireActive, requireMembership, requireTeam } from './helpers';
import { requireAction } from './permissions';
import { now, type WorkspaceDeps } from './types';

export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface InvitationInfo {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AcceptResult {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
}

const NOT_FOUND = () => new WorkspaceError('WORKSPACE_NOT_FOUND', '邀请不存在或已失效');

/** 邀请成员（owner/maintainer，team，active）：写 pending 邀请 + 通知邮件（MailOutbox 捕获通道）。 */
export async function inviteMember(
  deps: WorkspaceDeps,
  userId: string,
  input: { workspaceId: string; email: string; role: WorkspaceRole },
): Promise<{ invitationId: string }> {
  const { workspace, membership } = await requireMembership(deps, input.workspaceId, userId);
  requireAction(membership, 'invitation.create');
  requireTeam(workspace);
  requireActive(workspace);

  const targetUser = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (targetUser) {
    const existingMembership = await deps.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: targetUser.id } },
    });
    if (existingMembership) throw new WorkspaceError('ALREADY_MEMBER', '该用户已是空间成员');
  }
  const pending = await deps.prisma.workspaceInvitation.findFirst({
    where: { workspaceId: input.workspaceId, email: input.email, status: 'pending' },
  });
  if (pending) throw new WorkspaceError('INVITATION_PENDING_EXISTS', '该邮箱已有待处理邀请，可先撤销后重发');

  // audit(2.6): workspace.invitation.create
  const inv = await deps.prisma.workspaceInvitation.create({
    data: {
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      invitedBy: userId,
      expiresAt: new Date(now(deps).getTime() + INVITATION_TTL_MS),
    },
  });
  await deps.mailer.send({
    to: input.email,
    subject: `「${workspace.name}」邀请你加入工作区`,
    text: `你被邀请以 ${input.role} 角色加入工作区「${workspace.name}」。登录后在“我的工作区邀请”中接受或拒绝。邀请 7 天内有效。`,
  });
  return { invitationId: inv.id };
}

/** 我收到的待邀列表：pending 且未过期（过期惰性判定，不写库）。 */
export async function listMyInvitations(deps: WorkspaceDeps, email: string): Promise<InvitationInfo[]> {
  const at = now(deps);
  const rows = await deps.prisma.workspaceInvitation.findMany({ where: { email, status: 'pending' } });
  const out: InvitationInfo[] = [];
  for (const inv of rows) {
    if (inv.expiresAt <= at) continue;
    const ws = await deps.prisma.workspace.findUnique({ where: { id: inv.workspaceId } });
    out.push({
      id: inv.id,
      workspaceId: inv.workspaceId,
      workspaceName: ws?.name ?? '',
      role: inv.role,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    });
  }
  return out;
}

/**
 * 接受邀请（幂等）：guarded updateMany 转 accepted + membership upsert。
 * 并发/重试：已 accepted 且本人已是成员 → 返回既有 membership；其余一律 404。
 */
export async function acceptInvitation(
  deps: WorkspaceDeps,
  user: { userId: string; email: string },
  invitationId: string,
): Promise<AcceptResult> {
  const at = now(deps);
  const inv = await deps.prisma.workspaceInvitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase() || inv.expiresAt <= at) throw NOT_FOUND();
  return deps.prisma.$transaction(async (tx) => {
    const { count } = await tx.workspaceInvitation.updateMany({
      where: { id: inv.id, status: 'pending' },
      data: { status: 'accepted', respondedAt: at },
    });
    if (count !== 1) {
      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.userId } },
      });
      if (existing) return { id: existing.id, workspaceId: existing.workspaceId, userId: existing.userId, role: existing.role };
      throw NOT_FOUND();
    }
    // audit(2.6): workspace.invitation.accept
    const m = await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.userId } },
      create: { workspaceId: inv.workspaceId, userId: user.userId, role: inv.role },
      update: {},
    });
    return { id: m.id, workspaceId: m.workspaceId, userId: m.userId, role: m.role };
  });
}

/** 拒绝邀请：仅受邀者本人；非 pending 一律 404。 */
export async function declineInvitation(
  deps: WorkspaceDeps,
  user: { userId: string; email: string },
  invitationId: string,
): Promise<void> {
  const inv = await deps.prisma.workspaceInvitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase()) throw NOT_FOUND();
  // audit(2.6): workspace.invitation.decline
  const { count } = await deps.prisma.workspaceInvitation.updateMany({
    where: { id: inv.id, status: 'pending' },
    data: { status: 'declined', respondedAt: now(deps) },
  });
  if (count !== 1) throw NOT_FOUND();
}

/** 撤销邀请（owner/maintainer）：仅 pending 可撤。 */
export async function revokeInvitation(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  const { membership } = await requireMembership(deps, workspaceId, userId);
  requireAction(membership, 'invitation.revoke');
  // audit(2.6): workspace.invitation.revoke
  const { count } = await deps.prisma.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: 'pending' },
    data: { status: 'revoked', respondedAt: now(deps) },
  });
  if (count !== 1) throw NOT_FOUND();
}
