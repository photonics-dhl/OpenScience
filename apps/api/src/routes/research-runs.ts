import type { AuthDeps } from '@openscience/auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ingestionClaimSelectionSchema } from './ingestion-claim-selection-schema';
import { MAX_INGESTION_CLAIMS } from '@openscience/domain';
import { authorizeHermesGenerationGrant, confirmHermesSourceReview, createHermesResearchRun, createHermesArtStyleContinuation, getHermesImageArtStyleCapability, getExistingHermesResearchRun, getHermesResearchRun, retryHermesGeneration, type HermesSourceReviewDeps } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import type { StorageAdapter } from '@openscience/storage';
import { requireCurrentUser } from './session-guard';

const paramsSchema = z.object({ id: z.string().uuid() }).strict();
const readParamsSchema = z.object({ id: z.string().uuid(), runId: z.string().uuid() }).strict();
const existingRunQuerySchema = z.object({ ingestionTaskId: z.string().uuid(), output: z.enum(['image', 'video']).optional() }).strict();
const createSchema = z.object({ ingestionTaskIds: z.array(z.string().uuid()).min(1).max(20),
  generation: z.object({ profile: z.literal('visual-narrative-v1'), maxAgentTasks: z.literal(9),
    locale: z.enum(['zh', 'en']), style: z.string().trim().min(1).max(100), instruction: z.string().trim().min(1).max(1000),
    output: z.literal('video').optional() }).strict().optional(),
}).strict();
const selectionSchema = ingestionClaimSelectionSchema.extend({
  attachSourceQuote: z.literal(true),
}).strict();
const sourceReviewSchema = z.object({
  expectedVersion: z.number().int().positive(),
  versionId: z.string().uuid(),
  generationGrant: z.union([
    z.object({ profile: z.literal('content-driven-v1'), maxAgentTasks: z.literal(8) }).strict(),
    z.object({ profile: z.literal('content-driven-image-v1'), maxAgentTasks: z.literal(7) }).strict(),
  ]),
  reviews: z.array(z.object({
    ingestionTaskId: z.string().uuid(), snapshotToken: z.string().regex(/^[a-f0-9]{64}$/),
    selections: z.array(selectionSchema).min(1).max(MAX_INGESTION_CLAIMS),
  }).strict()).min(1).max(20),
}).strict();
const generationGrantSchema = z.object({
  expectedVersion: z.number().int().positive(),
  generationGrant: z.union([
    z.object({ profile: z.literal('content-driven-v1'), maxAgentTasks: z.literal(8) }).strict(),
    z.object({ profile: z.literal('visual-narrative-v1'), maxAgentTasks: z.union([z.literal(11), z.literal(13)]) }).strict(),
  ]),
}).strict();
const generationRetrySchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const artStyleContinuationSchema = z.object({
  expectedVersion: z.number().int().positive(), versionId: z.string().uuid(), imageAssetId: z.string().uuid(),
  sceneIndex: z.number().int().min(0).max(5), style: z.string().trim().min(1).max(100),
}).strict();

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export function registerResearchRunRoutes(app: FastifyInstance, deps: Omit<HermesSourceReviewDeps, 'storage'> & AuthDeps & { storage?: StorageAdapter }): void {
  app.get('/research-objects/:id/hermes-art-style-capability', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = paramsSchema.parse(req.params);
    const query = z.object({ versionId: z.string().uuid(), imageAssetId: z.string().uuid() }).strict().parse(req.query);
    return reply.send(await getHermesImageArtStyleCapability(deps, { actorId: user.userId, researchObjectId: id, ...query }));
  });

  app.post('/research-objects/:id/hermes-runs/:runId/art-style-continuations', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    const body = artStyleContinuationSchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    return reply.status(202).send(await createHermesArtStyleContinuation(deps, {
      actorId: user.userId, researchObjectId: id, runId, idempotencyKey, ...body,
    }, auditCtx(req)));
  });

  app.get('/research-objects/:id/hermes-runs', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = paramsSchema.parse(req.params);
    const { ingestionTaskId, output } = existingRunQuerySchema.parse(req.query);
    return reply.send({ run: await getExistingHermesResearchRun(deps, { actorId: user.userId, researchObjectId: id, ingestionTaskId, output }) });
  });

  app.post('/research-objects/:id/hermes-runs', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = paramsSchema.parse(req.params);
    const body = createSchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const run = await createHermesResearchRun(deps, {
      actorId: user.userId, researchObjectId: id, ingestionTaskIds: body.ingestionTaskIds, idempotencyKey, generation: body.generation,
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
    const idempotencyKey = body.generationGrant.profile === 'visual-narrative-v1'
      ? z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']) : undefined;
    const run = await authorizeHermesGenerationGrant(deps, {
      actorId: user.userId, researchObjectId: id, runId, ...body, idempotencyKey,
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
