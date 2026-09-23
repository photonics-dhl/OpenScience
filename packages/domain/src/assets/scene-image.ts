import type { Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationStoryboardView, type StoryboardRequest } from './storyboard';

export interface SceneImageRequest { storyboardAssetId: string; sceneIndex: number; styleReferenceAssetId?: string; revisionAssetId?: string }
export interface GeneratedImageReview {
  stage: 'generated-image'; requestId: string; decision: 'accepted' | 'blocked'; summary: string;
  repairInstruction: string | null; contentHash: string; sourceEvidenceIdentity: string;
  parentIdentity: string; promptHash: string; responseHash: string;
  provider: 'chatgpt-web-science-review' | 'codex-sol-image-review'; model: string;
}
export type ImageReviewIdentity = Pick<GeneratedImageReview, 'requestId' | 'contentHash' | 'sourceEvidenceIdentity' | 'parentIdentity'>;
const reviewHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

/** One receipt format for persisted image review, used by workers and approval. */
export function readStoredGeneratedImageReview(value: unknown, expected: ImageReviewIdentity): GeneratedImageReview | undefined {
  if (value === undefined) return undefined;
  const saved = value as Record<string, unknown> | null;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)
    || Object.keys(saved).sort().join(',') !== 'contentHash,decision,model,parentIdentity,promptHash,provider,repairInstruction,requestId,responseHash,sourceEvidenceIdentity,stage,summary'
    || saved.stage !== 'generated-image'
    || (saved.provider !== 'chatgpt-web-science-review'
      && !(saved.provider === 'codex-sol-image-review' && saved.model === 'gpt-5.6-sol'))
    || typeof saved.model !== 'string' || !saved.model.trim() || saved.model.length > 200
    || ![saved.contentHash, saved.sourceEvidenceIdentity, saved.promptHash, saved.responseHash].every(reviewHash)
    || Object.entries(expected).some(([key, expectedValue]) => saved[key] !== expectedValue)
    || (saved.decision !== 'accepted' && saved.decision !== 'blocked')
    || typeof saved.summary !== 'string' || !saved.summary.trim() || saved.summary.length > 2000
    || (saved.repairInstruction !== null && (typeof saved.repairInstruction !== 'string'
      || !saved.repairInstruction.trim() || saved.repairInstruction.length > 400))
    || (saved.decision === 'accepted' && saved.repairInstruction !== null)) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Saved image review does not match the persisted image');
  }
  return saved as unknown as GeneratedImageReview;
}

export function requireAcceptedSceneImageReview(asset: { id: string; contentHash: string; provenance: unknown },
  parent: { identity: string; sourceEvidenceIdentity?: string }): void {
  const provenance = asset.provenance as Record<string, unknown> | null;
  if (['admin_reviewed_import', 'version_history_copy'].includes(String(provenance?.source))) return;
  const review = readStoredGeneratedImageReview(provenance?.imageReview, {
    requestId: asset.id, contentHash: asset.contentHash,
    sourceEvidenceIdentity: String(provenance?.sourceEvidenceIdentity ?? ''), parentIdentity: parent.identity,
  });
  if (provenance?.source !== 'approved_storyboard_scene' || provenance.taskId !== asset.id
    || provenance.sourceEvidenceIdentity !== parent.sourceEvidenceIdentity || review?.decision !== 'accepted') {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image requires an accepted pixel review for the saved image and current sources');
  }
}

export function generatedSceneImageRequiresPixelReview(payload: unknown): boolean {
  const task = payload as Record<string, unknown> | null;
  const authority = task?.hermesRunAuthority as Record<string, unknown> | null;
  return !['onchip-field-sampling-v1', 'content-driven-v1', 'content-driven-image-v1'].includes(String(authority?.profile));
}

/** Only explicit legacy Hermes profiles lack a pixel-review writer. Manual tasks must be reviewed. */
export async function sceneImageRequiresPixelReview(prisma: Pick<Prisma.TransactionClient, 'agentTask'>,
  asset: { id: string; provenance: unknown }): Promise<boolean> {
  const provenance = asset.provenance as Record<string, unknown> | null;
  if (['admin_reviewed_import', 'version_history_copy'].includes(String(provenance?.source))) return false;
  if (provenance?.pixelReviewRequired !== undefined) return true;
  if (provenance?.imageReview !== undefined) return true;
  const task = await prisma.agentTask.findUnique({ where: { id: asset.id }, select: { payload: true } });
  return !task || generatedSceneImageRequiresPixelReview(task.payload);
}
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
