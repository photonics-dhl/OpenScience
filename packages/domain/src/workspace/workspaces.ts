import { requireActive, requireMembership, requireRole, requireTeam, validateWorkspaceName } from './helpers';
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
): Promise<WorkspaceSummary> {
  const name = validateWorkspaceName(input.name);
  // audit(2.6): workspace.create
  const ws = await deps.prisma.workspace.create({
    data: { type: 'team', name, ownerId: input.userId, members: { create: { userId: input.userId, role: 'owner' } } },
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
): Promise<WorkspaceSummary> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  requireActive(workspace);
  const name = validateWorkspaceName(input.name);
  // audit(2.6): workspace.update
  const ws = await deps.prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  return { id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: membership.role, createdAt: ws.createdAt };
}

export async function archiveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  // audit(2.6): workspace.archive
  await deps.prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'archived' } });
}
