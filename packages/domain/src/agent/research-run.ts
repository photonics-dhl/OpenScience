import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import { requireActiveMembership } from '../workspace/helpers';
import { now } from '../workspace/types';
import { confirmIngestionClaimEvidenceBridge, previewIngestionClaimEvidenceBridge, type IngestionClaimSelection } from '../ingestion/claim-evidence-bridge';
import { MAX_INGESTION_CLAIMS } from '../ingestion/reviewed-claim-suggestions';
import { ensureHermesIngestionReview, materializeHermesIngestion, recoverHermesSourceReviewInTransaction, type IngestionDeps } from '../ingestion/ingestion-service';
import { inspectHermesSourceReviewRecovery } from '../ingestion/source-review-recovery';
import { dispatchAgentTask, findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction, type AgentDeps } from './agent';
import { ONCHIP_FIELD_SAMPLING_PROFILE, ONCHIP_SCENE_ROLES, ONCHIP_SOURCE_CONTENT_HASH, CONTENT_DRIVEN_PROFILE, CONTENT_DRIVEN_IMAGE_PROFILE, VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { parsePresentationGenerationPayload, transitionHermesPresentationAsset, type HermesPresentationAuthority, type PresentationGenerationPayload } from '../assets/presentation-asset';
import { parseStoryboardDocument, presentationStoryboardView } from '../assets/storyboard';
import { presentationSceneImageView, requireSceneImageParent } from '../assets/scene-image';
import { publicEvidenceRow } from '../research-intelligence/claim-evidence-service';

const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const READY_INGESTION_STATES = new Set(['needs_review', 'confirmed', 'written']);
const FAILED_INGESTION_STATES = new Set(['failed_retryable', 'failed_blocked']);
const RUN_INCLUDE = { steps: { orderBy: { ordinal: 'asc' as const } } } as const;
type GenerationProfile = typeof ONCHIP_FIELD_SAMPLING_PROFILE | typeof CONTENT_DRIVEN_PROFILE | typeof CONTENT_DRIVEN_IMAGE_PROFILE | typeof VISUAL_NARRATIVE_PROFILE;
type GenerationGrant = { profile: typeof ONCHIP_FIELD_SAMPLING_PROFILE; maxAgentTasks: 7 }
  | { profile: typeof CONTENT_DRIVEN_PROFILE; maxAgentTasks: 8 }
  | { profile: typeof CONTENT_DRIVEN_IMAGE_PROFILE; maxAgentTasks: 7 }
  | { profile: typeof VISUAL_NARRATIVE_PROFILE; maxAgentTasks: 9 };
export interface HermesNarrativeSettings { locale: 'zh' | 'en'; style: string; instruction: string }
export type HermesNarrativeGrant = HermesNarrativeSettings & { profile: typeof VISUAL_NARRATIVE_PROFILE; maxAgentTasks: 9 };
function narrativeSettings(value: unknown): HermesNarrativeSettings {
  const settings = jsonRecord(value);
  if (Object.keys(settings).sort().join(',') !== 'instruction,locale,style'
    || !['zh', 'en'].includes(String(settings.locale))
    || typeof settings.style !== 'string' || !settings.style.trim() || settings.style.length > 100
    || typeof settings.instruction !== 'string' || !settings.instruction.trim() || settings.instruction.length > 1000) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'A bounded narrative goal, language and style are required');
  }
  return { locale: settings.locale as 'zh' | 'en', style: settings.style, instruction: settings.instruction };
}
const imageRun = (profile: string | null) => profile === CONTENT_DRIVEN_IMAGE_PROFILE || profile === VISUAL_NARRATIVE_PROFILE;
function validGrant(value: { profile: string | null; maxAgentTasks: number | null }): boolean {
  return (value.profile === ONCHIP_FIELD_SAMPLING_PROFILE && value.maxAgentTasks === 7)
    || (value.profile === CONTENT_DRIVEN_PROFILE && value.maxAgentTasks === 8)
    || (value.profile === CONTENT_DRIVEN_IMAGE_PROFILE && value.maxAgentTasks === 7)
    || (value.profile === VISUAL_NARRATIVE_PROFILE && value.maxAgentTasks === 9);
}

export type HermesResearchRunStatus = 'running' | 'awaiting_source_review' | 'awaiting_claim_review'
  | 'generating_storyboard' | 'awaiting_storyboard_review' | 'generating_scene_images'
  | 'awaiting_scene_images_review' | 'generating_video' | 'awaiting_video_review'
  | 'succeeded' | 'failed' | 'stopped';
export type HermesResearchStepStatus = 'waiting' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'stopped';
export type HermesResearchStage = 'source_ingestion' | 'source_composition' | 'source_review' | 'storyboard' | 'scene_image' | 'video';

export type HermesResearchRunErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESEARCH_OBJECT_NOT_DRAFT'
  | 'SOURCE_NOT_READY'
  | 'CONCURRENT_UPDATE';

export class HermesResearchRunError extends Error {
  constructor(public readonly code: HermesResearchRunErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HermesResearchRunError';
  }
}

export interface HermesResearchRunDeps extends AgentDeps {
  storage?: IngestionDeps['storage'];
  canResumeImageBeforeSubmission?: (requestId: string) => Promise<boolean>;
  inspectImageRecoveryState?: (requestId: string) => Promise<'before_submission' | 'completed' | 'failed' | 'usage_limited' | 'uncertain' | 'submitted_without_result' | 'unsafe'>;
}
export interface HermesSourceReviewDeps extends HermesResearchRunDeps { storage: IngestionDeps['storage'] }

export interface HermesResearchRunView {
  id: string;
  researchObjectId: string;
  actorId: string;
  versionId: string | null;
  profile: GenerationProfile | null;
  maxAgentTasks: number | null;
  generationSettings?: HermesNarrativeSettings | null;
  sourceClaimIds: string[];
  status: HermesResearchRunStatus;
  version: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  canRetryGeneration?: boolean;
  chargeableAttempts?: number;
  availableImageCount?: number;
  imageUsageLimited?: boolean;
  steps: Array<{
    id: string;
    stage: HermesResearchStage;
    ordinal: number;
    status: HermesResearchStepStatus;
    ingestionTaskId: string | null;
    artifactId: string | null;
    agentTaskId: string | null;
    presentationAssetId: string | null;
    availableAssetId?: string;
    availableAssetStatus?: string;
    error: string | null;
  }>;
}

type RunRow = Prisma.HermesResearchRunGetPayload<{ include: typeof RUN_INCLUDE }>;

function toView(run: RunRow, recovery?: { chargeableAttempts: number }): HermesResearchRunView {
  return {
    id: run.id,
    researchObjectId: run.researchObjectId,
    actorId: run.actorId,
    versionId: run.versionId,
    profile: run.profile as GenerationProfile | null,
    maxAgentTasks: run.maxAgentTasks,
    generationSettings: run.profile === VISUAL_NARRATIVE_PROFILE ? narrativeSettings(run.generationSettings) : null,
    sourceClaimIds: run.sourceClaimIds,
    status: run.status as HermesResearchRunStatus,
    version: run.version,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(recovery ? { canRetryGeneration: true, chargeableAttempts: recovery.chargeableAttempts } : {}),
    steps: run.steps.map((step) => ({
      id: step.id,
      stage: step.stage as HermesResearchStage,
      ordinal: step.ordinal,
      status: step.status as HermesResearchStepStatus,
      ingestionTaskId: step.ingestionTaskId,
      artifactId: step.artifactId,
      agentTaskId: step.agentTaskId,
      presentationAssetId: step.presentationAssetId,
      error: step.error,
    })),
  };
}

function requestDigest(input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[]; generation?: HermesNarrativeGrant }): string {
  return createHash('sha256').update(JSON.stringify({
    actorId: input.actorId,
    researchObjectId: input.researchObjectId,
    ingestionTaskIds: [...input.ingestionTaskIds].sort(),
    ...(input.generation ? { generation: input.generation } : {}),
  })).digest('hex');
}

export async function createHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[]; idempotencyKey: string; generation?: HermesNarrativeGrant },
  ctx: AuditContext = {},
): Promise<HermesResearchRunView> {
  const taskIds = [...new Set(input.ingestionTaskIds)].sort();
  const settings = input.generation ? narrativeSettings({ locale: input.generation.locale, style: input.generation.style, instruction: input.generation.instruction }) : undefined;
  if (input.generation && (input.generation.profile !== VISUAL_NARRATIVE_PROFILE || input.generation.maxAgentTasks !== 9 || taskIds.length !== 1)) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Automatic paper narratives require one paper and the bounded image grant');
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200 || taskIds.length === 0 || taskIds.length !== input.ingestionTaskIds.length) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'A non-empty unique ingestion task list and idempotency key are required');
  }
  const digest = requestDigest({ ...input, ingestionTaskIds: taskIds });
  const createOnce = () => deps.prisma.$transaction(async (tx) => {
    const replay = await tx.hermesResearchRun.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: RUN_INCLUDE });
    const researchObject = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
    if (!researchObject) throw new HermesResearchRunError('NOT_FOUND', 'Research object not found');
    const { workspace, membership } = await requireActiveMembership(tx, researchObject.workspaceId, input.actorId)
      .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Research object not found', { cause }); });
    if (!WRITE_ROLES.has(membership.role)) throw new HermesResearchRunError('FORBIDDEN', 'Research object write permission is required');
    if (researchObject.status !== 'draft') throw new HermesResearchRunError('RESEARCH_OBJECT_NOT_DRAFT', 'Hermes research runs require a draft research object');
    if (replay) {
      if (replay.actorId !== input.actorId || replay.researchObjectId !== input.researchObjectId || replay.requestDigest !== digest) {
        throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different Hermes research run');
      }
      return replay;
    }

    if (settings) {
      const existing = await tx.hermesResearchRun.findFirst({ where: {
        actorId: input.actorId, researchObjectId: input.researchObjectId, profile: VISUAL_NARRATIVE_PROFILE,
        steps: { some: { stage: 'source_ingestion', ingestionTaskId: taskIds[0]! } },
      }, select: { id: true } });
      if (existing) throw new HermesResearchRunError('SOURCE_NOT_READY',
        'This paper already has a Hermes narrative run. Open the existing run to view its progress or failure; starting again cannot replace it.');
    }

    const tasks = await tx.ingestionTask.findMany({
      where: { id: { in: taskIds } },
      include: { batch: true, agentTask: true, artifact: true },
    });
    if (tasks.length !== taskIds.length) throw new HermesResearchRunError('SOURCE_NOT_READY', 'One or more ingestion tasks are unavailable');
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ordered = taskIds.map((id) => byId.get(id)!);
    for (const task of ordered) {
      if (task.batch.researchObjectId !== researchObject.id || !task.agentTaskId || !task.agentTask
        || task.agentTask.id !== task.agentTaskId || FAILED_INGESTION_STATES.has(task.state)) {
        throw new HermesResearchRunError('SOURCE_NOT_READY', 'Ingestion source is failed, incomplete, or belongs to another research object');
      }
      if (settings && (task.batch.userId !== input.actorId || task.agentTask.kind !== 'sdf.extract'
        || task.agentTask.deletedAt || task.artifact.deletedAt || task.artifact.bytesPurgedAt
        || task.artifact.workspaceId !== workspace.id || task.artifact.mimeType !== 'application/pdf')) {
        throw new HermesResearchRunError('SOURCE_NOT_READY', 'The automatic narrative requires the current user’s available PDF analysis');
      }
    }

    const run = await tx.hermesResearchRun.create({
      data: {
        researchObjectId: researchObject.id,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: digest,
        ...(settings ? { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, generationSettings: { ...settings } } : {}),
        steps: {
          create: ordered.map((task, ordinal) => ({
            stage: 'source_ingestion', ordinal,
            ingestionTaskId: task.id, artifactId: task.artifactId, agentTaskId: task.agentTaskId,
            status: READY_INGESTION_STATES.has(task.state) ? 'succeeded' : 'waiting',
          })),
        },
      },
      include: RUN_INCLUDE,
    });
    await recordAudit(deps, tx, {
      actorId: input.actorId,
      action: 'hermes.research_run.create',
      workspaceId: workspace.id,
      targetType: 'hermes_research_run',
      targetId: run.id,
      metadata: { researchObjectId: researchObject.id, ingestionTaskCount: ordered.length,
        ...(settings ? { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, intermediateReview: 'hermes', publicationAuthorized: false } : {}) },
    }, ctx);
    return run;
  }, { isolationLevel: 'Serializable' });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return toView(await createOnce());
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2034') {
        if (attempt < 2) continue;
        break;
      }
      if (code !== 'P2002') throw error;
      const replay = await deps.prisma.hermesResearchRun.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: RUN_INCLUDE });
      if (!replay) throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different Hermes research run', { cause: error });
      await getHermesResearchRun(deps, { actorId: input.actorId, researchObjectId: input.researchObjectId, runId: replay.id });
      if (replay.requestDigest !== digest) {
        throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different Hermes research run', { cause: error });
      }
      return toView(replay);
    }
  }
  throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes research run transaction could not be serialized');
}

export async function getExistingHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; ingestionTaskId: string },
): Promise<HermesResearchRunView | null> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new HermesResearchRunError('NOT_FOUND', 'Research object not found');
  await requireActiveMembership(deps.prisma, ro.workspaceId, input.actorId)
    .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Research object not found', { cause }); });
  const run = await deps.prisma.hermesResearchRun.findFirst({ where: {
    actorId: input.actorId, researchObjectId: input.researchObjectId, profile: VISUAL_NARRATIVE_PROFILE,
    steps: { some: { stage: 'source_ingestion', ingestionTaskId: input.ingestionTaskId } },
  }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  return run ? getHermesResearchRun(deps, { ...input, runId: run.id }) : null;
}

export async function getHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; runId: string },
): Promise<HermesResearchRunView> {
  const run = await deps.prisma.hermesResearchRun.findUnique({ where: { id: input.runId }, include: RUN_INCLUDE });
  if (!run || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId) {
    throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
  }
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: run.researchObjectId } });
  if (!ro) throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
  const authority = await requireActiveMembership(deps.prisma, ro.workspaceId, input.actorId)
    .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found', { cause }); });
  const recovery = WRITE_ROLES.has(authority.membership.role)
    ? run.profile === VISUAL_NARRATIVE_PROFILE
      ? run.versionId
        ? await inspectStoryboardCheckpointRecovery(deps.prisma, run).then(proof => proof ? { chargeableAttempts: 0 } : null).catch(() => null)
        : await inspectHermesSourceReviewRecovery(deps.prisma, run.id).then(proof => proof ? { chargeableAttempts: 1 } : null).catch(() => null)
      : await inspectGenerationRecovery(deps.prisma, run, deps.canResumeImageBeforeSubmission, deps.inspectImageRecoveryState).catch(() => null) : null;
  const view = toView(run, recovery ?? undefined);
  const imageSteps = run.steps.filter(step => step.stage === 'scene_image' && step.agentTaskId);
  if (run.versionId && imageSteps.length) {
    const assets = await deps.prisma.presentationAsset.findMany({ where: {
      id: { in: imageSteps.map(step => step.agentTaskId!) }, researchObjectId: run.researchObjectId,
      versionId: run.versionId, kind: 'image', status: { in: ['draft', 'approved'] },
    }, include: { sourceClaims: { select: { claimId: true } } } });
    const parentId = run.steps.find(step => step.stage === 'storyboard')?.presentationAssetId;
    for (const asset of assets) {
      const image = presentationSceneImageView(asset);
      const step = view.steps.find(item => item.agentTaskId === asset.id);
      if (!step || !image || image.storyboardAssetId !== parentId || image.sceneIndex !== step.ordinal
        || !isDeepStrictEqual(asset.sourceClaims.map(link => link.claimId).sort(), [...run.sourceClaimIds].sort())) continue;
      step.availableAssetId = asset.id;
      step.availableAssetStatus = asset.status;
    }
    view.availableImageCount = view.steps.filter(step => Boolean(step.availableAssetId)).length;
    if (deps.inspectImageRecoveryState && run.status === 'failed') {
      const states = await Promise.all(imageSteps.map(step => deps.inspectImageRecoveryState!(step.agentTaskId!).catch(() => 'unsafe')));
      view.imageUsageLimited = states.includes('usage_limited');
    }
  }
  return view;
}

const HERMES_AUTHORITY_ERROR = '[blocked] Hermes run authority is invalid';
export const HERMES_AUTHORITY_REARM_MARKER = 'hermes-authority-pre-provider-v1';

/** Resume a saved plan whose first scientific-review request was blocked locally by input size. */
async function inspectStoryboardCheckpointRecovery(tx: Prisma.TransactionClient, run: RunRow) {
  const budgetError = '[blocked] Illustration review sources exceed the input budget; select fewer Claims';
  const outputError = 'Provider exhausted output allowance before producing text';
  const outputContinuation = run.error === outputError;
  if (run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 9 || run.status !== 'failed'
    || !run.versionId || (!outputContinuation && run.error !== budgetError) || await validateReviewedSources(tx, run) !== 'ready') return null;
  const storyboards = run.steps.filter(step => step.stage === 'storyboard');
  if (storyboards.length !== 1 || run.steps.some(step => ['scene_image', 'video'].includes(step.stage))) return null;
  const step = storyboards[0]!;
  if (step.ordinal !== 0 || step.status !== 'failed' || !step.agentTaskId || step.presentationAssetId) return null;
  const task = await tx.agentTask.findUnique({ where: { id: step.agentTaskId }, include: { session: true } });
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'failed'
    || task.executionAttempt !== (outputContinuation ? 2 : 1) || task.retryCount !== (outputContinuation ? 1 : 0)
    || task.error !== run.error
    || task.session.deletedAt || task.session.status !== 'active' || task.session.userId !== run.actorId
    || task.session.researchObjectId !== run.researchObjectId
    || task.idempotencyKey !== `hermes-run:${run.id}:storyboard:0`) return null;
  let payload: PresentationGenerationPayload;
  try { payload = parsePresentationGenerationPayload(task.payload); } catch { return null; }
  if (payload.researchObjectId !== run.researchObjectId || payload.versionId !== run.versionId
    || payload.kind !== 'interactive_html' || !payload.storyboard?.narrative || payload.storyboard.output !== 'image'
    || payload.storyboard.revisionTaskId || !isDeepStrictEqual(payload.sourceClaimIds, run.sourceClaimIds)
    || !isDeepStrictEqual(payload.hermesRunAuthority, { runId: run.id, stage: 'storyboard', ordinal: 0, profile: run.profile })) return null;
  const result = jsonRecord(task.result);
  const checkpoint = jsonRecord(result.storyboardCheckpoint);
  const planned = jsonRecord(checkpoint.planned);
  if (Object.keys(result).join(',') !== 'storyboardCheckpoint'
    || !isDeepStrictEqual(checkpoint.payload, task.payload) || typeof checkpoint.sourceEvidenceIdentity !== 'string'
    || typeof checkpoint.claimContent !== 'string' || typeof checkpoint.narrativeSourceIdentity !== 'string'
    || planned.reviewFormat !== 2 || typeof planned.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(planned.promptHash)) return null;
  let document;
  try { document = parseStoryboardDocument(planned.document, payload.sourceClaimIds, 'image'); } catch { return null; }
  if (!document.narrative || document.scenes.length > (payload.storyboard.narrativeSceneLimit ?? 6)) return null;
  const presentations = await tx.agentTask.count({ where: { kind: 'presentation.generate',
    payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  const sourceCount = run.steps.filter(item => ['source_composition', 'source_review'].includes(item.stage)).length;
  if (presentations !== 1 || sourceCount + presentations + document.scenes.length + 1 > run.maxAgentTasks
    || await tx.presentationAsset.findUnique({ where: { id: task.id }, select: { id: true } })) return null;
  const calls = await tx.auditLog.findMany({ where: { requestId: task.id, action: 'ai.gateway.call' } });
  const planningCalls = calls.filter(call => jsonRecord(call.metadata).operation === 'text');
  const reviewCalls = calls.filter(call => jsonRecord(call.metadata).operation === 'scientific_review');
  if (!planningCalls.length || planningCalls.some(call => jsonRecord(call.metadata).outcome !== 'succeeded')
    || calls.length !== planningCalls.length + reviewCalls.length || reviewCalls.length !== (outputContinuation ? 1 : 0)) return null;
  if (outputContinuation) {
    const call = reviewCalls[0]!;
    const meta = jsonRecord(call.metadata);
    const blocks = jsonRecord(meta.responseBlockCounts);
    if (call.actorId !== null || call.targetType !== 'ai_gateway' || meta.outcome !== 'failed' || meta.error !== 'provider_empty'
      || meta.finishReason !== 'length' || meta.maxOutputTokens !== 16384 || meta.outputTokens !== 16384
      || meta.requestedThinking !== 'adaptive' || blocks.text !== 0 || blocks.other !== 0
      || typeof blocks.thinking !== 'number' || !Number.isSafeInteger(blocks.thinking) || blocks.thinking < 1
      || meta.retryCount !== 0 || meta.fallbackReason !== null || meta.inputContentHash !== checkpoint.sourceEvidenceIdentity
      || meta.selectionReason !== 'source_grounded_illustration_review'
      || typeof meta.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.promptHash)) return null;
    const receipts = await tx.auditLog.findMany({ where: {
      action: 'hermes.research_run.storyboard_checkpoint_resume', targetType: 'hermes_research_run', targetId: run.id,
      actorId: run.actorId, metadata: { path: ['taskId'], equals: task.id },
    }, take: 2 });
    if (receipts.length !== 1 || receipts[0]!.createdAt >= call.createdAt) return null;
    const prior = jsonRecord(receipts[0]!.metadata);
    if (prior.stepId !== step.id || prior.previousExecutionAttempt !== 1 || prior.previousError !== budgetError
      || prior.noReplanning !== true || prior.newTaskCount !== 0 || prior.noProviderSwitch !== true
      || prior.planningPromptHash !== planned.promptHash || prior.sourceEvidenceIdentity !== checkpoint.sourceEvidenceIdentity
      || prior.narrativeSourceIdentity !== checkpoint.narrativeSourceIdentity) return null;
  }
  // The worker revalidates the full checkpoint, current sources and paper identity before any provider call.
  return { task, step, checkpoint, planningAuditIds: planningCalls.map(call => call.id),
    recoveryAction: outputContinuation ? 'hermes.research_run.storyboard_output_resume' : 'hermes.research_run.storyboard_checkpoint_resume',
    ...(outputContinuation ? { truncationAuditId: reviewCalls[0]!.id } : {}) };
}

type GenerationRecoveryPlan = {
  storyboardAssetId: string;
  chargeable: Array<{ stepId: string; ordinal: number; oldTaskId: string; sessionId: string; payload: Record<string, unknown> }>;
  rearm: Array<{ stepId: string; ordinal: number; taskId: string; error: string; executionAttempt: number }>;
  resume: Array<{ stepId: string; ordinal: number; taskId: string }>;
  preserved: Array<{ stepId: string; taskId: string; assetId: string }>;
};

async function inspectGenerationRecovery(
  tx: Prisma.TransactionClient,
  run: RunRow,
  canResumeImageBeforeSubmission?: (requestId: string) => Promise<boolean>,
  inspectImageRecoveryState?: HermesResearchRunDeps['inspectImageRecoveryState'],
): Promise<(GenerationRecoveryPlan & { chargeableAttempts: number }) | null> {
  if (run.status !== 'failed' || !((run.profile === CONTENT_DRIVEN_PROFILE && run.maxAgentTasks === 8) || (run.profile === CONTENT_DRIVEN_IMAGE_PROFILE && run.maxAgentTasks === 7))
    || !run.versionId || run.sourceClaimIds.length === 0) return null;
  if (await validateReviewedSources(tx, run) !== 'ready') return null;
  const storyboardStep = run.steps.find(step => step.stage === 'storyboard');
  const storyboard = storyboardStep?.presentationAssetId ? await tx.presentationAsset.findUnique({
    where: { id: storyboardStep.presentationAssetId }, include: { sourceClaims: { select: { claimId: true } } },
  }) : null;
  const storyboardClaimIds = storyboard?.sourceClaims.map(link => link.claimId).sort() ?? [];
  const storyboardView = storyboard && storyboard.status === 'approved'
    && storyboard.researchObjectId === run.researchObjectId && storyboard.versionId === run.versionId
    && isDeepStrictEqual(storyboardClaimIds, run.sourceClaimIds)
    ? presentationStoryboardView(storyboard, storyboardClaimIds) : undefined;
  if (!storyboard || !storyboardView || (run.profile === CONTENT_DRIVEN_PROFILE && (storyboardView.output !== 'video' || storyboardView.document.scenes.some(scene => !scene.animation))) || (run.profile === CONTENT_DRIVEN_IMAGE_PROFILE && storyboardView.output !== 'image')) return null;
  const sceneSteps = run.steps.filter(step => step.stage === 'scene_image').sort((a, b) => a.ordinal - b.ordinal);
  if (sceneSteps.length !== storyboardView.document.scenes.length
    || sceneSteps.some((step, index) => step.ordinal !== index || !step.agentTaskId)) return null;

  const plan: GenerationRecoveryPlan = { storyboardAssetId: storyboard.id, chargeable: [], rearm: [], resume: [], preserved: [] };
  for (const step of sceneSteps) {
    const task = await tx.agentTask.findUnique({ where: { id: step.agentTaskId! }, include: { session: true } });
    if (!task || task.kind !== 'presentation.generate' || task.session.userId !== run.actorId
      || task.session.researchObjectId !== run.researchObjectId || task.session.status !== 'active') return null;
    let payload: PresentationGenerationPayload;
    try { payload = parsePresentationGenerationPayload(task.payload); } catch { return null; }
    const authority = payload.hermesRunAuthority;
    if (payload.researchObjectId !== run.researchObjectId || payload.versionId !== run.versionId
      || payload.kind !== 'image' || !payload.sceneImage
      || payload.sceneImage.storyboardAssetId !== storyboard.id || payload.sceneImage.sceneIndex !== step.ordinal
      || !authority || authority.runId !== run.id || authority.stage !== 'scene_image'
      || authority.ordinal !== step.ordinal || authority.profile !== run.profile
      || !isDeepStrictEqual(payload.sourceClaimIds, run.sourceClaimIds)) return null;
    const asset = await tx.presentationAsset.findUnique({ where: { id: task.id }, include: { sourceClaims: { select: { claimId: true } } } });
    if (task.status === 'succeeded' || asset) {
      const image = asset && ['draft', 'approved'].includes(asset.status) ? presentationSceneImageView(asset) : undefined;
      const parent = await requireSceneImageParent(tx, payload).catch(() => undefined);
      const provenance = asset?.provenance as Record<string, unknown> | null | undefined;
      if (!asset || !image || !parent || provenance?.parentIdentity !== parent.identity
        || image.storyboardAssetId !== storyboard.id || image.sceneIndex !== step.ordinal
        || asset.researchObjectId !== run.researchObjectId || asset.versionId !== run.versionId
        || !isDeepStrictEqual(asset.sourceClaims.map(link => link.claimId).sort(), run.sourceClaimIds)) return null;
      if (task.status === 'succeeded') {
        plan.preserved.push({ stepId: step.id, taskId: task.id, assetId: asset.id });
      } else {
        if (task.status !== 'failed' || task.executionAttempt !== 1 || task.retryCount !== 0
          || task.result !== null || task.error?.startsWith('[blocked]') || !inspectImageRecoveryState
          || await inspectImageRecoveryState(task.id) !== 'completed') return null;
        plan.resume.push({ stepId: step.id, ordinal: step.ordinal, taskId: task.id });
      }
      continue;
    }
    if (task.status !== 'failed' || ![0, 1].includes(task.executionAttempt) || task.retryCount !== 0 || task.result !== null || asset) return null;
    let recoveryState: Awaited<ReturnType<NonNullable<HermesResearchRunDeps['inspectImageRecoveryState']>>> | undefined;
    if (inspectImageRecoveryState) {
      try { recoveryState = await inspectImageRecoveryState(task.id); } catch { return null; }
    }
    // A claim transaction can fail before its first execution or provider submission.
    if (task.executionAttempt === 0 && recoveryState !== 'before_submission') return null;
    if (recoveryState === 'completed') {
      plan.resume.push({ stepId: step.id, ordinal: step.ordinal, taskId: task.id });
    } else if (recoveryState === 'before_submission'
      || (!inspectImageRecoveryState && task.error === HERMES_AUTHORITY_ERROR)) {
      plan.rearm.push({ stepId: step.id, ordinal: step.ordinal, taskId: task.id, error: task.error!, executionAttempt: task.executionAttempt });
    } else if ((recoveryState === 'failed' || recoveryState === 'usage_limited' || !inspectImageRecoveryState)
      && task.error && !task.error.startsWith('[blocked]')) {
      plan.chargeable.push({ stepId: step.id, ordinal: step.ordinal, oldTaskId: task.id, sessionId: task.sessionId, payload: payload as unknown as Record<string, unknown> });
    } else return null;
  }
  if (plan.chargeable.length + plan.rearm.length + plan.resume.length === 0) return null;
  for (const item of plan.rearm) {
    if (!canResumeImageBeforeSubmission) return null;
    try { if (await canResumeImageBeforeSubmission(item.taskId) !== true) return null; }
    catch { return null; }
  }
  const futureVideoTasks = run.profile === CONTENT_DRIVEN_IMAGE_PROFILE || run.steps.some(step => step.stage === 'video') ? 0 : 1;
  const logicalTaskCount = 1 + sceneSteps.length + futureVideoTasks;
  if (logicalTaskCount > run.maxAgentTasks!) return null;
  return { ...plan, chargeableAttempts: plan.chargeable.length };
}

export interface HermesSourceReviewInput {
  actorId: string;
  researchObjectId: string;
  runId: string;
  expectedVersion: number;
  versionId: string;
  idempotencyKey: string;
  generationGrant: GenerationGrant;
  reviews: Array<{ ingestionTaskId: string; snapshotToken: string; selections: IngestionClaimSelection[] }>;
}

export async function confirmHermesSourceReview(
  deps: HermesSourceReviewDeps,
  input: HermesSourceReviewInput,
  ctx: AuditContext = {},
) {
  if (input.generationGrant.profile === VISUAL_NARRATIVE_PROFILE) {
    throw new HermesResearchRunError('FORBIDDEN', 'Automatic review is executed internally under the original run grant');
  }
  return saveHermesSourceReview(deps, input, ctx);
}

async function saveHermesSourceReview(deps: HermesSourceReviewDeps, input: HermesSourceReviewInput, ctx: AuditContext, internal = false) {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200
    || !validGrant(input.generationGrant)) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Hermes source review requires a bounded generation grant');
  }
  const reviewIds = input.reviews.map((review) => review.ingestionTaskId);
  const requestedClaimCount = input.reviews.reduce((total, review) => total + review.selections.length, 0);
  if (reviewIds.length === 0 || new Set(reviewIds).size !== reviewIds.length || requestedClaimCount < 1 || requestedClaimCount > MAX_INGESTION_CLAIMS
    || input.reviews.some((review) => review.selections.some((selection) => !selection.attachSourceQuote
      || (selection.sourceBindings !== undefined && (!Array.isArray(selection.sourceBindings)
        || !selection.sourceBindings.some(binding => binding?.relation === 'supports')))))) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Hermes source reviews must be unique and non-empty');
  }
  const digest = createHash('sha256').update(JSON.stringify({
    actorId: input.actorId, researchObjectId: input.researchObjectId, runId: input.runId,
    versionId: input.versionId, generationGrant: input.generationGrant,
    reviews: [...input.reviews].sort((a, b) => a.ingestionTaskId.localeCompare(b.ingestionTaskId)),
  })).digest('hex');
  const execute = () => deps.prisma.$transaction(async (tx) => {
    const initial = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include: RUN_INCLUDE });
    if (!initial || initial.actorId !== input.actorId || initial.researchObjectId !== input.researchObjectId) {
      throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
    }
    if (internal !== (initial.profile === VISUAL_NARRATIVE_PROFILE)
      || (internal && (!validGrant(initial) || input.generationGrant.profile !== VISUAL_NARRATIVE_PROFILE))) {
      throw new HermesResearchRunError('FORBIDDEN', 'Hermes source review execution mode changed');
    }
    const ro = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
    const membership = ro ? await requireActiveMembership(tx, ro.workspaceId, input.actorId).catch(() => null) : null;
    if (!ro || ro.status !== 'draft' || !membership || !WRITE_ROLES.has(membership.membership.role)) {
      throw new HermesResearchRunError('FORBIDDEN', 'Hermes source review permission is unavailable');
    }
    const replay = initial.sourceReviewDigest === digest && initial.versionId === input.versionId && initial.sourceClaimIds.length > 0;
    if (replay) {
      const claims = await tx.claimNode.findMany({ where: { id: { in: initial.sourceClaimIds }, researchObjectId: input.researchObjectId, versionId: input.versionId } });
      const evidence = await tx.evidenceRecord.findMany({ where: { claimId: { in: initial.sourceClaimIds }, researchObjectId: input.researchObjectId, versionId: input.versionId } });
      if (claims.length !== initial.sourceClaimIds.length) throw new HermesResearchRunError('SOURCE_NOT_READY', 'Hermes source review material changed');
      return { run: toView(initial), claims, evidence: evidence.map(publicEvidenceRow) };
    }
    if (initial.status !== 'awaiting_source_review' || initial.version !== input.expectedVersion) {
      throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before reviewing sources');
    }
    const sourceSteps = initial.steps.filter((step) => step.stage === 'source_ingestion');
    if (!isDeepStrictEqual(reviewIds.slice().sort(), sourceSteps.map((step) => step.ingestionTaskId).sort())) {
      throw new HermesResearchRunError('VALIDATION_ERROR', 'Source reviews must exactly cover the run ingestion tasks');
    }
    const createdClaims: Array<{ id: string }> = [];
    const createdEvidence: Array<{ id: string; claimId: string }> = [];
    for (const review of input.reviews) {
      const created = await confirmIngestionClaimEvidenceBridge(deps, {
        userId: input.actorId, researchObjectId: input.researchObjectId, versionId: input.versionId,
        taskId: review.ingestionTaskId, snapshotToken: review.snapshotToken,
        idempotencyKey: `hermes-source:${input.runId}:${review.ingestionTaskId}`,
        selections: review.selections,
      }, ctx, tx, internal ? input.runId : undefined);
      createdClaims.push(...created.claims);
      createdEvidence.push(...created.evidence);
    }
    const sourceClaimIds = [...new Set(createdClaims.map((claim) => claim.id))].sort();
    if (sourceClaimIds.length !== requestedClaimCount) throw new HermesResearchRunError('VALIDATION_ERROR', 'Hermes source Claim identities are incomplete');
    const version = await tx.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
    if (!version || version.researchObjectId !== input.researchObjectId || version.status !== 'draft'
      || version.researchObject.status !== 'draft') throw new HermesResearchRunError('SOURCE_NOT_READY', 'Reviewed Version is unavailable');
    const changed = await tx.hermesResearchRun.updateMany({
      where: { id: input.runId, actorId: input.actorId, researchObjectId: input.researchObjectId, status: 'awaiting_source_review', version: input.expectedVersion },
      data: { status: 'awaiting_claim_review', versionId: input.versionId, ...input.generationGrant,
        sourceClaimIds, sourceReviewDigest: digest, version: { increment: 1 }, error: null },
    });
    if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before reviewing sources');
    await recordAudit(deps, tx, { actorId: internal ? null : input.actorId, action: internal ? 'hermes.research_run.system_source_review' : 'hermes.research_run.source_review',
      workspaceId: version.researchObject.workspaceId, targetType: 'hermes_research_run', targetId: input.runId,
      metadata: { versionId: input.versionId, sourceClaimIds, ...input.generationGrant,
        ...(internal ? { executor: 'hermes', authorizedByUserId: input.actorId } : {}) } }, ctx);
    const updated = await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: input.runId }, include: RUN_INCLUDE });
    return { run: toView(updated), claims: createdClaims, evidence: createdEvidence };
  }, { isolationLevel: 'Serializable', timeout: 30_000 });
  for (let attempt = 0; ; attempt += 1) {
    try { return await execute(); }
    catch (error) { if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue; throw error; }
  }
}

async function advanceAutomaticSources(deps: HermesResearchRunDeps, run: RunRow): Promise<'running' | 'awaiting_claim_review'> {
  if (!deps.storage) throw new HermesResearchRunError('SOURCE_NOT_READY', 'Hermes source storage is unavailable');
  const step = run.steps.find(item => item.stage === 'source_ingestion');
  if (!step?.ingestionTaskId) throw new HermesResearchRunError('SOURCE_NOT_READY', 'Hermes source binding is missing');
  const scoped = { ...deps, storage: deps.storage };
  if (await ensureHermesIngestionReview(scoped, { actorId: run.actorId, runId: run.id, taskId: step.ingestionTaskId }) === 'queued') return 'running';
  const saved = await materializeHermesIngestion(scoped, { actorId: run.actorId, runId: run.id, taskId: step.ingestionTaskId });
  const preview = await previewIngestionClaimEvidenceBridge(scoped, { userId: run.actorId, researchObjectId: run.researchObjectId,
    versionId: saved.confirmation.versionId, taskId: step.ingestionTaskId });
  const selections = preview.suggestions.flatMap(suggestion => suggestion.atomicSuggestions ?? [])
    .map(claim => ({ ...claim, attachSourceQuote: true }));
  await saveHermesSourceReview(scoped, { actorId: run.actorId, researchObjectId: run.researchObjectId, runId: run.id,
    expectedVersion: run.version, versionId: preview.versionId, idempotencyKey: `hermes-auto-source:${run.id}`,
    generationGrant: { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9 },
    reviews: [{ ingestionTaskId: step.ingestionTaskId, snapshotToken: preview.snapshotToken, selections }] }, {}, true);
  return 'awaiting_claim_review';
}

async function advanceAutomaticAssetReviews(deps: HermesResearchRunDeps, run: RunRow): Promise<void> {
  const stage = run.status === 'awaiting_storyboard_review' ? 'storyboard' : 'scene_image';
  for (const step of run.steps.filter(item => item.stage === stage && item.status === 'awaiting_approval')) {
    if (step.presentationAssetId) await transitionHermesPresentationAsset(deps, { runId: run.id, assetId: step.presentationAssetId });
  }
}

/** Explicitly renew a legacy grant before any image/video work is submitted. */
export async function authorizeHermesGenerationGrant(deps: HermesResearchRunDeps, input: {
  actorId: string; researchObjectId: string; runId: string; expectedVersion: number;
  generationGrant: { profile: typeof CONTENT_DRIVEN_PROFILE; maxAgentTasks: 8 };
}, ctx: AuditContext = {}): Promise<HermesResearchRunView> {
  if (input.generationGrant.profile !== CONTENT_DRIVEN_PROFILE || input.generationGrant.maxAgentTasks !== 8
    || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Content-driven generation requires an explicit bounded grant');
  }
  return deps.prisma.$transaction(async tx => {
    const run = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include: RUN_INCLUDE });
    if (!run || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId) {
      throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
    }
    const ro = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
    const membership = ro ? await requireActiveMembership(tx, ro.workspaceId, input.actorId).catch(() => null) : null;
    const version = run.versionId ? await tx.version.findUnique({ where: { id: run.versionId } }) : null;
    if (!ro || ro.status !== 'draft' || !version || version.status !== 'draft' || version.researchObjectId !== ro.id
      || !membership || !WRITE_ROLES.has(membership.membership.role)) {
      throw new HermesResearchRunError('FORBIDDEN', 'Generation grant permission is unavailable');
    }
    if (!['awaiting_claim_review', 'awaiting_storyboard_review'].includes(run.status)
      || run.steps.some(step => step.stage === 'scene_image' || step.stage === 'video')) {
      throw new HermesResearchRunError('SOURCE_NOT_READY', 'Generation grant can only change before image generation');
    }
    if (run.status === 'awaiting_storyboard_review') {
      const step = run.steps.find(item => item.stage === 'storyboard');
      const asset = step?.presentationAssetId ? await tx.presentationAsset.findUnique({ where: { id: step.presentationAssetId } }) : null;
      const plan = asset && presentationStoryboardView(asset, run.sourceClaimIds);
      if (!asset || !plan || (asset.status === 'approved' && plan.document.scenes.some(scene => !scene.animation))) {
        throw new HermesResearchRunError('SOURCE_NOT_READY', 'Revise the approved legacy storyboard before upgrading its generation grant');
      }
    }
    const changed = await tx.hermesResearchRun.updateMany({ where: {
      id: run.id, actorId: input.actorId, version: input.expectedVersion, status: run.status,
    }, data: { ...input.generationGrant, version: { increment: 1 }, error: null } });
    if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before authorizing');
    await recordAudit(deps, tx, { actorId: input.actorId, workspaceId: ro.workspaceId,
      action: 'hermes.research_run.generation_grant', targetType: 'hermes_research_run', targetId: run.id,
      metadata: { previousProfile: run.profile, previousMaxAgentTasks: run.maxAgentTasks, ...input.generationGrant } }, ctx);
    return toView(await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }));
  }, { isolationLevel: 'Serializable' });
}

/** Resume one failed content-driven image stage without replacing reviewed scientific inputs. */
export async function retryHermesGeneration(deps: HermesResearchRunDeps, input: {
  actorId: string; researchObjectId: string; runId: string; expectedVersion: number; idempotencyKey: string;
}, ctx: AuditContext = {}): Promise<HermesResearchRunView> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1
    || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Generation retry requires an expected version and idempotency key');
  }
  const requestDigest = createHash('sha256').update(JSON.stringify({
    actorId: input.actorId, researchObjectId: input.researchObjectId, runId: input.runId,
    expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey,
  })).digest('hex');
  const recoveryPrefix = `hermes-run:${input.runId}:generation-recovery:${requestDigest}:`;
  let dispatchIds: string[] = [];
  let updated: RunRow | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await deps.prisma.$transaction(async tx => {
        const run = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include: RUN_INCLUDE });
        if (!run || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId) {
          throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
        }
        const ro = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
        const membership = ro ? await requireActiveMembership(tx, ro.workspaceId, input.actorId).catch(() => null) : null;
        if (run.profile === VISUAL_NARRATIVE_PROFILE) {
          if (!ro || ro.deletedAt || ro.status !== 'draft' || !membership || !WRITE_ROLES.has(membership.membership.role))
            throw new HermesResearchRunError('FORBIDDEN', 'Source review recovery permission is unavailable');
          // A raw client key cannot be reused with a different version tuple.
          // Historical receipts lack it, but their exact session digest remains replayable.
          const priorRequest = await tx.auditLog.findFirst({ where: {
            action: 'hermes.research_run.source_review_recovery', targetType: 'hermes_research_run', targetId: run.id,
            actorId: input.actorId, metadata: { path: ['clientIdempotencyKey'], equals: input.idempotencyKey },
          } });
          if (priorRequest && jsonRecord(priorRequest.metadata).requestDigest !== requestDigest)
            throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Source review recovery key belongs to another request');
          const recoverySteps = run.steps.filter(step => step.stage === 'source_review' && step.ordinal > 0 && step.agentTaskId);
          const replays = await tx.agentTask.findMany({ where: {
            id: { in: recoverySteps.map(step => step.agentTaskId!) },
            session: { idempotencyKey: { endsWith: `:hermes-recovery:${requestDigest}` } },
          }, include: { session: true } });
          if (replays.length > 1)
            throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Source recovery request has multiple task bindings');
          const replacement = replays[0];
          if (replacement) {
            const recoveryStep = recoverySteps.find(step => step.agentTaskId === replacement.id)!;
            const failed = run.steps.find(step => step.stage === 'source_review' && step.ordinal === recoveryStep.ordinal - 1);
            const composition = run.steps.find(step => step.stage === 'source_composition' && step.ordinal === 0);
            const canonical = run.steps.filter(step => step.stage === 'source_ingestion');
            const key = `ingestion-analysis-compose:${recoveryStep.ingestionTaskId}:${failed?.agentTaskId}:${composition?.agentTaskId}:scientific-review-v4`;
            const payload = jsonRecord(replacement.payload);
            if (replacement.deletedAt || replacement.kind !== 'sdf.extract' || !failed?.agentTaskId || !composition?.agentTaskId
              || replacement.idempotencyKey !== key || replacement.session.idempotencyKey !== `${key}:hermes-recovery:${requestDigest}`
              || replacement.session.deletedAt || replacement.session.userId !== input.actorId
              || replacement.session.researchObjectId !== input.researchObjectId
              || Object.keys(payload).sort().join(',') !== 'artifactId,researchObjectId'
              || payload.researchObjectId !== input.researchObjectId || payload.artifactId !== recoveryStep.artifactId
              || canonical.length !== 1
              || canonical[0]!.ingestionTaskId !== recoveryStep.ingestionTaskId || canonical[0]!.artifactId !== recoveryStep.artifactId) {
              throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Source review recovery already has another request binding');
            }
            // Replay is a receipt, including after a later recovery supersedes it.
            // Pending dispatch is handled by the existing outbox, never by replay.
            return { run, dispatchIds: [] as string[] };
          }
          if (priorRequest)
            throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Source recovery receipt has no committed task binding');
          if (run.versionId === null) {
            if (run.version !== input.expectedVersion)
              throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before retrying source review');
            const taskId = await recoverHermesSourceReviewInTransaction(deps, tx, { ...input, requestDigest }, ctx);
            return { run: await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }), dispatchIds: [taskId] };
          }
        }
        const version = run.versionId ? await tx.version.findUnique({ where: { id: run.versionId } }) : null;
        if (!ro || ro.status !== 'draft' || !version || version.status !== 'draft' || version.researchObjectId !== ro.id
          || !membership || !WRITE_ROLES.has(membership.membership.role)) {
          throw new HermesResearchRunError('FORBIDDEN', 'Generation retry permission is unavailable');
        }

        if (run.profile === VISUAL_NARRATIVE_PROFILE) {
          const receipt = await tx.auditLog.findFirst({ where: {
            action: { in: ['hermes.research_run.storyboard_checkpoint_resume', 'hermes.research_run.storyboard_output_resume'] },
            targetType: 'hermes_research_run', targetId: run.id,
            actorId: input.actorId, metadata: { path: ['clientIdempotencyKey'], equals: input.idempotencyKey },
          } });
          if (receipt) {
            if (jsonRecord(receipt.metadata).requestDigest !== requestDigest)
              throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Storyboard recovery key belongs to another request');
            return { run, dispatchIds: [] as string[] };
          }
          if (run.version !== input.expectedVersion)
            throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before continuing the saved storyboard');
          const saved = await inspectStoryboardCheckpointRecovery(tx, run);
          if (!saved) throw new HermesResearchRunError('SOURCE_NOT_READY', 'The saved storyboard cannot be resumed safely');
          const taskChanged = await tx.agentTask.updateMany({ where: {
            id: saved.task.id, sessionId: saved.task.sessionId, status: 'failed', retryCount: saved.task.retryCount,
            executionAttempt: saved.task.executionAttempt,
            error: saved.task.error, payload: { equals: saved.task.payload as Prisma.InputJsonValue },
            result: { equals: saved.task.result as Prisma.InputJsonValue },
          }, data: { status: 'pending', progress: 0, retryCount: saved.task.retryCount + 1, error: null, dispatchedAt: null } });
          const stepChanged = await tx.hermesResearchStep.updateMany({ where: {
            id: saved.step.id, runId: run.id, stage: 'storyboard', ordinal: 0, status: 'failed',
            agentTaskId: saved.task.id, presentationAssetId: null,
          }, data: { status: 'running', error: null } });
          const runChanged = await tx.hermesResearchRun.updateMany({ where: {
            id: run.id, actorId: input.actorId, status: 'failed', version: input.expectedVersion, versionId: run.versionId,
          }, data: { status: 'generating_storyboard', error: null, lastReconciledAt: null, version: { increment: 1 } } });
          if (taskChanged.count !== 1 || stepChanged.count !== 1 || runChanged.count !== 1)
            throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Saved storyboard changed while continuing');
          await recordAudit(deps, tx, { actorId: input.actorId, workspaceId: ro.workspaceId,
            action: saved.recoveryAction, targetType: 'hermes_research_run', targetId: run.id,
            metadata: { requestDigest, clientIdempotencyKey: input.idempotencyKey, expectedVersion: input.expectedVersion,
              taskId: saved.task.id, stepId: saved.step.id, previousExecutionAttempt: saved.task.executionAttempt,
              previousError: saved.task.error, planningAuditIds: saved.planningAuditIds,
              ...(saved.truncationAuditId ? { truncationAuditId: saved.truncationAuditId, continuedOutputAllowance: 32768 } : {}),
              planningPromptHash: jsonRecord(saved.checkpoint.planned).promptHash,
              sourceEvidenceIdentity: saved.checkpoint.sourceEvidenceIdentity,
              narrativeSourceIdentity: saved.checkpoint.narrativeSourceIdentity,
              noReplanning: true, newTaskCount: 0, noProviderSwitch: true,
              creditPolicy: 'reuse-original-reservation;remaining-review-incurs-provider-usage' } }, ctx);
          return { run: await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }),
            dispatchIds: [saved.task.id] };
        }

        // Recognize the committed request before applying the stale version fence.
        const replay = await tx.agentTask.findFirst({ where: { idempotencyKey: { startsWith: recoveryPrefix } }, include: { session: true } });
        if (replay) {
          let payload: PresentationGenerationPayload;
          try { payload = parsePresentationGenerationPayload(replay.payload); }
          catch { throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Generation retry key belongs to another task'); }
          if (replay.session.userId !== input.actorId || replay.session.researchObjectId !== input.researchObjectId
            || payload.hermesRunAuthority?.runId !== input.runId || replay.kind !== 'presentation.generate') {
            throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Generation retry key belongs to another task');
          }
          return { run, dispatchIds: [] as string[] };
        }
        if (run.version !== input.expectedVersion) {
          throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before retrying generation');
        }
        if (run.status === 'stopped' && run.error === 'reviewed Claim or Evidence binding changed'
          && run.steps.every(step => step.stage === 'source_ingestion')
          && await validateReviewedSources(tx, run) === 'ready') {
          const restored = await tx.hermesResearchRun.updateMany({ where: {
            id: run.id, actorId: input.actorId, status: 'stopped', version: input.expectedVersion,
          }, data: { status: 'awaiting_claim_review', error: null, version: { increment: 1 } } });
          if (restored.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed while resuming source review');
          await recordAudit(deps, tx, { actorId: input.actorId, workspaceId: ro.workspaceId,
            action: 'hermes.research_run.source_review_resume', targetType: 'hermes_research_run', targetId: run.id,
            metadata: { requestDigest, previousVersion: run.version } }, ctx);
          return { run: await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }), dispatchIds: [] as string[] };
        }
        const plan = await inspectGenerationRecovery(tx, run, deps.canResumeImageBeforeSubmission, deps.inspectImageRecoveryState);
        if (!plan) throw new HermesResearchRunError('SOURCE_NOT_READY', 'This failed generation cannot be retried safely');

        const fenced = await tx.hermesResearchRun.updateMany({ where: {
          id: run.id, actorId: input.actorId, researchObjectId: input.researchObjectId,
          status: 'failed', version: input.expectedVersion,
        }, data: { status: 'generating_scene_images', error: null, lastReconciledAt: null, version: { increment: 1 } } });
        if (fenced.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes run changed; reload before retrying generation');

        const pendingIds: string[] = [];
        for (const item of plan.preserved) {
          const changed = await tx.hermesResearchStep.updateMany({ where: {
            id: item.stepId, runId: run.id, stage: 'scene_image', agentTaskId: item.taskId,
          }, data: { status: 'running', presentationAssetId: item.assetId, error: null } });
          if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Scene image binding changed during retry');
        }
        for (const item of plan.rearm) {
          const taskChanged = await tx.agentTask.updateMany({ where: {
            id: item.taskId, status: 'failed', retryCount: 0, executionAttempt: item.executionAttempt,
            error: item.error, result: { equals: Prisma.DbNull },
          }, data: {
            status: 'pending', progress: 0, retryCount: 1, error: null, dispatchedAt: null,
            result: { hermesRecovery: HERMES_AUTHORITY_REARM_MARKER },
          } });
          const stepChanged = await tx.hermesResearchStep.updateMany({ where: {
            id: item.stepId, runId: run.id, stage: 'scene_image', ordinal: item.ordinal, agentTaskId: item.taskId,
          }, data: { status: 'running', presentationAssetId: null, error: null } });
          if (taskChanged.count !== 1 || stepChanged.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Authority-blocked scene changed during retry');
          pendingIds.push(item.taskId);
        }
        for (const item of plan.resume) {
          const taskChanged = await tx.agentTask.updateMany({ where: {
            id: item.taskId, status: 'failed', retryCount: 0, executionAttempt: 1,
            result: { equals: Prisma.DbNull },
          }, data: { status: 'pending', progress: 0, retryCount: 1, error: null, dispatchedAt: null } });
          const stepChanged = await tx.hermesResearchStep.updateMany({ where: {
            id: item.stepId, runId: run.id, stage: 'scene_image', ordinal: item.ordinal, agentTaskId: item.taskId,
          }, data: { status: 'running', presentationAssetId: null, error: null } });
          if (taskChanged.count !== 1 || stepChanged.count !== 1) {
            throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Completed scene result changed during recovery');
          }
          pendingIds.push(item.taskId);
        }
        for (const item of plan.chargeable) {
          const { task, replayed } = await persistAgentTaskInTransaction(deps, tx, {
            sessionId: item.sessionId, userId: input.actorId, kind: 'presentation.generate', payload: item.payload,
            idempotencyKey: `${recoveryPrefix}${item.ordinal}`,
          }, ctx);
          if (replayed) throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Generation retry task already exists without a committed run transition');
          const retryMarked = await tx.agentTask.updateMany({
            where: { id: task.id, status: 'pending', retryCount: 0 }, data: { retryCount: 1 },
          });
          if (retryMarked.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Replacement scene retry marker changed');
          const stepChanged = await tx.hermesResearchStep.updateMany({ where: {
            id: item.stepId, runId: run.id, stage: 'scene_image', ordinal: item.ordinal, agentTaskId: item.oldTaskId,
          }, data: { status: 'running', agentTaskId: task.id, presentationAssetId: null, error: null } });
          if (stepChanged.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Failed scene image binding changed during retry');
          pendingIds.push(task.id);
        }
        await recordAudit(deps, tx, {
          actorId: input.actorId, action: 'hermes.research_run.generation_retry', workspaceId: ro.workspaceId,
          targetType: 'hermes_research_run', targetId: run.id, metadata: {
            chargeableAttempts: plan.chargeable.length,
            replacedTaskIds: plan.chargeable.map(item => item.oldTaskId),
            rearmedTaskIds: plan.rearm.map(item => item.taskId),
            resumedTaskIds: plan.resume.map(item => item.taskId),
            preservedAssetIds: plan.preserved.map(item => item.assetId),
            creditPolicy: 'new-provider-attempts-charged;pre-provider-authority-rearms-reuse-reservation',
          },
        }, ctx);
        return {
          run: await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }),
          dispatchIds: pendingIds,
        };
      }, { isolationLevel: 'Serializable' });
      updated = outcome.run;
      dispatchIds = outcome.dispatchIds;
      break;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  if (!updated) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Generation retry transaction could not be serialized');
  await Promise.all(dispatchIds.map(taskId => dispatchAgentTask(deps, taskId).catch(() => false)));
  return toView(updated);
}

export async function requireHermesPresentationTaskAuthority(
  prisma: Prisma.TransactionClient,
  input: { taskId: string; actorId: string; payload: PresentationGenerationPayload; authority: HermesPresentationAuthority },
): Promise<void> {
  const expectedStatus = input.authority.stage === 'storyboard' ? 'generating_storyboard'
    : input.authority.stage === 'scene_image' ? 'generating_scene_images' : 'generating_video';
  const run = await prisma.hermesResearchRun.findUnique({
    where: { id: input.authority.runId },
    include: { researchObject: true, steps: { where: { stage: input.authority.stage, ordinal: input.authority.ordinal } } },
  });
  const step = run?.steps[0];
  if (!run || !step || run.steps.length !== 1 || run.actorId !== input.actorId
    || run.researchObjectId !== input.payload.researchObjectId || run.versionId !== input.payload.versionId
    || !validGrant(run) || run.profile !== input.authority.profile || run.status !== expectedStatus
    || step.agentTaskId !== input.taskId || step.status !== 'running'
    || !isDeepStrictEqual([...run.sourceClaimIds].sort(), input.payload.sourceClaimIds)
    || run.researchObject.status !== 'draft') throw new Error('[blocked] Hermes run authority is invalid');
  const authority = await requireActiveMembership(prisma, run.researchObject.workspaceId, run.actorId).catch(() => null);
  if (!authority || !WRITE_ROLES.has(authority.membership.role)) throw new Error('[blocked] Hermes run authority changed');
  const version = await prisma.version.findUnique({ where: { id: run.versionId! } });
  if (!version || version.researchObjectId !== run.researchObjectId || version.status !== 'draft') {
    throw new Error('[blocked] Hermes run Version changed');
  }
}

type ReconcileCounts = { inspected: number; advanced: number; failed: number; stopped: number; errors: number };
const ACTIVE_RUN_STATES: HermesResearchRunStatus[] = [
  'running', 'awaiting_source_review', 'awaiting_claim_review', 'generating_storyboard', 'awaiting_storyboard_review',
  'generating_scene_images', 'awaiting_scene_images_review', 'generating_video', 'awaiting_video_review',
];

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function terminalReconcileError(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  if (['VALIDATION_ERROR', 'SOURCE_CLAIM_INVALID', 'ILLEGAL_TRANSITION'].includes(String(code))) {
    return error instanceof Error ? error.message.slice(0, 1_000) : 'Hermes generation precondition failed';
  }
  const message = error instanceof Error ? error.message : '';
  return /Hermes generation grant|parent|storyboard|scene image|video inputs/i.test(message) ? message.slice(0, 1_000) : null;
}

async function createPresentationSteps(
  deps: HermesResearchRunDeps,
  tx: Prisma.TransactionClient,
  run: RunRow,
  stage: 'storyboard' | 'scene_image' | 'video',
  inputs: Array<{ ordinal: number; payload: Record<string, unknown>; replacesTaskId?: string }>,
): Promise<void> {
  if (!run.versionId || !validGrant(run)) {
    throw new Error('Hermes generation grant is invalid');
  }
  const existingCount = await tx.agentTask.count({
    where: { kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } },
  });
  const sourceTaskCount = run.profile === VISUAL_NARRATIVE_PROFILE
    ? run.steps.filter(step => ['source_composition', 'source_review'].includes(step.stage)).length : 0;
  if (existingCount + sourceTaskCount + inputs.length > run.maxAgentTasks!) throw new Error('Hermes generation grant exhausted');
  const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
    userId: run.actorId, researchObjectId: run.researchObjectId, kind: 'visualization',
    title: imageRun(run.profile) ? 'Hermes research illustration' : 'Hermes research video', idempotencyKey: `hermes-run-session:${run.id}`,
  });
  for (const item of inputs) {
    const payload = {
      ...item.payload,
      hermesRunAuthority: { runId: run.id, stage, ordinal: item.ordinal, profile: run.profile },
    };
    const { task } = await persistAgentTaskInTransaction(deps, tx, {
      sessionId: session.id, userId: run.actorId, kind: 'presentation.generate', payload,
      idempotencyKey: `hermes-run:${run.id}:${stage}:${item.ordinal}${item.replacesTaskId ? `:correction:${item.replacesTaskId}` : ''}`,
    });
    await tx.hermesResearchStep.upsert({
      where: { runId_stage_ordinal: { runId: run.id, stage, ordinal: item.ordinal } },
      create: { runId: run.id, stage, ordinal: item.ordinal, status: 'running', agentTaskId: task.id },
      update: { status: 'running', agentTaskId: task.id, presentationAssetId: null, error: null },
    });
    if (item.replacesTaskId) await recordAudit(deps, tx, { actorId: null, action: 'hermes.research_run.internal_correction',
      targetType: 'hermes_research_run', targetId: run.id, metadata: { executor: 'hermes', authorizedByUserId: run.actorId,
        stage, ordinal: item.ordinal, previousTaskId: item.replacesTaskId, taskId: task.id } }, {});
  }
}

async function validateReviewedSources(tx: Prisma.TransactionClient, run: RunRow): Promise<'pending' | 'ready' | 'invalid'> {
  if (!run.versionId || !validGrant(run) || run.sourceClaimIds.length === 0) return 'invalid';
  const version = await tx.version.findUnique({ where: { id: run.versionId } });
  if (!version || version.researchObjectId !== run.researchObjectId || version.status !== 'draft') return 'invalid';
  const claims = await tx.claimNode.findMany({ where: { id: { in: run.sourceClaimIds }, researchObjectId: run.researchObjectId, versionId: run.versionId } });
  if (claims.length !== run.sourceClaimIds.length) return 'invalid';
  const sourceSteps = run.steps.filter((step) => step.stage === 'source_ingestion');
  const ingestionIds = new Set(sourceSteps.map((step) => step.ingestionTaskId));
  const lineageByClaim = new Map<string, string>();
  if (claims.some((claim) => {
    const provenance = jsonRecord(claim.provenance);
    const lineage = provenance.sourceTaskLineage ?? provenance.sourceTaskId;
    if (typeof lineage === 'string') lineageByClaim.set(claim.id, lineage);
    // Normal Claim review records human provenance while retaining ingestion lineage.
    // Evidence below must still bind to that exact ingestion artifact and content hash.
    const reviewedSource = provenance.source === 'reviewed_ingestion'
      || (provenance.source === 'human' && typeof provenance.sourceTaskLineage === 'string');
    return !reviewedSource || typeof lineage !== 'string' || !ingestionIds.has(lineage);
  })) return 'invalid';
  if (claims.some((claim) => claim.extractionStatus === 'failed')) return 'invalid';
  if (claims.some((claim) => claim.extractionStatus !== 'succeeded')) return 'pending';
  const evidence = await tx.evidenceRecord.findMany({ where: { claimId: { in: run.sourceClaimIds }, researchObjectId: run.researchObjectId, versionId: run.versionId } });
  if (evidence.some((row) => row.extractionStatus === 'failed')) return 'invalid';
  const ingestionRows = await tx.ingestionTask.findMany({
    where: { id: { in: [...ingestionIds].filter((id): id is string => typeof id === 'string') } },
    include: { artifact: true, batch: true },
  });
  const bindingByTask = new Map(ingestionRows.map((task) => [task.id, task]));
  if (run.sourceClaimIds.some((claimId) => {
    const sourceTaskId = lineageByClaim.get(claimId);
    const binding = sourceTaskId ? bindingByTask.get(sourceTaskId) : undefined;
    const matching = evidence.filter((row) => {
      const provenance = jsonRecord(row.provenance);
      return row.claimId === claimId && row.extractionStatus === 'succeeded' && binding
        && binding.batch.researchObjectId === run.researchObjectId && row.artifactId === binding.artifactId
        && row.contentHash === binding.artifact.blobSha256 && provenance.source === 'reviewed_ingestion'
        && provenance.sourceTaskId === sourceTaskId;
    });
    return matching.length === 0;
  })) return evidence.some((row) => row.extractionStatus === 'needs_review') ? 'pending' : 'invalid';
  if (run.profile === ONCHIP_FIELD_SAMPLING_PROFILE && !evidence.some((row) => row.contentHash === ONCHIP_SOURCE_CONTENT_HASH)) return 'invalid';
  return 'ready';
}

async function narrativeSceneLimit(tx: Prisma.TransactionClient, run: RunRow, reserveCorrection = true): Promise<number> {
  const presentations = await tx.agentTask.count({ where: { kind: 'presentation.generate',
    payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  const sources = run.steps.filter(step => ['source_composition', 'source_review'].includes(step.stage)).length;
  const limit = Math.min(6, run.maxAgentTasks! - sources - presentations - 1 - (reserveCorrection ? 1 : 0));
  if (limit < 1) throw new HermesResearchRunError('SOURCE_NOT_READY', 'Hermes generation grant cannot cover a narrative scene and its reserved correction');
  return limit;
}

async function repairBlockedNarrative(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: RunRow, taskId: string): Promise<boolean> {
  if (run.profile !== VISUAL_NARRATIVE_PROFILE) return false;
  const task = await tx.agentTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== 'failed' || task.deletedAt) return false;
  const result = jsonRecord(task.result);
  const review = jsonRecord(result.storyboardReview);
  const payload = parsePresentationGenerationPayload(task.payload);
  if (payload.storyboard?.revisionTaskId || !payload.storyboard?.narrative || review.decision !== 'blocked'
    || !result.storyboardCheckpoint || !task.error?.startsWith('[blocked] Illustration needs upstream scientific revision: ')) return false;
  // This replacement consumes the correction already reserved by the original plan.
  const sceneLimit = await narrativeSceneLimit(tx, run, false);
  await createPresentationSteps(deps, tx, run, 'storyboard', [{ ordinal: 0, replacesTaskId: task.id,
    payload: { ...payload, storyboard: { ...payload.storyboard, revisionTaskId: task.id, narrativeSceneLimit: sceneLimit } } }]);
  return true;
}

async function repairRejectedNarrativeImages(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: RunRow): Promise<boolean> {
  if (run.profile !== VISUAL_NARRATIVE_PROFILE) return false;
  const replacements: Array<{ ordinal: number; replacesTaskId: string; payload: Record<string, unknown> }> = [];
  for (const step of run.steps.filter(item => item.stage === 'scene_image')) {
    const asset = step.presentationAssetId ? await tx.presentationAsset.findUnique({ where: { id: step.presentationAssetId } }) : null;
    if (asset?.status !== 'rejected') continue;
    const task = step.agentTaskId ? await tx.agentTask.findUnique({ where: { id: step.agentTaskId } }) : null;
    if (!task || task.deletedAt || task.status !== 'succeeded') return false;
    const payload = parsePresentationGenerationPayload(task.payload);
    const review = jsonRecord(jsonRecord(asset.provenance).imageReview);
    if (!payload.sceneImage || payload.sceneImage.revisionAssetId || review.decision !== 'blocked'
      || review.stage !== 'generated-image' || review.contentHash !== asset.contentHash
      || typeof review.repairInstruction !== 'string' || !review.repairInstruction.trim() || review.repairInstruction.length > 400) return false;
    replacements.push({ ordinal: step.ordinal, replacesTaskId: task.id,
      payload: { ...payload, sceneImage: { ...payload.sceneImage, revisionAssetId: asset.id } } });
  }
  if (!replacements.length) return false;
  await createPresentationSteps(deps, tx, run, 'scene_image', replacements);
  return true;
}

async function findApprovedStoryboardRevision(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    researchObjectId: string;
    versionId: string;
    sourceClaimIds: string[];
    baseAsset: { id: string; kind: string; provenance: unknown; sourceClaims: Array<{ claimId: string }> };
  },
) {
  const expectedClaimIds = [...input.sourceClaimIds].sort();
  const baseClaimIds = input.baseAsset.sourceClaims.map((link) => link.claimId).sort();
  const baseView = presentationStoryboardView(input.baseAsset, baseClaimIds);
  if (!baseView
    || !isDeepStrictEqual(baseClaimIds, expectedClaimIds)) return null;
  const revisions = await tx.presentationAsset.findMany({
    where: {
      researchObjectId: input.researchObjectId,
      versionId: input.versionId,
      kind: 'interactive_html',
      status: 'approved',
      provenance: { path: ['storyboardSettings', 'baseAssetId'], equals: input.baseAsset.id },
    },
    include: { sourceClaims: { select: { claimId: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
  });
  if (revisions.length !== 1) return null;
  const revision = revisions[0]!;
  const revisionClaimIds = revision.sourceClaims.map((link) => link.claimId).sort();
  const view = presentationStoryboardView(revision, revisionClaimIds);
  if (!view || view.output !== baseView.output || view.baseAssetId !== input.baseAsset.id
    || !isDeepStrictEqual(revisionClaimIds, expectedClaimIds)) return null;
  const provenance = jsonRecord(revision.provenance);
  if (provenance.source !== 'verified_claims' || provenance.taskId !== revision.id
    || !Array.isArray(provenance.sourceClaimIds)
    || !isDeepStrictEqual([...provenance.sourceClaimIds].sort(), expectedClaimIds)) return null;
  const task = await tx.agentTask.findUnique({ where: { id: revision.id }, include: { session: true } });
  if (!task || task.kind !== 'presentation.generate' || task.status !== 'succeeded'
    || task.session.userId !== input.actorId || task.session.researchObjectId !== input.researchObjectId
    || task.session.status !== 'active') return null;
  let payload: PresentationGenerationPayload;
  try {
    payload = parsePresentationGenerationPayload(task.payload);
  } catch {
    return null;
  }
  if (payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId
    || payload.kind !== 'interactive_html' || payload.storyboard?.baseAssetId !== input.baseAsset.id || payload.storyboard.output !== baseView.output
    || !isDeepStrictEqual(payload.sourceClaimIds, expectedClaimIds)) return null;
  return revision;
}

async function moveRun(
  deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: RunRow,
  to: HermesResearchRunStatus, workspaceId: string | undefined, error: string | null = null,
): Promise<HermesResearchRunStatus | null> {
  const changed = await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version },
    data: { status: to, error, version: { increment: 1 } } });
  if (changed.count !== 1) return null;
  if (to === 'failed' || to === 'stopped') {
    for (const step of run.steps) {
      if (step.status === 'succeeded') continue;
      await tx.hermesResearchStep.updateMany({ where: {
        id: step.id, runId: run.id, ...(to === 'failed' ? { presentationAssetId: null } : {}),
      }, data: { status: to, error } });
    }
  }
  await recordAudit(deps, tx, { actorId: run.profile === VISUAL_NARRATIVE_PROFILE ? null : run.actorId, action: `hermes.research_run.${to}`, workspaceId,
    targetType: 'hermes_research_run', targetId: run.id, metadata: { from: run.status, to,
      ...(run.profile === VISUAL_NARRATIVE_PROFILE ? { executor: 'hermes', authorizedByUserId: run.actorId } : {}) } }, {});
  return to;
}

export async function reconcileHermesResearchRuns(
  deps: HermesResearchRunDeps,
  input: { limit?: number } = {},
): Promise<ReconcileCounts> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const cutoff = new Date(now(deps).getTime() - 5_000);
  const candidates = await deps.prisma.hermesResearchRun.findMany({
    where: {
      status: { in: ACTIVE_RUN_STATES },
      OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lte: cutoff } }],
    },
    include: RUN_INCLUDE,
    orderBy: [{ lastReconciledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: limit,
  });
  const counts: ReconcileCounts = { inspected: candidates.length, advanced: 0, failed: 0, stopped: 0, errors: 0 };
  for (const candidate of candidates) {
    let result: HermesResearchRunStatus | null = null;
    let reconcileError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (candidate.profile === VISUAL_NARRATIVE_PROFILE && candidate.status === 'awaiting_source_review') {
          result = await advanceAutomaticSources(deps, candidate);
          break;
        }
        if (candidate.profile === VISUAL_NARRATIVE_PROFILE
          && ['awaiting_storyboard_review', 'awaiting_scene_images_review'].includes(candidate.status)) {
          await advanceAutomaticAssetReviews(deps, candidate);
        }
        result = await deps.prisma.$transaction(async (tx) => {
          const run = await tx.hermesResearchRun.findUnique({
            where: { id: candidate.id },
            include: { steps: { orderBy: { ordinal: 'asc' }, include: {
              ingestionTask: { include: { batch: true, agentTask: true } }, agentTask: true,
              presentationAsset: { include: { sourceClaims: { select: { claimId: true } } } },
            } } },
          });
          if (!run || !ACTIVE_RUN_STATES.includes(run.status as HermesResearchRunStatus)) return null;
          const ro = await tx.researchObject.findUnique({ where: { id: run.researchObjectId } });
          const authority = ro ? await requireActiveMembership(tx, ro.workspaceId, run.actorId).catch(() => null) : null;
          if (!ro || ro.status !== 'draft') return moveRun(deps, tx, run, 'stopped', ro?.workspaceId, 'research object scope changed');
          if (!authority || !WRITE_ROLES.has(authority.membership.role)) return moveRun(deps, tx, run, 'stopped', ro.workspaceId, 'authorization scope changed');
          const sourceSteps = run.steps.filter((step) => step.stage === 'source_ingestion');
          if (sourceSteps.some((step) => !step.ingestionTask || step.ingestionTask.batch.researchObjectId !== run.researchObjectId
            || step.ingestionTask.artifactId !== step.artifactId || step.ingestionTask.agentTaskId !== step.agentTaskId)) {
            return moveRun(deps, tx, run, 'stopped', ro.workspaceId, 'source binding changed');
          }
          if (run.status === 'running') {
            const failure = sourceSteps.map((step) => step.ingestionTask!).find((task) => FAILED_INGESTION_STATES.has(task.state));
            if (failure) return moveRun(deps, tx, run, 'failed', ro.workspaceId, failure.error ?? 'Ingestion extraction failed');
            if (!sourceSteps.every((step) => READY_INGESTION_STATES.has(step.ingestionTask!.state))) {
              await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
              return null;
            }
            await tx.hermesResearchStep.updateMany({ where: { runId: run.id, stage: 'source_ingestion' }, data: { status: 'succeeded', error: null } });
            return moveRun(deps, tx, run, 'awaiting_source_review', ro.workspaceId);
          }
          if (run.status === 'awaiting_source_review') {
            const failedSteps = sourceSteps.filter((step) => FAILED_INGESTION_STATES.has(step.ingestionTask!.state));
            if (failedSteps.length) {
              const error = failedSteps[0]!.ingestionTask!.error ?? 'Ingestion extraction failed';
              for (const step of failedSteps) {
                await tx.hermesResearchStep.updateMany({
                  where: { id: step.id, runId: run.id },
                  data: { status: 'failed', error: step.ingestionTask!.error ?? 'Ingestion extraction failed' },
                });
              }
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, error);
            }
            if (!sourceSteps.every((step) => READY_INGESTION_STATES.has(step.ingestionTask!.state))) {
              await tx.hermesResearchStep.updateMany({
                where: { runId: run.id, stage: 'source_ingestion' }, data: { status: 'waiting', error: null },
              });
              await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
              return null;
            }
            await tx.hermesResearchStep.updateMany({
              where: { runId: run.id, stage: 'source_ingestion' }, data: { status: 'succeeded', error: null },
            });
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
            return null;
          }
          const sourceState = await validateReviewedSources(tx, run);
          if (sourceState === 'invalid') return moveRun(deps, tx, run, 'stopped', ro.workspaceId, 'reviewed Claim or Evidence binding changed');
          if (sourceState === 'pending') {
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
            return null;
          }
          if (run.profile === ONCHIP_FIELD_SAMPLING_PROFILE
            && ['awaiting_claim_review', 'awaiting_storyboard_review'].includes(run.status)) {
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version },
              data: { lastReconciledAt: now(deps), error: 'Legacy template generation paused; explicitly authorize a content-driven plan before continuing' } });
            return null;
          }
          if (run.status === 'awaiting_claim_review') {
            const settings = run.profile === VISUAL_NARRATIVE_PROFILE ? narrativeSettings(run.generationSettings) : undefined;
            const sceneLimit = settings ? await narrativeSceneLimit(tx, run) : undefined;
            await createPresentationSteps(deps, tx, run, 'storyboard', [{ ordinal: 0, payload: {
              schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
              kind: 'interactive_html', sourceClaimIds: run.sourceClaimIds,
              storyboard: settings ? { ...settings, output: 'image', narrative: true, narrativeSceneLimit: sceneLimit } : { locale: 'zh', style: 'technical', output: imageRun(run.profile) ? 'image' : 'video', instruction: imageRun(run.profile) ? '根据当前已审核Claims规划1至6幅相互补充的科研图解。只讲来源支持的内容；若只提取到方法，就仅讲方法。不套用任何特定论文或固定科学机制，不为凑画面补写结果。' : '根据当前已审核Claims自主选择讲解重点、场景数量、时长和动态表现。只讲来源支持的内容；若只提取到方法，就仅讲方法。不套用任何特定论文或固定科学机制，不为凑场景补写结果。' },
            } }]);
            return moveRun(deps, tx, run, 'generating_storyboard', ro.workspaceId);
          }
          const stage = run.status.includes('storyboard') ? 'storyboard' : run.status.includes('scene_images') ? 'scene_image' : 'video';
          const steps = run.steps.filter((step) => step.stage === stage);
          if (run.status.startsWith('generating_')) {
            const failed = steps.find((step) => step.agentTask?.status === 'failed');
            const inFlight = steps.some((step) => step.agentTask?.status === 'pending' || step.agentTask?.status === 'running');
            for (const step of steps.filter(item => item.agentTask?.status === 'succeeded')) {
              const asset = await tx.presentationAsset.findUnique({ where: { id: step.agentTaskId! }, include: { sourceClaims: { select: { claimId: true } } } });
              if (!asset || asset.researchObjectId !== run.researchObjectId || asset.versionId !== run.versionId
                || !isDeepStrictEqual(asset.sourceClaims.map((link) => link.claimId).sort(), run.sourceClaimIds)) {
                return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Generation result asset binding is invalid');
              }
              await tx.hermesResearchStep.updateMany({ where: { id: step.id, status: 'running' },
                data: { status: 'awaiting_approval', presentationAssetId: asset.id } });
            }
            if (failed && !inFlight) {
              if (stage === 'storyboard' && failed.agentTaskId && await repairBlockedNarrative(deps, tx, run, failed.agentTaskId)) {
                return moveRun(deps, tx, run, 'generating_storyboard', ro.workspaceId);
              }
              await tx.hermesResearchStep.updateMany({ where: { id: failed.id }, data: { status: 'failed', error: failed.agentTask?.error ?? 'Generation failed' } });
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, failed.agentTask?.error ?? 'Generation failed');
            }
            if (!steps.length || steps.some((step) => step.agentTask?.status !== 'succeeded')) {
              await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
              return null;
            }
            const waiting = stage === 'storyboard' ? 'awaiting_storyboard_review' : stage === 'scene_image' ? 'awaiting_scene_images_review' : 'awaiting_video_review';
            return moveRun(deps, tx, run, waiting, ro.workspaceId);
          }
          if (run.status === 'awaiting_storyboard_review' && run.versionId && steps.length === 1) {
            const step = steps[0]!;
            const baseAsset = step.presentationAsset;
            if (step.status === 'awaiting_approval' && baseAsset && baseAsset.status !== 'approved') {
              const revision = await findApprovedStoryboardRevision(tx, {
                actorId: run.actorId,
                researchObjectId: run.researchObjectId,
                versionId: run.versionId,
                sourceClaimIds: run.sourceClaimIds,
                baseAsset,
              });
              if (revision) {
                const fencedRun = await tx.hermesResearchRun.updateMany({
                  where: { id: run.id, status: run.status, version: run.version },
                  data: { lastReconciledAt: now(deps) },
                });
                if (fencedRun.count !== 1) return null;
                const adopted = await tx.hermesResearchStep.updateMany({
                  where: {
                    id: step.id, runId: run.id, stage: 'storyboard', ordinal: 0,
                    status: 'awaiting_approval', presentationAssetId: baseAsset.id,
                  },
                  data: { presentationAssetId: revision.id, error: null },
                });
                if (adopted.count !== 1) {
                  throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Storyboard review changed during revision adoption');
                }
                await recordAudit(deps, tx, {
                  actorId: run.actorId,
                  action: 'hermes.research_run.storyboard_revision_adopted',
                  workspaceId: ro.workspaceId,
                  targetType: 'hermes_research_run',
                  targetId: run.id,
                  metadata: {
                    stepId: step.id,
                    baseAssetId: baseAsset.id,
                    revisionAssetId: revision.id,
                    baseContentHash: baseAsset.contentHash,
                    revisionContentHash: revision.contentHash,
                  },
                }, {});
                return null;
              }
            }
          }
          const assets = steps.map((step) => step.presentationAsset);
          if (!assets.length || assets.some((asset) => !asset)) return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Reviewed asset binding is missing');
          if (assets.some((asset) => asset!.status === 'rejected')) {
            if (stage === 'scene_image' && await repairRejectedNarrativeImages(deps, tx, run)) {
              return moveRun(deps, tx, run, 'generating_scene_images', ro.workspaceId);
            }
            return moveRun(deps, tx, run, 'stopped', ro.workspaceId, 'Internal review could not complete the narrative within the authorized correction budget');
          }
          if (assets.some((asset) => asset!.status !== 'approved')) {
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
            return null;
          }
          await tx.hermesResearchStep.updateMany({ where: { runId: run.id, stage, status: 'awaiting_approval' }, data: { status: 'succeeded' } });
          if (run.status === 'awaiting_storyboard_review') {
            const storyboardAssetId = assets[0]!.id;
            const approved = presentationStoryboardView(assets[0]!, run.sourceClaimIds);
            if (!approved || (run.profile === CONTENT_DRIVEN_PROFILE && (approved.output !== 'video' || approved.document.scenes.some(scene => !scene.animation))) || (imageRun(run.profile) && approved.output !== 'image')
              || (run.profile === VISUAL_NARRATIVE_PROFILE && !approved.document.narrative)) {
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Approved storyboard requires a content-driven animation plan');
            }
            const sceneCount = approved.document.scenes.length;
            if (run.profile === ONCHIP_FIELD_SAMPLING_PROFILE && sceneCount !== 5) {
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Legacy generation grant requires upgrade for this storyboard');
            }
            const sourceTaskCount = run.profile === VISUAL_NARRATIVE_PROFILE
              ? run.steps.filter(step => ['source_composition', 'source_review'].includes(step.stage)).length : 0;
            if (sourceTaskCount + sceneCount + (imageRun(run.profile) ? 1 : 2) > run.maxAgentTasks!) return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Hermes generation grant cannot cover this storyboard');
            await createPresentationSteps(deps, tx, run, 'scene_image', Array.from({ length: sceneCount }, (_, ordinal) => ({ ordinal, payload: {
              schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
              kind: 'image', sourceClaimIds: run.sourceClaimIds, sceneImage: { storyboardAssetId, sceneIndex: ordinal },
            } })));
            return moveRun(deps, tx, run, 'generating_scene_images', ro.workspaceId);
          }
          if (run.status === 'awaiting_scene_images_review') {
            if (imageRun(run.profile)) return moveRun(deps, tx, run, 'succeeded', ro.workspaceId);
            const storyboard = run.steps.find((step) => step.stage === 'storyboard')?.presentationAssetId;
            if (!storyboard) return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Storyboard binding is missing');
            await createPresentationSteps(deps, tx, run, 'video', [{ ordinal: 0, payload: {
              schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
              kind: 'video', sourceClaimIds: run.sourceClaimIds, video: { storyboardAssetId: storyboard,
                sceneImageAssetIds: assets.map((asset) => asset!.id), profile: run.profile,
                ...(run.profile === ONCHIP_FIELD_SAMPLING_PROFILE ? { sceneRoles: ONCHIP_SCENE_ROLES } : {}) },
            } }]);
            return moveRun(deps, tx, run, 'generating_video', ro.workspaceId);
          }
          return moveRun(deps, tx, run, 'succeeded', ro.workspaceId);
        }, { isolationLevel: 'Serializable' });
        reconcileError = undefined;
        break;
      } catch (error) {
        reconcileError = error;
        if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue;
        break;
      }
    }
    if (reconcileError) {
      if ((reconcileError as { code?: unknown })?.code === 'INSUFFICIENT_CREDIT') {
        const retryAt = new Date(now(deps).getTime() + 55_000);
        const recorded = await deps.prisma.$transaction(async (tx) => {
          const run = await tx.hermesResearchRun.findUnique({ where: { id: candidate.id }, include: RUN_INCLUDE });
          if (!run || run.status !== candidate.status || run.version !== candidate.version) return false;
          const changed = await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version },
            data: { error: 'AI Credit is insufficient; Hermes will check again after credits are added', lastReconciledAt: retryAt } });
          if (changed.count !== 1) return false;
          const ro = await tx.researchObject.findUnique({ where: { id: run.researchObjectId } });
          await recordAudit(deps, tx, { actorId: run.actorId, action: 'hermes.research_run.awaiting_credit',
            workspaceId: ro?.workspaceId, targetType: 'hermes_research_run', targetId: run.id,
            metadata: { status: run.status, retryAfter: retryAt.toISOString() } }, {});
          return true;
        }, { isolationLevel: 'Serializable' }).catch(() => false);
        if (recorded) continue;
      }
      const terminalError = terminalReconcileError(reconcileError);
      if (terminalError) {
        const failed = await deps.prisma.$transaction(async (tx) => {
          const run = await tx.hermesResearchRun.findUnique({ where: { id: candidate.id }, include: RUN_INCLUDE });
          if (!run || run.status !== candidate.status || run.version !== candidate.version) return null;
          const ro = await tx.researchObject.findUnique({ where: { id: run.researchObjectId } });
          return moveRun(deps, tx, run, 'failed', ro?.workspaceId, terminalError);
        }, { isolationLevel: 'Serializable' }).catch(() => null);
        if (failed === 'failed') { counts.failed += 1; continue; }
      }
      counts.errors += 1;
      await deps.prisma.hermesResearchRun.updateMany({
        where: { id: candidate.id, status: candidate.status, version: candidate.version },
        data: { lastReconciledAt: now(deps) },
      }).catch(() => undefined);
      continue;
    }
    if (result && !['failed', 'stopped'].includes(result)) counts.advanced += 1;
    else if (result === 'failed') counts.failed += 1;
    else if (result === 'stopped') counts.stopped += 1;
  }
  return counts;
}
