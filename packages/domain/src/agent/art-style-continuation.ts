import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import { dispatchAgentTask, findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction } from './agent';
import { HermesResearchRunError, readNarrativeCheckpointEvidence, type HermesResearchRunDeps } from './research-run';
import { parsePresentationGenerationPayload, requirePresentationWriteScope, type PresentationGenerationPayload } from '../assets/presentation-asset';
import { presentationSceneImageView, requireSceneImageParent, requireAcceptedSceneImageReview } from '../assets/scene-image';
import { parseIllustrationStyleRecommendations, presentationStoryboardView, type StoryboardDocument } from '../assets/storyboard';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';

export const ART_STYLE_CONTINUATION = 'hermes.research_run.art_style_continuation';
const include = { steps: { orderBy: { ordinal: 'asc' as const } } };
type Run = Prisma.HermesResearchRunGetPayload<{ include: typeof include }>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function unavailable(message: string): never { throw new HermesResearchRunError('SOURCE_NOT_READY', message); }
export interface ArtStyleContinuationInput {
  actorId: string; researchObjectId: string; runId: string; expectedVersion: number;
  versionId: string; imageAssetId: string; sceneIndex: number; style: string; idempotencyKey: string;
}

/** Scientific fields and every unselected scene stay exactly as reviewed. */
export function requireArtStyleContinuationDocument(base: StoryboardDocument, candidate: StoryboardDocument, sceneIndex: number): void {
  if (!Number.isInteger(sceneIndex) || !base.scenes[sceneIndex] || base.scenes[sceneIndex]!.paperOriginal
    || base.scenes[sceneIndex]!.illustration?.schemaVersion !== 2)
    unavailable('The selected scene is not a generated illustration');
  const science = (document: StoryboardDocument) => ({ ...document, scenes: document.scenes.map((scene, index) => {
    if (index !== sceneIndex || !scene.illustration) return scene;
    const { visualAction: _action, styleRecommendations: _recommendations, illustration, ...rest } = scene;
    const { composition: _composition, treatment: _treatment, ...fields } = illustration;
    void _action; void _recommendations; void _composition; void _treatment;
    return { ...rest, illustration: fields };
  }) });
  if (!isDeepStrictEqual(science(base), science(candidate))) unavailable('Art continuation changed science or an unselected scene');
}

async function sourceSnapshot(tx: Prisma.TransactionClient, run: Run) {
  const source = await readNarrativeCheckpointEvidence(tx, run);
  if (!source || source.claims.length !== run.sourceClaimIds.length
    || source.claims.some(c => c.extractionStatus !== 'succeeded')
    || source.claims.some(c => !['reviewed_ingestion', 'human'].includes(String(record(c.provenance).source))
      || (record(c.provenance).sourceTaskLineage ?? record(c.provenance).sourceTaskId) !== source.ingestion.id)
    || source.reference.artifactId !== source.ingestion.artifactId || source.reference.contentHash !== source.ingestion.artifact.blobSha256
    || source.claims.some(c => !source.evidence.some(e => e.claimId === c.id && e.exactQuote?.trim()))
    || source.evidence.some(e => e.artifactId !== source.ingestion.artifactId || e.contentHash !== source.ingestion.artifact.blobSha256))
    unavailable('Exact reviewed source binding changed');
  return { evidenceIdentity: source.sourceEvidenceIdentity, claimContent: source.claimContent,
    narrativeSourceIdentity: source.narrativeSourceIdentity };
}

async function readBase(tx: Prisma.TransactionClient, input: Pick<ArtStyleContinuationInput, 'actorId' | 'researchObjectId' | 'runId' | 'versionId' | 'imageAssetId' | 'sceneIndex'>) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include });
  if (!run || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId)
    throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
  await requirePresentationWriteScope(tx, { userId: input.actorId, researchObjectId: input.researchObjectId, versionId: input.versionId });
  if (run.profile !== VISUAL_NARRATIVE_PROFILE || run.status !== 'succeeded' || run.versionId !== input.versionId)
    unavailable('Style continuation requires a completed narrative in the current private version');
  const image = await tx.presentationAsset.findUnique({ where: { id: input.imageAssetId }, include: { sourceClaims: true } });
  const imageTask = await tx.agentTask.findUnique({ where: { id: input.imageAssetId }, include: { session: true } });
  const scene = image && presentationSceneImageView(image);
  const imageStep = run.steps.find(s => s.stage === 'scene_image' && s.presentationAssetId === input.imageAssetId && s.ordinal === input.sceneIndex);
  if (!image || image.deletedAt || image.status !== 'approved' || image.kind !== 'image' || !image.objectKey
    || image.researchObjectId !== input.researchObjectId || image.versionId !== input.versionId
    || !imageStep || imageStep.status !== 'succeeded' || imageStep.agentTaskId !== image.id
    || !imageTask || imageTask.deletedAt || imageTask.status !== 'succeeded' || imageTask.kind !== 'presentation.generate'
    || imageTask.session.userId !== input.actorId || imageTask.session.researchObjectId !== input.researchObjectId || imageTask.session.deletedAt || imageTask.session.status !== 'active'
    || !scene || scene.sceneIndex !== input.sceneIndex || scene.revisionAssetId
    || !isDeepStrictEqual(image.sourceClaims.map(s => s.claimId).sort(), [...run.sourceClaimIds].sort())) unavailable('The displayed image is not an owned completed scene');
  const imagePayload = parsePresentationGenerationPayload(imageTask.payload);
  if (!isDeepStrictEqual(imagePayload.hermesRunAuthority, { runId: run.id, stage: 'scene_image', ordinal: input.sceneIndex, profile: run.profile })
    || imagePayload.researchObjectId !== run.researchObjectId || imagePayload.versionId !== run.versionId
    || !isDeepStrictEqual(imagePayload.sourceClaimIds, [...run.sourceClaimIds].sort())
    || !isDeepStrictEqual(imagePayload.sceneImage, scene)) unavailable('Image task mapping changed');
  const parent = await requireSceneImageParent(tx, { researchObjectId: run.researchObjectId, versionId: run.versionId!, sourceClaimIds: [...run.sourceClaimIds].sort(), sceneImage: scene });
  const parentAsset = await tx.presentationAsset.findUnique({ where: { id: scene.storyboardAssetId } });
  const parentTask = await tx.agentTask.findUnique({ where: { id: scene.storyboardAssetId }, include: { session: true } });
  const review = record(record(parentAsset?.provenance).illustrationReview);
  if (!parent || !parentAsset || !parentTask || parentTask.deletedAt || parentTask.status !== 'succeeded'
    || parentTask.session.userId !== input.actorId || parentTask.session.deletedAt || parentTask.session.status !== 'active' || parentTask.session.researchObjectId !== run.researchObjectId
    || !run.steps.some(s => s.stage === 'storyboard' && s.status === 'succeeded' && s.presentationAssetId === parentAsset.id && s.agentTaskId === parentAsset.id)
    || parent.view.output !== 'image' || parent.view.scientificReview !== 'accepted' || !parent.view.document.narrative || parent.view.document.scenes[input.sceneIndex]?.paperOriginal
    || parent.view.document.scenes[input.sceneIndex]?.illustration?.schemaVersion !== 2
    || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== parentAsset.id
    || review.candidateHash !== digest(parent.view.document) || review.sourceEvidenceIdentity !== parent.sourceEvidenceIdentity)
    unavailable('An exact owned approved parent and accepted final brief are required');
  requireAcceptedSceneImageReview(image, parent, imageTask!.result);
  const source = await sourceSnapshot(tx, run);
  if (source.evidenceIdentity !== parent.sourceEvidenceIdentity) unavailable('Reviewed evidence differs from the accepted parent');
  const checkpoint = record(record(parentTask.result).storyboardCheckpoint);
  if (checkpoint.claimContent !== source.claimContent || checkpoint.sourceEvidenceIdentity !== source.evidenceIdentity
    || checkpoint.narrativeSourceIdentity !== source.narrativeSourceIdentity)
    unavailable('The accepted parent no longer matches the current reviewed science');
  const recommendations = parseIllustrationStyleRecommendations(parent.view.document.scenes[input.sceneIndex]!.styleRecommendations);
  if (!recommendations || !recommendations.choices.some(c => c.styleId !== recommendations.selectedStyleId))
    unavailable('The selected scene has no stored alternative style');
  return { run, image, parent, parentAsset, source, recommendations };
}

type Receipt = { schemaVersion: 1; parentRunId: string; versionId: string; imageAssetId: string; storyboardAssetId: string;
  sceneIndex: number; style: string; parentIdentity: string; imageContentHash: string; imageObjectKey: string;
  claimContent: string; narrativeSourceIdentity: string; sourceEvidenceIdentity: string; requestDigest: string; maxAgentTasks: 2;
  publicationAuthorized: false; intermediateReview: 'hermes'; planPayload: PresentationGenerationPayload };

export async function readArtStyleContinuationAuthority(tx: Prisma.TransactionClient, input: { runId: string; actorId: string }) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include });
  if (!run || run.maxAgentTasks !== 2) return null;
  const receipt = await tx.auditLog.findFirst({ where: { action: ART_STYLE_CONTINUATION, targetType: 'hermes_research_run', targetId: run.id, actorId: input.actorId } });
  const metadata = record(receipt?.metadata) as unknown as Receipt;
  if (!receipt || metadata.schemaVersion !== 1 || metadata.maxAgentTasks !== 2 || metadata.publicationAuthorized !== false
    || metadata.intermediateReview !== 'hermes' || run.actorId !== input.actorId || run.profile !== VISUAL_NARRATIVE_PROFILE
    || run.versionId !== metadata.versionId || !metadata.planPayload || metadata.requestDigest !== run.requestDigest)
    unavailable('Style continuation receipt is invalid');
  const base = await readBase(tx, { actorId: input.actorId, researchObjectId: run.researchObjectId, runId: metadata.parentRunId,
    versionId: metadata.versionId, imageAssetId: metadata.imageAssetId, sceneIndex: metadata.sceneIndex });
  if (base.parent.identity !== metadata.parentIdentity || base.image.contentHash !== metadata.imageContentHash
    || base.image.objectKey !== metadata.imageObjectKey || base.source.claimContent !== metadata.claimContent
    || base.source.narrativeSourceIdentity !== metadata.narrativeSourceIdentity || base.source.evidenceIdentity !== metadata.sourceEvidenceIdentity
    || base.parentAsset.id !== metadata.storyboardAssetId
    || base.recommendations.selectedStyleId === metadata.style || !base.recommendations.choices.some(c => c.styleId === metadata.style)
    || !isDeepStrictEqual(run.sourceClaimIds, base.run.sourceClaimIds)) unavailable('Style continuation inputs changed');
  const plan = run.steps.find(s => s.stage === 'storyboard' && s.ordinal === 0);
  const image = run.steps.find(s => s.stage === 'scene_image' && s.ordinal === metadata.sceneIndex);
  const slots = run.steps.filter(s => ['storyboard', 'scene_image', 'video'].includes(s.stage));
  if (!plan || !image || slots.length !== 2) unavailable('Style continuation step reservation changed');
  const tasks = await tx.agentTask.findMany({ where: { kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  if (tasks.length > 2 || tasks.some(t => t.id !== plan.agentTaskId && t.id !== image.agentTaskId)
    || tasks.some(t => t.executionAttempt > 1 || t.retryCount > 0)) unavailable('Style continuation task allowance exceeded');
  return { run, receipt, metadata, base, plan, image };
}

export async function requireArtStyleContinuationTaskAuthority(tx: Prisma.TransactionClient, input: {
  runId: string; actorId: string; taskId: string; payload: PresentationGenerationPayload; review?: boolean;
}) {
  const proof = await readArtStyleContinuationAuthority(tx, input);
  if (!proof) return false;
  const { run, plan, image, metadata } = proof;
  const isPlan = input.taskId === plan.agentTaskId;
  const step = isPlan ? plan : image;
  const expected = isPlan ? metadata.planPayload : imagePayload(run, metadata, plan.presentationAssetId!);
  if (input.taskId !== step.agentTaskId || !isDeepStrictEqual(input.payload, expected)
    || run.status !== (input.review ? (isPlan ? 'awaiting_storyboard_review' : 'awaiting_scene_images_review') : (isPlan ? 'generating_storyboard' : 'generating_scene_images'))
    || step.status !== (input.review ? 'awaiting_approval' : 'running')) unavailable('Style continuation task is outside its reserved step');
  if (!isPlan || input.review) {
    const asset = await tx.presentationAsset.findUnique({ where: { id: plan.presentationAssetId! } });
    const view = asset && presentationStoryboardView(asset, run.sourceClaimIds);
    const review = record(record(asset?.provenance).illustrationReview);
    if (!asset || !view || asset.deletedAt || asset.researchObjectId !== run.researchObjectId || asset.versionId !== run.versionId
      || review.stage !== 'final-brief' || review.requestId !== asset.id
      || (!isPlan && review.decision !== 'accepted')
      || review.candidateHash !== digest(view.document) || review.sourceEvidenceIdentity !== proof.base.source.evidenceIdentity
      || (!isPlan && asset.status !== 'approved')) unavailable('Style continuation plan lacks its accepted final brief');
    if (review.decision === 'accepted') {
      if (view.scientificReview !== 'accepted'
        || view.document.scenes[metadata.sceneIndex]?.styleRecommendations?.selectedStyleId !== metadata.style)
        unavailable('Style continuation does not have the exact accepted requested style');
      requireArtStyleContinuationDocument(proof.base.parent.view.document, view.document, metadata.sceneIndex);
    }
  }
  return true;
}

function imagePayload(run: Run, metadata: Receipt, storyboardAssetId: string): PresentationGenerationPayload {
  return { schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId!, kind: 'image',
    sourceClaimIds: run.sourceClaimIds, sceneImage: { storyboardAssetId, sceneIndex: metadata.sceneIndex },
    hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: metadata.sceneIndex, profile: VISUAL_NARRATIVE_PROFILE } };
}

async function persistReservedTask(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: Run,
  step: Run['steps'][number], payload: PresentationGenerationPayload) {
  if (step.status !== 'waiting' || step.agentTaskId) unavailable('Style continuation slot is already consumed');
  parsePresentationGenerationPayload(payload);
  const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, { userId: run.actorId, researchObjectId: run.researchObjectId,
    kind: 'visualization', title: 'Hermes illustration style', idempotencyKey: `hermes-run-session:${run.id}` });
  const { task } = await persistAgentTaskInTransaction(deps, tx, { sessionId: session.id, userId: run.actorId,
    kind: 'presentation.generate', payload: payload as unknown as Record<string, unknown>, idempotencyKey: `hermes-run:${run.id}:${step.stage}:${step.ordinal}` });
  const changed = await tx.hermesResearchStep.updateMany({ where: { id: step.id, status: 'waiting', agentTaskId: null }, data: { status: 'running', agentTaskId: task.id } });
  if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Style continuation slot changed');
  return task.id;
}

export async function createHermesArtStyleContinuation(deps: HermesResearchRunDeps, input: ArtStyleContinuationInput, ctx: AuditContext = {}) {
  if (!deps.audit?.record) unavailable('Durable style continuation audit is unavailable');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || !Number.isInteger(input.sceneIndex) || input.sceneIndex < 0
    || !input.style.trim() || input.style.length > 100 || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200)
    throw new HermesResearchRunError('VALIDATION_ERROR', 'Invalid style continuation request');
  const requestDigest = digest(input);
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await deps.prisma.$transaction(async tx => {
        await requirePresentationWriteScope(tx, { userId: input.actorId, researchObjectId: input.researchObjectId, versionId: input.versionId });
        const replay = await tx.hermesResearchRun.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
        if (replay) {
          if (replay.actorId !== input.actorId || replay.requestDigest !== requestDigest)
            throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Style continuation key belongs to a different request');
          return replay;
        }
        const base = await readBase(tx, input);
        if (base.recommendations.selectedStyleId === input.style || !base.recommendations.choices.some(c => c.styleId === input.style))
          throw new HermesResearchRunError('VALIDATION_ERROR', 'Choose a saved style recommendation for this exact scene');
        if (base.run.version !== input.expectedVersion) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Parent run changed');
        const pending = await pendingChild(tx, input.imageAssetId);
        if (pending) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'This image already has a pending style continuation');
        const fenced = await tx.hermesResearchRun.updateMany({ where: { id: base.run.id, version: input.expectedVersion, status: 'succeeded' }, data: { version: { increment: 1 } } });
        if (fenced.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Parent run changed');
        const settings = { locale: base.parent.view.locale, style: input.style, instruction: 'Change only the selected scene’s artistic composition and treatment; preserve all scientific content and other scenes.' };
        const run = await tx.hermesResearchRun.create({ data: { actorId: input.actorId, researchObjectId: input.researchObjectId,
          versionId: input.versionId, profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 2, generationSettings: settings,
          sourceClaimIds: base.run.sourceClaimIds, sourceReviewDigest: base.run.sourceReviewDigest, status: 'generating_storyboard',
          idempotencyKey: input.idempotencyKey, requestDigest, steps: { create: [
            ...base.run.steps.filter(s => s.stage === 'source_ingestion').map(s => ({ stage: s.stage, ordinal: s.ordinal,
              status: 'succeeded', ingestionTaskId: s.ingestionTaskId, artifactId: s.artifactId, agentTaskId: s.agentTaskId })),
            { stage: 'storyboard', ordinal: 0, status: 'waiting' }, { stage: 'scene_image', ordinal: input.sceneIndex, status: 'waiting' },
          ] } }, include });
        const planPayload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: run.researchObjectId,
          versionId: run.versionId, kind: 'interactive_html', sourceClaimIds: run.sourceClaimIds,
          storyboard: { ...settings, output: 'image', narrative: true, baseAssetId: base.parentAsset.id, revisionMode: 'art', artSceneIndex: input.sceneIndex },
          hermesRunAuthority: { runId: run.id, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
        const metadata: Receipt = { schemaVersion: 1, parentRunId: base.run.id, versionId: input.versionId,
          imageAssetId: input.imageAssetId, storyboardAssetId: base.parentAsset.id, sceneIndex: input.sceneIndex, style: input.style,
          parentIdentity: base.parent.identity, imageContentHash: base.image.contentHash, imageObjectKey: base.image.objectKey,
          claimContent: base.source.claimContent, narrativeSourceIdentity: base.source.narrativeSourceIdentity,
          sourceEvidenceIdentity: base.source.evidenceIdentity, requestDigest, maxAgentTasks: 2, publicationAuthorized: false, intermediateReview: 'hermes', planPayload };
        await recordAudit(deps, tx, { actorId: input.actorId, action: ART_STYLE_CONTINUATION, targetType: 'hermes_research_run', targetId: run.id,
          metadata: metadata as unknown as Record<string, unknown> }, ctx);
        // Receipt + both unique slots exist before the existing ledger can create/charge a task.
        await readArtStyleContinuationAuthority(tx, { runId: run.id, actorId: run.actorId });
        await persistReservedTask(deps, tx, run, run.steps.find(s => s.stage === 'storyboard')!, planPayload);
        return (await tx.hermesResearchRun.findUnique({ where: { id: run.id }, include }))!;
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
      const taskIds = { storyboard: result.steps.find(s => s.stage === 'storyboard')?.agentTaskId ?? null,
        sceneImage: result.steps.find(s => s.stage === 'scene_image')?.agentTaskId ?? null };
      if (taskIds.storyboard) await dispatchAgentTask(deps, taskIds.storyboard).catch(() => false);
      return { run: result, taskIds };
    } catch (error) {
      if (['P2034', 'P2002'].includes(String((error as { code?: string }).code)) && attempt < 2) continue;
      throw error;
    }
  }
}

async function pendingChild(tx: Prisma.TransactionClient, imageAssetId: string) {
  const receipts = await tx.auditLog.findMany({ where: { action: ART_STYLE_CONTINUATION, targetType: 'hermes_research_run',
    metadata: { path: ['imageAssetId'], equals: imageAssetId } }, select: { targetId: true } });
  return tx.hermesResearchRun.findFirst({ where: { id: { in: receipts.map(r => r.targetId).filter((id): id is string => Boolean(id)) },
    status: { notIn: ['succeeded', 'failed', 'stopped'] } }, select: { id: true } });
}

export async function getHermesArtStyleContinuationCapability(tx: Prisma.TransactionClient, run: Run) {
  const eligibleImages: Array<{ imageAssetId: string; storyboardAssetId: string; sceneIndex: number }> = [];
  if (run.status === 'succeeded' && run.versionId && run.profile === VISUAL_NARRATIVE_PROFILE) {
    for (const step of run.steps.filter(s => s.stage === 'scene_image' && s.presentationAssetId)) {
      try {
        const base = await readBase(tx, { actorId: run.actorId, researchObjectId: run.researchObjectId, runId: run.id,
          versionId: run.versionId, imageAssetId: step.presentationAssetId!, sceneIndex: step.ordinal });
        if (!await pendingChild(tx, base.image.id)) eligibleImages.push({ imageAssetId: base.image.id, storyboardAssetId: base.parentAsset.id, sceneIndex: step.ordinal });
      } catch { /* Capability never grants authority; POST repeats all checks transactionally. */ }
    }
  }
  return { eligibleImages, maxAgentTasks: 2 as const };
}

/** Exact displayed-image discovery. No receipt, task, grant, or state change occurs here. */
export async function getHermesImageArtStyleCapability(deps: HermesResearchRunDeps, input: {
  actorId: string; researchObjectId: string; versionId: string; imageAssetId: string;
}) {
  await requirePresentationWriteScope(deps.prisma, { userId: input.actorId, researchObjectId: input.researchObjectId, versionId: input.versionId });
  const slots = await deps.prisma.hermesResearchStep.findMany({ where: { stage: 'scene_image', status: 'succeeded',
    presentationAssetId: input.imageAssetId, run: { actorId: input.actorId, researchObjectId: input.researchObjectId,
      versionId: input.versionId, profile: VISUAL_NARRATIVE_PROFILE, status: 'succeeded' } } });
  if (slots.length !== 1) return { styleContinuation: null };
  try {
    const slot = slots[0]!;
    const base = await readBase(deps.prisma, { ...input, runId: slot.runId, sceneIndex: slot.ordinal });
    if (await pendingChild(deps.prisma, input.imageAssetId)) return { styleContinuation: null };
    return { styleContinuation: { runId: base.run.id, expectedVersion: base.run.version, versionId: input.versionId,
      imageAssetId: input.imageAssetId, storyboardAssetId: base.parentAsset.id, sceneIndex: slot.ordinal,
      maxAgentTasks: 2 as const, choices: base.recommendations.choices.filter(c => c.styleId !== base.recommendations.selectedStyleId) } };
  } catch { return { styleContinuation: null }; }
}

/** Existing reconciler owns polling, dispatch recovery, status changes and automatic review. */
export async function advanceArtStyleContinuation(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: Run): Promise<string | null> {
  const proof = await readArtStyleContinuationAuthority(tx, { runId: run.id, actorId: run.actorId });
  if (!proof) return null;
  const planStage = run.status.includes('storyboard');
  const step = planStage ? proof.plan : proof.image;
  const task = step.agentTaskId ? await tx.agentTask.findUnique({ where: { id: step.agentTaskId } }) : null;
  if (!task || task.deletedAt) return 'failed';
  if (task.status === 'failed') return task.error?.startsWith('[blocked]') ? 'stopped' : 'failed';
  if (run.status.startsWith('generating_')) {
    if (task.status !== 'succeeded') return null;
    const asset = await tx.presentationAsset.findUnique({ where: { id: task.id } });
    if (!asset || asset.deletedAt || asset.versionId !== run.versionId || asset.researchObjectId !== run.researchObjectId) return 'failed';
    const changed = await tx.hermesResearchStep.updateMany({ where: { id: step.id, status: 'running', agentTaskId: task.id }, data: { status: 'awaiting_approval', presentationAssetId: asset.id } });
    if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Style continuation result changed');
    return planStage ? 'awaiting_storyboard_review' : 'awaiting_scene_images_review';
  }
  const asset = step.presentationAssetId ? await tx.presentationAsset.findUnique({ where: { id: step.presentationAssetId } }) : null;
  if (!asset || asset.status === 'rejected') return 'stopped';
  if (asset.status !== 'approved') return null;
  await requireArtStyleContinuationTaskAuthority(tx, { runId: run.id, actorId: run.actorId, taskId: task.id,
    payload: parsePresentationGenerationPayload(task.payload), review: true });
  await tx.hermesResearchStep.updateMany({ where: { id: step.id, status: 'awaiting_approval' }, data: { status: 'succeeded' } });
  if (!planStage) return 'succeeded';
  await persistReservedTask(deps, tx, run, proof.image, imagePayload(run, proof.metadata, asset.id));
  return 'generating_scene_images';
}
