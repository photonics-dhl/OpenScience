import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import { requireActiveMembership } from '../workspace/helpers';
import { now } from '../workspace/types';
import { confirmIngestionClaimEvidenceBridge, type IngestionClaimSelection } from '../ingestion/claim-evidence-bridge';
import type { IngestionDeps } from '../ingestion/ingestion-service';
import { findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction, type AgentDeps } from './agent';
import { ONCHIP_FIELD_SAMPLING_PROFILE, ONCHIP_SCENE_ROLES, ONCHIP_SOURCE_CONTENT_HASH, CONTENT_DRIVEN_PROFILE } from '../assets/video';
import { parsePresentationGenerationPayload, type HermesPresentationAuthority, type PresentationGenerationPayload } from '../assets/presentation-asset';
import { presentationStoryboardView } from '../assets/storyboard';
import { publicEvidenceRow } from '../research-intelligence/claim-evidence-service';

const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const READY_INGESTION_STATES = new Set(['needs_review', 'confirmed', 'written']);
const FAILED_INGESTION_STATES = new Set(['failed_retryable', 'failed_blocked']);
const RUN_INCLUDE = { steps: { orderBy: { ordinal: 'asc' as const } } } as const;
type GenerationProfile = typeof ONCHIP_FIELD_SAMPLING_PROFILE | typeof CONTENT_DRIVEN_PROFILE;
type GenerationGrant = { profile: typeof ONCHIP_FIELD_SAMPLING_PROFILE; maxAgentTasks: 7 }
  | { profile: typeof CONTENT_DRIVEN_PROFILE; maxAgentTasks: 8 };
function validGrant(value: { profile: string | null; maxAgentTasks: number | null }): boolean {
  return (value.profile === ONCHIP_FIELD_SAMPLING_PROFILE && value.maxAgentTasks === 7)
    || (value.profile === CONTENT_DRIVEN_PROFILE && value.maxAgentTasks === 8);
}

export type HermesResearchRunStatus = 'running' | 'awaiting_source_review' | 'awaiting_claim_review'
  | 'generating_storyboard' | 'awaiting_storyboard_review' | 'generating_scene_images'
  | 'awaiting_scene_images_review' | 'generating_video' | 'awaiting_video_review'
  | 'succeeded' | 'failed' | 'stopped';
export type HermesResearchStepStatus = 'waiting' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'stopped';
export type HermesResearchStage = 'source_ingestion' | 'storyboard' | 'scene_image' | 'video';

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

export type HermesResearchRunDeps = AgentDeps;
export interface HermesSourceReviewDeps extends HermesResearchRunDeps { storage: IngestionDeps['storage'] }

export interface HermesResearchRunView {
  id: string;
  researchObjectId: string;
  actorId: string;
  versionId: string | null;
  profile: GenerationProfile | null;
  maxAgentTasks: number | null;
  sourceClaimIds: string[];
  status: HermesResearchRunStatus;
  version: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    stage: HermesResearchStage;
    ordinal: number;
    status: HermesResearchStepStatus;
    ingestionTaskId: string | null;
    artifactId: string | null;
    agentTaskId: string | null;
    presentationAssetId: string | null;
    error: string | null;
  }>;
}

type RunRow = Prisma.HermesResearchRunGetPayload<{ include: typeof RUN_INCLUDE }>;

function toView(run: RunRow): HermesResearchRunView {
  return {
    id: run.id,
    researchObjectId: run.researchObjectId,
    actorId: run.actorId,
    versionId: run.versionId,
    profile: run.profile as GenerationProfile | null,
    maxAgentTasks: run.maxAgentTasks,
    sourceClaimIds: run.sourceClaimIds,
    status: run.status as HermesResearchRunStatus,
    version: run.version,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
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

function requestDigest(input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[] }): string {
  return createHash('sha256').update(JSON.stringify({
    actorId: input.actorId,
    researchObjectId: input.researchObjectId,
    ingestionTaskIds: [...input.ingestionTaskIds].sort(),
  })).digest('hex');
}

export async function createHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[]; idempotencyKey: string },
  ctx: AuditContext = {},
): Promise<HermesResearchRunView> {
  const taskIds = [...new Set(input.ingestionTaskIds)].sort();
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

    const tasks = await tx.ingestionTask.findMany({
      where: { id: { in: taskIds } },
      include: { batch: true, agentTask: true },
    });
    if (tasks.length !== taskIds.length) throw new HermesResearchRunError('SOURCE_NOT_READY', 'One or more ingestion tasks are unavailable');
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ordered = taskIds.map((id) => byId.get(id)!);
    for (const task of ordered) {
      if (task.batch.researchObjectId !== researchObject.id || !task.agentTaskId || !task.agentTask
        || task.agentTask.id !== task.agentTaskId || FAILED_INGESTION_STATES.has(task.state)) {
        throw new HermesResearchRunError('SOURCE_NOT_READY', 'Ingestion source is failed, incomplete, or belongs to another research object');
      }
    }

    const run = await tx.hermesResearchRun.create({
      data: {
        researchObjectId: researchObject.id,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: digest,
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
      metadata: { researchObjectId: researchObject.id, ingestionTaskCount: ordered.length },
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
  await requireActiveMembership(deps.prisma, ro.workspaceId, input.actorId)
    .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found', { cause }); });
  return toView(run);
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
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200
    || !validGrant(input.generationGrant)) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Hermes source review requires a bounded generation grant');
  }
  const reviewIds = input.reviews.map((review) => review.ingestionTaskId);
  const requestedClaimCount = input.reviews.reduce((total, review) => total + review.selections.length, 0);
  if (reviewIds.length === 0 || new Set(reviewIds).size !== reviewIds.length || requestedClaimCount < 1 || requestedClaimCount > 12
    || input.reviews.some((review) => review.selections.some((selection) => !selection.attachSourceQuote))) {
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
      }, ctx, tx);
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
    await recordAudit(deps, tx, { actorId: input.actorId, action: 'hermes.research_run.source_review',
      workspaceId: version.researchObject.workspaceId, targetType: 'hermes_research_run', targetId: input.runId,
      metadata: { versionId: input.versionId, sourceClaimIds, ...input.generationGrant } }, ctx);
    const updated = await tx.hermesResearchRun.findUniqueOrThrow({ where: { id: input.runId }, include: RUN_INCLUDE });
    return { run: toView(updated), claims: createdClaims, evidence: createdEvidence };
  }, { isolationLevel: 'Serializable', timeout: 30_000 });
  for (let attempt = 0; ; attempt += 1) {
    try { return await execute(); }
    catch (error) { if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue; throw error; }
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
  inputs: Array<{ ordinal: number; payload: Record<string, unknown> }>,
): Promise<void> {
  if (!run.versionId || !validGrant(run)) {
    throw new Error('Hermes generation grant is invalid');
  }
  const existingCount = await tx.hermesResearchStep.count({
    where: { runId: run.id, stage: { in: ['storyboard', 'scene_image', 'video'] }, agentTaskId: { not: null } },
  });
  if (existingCount + inputs.length > run.maxAgentTasks!) throw new Error('Hermes generation grant exhausted');
  const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
    userId: run.actorId, researchObjectId: run.researchObjectId, kind: 'visualization',
    title: 'Hermes research video', idempotencyKey: `hermes-run-session:${run.id}`,
  });
  for (const item of inputs) {
    const payload = {
      ...item.payload,
      hermesRunAuthority: { runId: run.id, stage, ordinal: item.ordinal, profile: run.profile },
    };
    const { task } = await persistAgentTaskInTransaction(deps, tx, {
      sessionId: session.id, userId: run.actorId, kind: 'presentation.generate', payload,
      idempotencyKey: `hermes-run:${run.id}:${stage}:${item.ordinal}`,
    });
    await tx.hermesResearchStep.upsert({
      where: { runId_stage_ordinal: { runId: run.id, stage, ordinal: item.ordinal } },
      create: { runId: run.id, stage, ordinal: item.ordinal, status: 'running', agentTaskId: task.id },
      update: { status: 'running', agentTaskId: task.id, error: null },
    });
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
    return provenance.source !== 'reviewed_ingestion' || typeof lineage !== 'string' || !ingestionIds.has(lineage);
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
  if (!presentationStoryboardView(input.baseAsset, baseClaimIds)
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
  if (!view || view.baseAssetId !== input.baseAsset.id
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
    || payload.kind !== 'interactive_html' || payload.storyboard?.baseAssetId !== input.baseAsset.id
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
      await tx.hermesResearchStep.updateMany({ where: { id: step.id, runId: run.id }, data: { status: to, error } });
    }
  }
  await recordAudit(deps, tx, { actorId: run.actorId, action: `hermes.research_run.${to}`, workspaceId,
    targetType: 'hermes_research_run', targetId: run.id, metadata: { from: run.status, to } }, {});
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
            && ['awaiting_claim_review', 'awaiting_storyboard_review', 'awaiting_scene_images_review'].includes(run.status)) {
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version },
              data: { lastReconciledAt: now(deps), error: 'Legacy template generation paused; explicitly authorize a content-driven plan before continuing' } });
            return null;
          }
          if (run.status === 'awaiting_claim_review') {
            await createPresentationSteps(deps, tx, run, 'storyboard', [{ ordinal: 0, payload: {
              schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
              kind: 'interactive_html', sourceClaimIds: run.sourceClaimIds,
              storyboard: { locale: 'zh', style: 'technical', instruction: '根据当前已审核Claims自主选择讲解重点、场景数量、时长和动态表现。只讲来源支持的内容；若只提取到方法，就仅讲方法。不套用任何特定论文或固定科学机制，不为凑场景补写结果。' },
            } }]);
            return moveRun(deps, tx, run, 'generating_storyboard', ro.workspaceId);
          }
          const stage = run.status.includes('storyboard') ? 'storyboard' : run.status.includes('scene_images') ? 'scene_image' : 'video';
          const steps = run.steps.filter((step) => step.stage === stage);
          if (run.status.startsWith('generating_')) {
            const failed = steps.find((step) => step.agentTask?.status === 'failed');
            if (failed) {
              await tx.hermesResearchStep.updateMany({ where: { id: failed.id }, data: { status: 'failed', error: failed.agentTask?.error ?? 'Generation failed' } });
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, failed.agentTask?.error ?? 'Generation failed');
            }
            if (!steps.length || steps.some((step) => step.agentTask?.status !== 'succeeded')) {
              await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
              return null;
            }
            for (const step of steps) {
              const asset = await tx.presentationAsset.findUnique({ where: { id: step.agentTaskId! }, include: { sourceClaims: { select: { claimId: true } } } });
              if (!asset || asset.researchObjectId !== run.researchObjectId || asset.versionId !== run.versionId
                || !isDeepStrictEqual(asset.sourceClaims.map((link) => link.claimId).sort(), run.sourceClaimIds)) {
                return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Generation result asset binding is invalid');
              }
              await tx.hermesResearchStep.updateMany({ where: { id: step.id, status: 'running' },
                data: { status: 'awaiting_approval', presentationAssetId: asset.id } });
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
          if (assets.some((asset) => asset!.status === 'rejected')) return moveRun(deps, tx, run, 'stopped', ro.workspaceId, 'A generation asset was rejected');
          if (assets.some((asset) => asset!.status !== 'approved')) {
            await tx.hermesResearchRun.updateMany({ where: { id: run.id, status: run.status, version: run.version }, data: { lastReconciledAt: now(deps) } });
            return null;
          }
          await tx.hermesResearchStep.updateMany({ where: { runId: run.id, stage, status: 'awaiting_approval' }, data: { status: 'succeeded' } });
          if (run.status === 'awaiting_storyboard_review') {
            const storyboardAssetId = assets[0]!.id;
            const approved = presentationStoryboardView(assets[0]!, run.sourceClaimIds);
            if (!approved || (run.profile === CONTENT_DRIVEN_PROFILE && approved.document.scenes.some(scene => !scene.animation))) {
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Approved storyboard requires a content-driven animation plan');
            }
            const sceneCount = approved.document.scenes.length;
            if (run.profile === ONCHIP_FIELD_SAMPLING_PROFILE && sceneCount !== 5) {
              return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Legacy generation grant requires upgrade for this storyboard');
            }
            if (sceneCount + 2 > run.maxAgentTasks!) return moveRun(deps, tx, run, 'failed', ro.workspaceId, 'Hermes generation grant cannot cover this storyboard');
            await createPresentationSteps(deps, tx, run, 'scene_image', Array.from({ length: sceneCount }, (_, ordinal) => ({ ordinal, payload: {
              schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
              kind: 'image', sourceClaimIds: run.sourceClaimIds, sceneImage: { storyboardAssetId, sceneIndex: ordinal },
            } })));
            return moveRun(deps, tx, run, 'generating_scene_images', ro.workspaceId);
          }
          if (run.status === 'awaiting_scene_images_review') {
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
          if (!run || !ACTIVE_RUN_STATES.includes(run.status as HermesResearchRunStatus)) return false;
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
          if (!run || !ACTIVE_RUN_STATES.includes(run.status as HermesResearchRunStatus)) return null;
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
