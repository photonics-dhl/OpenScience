import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StorageAdapter } from '@openscience/storage';
import { registerPaperFigure, requirePresentationWriteScope } from '@openscience/domain';
import type { AgentRouteDeps } from './agent';
import { requireCurrentUser } from './session-guard';

const paperFigureBody = z.object({
  figureId: z.string().min(1).max(200).refine((value) => value.trim().length > 0),
  sourceClaimId: z.string().uuid(),
  artifactId: z.string().uuid(),
  caption: z.string().max(200).optional(),
}).strict();

const paperFigureParams = z.object({
  researchObjectId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();

export function registerPaperFigureRoutes(app: FastifyInstance, deps: AgentRouteDeps & { storage?: StorageAdapter }): void {
  app.post('/research-objects/:researchObjectId/versions/:versionId/paper-figures', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = paperFigureParams.parse(req.params);
    const body = paperFigureBody.parse(req.body);
    await requirePresentationWriteScope(deps.prisma, { userId: user.userId, researchObjectId: params.researchObjectId.toLowerCase(), versionId: params.versionId.toLowerCase() });
    if (!deps.storage) return reply.status(503).send({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Paper figure storage is unavailable' } });
    const result = await registerPaperFigure(
      { prisma: deps.prisma, storage: deps.storage, audit: deps.audit, userId: user.userId },
      {
        researchObjectId: params.researchObjectId,
        versionId: params.versionId,
        figureId: body.figureId,
        sourceClaimId: body.sourceClaimId,
        artifactId: body.artifactId,
        ...(body.caption ? { caption: body.caption } : {}),
      },
    );
    return reply.status(201).send({ asset: result });
  });
}
