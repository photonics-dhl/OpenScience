import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../workspace/audit';
import { dispatchAgentTask, findOrCreateAgentSessionInTransaction, persistAgentTaskInTransaction } from './agent';
import { HermesResearchRunError, type HermesResearchRunDeps } from './research-run';
import { parseWorkspaceGuidePayload } from './workspace-guide-contract';
import { nativeAgentTerminalResult, readNativeAgentExecution, requireNativeIllustrationTerminalSource } from './native-agent-execution';
import { parsePresentationGenerationPayload, requirePresentationWriteScope, type PresentationGenerationPayload } from '../assets/presentation-asset';
import { presentationStoryboardView } from '../assets/storyboard';
import { requireSceneImageParent, requireAcceptedSceneImageReview } from '../assets/scene-image';
import { readNativeImageAgentExecution } from '../assets/native-image-review';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { readVisualNarrativeSource, readReviewedPresentationEvidence, presentationClaimContent, presentationEvidenceIdentity, type FirstImageSourceContext } from '../assets/illustration-source';

// Distinguishes a single current image request from max2 art revisions and max9 whole-paper runs.
export const FIRST_IMAGE_CONTINUATION = 'hermes.research_run.first_image';
const include = { steps: { orderBy: { ordinal: 'asc' as const } } };
type Run = Prisma.HermesResearchRunGetPayload<{ include: typeof include }>;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function unavailable(message: string): never { throw new HermesResearchRunError('SOURCE_NOT_READY', message); }
type Receipt = {
  originGuideTaskId: string; sessionId: string; versionId: string; requestDigest: string;
  purpose: 'first_image'; maxRenderTasks: 1; publicationAuthorized: false; automaticImageRepair: false;
  intermediateReview: 'hermes'; claimContent: string; narrativeSourceIdentity: string; sourceEvidenceIdentity: string;
  planPayload: PresentationGenerationPayload;
};

async function sourceSnapshot(tx: Prisma.TransactionClient, run: Run, context?: FirstImageSourceContext) {
  const version = await requirePresentationWriteScope(tx, { userId: run.actorId, researchObjectId: run.researchObjectId, versionId: run.versionId! });
  const scope = { userId: run.actorId, workspaceId: version.researchObject.workspaceId,
    researchObjectId: run.researchObjectId, versionId: run.versionId!, sourceClaimIds: run.sourceClaimIds };
  const current = run.steps.find(s => s.stage === 'scene_image' && s.agentTaskId) ?? run.steps.find(s => s.stage === 'storyboard');
  const sourceStep = run.steps.find(s => s.stage === 'source_ingestion');
  const ingestion = sourceStep?.ingestionTaskId ? await tx.ingestionTask.findUnique({ where: { id: sourceStep.ingestionTaskId } }) : null;
  if (!ingestion || ingestion.state !== 'confirmed' || ingestion.agentTaskId !== sourceStep?.agentTaskId
    || ingestion.artifactId !== sourceStep?.artifactId) unavailable('First-image source pointer changed');
  const source = await readVisualNarrativeSource(tx, scope, context ?? { runId: run.id, taskId: current?.agentTaskId ?? '' });
  const claims = await tx.claimNode.findMany({ where: { id: { in: run.sourceClaimIds }, researchObjectId: run.researchObjectId, versionId: run.versionId! } });
  const lineage = new Map(claims.map(c => [c.id, record(c.provenance).sourceTaskLineage ?? record(c.provenance).sourceTaskId]));
  const evidence = await readReviewedPresentationEvidence(tx, scope, lineage);
  if (claims.length !== run.sourceClaimIds.length || !claims.length
    || claims.some(c => c.extractionStatus !== 'succeeded'
      || !['reviewed_ingestion', 'human'].includes(String(record(c.provenance).source))
      || lineage.get(c.id) !== run.steps.find(s => s.stage === 'source_ingestion')?.ingestionTaskId)
    || evidence.some(e => e.artifactId !== source.reference.artifactId || e.contentHash !== source.reference.contentHash))
    unavailable('The saved version needs its exact reviewed paper, Claims, Evidence and SourceMap');
  return { claimContent: presentationClaimContent(claims), narrativeSourceIdentity: source.identity,
    sourceEvidenceIdentity: presentationEvidenceIdentity(evidence) };
}

/** Missing receipt means a different existing workflow, never an implicit max2 grant. */
export async function readFirstImageContinuationAuthority(tx: Prisma.TransactionClient, input: { runId: string; actorId: string }) {
  const run = await tx.hermesResearchRun.findUnique({ where: { id: input.runId }, include });
  if (!run || run.maxAgentTasks !== 2 || run.profile !== VISUAL_NARRATIVE_PROFILE) return null;
  const receipt = await tx.auditLog.findFirst({ where: { action: FIRST_IMAGE_CONTINUATION,
    targetType: 'hermes_research_run', targetId: input.runId, actorId: input.actorId } });
  if (!receipt) return null;
  const metadata = record(receipt.metadata) as unknown as Receipt;
  if (!run || run.actorId !== input.actorId || run.profile !== VISUAL_NARRATIVE_PROFILE || run.maxAgentTasks !== 2
    || run.versionId !== metadata.versionId || metadata.purpose !== 'first_image' || metadata.maxRenderTasks !== 1
    || metadata.publicationAuthorized !== false || metadata.automaticImageRepair !== false || metadata.intermediateReview !== 'hermes'
    || metadata.requestDigest !== run.requestDigest) unavailable('First-image receipt does not match its run');
  await requirePresentationWriteScope(tx, { userId: run.actorId, researchObjectId: run.researchObjectId, versionId: run.versionId! });
  const guide = await tx.agentTask.findUnique({ where: { id: metadata.originGuideTaskId }, include: { session: true } });
  if (!guide || guide.deletedAt || guide.kind !== 'workspace.guide' || guide.sessionId !== metadata.sessionId
    || guide.session.deletedAt || guide.session.status !== 'active' || guide.session.userId !== run.actorId
    || guide.session.researchObjectId !== run.researchObjectId) unavailable('First-image request owner changed');
  const original = parseWorkspaceGuidePayload(guide.payload);
  if (original.executionIntent !== 'first-image' || original.context.presentation?.researchObjectId !== run.researchObjectId
    || original.context.presentation.versionId !== run.versionId || digest({ guideTaskId: guide.id, payload: original }) !== run.requestDigest)
    unavailable('First-image request changed');
  const plans = run.steps.filter(s => s.stage === 'storyboard'); const images = run.steps.filter(s => s.stage === 'scene_image');
  const sources = run.steps.filter(s => s.stage === 'source_ingestion');
  if (run.steps.length !== 3 || sources.length !== 1 || sources[0]!.status !== 'succeeded' || plans.length !== 1 || images.length !== 1
    || plans[0]!.ordinal !== 0 || images[0]!.ordinal !== 0) unavailable('First-image task slots changed');
  const source = await sourceSnapshot(tx, run);
  if (!['claimContent', 'narrativeSourceIdentity', 'sourceEvidenceIdentity'].every(k => source[k as keyof typeof source] === metadata[k as keyof Receipt]))
    unavailable('First-image reviewed source changed');
  const settings = { locale: original.locale, style: 'auto', instruction: original.goal };
  const expected = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
    kind: 'interactive_html', sourceClaimIds: run.sourceClaimIds, storyboard: { ...settings, output: 'image', narrative: true, narrativeSceneLimit: 1 },
    hermesRunAuthority: { runId: run.id, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
  if (!isDeepStrictEqual(run.generationSettings, settings) || !isDeepStrictEqual(metadata.planPayload, expected)) unavailable('First-image plan request changed');
  const tasks = await tx.agentTask.findMany({ where: { kind: 'presentation.generate', payload: { path: ['hermesRunAuthority', 'runId'], equals: run.id } } });
  const slots = [plans[0]!, images[0]!];
  if (tasks.length > 2 || tasks.filter(t => record(t.payload).kind === 'image').length > 1
    || tasks.some(t => !slots.some(s => s.agentTaskId === t.id))) unavailable('First-image allowance was exceeded');
  return { run, metadata, plan: plans[0]!, image: images[0]!, source };
}

async function reserveTask(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: Run, step: Run['steps'][number], payload: PresentationGenerationPayload) {
  if (step.status !== 'waiting' || step.agentTaskId) unavailable('First-image task slot is already consumed');
  const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, { userId: run.actorId, researchObjectId: run.researchObjectId,
    kind: 'visualization', title: 'Hermes illustration', idempotencyKey: `hermes-run-session:${run.id}` });
  const { task } = await persistAgentTaskInTransaction(deps, tx, { sessionId: session.id, userId: run.actorId,
    kind: 'presentation.generate', payload, idempotencyKey: `hermes-run:${run.id}:${step.stage}:0` });
  const changed = await tx.hermesResearchStep.updateMany({ where: { id: step.id, runId: run.id, status: 'waiting', agentTaskId: null },
    data: { status: 'running', agentTaskId: task.id } });
  if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'First-image slot changed');
  return task.id;
}

/** Called only by the current claimed guide handler, never by a model-supplied action. */
export async function createHermesFirstImageContinuation(deps: HermesResearchRunDeps, input: { guideTaskId: string; executionAttempt: number; payload: Record<string, unknown> }) {
  if (!deps.audit?.record || !deps.nativeAgentRuntime || !deps.nativeSceneImageEnabled || !deps.sceneImageEnabled) unavailable('Hermes image generation is not available');
  for (let attempt = 0; ; attempt++) {
    try {
      const run = await deps.prisma.$transaction(async tx => {
        const guide = await tx.agentTask.findUnique({ where: { id: input.guideTaskId }, include: { session: true } });
        if (!guide || guide.deletedAt || guide.kind !== 'workspace.guide' || guide.status !== 'running'
          || guide.executionAttempt !== input.executionAttempt || guide.session.deletedAt || guide.session.status !== 'active'
          || !isDeepStrictEqual(guide.payload, input.payload)) unavailable('Current guide execution is no longer owned');
        const claim = await tx.agentTask.updateMany({ where: { id: guide.id, status: 'running', deletedAt: null,
          executionAttempt: input.executionAttempt, payload: { equals: guide.payload! } }, data: { progress: guide.progress } });
        if (claim.count !== 1) unavailable('Current guide execution changed before continuation');
        const payload = parseWorkspaceGuidePayload(guide.payload);
        const scope = payload.context.presentation;
        if (payload.executionIntent !== 'first-image' || !scope?.versionId || guide.session.researchObjectId !== scope.researchObjectId)
          unavailable('A current scoped first-image request is required');
        const actorId = guide.session.userId;
        const version = await requirePresentationWriteScope(tx, { userId: actorId, researchObjectId: scope.researchObjectId, versionId: scope.versionId });
        const idempotencyKey = `hermes-first-image:${guide.id}`;
        const requestDigest = digest({ guideTaskId: guide.id, payload });
        const replay = await tx.hermesResearchRun.findUnique({ where: { idempotencyKey }, include });
        if (replay) {
          if (replay.actorId !== actorId || replay.requestDigest !== requestDigest) unavailable('First-image request replay changed');
          return replay;
        }
        const pending = await tx.hermesResearchRun.findFirst({ where: { actorId, researchObjectId: scope.researchObjectId, versionId: scope.versionId,
          status: { notIn: ['succeeded', 'failed', 'stopped'] } } });
        if (pending) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'This saved version already has an active image operation');
        // Serialize different guide keys against the same research object before reserving any paid task.
        const fenced = await tx.researchObject.updateMany({ where: { id: scope.researchObjectId, version: version.researchObject.version, deletedAt: null },
          data: { version: { increment: 1 } } });
        if (fenced.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Research object changed');
        const claims = await tx.claimNode.findMany({ where: { researchObjectId: scope.researchObjectId, versionId: scope.versionId }, orderBy: { id: 'asc' } });
        const lineages = new Set(claims.map(c => record(c.provenance).sourceTaskLineage ?? record(c.provenance).sourceTaskId));
        if (!claims.length || claims.length > 12 || lineages.size !== 1 || typeof [...lineages][0] !== 'string') unavailable('Select one reviewed paper in the saved version');
        const source = await tx.ingestionTask.findUnique({ where: { id: [...lineages][0] as string } });
        if (!source || source.state !== 'confirmed' || !source.agentTaskId) unavailable('Reviewed paper source is not ready');
        const settings = { locale: payload.locale, style: 'auto', instruction: payload.goal };
        const created = await tx.hermesResearchRun.create({ data: { actorId, researchObjectId: scope.researchObjectId, versionId: scope.versionId,
          profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 2, generationSettings: settings, sourceClaimIds: claims.map(c => c.id),
          status: 'generating_storyboard', idempotencyKey, requestDigest, steps: { create: [
            { stage: 'source_ingestion', ordinal: 0, status: 'succeeded', ingestionTaskId: source.id, artifactId: source.artifactId, agentTaskId: source.agentTaskId },
            { stage: 'storyboard', ordinal: 0, status: 'waiting' }, { stage: 'scene_image', ordinal: 0, status: 'waiting' },
          ] } }, include });
        const snapshot = await sourceSnapshot(tx, created, { guideTaskId: guide.id, executionAttempt: input.executionAttempt });
        const planPayload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: created.researchObjectId,
          versionId: created.versionId, kind: 'interactive_html', sourceClaimIds: created.sourceClaimIds,
          storyboard: { ...settings, output: 'image', narrative: true, narrativeSceneLimit: 1 },
          hermesRunAuthority: { runId: created.id, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
        const metadata: Receipt = { originGuideTaskId: guide.id, sessionId: guide.sessionId, versionId: scope.versionId, requestDigest,
          purpose: 'first_image', maxRenderTasks: 1, publicationAuthorized: false, automaticImageRepair: false,
          intermediateReview: 'hermes', ...snapshot, planPayload };
        await recordAudit(deps, tx, { actorId, action: FIRST_IMAGE_CONTINUATION, targetType: 'hermes_research_run', targetId: created.id,
          workspaceId: version.researchObject.workspaceId, metadata: metadata as unknown as Record<string, unknown> }, { requestId: guide.id });
        await reserveTask(deps, tx, created, created.steps.find(s => s.stage === 'storyboard')!, planPayload);
        return (await tx.hermesResearchRun.findUnique({ where: { id: created.id }, include }))!;
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
      for (const step of run.steps) if (step.stage !== 'source_ingestion' && step.status === 'running' && step.agentTaskId)
        await dispatchAgentTask(deps, step.agentTaskId).catch(() => false);
      return { runId: run.id, versionId: run.versionId! };
    } catch (error) {
      if (['P2034', 'P2002'].includes(String((error as { code?: string }).code)) && attempt < 2) continue;
      throw error;
    }
  }
}

export async function requireFirstImageContinuationTaskAuthority(tx: Prisma.TransactionClient, input: {
  runId: string; actorId: string; taskId: string; payload: PresentationGenerationPayload; review?: boolean;
}) {
  const proof = await readFirstImageContinuationAuthority(tx, input);
  if (!proof) return false;
  const { run, plan, image, metadata } = proof;
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.session.deletedAt || task.session.status !== 'active'
    || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId
    || !isDeepStrictEqual(task.payload, input.payload)) unavailable('First-image task owner changed');
  const stage = input.payload.hermesRunAuthority?.stage;
  const slot = stage === 'storyboard' ? plan : stage === 'scene_image' ? image : null;
  const expected = stage === 'storyboard' ? metadata.planPayload : parsePresentationGenerationPayload({
    schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId, kind: 'image', sourceClaimIds: run.sourceClaimIds,
    sceneImage: { storyboardAssetId: plan.presentationAssetId, sceneIndex: 0 },
    hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE },
  });
  if (!slot || slot.agentTaskId !== input.taskId || !isDeepStrictEqual(input.payload, expected)
    || slot.status !== (input.review ? 'awaiting_approval' : 'running')
    || (input.review ? task.status !== 'succeeded' : !['pending', 'running'].includes(task.status))
    || run.status !== (input.review ? stage === 'storyboard' ? 'awaiting_storyboard_review' : 'awaiting_scene_images_review'
      : stage === 'storyboard' ? 'generating_storyboard' : 'generating_scene_images')) unavailable('First-image task is not the active slot');
  if (stage === 'scene_image') await requireSceneImageParent(tx, expected);
  return true;
}

/** Lost guide result recovery is lookup only. It never allocates a new run or paid task. */
export async function findFirstImageContinuation(tx: Prisma.TransactionClient, input: { actorId: string; researchObjectId: string; originGuideTaskId: string }) {
  const guide = await tx.agentTask.findUnique({ where: { id: input.originGuideTaskId }, include: { session: true } });
  if (!guide || guide.deletedAt || guide.kind !== 'workspace.guide' || guide.session.deletedAt
    || guide.session.userId !== input.actorId || guide.session.researchObjectId !== input.researchObjectId)
    throw new HermesResearchRunError('NOT_FOUND', 'Hermes request not found');
  const payload = parseWorkspaceGuidePayload(guide.payload);
  if (payload.executionIntent !== 'first-image') return null;
  const run = await tx.hermesResearchRun.findUnique({ where: { idempotencyKey: `hermes-first-image:${guide.id}` }, include });
  if (!run) return null;
  const receipt = await tx.auditLog.findFirst({ where: { action: FIRST_IMAGE_CONTINUATION, targetType: 'hermes_research_run',
    targetId: run.id, actorId: input.actorId } });
  if (!receipt || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId
    || run.requestDigest !== digest({ guideTaskId: guide.id, payload }) || run.versionId !== payload.context.presentation?.versionId)
    unavailable('First-image recovery binding changed');
  return run.id;
}

/** Advances only the two stored slots; failures never allocate a replacement image. */
export async function advanceFirstImageContinuation(deps: HermesResearchRunDeps, tx: Prisma.TransactionClient, run: Run): Promise<string | null> {
  const proof = await readFirstImageContinuationAuthority(tx, { runId: run.id, actorId: run.actorId });
  if (!proof) return null;
  const planning = run.status.includes('storyboard'); const slot = planning ? proof.plan : proof.image;
  const task = slot.agentTaskId ? await tx.agentTask.findUnique({ where: { id: slot.agentTaskId }, include: { session: true } }) : null;
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.session.deletedAt || task.session.status !== 'active'
    || task.session.userId !== run.actorId || task.session.researchObjectId !== run.researchObjectId) return 'stopped';
  if (task.status === 'failed') return task.error?.startsWith('[blocked]') ? 'stopped' : 'failed';
  if (task.status !== 'succeeded') return null;
  const asset = await tx.presentationAsset.findUnique({ where: { id: task.id } });
  if (!asset || asset.deletedAt || asset.researchObjectId !== run.researchObjectId || asset.versionId !== run.versionId) return 'failed';
  if (planning) {
    const view = presentationStoryboardView(asset); const review = record(record(asset.provenance).illustrationReview);
    const saved = record(task.result); const checkpoint = record(saved.storyboardCheckpoint);
    if (!view || view.output !== 'image' || view.document.scenes.length !== 1 || view.document.scenes[0]!.paperOriginal
      || readNativeAgentExecution(task.result)?.profile !== 'paper-illustration'
      || saved.assetId !== asset.id || saved.contentHash !== asset.contentHash
      || !isDeepStrictEqual(task.payload, proof.metadata.planPayload) || !isDeepStrictEqual(checkpoint.payload, task.payload)
      || !isDeepStrictEqual(record(checkpoint.planned).document, view.document)
      || !isDeepStrictEqual(saved.storyboardReview, review)
      || checkpoint.claimContent !== proof.source.claimContent || checkpoint.narrativeSourceIdentity !== proof.source.narrativeSourceIdentity
      || review.stage !== 'final-brief' || review.decision !== 'accepted' || review.requestId !== task.id
      || review.candidateHash !== digest(view.document) || review.sourceEvidenceIdentity !== proof.source.sourceEvidenceIdentity) return 'stopped';
    nativeAgentTerminalResult(task, 'succeeded', task.result);
    await requireNativeIllustrationTerminalSource(tx, task);
    if (run.status === 'generating_storyboard') {
      const changed = await tx.hermesResearchStep.updateMany({ where: { id: slot.id, status: 'running', agentTaskId: task.id },
        data: { status: 'awaiting_approval', presentationAssetId: asset.id } });
      if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'First-image plan changed');
      return 'awaiting_storyboard_review';
    }
    if (asset.status !== 'approved') return asset.status === 'rejected' ? 'stopped' : null;
    const payload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: run.researchObjectId, versionId: run.versionId,
      kind: 'image', sourceClaimIds: run.sourceClaimIds, sceneImage: { storyboardAssetId: asset.id, sceneIndex: 0 },
      hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
    await requireSceneImageParent(tx, payload);
    await reserveTask(deps, tx, run, proof.image, payload);
    const adopted = await tx.hermesResearchStep.updateMany({ where: { id: slot.id, status: 'awaiting_approval', agentTaskId: task.id }, data: { status: 'succeeded' } });
    if (adopted.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'First-image approved plan changed');
    return 'generating_scene_images';
  }
  const payload = parsePresentationGenerationPayload(task.payload);
  const expected = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: run.researchObjectId,
    versionId: run.versionId, kind: 'image', sourceClaimIds: run.sourceClaimIds,
    sceneImage: { storyboardAssetId: proof.plan.presentationAssetId, sceneIndex: 0 },
    hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
  if (!isDeepStrictEqual(payload, expected)) return 'stopped';
  const parent = await requireSceneImageParent(tx, payload);
  const provenance = record(asset.provenance); const saved = record(task.result);
  if (!parent || asset.status !== 'draft' || asset.kind !== 'image' || !asset.objectKey
    || provenance.source !== 'approved_storyboard_scene' || provenance.contentType !== 'image/png'
    || provenance.taskId !== task.id || provenance.parentIdentity !== parent.identity
    || provenance.storyboardAssetId !== proof.plan.presentationAssetId || provenance.sceneIndex !== 0
    || saved.assetId !== asset.id || saved.contentHash !== asset.contentHash
    || readNativeImageAgentExecution(task.result)?.checkpoint?.state !== 'completed') return 'stopped';
  requireAcceptedSceneImageReview(asset, parent, task.result);
  const changed = await tx.hermesResearchStep.updateMany({ where: { id: slot.id, agentTaskId: task.id, status: 'running' },
    data: { status: 'succeeded', presentationAssetId: asset.id } });
  if (changed.count !== 1) throw new HermesResearchRunError('CONCURRENT_UPDATE', 'First-image result changed');
  return 'succeeded';
}
