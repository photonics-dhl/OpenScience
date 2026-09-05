import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { StorageAdapter } from '@openscience/storage';
import {
  getPresentationAssetForRead,
  getPresentationTask,
  listPresentationAssets,
  PublicEvidenceSourceError,
  submitPresentationGeneration,
  transitionPresentationAsset,
} from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import type { AgentRouteDeps } from './agent';
import { requireCurrentUser } from './session-guard';
import { sendPresentationAssetContent } from './presentation-asset-content';

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const scopeParams = z.object({
  researchObjectId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();

const assetParams = scopeParams.extend({ assetId: z.string().uuid() }).strict();
const taskParams = scopeParams.extend({ taskId: z.string().uuid() }).strict();

const generationBody = z.object({
  kind: z.enum(['chart', 'interactive_html', 'image', 'video']),
  sourceClaimIds: z.array(z.string().uuid()).min(1).max(12),
}).strict();

const transitionBody = z.object({
  status: z.enum(['approved', 'rejected']),
  expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();

export function registerPresentationAssetRoutes(app: FastifyInstance, deps: AgentRouteDeps & { storage?: StorageAdapter }): void {
  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-tasks/:taskId', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = taskParams.parse(req.params);
    return reply.send({ task: await getPresentationTask(deps, { userId: user.userId, ...params }) });
  });

  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId/content', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "sandbox; default-src 'none'");
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = assetParams.parse(req.params);
    const asset = await getPresentationAssetForRead(deps, { userId: user.userId, ...params });
    if (req.headers.range !== undefined) return reply.status(416).send({ error: { code: 'RANGE_NOT_SUPPORTED', message: 'Partial presentation reads are not supported' } });
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable');
    return sendPresentationAssetContent(deps.storage, asset, reply, 'private');
  });

  app.post('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/generations', { bodyLimit: 8 * 1024 }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    const body = generationBody.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const task = await submitPresentationGeneration(deps, {
      userId: user.userId,
      ...params,
      ...body,
      idempotencyKey,
    }, auditCtx(req));
    return reply.status(202).send({ task });
  });

  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-assets', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    return reply.send({ assets: await listPresentationAssets(deps, { userId: user.userId, ...params }) });
  });

  app.patch('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = assetParams.parse(req.params);
    const body = transitionBody.parse(req.body);
    const asset = await transitionPresentationAsset(deps, { userId: user.userId, ...params, ...body }, auditCtx(req));
    return reply.send({ asset: {
      id: asset.id,
      researchObjectId: asset.researchObjectId,
      versionId: asset.versionId,
      kind: asset.kind,
      contentHash: asset.contentHash,
      generator: asset.generator,
      generatorVersion: asset.generatorVersion,
      status: asset.status,
      label: asset.label,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    } });
  });
}
