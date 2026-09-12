import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCurrentUser } from '@openscience/auth';
import { getResearchRecord, getResearchRecordSource, ResearchRecordSourceError } from '@openscience/domain';
import type { CommitRouteDeps } from './commits';
import { sessionTokenFrom } from './session-guard';
import { researchRecordSchema, researchRecordOpenApi } from './research-record-schema';

const params = z.object({ id: z.string().uuid(), versionId: z.union([z.literal('latest'), z.string().uuid()]) });
export function registerResearchRecordRoutes(app: FastifyInstance, deps: CommitRouteDeps) {
  app.get('/research-record/schema', async () => researchRecordSchema);
  app.get('/research-record/openapi', async () => researchRecordOpenApi);
  const base = '/research-objects/:id/versions/:versionId/record';
  for (const suffix of ['', '/export']) app.get(`${base}${suffix}`, async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    const { id, versionId } = params.parse(req.params);
    const token = sessionTokenFrom(req);
    const user = token ? await getCurrentUser(deps, token) : null;
    const result = await getResearchRecord(deps, { researchObjectId: id, versionId, userId: user?.userId });
    reply.header('Link', '</api/research-record/openapi>; rel="service-desc", </api/research-record/schema>; rel="describedby"');
    if (suffix) reply.header('Content-Disposition', `attachment; filename="research-record-${result.versionId}.json"`);
    return reply.send(suffix ? result.record : { record: result.record });
  });
  app.get(`${base}/evidence/:evidenceId/source`, async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    const { id, versionId, evidenceId } = params.extend({ evidenceId: z.string().uuid() }).parse(req.params);
    const token = sessionTokenFrom(req);
    const user = token ? await getCurrentUser(deps, token) : null;
    try {
      return reply.send({ source: await getResearchRecordSource(deps, { researchObjectId: id, versionId, evidenceId, userId: user?.userId }) });
    } catch (error) {
      if (error instanceof ResearchRecordSourceError) return reply.status(503).send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });
}
