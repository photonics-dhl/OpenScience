import type { AuthDeps } from '@openscience/auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authorizeHermesGenerationGrant, confirmHermesSourceReview, createHermesResearchRun, getHermesResearchRun, retryHermesGeneration, type HermesSourceReviewDeps } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import type { StorageAdapter } from '@openscience/storage';
import { requireCurrentUser } from './session-guard';

const paramsSchema = z.object({ id: z.string().uuid() }).strict();
const readParamsSchema = z.object({ id: z.string().uuid(), runId: z.string().uuid() }).strict();
const createSchema = z.object({ ingestionTaskIds: z.array(z.string().uuid()).min(1).max(20) }).strict();
const selectionSchema = z.object({
  clientKey: z.string().min(1).max(100),
  sourceField: z.enum(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']),
  kind: z.enum(['core', 'supporting', 'method', 'boundary', 'counter']),
  parentClientKey: z.string().min(1).max(100).optional(),
  statement: z.string().min(1).max(4_000),
  conditions: z.array(z.string().min(1).max(500)).max(100).optional(),
  limitations: z.array(z.string().min(1).max(500)).max(100).optional(),
  attachSourceQuote: z.literal(true),
}).strict();
const sourceReviewSchema = z.object({
  expectedVersion: z.number().int().positive(),
  versionId: z.string().uuid(),
  generationGrant: z.object({ profile: z.literal('content-driven-v1'), maxAgentTasks: z.literal(8) }).strict(),
  reviews: z.array(z.object({
    ingestionTaskId: z.string().uuid(), snapshotToken: z.string().regex(/^[a-f0-9]{64}$/),
    selections: z.array(selectionSchema).min(1).max(12),
  }).strict()).min(1).max(20),
}).strict();
const generationGrantSchema = z.object({
  expectedVersion: z.number().int().positive(),
  generationGrant: z.object({ profile: z.literal('content-driven-v1'), maxAgentTasks: z.literal(8) }).strict(),
}).strict();
const generationRetrySchema = z.object({ expectedVersion: z.number().int().positive() }).strict();

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export function registerResearchRunRoutes(app: FastifyInstance, deps: Omit<HermesSourceReviewDeps, 'storage'> & AuthDeps & { storage?: StorageAdapter }): void {
  app.post('/research-objects/:id/hermes-runs', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = paramsSchema.parse(req.params);
    const body = createSchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const run = await createHermesResearchRun(deps, {
      actorId: user.userId, researchObjectId: id, ingestionTaskIds: body.ingestionTaskIds, idempotencyKey,
    }, auditCtx(req));
    return reply.status(202).send({ run });
  });

  app.get('/research-objects/:id/hermes-runs/:runId', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    return reply.send({ run: await getHermesResearchRun(deps, { actorId: user.userId, researchObjectId: id, runId }) });
  });

  app.post('/research-objects/:id/hermes-runs/:runId/source-review', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    const body = sourceReviewSchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    if (!deps.storage) return reply.status(503).send({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Source review storage is unavailable' } });
    return reply.status(201).send(await confirmHermesSourceReview({ ...deps, storage: deps.storage }, {
      actorId: user.userId, researchObjectId: id, runId, idempotencyKey, ...body,
    }, auditCtx(req)));
  });

  app.post('/research-objects/:id/hermes-runs/:runId/generation-grant', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    const body = generationGrantSchema.parse(req.body);
    const run = await authorizeHermesGenerationGrant(deps, {
      actorId: user.userId, researchObjectId: id, runId, ...body,
    }, auditCtx(req));
    return reply.status(201).send({ run });
  });

  app.post('/research-objects/:id/hermes-runs/:runId/retry-generation', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    const body = generationRetrySchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const run = await retryHermesGeneration(deps, {
      actorId: user.userId, researchObjectId: id, runId, idempotencyKey, ...body,
    }, auditCtx(req));
    return reply.status(202).send({ run });
  });
}
