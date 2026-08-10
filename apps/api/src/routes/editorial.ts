import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { getPublicEditorialCollection } from '@openscience/domain';

const collectionParams = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) });

/** Anonymous read surface. Only domain-filtered published selections are returned. */
export function registerEditorialRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/editorial/collections/:slug', async (req, reply) => {
    const { slug } = collectionParams.parse(req.params);
    return reply.send({ collection: await getPublicEditorialCollection(deps, slug) });
  });
}
