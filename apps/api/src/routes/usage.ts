import type { FastifyInstance } from 'fastify';
import type { AuthDeps } from '@openscience/auth';
import { getUsageSnapshot } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

/** 用户侧配额/用量查询（P1A-7）：仅登录用户可查自己与所属 workspace。 */
export function registerUsageRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const snapshot = await getUsageSnapshot(deps, user.userId);
    return reply.send(snapshot);
  });
}
