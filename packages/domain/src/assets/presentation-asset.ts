import { requireStyleReferenceImage } from './scene-image';
import { parseSceneImageRequest, presentationSceneImageView, requireSceneImageParent, requireSceneImageSpendIsNew, hasSceneImageProvenance, type SceneImageRequest } from './scene-image';
import { isDeepStrictEqual } from 'node:util';
import { lockLiveResearchObject, lockTrashReferences } from '../trash/trash';
import { isWorkingDraftVersion } from '../commit/version-history';
import { recordValue, refreshWorkingResearchRecord } from '../commit/research-record-snapshot';
import { isVersionHistoryCopy, requireValidVersionHistoryCopy } from './version-history-copy';
import { parseStoryboardRequest, presentationStoryboardView, canonicalStoryboardStyle, type StoryboardRequest, type StoryboardView } from './storyboard';
import type { AuditContext } from '@openscience/observability';
import type { PresentationAsset, PresentationAssetStatus, Prisma } from '@prisma/client';
import { getBlobStorageKey } from '@openscience/storage';
import { createAgentSession, getAgentTask, submitAgentTask, submitDeterministicPresentationTask, type AgentDeps, type AgentTaskView } from '../agent/agent';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';
import { PresentationAssetError } from './errors';
import { ONCHIP_FIELD_SAMPLING_PROFILE, CONTENT_DRIVEN_PROFILE, CONTENT_DRIVEN_IMAGE_PROFILE, hasVideoProvenance, parseVideoGenerationRequest, presentationVideoView, requireVideoGenerationParents, type VideoGenerationRequest } from './video';
import { requireAnimationSourceSupport } from './animation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ['chart', 'interactive_html', 'image', 'video'] as const;
const SERIALIZABLE_RETRY_DELAYS_MS = [10, 25, 50, 100, 200] as const;
export const DETERMINISTIC_PRESENTATION_GENERATOR = 'OpenScience deterministic renderer';
export const DETERMINISTIC_PRESENTATION_GENERATOR_VERSION = 'openscience-presentation-v2';
export type PresentationGenerationKind = (typeof KINDS)[number];
export interface HermesPresentationAuthority { runId: string; stage: 'storyboard' | 'scene_image' | 'video'; ordinal: number; profile: 'onchip-field-sampling-v1' | 'content-driven-v1' | 'content-driven-image-v1' }
export interface PresentationGenerationPayload { schemaVersion: 1; researchObjectId: string; versionId: string; kind: PresentationGenerationKind; sourceClaimIds: string[]; storyboard?: StoryboardRequest; sceneImage?: SceneImageRequest; video?: VideoGenerationRequest; hermesRunAuthority?: HermesPresentationAuthority }
export interface PresentationAssetView {
  storyboard?: StoryboardView;
  sceneImage?: SceneImageRequest;
  paperOriginal?: { figureId: string; caption?: string };
  canGenerateSceneImage: boolean;
  canGenerateVideo: boolean;
  canTransition: boolean;
  id: string;
  researchObjectId: string;
  versionId: string;
  kind: PresentationAsset['kind'];
  contentHash: string;
  generator: string;
  generatorVersion: string;
  status: PresentationAsset['status'];
  label: string;
  sourceClaimIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

function paperOriginalProvenance(asset: { provenance: unknown }): Record<string, unknown> {
  let provenance = recordValue(asset.provenance);
  while (provenance.source === 'version_history_copy') provenance = recordValue(provenance.lineage);
  return provenance;
}
function paperOriginalView(asset: { provenance: unknown }): PresentationAssetView['paperOriginal'] {
  const provenance = paperOriginalProvenance(asset);
  if (provenance.subtype !== 'paper_original_figure' || typeof provenance.figureId !== 'string' || !provenance.figureId.trim()) return undefined;
  return { figureId: provenance.figureId, ...(typeof provenance.caption === 'string' ? { caption: provenance.caption } : {}) };
}

export function parsePresentationGenerationPayload(value: unknown): PresentationGenerationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload is invalid');
  const payload = value as Record<string, unknown>;
  const expected = ['kind', 'researchObjectId', 'schemaVersion', 'sourceClaimIds', ...('storyboard' in payload ? ['storyboard'] : []), ...('sceneImage' in payload ? ['sceneImage'] : []), ...('video' in payload ? ['video'] : []), ...('hermesRunAuthority' in payload ? ['hermesRunAuthority'] : []), 'versionId'].sort();
  const keys = Object.keys(payload).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || payload.schemaVersion !== 1
    || typeof payload.researchObjectId !== 'string' || !UUID.test(payload.researchObjectId)
    || typeof payload.versionId !== 'string' || !UUID.test(payload.versionId)
    || typeof payload.kind !== 'string' || !(KINDS as readonly string[]).includes(payload.kind)
    || !Array.isArray(payload.sourceClaimIds) || payload.sourceClaimIds.length < 1 || payload.sourceClaimIds.length > 12
    || payload.sourceClaimIds.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload is invalid');
  }
  const sourceClaimIds = [...new Set(payload.sourceClaimIds as string[])].sort();
  if (sourceClaimIds.length !== payload.sourceClaimIds.length) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload contains duplicate Claims');
  const storyboard = 'storyboard' in payload ? parseStoryboardRequest(payload.storyboard) : undefined;
  if (storyboard && payload.kind !== 'interactive_html') throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard requires interactive_html');
  const sceneImage = 'sceneImage' in payload ? parseSceneImageRequest(payload.sceneImage) : undefined;
  if (sceneImage && (payload.kind !== 'image' || storyboard)) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene images require image kind and no storyboard settings');
  const video = 'video' in payload ? parseVideoGenerationRequest(payload.video) : undefined;
  if ((payload.kind === 'video') !== Boolean(video) || (video && (storyboard || sceneImage))) throw new PresentationAssetError('VALIDATION_ERROR', 'Video kind requires exact video settings');
  let hermesRunAuthority: HermesPresentationAuthority | undefined;
  if ('hermesRunAuthority' in payload) {
    const authority = payload.hermesRunAuthority as Record<string, unknown> | null;
    if (!authority || typeof authority !== 'object' || Array.isArray(authority)
      || Object.keys(authority).sort().join(',') !== 'ordinal,profile,runId,stage'
      || typeof authority.runId !== 'string' || !UUID.test(authority.runId)
      || !['storyboard', 'scene_image', 'video'].includes(String(authority.stage))
      || !Number.isInteger(authority.ordinal) || Number(authority.ordinal) < 0
      || Number(authority.ordinal) > (authority.profile === ONCHIP_FIELD_SAMPLING_PROFILE ? 4 : 5)
      || ![ONCHIP_FIELD_SAMPLING_PROFILE, CONTENT_DRIVEN_PROFILE, CONTENT_DRIVEN_IMAGE_PROFILE].includes(authority.profile as HermesPresentationAuthority['profile'])) throw new PresentationAssetError('VALIDATION_ERROR', 'Hermes run authority is invalid');
    hermesRunAuthority = authority as unknown as HermesPresentationAuthority;
  }
  return { ...(sceneImage ? { sceneImage } : {}), ...(storyboard ? { storyboard } : {}), ...(video ? { video } : {}), ...(hermesRunAuthority ? { hermesRunAuthority } : {}), schemaVersion: 1, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind as PresentationGenerationKind, sourceClaimIds };
}

type PresentationScope = { userId: string; researchObjectId: string; versionId: string };

export async function getPresentationTask(deps: AgentDeps, input: PresentationScope & { taskId: string }): Promise<AgentTaskView> {
  await requireScope(deps.prisma, input);
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  const payload = task?.payload;
  if (!task || task.kind !== 'presentation.generate' || task.session.userId !== input.userId
    || task.session.researchObjectId !== input.researchObjectId
    || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId) {
    throw new PresentationAssetError('NOT_FOUND', 'Presentation task not found');
  }
  return getAgentTask(deps, input);
}
type ScopeDb = Pick<Prisma.TransactionClient, 'version' | 'workspace' | 'membership'>;
export const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);

async function requireScope(prisma: ScopeDb, input: PresentationScope, write = false) {
  const version = await prisma.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
  if (!version || version.researchObjectId !== input.researchObjectId || !version.researchObject || version.researchObject.deletedAt) throw new PresentationAssetError('NOT_FOUND', 'Research Object version not found');
  const { workspace, membership } = await requireMembership({ prisma }, version.researchObject.workspaceId, input.userId);
  if (write && (workspace.status !== 'active' || !WRITE_ROLES.has(membership.role))) throw new PresentationAssetError('FORBIDDEN', 'Presentation writes require an active workspace and a content-writing role');
  if (write && version.status !== 'draft') throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation assets can only change on a draft version');
  if (write && !await isWorkingDraftVersion(prisma, input.versionId)) throw new PresentationAssetError('ILLEGAL_TRANSITION', '历史稿不可修改，请保存或恢复为当前草稿');
  return version;
}

export function requirePresentationWriteScope(prisma: ScopeDb, input: PresentationScope) {
  return requireScope(prisma, input, true);
}

/** Same draft row fence and Serializable retry policy as Claim/Evidence writes. */
export async function withPresentationAssetWrite<T>(
  prisma: Pick<AgentDeps['prisma'], '$transaction'>,
  input: PresentationScope,
  operation: (tx: Prisma.TransactionClient, version: Awaited<ReturnType<typeof requirePresentationWriteScope>>) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockTrashReferences(tx);
        await lockLiveResearchObject(tx, input.researchObjectId);
        const version = await requirePresentationWriteScope(tx, input);
        const touched = await tx.version.updateMany({ where: { id: input.versionId, status: 'draft' }, data: { status: 'draft' } });
        if (touched.count !== 1) throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation assets can only change on a draft version');
        const result = await operation(tx, version);
        await refreshWorkingResearchRecord(tx, input);
        return result;
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < SERIALIZABLE_RETRY_DELAYS_MS.length) {
        const delayMs = SERIALIZABLE_RETRY_DELAYS_MS[attempt] ?? 200;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
}

async function requirePlatformAdmin(deps: AgentDeps, userId: string): Promise<void> {
  const user = await deps.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  if (user?.platformRole !== 'platform_admin') throw new PresentationAssetError('ADMIN_REQUIRED', 'Generated image and video requests require a platform administrator');
}

async function hasHermesAssetReviewAuthority(
  prisma: AgentDeps['prisma'] | Prisma.TransactionClient,
  input: PresentationScope & { assetId: string; sourceClaimIds: string[] },
): Promise<boolean> {
  const step = await prisma.hermesResearchStep.findFirst({
    where: { presentationAssetId: input.assetId, status: 'awaiting_approval', run: {
      actorId: input.userId, researchObjectId: input.researchObjectId, versionId: input.versionId,
      OR: [{ profile: ONCHIP_FIELD_SAMPLING_PROFILE, maxAgentTasks: 7 }, { profile: CONTENT_DRIVEN_PROFILE, maxAgentTasks: 8 }, { profile: CONTENT_DRIVEN_IMAGE_PROFILE, maxAgentTasks: 7 }],
      status: { in: ['awaiting_scene_images_review', 'awaiting_video_review'] },
    } }, include: { run: true },
  });
  return Boolean(step && isDeepStrictEqual([...step.run.sourceClaimIds].sort(), [...input.sourceClaimIds].sort()));
}

export async function submitPresentationGeneration(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string; kind: PresentationGenerationKind; sourceClaimIds: string[]; storyboard?: StoryboardRequest; sceneImage?: SceneImageRequest; video?: VideoGenerationRequest; idempotencyKey: string;
}, ctx: AuditContext = {}): Promise<AgentTaskView> {
  await requirePresentationWriteScope(deps.prisma, input);
  const payload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, sourceClaimIds: input.sourceClaimIds, ...(input.sceneImage !== undefined ? { sceneImage: input.sceneImage } : {}), ...(input.storyboard !== undefined ? { storyboard: input.storyboard } : {}), ...(input.video !== undefined ? { video: input.video } : {}) });
  await requireStoryboardRevisionTask(deps.prisma, payload, input.userId);
  const claims = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: input.researchObjectId, versionId: input.versionId }, select: { id: true, extractionStatus: true } });
  const returnedClaimIds = new Set(claims.map((claim) => claim.id));
  if (claims.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
    || claims.some((claim) => claim.extractionStatus !== 'succeeded')) {
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Every source Claim must be verified in the exact version');
  }
  if (payload.storyboard?.baseAssetId) await requireStoryboardBase(deps.prisma, payload);
  if (input.kind === 'image' || input.kind === 'video') await requirePlatformAdmin(deps, input.userId);
  if (payload.sceneImage) {
    const sceneParent = await requireSceneImageParent(deps.prisma, payload);
    if (sceneParent) await requireSceneImageSpendIsNew(deps.prisma, sceneParent, payload);
    await requireStyleReferenceImage(deps.prisma, { ...payload, styleReferenceAssetId: payload.sceneImage.styleReferenceAssetId });
  }
  if (payload.video) await requireVideoGenerationParents(deps.prisma, payload);
  const session = await createAgentSession(deps, { userId: input.userId, researchObjectId: input.researchObjectId, kind: 'visualization', title: 'Presentation asset generation', idempotencyKey: `presentation-session:${input.userId}:${input.researchObjectId}:${input.versionId}` }, ctx);
  const taskInput = { sessionId: session.id, userId: input.userId, kind: 'presentation.generate' as const, payload: payload as unknown as Record<string, unknown>, idempotencyKey: input.idempotencyKey };
  return !payload.storyboard && (input.kind === 'chart' || input.kind === 'interactive_html')
    ? submitDeterministicPresentationTask(deps, taskInput, ctx)
    : submitAgentTask(deps, taskInput, ctx);
}

export async function listPresentationAssets(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string;
}): Promise<PresentationAssetView[]> {
  const version = await requireScope(deps.prisma, input);
  const { workspace, membership } = await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  const user = await deps.prisma.user.findUnique({ where: { id: input.userId }, select: { platformRole: true } });
  const canWrite = version.status === 'draft' && workspace.status === 'active' && WRITE_ROLES.has(membership.role) && await isWorkingDraftVersion(deps.prisma, input.versionId);
  const assets = await deps.prisma.presentationAsset.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId, deletedAt: null },
    include: { sourceClaims: { select: { claimId: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const liveClaims = await deps.prisma.claimNode.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId, extractionStatus: 'succeeded' }, select: { id: true, extractionStatus: true } });
  const validClaimIds = new Set(liveClaims.filter(claim => claim.extractionStatus === 'succeeded').map(claim => claim.id));
  const sourcedClaimIds = new Set((await deps.prisma.evidenceRecord.findMany({ where: {
    researchObjectId: input.researchObjectId, versionId: input.versionId,
    claimId: { in: [...validClaimIds] }, extractionStatus: 'succeeded',
  }, select: { claimId: true }, distinct: ['claimId'] })).map(row => row.claimId));
  const hermesReviewable = new Set<string>();
  if (user?.platformRole !== 'platform_admin') {
    for (const asset of assets.filter((candidate) => candidate.status === 'draft' && (candidate.kind === 'image' || candidate.kind === 'video'))) {
      if (await hasHermesAssetReviewAuthority(deps.prisma, { ...input, assetId: asset.id,
        sourceClaimIds: asset.sourceClaims.map((source) => source.claimId) })) hermesReviewable.add(asset.id);
    }
  }
  const sceneImagesByStoryboard = new Map<string, typeof assets>();
  for (const candidate of assets) {
    const scene = presentationSceneImageView(candidate);
    if (!scene) continue;
    sceneImagesByStoryboard.set(scene.storyboardAssetId, [...(sceneImagesByStoryboard.get(scene.storyboardAssetId) ?? []), candidate]);
  }
  return Promise.all(assets.map(async (asset) => {
    const ids = asset.sourceClaims.map(source => source.claimId).sort();
    const claimsValid = ids.length > 0 && ids.every(id => validClaimIds.has(id));
    const paperOriginal = paperOriginalView(asset);
    let sceneValid = !hasSceneImageProvenance(asset);
    let videoValid = !hasVideoProvenance(asset);
    if (isVersionHistoryCopy(asset)) {
      try { await requireValidVersionHistoryCopy(deps.prisma, asset); }
      catch (error) { if (!(error instanceof PresentationAssetError)) throw error; sceneValid = false; videoValid = false; }
    }
    const sceneImage = presentationSceneImageView(asset);
    if (sceneImage && claimsValid) {
      try {
        const parent = await requireSceneImageParent(deps.prisma, { ...input, sourceClaimIds: ids, sceneImage });
        sceneValid = parent?.identity === (asset.provenance as Prisma.JsonObject).parentIdentity;
      } catch (error) { if (!(error instanceof PresentationAssetError)) throw error; }
    }
    const video = presentationVideoView(asset);
    if (video && claimsValid) {
      try {
        const parents = await requireVideoGenerationParents(deps.prisma, { ...input, sourceClaimIds: ids, video });
        videoValid = parents?.identity === (asset.provenance as Prisma.JsonObject).parentIdentity;
      } catch (error) { if (!(error instanceof PresentationAssetError)) throw error; }
    }
    const storyboardForVideo = presentationStoryboardView(asset, ids);
    const storyboardIdentity = storyboardForVideo && JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids });
    const eligibleSceneIndexes = new Set((sceneImagesByStoryboard.get(asset.id) ?? []).flatMap((candidate) => {
      const scene = presentationSceneImageView(candidate);
      const provenance = candidate.provenance as Prisma.JsonObject | null;
      const candidateIds = candidate.sourceClaims.map((source) => source.claimId).sort();
      return candidate.status === 'approved' && scene?.storyboardAssetId === asset.id
        && provenance?.parentIdentity === storyboardIdentity && JSON.stringify(candidateIds) === JSON.stringify(ids)
        ? [scene.sceneIndex] : [];
    }));
    const canGenerateVideo = ids.length > 0 && ids.every(id => sourcedClaimIds.has(id)) && claimsValid && canWrite && user?.platformRole === 'platform_admin'
      && asset.status === 'approved' && storyboardForVideo?.output === 'video' && storyboardForVideo.locale === 'zh'
      && storyboardForVideo.document.scenes.length >= 3 && storyboardForVideo.document.scenes.length <= 6
      && storyboardForVideo.document.scenes.every(scene => !!scene.animation)
      && storyboardForVideo.document.scenes.every((scene) => [...scene.narration].length <= 120)
      && storyboardForVideo.document.scenes.reduce((total, scene) => total + [...scene.narration].length, 0) <= 450
      && storyboardForVideo.document.scenes.every((_, index) => eligibleSceneIndexes.has(index));
    return ({
    sceneImage: presentationSceneImageView(asset),
    ...(paperOriginal ? { paperOriginal } : {}),
    canGenerateSceneImage: claimsValid && canWrite && user?.platformRole === 'platform_admin' && asset.status === 'approved' && !!presentationStoryboardView(asset, asset.sourceClaims.map(source => source.claimId)),
    canGenerateVideo,
    storyboard: presentationStoryboardView(asset, asset.sourceClaims.map(source => source.claimId)),
    canTransition: sceneValid && videoValid && !hasInvalidStoryboard(asset, asset.sourceClaims.map(source => source.claimId)) && canWrite && asset.status === 'draft' && (!(asset.kind === 'image' || asset.kind === 'video') || user?.platformRole === 'platform_admin' || hermesReviewable.has(asset.id)),
    id: asset.id,
    researchObjectId: asset.researchObjectId,
    versionId: asset.versionId,
    kind: asset.kind,
    contentHash: asset.contentHash,
    generator: asset.generator,
    generatorVersion: asset.generatorVersion,
    status: asset.status,
    label: asset.label,
    sourceClaimIds: asset.sourceClaims.map((source) => source.claimId).sort(),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }); }));
}

/** Server-only content lookup; storage coordinates must never enter metadata responses. */
export async function getPresentationAssetForRead(deps: AgentDeps, input: PresentationScope & { assetId: string }): Promise<PresentationAsset> {
  await requireScope(deps.prisma, input);
  const asset = await deps.prisma.presentationAsset.findUnique({ where: { id: input.assetId } });
  if (!asset || asset.deletedAt || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId) {
    throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
  }
  return asset;
}

export async function transitionPresentationAsset(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string; assetId: string; status: Extract<PresentationAssetStatus, 'approved' | 'rejected'>; expectedUpdatedAt: Date;
}, ctx: AuditContext = {}): Promise<PresentationAsset> {
  return withPresentationAssetWrite(deps.prisma, input, async (tx, version) => {
    const transaction = { ...deps, prisma: tx as AgentDeps['prisma'] };
    const asset = await tx.presentationAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.deletedAt || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId) throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
    if (input.status === 'approved') {
      await requireValidVersionHistoryCopy(tx, asset);
      const links = await tx.presentationAssetClaim.findMany({ where: { presentationAssetId: asset.id } });
      const original = paperOriginalView(asset);
      if (asset.generator === 'OpenScience paper-original figure' || original) {
        if (!original || links.length === 0) throw new PresentationAssetError('VALIDATION_ERROR', 'Paper figure identity is missing; review its source binding first');
        const validClaims = await tx.claimNode.count({ where: { id: { in: links.map(link => link.claimId) }, researchObjectId: input.researchObjectId, versionId: input.versionId, extractionStatus: 'succeeded' } });
        if (validClaims !== links.length) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Paper figure source Claims changed; review the source before approval');
        const origin = paperOriginalProvenance(asset);
        if (origin.source === 'user_upload' || origin.artifactId !== undefined) {
          if (typeof origin.artifactId !== 'string' || !UUID.test(origin.artifactId)) throw new PresentationAssetError('VALIDATION_ERROR', 'Paper figure source Artifact identity is missing');
          const artifact = await tx.artifact.findUnique({ where: { id: origin.artifactId }, include: { blob: true } });
          if (!artifact || artifact.deletedAt || artifact.bytesPurgedAt || artifact.workspaceId !== version.researchObject.workspaceId
            || artifact.mimeType !== 'image/png' || artifact.blobSha256 !== asset.contentHash || artifact.size <= 0n || artifact.size > 32n * 1024n * 1024n
            || artifact.blob.size !== artifact.size || artifact.blob.storageKey !== asset.objectKey || artifact.blob.storageKey !== getBlobStorageKey(asset.contentHash)) {
            throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Paper figure source Artifact is unavailable or changed; restore and review it before approval');
          }
        }
      }
      const storyboard = presentationStoryboardView(asset, links.map(link => link.claimId));
      if (storyboard) {
        const boundRun = await tx.hermesResearchRun.findFirst({ where: {
          researchObjectId: input.researchObjectId, versionId: input.versionId, profile: CONTENT_DRIVEN_PROFILE,
          status: 'awaiting_storyboard_review', steps: { some: { stage: 'storyboard',
            presentationAssetId: { in: [asset.id, ...(storyboard.baseAssetId ? [storyboard.baseAssetId] : [])] } } },
        } });
        if (boundRun && storyboard.document.scenes.some(scene => !scene.animation)) {
          throw new PresentationAssetError('VALIDATION_ERROR', 'This workflow requires a revised content-driven animation plan before approval');
        }
        if (storyboard.document.scenes.some(scene => !!scene.animation)) {
          const claims = await tx.claimNode.findMany({ where: { id: { in: links.map(link => link.claimId) },
            researchObjectId: input.researchObjectId, versionId: input.versionId, extractionStatus: 'succeeded' }, select: { id: true, statement: true } });
          if (claims.length !== links.length) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Storyboard source Claims changed');
          for (const scene of storyboard.document.scenes) if (scene.animation) requireAnimationSourceSupport(scene.animation, claims);
        }
      }
      if (hasSceneImageProvenance(asset)) {
        const sceneImage = presentationSceneImageView(asset);
        if (!sceneImage) throw new PresentationAssetError('VALIDATION_ERROR', 'Saved scene image is invalid');
        const currentClaims = await tx.claimNode.findMany({ where: { id: { in: links.map(link => link.claimId) }, researchObjectId: input.researchObjectId, versionId: input.versionId }, select: { id: true, extractionStatus: true } });
        if (currentClaims.length !== links.length || currentClaims.some(claim => claim.extractionStatus !== 'succeeded')) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Scene image source Claims are invalid');
        const parent = await requireSceneImageParent(tx, { researchObjectId: input.researchObjectId, versionId: input.versionId, sourceClaimIds: links.map(link => link.claimId).sort(), sceneImage });
        if (parent?.identity !== (asset.provenance as Prisma.JsonObject).parentIdentity) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image parent changed');
      }
      if (hasVideoProvenance(asset)) {
        const video = presentationVideoView(asset);
        if (!video) throw new PresentationAssetError('VALIDATION_ERROR', 'Saved video provenance is invalid');
        const parents = await requireVideoGenerationParents(tx, { researchObjectId: input.researchObjectId, versionId: input.versionId, sourceClaimIds: links.map(link => link.claimId).sort(), video });
        if (parents?.identity !== (asset.provenance as Prisma.JsonObject).parentIdentity) throw new PresentationAssetError('VALIDATION_ERROR', 'Video parents changed');
      }
      if (hasInvalidStoryboard(asset, links.map(link => link.claimId))) throw new PresentationAssetError('VALIDATION_ERROR', 'Saved storyboard is invalid');
    }
    if (asset.label !== PRESENTATION_ASSET_LABEL) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation asset label is invalid');
    const rejectApprovedStoryboard = input.status === 'rejected' && asset.status === 'approved' && (asset.provenance as Prisma.JsonObject)?.subtype === 'sourced_storyboard';
    if (asset.status !== 'draft' && !rejectApprovedStoryboard) throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation asset status is terminal');
    if ((asset.kind === 'image' || asset.kind === 'video') && !(await hasHermesAssetReviewAuthority(tx, {
      ...input, sourceClaimIds: (await tx.presentationAssetClaim.findMany({ where: { presentationAssetId: asset.id } })).map((link) => link.claimId),
    }))) await requirePlatformAdmin(transaction, input.userId);
    const changed = await tx.presentationAsset.updateMany({ where: { id: asset.id, status: asset.status, updatedAt: input.expectedUpdatedAt }, data: { status: input.status } });
    if (changed.count !== 1) throw new PresentationAssetError('CONCURRENT_UPDATE', 'Presentation asset changed concurrently');
    let invalidatedSceneImageCount = 0;
    if (input.status === 'rejected') {
      const dependents = await tx.presentationAsset.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: { in: ['image', 'video'] }, status: { in: ['draft', 'approved'] } } });
      const ids = dependents.filter((child) => presentationSceneImageView(child)?.storyboardAssetId === asset.id
        || presentationVideoView(child)?.storyboardAssetId === asset.id
        || presentationVideoView(child)?.sceneImageAssetIds.includes(asset.id)).map(child => child.id);
      if (ids.length) invalidatedSceneImageCount = (await tx.presentationAsset.updateMany({ where: { id: { in: ids }, status: { in: ['draft', 'approved'] } }, data: { status: 'rejected' } })).count;
    }
    const current = await tx.presentationAsset.findUnique({ where: { id: asset.id } });
    if (!current) throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
    await recordAudit(transaction, tx, { actorId: input.userId, action: `presentation_asset.${input.status}`, workspaceId: version.researchObject.workspaceId, targetType: 'presentation_asset', targetId: asset.id, metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: asset.kind, ...(input.status === 'rejected' ? { invalidatedSceneImageCount } : {}) } }, ctx);
    return current;
  });
}

export { PresentationAssetError } from './errors';

function hasInvalidStoryboard(asset: {
    kind: string;
    provenance: unknown;
    generator?: string;
}, ids: string[]): boolean {
    const p = asset.provenance as {
        subtype?: unknown;
    } | null;
    return (p?.subtype === 'sourced_storyboard' || asset.generator === 'OpenScience Hermes storyboard planner') && !presentationStoryboardView(asset, ids);
}
export async function requireStoryboardBase(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>, payload: PresentationGenerationPayload) {
    const id = payload.storyboard?.baseAssetId;
    if (!id)
        return undefined;
    const asset = await prisma.presentationAsset.findUnique({ where: { id }, include: { sourceClaims: { select: { claimId: true } } } });
    const ids = asset?.sourceClaims.map(link => link.claimId).sort() ?? [];
    const view = asset && presentationStoryboardView(asset, ids);
    if (!asset || asset.deletedAt || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId || !['draft', 'approved'].includes(asset.status) || !view || JSON.stringify(ids) !== JSON.stringify(payload.sourceClaimIds))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Base storyboard is invalid for these sources');
    if (payload.storyboard?.revisionMode === 'art' && (view.output !== 'image' || view.locale !== payload.storyboard.locale
        || view.document.scenes.some(scene => scene.illustration?.schemaVersion !== 2 || scene.paperOriginal)))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Art revision requires a structured image plan in the same language without reused paper originals; create a re-render plan to change an original figure');
    return { view, identity: JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids }) };
}

/** Server-owned review feedback and a private checkpoint; the worker validates its contents and current sources. */
export async function requireStoryboardRevisionTask(prisma: Pick<Prisma.TransactionClient, 'agentTask'>, payload: PresentationGenerationPayload, actorId: string) {
    const id = payload.storyboard?.revisionTaskId;
    if (!id) return undefined;
    if (payload.kind !== 'interactive_html' || payload.storyboard?.output !== 'image' || payload.storyboard.baseAssetId)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision requires an image plan without a base asset');
    const settings = payload.storyboard;
    const readTask = async (taskId: string) => {
        const task = await prisma.agentTask.findUnique({ where: { id: taskId }, include: { session: true } });
        if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'failed'
            || task.session.userId !== actorId || task.session.deletedAt || task.session.status !== 'active'
            || task.session.researchObjectId !== payload.researchObjectId)
            throw new PresentationAssetError('NOT_FOUND', 'Storyboard revision task not found');
        const original = parsePresentationGenerationPayload(task.payload);
        if (original.kind !== 'interactive_html' || original.storyboard?.output !== 'image'
            || original.researchObjectId !== payload.researchObjectId || original.versionId !== payload.versionId
            || JSON.stringify(original.sourceClaimIds) !== JSON.stringify(payload.sourceClaimIds)
            || original.storyboard.locale !== settings.locale || canonicalStoryboardStyle(original.storyboard.style) !== canonicalStoryboardStyle(settings.style))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision task is invalid for these sources and settings');
        const result = task.result && typeof task.result === 'object' && !Array.isArray(task.result) ? task.result : undefined;
        const checkpoint = result?.storyboardCheckpoint;
        if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision requires a saved private plan');
        const review = result?.storyboardReview;
        const hasStructuredReview = Boolean(review && typeof review === 'object' && !Array.isArray(review));
        const prefix = '[blocked] Illustration needs upstream scientific revision: ';
        const feedback = task.error?.startsWith(prefix) ? task.error.slice(prefix.length) : '';
        // Modern review contents and their source/candidate binding are validated by the worker.
        if (!feedback.trim() || (!hasStructuredReview && feedback.length >= 300))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision requires complete scientific review feedback');
        return { task, payload: original, feedback, identity: JSON.stringify({ id: task.id, updatedAt: task.updatedAt, executionAttempt: task.executionAttempt, payload: task.payload, result: task.result, error: task.error }) };
    };
    const source = await readTask(id);
    const rootId = source.payload.storyboard?.revisionTaskId;
    if (rootId) {
        if (rootId === id) throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision chain is cyclic');
        const root = await readTask(rootId);
        if (root.payload.storyboard?.revisionTaskId)
            throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard revision chain exceeds two links');
    }
    return source;
}
