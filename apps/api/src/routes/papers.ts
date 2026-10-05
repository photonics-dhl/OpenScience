import type { FastifyInstance } from 'fastify';
import type { AuthDeps } from '@openscience/auth';
import { getPublicPaperByDoi, lookupPaperInWorkspace, setResearchObjectOriginalDoi } from '@openscience/domain';
import { z } from 'zod';
import { requireCurrentUser } from './session-guard';

type Deps = AuthDeps;
const query = z.object({ doi: z.string().min(1).max(300) }).strict();
const workspaceQuery = query.extend({ workspaceId: z.string().uuid() });

export function registerPaperRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/papers/by-doi', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { doi } = query.parse(request.query);
    const paper = await getPublicPaperByDoi(deps, doi);
    if (!paper) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '未找到公开论文解读' } });
    return { paper };
  });
  app.get('/papers/lookup', async (request, reply) => {
    const user = await requireCurrentUser(deps, request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const { doi, workspaceId } = workspaceQuery.parse(request.query);
    return lookupPaperInWorkspace(deps, user.userId, workspaceId, doi);
  });
  app.patch('/research-objects/:id/original-doi', async (request, reply) => {
    const user = await requireCurrentUser(deps, request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ doi: z.string().min(1).max(300).nullable(), expectedVersion: z.number().int().positive() }).strict().parse(request.body);
    return setResearchObjectOriginalDoi(deps, user.userId, id, body.expectedVersion, body.doi);
  });
}
