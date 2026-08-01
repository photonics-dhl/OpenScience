import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Membership } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { can, type WorkspaceAction } from '@openscience/domain';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const idParam = z.object({ id: z.string().uuid() });

declare module 'fastify' {
  interface FastifyRequest {
    /** P1A-5 守卫解析出的成员身份，仅供日志/调试；domain 仍自行重查（双层共源，签名不变）。 */
    workspaceMembership?: Membership;
  }
}

/**
 * P1A-5 API 授权边界（Spec §3.3/§17）：session → workspace 归属 → 角色矩阵。
 * 空间不存在或非成员 → 404（不泄露存在性）；成员但角色不足 → 403；未登录 → 401。
 */
export function requireWorkspaceAction(deps: AuthDeps, action: WorkspaceAction): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return; // 401 已由 session-guard 发送
    const { id } = idParam.parse(req.params);
    const workspace = await deps.prisma.workspace.findUnique({ where: { id } });
    const membership = workspace
      ? await deps.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId: id, userId: user.userId } },
        })
      : null;
    if (!workspace || !membership) {
      // audit(2.6): authz.deny（workspace 不存在或非成员；workspaceId 仅在空间存在时记录，不泄露存在性之外的额外信息）
      await deps.audit?.record({
        actorId: user.userId,
        action: 'authz.deny',
        workspaceId: workspace ? id : null,
        metadata: { reason: 'not_member', requiredAction: action },
        requestId: String(req.id),
        ip: req.ip,
      });
      return reply.status(404).send(buildErrorBody('WORKSPACE_NOT_FOUND', '空间不存在', String(req.id)));
    }
    if (!can(membership.role, action)) {
      // audit(2.6): authz.deny（角色不足）
      await deps.audit?.record({
        actorId: user.userId,
        action: 'authz.deny',
        workspaceId: id,
        metadata: { reason: 'role_insufficient', requiredAction: action },
        requestId: String(req.id),
        ip: req.ip,
      });
      return reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
    }
    req.workspaceMembership = membership;
  };
}
