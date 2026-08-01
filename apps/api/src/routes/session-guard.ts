import type { FastifyReply, FastifyRequest } from 'fastify';
import { getCurrentUser, type AuthDeps, type CurrentUser } from '@openscience/auth';
import { buildErrorBody } from '@openscience/observability';

export const SESSION_COOKIE = 'openscience_session';

export function sessionTokenFrom(req: FastifyRequest): string | null {
  return req.cookies[SESSION_COOKIE] ?? null;
}

/**
 * 受保护端点统一入口：无 token → 就地回 401 并返回 null；
 * token 无效/账户未激活 → AuthError 上抛，由全局 error handler 映射（401/403）。
 * 2.5 RBAC 将在此基础上扩展 workspace 角色守卫。
 */
export async function requireCurrentUser(
  deps: AuthDeps,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<CurrentUser | null> {
  const token = sessionTokenFrom(req);
  if (!token) {
    void reply.status(401).send(buildErrorBody('SESSION_INVALID', '未登录', String(req.id)));
    return null;
  }
  return getCurrentUser(deps, token);
}
