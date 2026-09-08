import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationSceneImageView } from './scene-image';
import { presentationStoryboardView } from './storyboard';
import { requireAnimationSourceSupport } from './animation';

export const ONCHIP_FIELD_SAMPLING_PROFILE = 'onchip-field-sampling-v1' as const;
export const CONTENT_DRIVEN_PROFILE = 'content-driven-v1' as const;
export const ONCHIP_SOURCE_CONTENT_HASH = 'd57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a';
export const ONCHIP_SCENE_ROLES = [
  'driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction',
] as const;

export type VideoGenerationRequest = {
  storyboardAssetId: string;
  sceneImageAssetIds: [string, string, string, string, string];
  profile: typeof ONCHIP_FIELD_SAMPLING_PROFILE;
  sceneRoles: typeof ONCHIP_SCENE_ROLES;
} | {
  storyboardAssetId: string;
  sceneImageAssetIds: string[];
  profile: typeof CONTENT_DRIVEN_PROFILE;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVideoGenerationRequest(value: unknown): VideoGenerationRequest {
  const input = value as Record<string, unknown> | null;
  if (input?.profile === CONTENT_DRIVEN_PROFILE) {
    if (Array.isArray(input) || Object.keys(input).sort().join(',') !== 'profile,sceneImageAssetIds,storyboardAssetId'
      || typeof input.storyboardAssetId !== 'string' || !UUID.test(input.storyboardAssetId)
      || !Array.isArray(input.sceneImageAssetIds) || input.sceneImageAssetIds.length < 3 || input.sceneImageAssetIds.length > 6
      || input.sceneImageAssetIds.some(id => typeof id !== 'string' || !UUID.test(id))
      || new Set(input.sceneImageAssetIds).size !== input.sceneImageAssetIds.length) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Content-driven video request is invalid');
    }
    return { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: input.storyboardAssetId, sceneImageAssetIds: input.sceneImageAssetIds as string[] };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'profile,sceneImageAssetIds,sceneRoles,storyboardAssetId'
    || typeof input.storyboardAssetId !== 'string' || !UUID.test(input.storyboardAssetId)
    || input.profile !== ONCHIP_FIELD_SAMPLING_PROFILE
    || !Array.isArray(input.sceneRoles) || !isDeepStrictEqual(input.sceneRoles, ONCHIP_SCENE_ROLES)
    || !Array.isArray(input.sceneImageAssetIds) || input.sceneImageAssetIds.length !== 5
    || input.sceneImageAssetIds.some((id) => typeof id !== 'string' || !UUID.test(id))
    || new Set(input.sceneImageAssetIds).size !== 5) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Video generation request is invalid');
  }
  return {
    storyboardAssetId: input.storyboardAssetId,
    sceneImageAssetIds: input.sceneImageAssetIds as [string, string, string, string, string],
    profile: ONCHIP_FIELD_SAMPLING_PROFILE,
    sceneRoles: ONCHIP_SCENE_ROLES,
  };
}

export function presentationVideoView(asset: { kind: string; provenance: unknown }): VideoGenerationRequest | undefined {
  try {
    const provenance = asset.provenance as Record<string, unknown> | null;
    if (asset.kind !== 'video' || provenance?.subtype !== 'approved_storyboard_video'
      || typeof provenance.parentIdentity !== 'string' || !provenance.parentIdentity) return undefined;
    return parseVideoGenerationRequest(provenance.video);
  } catch { return undefined; }
}

export function hasVideoProvenance(asset: { kind: string; provenance: unknown }): boolean {
  const provenance = asset.provenance as Record<string, unknown> | null;
  return asset.kind === 'video' && provenance?.subtype === 'approved_storyboard_video';
}

type VideoParentDb = Pick<Prisma.TransactionClient, 'presentationAsset' | 'evidenceRecord' | 'claimNode'>;

export async function requireVideoGenerationParents(prisma: VideoParentDb, payload: {
  researchObjectId: string; versionId: string; sourceClaimIds: string[]; video?: VideoGenerationRequest;
}) {
  if (!payload.video) return undefined;
  const settings = parseVideoGenerationRequest(payload.video);
  const storyboard = await prisma.presentationAsset.findUnique({
    where: { id: settings.storyboardAssetId }, include: { sourceClaims: { select: { claimId: true } } },
  });
  const claimIds = storyboard?.sourceClaims.map((source) => source.claimId).sort() ?? [];
  const storyboardView = storyboard && presentationStoryboardView(storyboard, claimIds);
  const storyboardIdentity = storyboard && JSON.stringify({
    contentHash: storyboard.contentHash, provenance: storyboard.provenance, ids: claimIds,
  });
  if (!storyboard || storyboard.researchObjectId !== payload.researchObjectId
    || storyboard.versionId !== payload.versionId || storyboard.status !== 'approved'
    || !storyboardView || storyboardView.locale !== 'zh'
    || storyboardView.document.scenes.length !== settings.sceneImageAssetIds.length
    || (settings.profile === CONTENT_DRIVEN_PROFILE && storyboardView.document.scenes.some(scene => !scene.animation))
    || storyboardView.document.scenes.some((scene) => [...scene.narration].length > 120)
    || storyboardView.document.scenes.reduce((total, scene) => total + [...scene.narration].length, 0) > 450
    || !isDeepStrictEqual(claimIds, [...payload.sourceClaimIds].sort())) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Video requires an approved source-bound storyboard and matching scene images in the exact version');
  }
  const images = await prisma.presentationAsset.findMany({
    where: { id: { in: settings.sceneImageAssetIds } }, include: { sourceClaims: { select: { claimId: true } } },
  });
  let claimIdentity: unknown;
  if (settings.profile === CONTENT_DRIVEN_PROFILE) {
    const sources = await prisma.claimNode.findMany({ where: { id: { in: claimIds }, researchObjectId: payload.researchObjectId,
      versionId: payload.versionId, extractionStatus: 'succeeded' }, select: { id: true, statement: true, updatedAt: true }, orderBy: { id: 'asc' } });
    if (sources.length !== claimIds.length) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Animation sources changed');
    for (const scene of storyboardView.document.scenes) requireAnimationSourceSupport(scene.animation!, sources);
    claimIdentity = sources.map(source => ({ id: source.id, updatedAt: source.updatedAt }));
  }
  const byId = new Map(images.map((asset) => [asset.id, asset]));
  const orderedImages = settings.sceneImageAssetIds.map((id, sceneIndex) => {
    const asset = byId.get(id);
    const ids = asset?.sourceClaims.map((source) => source.claimId).sort() ?? [];
    const scene = asset && presentationSceneImageView(asset);
    const provenance = asset?.provenance as Record<string, unknown> | null;
    if (!asset || asset.kind !== 'image' || asset.status !== 'approved'
      || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId
      || !scene || scene.storyboardAssetId !== storyboard.id || scene.sceneIndex !== sceneIndex
      || provenance?.parentIdentity !== storyboardIdentity || !isDeepStrictEqual(ids, claimIds)) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Video scene images must be the approved ordered children of the storyboard');
    }
    return asset;
  });
  const sourceEvidence = await prisma.evidenceRecord.findMany({
    where: {
      researchObjectId: payload.researchObjectId, versionId: payload.versionId,
      claimId: { in: claimIds }, extractionStatus: 'succeeded',
      ...(settings.profile === ONCHIP_FIELD_SAMPLING_PROFILE ? { contentHash: ONCHIP_SOURCE_CONTENT_HASH } : {}),
    }, select: { id: true, claimId: true, contentHash: true, artifactId: true, updatedAt: true }, orderBy: { id: 'asc' },
  });
  if (!sourceEvidence.length || (settings.profile === CONTENT_DRIVEN_PROFILE
    && claimIds.some(id => !sourceEvidence.some(row => row.claimId === id)))) {
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Video requires reviewed Evidence for every selected Claim');
  }
  return {
    settings, storyboard, storyboardView, storyboardIdentity,
    orderedImages,
    identity: JSON.stringify({
      profile: settings.profile, storyboard: storyboardIdentity,
      images: orderedImages.map((asset) => ({ id: asset.id, contentHash: asset.contentHash, provenance: asset.provenance })),
      ...(settings.profile === ONCHIP_FIELD_SAMPLING_PROFILE ? { sourceContentHash: ONCHIP_SOURCE_CONTENT_HASH }
        : { sourceEvidence, sourceClaims: claimIdentity }),
    }),
  };
}
