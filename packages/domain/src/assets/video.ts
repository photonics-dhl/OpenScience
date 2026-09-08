import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationSceneImageView } from './scene-image';
import { presentationStoryboardView } from './storyboard';

export const ONCHIP_FIELD_SAMPLING_PROFILE = 'onchip-field-sampling-v1' as const;
export const ONCHIP_SOURCE_CONTENT_HASH = 'd57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a';
export const ONCHIP_SCENE_ROLES = [
  'driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction',
] as const;

export interface VideoGenerationRequest {
  storyboardAssetId: string;
  sceneImageAssetIds: [string, string, string, string, string];
  profile: typeof ONCHIP_FIELD_SAMPLING_PROFILE;
  sceneRoles: typeof ONCHIP_SCENE_ROLES;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVideoGenerationRequest(value: unknown): VideoGenerationRequest {
  const input = value as Record<string, unknown> | null;
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
    sceneImageAssetIds: input.sceneImageAssetIds as VideoGenerationRequest['sceneImageAssetIds'],
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

type VideoParentDb = Pick<Prisma.TransactionClient, 'presentationAsset' | 'evidenceRecord'>;

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
    || !storyboardView || storyboardView.locale !== 'zh' || storyboardView.document.scenes.length !== 5
    || storyboardView.document.scenes.some((scene) => [...scene.narration].length > 120)
    || storyboardView.document.scenes.reduce((total, scene) => total + [...scene.narration].length, 0) > 450
    || !isDeepStrictEqual(claimIds, [...payload.sourceClaimIds].sort())) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Video requires an approved five-scene storyboard in the exact version');
  }
  const images = await prisma.presentationAsset.findMany({
    where: { id: { in: settings.sceneImageAssetIds } }, include: { sourceClaims: { select: { claimId: true } } },
  });
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
  const sourceEvidence = await prisma.evidenceRecord.findFirst({
    where: {
      researchObjectId: payload.researchObjectId, versionId: payload.versionId,
      claimId: { in: claimIds }, extractionStatus: 'succeeded', contentHash: ONCHIP_SOURCE_CONTENT_HASH,
    }, select: { id: true },
  });
  if (!sourceEvidence) {
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'On-chip video requires reviewed Evidence from the fixed source paper');
  }
  return {
    settings, storyboard, storyboardView, storyboardIdentity,
    orderedImages,
    identity: JSON.stringify({
      profile: settings.profile, storyboard: storyboardIdentity,
      images: orderedImages.map((asset) => ({ id: asset.id, contentHash: asset.contentHash, provenance: asset.provenance })),
      sourceContentHash: ONCHIP_SOURCE_CONTENT_HASH,
    }),
  };
}
