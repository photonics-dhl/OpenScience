import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EXPLORE_ARTIFACT_TYPES, listPublicResearchIndex } from '@openscience/domain';
import type { AuthDeps } from '@openscience/auth';

const exploreQuery = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  field: z.enum(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']).optional(),
  artifactType: z.enum(EXPLORE_ARTIFACT_TYPES).optional(),
});

/** Anonymous, read-only index of published public Research Objects. */
export function registerExploreRoutes(app: FastifyInstance, deps: Pick<AuthDeps, 'prisma'>): void {
  app.get('/explore', async (req, reply) => {
    const parsed = exploreQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid explore filters' } });
    }
    return reply.send(await listPublicResearchIndex(deps, parsed.data));
  });
}
