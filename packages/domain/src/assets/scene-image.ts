import type { Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationStoryboardView, type StoryboardRequest } from './storyboard';

export interface SceneImageRequest { storyboardAssetId: string; sceneIndex: number; styleReferenceAssetId?: string; revisionAssetId?: string }
export function parseSceneImageRequest(value: unknown): SceneImageRequest {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || !('sceneIndex' in v) || !('storyboardAssetId' in v) || Object.keys(v).some(key => !['sceneIndex', 'storyboardAssetId', 'styleReferenceAssetId', 'revisionAssetId'].includes(key))
    || typeof v.storyboardAssetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.storyboardAssetId)
    || !Number.isInteger(v.sceneIndex) || Number(v.sceneIndex) < 0 || Number(v.sceneIndex) > 5
    || ['styleReferenceAssetId', 'revisionAssetId'].some(key => key in v && (typeof v[key] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v[key] as string)))) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image request is invalid');
  return { storyboardAssetId: v.storyboardAssetId, sceneIndex: v.sceneIndex as number, ...(v.styleReferenceAssetId ? { styleReferenceAssetId: v.styleReferenceAssetId as string } : {}), ...(v.revisionAssetId ? { revisionAssetId: v.revisionAssetId as string } : {}) };
}

/** Only a rejected output from this run can supply a correction to the same approved scene. */
export async function requireSceneImageRevision(prisma: Pick<Prisma.TransactionClient, 'presentationAsset' | 'agentTask'>, input: {
  researchObjectId: string; versionId: string; sourceClaimIds: string[]; sceneImage?: SceneImageRequest;
  hermesRunAuthority?: { runId: string; profile: string };
}) {
  if (!input.sceneImage?.revisionAssetId) return undefined;
  const parent = await requireSceneImageParent(prisma, input);
  const asset = await prisma.presentationAsset.findUnique({ where: { id: input.sceneImage.revisionAssetId }, include: { sourceClaims: true } });
  const task = asset ? await prisma.agentTask.findUnique({ where: { id: asset.id } }) : null;
  const prior = task?.payload as Prisma.JsonObject | undefined;
  const authority = prior?.hermesRunAuthority as Prisma.JsonObject | undefined;
  const p = asset?.provenance as Prisma.JsonObject | undefined;
  const review = p?.imageReview as Prisma.JsonObject | undefined;
  const scene = asset && presentationSceneImageView(asset);
  if (!asset || asset.deletedAt || asset.status !== 'rejected' || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId
    || !scene || scene.revisionAssetId || scene.storyboardAssetId !== input.sceneImage.storyboardAssetId || scene.sceneIndex !== input.sceneImage.sceneIndex
    || !task || task.deletedAt || task.status !== 'succeeded' || input.hermesRunAuthority?.profile !== 'visual-narrative-v1'
    || authority?.runId !== input.hermesRunAuthority.runId || authority.profile !== input.hermesRunAuthority.profile
    || JSON.stringify(asset.sourceClaims.map(link => link.claimId).sort()) !== JSON.stringify([...input.sourceClaimIds].sort())
    || !parent || p?.parentIdentity !== parent.identity || review?.parentIdentity !== parent.identity
    || review?.stage !== 'generated-image' || review.decision !== 'blocked' || review.contentHash !== asset.contentHash
    || review.sourceEvidenceIdentity !== parent.sourceEvidenceIdentity
    || typeof review.repairInstruction !== 'string' || !review.repairInstruction.trim() || review.repairInstruction.length > 400) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image correction requires a matching completed internal review');
  }
  return { assetId: asset.id, repairInstruction: review.repairInstruction };
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
  const paperOriginal = view.document.scenes[settings.sceneIndex].paperOriginal;
  if (paperOriginal) {
    const original = await prisma.presentationAsset.findUnique({ where: { id: paperOriginal.assetId } });
    const metadata = original?.provenance as Record<string, unknown> | null;
    if (!original || original.deletedAt || original.status !== 'approved' || original.kind !== 'image'
      || original.researchObjectId !== payload.researchObjectId || original.versionId !== payload.versionId
      || original.objectKey !== paperOriginal.objectKey || original.contentHash !== paperOriginal.contentHash
      || metadata?.subtype !== 'paper_original_figure') {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Paper-original reuse requires the exact approved original in this version');
    }
  }
  const provenance = asset.provenance as Record<string, unknown>;
  return { view, contentHash: asset.contentHash,
    sourceEvidenceIdentity: typeof provenance.sourceEvidenceIdentity === 'string' ? provenance.sourceEvidenceIdentity : undefined,
    identity: JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids }) };
}

/**
 * Pay-once per scene: an approved image for the same (parent, sceneIndex) under the same parent
 * identity must not be paid for again. To regenerate, the caller must first reject the existing
 * approved image, or change the parent plan so its identity no longer matches. This guard sits
 * next to requireSceneImageParent because the UI hides already-imaged scenes but the API does
 * not (and clients can submit directly).
 */
export async function requireSceneImageSpendIsNew(
  prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>,
  parent: { identity: string },
  payload: { researchObjectId: string; versionId: string; sceneImage?: SceneImageRequest },
): Promise<void> {
  if (!payload.sceneImage) return;
  const covering = await prisma.presentationAsset.findFirst({
    where: {
      researchObjectId: payload.researchObjectId,
      versionId: payload.versionId,
      kind: 'image',
      status: 'approved',
      deletedAt: null,
      provenance: { path: ['sceneImage', 'storyboardAssetId'], equals: payload.sceneImage.storyboardAssetId },
    },
    select: { provenance: true },
  });
  if (!covering) return;
  const provenance = (covering.provenance as Record<string, unknown> | null) ?? {};
  if (provenance.subtype !== 'storyboard_scene_image') return;
  const scene = provenance.sceneImage as Record<string, unknown> | undefined;
  if (!scene
    || scene.storyboardAssetId !== payload.sceneImage.storyboardAssetId
    || scene.sceneIndex !== payload.sceneImage.sceneIndex
    || provenance.parentIdentity !== parent.identity) return;
  throw new PresentationAssetError(
    'VALIDATION_ERROR',
    'An approved image already covers this scene; reject it before generating a replacement',
  );
}

/**
 * Look up registered paper-original figures for a figurePlan's reuse entries.
 * Returns a map keyed by the figurePlan entry id (`Fig. N` etc.). A paper-original
 * is an approved `image` asset with `provenance.subtype = 'paper_original_figure'` whose
 * `provenance.figureId` matches a reuse decision and whose
 * `provenance.researchObjectId/versionId` scope the current draft.
 *
 * The map is empty when no figurePlan entries have decision 'reuse', or when
 * the lookup finds no registered originals. The caller (handler / planner) is
 * responsible for raising `paper_original_missing_<figureId>` when a reuse
 * decision has no matching asset.
 */
export interface PaperOriginalRef { assetId: string; objectKey: string; contentHash: string; figureId: string; sourceClaimId?: string }
export async function findPaperOriginalAssets(
  prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>,
  scope: { researchObjectId: string; versionId: string; figurePlan?: StoryboardRequest['figurePlan'] },
): Promise<Map<string, PaperOriginalRef>> {
  const out = new Map<string, PaperOriginalRef>();
  const ids = (scope.figurePlan?.figures ?? []).filter((figure) => figure.decision === 'reuse').map((figure) => figure.id);
  if (!ids.length) return out;
  const rows = await prisma.presentationAsset.findMany({
    where: {
      researchObjectId: scope.researchObjectId,
      versionId: scope.versionId,
      kind: 'image',
      status: 'approved',
      deletedAt: null,
      provenance: { path: ['subtype'], equals: 'paper_original_figure' },
    },
    select: { id: true, contentHash: true, objectKey: true, provenance: true },
  });
  for (const row of rows) {
    const p = row.provenance as Record<string, unknown> | null;
    const figureId = typeof p?.figureId === 'string' ? p.figureId : undefined;
    if (!figureId || !ids.includes(figureId)) continue;
    const existing = out.get(figureId);
    if (existing && existing.assetId !== row.id) {
      throw new PresentationAssetError('CONCURRENT_UPDATE', `Paper-original binding is ambiguous for ${figureId}: multiple approved assets require an explicit source selection`);
    }
    out.set(figureId, {
      assetId: row.id,
      objectKey: row.objectKey,
      contentHash: row.contentHash,
      figureId,
      ...(typeof p?.sourceClaimId === 'string' ? { sourceClaimId: p.sourceClaimId } : {}),
    });
  }
  return out;
}

/**
 * Validate a figurePlan against registered paper-originals. For every `reuse`
 * decision in `figurePlan`, a matching `paper_original_figure` asset must
 * exist for this RO/version. Missing entries raise `paper_original_missing_<id>`
 * — the planner fails the plan task with that string so the user can either
 * upload the original or change the decision to `re-render` / `abstract`.
 */
export function requirePaperOriginalsForReuse(
  paperOriginals: Map<string, PaperOriginalRef>,
  figurePlan: StoryboardRequest['figurePlan'],
): void {
  if (!figurePlan) return;
  for (const figure of figurePlan.figures) {
    if (figure.decision !== 'reuse') continue;
    if (!paperOriginals.has(figure.id)) {
      throw new PresentationAssetError(
        'VALIDATION_ERROR',
        `paper_original_missing_${figure.id}`,
      );
    }
  }
}
