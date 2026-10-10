import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import type { AgentTask, PresentationAsset, Prisma } from '@prisma/client';
import { PresentationAssetError } from './errors';
import { presentationSceneImageView, requireAcceptedSceneImageReview, sceneImageReviewTaskResult } from './scene-image';
import { parseStoryboardRequest, presentationStoryboardView, type StoryboardDocument, type StoryboardRequest } from './storyboard';
import { requireAnimationSourceSupport } from './animation';
import { readNativeImageReviewCheckpoint } from './native-image-review';
import { nativeAgentTerminalResult, readNativeAgentExecution, requireNativeIllustrationTerminalSource } from '../agent/native-agent-execution';
import { parsePresentationGenerationPayload } from './presentation-asset';
import { AgentError } from '../agent/errors';

export const ONCHIP_FIELD_SAMPLING_PROFILE = 'onchip-field-sampling-v1' as const;
export const CONTENT_DRIVEN_PROFILE = 'content-driven-v1' as const;
export const CONTENT_DRIVEN_IMAGE_PROFILE = 'content-driven-image-v1' as const;
export const VISUAL_NARRATIVE_PROFILE = 'visual-narrative-v1' as const;
export const ONCHIP_SOURCE_CONTENT_HASH = 'd57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a';
export const ONCHIP_SCENE_ROLES = [
  'driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction',
] as const;

export type VideoGenerationRequest = {
  purpose?: never;
  storyboardAssetId: string;
  sceneImageAssetIds: [string, string, string, string, string];
  profile: typeof ONCHIP_FIELD_SAMPLING_PROFILE;
  sceneRoles: typeof ONCHIP_SCENE_ROLES;
} | {
  purpose?: never;
  storyboardAssetId: string;
  sceneImageAssetIds: string[];
  profile: typeof CONTENT_DRIVEN_PROFILE;
} | {
  purpose: 'audio-audition';
  storyboardAssetId: string;
  sceneImageAssetIds: string[];
  profile: typeof CONTENT_DRIVEN_PROFILE;
  sceneIndex: number;
  audio: { provider: 'synclip'; voice: string; speed: number };
  locale: 'zh' | 'en';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVideoGenerationRequest(value: unknown): VideoGenerationRequest {
  const input = value as Record<string, unknown> | null;
  if (input?.profile === CONTENT_DRIVEN_PROFILE) {
    const audition = Object.hasOwn(input, 'purpose');
    if (Array.isArray(input) || Object.keys(input).sort().join(',') !== (audition
      ? 'audio,locale,profile,purpose,sceneImageAssetIds,sceneIndex,storyboardAssetId' : 'profile,sceneImageAssetIds,storyboardAssetId')
      || typeof input.storyboardAssetId !== 'string' || !UUID.test(input.storyboardAssetId)
      || !Array.isArray(input.sceneImageAssetIds) || input.sceneImageAssetIds.length < 3 || input.sceneImageAssetIds.length > 6
      || input.sceneImageAssetIds.some(id => typeof id !== 'string' || !UUID.test(id))
      || new Set(input.sceneImageAssetIds).size !== input.sceneImageAssetIds.length) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Content-driven video request is invalid');
    }
    if (audition) {
      const audio = input.audio as Record<string, unknown> | null;
      if (input.purpose !== 'audio-audition' || !Number.isSafeInteger(input.sceneIndex) || Number(input.sceneIndex) < 0
        || Number(input.sceneIndex) >= input.sceneImageAssetIds.length || !['zh', 'en'].includes(String(input.locale))
        || !audio || typeof audio !== 'object' || Array.isArray(audio) || Object.keys(audio).sort().join(',') !== 'provider,speed,voice'
        || audio.provider !== 'synclip' || typeof audio.voice !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(audio.voice)
        || typeof audio.speed !== 'number' || !Number.isFinite(audio.speed) || audio.speed <= 0) {
        throw new PresentationAssetError('VALIDATION_ERROR', 'Source-bound audio audition request is invalid');
      }
      return { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: input.storyboardAssetId,
        sceneImageAssetIds: input.sceneImageAssetIds as string[], purpose: 'audio-audition', sceneIndex: Number(input.sceneIndex),
        audio: { provider: 'synclip', voice: audio.voice, speed: audio.speed }, locale: input.locale as 'zh' | 'en' };
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
    const parsed = parseVideoGenerationRequest(provenance.video);
    return parsed.purpose === 'audio-audition' ? undefined : parsed;
  } catch { return undefined; }
}

export function hasVideoProvenance(asset: { kind: string; provenance: unknown }): boolean {
  const provenance = asset.provenance as Record<string, unknown> | null;
  return asset.kind === 'video' && provenance?.subtype === 'approved_storyboard_video';
}

type NativeVideoParentReaders = Pick<Prisma.TransactionClient, 'agentTask' | 'agentSession' | 'researchObject' | 'version' | 'ingestionTask'>;
type VideoParentDb = Pick<Prisma.TransactionClient, 'presentationAsset' | 'evidenceRecord' | 'claimNode'> & Partial<NativeVideoParentReaders>;
type VideoParentScope = { researchObjectId: string; versionId: string; sourceClaimIds: string[] };
type NativeVideoStoryboardAsset = Pick<PresentationAsset, 'id' | 'kind' | 'status' | 'deletedAt' | 'researchObjectId' | 'versionId' | 'contentHash' | 'provenance'>
  & { sourceClaims: Array<{ claimId: string }> };
type NativeVideoRenderResources = Array<{ id: string; version?: string; upstreamCommit?: string; resources: string[] }>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function parseNativeVideoRenderResources(value: unknown): NativeVideoRenderResources {
  const invalid = () => new PresentationAssetError('VALIDATION_ERROR', 'Native video render resources are invalid');
  const nonempty = (input: unknown): input is string => typeof input === 'string' && Boolean(input.trim());
  if (!Array.isArray(value)) throw invalid();
  return value.map(raw => {
    const row = record(raw);
    if (Object.keys(row).some(key => !['id', 'version', 'upstreamCommit', 'resources'].includes(key))
      || !nonempty(row.id) || !Array.isArray(row.resources) || row.resources.some(resource => !nonempty(resource))
      || ('version' in row && !nonempty(row.version)) || ('upstreamCommit' in row && !nonempty(row.upstreamCommit))) throw invalid();
    return { id: row.id, ...('version' in row ? { version: row.version as string } : {}),
      ...('upstreamCommit' in row ? { upstreamCommit: row.upstreamCommit as string } : {}), resources: [...row.resources] as string[] };
  });
}

function requireNativeVideoReaders(prisma: VideoParentDb): asserts prisma is VideoParentDb & NativeVideoParentReaders {
  if (typeof prisma.presentationAsset?.findUnique !== 'function' || typeof prisma.claimNode?.findMany !== 'function'
    || typeof prisma.evidenceRecord?.findMany !== 'function' || typeof prisma.agentTask?.findUnique !== 'function'
    || typeof prisma.agentSession?.findUnique !== 'function' || typeof prisma.researchObject?.findUnique !== 'function'
    || typeof prisma.version?.findFirst !== 'function' || typeof prisma.ingestionTask?.findUnique !== 'function') {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video source readers are unavailable');
  }
}
function nativeVideoProofFailure(error: unknown): never {
  if (error instanceof AgentError && error.code === 'ILLEGAL_TRANSITION') {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard task or scientific source is no longer valid');
  }
  throw error;
}

/** Completed private native plans are technically consumable; their status remains unchanged. */
export async function requireNativeVideoStoryboard(prisma: VideoParentDb, asset: NativeVideoStoryboardAsset, payload: VideoParentScope): Promise<{
  task: AgentTask; settings: StoryboardRequest; prompts: Array<{ sceneIndex: number; prompt: string; videoPrompt: string; renderResources?: NativeVideoRenderResources }>; sourceEvidenceIdentity: string;
}> {
  requireNativeVideoReaders(prisma);
  const provenance = record(asset.provenance), ids = asset.sourceClaims.map(source => source.claimId).sort();
  const settings = parseStoryboardRequest(provenance.storyboardSettings);
  const view = presentationStoryboardView(asset, ids);
  if (asset.deletedAt || !['draft', 'approved'].includes(asset.status) || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId
    || !view || settings.output !== 'video' || settings.narrative !== true || provenance.source !== 'verified_claims' || provenance.taskId !== asset.id
    || !isDeepStrictEqual(ids, [...payload.sourceClaimIds].sort())) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video requires its completed source-bound storyboard task');
  }
  const task = await prisma.agentTask.findUnique({ where: { id: asset.id }, include: { session: true } });
  if (!task || task.id !== asset.id || task.deletedAt || task.status !== 'succeeded' || task.kind !== 'presentation.generate' || task.error !== null
    || task.session.deletedAt || task.session.researchObjectId !== payload.researchObjectId) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard owner is not completed');
  }
  const parentPayload = parsePresentationGenerationPayload(task.payload);
  const result = record(task.result), review = record(result.storyboardReview), context = record(result.nativeIllustrationContext);
  const checkpoint = record(result.storyboardCheckpoint), planned = record(checkpoint.planned), native = record(result.nativeIllustration);
  let execution: ReturnType<typeof readNativeAgentExecution>;
  try { execution = readNativeAgentExecution(task.result); } catch (error) { nativeVideoProofFailure(error); }
  const cp = execution?.checkpoint;
  if (parentPayload.kind !== 'interactive_html' || parentPayload.researchObjectId !== payload.researchObjectId || parentPayload.versionId !== payload.versionId
    || !isDeepStrictEqual(parentPayload.sourceClaimIds, ids) || !isDeepStrictEqual(parentPayload.storyboard, settings)
    || execution?.profile !== 'paper-illustration' || cp?.state !== 'completed' || cp.taskId !== task.id || cp.finishReason !== 'stop' || cp.hasToolCalls
    || result.assetId !== asset.id || result.contentHash !== asset.contentHash
    || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== task.id
    || review.candidateHash !== createHash('sha256').update(JSON.stringify(view.document)).digest('hex')
    || typeof provenance.sourceEvidenceIdentity !== 'string' || review.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity
    || !isDeepStrictEqual(review, provenance.illustrationReview) || !isDeepStrictEqual(checkpoint.payload, parentPayload)
    || !isDeepStrictEqual(planned.document, view.document) || planned.reviewFormat !== 2 || planned.promptHash !== review.promptHash
    || !Array.isArray(planned.designSkills) || !isDeepStrictEqual(planned.designSkills, provenance.designSkills)
    || checkpoint.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity || context.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity
    || checkpoint.claimContent !== context.claimContent || checkpoint.narrativeSourceIdentity !== context.narrativeSourceIdentity
    || !isDeepStrictEqual(checkpoint.baseIdentity, context.baseIdentity)
    || native.runtimeId !== execution.runtimeId || native.skillCatalogueId !== execution.skillCatalogueId
    || typeof native.planToolCallId !== 'string' || !native.planToolCallId.trim() || typeof native.reviewToolCallId !== 'string' || !native.reviewToolCallId.trim()
    || !Array.isArray(result.illustrationPrompts) || result.illustrationPrompts.length !== view.document.scenes.length) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard completion does not match its saved plan and review');
  }
  const prompts = result.illustrationPrompts.map((value, sceneIndex) => {
    const prompt = record(value);
    if (prompt.sceneIndex !== sceneIndex || typeof prompt.prompt !== 'string' || !prompt.prompt.trim()
      || typeof prompt.videoPrompt !== 'string' || !prompt.videoPrompt.trim()) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard prompts are incomplete or out of order');
    }
    return { sceneIndex, prompt: prompt.prompt, videoPrompt: prompt.videoPrompt,
      ...(Object.hasOwn(prompt, 'renderResources') ? { renderResources: parseNativeVideoRenderResources(prompt.renderResources) } : {}) };
  });
  try {
    nativeAgentTerminalResult(task, 'succeeded', task.result);
    // Only this branch requires the additional source readers; the legacy caller contract stays minimal.
    await requireNativeIllustrationTerminalSource(prisma as Prisma.TransactionClient, task);
  } catch (error) { nativeVideoProofFailure(error); }
  return { task, settings, prompts, sourceEvidenceIdentity: provenance.sourceEvidenceIdentity };
}

type NativeVideoStoryboardProof = Awaited<ReturnType<typeof requireNativeVideoStoryboard>>;
type NativeVideoBaseParent = { asset: NativeVideoStoryboardAsset; document: StoryboardDocument; proof: NativeVideoStoryboardProof; identity: string };
const nativeStoryboardIdentity = (asset: NativeVideoStoryboardAsset) => JSON.stringify({
  contentHash: asset.contentHash, provenance: asset.provenance, ids: asset.sourceClaims.map(source => source.claimId).sort(),
});
const nativeDesignSkills = (proof: NativeVideoStoryboardProof) => record(record(record(proof.task.result).storyboardCheckpoint).planned).designSkills;

async function readNativeVideoBaseParents(prisma: VideoParentDb, asset: NativeVideoStoryboardAsset, proof: NativeVideoStoryboardProof, scope: VideoParentScope) {
  const ids = asset.sourceClaims.map(source => source.claimId).sort(), view = presentationStoryboardView(asset, ids);
  const provenance = record(asset.provenance), result = record(proof.task.result);
  const planned = record(record(result.storyboardCheckpoint).planned);
  if (!view || asset.deletedAt || !['draft', 'approved'].includes(asset.status) || asset.researchObjectId !== scope.researchObjectId || asset.versionId !== scope.versionId
    || !isDeepStrictEqual(ids, [...scope.sourceClaimIds].sort()) || proof.task.id !== asset.id || proof.task.deletedAt || proof.task.status !== 'succeeded'
    || proof.task.kind !== 'presentation.generate' || proof.task.error !== null || provenance.source !== 'verified_claims' || provenance.taskId !== asset.id
    || result.assetId !== asset.id || result.contentHash !== asset.contentHash || !isDeepStrictEqual(planned.document, view.document)
    || !isDeepStrictEqual(result.storyboardReview, provenance.illustrationReview) || !isDeepStrictEqual(planned.designSkills, provenance.designSkills)
    || proof.settings.output !== 'video' || proof.settings.narrative !== true || !isDeepStrictEqual(proof.settings, parseStoryboardRequest(provenance.storyboardSettings))
    || proof.sourceEvidenceIdentity !== provenance.sourceEvidenceIdentity) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame requires the current checked storyboard proof');
  }
  const parents: NativeVideoBaseParent[] = [{ asset, document: view.document, proof, identity: nativeStoryboardIdentity(asset) }];
  const seen = new Set([asset.id]);
  for (let current = parents[0]!; current.proof.settings.baseAssetId; current = parents.at(-1)!) {
    const baseId = current.proof.settings.baseAssetId;
    // The existing base reader checks one edge; bound malformed or excessive revision ancestry here.
    if (seen.has(baseId) || parents.length >= 32) throw new PresentationAssetError('VALIDATION_ERROR', 'Native video base chain is cyclic or exceeds 32 parents');
    seen.add(baseId);
    const base = await prisma.presentationAsset.findUnique({ where: { id: baseId }, include: { sourceClaims: { select: { claimId: true } } } });
    if (!base) throw new PresentationAssetError('VALIDATION_ERROR', 'Native video base chain has a missing parent');
    const baseProof = await requireNativeVideoStoryboard(prisma, base, scope);
    const baseView = presentationStoryboardView(base, ids)!;
    parents.push({ asset: base, document: baseView.document, proof: baseProof, identity: nativeStoryboardIdentity(base) });
  }
  return parents;
}

/** Qualify one exact-index candidate, retaining its actual parent and original native pixel owner. */
export async function requireNativeVideoSceneImage(prisma: VideoParentDb, asset: NativeVideoStoryboardAsset,
  currentStoryboard: NativeVideoStoryboardAsset, currentNativeProof: NativeVideoStoryboardProof, scope: VideoParentScope, sceneIndex: number): Promise<{
    storyboardAssetId: string; identity: string; sourceEvidenceIdentity: string; nativeParent: NativeVideoStoryboardProof;
  }> {
  requireNativeVideoReaders(prisma);
  const scene = presentationSceneImageView(asset), provenance = record(asset.provenance);
  if (asset.deletedAt || asset.kind !== 'image' || !['draft', 'approved'].includes(asset.status)
    || asset.researchObjectId !== scope.researchObjectId || asset.versionId !== scope.versionId
    || !Number.isInteger(sceneIndex) || !scene || scene.sceneIndex !== sceneIndex
    || !isDeepStrictEqual(asset.sourceClaims.map(source => source.claimId).sort(), [...scope.sourceClaimIds].sort())
    || provenance.source !== 'approved_storyboard_scene' || provenance.taskId !== asset.id) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame requires its exact scene, sources and actual owning task');
  }
  const parents = await readNativeVideoBaseParents(prisma, currentStoryboard, currentNativeProof, scope);
  const originalIndex = parents.findIndex(parent => parent.asset.id === scene.storyboardAssetId);
  if (originalIndex < 0 || !parents[0]!.document.scenes[sceneIndex]) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame parent is outside the explicit base chain');
  }
  for (let index = 0; index < originalIndex; index++) {
    const current = parents[index]!, base = parents[index + 1]!;
    const currentPrompt = current.proof.prompts[sceneIndex], basePrompt = base.proof.prompts[sceneIndex];
    const renderResourcesMatch = currentPrompt?.renderResources !== undefined && basePrompt?.renderResources !== undefined
      ? isDeepStrictEqual(currentPrompt.renderResources, basePrompt.renderResources)
      : isDeepStrictEqual(nativeDesignSkills(current.proof), nativeDesignSkills(base.proof));
    if (current.document.scenes.length !== base.document.scenes.length || !isDeepStrictEqual(current.document.scenes[sceneIndex], base.document.scenes[sceneIndex])
      || !isDeepStrictEqual(current.document.narrative, base.document.narrative) || !isDeepStrictEqual(current.document.videoProduction, base.document.videoProduction)
      || current.proof.settings.locale !== base.proof.settings.locale || current.proof.settings.style !== base.proof.settings.style
      || !isDeepStrictEqual(current.proof.settings.figurePlan, base.proof.settings.figurePlan)
      || current.proof.sourceEvidenceIdentity !== base.proof.sourceEvidenceIdentity
      || !currentPrompt || !basePrompt || currentPrompt.prompt !== basePrompt.prompt || currentPrompt.videoPrompt !== basePrompt.videoPrompt
      || !renderResourcesMatch) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame reuse changed scene, continuity, prompts or render resources');
    }
  }
  const original = parents[originalIndex]!;
  if (provenance.parentIdentity !== original.identity) throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame does not match its actual original parent');
  const result = await sceneImageReviewTaskResult(prisma, asset.id);
  if (readNativeImageReviewCheckpoint(result)?.state !== 'completed') {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame requires its completed native pixel review');
  }
  requireAcceptedSceneImageReview(asset, { identity: original.identity, sourceEvidenceIdentity: original.proof.sourceEvidenceIdentity }, result);
  return { storyboardAssetId: original.asset.id, identity: original.identity, sourceEvidenceIdentity: original.proof.sourceEvidenceIdentity, nativeParent: original.proof };
}

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
  const nativeNarrativeVideo = storyboardView?.output === 'video' && storyboardView.narrative === true;
  const storyboardIdentity = storyboard && JSON.stringify({
    contentHash: storyboard.contentHash, provenance: storyboard.provenance, ids: claimIds,
  });
  if (!storyboard || storyboard.deletedAt || storyboard.researchObjectId !== payload.researchObjectId
    || storyboard.versionId !== payload.versionId || (nativeNarrativeVideo ? !['draft', 'approved'].includes(storyboard.status) : storyboard.status !== 'approved')
    || !storyboardView || (!nativeNarrativeVideo && storyboardView.locale !== 'zh')
    || storyboardView.document.scenes.length !== settings.sceneImageAssetIds.length
    || (nativeNarrativeVideo && settings.profile !== CONTENT_DRIVEN_PROFILE)
    || (settings.profile === CONTENT_DRIVEN_PROFILE && !nativeNarrativeVideo && storyboardView.document.scenes.some(scene => !scene.animation))
    || storyboardView.document.scenes.some((scene) => [...scene.narration].length > 120)
    || storyboardView.document.scenes.reduce((total, scene) => total + [...scene.narration].length, 0) > 450
    || !isDeepStrictEqual(claimIds, [...payload.sourceClaimIds].sort())) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Video requires an approved source-bound storyboard and matching scene images in the exact version');
  }
  const nativeParent = nativeNarrativeVideo ? await requireNativeVideoStoryboard(prisma, storyboard, payload) : undefined;
  if (settings.purpose === 'audio-audition' && (!nativeParent || settings.locale !== storyboardView.locale)) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Audio audition requires the original native plan language and reviewed narration');
  }
  const images = await prisma.presentationAsset.findMany({
    where: { id: { in: settings.sceneImageAssetIds } }, include: { sourceClaims: { select: { claimId: true } } },
  });
  let claimIdentity: unknown = nativeParent ? record(record(nativeParent.task.result).nativeIllustrationContext).claimContent : undefined;
  if (settings.profile === CONTENT_DRIVEN_PROFILE && !nativeNarrativeVideo) {
    const sources = await prisma.claimNode.findMany({ where: { id: { in: claimIds }, researchObjectId: payload.researchObjectId,
      versionId: payload.versionId, extractionStatus: 'succeeded' }, select: { id: true, statement: true, updatedAt: true }, orderBy: { id: 'asc' } });
    if (sources.length !== claimIds.length) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Animation sources changed');
    for (const scene of storyboardView.document.scenes) requireAnimationSourceSupport(scene.animation!, sources);
    claimIdentity = sources.map(source => ({ id: source.id, updatedAt: source.updatedAt }));
  }
  const byId = new Map(images.map((asset) => [asset.id, asset]));
  const orderedImages = settings.sceneImageAssetIds.map((id, sceneIndex) => {
    const asset = byId.get(id);
    if (nativeParent) {
      if (!asset) throw new PresentationAssetError('VALIDATION_ERROR', 'Native video frame is missing');
      return asset;
    }
    const ids = asset?.sourceClaims.map((source) => source.claimId).sort() ?? [];
    const scene = asset && presentationSceneImageView(asset);
    const provenance = asset?.provenance as Record<string, unknown> | null;
    if (!asset || asset.deletedAt || asset.kind !== 'image' || asset.status !== 'approved'
      || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId
      || !scene || scene.storyboardAssetId !== storyboard.id || scene.sceneIndex !== sceneIndex
      || provenance?.parentIdentity !== storyboardIdentity || !isDeepStrictEqual(ids, claimIds)) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'Video scene images must be the approved ordered children of the storyboard');
    }
    return asset;
  });
  const originalFrameParents = nativeParent ? await Promise.all(orderedImages.map((asset, sceneIndex) =>
    requireNativeVideoSceneImage(prisma, asset, storyboard, nativeParent, payload, sceneIndex))) : undefined;
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
    ...(nativeParent ? { nativeParent, parentSourceEvidenceIdentity: nativeParent.sourceEvidenceIdentity, originalFrameParents: originalFrameParents! } : {}),
    identity: JSON.stringify({
      profile: settings.profile, storyboard: storyboardIdentity,
      images: orderedImages.map((asset) => ({ id: asset.id, contentHash: asset.contentHash, provenance: asset.provenance })),
      ...(originalFrameParents ? { originalFrameParents: originalFrameParents.map(({ storyboardAssetId, identity }) => ({ storyboardAssetId, identity })) } : {}),
      ...(settings.profile === ONCHIP_FIELD_SAMPLING_PROFILE ? { sourceContentHash: ONCHIP_SOURCE_CONTENT_HASH }
        : { sourceEvidence, sourceClaims: claimIdentity }),
    }),
  };
}
