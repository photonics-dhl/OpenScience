import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { getReadingPreference, updateReadingPreference } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

const updateSchema = z.object({
  evidenceDefaultCollapsed: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export function registerReadingPreferenceRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/reading-preferences', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send(await getReadingPreference(deps, user.userId));
  });

  app.patch('/reading-preferences', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = updateSchema.parse(req.body);
    return reply.send(await updateReadingPreference(deps, {
      userId: user.userId,
      evidenceDefaultCollapsed: body.evidenceDefaultCollapsed,
      expectedVersion: body.expectedVersion,
    }));
  });
}
