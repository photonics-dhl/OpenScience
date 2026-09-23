import { requireStyleReferenceImage } from './scene-image';
import { parseSceneImageRequest, presentationSceneImageView, requireSceneImageParent, requireSceneImageRevision, requireSceneImageSpendIsNew, hasSceneImageProvenance, readStoredGeneratedImageReview, requireAcceptedSceneImageReview, sceneImageRequiresPixelReview, generatedSceneImageRequiresPixelReview, type SceneImageRequest } from './scene-image';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { lockLiveResearchObject, lockTrashReferences } from '../trash/trash';
import { isWorkingDraftVersion } from '../commit/version-history';
import { recordValue, refreshWorkingResearchRecord } from '../commit/research-record-snapshot';
import { isVersionHistoryCopy, requireValidVersionHistoryCopy } from './version-history-copy';
import { parseStoryboardRequest, parseStoryboardDocument, presentationStoryboardView, canonicalStoryboardStyle, type StoryboardRequest, type StoryboardView } from './storyboard';
import type { AuditContext } from '@openscience/observability';
import type { PresentationAsset, PresentationAssetStatus, Prisma } from '@prisma/client';
import { getBlobStorageKey } from '@openscience/storage';
import { createAgentSession, getAgentTask, submitAgentTask, submitDeterministicPresentationTask, type AgentDeps, type AgentTaskView } from '../agent/agent';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';
import { PresentationAssetError } from './errors';
import { ONCHIP_FIELD_SAMPLING_PROFILE, CONTENT_DRIVEN_PROFILE, CONTENT_DRIVEN_IMAGE_PROFILE, VISUAL_NARRATIVE_PROFILE, hasVideoProvenance, parseVideoGenerationRequest, presentationVideoView, requireVideoGenerationParents, type VideoGenerationRequest } from './video';
import { requireAnimationSourceSupport } from './animation';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { validateSourceLocator } from '../research-intelligence/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ['chart', 'interactive_html', 'image', 'video'] as const;
const SERIALIZABLE_RETRY_DELAYS_MS = [50, 100, 250, 500, 1000, 2000, 4000, 8000] as const;
export const HERMES_IMAGE_RENDER_RECOVERY_ACTION = 'hermes.research_run.image_render_recovery';
export const NARRATIVE_PIXEL_REPLAN = 'narrative_pixel_scientific_replan';
export const NARRATIVE_PIXEL_PLAN_REVISION = 'narrative_pixel_plan_scientific_revision';
export const NARRATIVE_TECHNICAL_RECOVERY = 'narrative_scene_not_submitted_recovery';
export const NARRATIVE_TECHNICAL_REVIEW_FOLLOWUP = 'narrative_scene_review_followup';
export const STORYBOARD_SOURCE_SUPPORT_INVALID = 'storyboard_source_support_invalid';
export interface ImageReviewNotSubmittedInput {
    requestId: string; promptHash: string; researchObjectId: string; versionId: string;
    candidateHash: string; sourceEvidenceIdentity: string;
}
export const DETERMINISTIC_PRESENTATION_GENERATOR = 'OpenScience deterministic renderer';
export const DETERMINISTIC_PRESENTATION_GENERATOR_VERSION = 'openscience-presentation-v2';
export type PresentationGenerationKind = (typeof KINDS)[number];
export interface HermesPresentationAuthority { runId: string; stage: 'storyboard' | 'scene_image' | 'video'; ordinal: number; profile: 'onchip-field-sampling-v1' | 'content-driven-v1' | 'content-driven-image-v1' | 'visual-narrative-v1' }
export interface PresentationGenerationPayload { schemaVersion: 1; researchObjectId: string; versionId: string; kind: PresentationGenerationKind; sourceClaimIds: string[]; storyboard?: StoryboardRequest; sceneImage?: SceneImageRequest; video?: VideoGenerationRequest; hermesRunAuthority?: HermesPresentationAuthority }
export interface PresentationAssetView {
  storyboard?: StoryboardView;
  sceneImage?: SceneImageRequest;
  paperOriginal?: { figureId: string; caption?: string };
  canGenerateSceneImage: boolean;
  canGenerateVideo: boolean;
  canTransition: boolean;
  canApprove: boolean;
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
      || ![ONCHIP_FIELD_SAMPLING_PROFILE, CONTENT_DRIVEN_PROFILE, CONTENT_DRIVEN_IMAGE_PROFILE, VISUAL_NARRATIVE_PROFILE].includes(authority.profile as HermesPresentationAuthority['profile'])) throw new PresentationAssetError('VALIDATION_ERROR', 'Hermes run authority is invalid');
    hermesRunAuthority = authority as unknown as HermesPresentationAuthority;
  }
  if (storyboard?.revisionImageAssetId && (!hermesRunAuthority || hermesRunAuthority.profile !== VISUAL_NARRATIVE_PROFILE
    || hermesRunAuthority.stage !== 'storyboard' || hermesRunAuthority.ordinal !== 0)) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image-driven scientific revision requires its bounded Hermes run');
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

/** Draft row fence with bounded Serializable retries for presentation writes. */
export async function withPresentationAssetWrite<T>(
  prisma: Pick<AgentDeps['prisma'], '$transaction'>,
  input: PresentationScope,
  operation: (tx: Prisma.TransactionClient, version: Awaited<ReturnType<typeof requirePresentationWriteScope>>) => Promise<T>,
  options: { refreshWorkingRecord?: boolean } = {},
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
        if (options.refreshWorkingRecord !== false) await refreshWorkingResearchRecord(tx, input);
        return result;
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < SERIALIZABLE_RETRY_DELAYS_MS.length) {
        // Concurrent scene results must not reopen their transactions on the same schedule.
        const baseDelayMs = SERIALIZABLE_RETRY_DELAYS_MS[attempt]!;
        const delayMs = baseDelayMs + Math.floor(Math.random() * baseDelayMs);
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

/** Reuse a pixel review's rendering correction while preserving the approved scientific scene. */
export async function readNarrativeImageRenderSource(prisma: Prisma.TransactionClient, input: {
  actorId: string; runId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[]; imageAssetId: string;
}) {
  const version = await requirePresentationWriteScope(prisma, { ...input, userId: input.actorId });
  if (version.researchObject.deletedAt || version.researchObject.status !== 'draft')
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image rendering requires the current writable draft');
  const task = await prisma.agentTask.findUnique({ where: { id: input.imageAssetId }, include: { session: true } });
  const image = await prisma.presentationAsset.findUnique({ where: { id: input.imageAssetId }, include: { sourceClaims: true } });
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'succeeded'
    || task.session.deletedAt || task.session.status !== 'active' || task.session.userId !== input.actorId
    || task.session.researchObjectId !== input.researchObjectId || !image || image.deletedAt || image.kind !== 'image'
    || image.status !== 'rejected' || image.researchObjectId !== input.researchObjectId || image.versionId !== input.versionId)
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image rendering rejection is unavailable');
  const payload = parsePresentationGenerationPayload(task.payload);
  const scene = presentationSceneImageView(image);
  if (payload.kind !== 'image' || !payload.sceneImage || payload.sceneImage.revisionAssetId || !scene || scene.revisionAssetId
    || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId
    || !isDeepStrictEqual(payload.sourceClaimIds, [...input.sourceClaimIds].sort()) || !isDeepStrictEqual(scene, payload.sceneImage)
    || !isDeepStrictEqual(image.sourceClaims.map(link => link.claimId).sort(), payload.sourceClaimIds)
    || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: input.runId, stage: 'scene_image', ordinal: scene.sceneIndex, profile: VISUAL_NARRATIVE_PROFILE }))
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image rendering source binding changed');
  const replacement = { ...payload, sceneImage: { ...payload.sceneImage, revisionAssetId: image.id } };
  await requireSceneImageRevision(prisma, replacement);
  const parent = await requireSceneImageParent(prisma, replacement);
  const parentTask = await prisma.agentTask.findUnique({ where: { id: scene.storyboardAssetId }, include: { session: true } });
  const parentAsset = await prisma.presentationAsset.findUnique({ where: { id: scene.storyboardAssetId } });
  const parentMetadata = recordValue(parentAsset?.provenance);
  const parentReview = recordValue(parentMetadata.illustrationReview);
  const metadata = recordValue(image.provenance);
  const review = recordValue(metadata.imageReview);
  if (!parent || !parentAsset || !parentTask || parentTask.deletedAt || parentTask.status !== 'succeeded'
    || parentTask.kind !== 'presentation.generate' || parentTask.session.deletedAt || parentTask.session.status !== 'active'
    || parentTask.session.userId !== input.actorId || parentTask.session.researchObjectId !== input.researchObjectId
    || !parent.view.document.narrative || parent.view.document.scenes.length !== 1 || scene.sceneIndex !== 0
    || parent.view.document.scenes[0]!.paperOriginal || parentMetadata.taskId !== parentAsset.id
    || parentReview.stage !== 'final-brief' || parentReview.decision !== 'accepted' || parentReview.requestId !== parentAsset.id
    || parentReview.candidateHash !== createHash('sha256').update(JSON.stringify(parent.view.document)).digest('hex')
    || parentReview.sourceEvidenceIdentity !== parent.sourceEvidenceIdentity
    || metadata.taskId !== image.id || metadata.source !== 'approved_storyboard_scene'
    || metadata.storyboardContentHash !== parent.contentHash || review.requestId !== image.id
    || review.provider !== 'chatgpt-web-science-review' || typeof review.model !== 'string' || !review.model.trim()
    || ![parentReview.promptHash, parentReview.responseHash, review.promptHash, review.responseHash, parent.sourceEvidenceIdentity]
      .every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)))
    throw new PresentationAssetError('VALIDATION_ERROR', 'Rendering correction requires the unchanged accepted narrative and pixel review');
  const parentPayload = parsePresentationGenerationPayload(parentTask.payload);
  if (parentPayload.kind !== 'interactive_html' || !parentPayload.storyboard?.narrative || parentPayload.storyboard.output !== 'image'
    || parentPayload.researchObjectId !== input.researchObjectId || parentPayload.versionId !== input.versionId
    || !isDeepStrictEqual(parentPayload.sourceClaimIds, payload.sourceClaimIds)
    || !isDeepStrictEqual(parentPayload.hermesRunAuthority, { runId: input.runId, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE }))
    throw new PresentationAssetError('VALIDATION_ERROR', 'Rendering correction storyboard task changed');
  const claims = await prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
    researchObjectId: input.researchObjectId, versionId: input.versionId }, orderBy: { id: 'asc' } });
  const checkpoint = recordValue(recordValue(parentTask.result).storyboardCheckpoint);
  const claimContent = JSON.stringify(claims.map(({ id, parentClaimId, kind, statement, assessment, conditions, limitations, extractionStatus }) => ({
    id, parentClaimId, kind, statement, assessment, conditions: [...conditions].sort(), limitations: [...limitations].sort(), extractionStatus,
  })));
  if (claims.length !== payload.sourceClaimIds.length || claims.some(claim => claim.extractionStatus !== 'succeeded')
    || checkpoint.claimContent !== claimContent || checkpoint.sourceEvidenceIdentity !== parent.sourceEvidenceIdentity)
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Rendering correction scientific Claims changed');
  const evidence = (await prisma.evidenceRecord.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId,
    claimId: { in: payload.sourceClaimIds }, extractionStatus: 'succeeded', exactQuote: { not: null } }, orderBy: [{ claimId: 'asc' }, { id: 'asc' }] }))
    .filter(row => { const lineage = recordValue(claims.find(claim => claim.id === row.claimId)?.provenance); const origin = recordValue(row.provenance);
      return origin.source === 'reviewed_ingestion' && origin.sourceTaskId === (lineage.sourceTaskLineage ?? lineage.sourceTaskId); });
  const evidenceIdentity = createHash('sha256').update(JSON.stringify(evidence.map(({ id, claimId, artifactId, contentHash,
    exactQuote, relation, locator, extractionStatus, updatedAt, provenance }) => ({
    id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance,
  })))).digest('hex');
  const artifactIds = [...new Set(evidence.map(row => row.artifactId))];
  if (evidenceIdentity !== parent.sourceEvidenceIdentity || artifactIds.some(id => !id)
    || claims.some(claim => !evidence.some(row => row.claimId === claim.id && row.exactQuote?.trim()))
    || await prisma.artifact.count({ where: { id: { in: artifactIds as string[] }, workspaceId: version.researchObject.workspaceId,
      deletedAt: null, bytesPurgedAt: null } }) !== artifactIds.length)
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Rendering correction original evidence changed');
  return { task, image, parent, parentTask, parentAsset, payload: replacement,
    reviewHash: review.responseHash as string, sourceEvidenceIdentity: evidenceIdentity,
    workspaceId: version.researchObject.workspaceId };
}

/** Larger budgets authorize only the one image task explicitly named by their durable receipt. */
export async function requireHermesImageRenderRecoveryAuthority(prisma: Prisma.TransactionClient, input: {
  runId: string; actorId: string; taskId: string; phase: 'generation' | 'review' | 'current';
}) {
  const run = await prisma.hermesResearchRun.findUnique({ where: { id: input.runId }, include: { steps: true } });
  const step = run?.steps.find(item => item.stage === 'scene_image' && item.agentTaskId === input.taskId);
  const task = await prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  const receipts = await prisma.auditLog.findMany({ where: { action: HERMES_IMAGE_RENDER_RECOVERY_ACTION,
    targetType: 'hermes_research_run', targetId: input.runId }, take: 2 });
  const receipt = receipts[0]; const meta = recordValue(receipt?.metadata);
  if (!run || run.actorId !== input.actorId || !run.versionId || run.profile !== VISUAL_NARRATIVE_PROFILE
    || !Number.isSafeInteger(run.maxAgentTasks) || run.maxAgentTasks! < 9 || !step || !task || task.deletedAt
    || step.ordinal !== 0 || run.steps.filter(item => item.stage === 'scene_image').length !== 1
    || run.steps.filter(item => item.stage === 'storyboard').length !== 1
    || task.kind !== 'presentation.generate' || task.session.deletedAt || task.session.status !== 'active'
    || task.session.userId !== input.actorId || task.session.researchObjectId !== run.researchObjectId
    || receipts.length !== 1 || !receipt || receipt.actorId !== input.actorId || meta.newTaskId !== task.id || meta.stepId !== step.id
    || typeof meta.previousMaxAgentTasks !== 'number' || ![9, 11, 13].includes(meta.previousMaxAgentTasks)
    || meta.maxAgentTasks !== run.maxAgentTasks || run.maxAgentTasks !== meta.previousMaxAgentTasks + 1
    || meta.existingTaskCount !== meta.previousMaxAgentTasks || meta.newTaskCount !== 1 || meta.chargeableAttempts !== 1
    || meta.newRunCount !== 0 || meta.scientificReplanning !== false || meta.sceneIndex !== step.ordinal
    || typeof meta.requestDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(meta.requestDigest)
    || (input.phase === 'generation' && (run.status !== 'generating_scene_images' || step.status !== 'running' || task.status !== 'running'))
    || (input.phase === 'review' && (run.status !== 'awaiting_scene_images_review' || step.status !== 'awaiting_approval'
      || task.status !== 'succeeded' || step.presentationAssetId !== task.id))
    || (input.phase === 'current' && !((run.status === 'generating_scene_images' && step.status === 'running'
      && ['pending', 'running', 'succeeded', 'failed'].includes(task.status))
      || (run.status === 'awaiting_scene_images_review' && step.status === 'awaiting_approval' && task.status === 'succeeded'))))
    throw new PresentationAssetError('VALIDATION_ERROR', 'Explicit image rendering recovery authority is unavailable');
  const payload = parsePresentationGenerationPayload(task.payload);
  if (!payload.sceneImage?.revisionAssetId || payload.kind !== 'image' || !isDeepStrictEqual(payload, meta.taskPayload)
    || payload.researchObjectId !== run.researchObjectId || payload.versionId !== run.versionId
    || !isDeepStrictEqual(payload.sourceClaimIds, [...run.sourceClaimIds].sort())
    || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: run.id, stage: 'scene_image', ordinal: step.ordinal, profile: run.profile })
    || payload.sceneImage.revisionAssetId !== meta.rejectedImageAssetId)
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image rendering recovery task binding changed');
  const source = await readNarrativeImageRenderSource(prisma, { actorId: input.actorId, runId: run.id,
    researchObjectId: run.researchObjectId, versionId: run.versionId, sourceClaimIds: run.sourceClaimIds,
    imageAssetId: payload.sceneImage.revisionAssetId });
  const parentStep = run.steps.find(item => item.stage === 'storyboard');
  const presentations = await prisma.agentTask.count({ where: { kind: 'presentation.generate',
    payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  const sources = run.steps.filter(item => ['source_composition', 'source_review'].includes(item.stage)).length;
  if (receipt.workspaceId !== source.workspaceId || !isDeepStrictEqual(payload, source.payload)
    || meta.previousTaskId !== source.task.id || meta.rejectedImageContentHash !== source.image.contentHash
    || meta.reviewResponseHash !== source.reviewHash || meta.parentIdentity !== source.parent.identity
    || meta.storyboardAssetId !== source.parentAsset.id || meta.storyboardContentHash !== source.parent.contentHash
    || meta.sourceEvidenceIdentity !== source.sourceEvidenceIdentity || parentStep?.status !== 'succeeded'
    || parentStep.agentTaskId !== source.parentTask.id || parentStep.presentationAssetId !== source.parentAsset.id
    || sources + presentations !== run.maxAgentTasks || task.idempotencyKey !== `hermes-run:${run.id}:scene_image:${step.ordinal}:correction:${source.task.id}`)
    throw new PresentationAssetError('VALIDATION_ERROR', 'Image rendering recovery sources or allowance changed');
  return { run, step, task, payload, source };
}

async function hasHermesAssetReviewAuthority(
  prisma: AgentDeps['prisma'] | Prisma.TransactionClient,
  input: PresentationScope & { assetId: string; sourceClaimIds: string[] },
): Promise<boolean> {
  const step = await prisma.hermesResearchStep.findFirst({
    where: { presentationAssetId: input.assetId, status: 'awaiting_approval', run: {
      actorId: input.userId, researchObjectId: input.researchObjectId, versionId: input.versionId,
      OR: [{ profile: ONCHIP_FIELD_SAMPLING_PROFILE, maxAgentTasks: 7 }, { profile: CONTENT_DRIVEN_PROFILE, maxAgentTasks: 8 }, { profile: CONTENT_DRIVEN_IMAGE_PROFILE, maxAgentTasks: 7 },
        { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: { gte: 9 } }],
      status: { in: ['awaiting_scene_images_review', 'awaiting_video_review'] },
    } }, include: { run: true },
  });
  if (!step || !isDeepStrictEqual([...step.run.sourceClaimIds].sort(), [...input.sourceClaimIds].sort())) return false;
  const pixel = await readNarrativePixelReplanAuthority(prisma, { runId: step.run.id, actorId: input.userId });
  if (pixel) return Boolean(step.agentTaskId === input.assetId && step.ordinal < pixel.sceneLimit);
  if (step.run.profile === VISUAL_NARRATIVE_PROFILE && ![9, 11, 13].includes(step.run.maxAgentTasks ?? 0)) {
    if (!step.agentTaskId || step.agentTaskId !== input.assetId) return false;
    return Boolean(await requireHermesImageRenderRecoveryAuthority(prisma, { runId: step.run.id,
      actorId: input.userId, taskId: step.agentTaskId, phase: 'review' }).catch(() => null));
  }
  return true;
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
    if (generatedSceneImageRequiresPixelReview(payload) && !/^[a-f0-9]{64}$/u.test(sceneParent?.sourceEvidenceIdentity ?? ''))
      throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Reviewed scene image requires a source-bound storyboard; revise the plan before generating');
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
    let pixelReviewAccepted = true;
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
        if (sceneValid && parent && await sceneImageRequiresPixelReview(deps.prisma, asset)) {
          try { requireAcceptedSceneImageReview(asset, parent); }
          catch (error) { if (!(error instanceof PresentationAssetError)) throw error; pixelReviewAccepted = false; }
        }
      } catch (error) { if (!(error instanceof PresentationAssetError)) throw error; sceneValid = false; }
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
    const canTransition = sceneValid && videoValid && !hasInvalidStoryboard(asset, asset.sourceClaims.map(source => source.claimId)) && canWrite && asset.status === 'draft' && (!(asset.kind === 'image' || asset.kind === 'video') || user?.platformRole === 'platform_admin' || hermesReviewable.has(asset.id));
    return ({
    sceneImage: presentationSceneImageView(asset),
    ...(paperOriginal ? { paperOriginal } : {}),
    canGenerateSceneImage: claimsValid && canWrite && user?.platformRole === 'platform_admin' && asset.status === 'approved' && !!presentationStoryboardView(asset, asset.sourceClaims.map(source => source.claimId)),
    canGenerateVideo,
    storyboard: presentationStoryboardView(asset, asset.sourceClaims.map(source => source.claimId)),
    canTransition,
    canApprove: canTransition && pixelReviewAccepted,
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
  return transitionPresentationAssetUnderReview(deps, input, ctx);
}

/** Approve or retain a rejected candidate from a real internal review, not a user's aesthetic decision. */
export async function transitionHermesPresentationAsset(deps: AgentDeps, input: { runId: string; assetId: string }): Promise<void> {
  const run = await deps.prisma.hermesResearchRun.findUnique({ where: { id: input.runId } });
  const asset = await deps.prisma.presentationAsset.findUnique({ where: { id: input.assetId } });
  if (!run?.versionId || !asset || asset.status !== 'draft') return;
  const provenance = asset.provenance as Prisma.JsonObject;
  const review = (asset.kind === 'image' ? provenance.imageReview : provenance.illustrationReview) as Prisma.JsonObject | undefined;
  if (!review || !['accepted', 'revised', 'blocked'].includes(String(review.decision))) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Hermes candidate has no completed internal review');
  }
  const pixel = await readNarrativePixelReplanAuthority(deps.prisma, { runId: run.id, actorId: run.actorId });
  await transitionPresentationAssetUnderReview(deps, { userId: run.actorId, researchObjectId: run.researchObjectId,
    versionId: run.versionId, assetId: asset.id, expectedUpdatedAt: asset.updatedAt,
    status: review.decision === 'blocked' || ((pixel || run.maxAgentTasks === 11 || run.maxAgentTasks === 13) && asset.kind !== 'image' && review.decision !== 'accepted') ? 'rejected' : 'approved' }, {}, run.id);
}

async function transitionPresentationAssetUnderReview(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string; assetId: string; status: Extract<PresentationAssetStatus, 'approved' | 'rejected'>; expectedUpdatedAt: Date;
}, ctx: AuditContext, internalRunId?: string): Promise<PresentationAsset> {
  return withPresentationAssetWrite(deps.prisma, input, async (tx, version) => {
    const transaction = { ...deps, prisma: tx as AgentDeps['prisma'] };
    const asset = await tx.presentationAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.deletedAt || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId) throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
    const pixel = internalRunId ? await readNarrativePixelReplanAuthority(tx, { runId: internalRunId, actorId: input.userId }) : null;
    if (pixel && !deps.audit?.record) throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative replacement audit is unavailable');
    if (internalRunId) {
      const run = await tx.hermesResearchRun.findUnique({ where: { id: internalRunId }, include: { steps: true } });
      const stage = asset.kind === 'image' ? 'scene_image' : 'storyboard';
      const step = run?.steps.find(item => item.stage === stage && item.presentationAssetId === asset.id);
      const task = step?.agentTaskId ? await tx.agentTask.findUnique({ where: { id: step.agentTaskId } }) : null;
      const p = asset.provenance as Prisma.JsonObject;
      const review = (stage === 'scene_image' ? p.imageReview : p.illustrationReview) as Prisma.JsonObject | undefined;
      const imageReview = stage === 'scene_image' ? readStoredGeneratedImageReview(p.imageReview, {
        requestId: asset.id, contentHash: asset.contentHash,
        sourceEvidenceIdentity: String(p.sourceEvidenceIdentity ?? ''), parentIdentity: String(p.parentIdentity ?? ''),
      }) : undefined;
      const expectedStatus = stage === 'scene_image' ? 'awaiting_scene_images_review' : 'awaiting_storyboard_review';
      const ids = (await tx.presentationAssetClaim.findMany({ where: { presentationAssetId: asset.id } })).map(link => link.claimId).sort();
      const taskPayload = task ? parsePresentationGenerationPayload(task.payload) : undefined;
      const renderAuthority = run && task && ![9, 11, 13].includes(run.maxAgentTasks ?? 0) && stage === 'scene_image'
        ? await requireHermesImageRenderRecoveryAuthority(tx, { runId: run.id, actorId: input.userId,
          taskId: task.id, phase: 'review' }).catch(() => null) : null;
      if (!run || run.profile !== VISUAL_NARRATIVE_PROFILE || (![9, 11, 13].includes(run.maxAgentTasks ?? 0) && !renderAuthority && !pixel) || run.status !== expectedStatus
        || run.actorId !== input.userId || run.researchObjectId !== input.researchObjectId || run.versionId !== input.versionId
        || !step || step.status !== 'awaiting_approval' || task?.status !== 'succeeded' || task.deletedAt
        || taskPayload?.hermesRunAuthority?.runId !== run.id || taskPayload.hermesRunAuthority.stage !== stage
        || task.id !== asset.id || p.taskId !== asset.id || !isDeepStrictEqual(ids, [...run.sourceClaimIds].sort())
        || !review || review.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
        || typeof review.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(review.promptHash)
        || typeof review.responseHash !== 'string' || !/^[a-f0-9]{64}$/.test(review.responseHash)
        || review.requestId !== asset.id || typeof review.provider !== 'string' || !review.provider
        || (stage === 'scene_image' ? !imageReview : (review.stage !== 'final-brief'
          || !['accepted', 'revised', 'blocked'].includes(String(review.decision))))
        || (pixel && (stage === 'storyboard' ? task.id !== pixel.task.id
          : taskPayload.sceneImage?.storyboardAssetId !== pixel.task.id || step.ordinal >= pixel.sceneLimit))
        || (input.status === 'approved') !== (stage === 'storyboard' && (pixel || run.maxAgentTasks === 11 || run.maxAgentTasks === 13) ? review.decision === 'accepted' : review.decision !== 'blocked')) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Hermes internal review does not match the current candidate and grant');
      }
      // Source-support authority was replayed above; its receipt preserves all historical image decisions.
      if (pixel && pixel.metadata.cause !== STORYBOARD_SOURCE_SUPPORT_INVALID && stage === 'storyboard' && input.status === 'approved') {
        const source = await readNarrativePixelReplanSource(tx, { actorId: input.userId, runId: run.id,
          researchObjectId: run.researchObjectId, versionId: run.versionId!, sourceClaimIds: run.sourceClaimIds,
          parentAssetId: String(pixel.metadata.parentStoryboardAssetId), imageAssetIds: pixel.sceneReviews.map(scene => String(scene.taskId)),
          ...(pixel.metadata.sceneSet === 'terminal' ? { terminalSceneSet: { receiptId: pixel.rootReceipt.id } } : {}) });
        if (source.identity !== pixel.metadata.sourceIdentity)
          throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative feedback source changed');
        // Keep historical pixels and their reviews, but do not offer an old
        // sibling as an approved default after accepting a replacement set.
        const superseded = source.images.filter(item => item.image.status === 'approved');
        for (const { image } of superseded) {
          const changed = await tx.presentationAsset.updateMany({ where: {
            id: image.id, researchObjectId: run.researchObjectId, versionId: run.versionId!,
            kind: 'image', status: 'approved', deletedAt: null, contentHash: image.contentHash, updatedAt: image.updatedAt,
          }, data: { status: 'rejected' } });
          if (changed.count !== 1) throw new PresentationAssetError('VALIDATION_ERROR', 'Superseded narrative image changed concurrently');
        }
        if (superseded.length) await deps.audit?.record({ actorId: null,
          workspaceId: version.researchObject.workspaceId, action: 'hermes.research_run.scene_images_superseded',
          targetType: 'hermes_research_run', targetId: run.id,
          metadata: { performedBy: 'system', authorizedByUserId: input.userId, userAccepted: false,
            reason: 'replacement_storyboard_accepted',
            replacementStoryboardAssetId: asset.id, parentStoryboardAssetId: source.parent.id,
            recoveryReceiptId: pixel.receipt.id,
            images: superseded.map(({ image }) => ({ id: image.id, contentHash: image.contentHash,
              previousStatus: 'approved', status: 'rejected' })) } }, tx);
      }
    }
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
        if (!parent || parent.identity !== (asset.provenance as Prisma.JsonObject).parentIdentity) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image parent changed');
        if (await sceneImageRequiresPixelReview(tx, asset)) requireAcceptedSceneImageReview(asset, parent);
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
    await recordAudit(transaction, tx, { actorId: internalRunId ? null : input.userId, action: `presentation_asset.${internalRunId ? 'system_' : ''}${input.status}`, workspaceId: version.researchObject.workspaceId, targetType: 'presentation_asset', targetId: asset.id, metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: asset.kind, ...(input.status === 'rejected' ? { invalidatedSceneImageCount } : {}), ...(internalRunId ? { executor: 'hermes', authorizedByUserId: input.userId, runId: internalRunId, userAccepted: false } : {}) } }, ctx);
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
        || Boolean(view.document.narrative) !== Boolean(payload.storyboard.narrative)
        || view.document.scenes.some(scene => scene.illustration?.schemaVersion !== 2 || (!view.document.narrative && scene.paperOriginal))))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Art revision requires a structured image plan in the same language and narrative scope; legacy paper originals require a re-render plan');
    return { view, identity: JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids }) };
}

/** Read the exact historical image rejection and its original narrative; this grants no execution authority. */
export async function readNarrativeImageReplanSource(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset'>, input: {
    actorId: string; runId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[]; imageAssetId: string;
    acceptedParent?: boolean;
}) {
    const image = await prisma.presentationAsset.findUnique({ where: { id: input.imageAssetId }, include: { sourceClaims: { select: { claimId: true } } } });
    const imageTask = await prisma.agentTask.findUnique({ where: { id: input.imageAssetId }, include: { session: true } });
    const sceneImage = image && presentationSceneImageView(image);
    const p = recordValue(image?.provenance);
    const review = recordValue(p.imageReview);
    const expectedIds = [...input.sourceClaimIds].sort();
    if (!image || image.deletedAt || image.kind !== 'image' || image.status !== 'rejected'
        || image.researchObjectId !== input.researchObjectId || image.versionId !== input.versionId
        || !sceneImage || sceneImage.sceneIndex !== 0 || sceneImage.revisionAssetId
        || p.taskId !== image.id || p.source !== 'approved_storyboard_scene'
        || !isDeepStrictEqual(image.sourceClaims.map(link => link.claimId).sort(), expectedIds)
        || review.stage !== 'generated-image' || review.decision !== 'blocked' || review.repairInstruction !== null
        || review.requestId !== image.id || review.contentHash !== image.contentHash || review.parentIdentity !== p.parentIdentity
        || review.sourceEvidenceIdentity !== p.sourceEvidenceIdentity || review.provider !== 'chatgpt-web-science-review'
        || typeof review.model !== 'string' || !review.model.trim()
        || typeof review.summary !== 'string' || !review.summary.trim() || review.summary.length > 2000
        || ![review.promptHash, review.responseHash, p.sourceEvidenceIdentity].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative image rejection is not eligible for scientific replanning');
    }
    const parent = await prisma.presentationAsset.findUnique({ where: { id: sceneImage.storyboardAssetId }, include: { sourceClaims: { select: { claimId: true } } } });
    const task = await prisma.agentTask.findUnique({ where: { id: sceneImage.storyboardAssetId }, include: { session: true } });
    for (const candidate of [task, imageTask]) {
        if (!candidate || candidate.deletedAt || candidate.kind !== 'presentation.generate' || candidate.status !== 'succeeded'
            || candidate.session.deletedAt || candidate.session.status !== 'active' || candidate.session.userId !== input.actorId
            || candidate.session.researchObjectId !== input.researchObjectId) throw new PresentationAssetError('NOT_FOUND', 'Narrative revision source task unavailable');
    }
    const payload = parsePresentationGenerationPayload(task!.payload);
    const imagePayload = parsePresentationGenerationPayload(imageTask!.payload);
    const parentProof = await requireSceneImageParent(prisma, { ...input, sceneImage });
    const parentProvenance = recordValue(parent?.provenance);
    const parentReview = recordValue(parentProvenance.illustrationReview);
    const revisionReview = recordValue(parentProvenance.illustrationRevisionReview);
    if (!parent || !parentProof || parentProvenance.taskId !== parent.id || parentProvenance.source !== 'verified_claims'
        || parentReview.stage !== 'final-brief' || parentReview.decision !== (input.acceptedParent ? 'accepted' : 'revised') || parentReview.acceptance != null
        || (!input.acceptedParent && parentProvenance.illustrationRevisionReview != null)
        || (input.acceptedParent && (parentReview.candidateHash !== createHash('sha256').update(JSON.stringify(parentProof.view.document)).digest('hex')
          || (parentProvenance.illustrationRevisionReview != null && (revisionReview.stage !== 'final-brief' || revisionReview.decision !== 'revised'
            || revisionReview.requestId !== parent.id || revisionReview.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
            || ![revisionReview.candidateHash, revisionReview.promptHash, revisionReview.responseHash].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))))))
        || parentReview.requestId !== parent.id || parentReview.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
        || ![parentReview.promptHash, parentReview.responseHash].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
        || parentProof.identity !== p.parentIdentity || parent.contentHash !== p.storyboardContentHash
        || parentProof.sourceEvidenceIdentity !== p.sourceEvidenceIdentity || !parentProof.view.document.narrative
        || parentProof.view.document.scenes.length !== 1 || parentProof.view.document.scenes[0]!.paperOriginal
        || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId
        || !isDeepStrictEqual(payload.sourceClaimIds, expectedIds) || !payload.storyboard?.narrative || payload.storyboard.output !== 'image'
        || (!input.acceptedParent && (payload.storyboard.revisionTaskId || payload.storyboard.revisionImageAssetId || payload.storyboard.baseAssetId))
        || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: input.runId, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE })
        || imagePayload.researchObjectId !== input.researchObjectId || imagePayload.versionId !== input.versionId
        || !isDeepStrictEqual(imagePayload.sourceClaimIds, expectedIds) || !isDeepStrictEqual(imagePayload.sceneImage, sceneImage)
        || !isDeepStrictEqual(imagePayload.hermesRunAuthority, { runId: input.runId, stage: 'scene_image', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE })) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative image and original revised storyboard no longer match');
    }
    return { task: task!, payload, view: parentProof.view, parent, image, imageTask: imageTask!, feedback: review.summary,
        reviewHash: review.responseHash as string, sourceEvidenceIdentity: p.sourceEvidenceIdentity as string,
        identity: JSON.stringify({ parentIdentity: parentProof.identity, imageId: image.id, contentHash: image.contentHash,
            imageProvenance: image.provenance, taskPayload: task!.payload, imageTaskPayload: imageTask!.payload }) };
}

/** A complete scene set. Technical failures are receipts, never scientific feedback. */
async function readNarrativeTerminalSceneSource(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'auditLog'>, input: {
    actorId: string; runId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[];
    parentAssetId: string; imageAssetIds: string[];
    terminalSceneSet?: { receiptId?: string; inspectImageRecoveryState?: (requestId: string) => Promise<string>;
        canRetryImageReviewBeforeSubmission?: (input: ImageReviewNotSubmittedInput) => Promise<boolean> };
}, technicalRecovery = false) {
    const ids = [...input.sourceClaimIds].sort();
    const parent = await prisma.presentationAsset.findUnique({ where: { id: input.parentAssetId }, include: { sourceClaims: { select: { claimId: true } } } });
    const task = await prisma.agentTask.findUnique({ where: { id: input.parentAssetId }, include: { session: true } });
    const view = parent && presentationStoryboardView(parent, ids);
    const p = recordValue(parent?.provenance); const review = recordValue(p.illustrationReview);
    const liveTask = (candidate: typeof task) => candidate && !candidate.deletedAt && candidate.kind === 'presentation.generate'
        && candidate.status === 'succeeded' && !candidate.session.deletedAt && candidate.session.status === 'active'
        && candidate.session.userId === input.actorId && candidate.session.researchObjectId === input.researchObjectId;
    if (!parent || parent.deletedAt || parent.status !== 'approved' || parent.researchObjectId !== input.researchObjectId
        || parent.versionId !== input.versionId || !view?.document.narrative || view.output !== 'image' || !liveTask(task)
        || view.document.scenes.length < 1 || view.document.scenes.length > 6 || input.imageAssetIds.length !== view.document.scenes.length
        || new Set(input.imageAssetIds).size !== input.imageAssetIds.length || p.source !== 'verified_claims' || p.taskId !== parent.id
        || !isDeepStrictEqual(parent.sourceClaims.map(link => link.claimId).sort(), ids)
        || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== parent.id
        || review.sourceEvidenceIdentity !== p.sourceEvidenceIdentity || review.acceptance != null
        || review.candidateHash !== createHash('sha256').update(JSON.stringify(view.document)).digest('hex')
        || ![review.promptHash, review.responseHash, p.sourceEvidenceIdentity].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative replanning requires one accepted parent and its complete reviewed scene set');
    }
    const payload = parsePresentationGenerationPayload(task!.payload);
    if (payload.kind !== 'interactive_html' || !payload.storyboard?.narrative || payload.storyboard.output !== 'image'
        || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId
        || !isDeepStrictEqual(payload.sourceClaimIds, ids)
        || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: input.runId, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE })) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative parent task scope changed');
    }
    const parentIdentity = JSON.stringify({ contentHash: parent.contentHash, provenance: parent.provenance, ids });
    const receipt = input.terminalSceneSet?.receiptId ? await prisma.auditLog.findUnique({ where: { id: input.terminalSceneSet.receiptId } }) : null;
    const receiptMeta = recordValue(receipt?.metadata);
    if (input.terminalSceneSet?.receiptId && (!receipt || receipt.actorId !== input.actorId
        || receipt.action !== 'hermes.research_run.generation_retry' || receipt.targetType !== 'hermes_research_run' || receipt.targetId !== input.runId
        || receiptMeta.correction !== (technicalRecovery ? NARRATIVE_TECHNICAL_RECOVERY : NARRATIVE_PIXEL_REPLAN) || receiptMeta.sceneSet !== 'terminal'
        || receiptMeta.parentStoryboardAssetId !== parent.id || receiptMeta.parentIdentity !== parentIdentity
        || receiptMeta.sourceEvidenceIdentity !== p.sourceEvidenceIdentity || !Array.isArray(receiptMeta.sceneReviews))) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Terminal scene authorization changed');
    }
    const images = [];
    const failures: Array<Record<string, unknown>> = [];
    for (const imageId of input.imageAssetIds) {
        const image = await prisma.presentationAsset.findUnique({ where: { id: imageId }, include: { sourceClaims: { select: { claimId: true } } } });
        const imageTask = await prisma.agentTask.findUnique({ where: { id: imageId }, include: { session: true } });
        if (!imageTask || imageTask.deletedAt || imageTask.kind !== 'presentation.generate' || imageTask.session.deletedAt
            || imageTask.session.status !== 'active' || imageTask.session.userId !== input.actorId
            || imageTask.session.researchObjectId !== input.researchObjectId
            || !['succeeded', ...(input.terminalSceneSet ? ['failed'] : [])].includes(imageTask.status)) {
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scene task is not terminal');
        }
        const imagePayload = parsePresentationGenerationPayload(imageTask.payload); const scene = imagePayload.sceneImage;
        if (imagePayload.kind !== 'image' || imagePayload.researchObjectId !== input.researchObjectId || imagePayload.versionId !== input.versionId
            || !isDeepStrictEqual(imagePayload.sourceClaimIds, ids) || !scene || scene.storyboardAssetId !== parent.id
            || !view.document.scenes[scene.sceneIndex]
            || !isDeepStrictEqual(imagePayload.hermesRunAuthority, { runId: input.runId, stage: 'scene_image', ordinal: scene.sceneIndex, profile: VISUAL_NARRATIVE_PROFILE })) {
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative image task scope changed');
        }
        await requireSceneImageParent(prisma, imagePayload);
        const provenance = recordValue(image?.provenance);
        if (image && (image.deletedAt || image.kind !== 'image' || image.researchObjectId !== input.researchObjectId || image.versionId !== input.versionId
            || !isDeepStrictEqual(presentationSceneImageView(image), scene) || provenance.taskId !== image.id
            || provenance.source !== 'approved_storyboard_scene' || provenance.storyboardContentHash !== parent.contentHash
            || provenance.parentIdentity !== parentIdentity || provenance.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
            || !isDeepStrictEqual(image.sourceClaims.map(link => link.claimId).sort(), ids))) {
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scene asset identity changed');
        }
        if (imageTask.status === 'failed') {
            if (imageTask.result !== null || !imageTask.error || scene.revisionAssetId || scene.styleReferenceAssetId
                || (technicalRecovery && (imageTask.executionAttempt !== 1 || imageTask.retryCount !== 0))
                || (image && (image.status !== 'draft' || provenance.imageReview != null))) {
                throw new PresentationAssetError('VALIDATION_ERROR', 'Failed scene is not an unreviewed terminal result');
            }
            const taskIdentity = JSON.stringify({ id: imageTask.id, status: imageTask.status, executionAttempt: imageTask.executionAttempt,
                retryCount: imageTask.retryCount, error: imageTask.error, result: imageTask.result, payload: imageTask.payload, updatedAt: imageTask.updatedAt });
            let reviewAuditIdentity: string | null = null;
            // Dynamic scene briefs may use two structured text attempts before image/review.
            // The fifth row is a sentinel, not an additional authorized model attempt.
            const calls = technicalRecovery || image ? await prisma.auditLog.findMany({ where: {
                requestId: imageTask.id, action: 'ai.gateway.call',
            }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5 }) : [];
            const planningCalls = calls.filter(call => recordValue(call.metadata).operation === 'text');
            const imageCalls = calls.filter(call => recordValue(call.metadata).operation === 'image');
            const reviews = calls.filter(call => recordValue(call.metadata).operation === 'scientific_review');
            if (calls.length >= 5 || imageCalls.length > 1 || planningCalls.length > 2
                || (planningCalls.length > 0 && (view.document.scenes[scene.sceneIndex]!.illustration
                    || view.document.scenes[scene.sceneIndex]!.paperOriginal))
                || calls.some(call => { const meta = recordValue(call.metadata);
                    return !['text', 'image', 'scientific_review'].includes(String(meta.operation))
                        || call.actorId !== null || call.targetType !== 'ai_gateway' || call.createdAt < imageTask.createdAt
                        || call.createdAt > imageTask.updatedAt || meta.fallbackReason !== null;
                }) || planningCalls.some(call => { const meta = recordValue(call.metadata);
                    return typeof meta.provider !== 'string' || !/^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(meta.provider)
                        || typeof meta.model !== 'string' || !meta.model.trim() || meta.retryCount !== 0
                        || !['succeeded', 'failed'].includes(String(meta.outcome))
                        || (meta.outcome === 'succeeded' ? meta.error !== null : meta.finishReason !== 'length' || typeof meta.error !== 'string')
                        || typeof meta.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.promptHash)
                        || meta.inputContentHash !== null || meta.selectionReason !== null || meta.pageCount !== 0 || !isDeepStrictEqual(meta.pageNumbers, [])
                        || (image && call.createdAt > image.createdAt) || (imageCalls[0] && call.createdAt > imageCalls[0].createdAt);
                }) || new Set(planningCalls.map(call => recordValue(call.metadata).provider)).size > 1
                || (planningCalls.length > 0 && (recordValue(planningCalls.at(-1)!.metadata).outcome !== 'succeeded'
                    || recordValue(planningCalls.at(-1)!.metadata).finishReason === 'length'))
                || imageCalls.some(call => { const meta = recordValue(call.metadata);
                    return typeof meta.provider !== 'string' || !meta.provider.trim() || typeof meta.model !== 'string' || !meta.model.trim()
                        || meta.retryCount !== 0 || !['succeeded', 'failed'].includes(String(meta.outcome))
                        || meta.error !== (meta.outcome === 'succeeded' ? null : 'image_provider_failed')
                        || typeof meta.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.promptHash)
                        || (image && (image.generator !== `OpenScience Hermes scene image / ${meta.provider}` || image.promptHash !== meta.promptHash));
                })
                || (technicalRecovery && !image && (reviews.length !== 0
                    || imageCalls.some(call => recordValue(call.metadata).outcome !== 'failed')))) {
                throw new PresentationAssetError('VALIDATION_ERROR', 'Scene has contradictory or untrusted provider history');
            }
            if (image) {
                const call = reviews[0]; const meta = recordValue(call?.metadata);
                if (reviews.length !== 1
                    || !call || call.actorId !== null || call.targetType !== 'ai_gateway'
                    || call.createdAt < image.createdAt || call.createdAt > imageTask.updatedAt
                    || meta.operation !== 'scientific_review' || meta.provider !== 'chatgpt-web-science-review' || meta.model !== 'chatgpt-web/6-pro'
                    || meta.outcome !== 'failed' || meta.error !== 'scientific_review_failed' || meta.retryCount !== 0 || meta.fallbackReason !== null
                    || meta.selectionReason !== 'high_risk_scientific_review'
                    || meta.inputContentHash !== p.sourceEvidenceIdentity || meta.pageCount !== 1 || !isDeepStrictEqual(meta.pageNumbers, [1])
                    || typeof meta.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.promptHash)) {
                    throw new PresentationAssetError('VALIDATION_ERROR', 'Unreviewed scene needs its unique failed scientific review');
                }
                reviewAuditIdentity = JSON.stringify({ id: call.id, createdAt: call.createdAt, metadata: call.metadata });
                if (technicalRecovery && (provenance.contentType !== 'image/png' || !image.objectKey
                    || !/^[a-f0-9]{64}$/.test(image.contentHash)
                    || (!receipt && await input.terminalSceneSet?.canRetryImageReviewBeforeSubmission?.({
                        requestId: imageTask.id, promptHash: meta.promptHash as string,
                        researchObjectId: input.researchObjectId, versionId: input.versionId,
                        candidateHash: image.contentHash, sourceEvidenceIdentity: p.sourceEvidenceIdentity as string,
                    }).catch(() => false) !== true))) {
                    throw new PresentationAssetError('VALIDATION_ERROR', 'Image review has no exact pre-submission proof');
                }
            }
            const recorded = Array.isArray(receiptMeta.sceneReviews)
                ? receiptMeta.sceneReviews.find(item => recordValue(item).taskId === imageTask.id) : undefined;
            const recordedFailure = recordValue(recorded);
            // Inspect once at authorization. Later source reads retain the immutable receipt,
            // not the evolving spool state of an old request that may still produce a result.
            const recoveryState = image ? undefined : receipt
                ? recordedFailure.failureKind === 'submission_unknown' ? recordedFailure.recoveryState : 'not_submitted'
                : await input.terminalSceneSet?.inspectImageRecoveryState?.(imageTask.id).catch(() => 'unsafe');
            const submissionUnknown = !image
                && (recoveryState === 'uncertain' || recoveryState === 'submitted_without_result');
            if (!image && recoveryState !== 'not_submitted' && !submissionUnknown) {
                throw new PresentationAssetError('VALIDATION_ERROR', 'Scene submission proof is unavailable or unsafe');
            }
            const failure = { sceneIndex: scene.sceneIndex, taskId: imageTask.id, imageId: image?.id ?? null,
                contentHash: image?.contentHash ?? null, reviewHash: null, decision: null,
                failureKind: image ? 'review_failed' : submissionUnknown ? 'submission_unknown' : 'not_submitted', taskIdentity, reviewAuditIdentity,
                ...(submissionUnknown ? { recoveryState } : {}),
                ...(planningCalls.length ? { planningAuditIdentity: JSON.stringify(planningCalls.map(call => ({
                    id: call.id, createdAt: call.createdAt, metadata: call.metadata,
                }))) } : {}),
                imageIdentity: image ? JSON.stringify({ id: image.id, contentHash: image.contentHash, objectKey: image.objectKey,
                    provenance: image.provenance, sourceClaimIds: ids }) : null };
            if (receipt && !isDeepStrictEqual(recorded, failure)) {
                throw new PresentationAssetError('VALIDATION_ERROR', 'Terminal scene submission proof changed');
            }
            failures.push(failure);
            continue;
        }
        const pixelReview = recordValue(provenance.imageReview);
        if (!image || image.deletedAt || image.kind !== 'image' || !scene || !liveTask(imageTask)
            || image.researchObjectId !== input.researchObjectId || image.versionId !== input.versionId
            || scene.storyboardAssetId !== parent.id || !view.document.scenes[scene.sceneIndex]
            || provenance.taskId !== image.id || provenance.source !== 'approved_storyboard_scene'
            || provenance.storyboardContentHash !== parent.contentHash || provenance.parentIdentity !== parentIdentity
            || provenance.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
            || !isDeepStrictEqual(image.sourceClaims.map(link => link.claimId).sort(), ids)
            || pixelReview.stage !== 'generated-image' || !['accepted', 'blocked'].includes(String(pixelReview.decision))
            || !(input.terminalSceneSet ? ['draft', pixelReview.decision === 'accepted' ? 'approved' : 'rejected']
                : [pixelReview.decision === 'accepted' ? 'approved' : 'rejected']).includes(image.status)
            || pixelReview.requestId !== image.id || pixelReview.contentHash !== image.contentHash
            || pixelReview.parentIdentity !== parentIdentity || pixelReview.sourceEvidenceIdentity !== p.sourceEvidenceIdentity
            || pixelReview.provider !== 'chatgpt-web-science-review' || typeof pixelReview.model !== 'string' || !pixelReview.model.trim()
            || typeof pixelReview.summary !== 'string' || !pixelReview.summary.trim() || pixelReview.summary.length > 2000
            || (pixelReview.repairInstruction !== null && (pixelReview.decision !== 'blocked'
              || typeof pixelReview.repairInstruction !== 'string' || !pixelReview.repairInstruction.trim() || pixelReview.repairInstruction.length > 400))
            || ![pixelReview.promptHash, pixelReview.responseHash].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) {
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative pixel review set is incomplete or changed');
        }
        images.push({ image, task: imageTask!, sceneIndex: scene.sceneIndex, review: pixelReview });
    }
    images.sort((a, b) => a.sceneIndex - b.sceneIndex);
    const recoverableFailures = failures.filter(scene => scene.failureKind === 'review_failed' || scene.failureKind === 'not_submitted');
    if (technicalRecovery ? images.some(image => image.review.decision !== 'accepted') || !recoverableFailures.length
        : !images.some(image => image.review.decision === 'blocked' && image.review.repairInstruction === null)) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative pixel feedback does not require scientific replanning');
    }
    const sceneReviews = [...images.map(({ image, task: imageTask, sceneIndex, review: pixelReview }) => ({
        sceneIndex, imageId: image.id, taskId: imageTask.id, contentHash: image.contentHash,
        reviewHash: pixelReview.responseHash, decision: pixelReview.decision,
    })), ...failures].sort((a, b) => Number(a.sceneIndex) - Number(b.sceneIndex));
    if (sceneReviews.some((scene, index) => scene.sceneIndex !== index))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative terminal scenes are incomplete');
    return { parent, task: task!, payload, view, images, sceneReviews, recoverableFailures, parentIdentity,
        sourceEvidenceIdentity: p.sourceEvidenceIdentity as string,
        feedback: images.filter(image => !input.terminalSceneSet || image.review.decision === 'blocked')
            .map(image => `Scene ${image.sceneIndex + 1} — ${image.review.decision}: ${image.review.summary}`).join('\n\n'),
        identity: JSON.stringify({ parentIdentity, taskPayload: task!.payload,
            images: images.map(image => ({ imageId: image.image.id, contentHash: image.image.contentHash,
                imageProvenance: image.image.provenance, taskPayload: image.task.payload })),
            ...(failures.length ? { failures: [...failures].sort((a, b) => Number(a.sceneIndex) - Number(b.sceneIndex)) } : {}) }) };
}

/** Scientific replanning still requires an actual blocked scientific review. */
export async function readNarrativePixelReplanSource(prisma: Parameters<typeof readNarrativeTerminalSceneSource>[0],
    input: Parameters<typeof readNarrativeTerminalSceneSource>[1]) {
    const source = await readNarrativeTerminalSceneSource(prisma, input);
    const anchor = source.images.find(image => image.review.decision === 'blocked' && image.review.repairInstruction === null);
    if (!anchor) throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific replanning has no blocked scientific anchor');
    return { ...source, image: anchor.image, imageTask: anchor.task, reviewHash: anchor.review.responseHash as string };
}

/** Replace only proven recoverable failures; preserve accepted and submission-unknown siblings. */
export function readNarrativeTechnicalRecoverySource(prisma: Parameters<typeof readNarrativeTerminalSceneSource>[0],
    input: Parameters<typeof readNarrativeTerminalSceneSource>[1]) {
    if (!input.terminalSceneSet) throw new PresentationAssetError('VALIDATION_ERROR', 'Terminal scene proof is required');
    return readNarrativeTerminalSceneSource(prisma, input, true);
}

/** Read the accepted source plan without changing its prior review decision. */
export async function readNarrativeSourceSupportParent(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset'>,
    input: { actorId: string; runId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[]; parentAssetId: string }) {
    const parent = await prisma.presentationAsset.findUnique({ where: { id: input.parentAssetId }, include: { sourceClaims: { select: { claimId: true } } } });
    const task = await prisma.agentTask.findUnique({ where: { id: input.parentAssetId }, include: { session: true } });
    const ids = [...input.sourceClaimIds].sort(); const view = parent && presentationStoryboardView(parent, ids);
    const provenance = recordValue(parent?.provenance); const review = recordValue(provenance.illustrationReview);
    const result = recordValue(task?.result); const checkpoint = recordValue(result.storyboardCheckpoint);
    const planned = recordValue(checkpoint.planned);
    if (!parent || parent.deletedAt || parent.status !== 'approved' || parent.kind !== 'interactive_html'
        || parent.researchObjectId !== input.researchObjectId || parent.versionId !== input.versionId
        || !task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'succeeded' || task.error !== null
        || task.session.deletedAt || task.session.status !== 'active' || task.session.userId !== input.actorId
        || task.session.researchObjectId !== input.researchObjectId || !view?.document.narrative || view.output !== 'image'
        || view.document.scenes.length < 1 || view.document.scenes.length > 6 || result.assetId !== parent.id || result.contentHash !== parent.contentHash
        || provenance.source !== 'verified_claims' || provenance.taskId !== task.id
        || !isDeepStrictEqual(parent.sourceClaims.map(link => link.claimId).sort(), ids)
        || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== task.id || review.acceptance != null
        || review.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity
        || review.candidateHash !== createHash('sha256').update(JSON.stringify(view.document)).digest('hex')
        || ![review.promptHash, review.responseHash, provenance.sourceEvidenceIdentity, planned.promptHash]
          .every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
        || planned.reviewFormat !== 2 || !isDeepStrictEqual(checkpoint.payload, task.payload)
        || !isDeepStrictEqual(planned.document, view.document) || checkpoint.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity
        || typeof checkpoint.claimContent !== 'string' || typeof checkpoint.narrativeSourceIdentity !== 'string')
        throw new PresentationAssetError('VALIDATION_ERROR', 'Source-support recovery requires an unchanged accepted storyboard');
    const payload = parsePresentationGenerationPayload(task.payload);
    if (payload.kind !== 'interactive_html' || !payload.storyboard?.narrative || payload.storyboard.output !== 'image'
        || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId
        || !isDeepStrictEqual(payload.sourceClaimIds, ids)
        || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: input.runId, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE }))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Source-support parent scope changed');
    return { parent, task, payload, view, checkpoint,
        parentIdentity: JSON.stringify({ contentHash: parent.contentHash, provenance: parent.provenance, ids }),
        taskIdentity: JSON.stringify({ id: task.id, updatedAt: task.updatedAt, executionAttempt: task.executionAttempt,
            payload: task.payload, result: task.result, error: task.error }) };
}

/** Resolve a historical plan independently of the run's current step; revision contexts retain their original identity. */
export async function readNarrativePixelReplanHistory(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'hermesResearchRun' | 'auditLog'>,
    input: { runId: string; actorId: string; taskId: string }) {
    const run = await prisma.hermesResearchRun.findUnique({ where: { id: input.runId }, include: { steps: true } });
    if (!run || run.profile !== VISUAL_NARRATIVE_PROFILE || !Number.isSafeInteger(run.maxAgentTasks)) return null;
    const chain: Array<{ receipt: Prisma.AuditLogGetPayload<{}>; metadata: Record<string, unknown>;
      task: Prisma.AgentTaskGetPayload<{ include: { session: true } }>; payload: PresentationGenerationPayload }> = [];
    let taskId = input.taskId;
    for (;;) {
      if (chain.length > 2 || chain.some(item => item.task.id === taskId))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific revision exceeds two links');
      const receipts = await prisma.auditLog.findMany({ where: { action: 'hermes.research_run.generation_retry', targetType: 'hermes_research_run',
        targetId: run.id, metadata: { path: ['newTaskId'], equals: taskId } }, take: 2 });
      if (!receipts.length && !chain.length) return null;
      const receipt = receipts[0]; const metadata = recordValue(receipt?.metadata);
      if (!chain.length && receipts.length === 1 && ![NARRATIVE_PIXEL_REPLAN, NARRATIVE_PIXEL_PLAN_REVISION].includes(String(metadata.correction))) return null;
      const task = await prisma.agentTask.findUnique({ where: { id: taskId }, include: { session: true } });
      if (receipts.length !== 1 || !receipt || run.actorId !== input.actorId || receipt.actorId !== input.actorId || !run.versionId
        || ![NARRATIVE_PIXEL_REPLAN, NARRATIVE_PIXEL_PLAN_REVISION].includes(String(metadata.correction))
        || !Number.isSafeInteger(metadata.maxAgentTasks) || Number(metadata.maxAgentTasks) > run.maxAgentTasks!
        || !task || task.deletedAt || task.kind !== 'presentation.generate' || task.session.deletedAt
        || task.session.status !== 'active' || task.session.userId !== input.actorId || task.session.researchObjectId !== run.researchObjectId
        || !isDeepStrictEqual(task.payload, metadata.taskPayload))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific revision receipt changed');
      const payload = parsePresentationGenerationPayload(task.payload);
      if (payload.researchObjectId !== run.researchObjectId || payload.versionId !== run.versionId || payload.kind !== 'interactive_html'
        || !isDeepStrictEqual(payload.sourceClaimIds, [...run.sourceClaimIds].sort()) || !payload.storyboard?.narrative
        || payload.storyboard.output !== 'image' || payload.storyboard.baseAssetId || payload.storyboard.revisionMode
        || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: run.id, stage: 'storyboard', ordinal: 0, profile: run.profile }))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific revision task scope changed');
      chain.unshift({ receipt, metadata, task, payload });
      if (metadata.correction === NARRATIVE_PIXEL_REPLAN) break;
      if (typeof metadata.failedStoryboardTaskId !== 'string' || payload.storyboard.revisionTaskId !== metadata.failedStoryboardTaskId)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific revision predecessor is missing');
      taskId = metadata.failedStoryboardTaskId;
    }
    const root = chain[0]!; const meta = root.metadata;
    const payload = root.payload; const task = root.task;
    const sourceSupport = meta.cause === STORYBOARD_SOURCE_SUPPORT_INVALID;
    if (sourceSupport) {
      const parent = await readNarrativeSourceSupportParent(prisma, { actorId: input.actorId, runId: run.id,
        researchObjectId: run.researchObjectId, versionId: run.versionId!, sourceClaimIds: run.sourceClaimIds,
        parentAssetId: String(meta.parentStoryboardAssetId) });
      const proof = recordValue(meta.sourceProof);
      const { revisionTaskId: _task, revisionImageAssetId: _image, baseAssetId: _base, revisionMode: _mode, ...settings } = parent.payload.storyboard!;
      // The bounded history may append scientific plan revisions to this root.
      // Root proof and every revision link are still validated below.
      if (meta.sceneSet !== 'terminal' || meta.sceneReviews !== undefined || meta.anchorImageId !== undefined
        || !isDeepStrictEqual(payload.storyboard, { ...settings, narrativeSceneLimit: parent.view.document.scenes.length })
        || meta.parentIdentity !== parent.parentIdentity || proof.parentTaskIdentity !== parent.taskIdentity
        || !isDeepStrictEqual(JSON.parse(String(meta.sourceIdentity)), { parentIdentity: parent.parentIdentity, sourceProof: proof })
        || meta.sourceEvidenceIdentity !== parent.checkpoint.sourceEvidenceIdentity || meta.claimContent !== parent.checkpoint.claimContent
        || meta.narrativeSourceIdentity !== parent.checkpoint.narrativeSourceIdentity
        || !Array.isArray(proof.invalidBases) || !proof.invalidBases.length || proof.invalidBases.length > 24
        || proof.invalidBases.some(raw => { const invalid = recordValue(raw); const basis = recordValue(invalid.basis); const heading = recordValue(invalid.heading);
          const scene = parent.view.document.scenes[Number(invalid.sceneIndex)];
          const subject = scene?.illustration?.subjects[Number(invalid.subjectIndex)];
          const reference = parseDocumentSourceMapReference(heading.sourceMapRef); const locator = validateSourceLocator(heading.locator);
          return !Number.isInteger(invalid.sceneIndex) || !Number.isInteger(invalid.subjectIndex) || !subject
            || !isDeepStrictEqual(subject.basis, basis) || heading.evidenceId !== basis.evidenceId || heading.claimId !== basis.claimId
            || heading.kind !== 'heading' || heading.blockId !== locator.blockId || typeof heading.text !== 'string'
            || typeof basis.quote !== 'string' || !heading.text.includes(basis.quote)
            || reference.parserStatus !== 'succeeded' || reference.artifactId !== locator.artifactId || reference.contentHash !== locator.contentHash;
        })) throw new PresentationAssetError('VALIDATION_ERROR', 'Source-support recovery proof changed');
    } else if (meta.cause !== undefined) throw new PresentationAssetError('VALIDATION_ERROR', 'Unknown narrative recovery cause');
    if (!Number.isSafeInteger(meta.previousMaxAgentTasks) || Number(meta.previousMaxAgentTasks) < 9
        || !Number.isSafeInteger(meta.maxNewImages) || Number(meta.maxNewImages) < 1 || Number(meta.maxNewImages) > 6
        || meta.maxNewStoryboards !== 1 || meta.maxAgentTasks !== (meta.sceneSet === 'terminal'
            ? Math.max(Number(meta.previousMaxAgentTasks), Number(meta.existingTaskCount) + 1 + Number(meta.maxNewImages))
            : Number(meta.previousMaxAgentTasks) + 1 + Number(meta.maxNewImages))
        || meta.chargeableAttempts !== 1 + Number(meta.maxNewImages) || meta.newRunCount !== 0
        || meta.noProviderSwitch !== true || meta.publicationAuthorized !== false
        || !Number.isSafeInteger(meta.existingTaskCount) || Number(meta.existingTaskCount) < 1 || Number(meta.existingTaskCount) > Number(meta.previousMaxAgentTasks)
        || typeof meta.sourceIdentity !== 'string' || !meta.sourceIdentity || typeof meta.parentIdentity !== 'string' || !meta.parentIdentity
        || typeof meta.claimContent !== 'string' || typeof meta.narrativeSourceIdentity !== 'string'
        || typeof meta.sourceEvidenceIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sourceEvidenceIdentity)
        || task.idempotencyKey !== `hermes-run:${run.id}:storyboard:0:correction:${meta.parentStoryboardAssetId}`
        || (sourceSupport ? payload.storyboard!.revisionImageAssetId !== undefined : payload.storyboard!.revisionImageAssetId !== meta.anchorImageId)
        || payload.storyboard!.revisionTaskId
        || payload.storyboard!.narrativeSceneLimit !== meta.maxNewImages
        || (!sourceSupport && (!Array.isArray(meta.sceneReviews) || meta.sceneReviews.length !== meta.maxNewImages
        || meta.sceneReviews.some((item, index) => { const scene = recordValue(item);
          if (scene.sceneIndex !== index || typeof scene.taskId !== 'string') return true;
          if (scene.failureKind !== undefined) return meta.sceneSet !== 'terminal'
            || !['not_submitted', 'review_failed', 'submission_unknown'].includes(String(scene.failureKind))
            || scene.decision !== null || scene.reviewHash !== null || typeof scene.taskIdentity !== 'string' || !scene.taskIdentity
            || (scene.failureKind === 'submission_unknown'
              ? !['uncertain', 'submitted_without_result'].includes(String(scene.recoveryState)) || scene.planningAuditIdentity !== undefined
              : scene.recoveryState !== undefined)
            || (scene.failureKind === 'not_submitted' || scene.failureKind === 'submission_unknown'
              ? scene.imageId !== null || scene.contentHash !== null || scene.imageIdentity !== null || scene.reviewAuditIdentity !== null
              : scene.imageId !== scene.taskId || typeof scene.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(scene.contentHash)
                || typeof scene.imageIdentity !== 'string' || !scene.imageIdentity || typeof scene.reviewAuditIdentity !== 'string' || !scene.reviewAuditIdentity);
          return typeof scene.imageId !== 'string' || scene.taskId !== scene.imageId
            || ![scene.contentHash, scene.reviewHash].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
            || !['accepted', 'blocked'].includes(String(scene.decision)); })))
        || (meta.sceneSet !== undefined && meta.sceneSet !== 'terminal')
        || (meta.sceneSet === 'terminal' && (!Array.isArray(meta.sceneSteps) || meta.sceneSteps.length !== meta.maxNewImages
          || meta.sceneSteps.some((raw, index) => { const step = recordValue(raw); const scene = sourceSupport ? null : recordValue((meta.sceneReviews as unknown[])[index]);
            return step.ordinal !== index || typeof step.id !== 'string' || typeof step.agentTaskId !== 'string'
              || (scene ? step.agentTaskId !== scene.taskId || (step.presentationAssetId !== null && step.presentationAssetId !== scene.imageId)
                : step.presentationAssetId !== null && step.presentationAssetId !== step.agentTaskId)
              || !['failed', 'stopped', 'awaiting_approval', 'succeeded'].includes(String(step.status)); }))))
      throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative pixel-feedback root receipt is invalid');
    let baseIdentity: string | null = sourceSupport ? null : meta.sourceIdentity;
    for (let index = 1; index < chain.length; index++) {
      const previous = chain[index - 1]!; const current = chain[index]!; const value = current.metadata;
      const failed = readPixelBlockedCheckpoint(previous.task, previous.payload, baseIdentity, meta);
      const { revisionTaskId: _task, revisionImageAssetId: _image, baseAssetId: _base, revisionMode: _mode, ...settings } = previous.payload.storyboard!;
      if (value.previousReceiptId !== previous.receipt.id || value.rootReceiptId !== root.receipt.id
        || value.previousMaxAgentTasks !== previous.metadata.maxAgentTasks || value.maxAgentTasks !== Number(value.previousMaxAgentTasks) + 1
        || value.existingTaskCount !== Number(meta.existingTaskCount) + index
        || value.maxNewStoryboards !== 1 || value.maxNewImages !== 0 || value.inheritedRemainingImages !== meta.maxNewImages
        || value.chargeableAttempts !== 1 || value.newRunCount !== 0 || value.noProviderSwitch !== true || value.publicationAuthorized !== false
        || value.sourceEvidenceIdentity !== meta.sourceEvidenceIdentity || value.claimContent !== meta.claimContent
        || value.narrativeSourceIdentity !== meta.narrativeSourceIdentity || value.previousError !== previous.task.error
        || value.failedTaskIdentity !== failed.identity || value.candidateHash !== failed.review.candidateHash || value.reviewResponseHash !== failed.review.responseHash
        || current.task.idempotencyKey !== `hermes-run:${run.id}:storyboard:0:correction:${previous.task.id}`
        || !isDeepStrictEqual(current.payload, { ...previous.payload, storyboard: { ...settings, revisionTaskId: previous.task.id } }))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific revision receipt chain changed');
      baseIdentity = JSON.stringify({ revision: failed.identity, base: baseIdentity });
    }
    const current = chain.at(-1)!;
    return { run, task: current.task, payload: current.payload, receipt: current.receipt, currentMetadata: current.metadata,
      metadata: meta, rootReceipt: root.receipt, sceneReviews: sourceSupport ? (meta.sceneSteps as unknown[]).map(raw => {
        const step = recordValue(raw); return { sceneIndex: step.ordinal, taskId: step.agentTaskId, imageId: step.presentationAssetId } as Record<string, unknown>;
      }) : (meta.sceneReviews as unknown[]).map(recordValue),
      sceneLimit: Number(meta.maxNewImages), depth: chain.length - 1, baseIdentity };
}

function readPixelBlockedCheckpoint(task: Prisma.AgentTaskGetPayload<{ include: { session: true } }>, payload: PresentationGenerationPayload,
    baseIdentity: string | null, root: Record<string, unknown>) {
    const result = recordValue(task.result); const checkpoint = recordValue(result.storyboardCheckpoint);
    const planned = recordValue(checkpoint.planned); const review = recordValue(result.storyboardReview);
    const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const document = parseStoryboardDocument(planned.document, payload.sourceClaimIds, 'image');
    const acceptance = recordValue(result.storyboardAcceptanceCheckpoint);
    if (task.status !== 'failed' || task.error !== '[blocked] Illustration needs upstream scientific revision: ' + String(review.summary).slice(0, 300)
      || Object.keys(result).some(key => !['storyboardCheckpoint', 'storyboardReview', 'storyboardAcceptanceCheckpoint'].includes(key))
      || !isDeepStrictEqual(checkpoint.payload, task.payload) || checkpoint.baseIdentity !== baseIdentity
      || checkpoint.claimContent !== root.claimContent || checkpoint.narrativeSourceIdentity !== root.narrativeSourceIdentity
      || checkpoint.sourceEvidenceIdentity !== root.sourceEvidenceIdentity || planned.reviewFormat !== 2 || !hash(planned.promptHash)
      || !document.narrative || document.scenes.length < 1 || document.scenes.length > Number(root.maxNewImages)
      || (result.storyboardAcceptanceCheckpoint != null && (!isDeepStrictEqual(acceptance.document, document)
        || !isDeepStrictEqual(acceptance.review, review) || acceptance.submittedExecutionAttempt !== task.executionAttempt))
      || review.stage !== 'final-brief' || review.decision !== 'blocked' || review.requestId !== task.id
      || review.sourceEvidenceIdentity !== root.sourceEvidenceIdentity || review.acceptance != null
      || review.candidateHash !== createHash('sha256').update(JSON.stringify(document)).digest('hex')
      || !hash(review.promptHash) || !hash(review.responseHash) || typeof review.model !== 'string' || !review.model.trim()
      || typeof review.summary !== 'string' || !review.summary.trim() || review.summary.length > 6000
      || (review.provider !== 'chatgpt-web-science-review' && !(typeof review.provider === 'string' && /^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(review.provider)))
      || !Array.isArray(review.issues) || !review.issues.length || review.issues.length > 36)
      throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative revision needs its saved structured scientific rejection');
    return { checkpoint, review, document,
      identity: JSON.stringify({ id: task.id, updatedAt: task.updatedAt, executionAttempt: task.executionAttempt, payload: task.payload, result: task.result, error: task.error }) };
}

export function readNarrativePixelBlockedPlan(authority: NonNullable<Awaited<ReturnType<typeof readNarrativePixelReplanHistory>>>) {
    return readPixelBlockedCheckpoint(authority.task, authority.payload, authority.baseIdentity, authority.metadata);
}

/** Current authority follows the bounded receipt chain, retaining the root's original image allowance. */
export async function readNarrativePixelReplanAuthority(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'hermesResearchRun' | 'auditLog'>,
    input: { runId: string; actorId: string }) {
    const currentRun = await prisma.hermesResearchRun.findUnique({ where: { id: input.runId }, include: { steps: true } });
    const step = currentRun?.steps.find(item => item.stage === 'storyboard');
    if (!step?.agentTaskId) return null;
    const history = await readNarrativePixelReplanHistory(prisma, { ...input, taskId: step.agentTaskId });
    if (!history) return null;
    const { run, metadata: meta } = history;
    const followupRows = await prisma.auditLog.findMany({ where: { actorId: run.actorId,
      action: 'hermes.research_run.generation_retry', targetType: 'hermes_research_run', targetId: run.id,
      AND: [ { metadata: { path: ['correction'], equals: NARRATIVE_TECHNICAL_REVIEW_FOLLOWUP } },
        { metadata: { path: ['parentStoryboardAssetId'], equals: history.task.id } } ] }, take: 2 });
    if (followupRows.length > 1) throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup count changed');
    const followupMeta = followupRows.length ? recordValue(followupRows[0]!.metadata) : null;
    const firstTechnical = await readNarrativeTechnicalReceipt(prisma, history,
      followupMeta && Array.isArray(followupMeta.sceneSteps) ? followupMeta.sceneSteps : undefined);
    if (followupMeta && !firstTechnical) throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative first technical receipt is missing');
    const technicalRecovery = followupRows.length
      ? await readNarrativeTechnicalFollowupReceipt(prisma, history, firstTechnical!, followupRows[0]!) : firstTechnical;
    if (step.ordinal !== 0 || run.steps.filter(item => item.stage === 'storyboard').length !== 1
      || (technicalRecovery?.metadata.maxAgentTasks ?? history.currentMetadata.maxAgentTasks) !== run.maxAgentTasks)
      throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific replanning receipt is not current');
    const presentations = await prisma.agentTask.count({ where: { kind: 'presentation.generate',
        payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
    const sources = run.steps.filter(item => ['source_composition', 'source_review'].includes(item.stage)).length;
    const taskLimit = technicalRecovery ? Number(technicalRecovery.metadata.existingTaskCount) + Number(technicalRecovery.metadata.newTaskCount)
        : Number(meta.existingTaskCount) + history.depth + 1 + history.sceneLimit;
    if (sources + presentations < (technicalRecovery ? taskLimit : Number(meta.existingTaskCount) + history.depth + 1)
        || sources + presentations > taskLimit)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative scientific replanning allowance changed');
    return { ...history, step, technicalRecovery };
}

/** One explicit technical replacement per current plan; old failures and their provider reservations are immutable. */
async function readNarrativeTechnicalReceipt(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'auditLog'>,
    history: NonNullable<Awaited<ReturnType<typeof readNarrativePixelReplanHistory>>>, nextSceneSteps?: unknown[]) {
    const { run } = history;
    const receipts = await prisma.auditLog.findMany({ where: { actorId: run.actorId, action: 'hermes.research_run.generation_retry',
        targetType: 'hermes_research_run', targetId: run.id, AND: [
            { metadata: { path: ['correction'], equals: NARRATIVE_TECHNICAL_RECOVERY } },
            { metadata: { path: ['parentStoryboardAssetId'], equals: history.task.id } },
        ] }, take: 2 });
    if (!receipts.length) return null;
    const receipt = receipts[0]!; const metadata = recordValue(receipt.metadata);
    if (receipts.length !== 1 || metadata.previousReceiptId !== history.receipt.id || metadata.rootReceiptId !== history.rootReceipt.id
        || metadata.previousMaxAgentTasks !== history.currentMetadata.maxAgentTasks
        || metadata.sceneSet !== 'terminal' || !Array.isArray(metadata.sceneReviews) || !Array.isArray(metadata.replacements)
        || !Array.isArray(metadata.sceneSteps) || metadata.sceneSteps.length !== metadata.sceneReviews.length
        || metadata.newTaskCount !== metadata.replacements.length || Number(metadata.newTaskCount) < 1 || Number(metadata.newTaskCount) > history.sceneLimit
        || metadata.chargeableAttempts !== metadata.newTaskCount || metadata.newRunCount !== 0 || metadata.maxNewStoryboards !== 0
        || metadata.noProviderSwitch !== true || metadata.publicationAuthorized !== false
        || !Number.isSafeInteger(metadata.existingTaskCount)
        || Number(metadata.existingTaskCount) > Number(history.metadata.existingTaskCount) + history.depth + 1 + history.sceneLimit
        || Number(metadata.existingTaskCount) < Number(history.metadata.existingTaskCount) + history.depth + 1
        || metadata.maxAgentTasks !== Math.max(Number(metadata.previousMaxAgentTasks), Number(metadata.existingTaskCount) + Number(metadata.newTaskCount)))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement receipt is invalid');
    const sceneReviews = metadata.sceneReviews.map(recordValue);
    const preservedUnknown = sceneReviews.filter(scene => scene.failureKind === 'submission_unknown');
    if (sceneReviews.some(scene => typeof scene.taskId !== 'string')
        || metadata.priorSubmission !== (preservedUnknown.length ? 'preserved_unknown' : 'none')
        || preservedUnknown.some(scene => !['uncertain', 'submitted_without_result'].includes(String(scene.recoveryState))
            || scene.imageId !== null || scene.contentHash !== null || scene.reviewHash !== null || scene.decision !== null
            || scene.reviewAuditIdentity !== null || scene.imageIdentity !== null || typeof scene.taskIdentity !== 'string'))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement scene identity is invalid');
    const source = await readNarrativeTechnicalRecoverySource(prisma, { actorId: run.actorId, runId: run.id,
        researchObjectId: run.researchObjectId, versionId: run.versionId!, sourceClaimIds: run.sourceClaimIds,
        parentAssetId: history.task.id, imageAssetIds: sceneReviews.map(scene => scene.taskId as string), terminalSceneSet: { receiptId: receipt.id } });
    if (source.identity !== metadata.sourceIdentity || !isDeepStrictEqual(source.sceneReviews, metadata.sceneReviews)
        || metadata.sourceEvidenceIdentity !== history.metadata.sourceEvidenceIdentity)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement source changed');
    const replacements = metadata.replacements.map(recordValue);
    const recoverableFailures = source.recoverableFailures;
    if (replacements.length !== recoverableFailures.length || new Set(replacements.map(item => item.newTaskId)).size !== replacements.length
        || new Set(replacements.map(item => item.sceneIndex)).size !== replacements.length
        || metadata.maxNewImages !== recoverableFailures.filter(scene => scene.failureKind === 'not_submitted').length
        || metadata.reviewOnlyTaskCount !== recoverableFailures.filter(scene => scene.failureKind === 'review_failed').length)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement allowance changed');
    for (const [index, scene] of sceneReviews.entries()) {
        const oldStep = recordValue(metadata.sceneSteps[index]);
        const step = nextSceneSteps ? recordValue(nextSceneSteps[index]) : run.steps.find(item => item.stage === 'scene_image' && item.ordinal === index);
        const replacement = replacements.find(item => item.sceneIndex === index);
        if (scene.sceneIndex !== index || oldStep.ordinal !== index || oldStep.agentTaskId !== scene.taskId
            || !step || oldStep.id !== step.id || (oldStep.presentationAssetId !== null && oldStep.presentationAssetId !== scene.imageId)
            || !['failed', 'stopped', 'running', 'awaiting_approval', 'succeeded'].includes(String(oldStep.status)))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement step changed');
        if (scene.failureKind === undefined) {
            if (replacement || step.agentTaskId !== scene.taskId || (step.presentationAssetId !== null && step.presentationAssetId !== scene.imageId))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Accepted narrative image was replaced');
            continue;
        }
        if (scene.failureKind === 'submission_unknown') {
            // moveRun copies its terminal error to every non-succeeded step. That
            // can replace the old scene error without changing its task or asset.
            const terminalRunError = run.status === 'failed' && step.status === 'failed' && step.error === run.error;
            if (replacement || step.agentTaskId !== scene.taskId || step.presentationAssetId !== oldStep.presentationAssetId
                || step.status !== oldStep.status || (step.error !== oldStep.error && !terminalRunError))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Unknown narrative submission was changed or replaced');
            continue;
        }
        if (!replacement || typeof replacement.newTaskId !== 'string' || replacement.previousTaskId !== scene.taskId
            || step.agentTaskId !== replacement.newTaskId || (step.presentationAssetId !== null && step.presentationAssetId !== replacement.newTaskId)
            || replacement.mode !== (scene.failureKind === 'review_failed' ? 'review_only' : 'render'))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical task binding changed');
        const previous = await prisma.agentTask.findUniqueOrThrow({ where: { id: scene.taskId as string } });
        const next = await prisma.agentTask.findUnique({ where: { id: replacement.newTaskId }, include: { session: true } });
        if (!next || next.deletedAt || next.kind !== 'presentation.generate' || next.sessionId !== previous.sessionId
            || next.session.deletedAt || next.session.status !== 'active' || next.session.userId !== run.actorId
            || next.session.researchObjectId !== run.researchObjectId || !isDeepStrictEqual(next.payload, previous.payload)
            || next.idempotencyKey !== `hermes-run:${run.id}:generation-recovery:${metadata.requestDigest}:${index}`)
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative technical replacement task changed');
        if (replacement.mode === 'review_only') {
            const original = await prisma.presentationAsset.findUniqueOrThrow({ where: { id: previous.id } });
            const { imageReview: _originalReview, ...originalProvenance } = recordValue(original.provenance);
            const saved = await prisma.presentationAsset.findUnique({ where: { id: next.id }, include: { sourceClaims: true } });
            const { imageReview: _review, ...provenance } = recordValue(saved?.provenance);
            if (!saved || saved.deletedAt || saved.kind !== 'image' || !['draft', 'approved', 'rejected'].includes(saved.status)
                || saved.researchObjectId !== run.researchObjectId || saved.versionId !== run.versionId
                || saved.objectKey !== original.objectKey || saved.contentHash !== original.contentHash
                || !isDeepStrictEqual(saved.sourceClaims.map(link => link.claimId).sort(), run.sourceClaimIds)
                || !isDeepStrictEqual(provenance, { ...originalProvenance, taskId: next.id, reviewSourceAssetId: original.id }))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Saved narrative PNG replacement changed');
        }
    }
    return { receipt, metadata, replacements };
}

// Both receipt readers validate the full audit row, but the followup logic only
// needs the common identity, metadata and replacement projection.
type FirstTechnicalReceipt = {
    receipt: { id: string };
    metadata: Record<string, unknown>;
    replacements: Record<string, unknown>[];
};
type ReviewFollowupProof = {
    canRetryImageReviewBeforeSubmission?: (input: ImageReviewNotSubmittedInput) => Promise<boolean>;
    canRetryImageReviewAfterQuotaRefusal?: (input: ImageReviewNotSubmittedInput) => Promise<boolean>;
};

/** Inspect only failed first-stage review copies; the original PNG and unknown siblings stay immutable. */
export async function readNarrativeTechnicalReviewFollowupSource(
    prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'auditLog'>,
    history: NonNullable<Awaited<ReturnType<typeof readNarrativePixelReplanHistory>>>,
    first: FirstTechnicalReceipt, sceneSteps: unknown[], proof?: ReviewFollowupProof,
    recordedSceneReviews?: unknown[],
) {
    const { run } = history;
    const originalScenes = (first.metadata.sceneReviews as unknown[]).map(recordValue);
    const steps = sceneSteps.map(recordValue);
    if (steps.length !== originalScenes.length || steps.length < 1 || steps.length > history.sceneLimit
        || first.replacements.some(item => item.mode !== 'review_only'))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup scene set changed');
    const recorded = recordedSceneReviews?.map(recordValue);
    const sceneReviews: Record<string, unknown>[] = [];
    const recoverableFailures: Record<string, unknown>[] = [];
    for (const [index, oldScene] of originalScenes.entries()) {
        const step = steps[index]!;
        const replacement = first.replacements.find(item => item.sceneIndex === index);
        if (oldScene.sceneIndex !== index || step.ordinal !== index || typeof step.id !== 'string'
            || (step.presentationAssetId !== null && step.presentationAssetId !== step.agentTaskId))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup step changed');
        if (!replacement) {
            if (step.agentTaskId !== oldScene.taskId || step.presentationAssetId !== oldScene.imageId
                || !['submission_unknown', undefined].includes(oldScene.failureKind as string | undefined))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Preserved narrative scene changed');
            sceneReviews.push(oldScene);
            continue;
        }
        if (step.agentTaskId !== replacement.newTaskId || step.presentationAssetId !== replacement.newTaskId
            || step.status !== 'failed' || replacement.mode !== 'review_only')
            throw new PresentationAssetError('VALIDATION_ERROR', 'First review replacement changed');
        const task = await prisma.agentTask.findUnique({ where: { id: replacement.newTaskId as string }, include: { session: true } });
        const image = await prisma.presentationAsset.findUnique({ where: { id: replacement.newTaskId as string },
            include: { sourceClaims: { select: { claimId: true } } } });
        const provenance = recordValue(image?.provenance);
        if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'failed'
            || task.executionAttempt !== 1 || task.retryCount !== 0 || task.result !== null || !task.error
            || task.session.deletedAt || task.session.status !== 'active' || task.session.userId !== run.actorId
            || task.session.researchObjectId !== run.researchObjectId || step.error !== task.error
            || !image || image.deletedAt || image.status !== 'draft' || image.kind !== 'image'
            || image.researchObjectId !== run.researchObjectId || image.versionId !== run.versionId
            || !image.objectKey || !/^[a-f0-9]{64}$/.test(image.contentHash)
            || provenance.taskId !== task.id || provenance.reviewSourceAssetId !== replacement.previousTaskId
            || provenance.imageReview != null || provenance.contentType !== 'image/png'
            || !isDeepStrictEqual(image.sourceClaims.map(link => link.claimId).sort(), run.sourceClaimIds))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Failed review-only PNG changed');
        const calls = await prisma.auditLog.findMany({ where: { requestId: task.id, action: 'ai.gateway.call' },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 2 });
        const review = calls[0]; const meta = recordValue(review?.metadata);
        const writeConflict = task.error.replace(/\r\n/gu, '\n').trim()
            === 'Invalid `prisma.version.updateMany()` invocation:\n\n\nTransaction failed due to a write conflict or a deadlock. Please retry your transaction';
        const reviewFailed = task.error === 'scientific review provider failed' && calls.length === 1
            && review?.actorId === null && review.targetType === 'ai_gateway'
            && review.createdAt >= task.createdAt && review.createdAt <= task.updatedAt
            && meta.operation === 'scientific_review' && meta.provider === 'chatgpt-web-science-review'
            && meta.model === 'chatgpt-web/6-pro' && meta.outcome === 'failed'
            && meta.error === 'scientific_review_failed' && meta.retryCount === 0 && meta.fallbackReason === null
            && meta.selectionReason === 'high_risk_scientific_review'
            && meta.inputContentHash === first.metadata.sourceEvidenceIdentity
            && meta.pageCount === 1 && isDeepStrictEqual(meta.pageNumbers, [1])
            && typeof meta.promptHash === 'string' && /^[a-f0-9]{64}$/.test(meta.promptHash);
        if ((!writeConflict || calls.length !== 0) && !reviewFailed)
            throw new PresentationAssetError('VALIDATION_ERROR', 'Failed review has untrusted provider history');
        let reviewRecoveryState: string;
        if (recorded) {
            reviewRecoveryState = String(recorded[index]?.reviewRecoveryState);
            if (reviewRecoveryState !== (writeConflict ? 'before_provider_write_conflict' : reviewRecoveryState)
                || (!writeConflict && !['not_submitted', 'quota_exhausted'].includes(reviewRecoveryState)))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Review followup failure class changed');
        } else if (writeConflict) reviewRecoveryState = 'before_provider_write_conflict';
        else {
            const request = { requestId: task.id, promptHash: meta.promptHash as string,
                researchObjectId: run.researchObjectId, versionId: run.versionId!, candidateHash: image.contentHash,
                sourceEvidenceIdentity: first.metadata.sourceEvidenceIdentity as string };
            reviewRecoveryState = await proof?.canRetryImageReviewBeforeSubmission?.(request).catch(() => false)
                ? 'not_submitted' : await proof?.canRetryImageReviewAfterQuotaRefusal?.(request).catch(() => false)
                    ? 'quota_exhausted' : 'unsafe';
            if (reviewRecoveryState === 'unsafe') throw new PresentationAssetError('VALIDATION_ERROR', 'Review submission proof is unavailable');
        }
        const failure = { sceneIndex: index, taskId: task.id, imageId: image.id, contentHash: image.contentHash,
            reviewHash: null, decision: null, failureKind: 'review_failed', reviewRecoveryState,
            taskIdentity: JSON.stringify({ id: task.id, status: task.status, executionAttempt: task.executionAttempt,
                retryCount: task.retryCount, error: task.error, result: task.result, payload: task.payload, updatedAt: task.updatedAt }),
            reviewAuditIdentity: review ? JSON.stringify({ id: review.id, createdAt: review.createdAt, metadata: review.metadata }) : null,
            imageIdentity: JSON.stringify({ id: image.id, contentHash: image.contentHash, objectKey: image.objectKey,
                provenance: image.provenance, sourceClaimIds: run.sourceClaimIds }) };
        sceneReviews.push(failure); recoverableFailures.push(failure);
    }
    if (!recoverableFailures.length || (recorded && !isDeepStrictEqual(sceneReviews, recordedSceneReviews)))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup source changed');
    return { sceneReviews, recoverableFailures, sourceIdentity: JSON.stringify({ firstReceiptId: first.receipt.id,
        parentIdentity: first.metadata.parentIdentity, sourceEvidenceIdentity: first.metadata.sourceEvidenceIdentity,
        sceneReviews }) };
}

/** The second receipt is final: no third technical round may be created. */
async function readNarrativeTechnicalFollowupReceipt(
    prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'auditLog'>,
    history: NonNullable<Awaited<ReturnType<typeof readNarrativePixelReplanHistory>>>, first: FirstTechnicalReceipt,
    receipt: { id: string; actorId: string | null; metadata: Prisma.JsonValue },
) {
    const { run } = history; const metadata = recordValue(receipt.metadata);
    const rawSteps = metadata.sceneSteps; const rawScenes = metadata.sceneReviews; const rawReplacements = metadata.replacements;
    if (receipt.actorId !== run.actorId || metadata.correction !== NARRATIVE_TECHNICAL_REVIEW_FOLLOWUP
        || metadata.previousReceiptId !== first.receipt.id || metadata.rootReceiptId !== history.rootReceipt.id
        || metadata.previousMaxAgentTasks !== first.metadata.maxAgentTasks
        || metadata.sceneSet !== 'terminal' || metadata.parentStoryboardAssetId !== history.task.id
        || metadata.parentIdentity !== first.metadata.parentIdentity
        || metadata.sourceEvidenceIdentity !== first.metadata.sourceEvidenceIdentity
        || !Array.isArray(rawSteps) || !Array.isArray(rawScenes) || !Array.isArray(rawReplacements)
        || rawSteps.length !== rawScenes.length || rawReplacements.length < 1
        || rawReplacements.length > history.sceneLimit || metadata.newTaskCount !== rawReplacements.length
        || metadata.reviewOnlyTaskCount !== rawReplacements.length || metadata.maxNewImages !== 0
        || metadata.maxNewStoryboards !== 0 || metadata.newRunCount !== 0
        || metadata.chargeableAttempts !== rawReplacements.length || metadata.creditPolicy !== 'charged-on-submit'
        || metadata.noProviderSwitch !== true || metadata.publicationAuthorized !== false
        || !Number.isSafeInteger(metadata.existingTaskCount)
        || metadata.existingTaskCount !== Number(first.metadata.existingTaskCount) + Number(first.metadata.newTaskCount)
        || metadata.maxAgentTasks !== Math.max(Number(metadata.previousMaxAgentTasks),
            Number(metadata.existingTaskCount) + Number(metadata.newTaskCount)))
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup receipt is invalid');
    const source = await readNarrativeTechnicalReviewFollowupSource(prisma, history, first, rawSteps, undefined, rawScenes);
    const failures = source.recoverableFailures;
    const kinds = [...new Set([...source.sceneReviews.filter(scene => scene.failureKind === 'submission_unknown').map(() => 'preserved_unknown'),
        ...failures.filter(scene => scene.reviewRecoveryState === 'quota_exhausted').map(() => 'known_quota_refusal')])].sort();
    if (source.sourceIdentity !== metadata.sourceIdentity || !isDeepStrictEqual(metadata.priorSubmissionKinds, kinds)
        || rawReplacements.length !== failures.length
        || new Set(rawReplacements.map(raw => recordValue(raw).newTaskId)).size !== failures.length
        || new Set(rawReplacements.map(raw => recordValue(raw).sceneIndex)).size !== failures.length)
        throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup identity changed');
    for (const [index, raw] of rawScenes.entries()) {
        const scene = recordValue(raw); const before = recordValue(rawSteps[index]);
        const current = run.steps.find(step => step.stage === 'scene_image' && step.ordinal === index);
        const replacement = rawReplacements.map(recordValue).find(item => item.sceneIndex === index);
        if (!current || current.id !== before.id || before.ordinal !== index || before.agentTaskId !== scene.taskId)
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup step changed');
        if (!replacement) {
            const terminalRunError = scene.failureKind === 'submission_unknown'
                && run.status === 'failed' && current.status === 'failed' && current.error === run.error;
            if (current.agentTaskId !== before.agentTaskId || current.presentationAssetId !== before.presentationAssetId
                || current.status !== before.status || (current.error !== before.error && !terminalRunError))
                throw new PresentationAssetError('VALIDATION_ERROR', 'Preserved narrative scene was modified');
            continue;
        }
        if (scene.failureKind !== 'review_failed' || replacement.mode !== 'review_only'
            || replacement.previousTaskId !== scene.taskId || current.agentTaskId !== replacement.newTaskId
            || current.presentationAssetId !== replacement.newTaskId || typeof replacement.newTaskId !== 'string')
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative review followup binding changed');
        const previous = await prisma.agentTask.findUniqueOrThrow({ where: { id: scene.taskId as string } });
        const next = await prisma.agentTask.findUnique({ where: { id: replacement.newTaskId }, include: { session: true } });
        const oldImage = await prisma.presentationAsset.findUniqueOrThrow({ where: { id: previous.id } });
        const nextImage = await prisma.presentationAsset.findUnique({ where: { id: replacement.newTaskId }, include: { sourceClaims: true } });
        const { imageReview: _oldReview, ...prior } = recordValue(oldImage.provenance);
        const { imageReview: _newReview, ...copied } = recordValue(nextImage?.provenance);
        if (!next || next.deletedAt || next.kind !== 'presentation.generate' || next.sessionId !== previous.sessionId
            || next.session.deletedAt || next.session.status !== 'active' || next.session.userId !== run.actorId
            || next.session.researchObjectId !== run.researchObjectId || !isDeepStrictEqual(next.payload, previous.payload)
            || next.idempotencyKey !== `hermes-run:${run.id}:generation-recovery:${metadata.requestDigest}:${index}`
            || !nextImage || nextImage.deletedAt || nextImage.kind !== 'image'
            || !['draft', 'approved', 'rejected'].includes(nextImage.status)
            || nextImage.researchObjectId !== run.researchObjectId || nextImage.versionId !== run.versionId
            || nextImage.objectKey !== oldImage.objectKey || nextImage.contentHash !== oldImage.contentHash
            || !isDeepStrictEqual(nextImage.sourceClaims.map(link => link.claimId).sort(), run.sourceClaimIds)
            || !isDeepStrictEqual(copied, { ...prior, taskId: next.id, reviewSourceAssetId: oldImage.id }))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Saved review followup PNG changed');
    }
    return { receipt, metadata, replacements: rawReplacements.map(recordValue) };
}

/** Add a draft reference to the exact PNG inside the caller's existing Serializable retry transaction. */
export async function copyNarrativeImageForReview(tx: Prisma.TransactionClient, input: PresentationScope & { previousTaskId: string; taskId: string }) {
    await lockTrashReferences(tx);
    await lockLiveResearchObject(tx, input.researchObjectId);
    await requirePresentationWriteScope(tx, input);
    const touched = await tx.version.updateMany({ where: { id: input.versionId, status: 'draft' }, data: { status: 'draft' } });
    if (touched.count !== 1) throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Saved image draft changed');
    const original = await tx.presentationAsset.findUniqueOrThrow({ where: { id: input.previousTaskId }, include: { sourceClaims: true } });
    const provenance = recordValue(original.provenance);
    if (original.deletedAt || original.status !== 'draft' || original.kind !== 'image' || provenance.imageReview != null
        || original.researchObjectId !== input.researchObjectId || original.versionId !== input.versionId || provenance.contentType !== 'image/png')
        throw new PresentationAssetError('VALIDATION_ERROR', 'Original review PNG changed');
    await tx.trashObjectCleanup.updateMany({ where: { objectKey: original.objectKey }, data: { state: 'retained', lastError: null } });
    await tx.presentationAsset.create({ data: { id: input.taskId, researchObjectId: original.researchObjectId, versionId: original.versionId,
        kind: original.kind, status: 'draft', objectKey: original.objectKey, contentHash: original.contentHash,
        generator: original.generator, generatorVersion: original.generatorVersion, promptHash: original.promptHash, label: original.label,
        provenance: { ...provenance, taskId: input.taskId, reviewSourceAssetId: original.id } as Prisma.InputJsonObject } });
    await tx.presentationAssetClaim.createMany({ data: original.sourceClaims.map(link => ({ presentationAssetId: input.taskId,
        claimId: link.claimId, researchObjectId: original.researchObjectId, versionId: original.versionId })) });
    await refreshWorkingResearchRecord(tx, input);
}

/** The worker consumes image feedback only under the explicit same-run correction grant. */
export async function requireStoryboardImageRevision(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'hermesResearchRun' | 'auditLog'>,
    payload: PresentationGenerationPayload, actorId: string, historicalTaskId?: string) {
    return readStoryboardImageRevision(prisma, payload, actorId, 'generating_storyboard', historicalTaskId);
}

/** Read the same source proof for a stopped run; the caller must validate its failed planning task. */
export async function readStoppedStoryboardImageRevision(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'hermesResearchRun' | 'auditLog'>,
    payload: PresentationGenerationPayload, actorId: string) {
    return readStoryboardImageRevision(prisma, payload, actorId, 'stopped');
}

async function readStoryboardImageRevision(prisma: Pick<Prisma.TransactionClient, 'agentTask' | 'presentationAsset' | 'hermesResearchRun' | 'auditLog'>,
    payload: PresentationGenerationPayload, actorId: string, expectedStatus: 'generating_storyboard' | 'stopped', historicalTaskId?: string) {
    const imageAssetId = payload.storyboard?.revisionImageAssetId;
    if (!imageAssetId) return undefined;
    const runId = payload.hermesRunAuthority?.runId;
    const run = runId ? await prisma.hermesResearchRun.findUnique({ where: { id: runId }, include: { steps: true } }) : null;
    const pixel = run ? historicalTaskId
      ? await readNarrativePixelReplanHistory(prisma, { runId: run.id, actorId, taskId: historicalTaskId })
      : await readNarrativePixelReplanAuthority(prisma, { runId: run.id, actorId }) : null;
    if (pixel) {
        if ((!historicalTaskId && run!.status !== expectedStatus) || !isDeepStrictEqual(pixel.payload, payload))
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative pixel-feedback recovery is not current');
        const source = await readNarrativePixelReplanSource(prisma, { actorId, runId: run!.id,
            researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds,
            parentAssetId: String(pixel.metadata.parentStoryboardAssetId), imageAssetIds: pixel.sceneReviews.map(scene => String(scene.taskId)),
            ...(pixel.metadata.sceneSet === 'terminal' ? { terminalSceneSet: { receiptId: pixel.rootReceipt.id } } : {}) });
        if (source.image.id !== imageAssetId || pixel.metadata.sourceIdentity !== source.identity
            || pixel.metadata.parentIdentity !== source.parentIdentity || pixel.metadata.sourceEvidenceIdentity !== source.sourceEvidenceIdentity
            || !isDeepStrictEqual(pixel.metadata.sceneReviews, source.sceneReviews)
            || payload.storyboard!.locale !== source.payload.storyboard!.locale
            || canonicalStoryboardStyle(payload.storyboard!.style) !== canonicalStoryboardStyle(source.payload.storyboard!.style)
            || payload.storyboard!.instruction !== source.payload.storyboard!.instruction) {
            throw new PresentationAssetError('VALIDATION_ERROR', 'Narrative pixel-feedback sources changed');
        }
        return { ...source, pixelRecovery: { receiptId: pixel.receipt.id,
            claimContent: pixel.metadata.claimContent, narrativeSourceIdentity: pixel.metadata.narrativeSourceIdentity } };
    }
    if (!run || run.actorId !== actorId || run.researchObjectId !== payload.researchObjectId || run.versionId !== payload.versionId
        || run.profile !== VISUAL_NARRATIVE_PROFILE || ![11, 13].includes(run.maxAgentTasks ?? 0)
        || run.status !== expectedStatus
        || !isDeepStrictEqual([...run.sourceClaimIds].sort(), payload.sourceClaimIds)) throw new PresentationAssetError('VALIDATION_ERROR', 'Scientific replanning grant unavailable');
    const receipts = await prisma.auditLog.findMany({ where: { action: 'hermes.research_run.generation_grant', targetType: 'hermes_research_run',
        targetId: run.id, actorId, metadata: { path: ['rejectedImageAssetId'], equals: imageAssetId } }, take: 2 });
    const receipt = recordValue(receipts[0]?.metadata);
    const acceptedParent = receipt.previousMaxAgentTasks === 11 && receipt.maxAgentTasks === 13
        && receipt.correction === 'narrative_accepted_image_scientific_replan' && run.maxAgentTasks === 13;
    const legacy = receipt.previousMaxAgentTasks === 9 && receipt.maxAgentTasks === 11
        && receipt.correction === 'narrative_image_scientific_replan';
    if (receipts.length !== 1 || (!legacy && !acceptedParent)) throw new PresentationAssetError('VALIDATION_ERROR', 'Scientific replanning receipt unavailable');
    const source = await readNarrativeImageReplanSource(prisma, { actorId, runId: run.id, researchObjectId: payload.researchObjectId,
        versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds, imageAssetId, acceptedParent });
    if (receipt.newRunCount !== 0
        || receipt.parentStoryboardAssetId !== source.parent.id || receipt.rejectedImageAssetId !== imageAssetId
        || receipt.sourceIdentity !== source.identity || receipt.reviewHash !== source.reviewHash
        || payload.storyboard?.narrativeSceneLimit !== 1 || payload.storyboard.locale !== source.payload.storyboard!.locale
        || canonicalStoryboardStyle(payload.storyboard.style) !== canonicalStoryboardStyle(source.payload.storyboard!.style)
        || payload.storyboard.instruction !== source.payload.storyboard!.instruction) throw new PresentationAssetError('VALIDATION_ERROR', 'Scientific replanning receipt changed');
    return source;
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
