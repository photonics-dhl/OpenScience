import type { Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationStoryboardView } from './storyboard';

export interface SceneImageRequest { storyboardAssetId: string; sceneIndex: number; styleReferenceAssetId?: string }
export function parseSceneImageRequest(value: unknown): SceneImageRequest {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || !('sceneIndex' in v) || !('storyboardAssetId' in v) || Object.keys(v).some(key => !['sceneIndex', 'storyboardAssetId', 'styleReferenceAssetId'].includes(key))
    || typeof v.storyboardAssetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.storyboardAssetId)
    || !Number.isInteger(v.sceneIndex) || Number(v.sceneIndex) < 0 || Number(v.sceneIndex) > 5
    || ('styleReferenceAssetId' in v && (typeof v.styleReferenceAssetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.styleReferenceAssetId)))) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image request is invalid');
  return { storyboardAssetId: v.storyboardAssetId, sceneIndex: v.sceneIndex as number, ...(v.styleReferenceAssetId ? { styleReferenceAssetId: v.styleReferenceAssetId as string } : {}) };
}

/** A style reference is an optional private input, never a source Claim. */
export async function requireStyleReferenceImage(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>, input: {
  researchObjectId: string; versionId: string; styleReferenceAssetId?: string;
}) {
  if (!input.styleReferenceAssetId) return undefined;
  const asset = await prisma.presentationAsset.findUnique({ where: { id: input.styleReferenceAssetId } });
  const p = asset?.provenance as Record<string, unknown> | null;
  if (!asset || asset.deletedAt || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId
    || asset.kind !== 'image' || !['draft', 'approved'].includes(asset.status)
    || p?.subtype !== 'storyboard_scene_image' || p.contentType !== 'image/png'
    || !asset.generator.startsWith('OpenScience Hermes scene image / ')) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Style reference requires an available Hermes image in the same research version');
  }
  return { id: asset.id, contentHash: asset.contentHash, objectKey: asset.objectKey };
}
export function hasSceneImageProvenance(asset: { provenance: unknown; generator?: string }): boolean {
  const p = asset.provenance as Record<string, unknown> | null;
  // Reviewed imports retain the original generator for attribution, but their
  // source Claims belong to the import's version rather than a local storyboard.
  return p?.subtype === 'storyboard_scene_image'
    || (!['admin_reviewed_import', 'version_history_copy'].includes(String(p?.source)) && asset.generator?.startsWith('OpenScience Hermes scene image / ') === true);
}
export function presentationSceneImageView(asset: { kind: string; provenance: unknown }): SceneImageRequest | undefined {
  try {
    const p = asset.provenance as Record<string, unknown> | null;
    if (asset.kind !== 'image' || p?.subtype !== 'storyboard_scene_image' || typeof p.parentIdentity !== 'string' || !p.parentIdentity) return undefined;
    return parseSceneImageRequest(p.sceneImage);
  } catch { return undefined; }
}
export async function requireSceneImageParent(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>, payload: {
  researchObjectId: string; versionId: string; sourceClaimIds: string[]; sceneImage?: SceneImageRequest;
}) {
  if (!payload.sceneImage) return undefined;
  const settings = parseSceneImageRequest(payload.sceneImage);
  const asset = await prisma.presentationAsset.findUnique({ where: { id: settings.storyboardAssetId }, include: { sourceClaims: { select: { claimId: true } } } });
  const ids = asset?.sourceClaims.map(link => link.claimId).sort() ?? [];
  const view = asset && presentationStoryboardView(asset, ids);
  if (!asset || asset.deletedAt || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId || asset.status !== 'approved'
    || !view || !view.document.scenes[settings.sceneIndex] || JSON.stringify(ids) !== JSON.stringify(payload.sourceClaimIds)) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image requires an approved storyboard with the exact version and Claims');
  const provenance = asset.provenance as Record<string, unknown>;
  return { view, contentHash: asset.contentHash,
    sourceEvidenceIdentity: typeof provenance.sourceEvidenceIdentity === 'string' ? provenance.sourceEvidenceIdentity : undefined,
    identity: JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids }) };
}
