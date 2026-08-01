import type { AuditContext } from '@openscience/observability';
import { recordAudit } from './audit';
import { requireActive, requireMembership, requireTeam, validateWorkspaceName } from './helpers';
import { requireAction } from './permissions';
import type { WorkspaceDeps } from './types';

export interface WorkspaceSummary {
  id: string;
  type: string;
  name: string;
  status: string;
  role: string;
  createdAt: Date;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  memberCount: number;
}

export async function listMyWorkspaces(deps: WorkspaceDeps, userId: string): Promise<WorkspaceSummary[]> {
  const rows = await deps.prisma.membership.findMany({ where: { userId } });
  const out: WorkspaceSummary[] = [];
  for (const m of rows) {
    const ws = await deps.prisma.workspace.findUnique({ where: { id: m.workspaceId } });
    if (ws) out.push({ id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: m.role, createdAt: ws.createdAt });
  }
  return out;
}

export async function createTeamWorkspace(
  deps: WorkspaceDeps,
  input: { userId: string; name: string },
  ctx: AuditContext = {},
): Promise<WorkspaceSummary> {
  const name = validateWorkspaceName(input.name);
  const ws = await deps.prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: { type: 'team', name, ownerId: input.userId, members: { create: { userId: input.userId, role: 'owner' } } },
    });
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'workspace.create', workspaceId: created.id,
      targetType: 'workspace', targetId: created.id, metadata: { name },
    }, ctx);
    return created;
  });
  return { id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: 'owner', createdAt: ws.createdAt };
}

export async function getWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<WorkspaceDetail> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  const memberCount = await deps.prisma.membership.count({ where: { workspaceId } });
  return {
    id: workspace.id,
    type: workspace.type,
    name: workspace.name,
    status: workspace.status,
    role: membership.role,
    createdAt: workspace.createdAt,
    memberCount,
  };
}

export async function updateWorkspace(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  input: { name: string },
  ctx: AuditContext = {},
): Promise<WorkspaceSummary> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireAction(membership, 'workspace.update');
  requireActive(workspace);
  const name = validateWorkspaceName(input.name);
  const ws = await deps.prisma.$transaction(async (tx) => {
    const u = await tx.workspace.update({ where: { id: workspaceId }, data: { name } });
    await recordAudit(deps, tx, {
      actorId: userId, action: 'workspace.update', workspaceId,
      targetType: 'workspace', targetId: workspaceId, metadata: { name },
    }, ctx);
    return u;
  });
  return { id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: membership.role, createdAt: ws.createdAt };
}

export async function archiveWorkspace(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  ctx: AuditContext = {},
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireAction(membership, 'workspace.archive');
  requireTeam(workspace);
  requireActive(workspace);
  await deps.prisma.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { status: 'archived' } });
    await recordAudit(deps, tx, {
      actorId: userId, action: 'workspace.archive', workspaceId,
      targetType: 'workspace', targetId: workspaceId, metadata: { status: 'archived' },
    }, ctx);
  });
}
