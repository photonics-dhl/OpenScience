import { presentationClaimContent, readReviewedPresentationEvidence, presentationEvidenceIdentity } from '@openscience/domain';
import { planSceneImagePrompt } from './scene-image';
import { getBlobStorageKey } from '@openscience/storage';
import { readNativeAgentExecution, requireNativeAgentExecutionAuthority, supportsNativeIllustration, requireNativeVideoStoryboard } from '@openscience/domain';
import { runNativeIllustrationTask, replayNativeVideoPlan, type VerifiedNativeVideoBase } from '../native-agent/illustration-task';
import type { NativePaperImage } from '../native-agent/paper-tools';
import { encodedImageDimensions, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES, ILLUSTRATION_IMAGE_REVIEW_MAX_EDGE,
  ILLUSTRATION_IMAGE_REVIEW_MAX_PIXELS, type AiGateway, type OcrAuthorizationContext, type ScienceReviewInput } from '@openscience/ai-gateway';
import { projectIllustrationEvidence, parseStoryboardDocument, parseStoryboardRequest, requireIllustrationSourceSupport, requireSceneImageParent, requireSceneImageRevision, requireStoryboardBase, requireStoryboardRevisionTask, requireStoryboardImageRevision, readNarrativePixelReplanAuthority, requireVideoGenerationParents, storyboardSceneStyles, generatedSceneImageRequiresPixelReview, type PresentationGenerationPayload, type StoryboardDocument } from '@openscience/domain';
import { generateStoryboard, renderStoryboard } from './storyboard';
import { findPaperOriginalAssets, requirePaperOriginalsForReuse } from '@openscience/domain';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { readNativeImageReviewCheckpoint, completeNativeImageReview } from '@openscience/domain';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, HERMES_AUTHORITY_REARM_MARKER, PRESENTATION_ASSET_LABEL, VISUAL_NARRATIVE_PROFILE, parsePresentationGenerationPayload, requireHermesPresentationTaskAuthority, requireStoryboardArtCorrectionAuthorization, readInitialSciencePlanningRetryChain, requirePixelPlanningPreProviderRearm, requirePixelStoryboardOutputResume, requireHermesCompletedImageReviewRecovery, requireManualSceneImageReviewReceipt, requirePresentationWriteScope, withPresentationAssetWrite } from '@openscience/domain';
import type { TaskHandler } from '../index';
import { hasStandaloneScienceDiagnostics, readStandaloneScienceRecovery } from '@openscience/domain';
import { generateClaimChartSvg, canonicalPresentationClaims, type PresentationClaim } from './chart-generator';
import { generateClaimInteractiveHtml } from './interactive-html';
import { requirePresentationMediaGenerator, type PresentationMediaGenerator } from './minimax-admin';
import { type PresentationVideoSpool } from './host-video-spool';
import { SynclipVideoTimingError } from './synclip-video-spool';
import { Prisma } from '@prisma/client';
import { loadInstalledMediaSkills, mergeDesignSkillUsage, type DesignSkillUsage } from '../skills/installed-media-skills';
import { requireStyleReferenceImage } from '@openscience/domain';
import { readStoredIllustrationIssues, reviewIllustrationStoryboard } from './illustration-review';
import { clarifyIllustrationLabels, generateIllustrationStoryboard, type StoryboardScienceCheckpoint, type StoryboardScienceRejectionReceipt, type StoryboardScienceRejectedCandidate, type StoryboardArtRejection, type StoryboardPlanningPersistence } from './illustration-planner';
import { hasSingleReviewedVisualSource, readVisualNarrativeSource, resolveVisualNarrativeSource } from '../scientific-writing-source';
import { generatedImageReviewAttachment, readStoredGeneratedImageReview, reviewGeneratedImage } from './generated-image-review';


type StoryboardPlan = Awaited<ReturnType<typeof generateStoryboard>> & { reviewFormat?: 2 };
// Match task claim/completion and asset persistence: retry only rolled-back database conflicts.
const STORYBOARD_CHECKPOINT_RETRY_DELAYS_MS = [10, 25, 50, 100, 200] as const;
type StoryboardReview = Awaited<ReturnType<typeof reviewIllustrationStoryboard>>['provenance'];
type StoryboardAcceptance = {
  document: StoryboardDocument;
  firstReview: StoryboardReview;
  submittedExecutionAttempt?: number;
  review?: StoryboardReview;
  designSkills?: DesignSkillUsage[];
};
type StoryboardCheckpointIdentity = {
  payload: PresentationGenerationPayload;
  sourceEvidenceIdentity: string;
  claimContent: string;
  baseIdentity: string | null;
  narrativeSourceIdentity?: string;
};

async function readReviewedVisualContextSource(prisma: Parameters<typeof readVisualNarrativeSource>[0],
  scope: Parameters<typeof readVisualNarrativeSource>[1], payload: PresentationGenerationPayload,
  claims: readonly { extractionStatus: string; provenance?: unknown }[], evidence: readonly { artifactId: string }[], result: unknown) {
  if (!payload.storyboard?.narrative) {
    if (payload.storyboard?.output !== 'image' || !hasSingleReviewedVisualSource(claims, evidence)) return undefined;
    const saved = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
    // Preserve the original context and identity for both saved checkpoint forms.
    // Their existing recovery validation still applies; no old task gains new paid work or false source provenance.
    if (['storyboardCheckpoint', 'storyboardPlanningCheckpoint'].some(key => {
      const checkpoint = saved[key];
      return checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)
        && !Object.hasOwn(checkpoint, 'narrativeSourceIdentity');
    })) return undefined;
  }
  const source = await readVisualNarrativeSource(prisma, scope);
  // A single Evidence artifact may still be a different paper from the Claim lineage.
  // Compare against the authorized ingestion identity; authorization/identity errors above never become legacy fallback.
  return !payload.storyboard?.narrative && evidence.some(row => row.artifactId !== source.reference.artifactId) ? undefined : source;
}
type StoryboardPlanningCheckpoint = StoryboardCheckpointIdentity & {
  schemaVersion: 1;
  science: StoryboardScienceCheckpoint;
  art: { state: 'not_started' | 'submitting' | 'rejected'; executionAttempt: number; rejectedCandidates: StoryboardArtRejection[] };
};
type StoryboardArtCorrection = {
  schemaVersion: 1;
  authorizationRequestDigest: string;
  executionAttempt: number;
  originalCandidateHash: string;
  originalReviewResponseHash: string;
  artSubmittedExecutionAttempt?: number;
  planned?: StoryboardPlan;
  reviewSubmittedExecutionAttempt?: number;
  review?: StoryboardReview;
  reviewDesignSkills?: DesignSkillUsage[];
};

function privateStoryboardResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {};
  return Object.fromEntries(['storyboardCheckpoint', 'storyboardPlanningCheckpoint', 'storyboardReview', 'storyboardAcceptanceCheckpoint', 'storyboardArtCorrection',
    'sourceMapRef', 'nativeIllustrationContext', 'nativeIllustration', 'illustrationPrompts']
    .filter(key => Object.hasOwn(result, key)).map(key => [key, (result as Record<string, unknown>)[key]]));
}

function storyboardScience(document: StoryboardDocument) {
  return { ...document, scenes: document.scenes.map(scene => {
    const { visualAction: _visualAction, illustration, ...rest } = scene;
    if (!illustration) return rest;
    const { composition: _composition, treatment: _treatment, ...science } = illustration;
    return { ...rest, illustration: science };
  }) };
}

/** The original blocked plan stays immutable; this separately saved candidate has no approval until reviewed. */
function readStoryboardArtCorrection(result: unknown, original: StoryboardDocument,
  identity: StoryboardCheckpointIdentity, taskId: string, executionAttempt: number): StoryboardArtCorrection | undefined {
  const raw = result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>).storyboardArtCorrection : undefined;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['schemaVersion', 'authorizationRequestDigest', 'executionAttempt', 'originalCandidateHash',
      'originalReviewResponseHash', 'artSubmittedExecutionAttempt', 'planned', 'reviewSubmittedExecutionAttempt', 'review', 'reviewDesignSkills'].includes(key)))
    throw new Error('[blocked] Storyboard art correction checkpoint is invalid');
  const saved = raw as StoryboardArtCorrection;
  if (saved.schemaVersion !== 1 || saved.executionAttempt !== executionAttempt
    || ![saved.authorizationRequestDigest, saved.originalCandidateHash, saved.originalReviewResponseHash]
      .every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash))
    || saved.originalCandidateHash !== createHash('sha256').update(JSON.stringify(original)).digest('hex')
    || (saved.artSubmittedExecutionAttempt !== undefined && saved.artSubmittedExecutionAttempt !== executionAttempt)
    || (saved.reviewSubmittedExecutionAttempt !== undefined && saved.reviewSubmittedExecutionAttempt !== executionAttempt))
    throw new Error('[blocked] Storyboard art correction identity changed');
  const planned = saved.planned === undefined ? undefined
    : readStoryboardCheckpoint({ storyboardCheckpoint: { ...identity, planned: saved.planned } }, identity);
  if ((planned && (saved.artSubmittedExecutionAttempt !== executionAttempt || planned.reviewFormat !== 2
      || !isDeepStrictEqual(storyboardScience(planned.document), storyboardScience(original))))
    || (saved.reviewSubmittedExecutionAttempt !== undefined && !planned))
    throw new Error('[blocked] Art correction changed scientific content or lacks a submission');
  if (saved.review) {
    const review = saved.review;
    if (!planned || saved.reviewSubmittedExecutionAttempt !== executionAttempt
      || review.stage !== 'final-brief' || review.requestId !== taskId || !['accepted', 'blocked'].includes(review.decision)
      || review.sourceEvidenceIdentity !== identity.sourceEvidenceIdentity
      || review.candidateHash !== createHash('sha256').update(JSON.stringify(planned.document)).digest('hex')
      || ![review.promptHash, review.responseHash].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash))
      || !review.summary?.trim()) throw new Error('[blocked] Art correction final review changed');
  }
  return { ...saved, ...(planned ? { planned } : {}),
    ...(saved.reviewDesignSkills ? { reviewDesignSkills: readDesignSkillUsage(saved.reviewDesignSkills) } : {}) };
}

async function requireNarrativeOriginals(prisma: Pick<Prisma.TransactionClient, 'presentationAsset'>,
  payload: PresentationGenerationPayload, document: Pick<StoryboardDocument, 'narrative'> & {
    scenes: readonly Pick<StoryboardDocument['scenes'][number], 'paperOriginal' | 'sourceClaimIds'>[] }) {
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

function readDesignSkillUsage(value: unknown): DesignSkillUsage[] | undefined {
  if (value !== undefined && (!Array.isArray(value)
    || value.some(usage => !usage || typeof usage !== 'object' || Array.isArray(usage)
      || Object.keys(usage).some(key => !['id', 'resources', 'upstreamCommit', 'version'].includes(key))
      || typeof usage.id !== 'string' || !usage.id.trim()
      || !Array.isArray(usage.resources) || usage.resources.some((resource: unknown) => typeof resource !== 'string')
      || (usage.upstreamCommit !== undefined && typeof usage.upstreamCommit !== 'string')
      || (usage.version !== undefined && typeof usage.version !== 'string'))))
    throw new Error('[blocked] Saved storyboard skill provenance is invalid');
  return value as DesignSkillUsage[] | undefined;
}

/** This worker-only task.result field is omitted by the public task projection. */
function readStoryboardCheckpoint(result: unknown, expected: StoryboardCheckpointIdentity): StoryboardPlan | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !Object.hasOwn(result, 'storyboardCheckpoint')) return undefined;
  const saved = (result as Record<string, unknown>).storyboardCheckpoint;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('[blocked] Saved storyboard checkpoint is invalid');
  const checkpoint = saved as Record<string, unknown>;
  if (Object.hasOwn(result, 'storyboardPlanningCheckpoint')) throw new Error('[blocked] Partial and complete storyboard checkpoints cannot coexist');
  if (Object.keys(checkpoint).filter(key => key !== 'executionAttempt').sort().join(',') !== (expected.narrativeSourceIdentity === undefined
      ? 'baseIdentity,claimContent,payload,planned,sourceEvidenceIdentity'
      : 'baseIdentity,claimContent,narrativeSourceIdentity,payload,planned,sourceEvidenceIdentity')
    || (checkpoint.executionAttempt !== undefined && (!Number.isSafeInteger(checkpoint.executionAttempt) || Number(checkpoint.executionAttempt) < 1))
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
  return {
    document: parseStoryboardDocument(planned.document, expected.payload.sourceClaimIds, expected.payload.storyboard?.output ?? 'image',
      { nativeNarrativeVideo: expected.payload.storyboard?.output === 'video' && expected.payload.storyboard.narrative === true }),
    promptHash: planned.promptHash,
    designSkills: readDesignSkillUsage(planned.designSkills),
    ...(planned.reviewFormat === 2 ? { reviewFormat: 2 as const } : {}),
  };
}

function readStoryboardPlanningCheckpoint(result: unknown, expected: StoryboardCheckpointIdentity): StoryboardPlanningCheckpoint | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Object.hasOwn(result, 'storyboardPlanningCheckpoint')) return undefined;
  const saved = (result as Record<string, unknown>).storyboardPlanningCheckpoint as StoryboardPlanningCheckpoint;
  if (Object.keys(result).join(',') !== 'storyboardPlanningCheckpoint' || !saved || typeof saved !== 'object' || Array.isArray(saved)
    || Object.keys(saved).sort().join(',') !== [...Object.keys(expected), 'schemaVersion', 'science', 'art'].sort().join(',')
    || saved.schemaVersion !== 1 || Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(saved[key as keyof typeof saved], value))
    || !saved.science || Object.keys(saved.science).sort().join(',') !== 'designSkills,intent'
    || !saved.science.intent || !Array.isArray(saved.science.intent.scenes)
    || !saved.art || Object.keys(saved.art).sort().join(',') !== 'executionAttempt,rejectedCandidates,state'
    || !['not_started', 'submitting', 'rejected'].includes(saved.art.state) || !Number.isSafeInteger(saved.art.executionAttempt) || saved.art.executionAttempt < 1
    || !Array.isArray(saved.art.rejectedCandidates) || saved.art.rejectedCandidates.length > 3
    || (saved.art.state === 'not_started' && saved.art.rejectedCandidates.length !== 0)
    || (saved.art.state === 'rejected' && saved.art.rejectedCandidates.length === 0)
    || saved.art.rejectedCandidates.some((candidate, index, list) => !candidate || typeof candidate !== 'object'
      || Object.keys(candidate).some(key => !['structuredAttempt', 'kind', 'text', 'diagnostic'].includes(key))
      || !Number.isInteger(candidate.structuredAttempt) || candidate.structuredAttempt < 1 || candidate.structuredAttempt > 3
      || (index > 0 && candidate.structuredAttempt <= list[index - 1]!.structuredAttempt)
      || !['json_parse', 'schema_validation'].includes(candidate.kind) || typeof candidate.text !== 'string' || candidate.text.length > 131_072
      || (candidate.diagnostic !== undefined && (typeof candidate.diagnostic !== 'string' || candidate.diagnostic.length > 512))))
    throw new Error('[blocked] Saved science/art planning checkpoint is invalid');
  readDesignSkillUsage(saved.science.designSkills);
  return saved;
}

async function readCurrentPlanningContinuation(prisma: Pick<Prisma.TransactionClient, 'auditLog' | 'hermesResearchRun'>,
  owner: { id: string; executionAttempt: number; retryCount: number; payload: unknown }, payload: PresentationGenerationPayload, actorId: string) {
  if (!payload.hermesRunAuthority || payload.hermesRunAuthority.stage !== 'storyboard') return null;
  const receipts = await prisma.auditLog.findMany({ where: { action: 'hermes.research_run.generation_retry', targetType: 'hermes_research_run',
    targetId: payload.hermesRunAuthority.runId, actorId, AND: [
      { metadata: { path: ['taskId'], equals: owner.id } },
      { metadata: { path: ['authorizedExecutionAttempt'], equals: owner.executionAttempt } },
      { OR: [{ metadata: { path: ['planningFailureClass'], equals: 'art_only_structured_retry' } },
        { metadata: { path: ['planningFailureClass'], equals: 'fresh_art_after_unknown' } },
        { metadata: { path: ['planningFailureClass'], equals: 'full_planning_restart' } }] },
    ] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 2 });
  const receipt = receipts[0]; const meta = receipt?.metadata as Record<string, unknown> | undefined;
  if (!meta || !['art_only_structured_retry', 'fresh_art_after_unknown', 'full_planning_restart'].includes(String(meta.planningFailureClass))) return null;
  const run = await prisma.hermesResearchRun.findUnique({ where: { id: payload.hermesRunAuthority.runId } });
  if (receipts.length !== 1 || !run || run.actorId !== actorId || run.status !== 'generating_storyboard'
    || run.maxAgentTasks !== meta.maxAgentTasks || meta.previousMaxAgentTasks !== meta.maxAgentTasks
    || meta.correction !== 'storyboard_planning_retry' || meta.previousExecutionAttempt !== owner.executionAttempt - 1
    || meta.previousRetryCount !== owner.retryCount - 1 || meta.authorizedRetryCount !== owner.retryCount
    || meta.newTaskCount !== 0 || meta.chargeableAttempts !== 1 || meta.noProviderSwitch !== true
    || !isDeepStrictEqual(meta.taskPayload, owner.payload) || !Array.isArray(meta.planningAuditIds)
    || meta.planningAuditIds.some(id => typeof id !== 'string') || !Array.isArray(meta.planningAudits))
    throw new Error('[blocked] Planning continuation receipt changed');
  const calls = await prisma.auditLog.findMany({ where: { requestId: owner.id, action: 'ai.gateway.call',
    id: { in: meta.planningAuditIds as string[] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!isDeepStrictEqual(meta.planningAuditIds, calls.map(call => call.id))
    || !isDeepStrictEqual(meta.planningAudits, calls.map(call => ({ id: call.id, actorId: call.actorId, targetType: call.targetType,
      createdAt: call.createdAt.toISOString(), metadata: call.metadata })))) throw new Error('[blocked] Planning continuation audit history changed');
  if (meta.planningFailureClass === 'fresh_art_after_unknown') {
    const last = calls.at(-1); const failure = last?.metadata as Record<string, unknown> | undefined;
    if (meta.priorSubmission !== 'outcome_unknown_after_provider_timeout'
      || meta.previousError !== 'Primary provider failed; automatic fallback is disabled for this request'
      || !last || last.createdAt >= receipt!.createdAt || failure?.operation !== 'text'
      || failure.outcome !== 'failed' || failure.error !== 'provider_timeout' || failure.fallbackReason !== null)
      throw new Error('[blocked] Fresh art continuation lost its prior timeout receipt');
  }
  return { receipt, metadata: meta };
}

/** Older full-plan receipts predate the worker-only checkpoint execution marker. */
async function requireLegacyStoryboardCheckpointResume(prisma: Prisma.TransactionClient,
  owner: { id: string; executionAttempt: number; retryCount: number }, payload: PresentationGenerationPayload,
  actorId: string, identity: StoryboardCheckpointIdentity, planned: StoryboardPlan) {
  if (payload.hermesRunAuthority?.stage !== 'storyboard' || owner.retryCount !== owner.executionAttempt - 1)
    throw new Error('[blocked] Saved storyboard requires explicit recovery authorization');
  const step = await prisma.hermesResearchStep.findFirst({ where: { runId: payload.hermesRunAuthority.runId, stage: 'storyboard', ordinal: 0,
    agentTaskId: owner.id, status: 'running', presentationAssetId: null } });
  const receipts = await prisma.auditLog.findMany({ where: { actorId, targetType: 'hermes_research_run', targetId: payload.hermesRunAuthority.runId,
    action: { in: ['hermes.research_run.storyboard_checkpoint_resume', 'hermes.research_run.storyboard_output_resume'] },
    AND: [{ metadata: { path: ['taskId'], equals: owner.id } },
      { metadata: { path: ['previousExecutionAttempt'], equals: owner.executionAttempt - 1 } }] }, take: 2 });
  const receipt = receipts[0]; const meta = receipt?.metadata as Record<string, unknown> | undefined;
  const output = receipt?.action === 'hermes.research_run.storyboard_output_resume';
  if (!step || receipts.length !== 1 || !meta || meta.recoveryClass !== undefined || meta.stepId !== step.id
    || meta.taskId !== owner.id || meta.previousExecutionAttempt !== owner.executionAttempt - 1
    || (output ? owner.executionAttempt !== 3 || meta.previousError !== 'Provider exhausted output allowance before producing text'
      : ![2, 3].includes(owner.executionAttempt) || meta.previousError !== '[blocked] Illustration review sources exceed the input budget; select fewer Claims')
    || meta.planningPromptHash !== planned.promptHash || meta.sourceEvidenceIdentity !== identity.sourceEvidenceIdentity
    || meta.narrativeSourceIdentity !== identity.narrativeSourceIdentity || meta.noReplanning !== true || meta.newTaskCount !== 0 || meta.noProviderSwitch !== true)
    throw new Error('[blocked] Saved storyboard recovery receipt is missing or changed');
  if (output) {
    const call = typeof meta.truncationAuditId === 'string' ? await prisma.auditLog.findUnique({ where: { id: meta.truncationAuditId } }) : null;
    const failure = call?.metadata as Record<string, unknown> | undefined;
    if (!call || call.requestId !== owner.id || call.actorId !== null || call.targetType !== 'ai_gateway' || call.createdAt >= receipt!.createdAt
      || failure?.operation !== 'scientific_review' || failure.outcome !== 'failed' || failure.error !== 'provider_empty'
      || failure.finishReason !== 'length' || failure.maxOutputTokens !== 16384 || failure.outputTokens !== 16384
      || failure.inputContentHash !== identity.sourceEvidenceIdentity || failure.fallbackReason !== null || failure.retryCount !== 0
      || meta.continuedOutputAllowance !== 32768) throw new Error('[blocked] Saved storyboard output receipt lost its truncation proof');
  }
}

/** An art correction is a candidate, never an approval of the resulting scientific meaning. */
function readStoryboardAcceptance(result: unknown, original: StoryboardDocument,
  expected: StoryboardCheckpointIdentity, taskId: string): StoryboardAcceptance | undefined {
  const raw = result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>).storyboardAcceptanceCheckpoint : undefined;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['document', 'firstReview', 'submittedExecutionAttempt', 'review', 'designSkills'].includes(key)))
    throw new Error('[blocked] Invalid storyboard acceptance checkpoint');
  const saved = raw as StoryboardAcceptance;
  const document = parseStoryboardDocument(saved.document, expected.payload.sourceClaimIds, 'image');
  const validateReview = (review: StoryboardReview, candidate: StoryboardDocument) => {
    if (!review || review.stage !== 'final-brief' || review.requestId !== taskId
      || review.sourceEvidenceIdentity !== expected.sourceEvidenceIdentity
      || review.candidateHash !== createHash('sha256').update(JSON.stringify(candidate)).digest('hex')
      || !/^[a-f0-9]{64}$/u.test(review.promptHash) || !/^[a-f0-9]{64}$/u.test(review.responseHash)
      || !['accepted', 'blocked', 'revised'].includes(review.decision) || !review.summary?.trim())
      throw new Error('[blocked] Storyboard acceptance receipt changed');
  };
  validateReview(saved.firstReview, original);
  if (saved.firstReview.decision !== 'revised' || !isDeepStrictEqual(storyboardScience(original), storyboardScience(document))
    || isDeepStrictEqual(original, document)
    || (saved.submittedExecutionAttempt !== undefined && (!Number.isSafeInteger(saved.submittedExecutionAttempt) || saved.submittedExecutionAttempt < 1)))
    throw new Error('[blocked] Storyboard acceptance inputs changed');
  if (saved.review) {
    if (saved.submittedExecutionAttempt === undefined) throw new Error('[blocked] Storyboard acceptance submission is missing');
    validateReview(saved.review, document);
  }
  return { ...saved, document, designSkills: readDesignSkillUsage(saved.designSkills) };
}

type StoryboardPlanningContext = {
  base: Awaited<ReturnType<typeof requireStoryboardBase>>;
  revision: Awaited<ReturnType<typeof requireStoryboardRevisionTask>>;
  imageRevision: Awaited<ReturnType<typeof requireStoryboardImageRevision>>;
  revisionContext?: StoryboardPlanningContext;
  identity: string | null;
};
async function readStoryboardPlanningContext(
  prisma: Pick<Prisma.TransactionClient, 'presentationAsset' | 'agentTask' | 'hermesResearchRun' | 'auditLog'>,
  payload: PresentationGenerationPayload,
  actorId: string,
  depth = 0,
  historicalTaskId?: string,
): Promise<StoryboardPlanningContext> {
  if (depth > 2) throw new Error('[blocked] Storyboard revision depth exceeded');
  const base = await requireStoryboardBase(prisma, payload);
  const revision = await requireStoryboardRevisionTask(prisma, payload, actorId);
  const imageRevision = await requireStoryboardImageRevision(prisma, payload, actorId, historicalTaskId);
  const revisionContext = revision ? await readStoryboardPlanningContext(prisma, revision.payload, actorId, depth + 1, revision.task.id) : undefined;
  return { base, revision, imageRevision, revisionContext,
    identity: imageRevision ? imageRevision.identity
      : revision ? JSON.stringify({ revision: revision.identity, base: revisionContext?.identity ?? null }) : base?.identity ?? null };
}


function requireStoryboardSourceSupport(document: StoryboardDocument, claims: readonly PresentationClaim[],
  paperOriginals?: ReadonlyMap<string, { assetId: string; objectKey: string; contentHash: string }>): void {
  for (const scene of document.scenes) {
    if (scene.illustration) requireIllustrationSourceSupport(scene.illustration, claims, paperOriginals);
  }
}

function hasStoryboardSourceSupport(document: StoryboardDocument, claims: readonly PresentationClaim[],
  paperOriginals?: ReadonlyMap<string, { assetId: string; objectKey: string; contentHash: string }>): boolean {
  try {
    requireStoryboardSourceSupport(document, claims, paperOriginals);
    return true;
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'SOURCE_CLAIM_INVALID') return false;
    throw error;
  }
}

async function requireIllustrationOriginalArtifacts(prisma: Pick<Prisma.TransactionClient, 'artifact'>,
  evidence: Awaited<ReturnType<typeof readReviewedPresentationEvidence>>, workspaceId: string) {
  const artifactIds = [...new Set(evidence.map(row => row.artifactId))];
  if (artifactIds.some(id => !id)) throw new Error('[blocked] Illustration evidence needs an original artifact');
  const originals = await prisma.artifact.findMany({ where: { id: { in: artifactIds as string[] }, workspaceId, deletedAt: null, bytesPurgedAt: null }, select: { id: true } });
  if (originals.length !== artifactIds.length) throw new Error('[blocked] Illustration source was deleted or moved');
}

function needsGeneratedImageReview(payload: PresentationGenerationPayload): boolean {
  return Boolean(payload.sceneImage && generatedSceneImageRequiresPixelReview(payload));
}

function authorizedIllustrationPlan(payload: PresentationGenerationPayload, result: unknown): boolean {
  return payload.kind === 'interactive_html' && (payload.storyboard?.output === 'image'
    || (supportsNativeIllustration(payload) && readNativeAgentExecution(result)?.profile === 'paper-illustration'));
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
    || !(authorizedIllustrationPlan(payload, owner.result)
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
    || (source.kind !== 'illustration-plan' && (snapshot.outputResumeReceiptId !== undefined || snapshot.outputResumeMode !== undefined
      || snapshot.outputResumeTarget !== undefined || snapshot.outputResumeSubmissionAttempt !== undefined))
    || input.requestId !== input.authorizationContext.taskId) throw new Error('[blocked] Invalid illustration review submission');
  const { owner, payload } = await requireIllustrationReviewAuthority(prisma, input.authorizationContext);
  const nativeReview = readNativeImageReviewCheckpoint(owner.result);
  if (source.kind === 'illustration-image' ? Boolean(nativeReview) !== (snapshot.imageReviewMode === 'model-native')
    : snapshot.imageReviewMode !== undefined) throw new Error('[blocked] Image review role changed');
  const planningContinuation = source.kind === 'illustration-plan'
    ? await readCurrentPlanningContinuation(prisma, owner, payload, input.authorizationContext.actorId) : null;
  const savedOutputResume = snapshot.outputResumeMode === 'saved-final-review' && payload.hermesRunAuthority
    ? await requirePixelStoryboardOutputResume(prisma, { runId: payload.hermesRunAuthority.runId, actorId: input.authorizationContext.actorId,
      taskId: owner.id, receiptId: snapshot.outputResumeReceiptId, mode: 'saved-final-review',
      submissionAttempt: snapshot.outputResumeSubmissionAttempt }) : undefined;
  if (savedOutputResume ? snapshot.primaryProviderOnly !== true || typeof snapshot.outputResumeReceiptId !== 'string'
    || !Number.isSafeInteger(snapshot.outputResumeSubmissionAttempt) || snapshot.outputResumeSubmissionAttempt! < 1
    || !isDeepStrictEqual(snapshot.outputResumeTarget, { provider: savedOutputResume.metadata.reviewProvider,
      model: savedOutputResume.metadata.reviewModel, promptHash: savedOutputResume.metadata.reviewPromptHash })
    : snapshot.outputResumeMode !== undefined || snapshot.outputResumeTarget !== undefined || snapshot.outputResumeSubmissionAttempt !== undefined)
    throw new Error('[blocked] Saved review continuation target changed');
  const artAuthorized = source.kind === 'illustration-plan' && owner.result && typeof owner.result === 'object'
    && !Array.isArray(owner.result) && Object.hasOwn(owner.result, 'storyboardArtCorrection');
  if (artAuthorized) await requireStoryboardArtCorrectionAuthorization(prisma, {
    taskId: owner.id, actorId: input.authorizationContext.actorId, workspaceId: input.authorizationContext.workspaceId,
    payload, executionAttempt: owner.executionAttempt, retryCount: owner.retryCount, result: owner.result,
  });
  else if (source.kind === 'illustration-plan' && !planningContinuation && !savedOutputResume && (owner.executionAttempt > 3
    || (owner.executionAttempt === 3 && owner.retryCount !== 2))) throw new Error('[blocked] Illustration review continuation is unavailable');
  if (source.kind === 'illustration-image' ? !needsGeneratedImageReview(payload)
    : !authorizedIllustrationPlan(payload, owner.result)) {
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
  } else {
    const planning = await readStoryboardPlanningContext(prisma, payload, input.authorizationContext.actorId);
    const pixel = payload.hermesRunAuthority ? await readNarrativePixelReplanAuthority(prisma, {
      runId: payload.hermesRunAuthority.runId, actorId: input.authorizationContext.actorId,
    }) : null;
    if (pixel && (snapshot.primaryProviderOnly !== true || pixel.task.id !== owner.id || pixel.baseIdentity !== planning.identity))
      throw new Error('[blocked] Narrative scientific revision review authority changed');
    if (!savedOutputResume && (snapshot.outputResumeReceiptId !== undefined || (pixel && owner.executionAttempt === 3 && !artAuthorized && !planningContinuation))) {
      if (!pixel || owner.executionAttempt !== 3 || snapshot.primaryProviderOnly !== true
        || typeof snapshot.outputResumeReceiptId !== 'string' || !snapshot.outputResumeReceiptId)
        throw new Error('[blocked] Pixel storyboard output continuation receipt is required');
      await requirePixelStoryboardOutputResume(prisma, { runId: pixel.run.id, actorId: input.authorizationContext.actorId,
        taskId: owner.id, receiptId: snapshot.outputResumeReceiptId });
    }
    if (planning.identity !== snapshot.baseIdentity
      || (planning.imageRevision && planning.imageRevision.sourceEvidenceIdentity !== source.sourceEvidenceIdentity))
      throw new Error('[blocked] Illustration base or reviewed image evidence changed');
  }
  if (source.kind === 'illustration-plan') {
    // Metadata only under the existing submission transaction. SourceMap bytes were
    // loaded outside it; re-use the exact source identity saved with this candidate.
    const currentSource = await readReviewedVisualContextSource(prisma, {
      userId: input.authorizationContext.actorId, workspaceId: input.authorizationContext.workspaceId,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds,
    }, payload, claims, evidence, owner.result);
    const identity = {
      payload, sourceEvidenceIdentity: source.sourceEvidenceIdentity,
      claimContent: snapshot.claimContent, baseIdentity: snapshot.baseIdentity,
      ...(currentSource ? { narrativeSourceIdentity: currentSource.identity } : {}),
    };
    if (planningContinuation && (snapshot.primaryProviderOnly !== true
      || Object.entries(identity).some(([key, value]) => key !== 'payload' && !isDeepStrictEqual(planningContinuation.metadata[key], value))))
      throw new Error('[blocked] Planning continuation review source changed');
    const saved = readStoryboardCheckpoint(owner.result, identity);
    if (!saved) throw new Error('[blocked] Illustration review candidate checkpoint is missing');
    const checkpoint = (owner.result as Record<string, unknown>).storyboardCheckpoint as Record<string, unknown>;
    if (owner.executionAttempt > 1 && checkpoint.executionAttempt !== owner.executionAttempt
      && !artAuthorized && !planningContinuation && !savedOutputResume && snapshot.outputResumeReceiptId === undefined)
      await requireLegacyStoryboardCheckpointResume(prisma, owner, payload, input.authorizationContext.actorId, identity, saved);
    const acceptance = readStoryboardAcceptance(owner.result, saved.document, identity, owner.id);
    const art = readStoryboardArtCorrection(owner.result, saved.document, identity, owner.id, owner.executionAttempt);
    if (art && (!artAuthorized || snapshot.primaryProviderOnly !== true || acceptance || !art.planned || art.review
      || art.reviewSubmittedExecutionAttempt !== owner.executionAttempt))
      throw new Error('[blocked] Art correction review submission is not current');
    if (acceptance && (acceptance.review || acceptance.submittedExecutionAttempt !== owner.executionAttempt))
      throw new Error('[blocked] Illustration acceptance submission is not current');
    const candidate = art?.planned?.document ?? acceptance?.document ?? saved.document;
    if (Boolean(candidate.narrative) !== Boolean(payload.storyboard?.narrative)
      || createHash('sha256').update(JSON.stringify(candidate)).digest('hex') !== source.candidateHash)
      throw new Error('[blocked] Illustration review candidate does not match its saved context');
    await requireNarrativeOriginals(prisma, payload, candidate);
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

async function resolveStoryboardOriginals(deps: Parameters<TaskHandler>[0], payload: PresentationGenerationPayload) {
  if (!payload.storyboard || !deps.storage) throw new Error('[blocked] Storyboard source scope is unavailable');
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
  return paperOriginals;
}

export function createPresentationGenerationHandler(options: { gateway?: Pick<AiGateway, 'completeStructured'> & Partial<Pick<AiGateway, 'reviewScientific' | 'resumeScientificReviewFromCompletedResult' | 'generateImage' | 'canResumeImageBeforeSubmission' | 'canResumeImageFromCompletedResult' | 'resumeImageFromCompletedResult'>>; mediaGenerator?: PresentationMediaGenerator; videoSpool?: PresentationVideoSpool;
  nativeAgent?: { gateway: AiGateway; inboxRoot: string; renderPages(input: { artifactId: string; contentHash: string; content: Buffer; mediaType: 'application/pdf' }, pages: number[]): Promise<NativePaperImage[]> } } = {}): TaskHandler {
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
    const nativeExecution = readNativeAgentExecution(owner.result);
    if (nativeExecution && (nativeExecution.profile !== 'paper-illustration' || !options.nativeAgent || !payload.storyboard?.narrative))
      throw new Error('[blocked] Native illustration runtime is unavailable');
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
    const technicalParent = payload.hermesRunAuthority?.stage === 'scene_image' && payload.hermesRunAuthority.profile === VISUAL_NARRATIVE_PROFILE
      ? await readNarrativePixelReplanAuthority(deps.prisma, { runId: payload.hermesRunAuthority.runId, actorId: scope.userId }) : null;
    const technicalRecovery = technicalParent?.technicalRecovery;
    const technicalReplacement = technicalRecovery?.replacements.find(item => item.newTaskId === task.id);
    const manualReviewCopy = Boolean((existing?.provenance as Record<string, unknown> | null)?.reviewSourceAssetId)
      && technicalReplacement?.mode !== 'review_only';
    if (technicalReplacement?.mode === 'review_only' && !existing)
      throw new Error('[blocked] Saved PNG review replacement has no current receipt');
    if (manualReviewCopy) await requireManualSceneImageReviewReceipt(deps.prisma,
      { taskId: task.id, actorId: scope.userId, payload });
    const requireTechnicalRecovery = async (tx: Prisma.TransactionClient) => {
      if (!technicalRecovery || !payload.hermesRunAuthority) return;
      await requireHermesAuthority(tx);
      const current = await readNarrativePixelReplanAuthority(tx, { runId: payload.hermesRunAuthority.runId, actorId: scope.userId });
      const currentTask = await tx.agentTask.findUnique({ where: { id: task.id } });
      if (current?.technicalRecovery?.receipt.id !== technicalRecovery.receipt.id || !currentTask || currentTask.status !== 'running'
        || currentTask.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(currentTask.payload, owner.payload))
        throw new Error('[blocked] Narrative technical recovery changed');
    };
    const actualImageReview = needsGeneratedImageReview(payload);
    if (existing && !actualImageReview) return { ...privateStoryboardResult(owner.result), assetId: existing.id, kind: existing.kind,
      status: existing.status, contentHash: existing.contentHash, sourceClaimIds: payload.sourceClaimIds };
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
      const native = readNativeImageReviewCheckpoint(owner.result);
      const marker = { hermesRecovery: HERMES_AUTHORITY_REARM_MARKER, ...(native ? { nativeImageReview: native } : {}) };
      if (native && native.state !== 'not_started' || !isDeepStrictEqual(owner.result, marker))
        throw new Error('[blocked] Hermes authority retry marker is invalid');
      const consumed = await deps.prisma.agentTask.updateMany({ where: {
        id: task.id, status: 'running', executionAttempt: task.executionAttempt, retryCount: 1,
        result: { equals: marker as Prisma.InputJsonObject },
      }, data: { result: native ? { nativeImageReview: native } as Prisma.InputJsonObject : Prisma.DbNull } });
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
    const illustrationEvidence = payload.storyboard || payload.sceneImage
      ? await projectIllustrationEvidence(deps.storage, sourceEvidence) : sourceEvidence;
    const claims = canonicalPresentationClaims(claimRows.map((claim) => ({ ...claim,
      sourcePassages: illustrationEvidence.filter((row) => row.claimId === claim.id)
        .map((row) => ({ evidenceId: row.id, text: row.exactQuote!, relation: row.relation })),
    })) as PresentationClaim[]);
    const narrativeScope = { userId: scope.userId, workspaceId: researchObject.workspaceId,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceClaimIds: payload.sourceClaimIds };
    const sourceMetadata = await readReviewedVisualContextSource(deps.prisma, narrativeScope, payload, claimRows, sourceEvidence, owner.result);
    const narrativeSource = sourceMetadata
      ? await resolveVisualNarrativeSource({ prisma: deps.prisma, storage: deps.storage }, narrativeScope, sourceEvidence) : undefined;
    if (narrativeSource && narrativeSource.identity !== sourceMetadata?.identity)
      throw new Error('[blocked] Reviewed paper source changed during illustration planning');
    const requireUnchangedEvidence = async (prisma: Pick<Prisma.TransactionClient, 'evidenceRecord' | 'version' | 'claimNode' | 'ingestionTask' | 'presentationAsset'>) => {
      if (scientificMedia && presentationEvidenceIdentity(await readReviewedPresentationEvidence(prisma, payload, lineageByClaim)) !== sourceEvidenceIdentity) {
        throw new Error('[blocked] Reviewed source evidence changed during media generation');
      }
      if (narrativeSource && (await readVisualNarrativeSource(prisma, narrativeScope)).identity !== narrativeSource.identity)
        throw new Error('[blocked] Reviewed paper source changed during illustration planning');
      if (storyboardDocument) await requireNarrativeOriginals(prisma, payload, storyboardDocument);
    };
    const planningContext = await readStoryboardPlanningContext(deps.prisma, payload, scope.userId);
    const pixelAuthority = payload.hermesRunAuthority?.stage === 'storyboard'
      ? await readNarrativePixelReplanAuthority(deps.prisma, { runId: payload.hermesRunAuthority.runId, actorId: scope.userId }) : null;
    const pixelRecovery = pixelAuthority ? { receiptId: pixelAuthority.receipt.id,
      claimContent: pixelAuthority.metadata.claimContent, narrativeSourceIdentity: pixelAuthority.metadata.narrativeSourceIdentity } : undefined;
    const planningContinuation = await readCurrentPlanningContinuation(deps.prisma, owner, payload, scope.userId);
    const savedOutputReceipt = payload.hermesRunAuthority?.stage === 'storyboard' ? await deps.prisma.auditLog.findFirst({ where: {
      action: 'hermes.research_run.storyboard_output_resume', targetType: 'hermes_research_run', targetId: payload.hermesRunAuthority.runId,
      actorId: scope.userId, AND: [{ metadata: { path: ['taskId'], equals: task.id } },
        { metadata: { path: ['authorizedExecutionAttempt'], equals: task.executionAttempt } },
        { metadata: { path: ['recoveryClass'], equals: 'saved_storyboard_review_timeout' } }] } }) : null;
    const savedOutputResume = savedOutputReceipt ? await requirePixelStoryboardOutputResume(deps.prisma, {
      runId: payload.hermesRunAuthority!.runId, actorId: scope.userId, taskId: task.id, receiptId: savedOutputReceipt.id,
      mode: 'saved-final-review', beforeFirstSubmission: true }) : undefined;
    let requirePlanningContinuationUnchanged: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;
    let requireStandaloneScienceRecoveryUnchanged: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;
    let pixelPlanningRearm: Awaited<ReturnType<typeof requirePixelPlanningPreProviderRearm>> | undefined;
    let pixelOutputResume: Awaited<ReturnType<typeof requirePixelStoryboardOutputResume>> | undefined;
    let pixelPlanningFailureClass: 'pixel_storyboard_pre_provider_rearm' | 'pixel_storyboard_art_provider_timeout' | undefined;
    let pixelPlanningStarted = false;
    if (pixelAuthority && (pixelAuthority.task.id !== task.id || !isDeepStrictEqual(pixelAuthority.payload, payload)
      || pixelAuthority.baseIdentity !== planningContext.identity || pixelAuthority.metadata.sourceEvidenceIdentity !== sourceEvidenceIdentity))
      throw new Error('[blocked] Narrative scientific revision task changed');
    if (pixelRecovery && (pixelRecovery.claimContent !== presentationClaimContent(claims)
      || pixelRecovery.narrativeSourceIdentity !== narrativeSource?.identity)) {
      throw new Error('[blocked] Narrative pixel-feedback recovery source changed');
    }
    if (planningContext.imageRevision && planningContext.imageRevision.sourceEvidenceIdentity !== sourceEvidenceIdentity)
      throw new Error('[blocked] Reviewed image evidence changed before scientific replanning');
    const sourceSupportProof = pixelAuthority?.metadata.cause === 'storyboard_source_support_invalid'
      ? pixelAuthority.metadata.sourceProof as { invalidBases: Array<{ sceneIndex: number; subjectIndex: number; basis: { evidenceId: string } }> } : undefined;
    const sourceSupportFeedback = sourceSupportProof?.invalidBases.map(item =>
      `Scene ${item.sceneIndex + 1}, subject ${item.subjectIndex + 1}: Evidence ${item.basis.evidenceId} resolves to a SourceMap heading, not a supporting original passage for this subject.`).join('\n');
    const revisionReview = planningContext.revision?.task.result as { storyboardReview?: { summary?: string } } | null | undefined;
    const previousDefectReport = sourceSupportFeedback ?? planningContext.imageRevision?.feedback
      ?? revisionReview?.storyboardReview?.summary ?? planningContext.revision?.feedback;
    const requirePixelRecoveryUnchanged = async (tx: Prisma.TransactionClient) => {
      if (!pixelRecovery || !pixelAuthority) return;
      const current = await requireIllustrationReviewAuthority(tx, { taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId });
      const authority = await readNarrativePixelReplanAuthority(tx, { runId: pixelAuthority.run.id, actorId: scope.userId });
      const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
        researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      if (current.owner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(current.owner.payload, owner.payload)
        || authority?.receipt.id !== pixelRecovery.receiptId || !isDeepStrictEqual(authority.currentMetadata, pixelAuthority.currentMetadata)
        || currentClaims.length !== payload.sourceClaimIds.length || currentClaims.some(claim => claim.extractionStatus !== 'succeeded')
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== pixelRecovery.claimContent
        || (await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== planningContext.identity)
        throw new Error('[blocked] Narrative pixel-feedback recovery changed before planning or review');
      if (pixelPlanningRearm && !isDeepStrictEqual(await requirePixelPlanningPreProviderRearm(tx, authority!, pixelPlanningFailureClass), pixelPlanningRearm))
        throw new Error('[blocked] Narrative planning recovery receipt changed');
      if (pixelOutputResume && !isDeepStrictEqual(await requirePixelStoryboardOutputResume(tx, { runId: pixelAuthority.run.id,
        actorId: scope.userId, taskId: task.id, receiptId: pixelOutputResume.id }), pixelOutputResume))
        throw new Error('[blocked] Pixel storyboard output continuation receipt changed');
      if (pixelPlanningRearm && !pixelPlanningStarted && await tx.auditLog.count({ where: { requestId: task.id, action: 'ai.gateway.call',
        id: { notIn: pixelPlanningRearm.metadata.planningAuditIds as string[] } } }) !== 0)
        throw new Error('[blocked] Narrative planning recovery has an existing uncheckpointed provider attempt');
      await requireUnchangedEvidence(tx);
      await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
    };
    const planningGateway: Pick<AiGateway, 'completeStructured'> | undefined = options.gateway && pixelRecovery ? {
      completeStructured: async (guard, messages, opts) => {
        await deps.prisma.$transaction(requirePixelRecoveryUnchanged, { isolationLevel: 'Serializable' });
        pixelPlanningStarted = true;
        return options.gateway!.completeStructured(guard, messages, { ...opts, primaryProviderOnly: true });
      },
    } : options.gateway;
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
    if (actualImageReview && (!sceneParent || !options.gateway?.reviewScientific))
      throw new Error('[blocked] Generated image review unavailable before rendering');
    if (sceneParent && (((sceneParent.view.output === 'image' || actualImageReview) && !sceneParent.sourceEvidenceIdentity)
      || (sceneParent.sourceEvidenceIdentity && sceneParent.sourceEvidenceIdentity !== sourceEvidenceIdentity))) {
      throw new Error('[blocked] Storyboard evidence has changed; revise the illustration plan before generating images');
    }
    const finishGeneratedImageReview = async (saved: { id: string; kind: string; status: string; contentHash: string; objectKey: string }) => {
      if (!actualImageReview || !sceneParent || !payload.sceneImage || !options.gateway?.reviewScientific) {
        throw new Error('[blocked] Generated image review unavailable');
      }
      const recoveryParent = existing && task.executionAttempt > 1 && payload.hermesRunAuthority?.profile === VISUAL_NARRATIVE_PROFILE
        ? await readNarrativePixelReplanAuthority(deps.prisma, { runId: payload.hermesRunAuthority.runId, actorId: scope.userId }) : null;
      // A technical replacement owns a fresh request identity. Crash re-entry reuses that
      // request's reservation, rather than requiring an unrelated completed-only receipt.
      const nativeReview = readNativeImageReviewCheckpoint(owner.result);
      const completedOnly = !nativeReview && Boolean(recoveryParent) && !technicalReplacement;
      const requireCompletedRecovery = async (tx: Prisma.TransactionClient) => {
        if (!completedOnly) return;
        if (!options.gateway?.resumeScientificReviewFromCompletedResult || !payload.hermesRunAuthority)
          throw new Error('[blocked] Read-only completed image review recovery is unavailable');
        await requireHermesCompletedImageReviewRecovery(tx, { taskId: task.id, actorId: scope.userId, runId: payload.hermesRunAuthority.runId });
      };
      // Revalidate the receipt before reading the saved PNG, not only before persisting its review.
      if (completedOnly || technicalRecovery) await withPresentationAssetWrite(deps.prisma, scope, async tx => {
        await requireCompletedRecovery(tx); await requireTechnicalRecovery(tx);
      }, { refreshWorkingRecord: false });
      const identity = { requestId: task.id, contentHash: saved.contentHash, sourceEvidenceIdentity, parentIdentity: sceneParent.identity };
      const savedImage = await requireSavedImageForReview(deps.prisma, payload, task.id, saved.contentHash, sourceEvidenceIdentity, sceneParent.identity);
      const contentType = (savedImage.provenance as Record<string, unknown>).contentType;
      const imageBytes = await readPresentationInput(deps.storage!, saved.objectKey, saved.contentHash, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES);
      const attachment = generatedImageReviewAttachment(imageBytes, saved.contentHash, contentType);
      const authorizationContext = Object.freeze({ taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId });
      const illustrationContext = { executionAttempt: task.executionAttempt, claimContent: presentationClaimContent(claims), baseIdentity: sceneParent.identity,
        ...(nativeReview ? { imageReviewMode: 'model-native' as const } : {}),
        ...(technicalRecovery ? { primaryProviderOnly: true as const } : {}) };
      const authorityInput: ScienceReviewInput = {
        requestId: task.id, authorizationContext, illustrationContext,
        source: { kind: 'illustration-image', researchObjectId: payload.researchObjectId, versionId: payload.versionId,
          candidateHash: saved.contentHash, sourceEvidenceIdentity }, prompt: '',
        attachments: [attachment],
      };
      const readCurrent = async (tx: Prisma.TransactionClient) => {
        await requireCompletedRecovery(tx);
        await requireTechnicalRecovery(tx);
        if (manualReviewCopy) await requireManualSceneImageReviewReceipt(tx,
          { taskId: task.id, actorId: scope.userId, payload });
        await requireIllustrationReviewSubmission(tx, authorityInput);
        await requireUnchangedSceneRevision(tx);
        const current = await requireSavedImageForReview(tx, payload, task.id, saved.contentHash, sourceEvidenceIdentity, sceneParent.identity);
        if (current.objectKey !== saved.objectKey) throw new Error('[blocked] Saved image storage identity changed');
        const provenance = current.provenance as Record<string, unknown>;
        const currentTask = await tx.agentTask.findUniqueOrThrow({ where: { id: task.id } });
        return { current, provenance, review: readStoredGeneratedImageReview(provenance.imageReview, identity, currentTask.result) };
      };
      const stored = await withPresentationAssetWrite(deps.prisma, scope, readCurrent, { refreshWorkingRecord: false });
      let imageReview = stored.review;
      if (!imageReview) {
        if (nativeReview && nativeReview.state !== 'not_started') throw new Error('[blocked] Native image review outcome is unconfirmed; another submission is forbidden');
        const parentRow = await deps.prisma.presentationAsset.findUniqueOrThrow({ where: { id: payload.sceneImage.storyboardAssetId } });
        const settings = parseStoryboardRequest((parentRow.provenance as Record<string, unknown>).storyboardSettings);
        // The object and draft row already exist. No model call is made while holding the write lock.
        const reviewGateway: Pick<AiGateway, 'reviewScientific'> = completedOnly ? { reviewScientific: async (request, guard) => {
          await withPresentationAssetWrite(deps.prisma, scope, readCurrent, { refreshWorkingRecord: false });
          return options.gateway!.resumeScientificReviewFromCompletedResult!(request, guard);
        } } : { reviewScientific: async (request, guard) => {
          await requireHermesAuthority(deps.prisma);
          if (technicalRecovery || manualReviewCopy)
            await withPresentationAssetWrite(deps.prisma, scope, readCurrent, { refreshWorkingRecord: false });
          return options.gateway!.reviewScientific!(request, guard);
        } };
        const reviewed = await reviewGeneratedImage(reviewGateway, {
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
          if (nativeReview) await completeNativeImageReview(tx, { taskId: task.id, executionAttempt: task.executionAttempt, review: reviewed });
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
    if (technicalReplacement?.mode === 'review_only') throw new Error('[blocked] Review-only recovery cannot generate an image');
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
    let illustrationRevisionReview: StoryboardReview | undefined;
    let artCorrection: StoryboardArtCorrection | undefined;
    let artCorrectionIdentity: StoryboardCheckpointIdentity | undefined;
    let successfulPrivateResult: Record<string, unknown> | undefined;
    let nativeIllustration: Awaited<ReturnType<typeof runNativeIllustrationTask>> | undefined;
    let requireNativeIllustrationUnchanged: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;
    const verifiedVideoPlans = new Map<string, Promise<VerifiedNativeVideoBase>>();
    let videoNarrativeSource = narrativeSource;
    const readVerifiedVideoPlan = async (assetId: string, parents: string[] = []): Promise<VerifiedNativeVideoBase> => {
      if (parents.includes(assetId) || parents.length >= 32) throw new Error('[blocked] Native video base chain is invalid');
      const previous = verifiedVideoPlans.get(assetId); if (previous) return previous;
      const pending = (async () => {
        const asset = await deps.prisma.presentationAsset.findUnique({ where: { id: assetId }, include: { sourceClaims: { select: { claimId: true } } } });
        if (!asset) throw new Error('[blocked] Native video plan is unavailable');
        const proof = await requireNativeVideoStoryboard(deps.prisma, asset, payload);
        const base = proof.settings.baseAssetId ? await readVerifiedVideoPlan(proof.settings.baseAssetId, [...parents, assetId]) : undefined;
        videoNarrativeSource ??= await resolveVisualNarrativeSource({ prisma: deps.prisma, storage: deps.storage! }, narrativeScope, sourceEvidence);
        if (proof.sourceEvidenceIdentity !== sourceEvidenceIdentity) throw new Error('[blocked] Native video plan evidence changed');
        return replayNativeVideoPlan({ deps: { prisma: deps.prisma, storage: deps.storage! }, task: proof.task,
          claims, settings: proof.settings, paperOriginals: new Map(), narrativeSource: videoNarrativeSource.context, base });
      })();
      verifiedVideoPlans.set(assetId, pending); return pending;
    };
    const prepareNativeIllustration = async () => {
      if (!nativeExecution || !options.nativeAgent || !narrativeSource || !payload.storyboard || !sourceMetadata)
        throw new Error('[blocked] Native illustration requires its reviewed paper and installed host');
      const identity: StoryboardCheckpointIdentity = { payload, sourceEvidenceIdentity, claimContent: presentationClaimContent(claims),
        baseIdentity: planningContext.identity, narrativeSourceIdentity: narrativeSource.identity };
      requireNativeIllustrationUnchanged = async tx => {
        await requireNativeAgentExecutionAuthority(tx, { taskId: task.id, executionAttempt: task.executionAttempt });
        const current = await requireIllustrationReviewAuthority(tx, { taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId });
        const result = current.owner.result as Record<string, unknown> | null;
        const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
        if (current.owner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(current.owner.payload, owner.payload)
          || currentClaims.length !== claims.length || currentClaims.some(claim => claim.extractionStatus !== 'succeeded')
          || presentationClaimContent(currentClaims as PresentationClaim[]) !== identity.claimContent
          || (result?.nativeIllustrationContext !== undefined && !isDeepStrictEqual(result.nativeIllustrationContext, identity))
          || (result?.sourceMapRef !== undefined && !isDeepStrictEqual(result.sourceMapRef, narrativeSource.reference))
          || (readNativeAgentExecution(result)?.checkpoint && (!result?.nativeIllustrationContext || !result?.sourceMapRef)))
          throw new Error('[blocked] Native illustration source or task scope changed');
        await requireUnchangedEvidence(tx); await requireUnchangedStyleReference(tx);
        await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
        if ((await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== identity.baseIdentity)
          throw new Error('[blocked] Native illustration base changed');
      };
      await deps.prisma.$transaction(async tx => {
        await requireNativeIllustrationUnchanged!(tx);
        const current = await tx.agentTask.findUniqueOrThrow({ where: { id: task.id } });
        const result = current.result as Record<string, unknown>;
        if (result.nativeIllustrationContext !== undefined) return;
        const changed = await tx.agentTask.updateMany({ where: { id: task.id, status: 'running', deletedAt: null,
          executionAttempt: task.executionAttempt, result: { equals: current.result! } },
          data: { result: { ...result, nativeIllustrationContext: identity, sourceMapRef: narrativeSource.reference } as unknown as Prisma.InputJsonObject } });
        if (changed.count !== 1) throw new Error('[blocked] Native illustration initial context changed');
      }, { isolationLevel: 'Serializable' });
      const paperOriginals = await resolveStoryboardOriginals(deps, payload);
      const base = payload.storyboard.output === 'video' && payload.storyboard.baseAssetId
        ? await readVerifiedVideoPlan(payload.storyboard.baseAssetId) : undefined;
      let sourceBytes: Buffer | undefined;
      const latest = await deps.prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } });
      nativeIllustration = await runNativeIllustrationTask({ gateway: options.nativeAgent.gateway, deps: { ...deps, storage: deps.storage! },
        task: { id: task.id, executionAttempt: task.executionAttempt, result: latest.result }, sourceMap: narrativeSource.sourceMap,
        sourceMapRef: narrativeSource.reference, sourceEvidenceIdentity, claims, settings: payload.storyboard, paperOriginals,
        narrativeSource: narrativeSource.context, base, inboxRoot: options.nativeAgent.inboxRoot, authorize: requireNativeIllustrationUnchanged,
        renderPages: async pages => {
          sourceBytes ??= await readPresentationInput(deps.storage!, getBlobStorageKey(narrativeSource.reference.contentHash), narrativeSource.reference.contentHash, 100 * 1024 * 1024);
          return options.nativeAgent!.renderPages({ artifactId: narrativeSource.reference.artifactId, contentHash: narrativeSource.reference.contentHash,
            content: sourceBytes, mediaType: 'application/pdf' }, pages);
        } });
      const result = nativeIllustration;
      await deps.prisma.$transaction(async tx => {
        await requireNativeIllustrationUnchanged!(tx);
        const current = await tx.agentTask.findUniqueOrThrow({ where: { id: task.id } });
        const stored = current.result as Record<string, unknown>;
        const cp = readNativeAgentExecution(stored)?.checkpoint;
        if (!cp || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls || cp.responseHash !== result.review.responseHash
          || cp.target.promptHash !== result.review.promptHash || cp.target.provider !== result.review.provider || cp.target.model !== result.review.model)
          throw new Error('[blocked] Native illustration paid completion changed');
        const planned = { document: result.document, promptHash: result.promptHash, designSkills: result.designSkills, reviewFormat: 2 };
        const changed = await tx.agentTask.updateMany({ where: { id: task.id, status: 'running', deletedAt: null, executionAttempt: task.executionAttempt,
          result: { equals: current.result! } }, data: { result: { ...stored,
          storyboardCheckpoint: { ...identity, planned, executionAttempt: task.executionAttempt }, storyboardReview: result.review,
          nativeIllustration: result.nativeAgent, illustrationPrompts: result.prompts } as unknown as Prisma.InputJsonObject } });
        if (changed.count !== 1) throw new Error('[blocked] Native illustration completion context changed');
      }, { isolationLevel: 'Serializable' });
      if (result.review.decision !== 'accepted') throw new Error('[blocked] Native illustration needs source-grounded revision: ' + result.review.summary.slice(0, 300));
      storyboardDocument = result.document; illustrationReview = result.review; designSkills = result.designSkills; promptHash = result.promptHash;
    };
    if (payload.video && videoParents) {
      const user = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] isolated video generation is unavailable');
      if (!options.videoSpool) throw new Error('[blocked] isolated video generation is unavailable');
      if (videoParents.storyboardView.narrative && options.videoSpool.provider !== 'synclip')
        throw new Error('[blocked] Native video requires the configured Synclip commercial video executor');
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
      const videoPlan = videoParents.storyboardView.narrative
        ? await readVerifiedVideoPlan(videoParents.storyboard.id) : undefined;
      let result: Awaited<ReturnType<PresentationVideoSpool['generate']>>;
      try { result = await options.videoSpool.generate({
        taskId: task.id, executionAttempt: task.executionAttempt, profile: payload.video.profile,
        ...(payload.video.profile === 'onchip-field-sampling-v1' ? { sceneRoles: payload.video.sceneRoles } : {}),
        sourceClaimIds: payload.sourceClaimIds, storyboard: videoParents.storyboardView.document, sceneImages,
        sceneImageTaskIds: videoParents.orderedImages.map(asset => {
          const provenance = asset.provenance as Record<string, unknown> | null;
          return typeof provenance?.taskId === 'string' ? provenance.taskId : '';
        }),
        locale: videoParents.storyboardView.locale, style: videoParents.storyboardView.style,
        ...(videoPlan ? { videoPrompts: videoPlan.prompts.map(item => item.videoPrompt) } : {}),
      }); } catch (error) {
        if (videoPlan && error instanceof SynclipVideoTimingError) {
          await deps.prisma.$transaction(async tx => {
            await requirePresentationWriteScope(tx, scope);
            await requireHermesAuthority(tx); await requireUnchangedEvidence(tx);
            const current = await tx.agentTask.findUnique({ where: { id: task.id } });
            if (!current || current.deletedAt || current.status !== 'running' || current.executionAttempt !== task.executionAttempt
              || !isDeepStrictEqual(current.payload, owner.payload)
              || (await requireVideoGenerationParents(tx, payload))?.identity !== videoParents.identity)
              throw new Error('[blocked] Video timing revision authority changed');
            const saved = current.result && typeof current.result === 'object' && !Array.isArray(current.result) ? current.result : {};
            const changed = await tx.agentTask.updateMany({ where: { id: task.id, status: 'running', deletedAt: null,
              executionAttempt: task.executionAttempt, result: { equals: current.result === null ? Prisma.AnyNull : current.result! } },
              data: { result: { ...saved, videoAudioTiming: { schemaVersion: 1, taskId: task.id, executionAttempt: task.executionAttempt,
                storyboardAssetId: videoParents.storyboard.id, parentIdentity: videoParents.identity, sourceEvidenceIdentity,
                ...error.diagnostic } } as unknown as Prisma.InputJsonObject } });
            if (changed.count !== 1) throw new Error('[blocked] Video timing revision owner changed');
          }, { isolationLevel: 'Serializable' });
        }
        throw error;
      }
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
      let nativePrompt: { prompt: string; designSkills?: DesignSkillUsage[] } | undefined;
      const parentTask = await deps.prisma.agentTask.findUnique({ where: { id: payload.sceneImage.storyboardAssetId } });
      const parentNative = readNativeAgentExecution(parentTask?.result);
      if (parentNative?.profile === 'paper-illustration') {
        if (!parentTask || parentTask.status !== 'succeeded' || parentTask.deletedAt || parentTask.kind !== 'presentation.generate'
          || sceneRevision || styleReference) throw new Error('[blocked] Native rendering requires its completed plan; revise the plan before changing the rendering instructions');
        const parentPayload = parsePresentationGenerationPayload(parentTask.payload);
        const saved = parentTask.result as Record<string, unknown>;
        if (parentPayload.researchObjectId !== payload.researchObjectId || parentPayload.versionId !== payload.versionId
          || !isDeepStrictEqual(parentPayload.sourceClaimIds, payload.sourceClaimIds)
          || !(parentPayload.storyboard?.output === 'image' || (parentPayload.storyboard?.output === 'video' && parentPayload.storyboard.narrative === true))
          || saved.assetId !== parentTask.id || saved.contentHash !== sceneParent.contentHash)
          throw new Error('[blocked] Native image plan scope changed');
        const context = saved.nativeIllustrationContext as StoryboardCheckpointIdentity | undefined;
        const source = await readReviewedVisualContextSource(deps.prisma, narrativeScope, parentPayload, claimRows, sourceEvidence, saved);
        if (!context || !source || !isDeepStrictEqual(saved.sourceMapRef, source.reference))
          throw new Error('[blocked] Native image plan source changed');
        const expected = { ...context, payload: parentPayload, claimContent: presentationClaimContent(claims), sourceEvidenceIdentity,
          narrativeSourceIdentity: source.identity };
        const planned = readStoryboardCheckpoint(saved, expected);
        const review = saved.storyboardReview as StoryboardReview | undefined;
        const cp = parentNative.checkpoint;
        if (!isDeepStrictEqual(context, expected) || !planned || !isDeepStrictEqual(planned.document, sceneParent.view.document)
          || cp?.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls
          || !review || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== parentTask.id
          || review.sourceEvidenceIdentity !== sourceEvidenceIdentity
          || review.candidateHash !== createHash('sha256').update(JSON.stringify(planned.document)).digest('hex')
          || cp.responseHash !== review.responseHash || cp.target.promptHash !== review.promptHash
          || cp.target.provider !== review.provider || cp.target.model !== review.model)
          throw new Error('[blocked] Native image plan review changed');
        const prompts = saved.illustrationPrompts;
        const selected = Array.isArray(prompts) ? prompts.filter(item => item?.sceneIndex === payload.sceneImage!.sceneIndex) : [];
        if (selected.length !== 1 || typeof selected[0].prompt !== 'string' || !selected[0].prompt.trim())
          throw new Error('[blocked] Native image plan has no exact saved prompt');
        if (parentPayload.storyboard?.output === 'video') {
          const verified = await readVerifiedVideoPlan(parentTask.id);
          if (verified.prompts[payload.sceneImage.sceneIndex]?.prompt !== selected[0].prompt)
            throw new Error('[blocked] Native video frame prompt changed after review');
          nativePrompt = { prompt: selected[0].prompt, designSkills: verified.designSkills };
        } else nativePrompt = { prompt: selected[0].prompt, designSkills: planned.designSkills };
      }
      const installedSkills = completedProviderRecovery || nativePrompt ? undefined
        : loadInstalledMediaSkills(storyboardSceneStyles(sceneParent.view, sceneParent.view.document.scenes)[payload.sceneImage.sceneIndex]!, sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.illustration?.treatment ?? sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.visualAction, 'render');
      const imagePlanningGateway: Pick<AiGateway, 'completeStructured'> = technicalRecovery ? {
        completeStructured: async (guard, messages, opts) => {
          await deps.prisma.$transaction(requireTechnicalRecovery, { isolationLevel: 'Serializable' });
          return options.gateway!.completeStructured(guard, messages, { ...opts, primaryProviderOnly: true });
        },
      } : options.gateway;
      const prompt = completedProviderRecovery ? null
        : nativePrompt?.prompt ?? await planSceneImagePrompt(imagePlanningGateway, claims, sceneParent.view, payload.sceneImage.sceneIndex, installedSkills, sceneRevision?.repairInstruction);
      designSkills = nativePrompt?.designSkills ?? installedSkills?.usage;
      const referenceImage = !completedProviderRecovery && styleReference
        ? { bytes: await readPresentationInput(deps.storage, styleReference.objectKey, styleReference.contentHash), contentHash: styleReference.contentHash }
        : undefined;
      await requireUnchangedStyleReference(deps.prisma);
      await requireUnchangedSceneRevision(deps.prisma);
      await requireHermesAuthority(deps.prisma);
      if (technicalRecovery) await deps.prisma.$transaction(requireTechnicalRecovery, { isolationLevel: 'Serializable' });
      const result = completedProviderRecovery
        ? await options.gateway.resumeImageFromCompletedResult!(task.id)
        : await options.gateway.generateImage({ prompt: prompt!, requestId: task.id, ...(referenceImage ? { referenceImage } : {}) },
          technicalReplacement || nativePrompt ? { primaryProviderOnly: true } : undefined);
      bytes = result.bytes; contentType = result.contentType; extension = imageExtension(contentType);
      imageProvider = result.provider;
      generator = `OpenScience Hermes scene image / ${result.provider}`; generatorVersion = result.model; promptHash = result.promptHash;
      }
    } else if (payload.storyboard) {
      if (nativeExecution) {
        await prepareNativeIllustration();
      } else {
      if (!options.gateway) throw new Error('[blocked] storyboard planner unavailable');
      let planned: StoryboardPlan;
      let acceptance: StoryboardAcceptance | undefined;
      let persistPlan: ((planned: StoryboardPlan, review?: StoryboardReview, acceptance?: StoryboardAcceptance, art?: StoryboardArtCorrection) => Promise<void>) | undefined;
      let persistArtCorrection: ((art: StoryboardArtCorrection) => Promise<void>) | undefined;
      let initialScienceRecovery: Awaited<ReturnType<typeof readInitialSciencePlanningRetryChain>> | undefined;
      let revalidateInitialScienceRecovery: ((tx: Prisma.TransactionClient, beforePlanning: boolean) => Promise<void>) | undefined;
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
        const paperOriginals = await resolveStoryboardOriginals(deps, payload);
        const identity: StoryboardCheckpointIdentity = {
          payload, sourceEvidenceIdentity, claimContent: presentationClaimContent(claims), baseIdentity: planningContext.identity,
          ...(narrativeSource ? { narrativeSourceIdentity: narrativeSource.identity } : {}),
        };
        let expectedResult = owner.result;
        let standaloneArtStarted = false;
        const standaloneRecovery = !payload.hermesRunAuthority && task.executionAttempt > 1
          ? await readStandaloneScienceRecovery(deps.prisma, owner, scope.userId, identity, true) : undefined;
        if (hasStandaloneScienceDiagnostics(expectedResult) && !standaloneRecovery?.diagnostics)
          throw new Error('[blocked] Rejected scientific candidate evidence requires explicit same-task recovery');
        if (standaloneRecovery) {
          requireStandaloneScienceRecoveryUnchanged = async tx => {
            const current = await requireIllustrationReviewAuthority(tx, {
              taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId,
            });
            if (current.owner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(current.owner.result, expectedResult)
              || !isDeepStrictEqual(current.owner.payload, owner.payload) || !isDeepStrictEqual(current.payload, payload))
              throw new Error('[blocked] Saved science recovery owner changed');
            const recovery = await readStandaloneScienceRecovery(tx, current.owner, scope.userId, identity, !standaloneArtStarted);
            if (!recovery || recovery.receiptId !== standaloneRecovery.receiptId
              || !isDeepStrictEqual(recovery.metadata, standaloneRecovery.metadata))
              throw new Error('[blocked] Saved science recovery receipt changed');
            const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
              researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
            if (presentationClaimContent(currentClaims as PresentationClaim[]) !== identity.claimContent
              || (await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== identity.baseIdentity)
              throw new Error('[blocked] Saved science recovery source changed');
            await requireUnchangedEvidence(tx);
            await requireUnchangedStyleReference(tx);
            await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
          };
        }
        const persistCheckpoint = async (nextResult: Record<string, unknown>, planned?: StoryboardPlan, art?: StoryboardArtCorrection, rejectedScience = false) => {
          // Persist the paid plan before Chat review. A failed review must not restart planning.
          const saveCheckpoint = () => deps.prisma.$transaction(async tx => {
            if (requireStandaloneScienceRecoveryUnchanged) await requireStandaloneScienceRecoveryUnchanged(tx);
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
            await requireUnchangedStyleReference(tx);
            if (planned) await requireNarrativeOriginals(tx, payload, planned.document);
            else if (!rejectedScience) {
              const partial = readStoryboardPlanningCheckpoint(nextResult, identity);
              if (!partial) throw new Error('[blocked] Planning checkpoint is missing');
              await requireNarrativeOriginals(tx, payload, partial.science.intent);
            }
            await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
            if ((await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== identity.baseIdentity) {
              throw new Error('[blocked] Storyboard base changed before checkpoint save');
            }
            if (expectedResult !== null && (typeof expectedResult !== 'object' || Array.isArray(expectedResult))) {
              throw new Error('[blocked] Storyboard task result is invalid');
            }
            if (art) {
              await requireStoryboardArtCorrectionAuthorization(tx, { taskId: task.id, actorId: scope.userId,
                workspaceId: researchObject.workspaceId, payload, executionAttempt: task.executionAttempt,
                retryCount: currentOwner.retryCount, result: currentOwner.result });
              const original = readStoryboardCheckpoint(currentOwner.result, identity);
              if (!original || !isDeepStrictEqual(original, planned)) throw new Error('[blocked] Original art correction plan changed');
              readStoryboardArtCorrection(nextResult, original.document, identity, task.id, task.executionAttempt);
            }
            const savedCheckpoint = await tx.agentTask.updateMany({ where: {
              id: task.id, kind: 'presentation.generate', status: 'running', deletedAt: null,
              executionAttempt: task.executionAttempt,
              payload: { equals: owner.payload as Prisma.InputJsonValue },
              result: { equals: expectedResult === null ? Prisma.AnyNull : expectedResult as Prisma.InputJsonValue },
            }, data: { result: JSON.parse(JSON.stringify(nextResult)) as Prisma.InputJsonValue } });
            if (savedCheckpoint.count !== 1) throw new Error('[blocked] Storyboard checkpoint owner changed');
          }, { isolationLevel: 'Serializable' });
          for (let attempt = 0; ; attempt += 1) {
            try { await saveCheckpoint(); break; }
            catch (error) {
              if ((error as { code?: unknown })?.code !== 'P2034' || attempt >= STORYBOARD_CHECKPOINT_RETRY_DELAYS_MS.length) throw error;
              await new Promise<void>(resolve => setTimeout(resolve, STORYBOARD_CHECKPOINT_RETRY_DELAYS_MS[attempt]));
            }
          }
          expectedResult = JSON.parse(JSON.stringify(nextResult));
        };
        persistPlan = async (planned, review, acceptance, art) => {
          const retained = { ...(expectedResult as Record<string, unknown> | null) };
          delete retained.storyboardPlanningCheckpoint;
          delete retained.storyboardScienceDiagnostics;
          const previousCheckpoint = retained.storyboardCheckpoint as Record<string, unknown> | undefined;
          const generatedExecution = previousCheckpoint ? previousCheckpoint.executionAttempt : task.executionAttempt;
          await persistCheckpoint(art ? { ...retained, storyboardArtCorrection: art }
            : { ...retained, storyboardCheckpoint: { ...identity, planned, ...(generatedExecution !== undefined ? { executionAttempt: generatedExecution } : {}) },
              ...(review ? { storyboardReview: review } : {}), ...(acceptance ? { storyboardAcceptanceCheckpoint: acceptance } : {}) }, planned, art);
        };
        let partial = readStoryboardPlanningCheckpoint(owner.result, identity);
        let continuationStarted = false;
        if (standaloneRecovery) {
          // A cold worker may resume only science saved before art submission.
          // A submitting/rejected art request needs its own explicit recovery, never another automatic call.
          if (partial && (partial.art.state !== 'not_started' || partial.art.executionAttempt !== task.executionAttempt))
            throw new Error('[blocked] Saved science recovery has already submitted art');
          if (!standaloneRecovery.diagnostics && !partial)
            throw new Error('[blocked] Saved science recovery requires a pre-art checkpoint; explicit review recovery is required');
        }
        if (planningContinuation) {
          const meta = planningContinuation.metadata;
          if (Object.entries(identity).some(([key, value]) => key !== 'payload' && !isDeepStrictEqual(meta[key], value))
            || meta.authorityReceiptId !== (pixelAuthority?.receipt.id ?? null)
            || !isDeepStrictEqual(meta.storyboardPlanningCheckpoint, partial ?? null)
            || (meta.planningFailureClass === 'full_planning_restart' ? owner.result !== null
              : !partial || partial.art.executionAttempt !== task.executionAttempt - 1
                || (meta.planningFailureClass === 'fresh_art_after_unknown' ? partial.art.state !== 'submitting' : partial.art.state === 'submitting')))
            throw new Error('[blocked] Planning continuation source or checkpoint changed');
          requirePlanningContinuationUnchanged = async tx => {
            const current = await requireIllustrationReviewAuthority(tx, { taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId });
            const receipt = await readCurrentPlanningContinuation(tx, current.owner, payload, scope.userId);
            const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
              researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
            const count = await tx.agentTask.count({ where: { kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: payload.hermesRunAuthority!.runId } } });
            const sources = await tx.hermesResearchStep.count({ where: { runId: payload.hermesRunAuthority!.runId, stage: { in: ['source_composition', 'source_review'] } } });
            if (current.owner.executionAttempt !== task.executionAttempt || !isDeepStrictEqual(current.owner.result, expectedResult)
              || !receipt || receipt.receipt.id !== planningContinuation.receipt.id || !isDeepStrictEqual(receipt.metadata, meta)
              || count + sources !== meta.existingTaskCount || presentationClaimContent(currentClaims as PresentationClaim[]) !== identity.claimContent
              || (await readStoryboardPlanningContext(tx, payload, scope.userId)).identity !== identity.baseIdentity
              || (!continuationStarted && await tx.auditLog.count({ where: { requestId: task.id, action: 'ai.gateway.call',
                id: { notIn: meta.planningAuditIds as string[] } } }))) throw new Error('[blocked] Planning continuation authority changed');
            await requireUnchangedEvidence(tx);
            await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
          };
        } else if (partial && !standaloneRecovery) throw new Error('[blocked] Saved scientific intent requires explicit same-task continuation');
        // Partial checkpoints require managed continuation or the bounded standalone science receipt.
        const durablePlanning = payload.hermesRunAuthority?.stage === 'storyboard'
          && payload.hermesRunAuthority.profile === VISUAL_NARRATIVE_PROFILE && payload.hermesRunAuthority.ordinal === 0
          && payload.storyboard.narrative && payload.storyboard.narrativeSceneLimit
          && !payload.storyboard.revisionMode && !pixelAuthority?.technicalRecovery
          && (pixelAuthority || !(payload.storyboard.revisionTaskId || payload.storyboard.revisionImageAssetId || payload.storyboard.baseAssetId));
        const persistence: StoryboardPlanningPersistence | undefined = durablePlanning || standaloneRecovery ? {
          ...(standaloneRecovery?.diagnostics ? { rejectedScienceCandidate: {
            ...standaloneRecovery.diagnostics.candidates.at(-1)!, sources: standaloneRecovery.diagnostics.sources,
          } } : {}),
          ...(partial ? { science: partial.science, rejectedCandidates: planningContinuation?.metadata.planningFailureClass === 'fresh_art_after_unknown'
            ? [] : partial.art.rejectedCandidates } : {}),
          saveScience: async science => {
            const next: StoryboardPlanningCheckpoint = { ...identity, schemaVersion: 1, science,
              art: { state: 'not_started', executionAttempt: task.executionAttempt, rejectedCandidates: [] } };
            await persistCheckpoint({ storyboardPlanningCheckpoint: next }); partial = next;
          },
          beforeArtSubmission: async () => {
            if (!partial) throw new Error('[blocked] Scientific intent must be saved before art submission');
            if (requirePlanningContinuationUnchanged) await deps.prisma.$transaction(requirePlanningContinuationUnchanged, { isolationLevel: 'Serializable' });
            const next: StoryboardPlanningCheckpoint = { ...partial, art: { state: 'submitting', executionAttempt: task.executionAttempt,
              rejectedCandidates: partial.art.executionAttempt === task.executionAttempt ? partial.art.rejectedCandidates : [] } };
            await persistCheckpoint({ storyboardPlanningCheckpoint: next }); partial = next; continuationStarted = true;
            standaloneArtStarted = true;
          },
          rejectArt: async rejection => {
            if (!partial || partial.art.state !== 'submitting' || partial.art.executionAttempt !== task.executionAttempt)
              throw new Error('[blocked] Art rejection has no matching submission');
            const next: StoryboardPlanningCheckpoint = { ...partial, art: { ...partial.art, state: 'rejected',
              rejectedCandidates: [...partial.art.rejectedCandidates, rejection].slice(-3) } };
            readStoryboardPlanningCheckpoint({ storyboardPlanningCheckpoint: next }, identity);
            await persistCheckpoint({ storyboardPlanningCheckpoint: next }); partial = next;
          },
        } : undefined;
        const durableGateway: Pick<AiGateway, 'completeStructured'> = { completeStructured: async (guard, messages, opts) => {
          await requireHermesAuthority(deps.prisma);
          if (standaloneRecovery && !partial)
            throw new Error('[blocked] Saved science must pass validation and checkpoint before any provider call');
          if (requirePlanningContinuationUnchanged) await deps.prisma.$transaction(requirePlanningContinuationUnchanged, { isolationLevel: 'Serializable' });
          if (requireStandaloneScienceRecoveryUnchanged) await deps.prisma.$transaction(requireStandaloneScienceRecoveryUnchanged, { isolationLevel: 'Serializable' });
          if (narrativeSource) await requireUnchangedEvidence(deps.prisma);
          continuationStarted = true;
          return planningGateway!.completeStructured(guard, messages, { ...opts,
            ...(payload.hermesRunAuthority ? { beforeEachProviderCall: async () => {
              await requireHermesAuthority(deps.prisma);
              await opts?.beforeEachProviderCall?.();
            } } : {}),
            ...(planningContinuation || standaloneRecovery ? { primaryProviderOnly: true } : {}) });
        } };
        const rejectedScienceCandidates: Omit<StoryboardScienceRejectedCandidate, 'sources'>[] = [];
        const onScienceRejected = async (receipt: StoryboardScienceRejectionReceipt, candidate: StoryboardScienceRejectedCandidate) => {
          const { sources, ...rejected } = candidate;
          // Diagnostic evidence is never read as a successful checkpoint or retry authority.
          // Keep one source mapping and at most the three paid structured candidates.
          const candidates = [...rejectedScienceCandidates, rejected].slice(-3);
          await persistCheckpoint({ storyboardScienceDiagnostics: { ...identity, executionAttempt: task.executionAttempt,
            sources, candidates } }, undefined, undefined, true);
          rejectedScienceCandidates.splice(0, rejectedScienceCandidates.length, ...candidates);
          await deps.audit?.record({ actorId: scope.userId, action: 'presentation.storyboard_science_candidate_rejected',
            workspaceId: researchObject.workspaceId, targetType: 'agent_task', targetId: task.id, requestId: task.id,
            metadata: { executionAttempt: task.executionAttempt, ...receipt } });
        };
        const saved = readStoryboardCheckpoint(owner.result, identity);
        if (saved) {
          requireStoryboardSourceSupport(saved.document, claims, paperOriginals);
          planned = saved;
          artCorrection = readStoryboardArtCorrection(owner.result, saved.document, identity, task.id, task.executionAttempt);
          if (artCorrection) {
            artCorrectionIdentity = identity;
            await requireStoryboardArtCorrectionAuthorization(deps.prisma, { taskId: task.id, actorId: scope.userId,
              workspaceId: researchObject.workspaceId, payload, executionAttempt: task.executionAttempt,
              retryCount: owner.retryCount, result: owner.result });
            const blocked = (owner.result as Record<string, unknown>).storyboardReview;
            const issues = readStoredIllustrationIssues(blocked, saved.document, claims, task.id, sourceEvidenceIdentity);
            if (!issues?.length) throw new Error('[blocked] Art correction needs the original review issues');
            persistArtCorrection = (candidate) => persistPlan!(saved, undefined, undefined, candidate);
            if (!artCorrection.planned) {
              if (artCorrection.artSubmittedExecutionAttempt !== undefined)
                throw new Error('[blocked] Art correction outcome is uncertain; preserve the submitted request');
              artCorrection = { ...artCorrection, artSubmittedExecutionAttempt: task.executionAttempt };
              await persistArtCorrection(artCorrection);
              const artGateway: Pick<AiGateway, 'completeStructured'> = {
                completeStructured: (guard, messages, opts) => planningGateway!.completeStructured(guard, messages,
                  { ...opts, primaryProviderOnly: true }),
              };
              const corrected = await generateStoryboard(artGateway, claims, { ...payload.storyboard, revisionMode: 'art' }, {
                document: saved.document, locale: payload.storyboard.locale, style: payload.storyboard.style, output: 'image',
              }, paperOriginals, narrativeSource?.context, { summary: (blocked as StoryboardReview).summary, issues });
              artCorrection = { ...artCorrection, planned: { ...corrected, reviewFormat: 2,
                designSkills: mergeDesignSkillUsage(saved.designSkills, corrected.designSkills ?? []) } };
              await persistArtCorrection(artCorrection);
            }
            planned = artCorrection.planned!;
            requireStoryboardSourceSupport(planned.document, claims, paperOriginals);
          } else if (pixelAuthority && task.executionAttempt === 3 && !planningContinuation && !savedOutputResume) {
            pixelOutputResume = await requirePixelStoryboardOutputResume(deps.prisma, { runId: pixelAuthority.run.id,
              actorId: scope.userId, taskId: task.id, beforeFirstSubmission: true });
          } else if (task.executionAttempt > 3 && !planningContinuation && !savedOutputResume) {
            throw new Error('[blocked] Storyboard continuation has no current art correction authorization');
          }
          if (task.executionAttempt > 1 && !artCorrection && !planningContinuation && !savedOutputResume && !pixelOutputResume)
            await requireLegacyStoryboardCheckpointResume(deps.prisma, owner, payload, scope.userId, identity, saved);
        } else {
          if (task.executionAttempt > 1 && !planningContinuation && !standaloneRecovery) {
            const receipts = payload.hermesRunAuthority ? await deps.prisma.auditLog.findMany({ where: {
              action: 'hermes.research_run.generation_retry', targetType: 'hermes_research_run',
              targetId: payload.hermesRunAuthority.runId, actorId: scope.userId,
              metadata: { path: ['taskId'], equals: task.id },
            }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 }) : [];
            const receipt = receipts.at(-1)?.metadata as Record<string, unknown> | undefined;
            const initialRecovery = ['initial_science_thinking_exhausted', 'initial_science_schema_exhausted'].includes(String(receipt?.planningFailureClass));
            if (receipt?.planningFailureClass === 'pixel_storyboard_pre_provider_rearm'
              || receipt?.planningFailureClass === 'pixel_storyboard_art_provider_timeout') {
              if (!pixelAuthority || task.executionAttempt !== 2 || owner.retryCount !== 1 || owner.result !== null)
                throw new Error('[blocked] Narrative planning recovery owner changed');
              pixelPlanningFailureClass = receipt.planningFailureClass;
              pixelPlanningRearm = await requirePixelPlanningPreProviderRearm(deps.prisma, pixelAuthority, pixelPlanningFailureClass);
              // The timeout receipt retains the paid attempt; any other call before this execution is uncertain.
              if (await deps.prisma.auditLog.count({ where: { requestId: task.id, action: 'ai.gateway.call',
                id: { notIn: pixelPlanningRearm.metadata.planningAuditIds as string[] } } }) !== 0)
                throw new Error('[blocked] Narrative planning recovery has an existing uncheckpointed provider attempt');
            } else if (initialRecovery) {
              if (![2, 3].includes(task.executionAttempt) || owner.retryCount !== task.executionAttempt - 1 || owner.result !== null
                || !narrativeSource || identity.baseIdentity !== null || base || planningContext.revision || planningContext.imageRevision
                || payload.storyboard.revisionMode || payload.storyboard.revisionTaskId || payload.storyboard.revisionImageAssetId
                || !payload.storyboard.narrativeSceneLimit || !payload.hermesRunAuthority) {
                throw new Error('[blocked] Initial science recovery source changed');
              }
              const recoveryIdentity = { runId: payload.hermesRunAuthority.runId, actorId: scope.userId, taskId: task.id,
                retryCount: owner.retryCount, taskPayload: owner.payload, sourceEvidenceIdentity,
                claimContent: identity.claimContent, narrativeSourceIdentity: narrativeSource.identity,
                remainingImageTasks: payload.storyboard.narrativeSceneLimit };
              initialScienceRecovery = await readInitialSciencePlanningRetryChain(deps.prisma, recoveryIdentity);
              const recovery = initialScienceRecovery;
              if (await deps.prisma.auditLog.count({ where: { requestId: task.id, action: 'ai.gateway.call',
                id: { notIn: recovery.consumedAuditIds } } })) {
                throw new Error('[blocked] Initial science recovery has an existing uncheckpointed provider attempt');
              }
              revalidateInitialScienceRecovery = async (tx, beforePlanning) => {
                const current = await requireIllustrationReviewAuthority(tx, {
                  taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId,
                });
                const chain = await readInitialSciencePlanningRetryChain(tx, recoveryIdentity);
                const run = await tx.hermesResearchRun.findUnique({ where: { id: recoveryIdentity.runId } });
                const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds },
                  researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
                if (current.owner.executionAttempt !== task.executionAttempt || current.owner.retryCount !== owner.retryCount
                  || !isDeepStrictEqual(current.owner.result, expectedResult)
                  || !isDeepStrictEqual(current.owner.payload, owner.payload) || !isDeepStrictEqual(current.payload, payload)
                  || !isDeepStrictEqual(chain, recovery) || run?.maxAgentTasks !== 9 || run.status !== 'generating_storyboard'
                  || currentClaims.length !== payload.sourceClaimIds.length || currentClaims.some(claim => claim.extractionStatus !== 'succeeded')
                  || presentationClaimContent(currentClaims as PresentationClaim[]) !== identity.claimContent
                  || await tx.presentationAsset.findUnique({ where: { id: task.id }, select: { id: true } })) {
                  throw new Error('[blocked] Initial science recovery authorization changed');
                }
                await requireUnchangedEvidence(tx);
                await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
              };
            } else if (task.executionAttempt !== 2 || owner.retryCount !== 1 || owner.result !== null || receipts.length !== 1
              || receipt?.correction !== 'storyboard_planning_retry' || receipt.previousExecutionAttempt !== 1
              || receipt.chargeableAttempts !== 1 || receipt.newTaskCount !== 0
              || !isDeepStrictEqual(receipt.taskPayload, owner.payload)
              || receipt.baseIdentity !== identity.baseIdentity || receipt.sourceEvidenceIdentity !== identity.sourceEvidenceIdentity) {
              throw new Error('[blocked] Previous paid storyboard attempt has no saved plan; explicit new planning is required');
            }
          }
          if (planningContext.imageRevision) {
            const rejected = planningContext.imageRevision;
            const reusableRejectedView = hasStoryboardSourceSupport(rejected.view.document, claims, paperOriginals)
              ? rejected.view : undefined;
            planned = await generateIllustrationStoryboard(durableGateway, claims, payload.storyboard,
              reusableRejectedView, paperOriginals, narrativeSource?.context, { summary: rejected.feedback, issues: [] }, undefined, persistence, onScienceRejected);
          } else if (planningContext.revision) {
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
            const previousHasCurrentSupport = hasStoryboardSourceSupport(previous.document, claims, paperOriginals);
            planned = !previousHasCurrentSupport || (payload.storyboard.narrative && (issues?.some(issue => issue.kind === 'requires_replan')
              || previous.document.scenes.length > (payload.storyboard.narrativeSceneLimit ?? 6)))
              ? await generateIllustrationStoryboard(durableGateway, claims, payload.storyboard, previousHasCurrentSupport ? {
                document: previous.document, locale: payload.storyboard.locale, style: payload.storyboard.style, output: 'image',
              } : undefined, paperOriginals, narrativeSource?.context, { summary: feedback, issues: issues ?? [] }, undefined, persistence, onScienceRejected)
              : await clarifyIllustrationLabels(planningGateway!, claims, payload.storyboard, previous, feedback, issues);
          } else {
            if (initialScienceRecovery) {
              const recovery = initialScienceRecovery;
              const recoveryGateway: Pick<AiGateway, 'completeStructured'> = {
                completeStructured: async (guard, messages, opts) => {
                  await deps.prisma.$transaction(tx => revalidateInitialScienceRecovery!(tx, true), { isolationLevel: 'Serializable' });
                  return options.gateway!.completeStructured(guard, messages, { ...opts, primaryProviderOnly: true });
                },
              };
              planned = await generateIllustrationStoryboard(recoveryGateway, claims, payload.storyboard,
                undefined, paperOriginals, narrativeSource?.context, undefined, recovery.receipts.at(-1)!.failureClass, persistence, onScienceRejected);
            } else if (sourceSupportFeedback) {
              planned = await generateIllustrationStoryboard(durableGateway, claims, payload.storyboard, undefined, paperOriginals,
                narrativeSource?.context, { summary: sourceSupportFeedback, issues: [] }, undefined, persistence, onScienceRejected);
            } else {
              planned = await generateIllustrationStoryboard(durableGateway, claims, payload.storyboard, base?.view, paperOriginals, narrativeSource?.context,
                undefined, undefined, persistence, onScienceRejected);
            }
          }
          planned.reviewFormat = 2;
          await persistPlan(planned);
        }
        const priorBlocked = expectedResult && typeof expectedResult === 'object' && !Array.isArray(expectedResult)
          ? (expectedResult as Record<string, unknown>).storyboardReview : undefined;
        if (priorBlocked === undefined) {
          acceptance = readStoryboardAcceptance(expectedResult, planned.document, identity, task.id);
          if (acceptance) requireStoryboardSourceSupport(acceptance.document, claims, paperOriginals);
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
        if (priorReview !== undefined && !artCorrection) {
          readStoredIllustrationIssues(priorReview, planned.document, claims, task.id, sourceEvidenceIdentity);
          throw new Error('[blocked] Illustration needs upstream scientific revision: ' + (priorReview as { summary: string }).summary.slice(0, 300));
        }
        const reviewContext = {
          authorizationContext: Object.freeze({ taskId: task.id, actorId: scope.userId, workspaceId: researchObject.workspaceId }),
          illustrationContext: { executionAttempt: task.executionAttempt, claimContent: presentationClaimContent(claims), baseIdentity: planningContext.identity,
            ...(pixelOutputResume ? { outputResumeReceiptId: pixelOutputResume.id } : {}),
            ...(savedOutputResume ? { outputResumeReceiptId: savedOutputResume.id, outputResumeMode: 'saved-final-review' as const,
              outputResumeTarget: { provider: String(savedOutputResume.metadata.reviewProvider), model: String(savedOutputResume.metadata.reviewModel),
                promptHash: String(savedOutputResume.metadata.reviewPromptHash) } } : {}),
            ...(artCorrection || pixelRecovery || initialScienceRecovery || planningContinuation || savedOutputResume || requireStandaloneScienceRecoveryUnchanged ? { primaryProviderOnly: true as const } : {}) },
          researchObjectId: payload.researchObjectId, versionId: payload.versionId, sourceEvidenceIdentity,
          structuredIssues: planned.reviewFormat === 2,
          narrativeSource: narrativeSource?.context,
          ...(!artCorrection && previousDefectReport ? { previousDefectReport } : {}),
        };
        const gateway: Pick<AiGateway, 'reviewScientific'> = { reviewScientific: async (input, guard) => {
          await requireHermesAuthority(deps.prisma);
          if (requirePlanningContinuationUnchanged) await deps.prisma.$transaction(requirePlanningContinuationUnchanged, { isolationLevel: 'Serializable' });
          if (revalidateInitialScienceRecovery) await deps.prisma.$transaction(tx => revalidateInitialScienceRecovery!(tx, false), { isolationLevel: 'Serializable' });
          if (requireStandaloneScienceRecoveryUnchanged) await deps.prisma.$transaction(requireStandaloneScienceRecoveryUnchanged, { isolationLevel: 'Serializable' });
          if (pixelRecovery) await deps.prisma.$transaction(requirePixelRecoveryUnchanged, { isolationLevel: 'Serializable' });
          return options.gateway!.reviewScientific!(input, guard);
        } };
        let reviewed: { document: StoryboardDocument; provenance: StoryboardReview; designSkills: DesignSkillUsage[] } | undefined;
        if (artCorrection) {
          if (!persistArtCorrection) throw new Error('[blocked] Art correction persistence is unavailable');
          if (artCorrection.review) {
            reviewed = { document: planned.document, provenance: artCorrection.review, designSkills: artCorrection.reviewDesignSkills ?? [] };
          } else {
            if (artCorrection.reviewSubmittedExecutionAttempt !== undefined)
              throw new Error('[blocked] Art correction review outcome is uncertain; preserve the submitted candidate');
            artCorrection = { ...artCorrection, reviewSubmittedExecutionAttempt: task.executionAttempt };
            await persistArtCorrection(artCorrection);
            reviewed = await reviewIllustrationStoryboard(gateway, claims, payload.storyboard, planned.document,
              { ...reviewContext, acceptanceOnly: true });
            if (!isDeepStrictEqual(reviewed.document, planned.document) || reviewed.provenance.decision === 'revised')
              throw new Error('[blocked] Art correction final review cannot revise the candidate');
            artCorrection = { ...artCorrection, review: reviewed.provenance, reviewDesignSkills: reviewed.designSkills };
            await persistArtCorrection(artCorrection);
          }
          if (reviewed.provenance.decision !== 'accepted')
            throw new Error('[blocked] Illustration needs upstream scientific revision: ' + reviewed.provenance.summary.slice(0, 300));
        } else if (!acceptance) {
          reviewed = await reviewIllustrationStoryboard(gateway, claims, payload.storyboard, planned.document, reviewContext);
        }
        if (reviewed?.provenance.decision === 'revised') {
          acceptance = { document: reviewed.document, firstReview: reviewed.provenance, designSkills: reviewed.designSkills };
          await persistPlan!(planned, undefined, acceptance);
          designSkills = mergeDesignSkillUsage(designSkills, reviewed.designSkills);
        }
        if (acceptance) {
          illustrationRevisionReview = acceptance.firstReview;
          designSkills = mergeDesignSkillUsage(designSkills, acceptance.designSkills ?? []);
          if (acceptance.review) {
            reviewed = { document: acceptance.document, provenance: acceptance.review, designSkills: [] };
          } else {
            // Record before invoking the provider: a crash in this window is uncertain,
            // never permission to repeat a paid acceptance call on worker restart.
            if (acceptance.submittedExecutionAttempt !== undefined)
              throw new Error('[blocked] Illustration acceptance outcome is uncertain; preserve the submitted candidate');
            acceptance = { ...acceptance, submittedExecutionAttempt: task.executionAttempt };
            await persistPlan!(planned, undefined, acceptance);
            reviewed = await reviewIllustrationStoryboard(gateway, claims, payload.storyboard, acceptance.document,
              { ...reviewContext, acceptanceOnly: true });
            acceptance = { ...acceptance, review: reviewed.provenance,
              designSkills: mergeDesignSkillUsage(acceptance.designSkills, reviewed.designSkills) };
            await persistPlan!(planned, undefined, acceptance);
          }
          if (reviewed.provenance.decision === 'revised')
            throw new Error('[blocked] Final illustration acceptance requested another revision');
          if (reviewed.provenance.decision === 'blocked') {
            await persistPlan!({ ...planned, document: acceptance.document }, reviewed.provenance);
            throw new Error('[blocked] Illustration needs upstream scientific revision: ' + reviewed.provenance.summary.slice(0, 300));
          }
        }
        if (!reviewed) throw new Error('[blocked] Illustration review is missing');
        if (reviewed.provenance.decision === 'blocked') {
          await persistPlan!(planned, reviewed.provenance);
          throw new Error('[blocked] Illustration needs upstream scientific revision: ' + reviewed.provenance.summary.slice(0, 300));
        }
        storyboardDocument = reviewed.document; illustrationReview = reviewed.provenance;
        designSkills = mergeDesignSkillUsage(designSkills, reviewed.designSkills);
      }
      }
      bytes = renderStoryboard(storyboardDocument!, payload.storyboard); extension = 'html'; contentType = 'text/html; charset=utf-8';
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
      await requireTechnicalRecovery(tx);
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
      if (requireStandaloneScienceRecoveryUnchanged) await requireStandaloneScienceRecoveryUnchanged(tx);
      if (illustrationReview) {
        await requireHermesAuthority(tx);
        await requireIllustrationOriginalArtifacts(tx, sourceEvidence, researchObject.workspaceId);
        if (artCorrection) {
          if (!artCorrectionIdentity || !isDeepStrictEqual(currentTask.payload, owner.payload))
            throw new Error('[blocked] Art correction completion identity changed');
          await requireStoryboardArtCorrectionAuthorization(tx, { taskId: task.id, actorId: scope.userId,
            workspaceId: researchObject.workspaceId, payload, executionAttempt: task.executionAttempt,
            retryCount: currentTask.retryCount, result: currentTask.result });
          const original = readStoryboardCheckpoint(currentTask.result, artCorrectionIdentity);
          const corrected = original && readStoryboardArtCorrection(currentTask.result, original.document,
            artCorrectionIdentity, task.id, task.executionAttempt);
          if (!corrected || corrected.review?.decision !== 'accepted'
            || !isDeepStrictEqual(corrected.review, illustrationReview)
            || !isDeepStrictEqual(corrected.planned?.document, storyboardDocument))
            throw new Error('[blocked] Art correction acceptance changed before completion');
        }
        if (illustrationRevisionReview) {
          const identity = { payload, sourceEvidenceIdentity, claimContent: presentationClaimContent(claims),
            baseIdentity: planningContext.identity, ...(narrativeSource ? { narrativeSourceIdentity: narrativeSource.identity } : {}) };
          const saved = readStoryboardCheckpoint(currentTask.result, identity);
          const accepted = saved && readStoryboardAcceptance(currentTask.result, saved.document, identity, task.id);
          if (!accepted || accepted.review?.decision !== 'accepted'
            || !isDeepStrictEqual(accepted.review, illustrationReview)
            || !isDeepStrictEqual(accepted.firstReview, illustrationRevisionReview)
            || !isDeepStrictEqual(accepted.document, storyboardDocument))
            throw new Error('[blocked] Final storyboard acceptance changed before completion');
        }
      }
      if (nativeIllustration) {
        await requireNativeIllustrationUnchanged!(tx);
        const saved = currentTask.result as Record<string, unknown>;
        const cp = readNativeAgentExecution(saved)?.checkpoint;
        if (cp?.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls || cp.responseHash !== nativeIllustration.review.responseHash
          || !isDeepStrictEqual(saved.storyboardReview, nativeIllustration.review)
          || !isDeepStrictEqual(saved.nativeIllustration, nativeIllustration.nativeAgent)
          || !isDeepStrictEqual(saved.illustrationPrompts, nativeIllustration.prompts))
          throw new Error('[blocked] Native illustration proof changed before asset write');
      }
      successfulPrivateResult = privateStoryboardResult(currentTask.result);
      // withPresentationAssetWrite holds the shared storage-reference lock through upload and row creation.
      await tx.trashObjectCleanup.updateMany({ where: { objectKey }, data: { state: 'retained', lastError: null } });
      await deps.storage!.putObject(objectKey, videoOutput ? createReadStream(videoOutput.filePath) : bytes, { contentType, sha256: contentHash });
      const created = await tx.presentationAsset.create({ data: {
        id: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind,
        objectKey, contentHash, generator, generatorVersion, promptHash, label: PRESENTATION_ASSET_LABEL,
        provenance: { ...(scientificMedia ? { sourceEvidenceIdentity, sourceEvidenceIds: sourceEvidence.map((row) => row.id) } : {}), source: payload.sceneImage ? 'approved_storyboard_scene' : payload.video ? 'approved_storyboard_video' : 'verified_claims', ...(payload.sceneImage && sceneParent ? { subtype: 'storyboard_scene_image', sceneImage: { ...payload.sceneImage }, parentIdentity: sceneParent.identity, storyboardContentHash: sceneParent.contentHash, ...(needsGeneratedImageReview(payload) ? { pixelReviewRequired: 'generated-image-v1' } : {}), ...(sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]?.paperOriginal ? { paperOriginal: { sourceAssetId: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.assetId, sourceContentHash: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.contentHash, sourceObjectKey: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.objectKey } } : {}) } : {}), ...(videoProvenance ?? {}), ...(illustrationReview ? { illustrationReview } : {}), ...(illustrationRevisionReview ? { illustrationRevisionReview } : {}), ...(designSkills ? { designSkills } : {}), ...(styleReference ? { styleReference: { assetId: styleReference.id, contentHash: styleReference.contentHash, role: 'style' } } : {}), ...(sceneParent?.view.document.scenes[payload.sceneImage!.sceneIndex]?.illustration ? { illustrationCompilation: { skill: 'openscience-research-illustration', version: '6', mode: 'structured_brief' } } : {}), taskId: task.id, sourceClaimIds: payload.sourceClaimIds, contentType, ...(storyboardDocument && payload.storyboard ? { subtype: 'sourced_storyboard', storyboardDocument: JSON.parse(JSON.stringify(storyboardDocument)), storyboardSettings: JSON.parse(JSON.stringify(payload.storyboard)) } : {}) },
      } });
      await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: created.id, claimId, researchObjectId: payload.researchObjectId, versionId: payload.versionId })) });
      if (storyboardDocument) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'sourced_storyboard', baseAssetId: payload.storyboard?.baseAssetId ?? null } }, tx);
      if (payload.sceneImage) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'storyboard_scene_image', storyboardAssetId: payload.sceneImage.storyboardAssetId, sceneIndex: payload.sceneImage.sceneIndex, provider: imageProvider, model: generatorVersion, contentHash, ...(sceneParent?.view.document.scenes[payload.sceneImage.sceneIndex]?.paperOriginal ? { paperOriginal: { sourceAssetId: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.assetId, sourceContentHash: sceneParent.view.document.scenes[payload.sceneImage.sceneIndex]!.paperOriginal!.contentHash } } : {}) } }, tx);
      if (payload.video) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'approved_storyboard_video', storyboardAssetId: payload.video.storyboardAssetId, contentHash, timingStatus: 'estimated_requires_review' } }, tx);
      return created;
    });
    if (actualImageReview) return finishGeneratedImageReview(asset);
    return { ...successfulPrivateResult, assetId: asset.id, kind: asset.kind, status: asset.status, contentHash, sourceClaimIds: payload.sourceClaimIds };
  };
}

function imageExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  throw new Error('[blocked] Unsupported image content type');
}
