import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { StorageAdapter } from '@openscience/storage';
import {
  getPresentationAssetForRead,
  getPresentationTask,
  listPresentationAssets,
  isHermesVideoReady,
  PublicEvidenceSourceError,
  PresentationAssetError,
  submitPresentationGeneration,
  submitExistingSceneImageReview,
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

const contentDrivenVideo = z.object({
  storyboardAssetId: z.string().uuid(),
  sceneImageAssetIds: z.array(z.string().uuid()).min(3).max(6),
  profile: z.literal('content-driven-v1'),
}).strict();
const audioAuditionVideo = contentDrivenVideo.extend({
  purpose: z.literal('audio-audition'),
  sceneIndex: z.number().int().min(0).max(5),
  audio: z.object({ provider: z.literal('synclip'), voice: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u),
    speed: z.number().finite().positive() }).strict(),
  locale: z.enum(['zh', 'en']),
}).strict().refine(value => value.sceneIndex < value.sceneImageAssetIds.length,
  { message: 'Audition scene must exist in the storyboard', path: ['sceneIndex'] });
const audioAuditionPayload = z.object({ schemaVersion: z.literal(1), kind: z.literal('video'),
  researchObjectId: z.string().uuid(), versionId: z.string().uuid(), video: audioAuditionVideo });
const audioAuditionResult = z.object({ purpose: z.literal('audio-audition'), audioAudition: z.object({
  taskId: z.string().uuid(), executionAttempt: z.number().int().nonnegative().safe(), inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sceneIndex: z.number().int().min(0).max(5), voice: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u),
  speed: z.number().finite().positive(), locale: z.enum(['zh', 'en']),
  audioTaskId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u), objectKey: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  size: z.number().int().positive().max(16 * 1024 * 1024), contentType: z.literal('audio/mpeg'),
  durationSeconds: z.number().finite().positive(), timingStatus: z.enum(['decoded', 'requires_revision']),
  coinsUsed: z.number().finite().nonnegative().optional(),
}) });

const generationBody = z.object({
  kind: z.enum(['chart', 'interactive_html', 'image', 'video']),
  storyboard: z.object({ output: z.enum(['image', 'video']).default('video'), locale: z.enum(['zh', 'en']), style: z.string().min(1).max(100), instruction: z.string().max(1000).trim().min(1), narrative: z.literal(true).optional(), baseAssetId: z.string().uuid().optional(), revisionTaskId: z.string().uuid().optional(), revisionMode: z.literal('art').optional(), artSceneIndex: z.number().int().min(0).max(5).optional(),
    figurePlan: z.object({ figures: z.array(z.object({ id: z.string().min(1).max(200), decision: z.enum(['reuse', 're-render', 'abstract', 'skip']), styleId: z.string().min(1).max(100).optional(), caption: z.string().max(200).optional() }).strict()).max(12) }).strict().optional() }).strict()
    .extend({ revisionSceneIndex: z.number().int().min(0).max(5).optional(), narrativeSceneLimit: z.number().int().min(1).max(6).optional() })
    .refine(value => value.narrativeSceneLimit === undefined || value.narrative === true,
      { message: 'Scene limit requires a narrative storyboard', path: ['narrativeSceneLimit'] })
    .refine(value => value.revisionSceneIndex === undefined || (value.output === 'video' && value.narrative === true && Boolean(value.baseAssetId)),
      { message: 'Video scene revision requires a narrative video base', path: ['revisionSceneIndex'] })
    .refine(value => !value.revisionTaskId || (value.output === 'image' && !value.baseAssetId), { message: 'Storyboard revision requires image output and no base asset', path: ['revisionTaskId'] })
    .refine(value => !value.revisionMode || (value.output === 'image' && Boolean(value.baseAssetId) && !value.revisionTaskId), { message: 'Art revision requires an image base asset', path: ['revisionMode'] })
    .refine(value => value.artSceneIndex === undefined || (value.revisionMode === 'art' && value.output === 'image' && Boolean(value.baseAssetId) && value.narrative === true), { message: 'Scene art revision requires a narrative image base', path: ['artSceneIndex'] }).optional(),
  sceneImage: z.object({ storyboardAssetId: z.string().uuid(), sceneIndex: z.number().int().min(0).max(5), styleReferenceAssetId: z.string().uuid().optional() }).strict().optional(),
  video: z.union([contentDrivenVideo, audioAuditionVideo]).optional(),
  sourceClaimIds: z.array(z.string().uuid()).min(1).max(12),
}).strict();

const transitionBody = z.object({
  status: z.enum(['approved', 'rejected']),
  expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();

export function registerPresentationAssetRoutes(app: FastifyInstance, deps: AgentRouteDeps & { storage?: StorageAdapter; sceneImageEnabled?: boolean; videoEnabled?: boolean;
  readVideoReadiness?: import('@openscience/domain').HermesVideoReadinessDeps['readVideoReadiness'];
  readAudioAuditionReadiness?: import('@openscience/domain').HermesVideoReadinessDeps['readAudioAuditionReadiness'];
  canRetryImageReviewBeforeSubmission?: import('@openscience/domain').HermesResearchRunDeps['canRetryImageReviewBeforeSubmission'] }): void {
  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-tasks/:taskId', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = taskParams.parse(req.params);
    return reply.send({ task: await getPresentationTask(deps, { userId: user.userId, ...params }) });
  });

  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-tasks/:taskId/audio', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "sandbox; default-src 'none'");
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = taskParams.parse(req.params);
    const scopedTask = await getPresentationTask(deps, { userId: user.userId, ...params });
    if (scopedTask.status !== 'succeeded') throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation audio not found');
    const task = await deps.prisma.agentTask.findUnique({ where: { id: params.taskId },
      include: { session: { include: { researchObject: true } } } });
    const payload = audioAuditionPayload.safeParse(task?.payload);
    const result = audioAuditionResult.safeParse(task?.result);
    if (!task || task.kind !== 'presentation.generate' || task.status !== 'succeeded' || task.deletedAt || task.session.deletedAt
      || task.session.userId !== user.userId || task.session.researchObjectId !== params.researchObjectId
      || !task.session.researchObject || task.session.researchObject.deletedAt
      || !payload.success || payload.data.researchObjectId !== params.researchObjectId || payload.data.versionId !== params.versionId
      || !result.success) throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation audio not found');
    const audio = result.data.audioAudition; const video = payload.data.video;
    const objectKey = `presentation/${params.researchObjectId}/${params.versionId}/audio-audition/${params.taskId}/${audio.inputHash}.mp3`;
    if (audio.taskId !== params.taskId || audio.objectKey !== objectKey || audio.sceneIndex !== video.sceneIndex
      || audio.voice !== video.audio.voice || audio.speed !== video.audio.speed || audio.locale !== video.locale) {
      throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation audio not found');
    }
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation audio is temporarily unavailable');
    return sendPresentationAssetContent(deps.storage, { id: params.taskId, kind: 'audio', generator: 'synclip', generatorVersion: 'audio-audition-v1',
      objectKey, contentHash: audio.contentHash, size: audio.size, contentType: audio.contentType }, reply, 'private', req.headers);
  });

  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId/content', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "sandbox; default-src 'none'");
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = assetParams.parse(req.params);
    const asset = await getPresentationAssetForRead(deps, { userId: user.userId, ...params });
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable');
    return sendPresentationAssetContent(deps.storage, asset, reply, 'private', req.headers);
  });

  app.post('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/generations', { bodyLimit: 8 * 1024 }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    const body = generationBody.parse(req.body);
    if (body.kind === 'image' && !body.sceneImage) throw new PresentationAssetError('VALIDATION_ERROR', 'This media generation capability is currently unavailable');
    if (body.sceneImage && !deps.sceneImageEnabled) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image generation is currently unavailable');
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
    const assets = await listPresentationAssets(deps, { userId: user.userId, ...params });
    const videoReady = await isHermesVideoReady(deps);
    return reply.send({ assets: assets.map(asset => ({ ...asset, canGenerateSceneImage: !!deps.sceneImageEnabled && asset.canGenerateSceneImage, canGenerateVideo: videoReady && asset.canGenerateVideo })) });
  });

  app.post('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId/review', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = assetParams.parse(req.params);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const task = await submitExistingSceneImageReview(deps, { userId: user.userId, ...params, idempotencyKey }, auditCtx(req));
    return reply.status(202).send({ task });
  });

  app.patch('/research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = assetParams.parse(req.params);
    const body = transitionBody.parse(req.body);
    const asset = await transitionPresentationAsset(deps, { userId: user.userId, ...params, ...body }, auditCtx(req));
    const assets = await listPresentationAssets(deps, { userId: user.userId, researchObjectId: params.researchObjectId, versionId: params.versionId });
    const view = assets.find(item => item.id === asset.id);
    return reply.send({ asset: view && { ...view, canGenerateSceneImage: !!deps.sceneImageEnabled && view.canGenerateSceneImage,
      canGenerateVideo: await isHermesVideoReady(deps) && view.canGenerateVideo } });
  });
}
