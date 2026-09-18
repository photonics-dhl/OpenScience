import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StorageAdapter } from '@openscience/storage';
import type { Prisma, PrismaClient } from '@prisma/client';
import { registerPaperFigure, PresentationAssetError, requireMembership, WRITE_ROLES } from '@openscience/domain';
import type { AgentRouteDeps } from './agent';
import { requireCurrentUser } from './session-guard';

const paperFigureBody = z.object({
  figureId: z.string().min(1).max(200),
  sourceClaimId: z.string().uuid(),
  contentType: z.literal('image/png').optional(),
  caption: z.string().max(200).optional(),
  imageBase64: z.string().min(1).max(50 * 1024 * 1024),
}).strict();

const paperFigureParams = z.object({
  researchObjectId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();

export function registerPaperFigureRoutes(app: FastifyInstance, deps: AgentRouteDeps & { storage?: StorageAdapter }): void {
  app.post('/research-objects/:researchObjectId/versions/:versionId/paper-figures', { bodyLimit: 64 * 1024 * 1024 }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = paperFigureParams.parse(req.params);
    const body = paperFigureBody.parse(req.body);
    // Workspace membership + write role check (same gate as a presentation write).
    // The AgentRouteDeps.prisma type is narrow; widen for the version lookup.
    const versionRow = await (deps.prisma as unknown as PrismaClient).version.findUnique({
      where: { id: params.versionId },
      select: { id: true, researchObjectId: true, researchObject: { select: { workspaceId: true } } },
    });
    if (!versionRow || versionRow.researchObjectId !== params.researchObjectId) throw new PresentationAssetError('NOT_FOUND', 'Version not found for this research object');
    const { membership } = await requireMembership({ prisma: deps.prisma as unknown as Pick<Prisma.TransactionClient, 'workspace' | 'membership'> }, versionRow.researchObject.workspaceId, user.userId);
    if (!WRITE_ROLES.has(membership.role)) throw new PresentationAssetError('FORBIDDEN', 'Paper-original figures require a content-writing role in this workspace');
    const imageBytes = Buffer.from(body.imageBase64, 'base64');
    if (imageBytes.length === 0) throw new PresentationAssetError('VALIDATION_ERROR', 'imageBase64 decoded to an empty buffer');
    const result = await registerPaperFigure(
      { prisma: deps.prisma as unknown as PrismaClient, storage: deps.storage, userId: user.userId },
      {
        researchObjectId: params.researchObjectId,
        versionId: params.versionId,
        figureId: body.figureId,
        sourceClaimId: body.sourceClaimId,
        contentType: body.contentType ?? 'image/png',
        imageBytes,
        ...(body.caption ? { caption: body.caption } : {}),
      },
    );
    return reply.status(201).send({ asset: result });
  });
}
