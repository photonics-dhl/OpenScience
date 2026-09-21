import { planSceneImagePrompt } from './scene-image';
import { encodedImageDimensions, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES, ILLUSTRATION_IMAGE_REVIEW_MAX_EDGE,
  ILLUSTRATION_IMAGE_REVIEW_MAX_PIXELS, type AiGateway, type OcrAuthorizationContext, type ScienceReviewInput } from '@openscience/ai-gateway';
import { parseStoryboardDocument, parseStoryboardRequest, requireSceneImageParent, requireSceneImageRevision, requireStoryboardBase, requireStoryboardRevisionTask, requireVideoGenerationParents, storyboardSceneStyles, type PresentationGenerationPayload, type StoryboardDocument } from '@openscience/domain';
import { generateStoryboard, renderStoryboard } from './storyboard';
import { findPaperOriginalAssets, requirePaperOriginalsForReuse } from '@openscience/domain';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, HERMES_AUTHORITY_REARM_MARKER, PRESENTATION_ASSET_LABEL, parsePresentationGenerationPayload, requireHermesPresentationTaskAuthority, requirePresentationWriteScope, withPresentationAssetWrite } from '@openscience/domain';
import type { TaskHandler } from '../index';
import { generateClaimChartSvg, canonicalPresentationClaims, type PresentationClaim } from './chart-generator';
import { generateClaimInteractiveHtml } from './interactive-html';
import { requirePresentationMediaGenerator, type PresentationMediaGenerator } from './minimax-admin';
import { HostVideoSpool } from './host-video-spool';
import { Prisma } from '@prisma/client';
import { loadInstalledMediaSkills, mergeDesignSkillUsage, type DesignSkillUsage } from '../skills/installed-media-skills';
import { requireStyleReferenceImage } from '@openscience/domain';
import { readStoredIllustrationIssues, reviewIllustrationStoryboard } from './illustration-review';
import { clarifyIllustrationLabels } from './illustration-planner';
import { readVisualNarrativeSource, resolveVisualNarrativeSource } from '../scientific-writing-source';
import { generatedImageReviewAttachment, readStoredGeneratedImageReview, reviewGeneratedImage } from './generated-image-review';

function presentationClaimContent(claims: readonly PresentationClaim[]): string {
  return JSON.stringify(canonicalPresentationClaims(claims).map(({ id, parentClaimId, kind, statement, assessment, conditions, limitations, extractionStatus }) => ({
    id, parentClaimId, kind, statement, assessment, conditions, limitations, extractionStatus,
  })));
}

type StoryboardPlan = Awaited<ReturnType<typeof generateStoryboard>> & { reviewFormat?: 2 };
type StoryboardCheckpointIdentity = {
  payload: PresentationGenerationPayload;
  sourceEvidenceIdentity: string;
  claimContent: string;
  baseIdentity: string | null;
  narrativeSourceIdentity?: string;
};

async function requireNarrativeOriginals(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>,
  payload: PresentationGenerationPayload, document: StoryboardDocument) {
  if (!document.narrative) return;
  for (const scene of document.scenes) {
    if (!scene.paperOriginal) continue;
    const original = await prisma.presentationAsset.findUnique({ where: { id: scene.paperOriginal.assetId } });
    const p = original?.provenance as Record<string, unknown> | null;
    if (!original || original.deletedAt || original.status !== 'approved' || original.kind !== 'image'
      || original.researchObjectId !== payload.researchObjectId || original.versionId !== payload.versionId
      || original.contentHash !== scene.paperOriginal.contentHash || original.objectKey !== scene.paperOriginal.objectKey
      || p?.subtype !== 'paper_original_figure' || typeof p.sourceClaimId !== 'string' || !scene.sourceClaimIds.includes(p.sourceClaimId))
      throw new Error('[blocked] Narrative source image changed; preserve the candidate and select the current approved source');
  }
}

/** This worker-only task.result field is omitted by the public task projection. */
function readStoryboardCheckpoint(result: unknown, expected: StoryboardCheckpointIdentity): StoryboardPlan | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !Object.hasOwn(result, 'storyboardCheckpoint')) return undefined;
  const saved = (result as Record<string, unknown>).storyboardCheckpoint;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('[blocked] Saved storyboard checkpoint is invalid');
  const checkpoint = saved as Record<string, unknown>;
  if (Object.keys(checkpoint).sort().join(',') !== (expected.narrativeSourceIdentity === undefined
      ? 'baseIdentity,claimContent,payload,planned,sourceEvidenceIdentity'
      : 'baseIdentity,claimContent,narrativeSourceIdentity,payload,planned,sourceEvidenceIdentity')
    || !isDeepStrictEqual(checkpoint.payload, expected.payload)
    || checkpoint.sourceEvidenceIdentity !== expected.sourceEvidenceIdentity
    || checkpoint.claimContent !== expected.claimContent || checkpoint.baseIdentity !== expected.baseIdentity
    || checkpoint.narrativeSourceIdentity !== expected.narrativeSourceIdentity) {
    throw new Error('[blocked] Saved storyboard inputs changed; explicit new planning is required');
  }
  if (!checkpoint.planned || typeof checkpoint.planned !== 'object' || Array.isArray(checkpoint.planned)) {
    throw new Error('[blocked] Saved storyboard plan is invalid');
  }
  const planned = checkpoint.planned as Record<string, unknown>;
  if (Object.keys(planned).some(key => !['document', 'promptHash', 'designSkills', 'reviewFormat'].includes(key))
    || (planned.reviewFormat !== undefined && planned.reviewFormat !== 2)
    || typeof planned.promptHash !== 'string' || !/^[a-f0-9]{64}$/u.test(planned.promptHash)) {
    throw new Error('[blocked] Saved storyboard provenance is invalid');
  }
  if (planned.designSkills !== undefined && (!Array.isArray(planned.designSkills)
    || planned.designSkills.some(usage => !usage || typeof usage !== 'object' || Array.isArray(usage)
      || Object.keys(usage).some(key => !['id', 'resources', 'upstreamCommit', 'version'].includes(key))
      || typeof usage.id !== 'string' || !usage.id.trim()
      || !Array.isArray(usage.resources) || usage.resources.some((resource: unknown) => typeof resource !== 'string')
      || (usage.upstreamCommit !== undefined && typeof usage.upstreamCommit !== 'string')
      || (usage.version !== undefined && typeof usage.version !== 'string')))) {
    throw new Error('[blocked] Saved storyboard skill provenance is invalid');
  }
  return {
    document: parseStoryboardDocument(planned.document, expected.payload.sourceClaimIds, 'image'),
    promptHash: planned.promptHash,
    designSkills: planned.designSkills as DesignSkillUsage[] | undefined,
    ...(planned.reviewFormat === 2 ? { reviewFormat: 2 as const } : {}),
  };
}

type StoryboardPlanningContext = {
  base: Awaited<ReturnType<typeof requireStoryboardBase>>;
  revision: Awaited<ReturnType<typeof requireStoryboardRevisionTask>>;
  revisionContext?: StoryboardPlanningContext;
  identity: string | null;
};
async function readStoryboardPlanningContext(
  prisma: Pick<Prisma.TransactionClient, 'presentationAsset' | 'agentTask'>,
  payload: PresentationGenerationPayload,
  actorId: string,
  depth = 0,
): Promise<StoryboardPlanningContext> {
  if (depth > 2) throw new Error('[blocked] Storyboard revision depth exceeded');
  const base = await requireStoryboardBase(prisma, payload);
  const revision = await requireStoryboardRevisionTask(prisma, payload, actorId);
  const revisionContext = revision ? await readStoryboardPlanningContext(prisma, revision.payload, actorId, depth + 1) : undefined;
  return { base, revision, revisionContext,
    identity: revision ? JSON.stringify({ revision: revision.identity, base: revisionContext?.identity ?? null }) : base?.identity ?? null };
}

async function readReviewedPresentationEvidence(
  prisma: Pick<Prisma.TransactionClient, 'evidenceRecord'>,
  scope: { researchObjectId: string; versionId: string; sourceClaimIds: string[] },
  lineageByClaim?: ReadonlyMap<string, unknown>,
) {
  const candidates = await prisma.evidenceRecord.findMany({ where: {
    researchObjectId: scope.researchObjectId, versionId: scope.versionId,
    claimId: { in: scope.sourceClaimIds }, extractionStatus: 'succeeded', exactQuote: { not: null },
  }, orderBy: [{ claimId: 'asc' }, { id: 'asc' }] });
  const rows = lineageByClaim ? candidates.filter((row) => {
    const origin = row.provenance as Record<string, unknown> | null;
    const lineage = lineageByClaim.get(row.claimId);
    return typeof lineage === 'string' && origin?.source === 'reviewed_ingestion' && origin.sourceTaskId === lineage;
  }) : candidates;
  if (scope.sourceClaimIds.some((id) => !rows.some((row) => row.claimId === id && row.exactQuote?.trim()))) {
    throw new Error('[blocked] Each source Claim needs reviewed original evidence before scientific media planning');
  }
  return rows;
}

function presentationEvidenceIdentity(rows: Awaited<ReturnType<typeof readReviewedPresentationEvidence>>): string {
  return createHash('sha256').update(JSON.stringify(rows.map(({ id, claimId, artifactId, contentHash,
    exactQuote, relation, locator, extractionStatus, updatedAt, provenance }) => ({
    id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance,
  })))).digest('hex');
}

async function requireIllustrationOriginalArtifacts(prisma: Pick<Prisma.TransactionClient, 'artifact'>,
  evidence: Awaited<ReturnType<typeof readReviewedPresentationEvidence>>, workspaceId: string) {
  const artifactIds = [...new Set(evidence.map(row => row.artifactId))];
  if (artifactIds.some(id => !id)) throw new Error('[blocked] Illustration evidence needs an original artifact');
  const originals = await prisma.artifact.findMany({ where: { id: { in: artifactIds as string[] }, workspaceId, deletedAt: null, bytesPurgedAt: null }, select: { id: true } });
  if (originals.length !== artifactIds.length) throw new Error('[blocked] Illustration source was deleted or moved');
}

function needsGeneratedImageReview(payload: PresentationGenerationPayload): boolean {
  return Boolean(payload.sceneImage && payload.hermesRunAuthority?.stage === 'scene_image'
    && payload.hermesRunAuthority.profile === 'visual-narrative-v1');
}

/** Separate from ingestion/OCR authorization: only the current illustration task may send its sources. */
export async function requireIllustrationReviewAuthority(prisma: Prisma.TransactionClient, context: Readonly<OcrAuthorizationContext>) {
  const owner = await prisma.agentTask.findUnique({ where: { id: context.taskId },
    include: { session: { include: { researchObject: { include: { workspace: true } } } } } });
  const ro = owner?.session.researchObject;
  if (!owner || owner.kind !== 'presentation.generate' || owner.status !== 'running' || owner.deletedAt
    || owner.session.deletedAt || owner.session.status !== 'active' || owner.session.userId !== context.actorId
    || !ro || ro.deletedAt || ro.workspaceId !== context.workspaceId || ro.workspace.status !== 'active') {
    throw new Error('[blocked] Illustration review authority changed');
  }
  const payload = parsePresentationGenerationPayload(owner.payload);
  if (payload.researchObjectId !== ro.id
    || !((payload.kind === 'interactive_html' && payload.storyboard?.output === 'image')
      || (payload.kind === 'image' && needsGeneratedImageReview(payload)))) {
    throw new Error('[blocked] Illustration review requires an authorized illustration task');
  }
  await requirePresentationWriteScope(prisma, { userId: context.actorId, researchObjectId: ro.id, versionId: payload.versionId });
  if (payload.hermesRunAuthority) await requireHermesPresentationTaskAuthority(prisma, {
    taskId: owner.id, actorId: context.actorId, payload, authority: payload.hermesRunAuthority,
  });
  return { owner, payload };
}

/** Called under the existing trash-reference lock immediately before publishing a Chat request. */
export async function requireIllustrationReviewSubmission(prisma: Prisma.TransactionClient, input: ScienceReviewInput) {
  const { source, illustrationContext: snapshot } = input;
  if (!('kind' in source) || !snapshot || (source.kind === 'illustration-plan' && input.attachments !== undefined)
    || input.requestId !== input.authorizationContext.taskId) throw new Error('[blocked] Invalid illustration review submission');
  const { owner, payload } = await requireIllustrationReviewAuthority(prisma, input.authorizationContext);
  if (source.kind === 'illustration-plan' && (owner.executionAttempt > 3
    || (owner.executionAttempt === 3 && owner.retryCount !== 2))) {
    throw new Error('[blocked] Illustration review continuation is unavailable');
  }
  if (source.kind === 'illustration-image' ? !needsGeneratedImageReview(payload)
    : payload.kind !== 'interactive_html' || payload.storyboard?.output !== 'image') {
    throw new Error('[blocked] Illustration review source does not match its task');
  }
  if (owner.executionAttempt !== snapshot.executionAttempt || payload.researchObjectId !== source.researchObjectId || payload.versionId !== source.versionId
    || await prisma.trashEntry.findFirst({ where: { kind: 'asset', resourceId: owner.id, state: { in: ['trashed', 'purge_pending', 'purged'] } }, select: { id: true } })) {
    throw new Error('[blocked] Illustration review task was superseded or deleted');
  }
  const claims = await prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
  if (claims.length !== payload.sourceClaimIds.length || claims.some(claim => claim.extractionStatus !== 'succeeded')
    || presentationClaimContent(claims as PresentationClaim[]) !== snapshot.claimContent) throw new Error('[blocked] Illustration analysis changed');
  const lineage = payload.hermesRunAuthority ? new Map(claims.map(claim => {
    const origin = claim.provenance as Record<string, unknown> | null;
    return [claim.id, origin?.sourceTaskLineage ?? origin?.sourceTaskId] as const;
  })) : undefined;
  const evidence = await readReviewedPresentationEvidence(prisma, payload, lineage);
  if (presentationEvidenceIdentity(evidence) !== source.sourceEvidenceIdentity) throw new Error('[blocked] Illustration evidence changed');
  await requireIllustrationOriginalArtifacts(prisma, evidence, input.authorizationContext.workspaceId);
  if (source.kind === 'illustration-image') {
    const attachment = input.attachments?.[0];
    if (input.attachments?.length !== 1 || !attachment || attachment.mediaType === 'application/pdf'
      || attachment.sha256 !== source.candidateHash
      || !isDeepStrictEqual(attachment, generatedImageReviewAttachment(attachment.bytes, source.candidateHash, attachment.mediaType))) {
      throw new Error('[blocked] Image review attachment does not match the saved image');
    }
    const parent = await requireSceneImageParent(prisma, payload);
    if (!parent || parent.identity !== snapshot.baseIdentity || parent.sourceEvidenceIdentity !== source.sourceEvidenceIdentity) {
      throw new Error('[blocked] Image review parent changed');
    }
    const saved = await requireSavedImageForReview(prisma, payload, input.requestId, source.candidateHash, source.sourceEvidenceIdentity, parent.identity);
    if ((saved.provenance as Record<string, unknown>).contentType !== attachment.mediaType) throw new Error('[blocked] Image review content type changed');
    await requireSceneImageRevision(prisma, payload);
  } else if ((await readStoryboardPlanningContext(prisma, payload, input.authorizationContext.actorId)).identity !== snapshot.baseIdentity) {
    throw new Error('[blocked] Illustration base changed');
  }
  if (source.kind === 'illustration-plan' && payload.storyboard?.narrative) {
    // Metadata only under the existing submission transaction. SourceMap bytes were
    // loaded outside it; re-use the exact source identity saved with this candidate.
    const currentSource = await readVisualNarrativeSource(prisma, {
      userId: input.authorizationContext.actorId, workspaceId: input.authorizationContext.workspaceId,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds,
    });
    const saved = readStoryboardCheckpoint(owner.result, {
      payload, sourceEvidenceIdentity: source.sourceEvidenceIdentity,
      claimContent: snapshot.claimContent, baseIdentity: snapshot.baseIdentity,
      narrativeSourceIdentity: currentSource.identity,
    });
    if (!saved?.document.narrative || createHash('sha256').update(JSON.stringify(saved.document)).digest('hex') !== source.candidateHash)
      throw new Error('[blocked] Narrative review candidate does not match its saved current paper context');
    await requireNarrativeOriginals(prisma, payload, saved.document);
  }
}

async function requireSavedImageForReview(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>,
  payload: PresentationGenerationPayload, taskId: string, contentHash: string, evidenceIdentity: string, parentIdentity: string) {
  const asset = await prisma.presentationAsset.findUnique({ where: { id: taskId }, include: { sourceClaims: true } });
  const provenance = asset?.provenance as Record<string, unknown> | null;
  if (!asset || asset.deletedAt || asset.status !== 'draft' || asset.kind !== 'image'
    || asset.researchObjectId !== payload.researchObjectId || asset.versionId !== payload.versionId
    || asset.contentHash !== contentHash || provenance?.taskId !== taskId
    || provenance.source !== 'approved_storyboard_scene' || provenance.subtype !== 'storyboard_scene_image'
    || !['image/png', 'image/jpeg', 'image/webp'].includes(String(provenance.contentType)) || provenance.sourceEvidenceIdentity !== evidenceIdentity
    || provenance.parentIdentity !== parentIdentity || !isDeepStrictEqual(provenance.sceneImage, payload.sceneImage)
    || !isDeepStrictEqual(asset.sourceClaims.map(link => link.claimId).sort(), payload.sourceClaimIds)) {
    throw new Error('[blocked] Generated image review requires this task\'s unchanged saved draft');
  }
  return asset;
}

async function readPresentationInput(storage: NonNullable<Parameters<TaskHandler>[0]['storage']>, objectKey: string, expectedHash: string, maxBytes = 10 * 1024 * 1024): Promise<Buffer> {
  const object = await storage.getObject(objectKey);
  const chunks: Buffer[] = []; let size = 0;
  try {
    if (object.size <= 0 || object.size > maxBytes) throw new Error('[blocked] presentation input size is invalid');
    for await (const chunk of object.body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > object.size || size > maxBytes) throw new Error('[blocked] presentation input stream exceeded its bound');
      chunks.push(bytes);
    }
  } finally { object.body.destroy(); }
  const result = Buffer.concat(chunks);
  if (result.length !== object.size || createHash('sha256').update(result).digest('hex') !== expectedHash) {
    throw new Error('[blocked] presentation input content identity changed');
  }
  return result;
}

export function createPresentationGenerationHandler(options: { gateway?: Pick<AiGateway, 'completeStructured'> & Partial<Pick<AiGateway, 'reviewScientific' | 'generateImage' | 'canResumeImageBeforeSubmission' | 'canResumeImageFromCompletedResult' | 'resumeImageFromCompletedResult'>>; mediaGenerator?: PresentationMediaGenerator; videoSpool?: HostVideoSpool } = {}): TaskHandler {
  return async (deps, task) => {
    if (!deps.storage) throw new Error('[blocked] presentation object storage unavailable');
    const payload = parsePresentationGenerationPayload(task.payload);
    const owner = await deps.prisma.agentTask.findUnique({
      where: { id: task.id },
      include: { session: { include: { researchObject: { include: { workspace: true } } } } },
    });
    const researchObject = owner?.session.researchObject;
    if (!owner || owner.kind !== 'presentation.generate' || owner.status !== 'running' || !researchObject
      || owner.session.userId == null || researchObject.id !== payload.researchObjectId
      || researchObject.workspace.status !== 'active') throw new Error('[blocked] presentation task authority is invalid');
    const scope = { userId: owner.session.userId, researchObjectId: payload.researchObjectId, versionId: payload.versionId };
    await requirePresentationWriteScope(deps.prisma, scope);
    const requireHermesAuthority = async (prisma: Parameters<typeof requireHermesPresentationTaskAuthority>[0]) => {
      if (!payload.hermesRunAuthority) return false;
      await requireHermesPresentationTaskAuthority(prisma, {
        taskId: task.id, actorId: scope.userId, payload, authority: payload.hermesRunAuthority,
      });
      return true;
    };
    await requireHermesAuthority(deps.prisma);
    const existing = await deps.prisma.presentationAsset.findUnique({ where: { id: task.id }, include: { sourceClaims: true } });
    const actualImageReview = needsGeneratedImageReview(payload);
    if (existing && !actualImageReview) return { assetId: existing.id, kind: existing.kind, status: existing.status, contentHash: existing.contentHash, sourceClaimIds: payload.sourceClaimIds };
    const preProviderAuthorityRearm = !existing && payload.sceneImage && payload.hermesRunAuthority
      && [1, 2].includes(task.executionAttempt) && task.retryCount === 1 && task.recoveryContract === HERMES_AUTHORITY_REARM_MARKER;
    const completedProviderRecovery = !existing && payload.sceneImage && task.executionAttempt > 1
      && Boolean(options.gateway?.canResumeImageFromCompletedResult)
      && Boolean(options.gateway?.resumeImageFromCompletedResult)
      && await options.gateway!.canResumeImageFromCompletedResult!(task.id);
    if (!existing && payload.sceneImage && task.executionAttempt > 1 && !preProviderAuthorityRearm && !completedProviderRecovery) {
      throw new Error('[blocked] Previous paid image attempt has no saved result; explicit new generation is required');
    }
    if (preProviderAuthorityRearm) {
      if (!options.gateway?.canResumeImageBeforeSubmission
        || !await options.gateway.canResumeImageBeforeSubmission(task.id)) {
        throw new Error('[blocked] Image retry has no durable pre-submission proof');
      }
      const consumed = await deps.prisma.agentTask.updateMany({ where: {
        id: task.id, status: 'running', executionAttempt: task.executionAttempt, retryCount: 1,
        result: { equals: { hermesRecovery: HERMES_AUTHORITY_REARM_MARKER } },
      }, data: { result: Prisma.DbNull } });
      if (consumed.count !== 1) throw new Error('[blocked] Hermes authority retry marker is invalid');
    }
    if (payload.video && task.executionAttempt > 1) throw new Error('[blocked] Previous video attempt has no saved result; explicit new generation is required');
    const claimRows = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
    const returnedClaimIds = new Set(claimRows.map((claim) => claim.id));
    if (claimRows.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
      || claimRows.some((claim) => claim.extractionStatus !== 'succeeded')) {
      throw new Error('[blocked] source Claims are not verified in the exact version');
    }
    const scientificMedia = Boolean(payload.storyboard || payload.sceneImage || payload.video);
    const lineageByClaim = payload.hermesRunAuthority ? new Map(claimRows.map((claim) => {
      const origin = claim.provenance as Record<string, unknown> | null;
      return [claim.id, origin?.sourceTaskLineage ?? origin?.sourceTaskId] as const;
    })) : undefined;
    const sourceEvidence = scientificMedia ? await readReviewedPresentationEvidence(deps.prisma, payload, lineageByClaim) : [];
    const sourceEvidenceIdentity = presentationEvidenceIdentity(sourceEvidence);
    const claims = canonicalPresentationClaims(claimRows.map((claim) => ({ ...claim,
      sourcePassages: sourceEvidence.filter((row) => row.claimId === claim.id)
        .map((row) => ({ evidenceId: row.id, text: row.exactQuote!, relation: row.relation })),
    })) as PresentationClaim[]);
    const narrativeScope = { userId: scope.userId, workspaceId: researchObject.workspaceId,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds };
    const narrativeSource = payload.storyboard?.narrative
      ? await resolveVisualNarrativeSource({ prisma: deps.prisma, storage: deps.storage }, narrativeScope) : undefined;
    const requireUnchangedEvidence = async (prisma: Pick<Prisma.TransactionClient, 'evidenceRecord' | 'version' | 'claimNode' | 'ingestionTask' | 'presentationAsset'>) => {
      if (scientificMedia && presentationEvidenceIdentity(await readReviewedPresentationEvidence(prisma, payload, lineageByClaim)) !== sourceEvidenceIdentity) {
        throw new Error('[blocked] Reviewed source evidence changed during media generation');
      }
      if (narrativeSource && (await readVisualNarrativeSource(prisma, narrativeScope)).identity !== narrativeSource.identity)
        throw new Error('[blocked] Reviewed whole-paper analysis changed during narrative planning');
      if (storyboardDocument) await requireNarrativeOriginals(prisma, payload, storyboardDocument);
    };
    const planningContext = await readStoryboardPlanningContext(deps.prisma, payload, scope.userId);
    const base = planningContext.base;
    const sceneParent = await requireSceneImageParent(deps.prisma, payload);
    const sceneRevision = await requireSceneImageRevision(deps.prisma, payload);
    const requireUnchangedSceneRevision = async (prisma: Pick<Prisma.TransactionClient, 'presentationAsset' | 'agentTask'>) => {
      if (!isDeepStrictEqual(await requireSceneImageRevision(prisma, payload), sceneRevision)) {
        throw new Error('[blocked] Reviewed image correction changed during rendering');
      }
    };
    const styleReference = await requireStyleReferenceImage(deps.prisma, { ...payload, styleReferenceAssetId: payload.sceneImage?.styleReferenceAssetId });
    const requireUnchangedStyleReference = async (prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>) => {
      if (!styleReference) return;
      const current = await requireStyleReferenceImage(prisma, { ...payload, styleReferenceAssetId: payload.sceneImage?.styleReferenceAssetId });
      if (current?.id !== styleReference.id || current.contentHash !== styleReference.contentHash || current.objectKey !== styleReference.objectKey) throw new Error('[blocked] Style reference changed during image generation');
    };
    if (sceneParent && ((sceneParent.view.output === 'image' && !sceneParent.sourceEvidenceIdentity)
      || (sceneParent.sourceEvidenceIdentity && sceneParent.sourceEvidenceIdentity !== sourceEvidenceIdentity))) {
      throw new Error('[blocked] Storyboard evidence has changed; revise the illustration plan before generating images');
    }
    const finishGeneratedImageReview = async (saved: { id: string; kind: string; status: string; contentHash: string; objectKey: string }) => {
      if (!actualImageReview || !sceneParent || !payload.sceneImage || !options.gateway?.reviewScientific) {
        throw new Error('[blocked] Generated image review unavailable');
      }
      const identity = { requestId: task.id, contentHash: saved.contentHash, sourceEvidenceIdentity, parentIdentity: sceneParent.identity };
      const savedImage = await requireSavedImageForReview(deps.prisma, payload, task.id, saved.contentHash, sourceEvidenceIdentity, sceneParent.identity);
      const contentType = (savedImage.provenance as Record<string, unknown>).contentType;
      const imageBytes = await readPresentationInput(deps.storage!, saved.objectKey, saved.contentHash, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES);
      const attachment = generatedImageReviewAttachment(imageBytes, saved.contentHash, contentType);
      const authorizationContext = Object.freeze({ taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId });
      const illustrationContext = { executionAttempt: task.executionAttempt, claimContent: presentationClaimContent(claims), baseIdentity: sceneParent.identity };
      const authorityInput: ScienceReviewInput = {
        requestId: task.id, authorizationContext, illustrationContext,
        source: { kind: 'illustration-image', researchObjectId: payload.researchObjectId, versionId: payload.versionId,
          candidateHash: saved.contentHash, sourceEvidenceIdentity }, prompt: '',
        attachments: [attachment],
      };
      const readCurrent = async (tx: Prisma.TransactionClient) => {
        await requireIllustrationReviewSubmission(tx, authorityInput);
        await requireUnchangedSceneRevision(tx);
        const current = await requireSavedImageForReview(tx, payload, task.id, saved.contentHash, sourceEvidenceIdentity, sceneParent.identity);
        if (current.objectKey !== saved.objectKey) throw new Error('[blocked] Saved image storage identity changed');
        const provenance = current.provenance as Record<string, unknown>;
        return { current, provenance, review: readStoredGeneratedImageReview(provenance.imageReview, identity) };
      };
      const stored = await withPresentationAssetWrite(deps.prisma, scope, readCurrent);
      let imageReview = stored.review;
      if (!imageReview) {
        const parentRow = await deps.prisma.presentationAsset.findUniqueOrThrow({ where: { id: payload.sceneImage.storyboardAssetId } });
        const settings = parseStoryboardRequest((parentRow.provenance as Record<string, unknown>).storyboardSettings);
        // The object and draft row already exist. No model call is made while holding the write lock.
        const reviewed = await reviewGeneratedImage({ reviewScientific: options.gateway.reviewScientific.bind(options.gateway) }, {
          bytes: imageBytes, contentType, claims, settings, document: sceneParent.view.document,
          sceneIndex: payload.sceneImage.sceneIndex, authorizationContext, illustrationContext,
          researchObjectId: payload.researchObjectId, versionId: payload.versionId, identity,
        });
        imageReview = await withPresentationAssetWrite(deps.prisma, scope, async tx => {
          const { provenance, review } = await readCurrent(tx);
          if (review) {
            if (!isDeepStrictEqual(review, reviewed)) throw new Error('[blocked] Saved image review changed concurrently');
            return review;
          }
          await tx.presentationAsset.update({ where: { id: saved.id }, data: {
            provenance: JSON.parse(JSON.stringify({ ...provenance, imageReview: reviewed })) as Prisma.InputJsonObject,
          } });
          await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.image_reviewed', workspaceId: researchObject.workspaceId,
            targetType: 'presentation_asset', targetId: saved.id,
            metadata: { taskId: task.id, contentHash: saved.contentHash, decision: reviewed.decision,
              provider: reviewed.provider, model: reviewed.model, promptHash: reviewed.promptHash, responseHash: reviewed.responseHash } }, tx);
          return reviewed;
        });
      }
      return { assetId: saved.id, kind: saved.kind, status: saved.status, contentHash: saved.contentHash,
        sourceClaimIds: payload.sourceClaimIds, imageReview };
    };
    // A retry resumes the review of its durable draft before any paid-generation retry guard.
    if (existing && actualImageReview) return finishGeneratedImageReview(existing);
    const videoParents = await requireVideoGenerationParents(deps.prisma, payload);
    let storyboardDocument: StoryboardDocument | undefined;
    let bytes: Buffer;
    let extension: string;
    let contentType: string;
    let generator = DETERMINISTIC_PRESENTATION_GENERATOR;
    let generatorVersion = DETERMINISTIC_PRESENTATION_GENERATOR_VERSION;
    let promptHash: string | null = null;
    let imageProvider: string | null = null;
    let videoOutput: { filePath: string; size: number; contentHash: string } | undefined;
    let videoProvenance: Record<string, unknown> | undefined;
    let designSkills: DesignSkillUsage[] | undefined;
    let illustrationReview: Awaited<ReturnType<typeof reviewIllustrationStoryboard>>['provenance'] | undefined;
    if (payload.video && videoParents) {
      const user = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] isolated video generation is unavailable');
      if (!options.videoSpool) throw new Error('[blocked] isolated video generation is unavailable');
      const sceneImages = [];
      for (const asset of videoParents.orderedImages) {
        sceneImages.push(await readPresentationInput(deps.storage, asset.objectKey, asset.contentHash));
      }
      await requirePresentationWriteScope(deps.prisma, scope);
      const [currentOwner, currentUser, currentClaims, currentParents] = await Promise.all([
        deps.prisma.agentTask.findUnique({ where: { id: task.id }, include: { session: true } }),
        deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } }),
        deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } }),
        requireVideoGenerationParents(deps.prisma, payload),
      ]);
      if (!currentOwner || currentOwner.status !== 'running' || currentOwner.executionAttempt !== task.executionAttempt
        || currentOwner.session.userId !== scope.userId || currentOwner.session.researchObjectId !== payload.researchObjectId
        || (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma))
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)
        || currentParents?.identity !== videoParents.identity) {
        throw new Error('[blocked] approved video inputs changed before rendering');
      }
      await requireUnchangedEvidence(deps.prisma);
      const result = await options.videoSpool.generate({
        taskId: task.id, executionAttempt: task.executionAttempt, profile: payload.video.profile,
        ...(payload.video.profile === 'onchip-field-sampling-v1' ? { sceneRoles: payload.video.sceneRoles } : {}),
        sourceClaimIds: payload.sourceClaimIds, storyboard: videoParents.storyboardView.document, sceneImages,
        locale: videoParents.storyboardView.locale, style: videoParents.storyboardView.style,
      });
      bytes = Buffer.alloc(0); contentType = result.contentType; extension = 'mp4';
      generator = result.generator; generatorVersion = result.generatorVersion; promptHash = result.inputHash;
      videoOutput = { filePath: result.filePath, size: result.size, contentHash: result.contentHash };
      videoProvenance = {
        subtype: 'approved_storyboard_video', video: payload.video, parentIdentity: videoParents.identity,
        storyboardContentHash: videoParents.storyboard.contentHash,
        sceneImageContentHashes: videoParents.orderedImages.map((asset) => asset.contentHash),
        narration: result.narration, metrics: result.metrics, runtime: result.runtime,
      };
    } else if (payload.sceneImage && sceneParent) {
      const user = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] presentation media generation requires a platform administrator');
      // Shared media-generation invariants: workspace write scope, authority re-check,
      // parent plan / claims / evidence unchanged. Style reference is LLM-flow only.
      await requirePresentationWriteScope(deps.prisma, scope);
      const currentUser = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] presentation media authority changed');
      if ((await requireSceneImageParent(deps.prisma, payload))?.identity !== sceneParent.identity) throw new Error('[blocked] approved storyboard changed before image generation');
      const currentClaims = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      if (presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)) throw new Error('[blocked] source Claims changed before image generation');
      await requireUnchangedEvidence(deps.prisma);
      // Paper-original scenes copy the bound asset's bytes verbatim — no image provider
      // call, no quota, no chatgpt-web bridge. This is the only path that bypasses
      // gateway.generateImage for figurePlan.reuse.
      const paperScene = sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]?.paperOriginal;
      if (paperScene) {
        if (sceneRevision) throw new Error('[blocked] Paper-original reuse cannot apply a rendering correction; revise the scene plan');
        const paperBytes = await readPresentationInput(deps.storage, paperScene.objectKey, paperScene.contentHash, 32 * 1024 * 1024);
        bytes = paperBytes; contentType = 'image/png'; extension = 'png';
        imageProvider = 'paper_original_copy';
        generator = 'OpenScience paper-original figure copy'; generatorVersion = paperScene.assetId;
        promptHash = null;
      } else {
      if (!options.gateway?.generateImage) throw new Error('[blocked] scene image gateway unavailable');
      const installedSkills = completedProviderRecovery ? undefined
        : loadInstalledMediaSkills(storyboardSceneStyles(sceneParent.view, sceneParent.view.document.scenes)[payload.sceneImage.sceneIndex]!, sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.visualAction, 'render');
      const prompt = completedProviderRecovery ? null
        : await planSceneImagePrompt(options.gateway, claims, sceneParent.view, payload.sceneImage.sceneIndex, installedSkills, sceneRevision?.repairInstruction);
      designSkills = installedSkills?.usage;
      const referenceImage = !completedProviderRecovery && styleReference
        ? { bytes: await readPresentationInput(deps.storage, styleReference.objectKey, styleReference.contentHash), contentHash: styleReference.contentHash }
        : undefined;
      await requireUnchangedStyleReference(deps.prisma);
      await requireUnchangedSceneRevision(deps.prisma);
      const result = completedProviderRecovery
        ? await options.gateway.resumeImageFromCompletedResult!(task.id)
        : await options.gateway.generateImage({ prompt: prompt!, requestId: task.id, ...(referenceImage ? { referenceImage } : {}) });
      bytes = result.bytes; contentType = result.contentType; extension = imageExtension(contentType);
      imageProvider = result.provider;
      generator = `OpenScience Hermes scene image / ${result.provider}`; generatorVersion = result.model; promptHash = result.promptHash;
      }
    } else if (payload.storyboard) {
      if (!options.gateway) throw new Error('[blocked] storyboard planner unavailable');
      let planned: StoryboardPlan;
      let persistPlan: ((planned: StoryboardPlan, review?: Awaited<ReturnType<typeof reviewIllustrationStoryboard>>['provenance']) => Promise<void>) | undefined;
      if (payload.storyboard.output === 'image') {
        if (!options.gateway.reviewScientific) throw new Error('[blocked] Illustration scientific review unavailable');
        if (owner.deletedAt || owner.session.deletedAt || owner.session.status !== 'active'
          || owner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(owner.payload, task.payload)) {
          throw new Error('[blocked] Storyboard task was superseded or changed');
        }
        // Resolve paper-originals BEFORE the planner runs. A reuse decision
        // without a registered paper_original_figure asset raises a clear,
        // user-actionable error rather than silently dropping the scene.
        // Narrative scenes choose source images by explanatory role in reading order.
        // This lookup never imposes the legacy figurePlan reuse-first sequence.
        let originalSelection = payload.storyboard.figurePlan;
        if (payload.storyboard.narrative) {
          const originals = await deps.prisma.presentationAsset.findMany({ where: {
            researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: 'image',
            status: 'approved', deletedAt: null, provenance: { path: ['subtype'], equals: 'paper_original_figure' },
          }, select: { provenance: true } });
          const ids = originals.flatMap(asset => {
            const p = asset.provenance as Record<string, unknown> | null;
            return typeof p?.figureId === 'string' && typeof p.sourceClaimId === 'string'
              && payload.sourceClaimIds.includes(p.sourceClaimId) ? [p.figureId] : [];
          });
          originalSelection = { figures: [...new Set(ids)].map(id => ({ id, decision: 'reuse' as const })) };
        }
        const paperOriginals = await findPaperOriginalAssets(deps.prisma, {
          researchObjectId: payload.researchObjectId,
          versionId: payload.versionId,
          figurePlan: originalSelection,
        });
        if (payload.storyboard.narrative) {
          for (const [figureId, original] of paperOriginals) {
            // Read and verify the full immutable source before excluding a known size
            // mismatch. Missing/corrupt storage is an error, never an absent figure.
            const originalBytes = await readPresentationInput(deps.storage, original.objectKey, original.contentHash, 32 * 1024 * 1024);
            const { width, height } = encodedImageDimensions('image/png', originalBytes);
            if (originalBytes.length > ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES
              || width > ILLUSTRATION_IMAGE_REVIEW_MAX_EDGE || height > ILLUSTRATION_IMAGE_REVIEW_MAX_EDGE
              || width * height > ILLUSTRATION_IMAGE_REVIEW_MAX_PIXELS) paperOriginals.delete(figureId);
          }
        } else requirePaperOriginalsForReuse(paperOriginals, payload.storyboard.figurePlan);
        const identity: StoryboardCheckpointIdentity = {
          payload, sourceEvidenceIdentity, claimContent: presentationClaimContent(claims), baseIdentity: planningContext.identity,
          ...(narrativeSource ? { narrativeSourceIdentity: narrativeSource.identity } : {}),
        };
        let expectedResult = owner.result;
        persistPlan = async (planned, review) => {
          const checkpoint = { ...identity, planned };
          // Persist the paid plan before Chat review. A failed review must not restart planning.
          await deps.prisma.$transaction(async tx => {
            const { owner: currentOwner, payload: currentPayload } = await requireIllustrationReviewAuthority(tx, {
              taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId,
            });
            if (currentOwner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(currentOwner.payload, owner.payload)
              || !isDeepStrictEqual(currentPayload, payload)
              || await tx.trashEntry.findFirst({ where: { kind: 'asset', resourceId: task.id,
                state: { in: ['trashed', 'purge_pending', 'purged'] } }, select: { id: true } })) {
              throw new Error('[blocked] Storyboard task changed before checkpoint save');
            }
            const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
              researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
            if (currentClaims.length !== payload.sourceClaimIds.length || currentClaims.some(claim => claim.extractionStatus !== 'succeeded')
              || presentationClaimContent(currentClaims as PresentationClaim[]) !== identity.claimContent) {
              throw new Error('[blocked] Storyboard Claims changed before checkpoint save');
            }
            await requireUnchangedEvidence(tx);
            await requireNarrativeOriginals(tx, payload, planned.document);
            await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
            if ((await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== identity.baseIdentity) {
              throw new Error('[blocked] Storyboard base changed before checkpoint save');
            }
            if (expectedResult !== null && (typeof expectedResult !== 'object' || Array.isArray(expectedResult))) {
              throw new Error('[blocked] Storyboard task result is invalid');
            }
            const savedCheckpoint = await tx.agentTask.updateMany({ where: {
              id: task.id, kind: 'presentation.generate', status: 'running', deletedAt: null,
              executionAttempt: task.executionAttempt,
              payload: { equals: owner.payload as Prisma.InputJsonValue },
              result: { equals: expectedResult === null ? Prisma.AnyNull : expectedResult as Prisma.InputJsonValue },
            }, data: { result: JSON.parse(JSON.stringify({ ...(expectedResult as Record<string, unknown> | null),
              storyboardCheckpoint: checkpoint, ...(review ? { storyboardReview: review } : {}) })) as Prisma.InputJsonValue } });
            if (savedCheckpoint.count !== 1) throw new Error('[blocked] Storyboard checkpoint owner changed');
          }, { isolationLevel: 'Serializable' });
          expectedResult = JSON.parse(JSON.stringify({ ...(expectedResult as Record<string, unknown> | null),
            storyboardCheckpoint: checkpoint, ...(review ? { storyboardReview: review } : {}) }));
        };
        const saved = readStoryboardCheckpoint(owner.result, identity);
        if (saved) {
          planned = saved;
        } else {
          if (task.executionAttempt > 1) {
            throw new Error('[blocked] Previous paid storyboard attempt has no saved plan; explicit new planning is required');
          }
          if (planningContext.revision) {
            const previous = readStoryboardCheckpoint(planningContext.revision.task.result, {
              payload: planningContext.revision.payload, sourceEvidenceIdentity,
              claimContent: presentationClaimContent(claims), baseIdentity: planningContext.revisionContext?.identity ?? null,
              ...(narrativeSource ? { narrativeSourceIdentity: narrativeSource.identity } : {}),
            });
            if (!previous) throw new Error('[blocked] Scientific label clarification has no saved plan');
            await requireIllustrationOriginalArtifacts(deps.prisma, sourceEvidence, researchObject.workspaceId);
            const result = planningContext.revision.task.result as Record<string, unknown>;
            const issues = readStoredIllustrationIssues(result.storyboardReview, previous.document, claims,
              planningContext.revision.task.id, sourceEvidenceIdentity);
            const feedback = issues ? (result.storyboardReview as { summary: string }).summary : planningContext.revision.feedback;
            planned = payload.storyboard.narrative && (issues?.some(issue => issue.kind === 'requires_replan')
              || previous.document.scenes.length > (payload.storyboard.narrativeSceneLimit ?? 6))
              ? await generateStoryboard(options.gateway, claims, payload.storyboard, {
                document: previous.document, locale: payload.storyboard.locale, style: payload.storyboard.style, output: 'image',
              }, paperOriginals, narrativeSource?.context, { summary: feedback, issues: issues ?? [] })
              : await clarifyIllustrationLabels(options.gateway, claims, payload.storyboard, previous, feedback, issues);
          } else {
            planned = await generateStoryboard(options.gateway, claims, payload.storyboard, base?.view, paperOriginals, narrativeSource?.context);
          }
          planned.reviewFormat = 2;
          await persistPlan(planned);
        }
      } else {
        planned = await generateStoryboard(options.gateway, claims, payload.storyboard, base?.view);
      }
      storyboardDocument = planned.document; promptHash = planned.promptHash;
      if (payload.storyboard.narrative && storyboardDocument.scenes.length > (payload.storyboard.narrativeSceneLimit ?? 6))
        throw new Error('[blocked] Saved narrative exceeds its remaining scene allowance');
      await requireUnchangedEvidence(deps.prisma);
      designSkills = planned.designSkills;
      if (payload.storyboard.output === 'image') {
        if (!options.gateway.reviewScientific) throw new Error('[blocked] Illustration scientific review unavailable');
        const priorReview = owner.result && typeof owner.result === 'object' && !Array.isArray(owner.result)
          ? owner.result.storyboardReview : undefined;
        if (priorReview !== undefined) {
          readStoredIllustrationIssues(priorReview, planned.document, claims, task.id, sourceEvidenceIdentity);
          throw new Error('[blocked] Illustration needs upstream scientific revision: ' + (priorReview as { summary: string }).summary.slice(0, 300));
        }
        const reviewed = await reviewIllustrationStoryboard({ reviewScientific: options.gateway.reviewScientific.bind(options.gateway) }, claims, payload.storyboard, planned.document, {
          authorizationContext: Object.freeze({ taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId }),
          illustrationContext: { executionAttempt: task.executionAttempt, claimContent: presentationClaimContent(claims), baseIdentity: planningContext.identity },
          researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceEvidenceIdentity,
          structuredIssues: planned.reviewFormat === 2,
          narrativeSource: narrativeSource?.context,
        });
        if (reviewed.provenance.decision === 'blocked') {
          await persistPlan!(planned, reviewed.provenance);
          throw new Error('[blocked] Illustration needs upstream scientific revision: ' + reviewed.provenance.summary.slice(0, 300));
        }
        storyboardDocument = reviewed.document; illustrationReview = reviewed.provenance;
        designSkills = mergeDesignSkillUsage(designSkills, reviewed.designSkills);
      }
      bytes = renderStoryboard(storyboardDocument, payload.storyboard); extension = 'html'; contentType = 'text/html; charset=utf-8';
      generator = 'OpenScience Hermes storyboard planner'; generatorVersion = '1';
    } else if (payload.kind === 'chart') {
      bytes = generateClaimChartSvg(claims); extension = 'svg'; contentType = 'image/svg+xml';
    } else if (payload.kind === 'interactive_html') {
      bytes = generateClaimInteractiveHtml(claims); extension = 'html'; contentType = 'text/html; charset=utf-8';
    } else {
      const user = await deps.prisma.user.findUnique({ where: { id: owner.session.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin') throw new Error('[blocked] presentation media generation requires a platform administrator');
      const result = await requirePresentationMediaGenerator(options.mediaGenerator).generate({ kind: payload.kind, sourceClaimIds: payload.sourceClaimIds });
      bytes = result.bytes; extension = payload.kind === 'image' ? imageExtension(result.contentType) : 'mp4'; contentType = result.contentType;
      generator = result.generator; generatorVersion = result.generatorVersion; promptHash = result.promptHash;
    }
    if (videoOutput ? videoOutput.size < 32 || videoOutput.size > 128 * 1024 * 1024 : bytes.length < 32 || bytes.length > 10 * 1024 * 1024) throw new Error('[blocked] presentation output size is invalid');
    const contentHash = videoOutput?.contentHash ?? createHash('sha256').update(bytes).digest('hex');
    const objectKey = `presentation/${payload.researchObjectId}/${payload.versionId}/${contentHash}.${extension}`;
    const asset = await withPresentationAssetWrite(deps.prisma, scope, async (tx) => {
      const currentTask = await tx.agentTask.findUnique({ where: { id: task.id }, include: { session: true } });
      if (!currentTask || currentTask.deletedAt || currentTask.session.deletedAt || currentTask.kind !== 'presentation.generate' || currentTask.status !== 'running'
        || currentTask.executionAttempt !== task.executionAttempt
        || currentTask.session.userId !== scope.userId || currentTask.session.researchObjectId !== payload.researchObjectId) {
        throw new Error('[blocked] presentation task authority changed');
      }
      if (payload.kind === 'image' || payload.kind === 'video') {
        const currentUser = await tx.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
        if (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(tx)) {
          throw new Error('[blocked] presentation media generation requires a platform administrator or active Hermes run grant');
        }
      }
      const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      const currentIds = new Set(currentClaims.map((claim) => claim.id));
      if (currentClaims.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !currentIds.has(id))
        || currentClaims.some((claim) => claim.extractionStatus !== 'succeeded')
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)) {
        throw new Error('[blocked] source Claims changed before presentation completion');
      }
      if ((await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== planningContext.identity) throw new Error('[blocked] base storyboard changed before completion');
      if (sceneParent && (await requireSceneImageParent(tx, payload))?.identity !== sceneParent.identity) throw new Error('[blocked] approved storyboard changed before scene image completion');
      if (videoParents && (await requireVideoGenerationParents(tx, payload))?.identity !== videoParents.identity) throw new Error('[blocked] approved video inputs changed before completion');
      await requireUnchangedEvidence(tx);
      await requireUnchangedStyleReference(tx);
      await requireUnchangedSceneRevision(tx);
      if (illustrationReview) {
        await requireHermesAuthority(tx);
        await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
      }
      // withPresentationAssetWrite holds the shared storage-reference lock through upload and row creation.
      await tx.trashObjectCleanup.updateMany({ where: { objectKey }, data: { state: 'retained', lastError: null } });
      await deps.storage!.putObject(objectKey, videoOutput ? createReadStream(videoOutput.filePath) : bytes, { contentType, sha256: contentHash });
      const created = await tx.presentationAsset.create({ data: {
        id: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind,
        objectKey, contentHash, generator, generatorVersion, promptHash, label: PRESENTATION_ASSET_LABEL,
        provenance: { ...(scientificMedia ? { sourceEvidenceIdentity, sourceEvidenceIds: sourceEvidence.map((row) => row.id) } : {}), source: payload.sceneImage ? 'approved_storyboard_scene' : payload.video ? 'approved_storyboard_video' : 'verified_claims', ...(payload.sceneImage && sceneParent ? { subtype: 'storyboard_scene_image', sceneImage: { ...payload.sceneImage }, parentIdentity: sceneParent.identity, storyboardContentHash: sceneParent.contentHash, ...(sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]?.paperOriginal ? { paperOriginal: { sourceAssetId: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.assetId, sourceContentHash: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.contentHash, sourceObjectKey: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.objectKey } } : {}) } : {}), ...(videoProvenance ?? {}), ...(illustrationReview ? { illustrationReview } : {}), ...(designSkills ? { designSkills } : {}), ...(styleReference ? { styleReference: { assetId: styleReference.id, contentHash: styleReference.contentHash, role: 'style' } } : {}), ...(sceneParent?.view.document.scenes[payload.sceneImage!.sceneIndex]?.illustration ? { illustrationCompilation: { skill: 'openscience-research-illustration', version: '6', mode: 'structured_brief' } } : {}), taskId: task.id, sourceClaimIds: payload.sourceClaimIds, contentType, ...(storyboardDocument && payload.storyboard ? { subtype: 'sourced_storyboard', storyboardDocument: JSON.parse(JSON.stringify(storyboardDocument)), storyboardSettings: JSON.parse(JSON.stringify(payload.storyboard)) } : {}) },
      } });
      await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: created.id, claimId, researchObjectId: payload.researchObjectId, versionId: payload.versionId })) });
      if (storyboardDocument) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'sourced_storyboard', baseAssetId: payload.storyboard?.baseAssetId ?? null } }, tx);
      if (payload.sceneImage) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'storyboard_scene_image', storyboardAssetId: payload.sceneImage.storyboardAssetId, sceneIndex: payload.sceneImage.sceneIndex, provider: imageProvider, model: generatorVersion, contentHash, ...(sceneParent?.view.document.scenes[payload.sceneImage.sceneIndex]?.paperOriginal ? { paperOriginal: { sourceAssetId: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.assetId, sourceContentHash: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.contentHash } } : {}) } }, tx);
      if (payload.video) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'approved_storyboard_video', storyboardAssetId: payload.video.storyboardAssetId, contentHash, timingStatus: 'estimated_requires_review' } }, tx);
      return created;
    });
    if (actualImageReview) return finishGeneratedImageReview(asset);
    return { assetId: asset.id, kind: asset.kind, status: asset.status, contentHash, sourceClaimIds: payload.sourceClaimIds };
  };
}

function imageExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  throw new Error('[blocked] Unsupported image content type');
}
