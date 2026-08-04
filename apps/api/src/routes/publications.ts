import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { publishVersion, transitionVersionStatus } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** publications 路由依赖：AuthDeps + StorageAdapter + publicIdPrefix（§24）。 */
export type PublicationRouteDeps = AuthDeps & { storage: StorageAdapter; publicIdPrefix?: string };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const versionParams = z.object({ versionId: z.string().uuid() });

/**
 * P1D-8：/publications 发布 API（§2.1-6 + §4.1 + §6.1/§6.2 + §9.4 R3）。
 * POST /versions/:versionId/status   状态机推进（draft→under_review→approved 等）
 * POST /versions/:versionId/publish  发布（R3 确认 + AI 审核 + 许可前置）
 */
export function registerPublicationRoutes(app: FastifyInstance, deps: PublicationRouteDeps): void {
  app.post('/versions/:versionId/status', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { versionId } = versionParams.parse(req.params);
    const body = z.object({ status: z.enum(['draft', 'under_review', 'approved', 'published', 'revised', 'withdrawn', 'rejected', 'restricted']) }).parse(req.body);
    return reply.send({ version: await transitionVersionStatus(deps, { versionId, userId: user.userId, status: body.status }, auditCtx(req)) });
  });

  app.post('/versions/:versionId/publish', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { versionId } = versionParams.parse(req.params);
    const body = z.object({ r3Confirmed: z.boolean() }).parse(req.body);
    const published = await publishVersion(
      deps,
      { versionId, userId: user.userId, r3Confirmed: body.r3Confirmed, publicIdPrefix: deps.publicIdPrefix ?? 'OSR' },
      auditCtx(req),
    );
    return reply.status(201).send({ published });
  });
}
