import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Membership } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { can, type WorkspaceAction } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

const NOT_FOUND_BODY = { error: { code: 'WORKSPACE_NOT_FOUND', message: '空间不存在' } } as const;
const FORBIDDEN_BODY = { error: { code: 'FORBIDDEN', message: '权限不足' } } as const;
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
      // audit(2.6): authz.deny（workspace 不存在或非成员）
      return reply.status(404).send(NOT_FOUND_BODY);
    }
    if (!can(membership.role, action)) {
      // audit(2.6): authz.deny（角色不足）
      return reply.status(403).send(FORBIDDEN_BODY);
    }
    req.workspaceMembership = membership;
  };
}
