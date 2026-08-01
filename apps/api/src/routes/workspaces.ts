import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  acceptInvitation,
  archiveWorkspace,
  changeMemberRole,
  createTeamWorkspace,
  declineInvitation,
  getWorkspace,
  inviteMember,
  leaveWorkspace,
  listMembers,
  listMyInvitations,
  listMyWorkspaces,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateWorkspace,
} from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';
import { requireWorkspaceAction } from './workspace-guard';

export type WorkspaceRouteDeps = AuthDeps;

/** P1A-6：请求级审计上下文（requestId/ip），随写操作尾参传入 domain。读路由不传。 */
function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const nonOwnerRoleSchema = z.enum(['maintainer', 'author', 'contributor', 'reviewer', 'viewer']);
const idParams = z.object({ id: z.string().uuid() });
const invIdParams = z.object({ id: z.string().uuid(), invId: z.string().uuid() });
const memberParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const nameBody = z.object({ name: z.string().min(1).max(64) });
const inviteBody = z.object({ email: z.string().email(), role: nonOwnerRoleSchema });
const changeRoleBody = z.object({ role: nonOwnerRoleSchema });
const transferBody = z.object({ newOwnerId: z.string().uuid() });

export function registerWorkspaceRoutes(app: FastifyInstance, deps: WorkspaceRouteDeps): void {
  app.get('/', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ workspaces: await listMyWorkspaces(deps, user.userId) });
  });

  app.post('/', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = nameBody.parse(req.body);
    const ws = await createTeamWorkspace(deps, { userId: user.userId, name: body.name }, auditCtx(req));
    return reply.status(201).send(ws);
  });

  app.get('/invitations', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ invitations: await listMyInvitations(deps, user.email) });
  });

  app.post('/invitations/:id/accept', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const membership = await acceptInvitation(deps, { userId: user.userId, email: user.email }, id, auditCtx(req));
    return reply.status(201).send(membership);
  });

  app.post('/invitations/:id/decline', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await declineInvitation(deps, { userId: user.userId, email: user.email }, id, auditCtx(req));
    return reply.status(204).send();
  });

  app.get('/:id', { preHandler: requireWorkspaceAction(deps, 'workspace.read') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    return reply.send(await getWorkspace(deps, user.userId, id));
  });

  app.patch('/:id', { preHandler: requireWorkspaceAction(deps, 'workspace.update') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = nameBody.parse(req.body);
    return reply.send(await updateWorkspace(deps, user.userId, id, body, auditCtx(req)));
  });

  app.post('/:id/archive', { preHandler: requireWorkspaceAction(deps, 'workspace.archive') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await archiveWorkspace(deps, user.userId, id, auditCtx(req));
    return reply.status(204).send();
  });

  app.get('/:id/members', { preHandler: requireWorkspaceAction(deps, 'member.list') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    return reply.send({ members: await listMembers(deps, user.userId, id) });
  });

  app.post('/:id/invitations', { preHandler: requireWorkspaceAction(deps, 'invitation.create') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = inviteBody.parse(req.body);
    const result = await inviteMember(deps, user.userId, { workspaceId: id, email: body.email, role: body.role }, auditCtx(req));
    return reply.status(202).send(result);
  });

  app.delete('/:id/invitations/:invId', { preHandler: requireWorkspaceAction(deps, 'invitation.revoke') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, invId } = invIdParams.parse(req.params);
    await revokeInvitation(deps, user.userId, id, invId, auditCtx(req));
    return reply.status(204).send();
  });

  app.patch('/:id/members/:userId', { preHandler: requireWorkspaceAction(deps, 'member.change_role') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, userId } = memberParams.parse(req.params);
    const body = changeRoleBody.parse(req.body);
    await changeMemberRole(deps, user.userId, id, userId, body.role, auditCtx(req));
    return reply.status(204).send();
  });

  app.delete('/:id/members/:userId', { preHandler: requireWorkspaceAction(deps, 'member.remove') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, userId } = memberParams.parse(req.params);
    await removeMember(deps, user.userId, id, userId, auditCtx(req));
    return reply.status(204).send();
  });

  app.post('/:id/leave', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await leaveWorkspace(deps, user.userId, id, auditCtx(req));
    return reply.status(204).send();
  });

  app.post('/:id/transfer', { preHandler: requireWorkspaceAction(deps, 'workspace.transfer') }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = transferBody.parse(req.body);
    await transferOwnership(deps, user.userId, id, body.newOwnerId, auditCtx(req));
    return reply.status(204).send();
  });
}
