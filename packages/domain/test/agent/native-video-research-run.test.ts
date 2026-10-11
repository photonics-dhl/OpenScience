import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import {
  createHermesResearchRun, getHermesResearchRun, reconcileHermesResearchRuns, requireHermesPresentationTaskAuthority,
  authorizeHermesGenerationGrant, type HermesNarrativeGrant, type HermesResearchRunDeps,
} from '../../src/agent/research-run';
import { CONTENT_DRIVEN_PROFILE, VISUAL_NARRATIVE_PROFILE, requireVideoGenerationParents } from '../../src/assets/video';
import { describeIllustrationBrief, type IllustrationBrief } from '../../src/assets/illustration-brief';
import { presentationClaimContent, presentationEvidenceIdentity, readVisualNarrativeSource } from '../../src/assets/illustration-source';
import { parseStoryboardDocument } from '../../src/assets/storyboard';
import { parsePresentationGenerationPayload, requireStoryboardBase, submitPresentationGeneration } from '../../src/assets/presentation-asset';
import { initialNativeAgentExecution, type NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { isHermesVideoTask } from '../../src/agent/video-readiness';
import type { Prisma } from '@prisma/client';

const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
const ids = { actor: uuid(1), ro: uuid(2), version: uuid(3), run: uuid(4), claim: uuid(5), artifact: uuid(6),
  ingestion: uuid(7), sourceTask: uuid(8), workspace: uuid(9), manifest: uuid(10), session: uuid(11), evidence: uuid(12) };
const time = new Date('2026-10-08T00:00:00Z');
const settings = { locale: 'zh' as const, style: 'scientific', instruction: 'Explain the supported transfer.' };
const grant = { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9 as const, ...settings };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(output: 'video' | null = 'video') {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: ids.actor });
  db.workspaces.push({ id: ids.workspace, status: 'active' });
  db.memberships.push({ workspaceId: ids.workspace, userId: ids.actor, role: 'author' });
  db.researchObjects.push({ id: ids.ro, workspaceId: ids.workspace, status: 'draft', visibility: 'private', deletedAt: null });
  db.versions.push({ id: ids.version, researchObjectId: ids.ro, status: 'draft', versionNo: 1 });
  db.versionManifests.push({ id: ids.manifest, versionId: ids.version, coreJson: {}, createdAt: time });
  db.manifestEntries.push({ manifestId: ids.manifest, artifactId: ids.artifact, blobSha256: 'a'.repeat(64) });
  db.artifacts.push({ id: ids.artifact, workspaceId: ids.workspace, mimeType: 'application/pdf', blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: 'source-batch', researchObjectId: ids.ro, userId: ids.actor });
  db.agentSessions.push({ id: ids.session, userId: ids.actor, researchObjectId: ids.ro, kind: 'ingestion', status: 'active', deletedAt: null });
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: ids.artifact, contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  db.agentTasks.push({ id: ids.sourceTask, sessionId: ids.session, kind: 'sdf.extract', status: 'succeeded', deletedAt: null, updatedAt: time,
    result: { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: 4, responseHash: 'c'.repeat(64) },
      core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' } } });
  db.ingestionTasks.push({ id: ids.ingestion, batchId: 'source-batch', artifactId: ids.artifact, agentTaskId: ids.sourceTask, state: 'confirmed', error: null });
  db.claimNodes.push({ id: ids.claim, researchObjectId: ids.ro, versionId: ids.version, parentClaimId: null, kind: 'finding',
    statement: 'The source transfers energy to the receiver.', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded', updatedAt: time,
    provenance: { source: 'reviewed_ingestion', sourceTaskId: ids.ingestion } });
  db.evidenceRecords.push({ id: ids.evidence, claimId: ids.claim, researchObjectId: ids.ro, versionId: ids.version,
    artifactId: ids.artifact, contentHash: 'a'.repeat(64), exactQuote: 'The source transfers energy to the receiver.', relation: 'supports', locator: { page: 1 },
    extractionStatus: 'succeeded', updatedAt: time, provenance: { source: 'reviewed_ingestion', sourceTaskId: ids.ingestion } });
  db.usageLedger.push({ id: 'existing-credit', userId: ids.actor, resource: 'ai_credit', delta: 100, kind: 'grant' });
  db.hermesResearchRuns.push({ id: ids.run, actorId: ids.actor, researchObjectId: ids.ro, versionId: ids.version,
    profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, generationSettings: { ...settings, ...(output === null ? {} : { output }) },
    sourceClaimIds: [ids.claim], sourceReviewDigest: 'existing-reviewed-source', status: 'awaiting_claim_review', version: 1,
    error: null, lastReconciledAt: null, createdAt: time, updatedAt: time });
  const step = (stage: string, extra: Record<string, unknown> = {}) => ({ id: `run-${stage}`, runId: ids.run, stage, ordinal: 0,
    status: 'succeeded', ingestionTaskId: null, artifactId: null, agentTaskId: null, presentationAssetId: null, error: null, ...extra });
  db.hermesResearchSteps.push(step('source_ingestion', { ingestionTaskId: ids.ingestion, artifactId: ids.artifact, agentTaskId: ids.sourceTask }),
    step('source_composition'), step('source_review'));

  // Supply the missing database operations locally, retaining the shared fake's transaction rollback and real task billing.
  Object.assign(prisma.hermesResearchRun, {
    findFirst: async ({ where, include }: { where: { actorId: string; researchObjectId: string; profile: string;
      generationSettings?: { path: string[]; equals: string }; steps: { some: { ingestionTaskId: string } } }; include?: Prisma.HermesResearchRunInclude }) => {
      const row = db.hermesResearchRuns.find(run => run.actorId === where.actorId && run.researchObjectId === where.researchObjectId && run.profile === where.profile
        && (!where.generationSettings || run.generationSettings.output === where.generationSettings.equals)
        && db.hermesResearchSteps.some(item => item.runId === run.id && item.stage === 'source_ingestion' && item.ingestionTaskId === where.steps.some.ingestionTaskId));
      return row ? prisma.hermesResearchRun.findUnique({ where: { id: row.id }, include }) : null;
    },
    findUniqueOrThrow: async (args: Parameters<typeof prisma.hermesResearchRun.findUnique>[0]) => {
      const row = await prisma.hermesResearchRun.findUnique(args);
      if (!row) throw new Error('Run missing');
      return row;
    },
  });
  Object.assign(prisma.agentTask, { count: async ({ where }: { where: { kind: string; payload: { path: string[]; equals: string } } }) =>
    db.agentTasks.filter(task => task.kind === where.kind && task.payload?.hermesRunAuthority?.runId === where.payload.equals).length });
  Object.assign(prisma.auditLog, { findMany: async ({ where }: { where: { action?: string; actorId?: string; targetId?: string; targetType?: string } }) =>
    db.auditLogs.filter(row => Object.entries(where).filter(([key]) => ['action', 'actorId', 'targetId', 'targetType'].includes(key))
      .every(([key, value]) => row[key] === value)) });
  const errors: unknown[] = [];
  const transaction = prisma.$transaction.bind(prisma) as (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
  Object.assign(prisma, { $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    try { return await transaction(callback); } catch (error) { errors.push(error); throw error; }
  } });
  const deps: HermesResearchRunDeps = { prisma, nativeSceneImageEnabled: true,
    videoEnabled: true, readVideoReadiness: vi.fn(async () => true),
    nativeAgentRuntime: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' },
    redis: { lpush: vi.fn(async () => 1) } as unknown as HermesResearchRunDeps['redis'], now: () => time };
  return { prisma, db, deps, sourceMapRef, step, errors,
    run: () => db.hermesResearchRuns[0]!,
    generated: () => db.agentTasks.filter(task => task.kind === 'presentation.generate'),
    debits: () => db.usageLedger.filter(row => row.kind === 'consume') };
}
afterEach(() => vi.restoreAllMocks());

type Fixture = ReturnType<typeof fixture>;
function document(sceneCount = 3) {
  const illustration: IllustrationBrief = { schemaVersion: 2, message: 'The source transfers energy to the receiver.', domain: 'real-space',
    encoding: 'The supported transfer runs left to right.', subjects: [{ description: 'A source left of a receiver',
      basis: { claimId: ids.claim, evidenceId: ids.evidence, quote: 'The source transfers energy to the receiver.' } }],
    composition: 'Both objects remain visible.', treatment: 'Scientific linework.', labels: ['Source', 'Receiver'], constraints: ['No invented apparatus.'] };
  return { schemaVersion: 1, title: 'Energy transfer', narrative: { mainMessage: 'Explain the supported transfer.', audience: 'Researchers' },
    videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep the same source and receiver.', audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
    scenes: Array.from({ length: sceneCount }, () => ({ title: 'Transfer', narration: 'The source transfers energy to the receiver.',
      visualAction: describeIllustrationBrief(illustration), illustration: structuredClone(illustration), durationSeconds: 10, sourceClaimIds: [ids.claim],
      videoDirection: { shotType: 'mechanism', purpose: 'Explain the transfer.', subjectLock: 'Source stays left of receiver.', generatedElements: 'One transfer trace.',
        motion: 'Trace advances left to right.', camera: 'Fixed view.', reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration',
        subtitleMode: 'sidecar', negativeConstraints: ['No invented apparatus.'], modelPolicy: 'commercial-primary' } })) };
}

async function finishStoryboard(f: Fixture, sceneCount = 3, base?: { doc: ReturnType<typeof parseStoryboardDocument> }) {
  const task = f.generated().filter(item => item.payload.kind === 'interactive_html').at(-1)!;
  const candidate = base ? structuredClone(base.doc) : document(sceneCount);
  if (base) candidate.scenes[1]!.durationSeconds = 15;
  const doc = parseStoryboardDocument(candidate, [ids.claim], 'video', { nativeNarrativeVideo: true });
  const source = await readVisualNarrativeSource(f.prisma, { userId: ids.actor, workspaceId: ids.workspace,
    researchObjectId: ids.ro, versionId: ids.version, sourceClaimIds: [ids.claim] });
  const sourceEvidenceIdentity = presentationEvidenceIdentity(f.db.evidenceRecords);
  const currentBase = await requireStoryboardBase(f.prisma, parsePresentationGenerationPayload(task.payload));
  const context = { payload: structuredClone(task.payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(f.db.claimNodes),
    baseIdentity: currentBase?.identity ?? null, narrativeSourceIdentity: source.identity };
  const cp: NativeAgentCheckpointReference = { taskId: task.id, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
    size: 100, artifactId: ids.artifact, documentSha256: f.sourceMapRef.contentHash, sourceMapHash: f.sourceMapRef.serializedSha256,
    executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
    responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  const review = { stage: 'final-brief', decision: 'accepted', requestId: task.id, candidateHash: hash(doc), sourceEvidenceIdentity,
    summary: 'Supported by the saved paper.', ...cp.target, responseHash: cp.responseHash };
  const planned = { document: structuredClone(doc), promptHash: review.promptHash, reviewFormat: 2, designSkills: [{ id: 'scientific', version: '20' }] };
  Object.assign(task, { status: 'succeeded', executionAttempt: 1, error: null,
    result: { ...task.result, sourceMapRef: structuredClone(f.sourceMapRef), assetId: task.id, contentHash: hash(doc),
      nativeIllustrationContext: context, storyboardCheckpoint: { ...structuredClone(context), executionAttempt: 1, planned }, storyboardReview: structuredClone(review),
      nativeIllustration: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', planToolCallId: 'actual-art', reviewToolCallId: 'actual-review' },
      illustrationPrompts: doc.scenes.map((_, sceneIndex) => ({ sceneIndex, prompt: `Verified frame ${sceneIndex}`, videoPrompt: `Verified motion ${sceneIndex}` })) } });
  task.result.nativeAgentExecution.checkpoint = cp;
  const asset = { id: task.id, researchObjectId: ids.ro, versionId: ids.version, kind: 'interactive_html', status: 'draft', deletedAt: null as Date | null,
    contentHash: task.result.contentHash, createdAt: time, updatedAt: time,
    provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: task.id, sourceEvidenceIdentity,
      storyboardSettings: structuredClone(task.payload.storyboard), storyboardDocument: structuredClone(doc), illustrationReview: structuredClone(review), designSkills: structuredClone(planned.designSkills) } };
  f.db.presentationAssets.push(asset);
  f.db.presentationAssetClaims.push({ presentationAssetId: asset.id, claimId: ids.claim });
  return { task, asset, doc, cp, review, sourceEvidenceIdentity };
}

function finishFrames(f: Fixture, parent: Awaited<ReturnType<typeof finishStoryboard>>) {
  const parentIdentity = JSON.stringify({ contentHash: parent.asset.contentHash, provenance: parent.asset.provenance, ids: [ids.claim] });
  return f.generated().filter(task => task.payload.kind === 'image' && task.payload.sceneImage.storyboardAssetId === parent.asset.id).map(task => {
    const sceneIndex = task.payload.sceneImage.sceneIndex;
    const contentHash = String(sceneIndex + 2).repeat(64);
    const imageReview = { stage: 'generated-image', requestId: task.id, decision: 'accepted', summary: 'Saved pixels preserve the source.', repairInstruction: null,
      contentHash, sourceEvidenceIdentity: parent.sourceEvidenceIdentity, parentIdentity, promptHash: '4'.repeat(64), responseHash: '5'.repeat(64),
      provider: 'minimax-key-1-model-1', model: 'MiniMax-M3' };
    Object.assign(task, { status: 'succeeded', executionAttempt: 1, result: { assetId: task.id, contentHash, imageReview: structuredClone(imageReview),
      nativeImageReview: { mode: 'model-native', state: 'completed', executionAttempt: 1, requestId: task.id, contentHash,
        sourceEvidenceIdentity: parent.sourceEvidenceIdentity, parentIdentity, promptHash: '4'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', review: structuredClone(imageReview) } } });
    const asset = { id: task.id, researchObjectId: ids.ro, versionId: ids.version, kind: 'image', status: 'draft', deletedAt: null as Date | null,
      contentHash, createdAt: time, updatedAt: time,
      provenance: { source: 'approved_storyboard_scene', taskId: task.id, subtype: 'storyboard_scene_image',
        sceneImage: structuredClone(task.payload.sceneImage), sourceEvidenceIdentity: parent.sourceEvidenceIdentity, parentIdentity, imageReview } };
    f.db.presentationAssets.push(asset);
    f.db.presentationAssetClaims.push({ presentationAssetId: task.id, claimId: ids.claim });
    return { task, asset };
  });
}

async function storyboardReady(sourceCosts = 2) {
  const f = fixture();
  if (sourceCosts === 1) f.db.hermesResearchSteps.splice(f.db.hermesResearchSteps.findIndex(step => step.stage === 'source_composition'), 1);
  await reconcileHermesResearchRuns(f.deps);
  const parent = await finishStoryboard(f);
  await reconcileHermesResearchRuns(f.deps);
  expect(f.errors.map(String)).toEqual([]);
  expect(f.run().status).toBe('awaiting_storyboard_review');
  return { f, parent };
}

async function framesReady(sourceCosts = 2) {
  const { f, parent } = await storyboardReady(sourceCosts);
  await reconcileHermesResearchRuns(f.deps);
  expect(f.run().status).toBe('generating_scene_images');
  const frames = finishFrames(f, parent);
  expect(frames).toHaveLength(3);
  await reconcileHermesResearchRuns(f.deps);
  expect(f.run().status).toBe('awaiting_scene_images_review');
  return { f, parent, frames };
}

async function timingReady(sourceCosts = 2) {
  const { f, parent, frames } = await framesReady(sourceCosts);
  await reconcileHermesResearchRuns(f.deps);
  const video = f.generated().find(task => task.payload.kind === 'video')!;
  const parents = (await requireVideoGenerationParents(f.prisma, parsePresentationGenerationPayload(video.payload)))!;
  video.status = 'failed'; video.executionAttempt = 1; video.error = 'AUDIO_TIMING_REVISION_REQUIRED: narration exceeds its planned shot';
  const timing = { schemaVersion: 1, taskId: video.id, executionAttempt: 1, storyboardAssetId: parent.asset.id,
    parentIdentity: parents.identity,
    sourceEvidenceIdentity: parent.sourceEvidenceIdentity, inputHash: '8'.repeat(64), voice: 'zh-CN-XiaoxiaoNeural', speed: 1, noVideoSubmissions: true,
    scenes: parent.doc.scenes.map((scene, sceneIndex) => ({ sceneIndex, narration: scene.narration, plannedDurationSeconds: scene.durationSeconds,
      durationSeconds: sceneIndex === 1 ? 12 : 8, taskId: `saved-audio-${sceneIndex}`, contentHash: '7'.repeat(64), size: 1000 })) };
  video.result = { videoAudioTiming: timing };
  return { f, parent, frames, video, timing };
}

describe('explicit native video research run', () => {
  it('rejects a new explicit video intent while closed without writing a run or debit', async () => {
    const f = fixture();
    f.db.hermesResearchRuns.length = 0;
    f.db.hermesResearchSteps.length = 0;
    f.deps.readVideoReadiness = async () => false;
    await expect(createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro,
      ingestionTaskIds: [ids.ingestion], idempotencyKey: 'closed-new-video', generation: { ...grant, output: 'video' } }))
      .rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(f.db.hermesResearchRuns).toHaveLength(0);
    expect(f.db.hermesResearchSteps).toHaveLength(0);
    expect(f.generated()).toHaveLength(0);
    expect(f.debits()).toHaveLength(0);
  });

  it('returns the same video intent under its old key while closed and still rejects digest changes', async () => {
    const f = fixture();
    f.db.hermesResearchRuns.length = 0;
    f.db.hermesResearchSteps.length = 0;
    const input = { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion],
      idempotencyKey: 'paid-replay', generation: { ...grant, output: 'video' as const } };
    const first = await createHermesResearchRun(f.deps, input);
    f.deps.readVideoReadiness = vi.fn(async () => false);
    expect(await createHermesResearchRun(f.deps, input)).toEqual(first);
    await expect(createHermesResearchRun(f.deps, { ...input, generation: { ...input.generation, instruction: 'Different goal' } }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.debits()).toHaveLength(0);
  });

  it.each(['storyboard', 'frames', 'video', 'timing-revision'] as const)(
    'does not create another paid %s task after video readiness closes', async stage => {
    const f = stage === 'frames' ? (await storyboardReady()).f
      : stage === 'video' ? (await framesReady()).f
        : stage === 'timing-revision' ? (await timingReady(1)).f : fixture();
    const before = { tasks: f.generated().length, debits: f.debits().length, status: f.run().status,
      assets: structuredClone(f.db.presentationAssets), steps: structuredClone(f.db.hermesResearchSteps) };
    Object.assign(f.deps, { videoEnabled: true, readVideoReadiness: vi.fn(async () => false) });
    await reconcileHermesResearchRuns(f.deps);
    expect(f.debits()).toHaveLength(before.debits);
    expect(f.generated()).toHaveLength(before.tasks);
    expect(f.run().status).toBe(before.status);
    expect(f.db.presentationAssets).toEqual(before.assets);
    expect(f.db.hermesResearchSteps).toEqual(before.steps);
    expect(f.run().error).toBe('Video generation is temporarily unavailable.');
    expect(f.run().lastReconciledAt).toEqual(new Date(time.getTime() + 55_000));
  });

  it('backs off the closed run for a minute, then resumes the same run once without duplicate tasks', async () => {
    const f = fixture();
    let elapsed = 0;
    f.deps.now = () => new Date(time.getTime() + elapsed);
    const reader = vi.fn(async () => false);
    f.deps.readVideoReadiness = reader;
    const findMany = f.prisma.hermesResearchRun.findMany.bind(f.prisma.hermesResearchRun);
    vi.spyOn(f.prisma.hermesResearchRun, 'findMany').mockImplementation(async args => {
      const rows = await findMany(args);
      const cutoff = new Date(f.deps.now!().getTime() - 5_000);
      return rows.filter(row => !row.lastReconciledAt || row.lastReconciledAt <= cutoff);
    });
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run()).toMatchObject({ id: ids.run, status: 'awaiting_claim_review', version: 1 });
    reader.mockResolvedValue(true);
    elapsed = 59_999;
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ inspected: 0 });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(f.debits()).toHaveLength(0);
    elapsed = 60_000;
    await reconcileHermesResearchRuns(f.deps);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run()).toMatchObject({ id: ids.run, status: 'generating_storyboard', maxAgentTasks: 9, error: null });
    expect(f.generated()).toHaveLength(1);
    expect(f.debits()).toHaveLength(1);
  });

  it('rolls back a frame batch when readiness closes between two new charges', async () => {
    const { f } = await storyboardReady();
    f.deps.readVideoReadiness = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('awaiting_storyboard_review');
    expect(f.generated()).toHaveLength(1);
    expect(f.debits()).toHaveLength(1);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'scene_image')).toHaveLength(0);
  });

  it('allows a completed storyboard result to settle while closed and projects a read-only hold', async () => {
    const f = fixture();
    await reconcileHermesResearchRuns(f.deps);
    const parent = await finishStoryboard(f);
    f.deps.readVideoReadiness = async () => false;
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('awaiting_storyboard_review');
    expect(f.debits()).toHaveLength(1);
    const before = structuredClone(f.db);
    const view = await getHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, runId: ids.run });
    expect(view.generationHold).toBe('video-api-pending');
    expect(view.steps.find(step => step.stage === 'storyboard')?.presentationAssetId).toBe(parent.asset.id);
    expect(f.db).toEqual(before);
  });

  it('classifies the actual owned storyboard, frames and final video with their persisted native parents', async () => {
    const { f, parent, frames } = await framesReady();
    expect(await isHermesVideoTask(f.prisma, parent.task.id)).toBe(true);
    for (const frame of frames) expect(await isHermesVideoTask(f.prisma, frame.task.id)).toBe(true);
    expect(await isHermesVideoTask(f.prisma, ids.sourceTask)).toBe(false);
    await reconcileHermesResearchRuns(f.deps);
    const video = f.generated().find(task => task.payload.kind === 'video')!;
    expect(await isHermesVideoTask(f.prisma, video.id)).toBe(true);
    video.payload.hermesRunAuthority.ordinal += 1;
    expect(await isHermesVideoTask(f.prisma, video.id)).toBe(false);
  });

  it('keeps a bound video run frame classified when its child parent has become invalid', async () => {
    const { f, frames } = await framesReady();
    frames[0]!.task.payload.sceneImage.storyboardAssetId = uuid(99);
    expect(await isHermesVideoTask(f.prisma, frames[0]!.task.id)).toBe(true);
  });

  it('gates a new direct final video with real qualified native parents before any debit', async () => {
    const { f, parent, frames } = await framesReady();
    f.db.users[0].platformRole = 'platform_admin';
    f.db.commits.push({ id: 'direct-native-commit', branchId: 'direct-native-branch' });
    f.db.versions[0].commitId = 'direct-native-commit';
    f.deps.readVideoReadiness = async () => false;
    await expect(submitPresentationGeneration(f.deps, { userId: ids.actor, researchObjectId: ids.ro, versionId: ids.version,
      kind: 'video', sourceClaimIds: [ids.claim], video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parent.asset.id,
        sceneImageAssetIds: frames.map(frame => frame.asset.id) as [string, string, string] }, idempotencyKey: 'closed-direct-video' }))
      .rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(f.generated()).toHaveLength(4);
    expect(f.debits()).toHaveLength(4);
  });

  it('preserves a paid direct final video replay while closed and classifies direct frame parents', async () => {
    const { f, parent, frames } = await framesReady();
    f.db.users[0].platformRole = 'platform_admin';
    f.db.commits.push({ id: 'direct-replay-commit', branchId: 'direct-replay-branch' });
    f.db.versions[0].commitId = 'direct-replay-commit';
    const input = { userId: ids.actor, researchObjectId: ids.ro, versionId: ids.version, kind: 'video' as const,
      sourceClaimIds: [ids.claim], video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parent.asset.id,
        sceneImageAssetIds: frames.map(frame => frame.asset.id) as [string, string, string] }, idempotencyKey: 'direct-final-replay' };
    const task = await submitPresentationGeneration(f.deps, input);
    const directFrame = await submitPresentationGeneration(f.deps, { userId: ids.actor, researchObjectId: ids.ro, versionId: ids.version,
      kind: 'image', sourceClaimIds: [ids.claim], sceneImage: { storyboardAssetId: parent.asset.id, sceneIndex: 0 }, idempotencyKey: 'direct-frame' });
    expect(await isHermesVideoTask(f.prisma, task.id)).toBe(true);
    expect(await isHermesVideoTask(f.prisma, directFrame.id)).toBe(true);
    const before = { tasks: f.generated().length, debits: f.debits().length };
    f.deps.readVideoReadiness = vi.fn(async () => false);
    expect((await submitPresentationGeneration(f.deps, input)).id).toBe(task.id);
    expect(f.generated()).toHaveLength(before.tasks);
    expect(f.debits()).toHaveLength(before.debits);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
    parent.asset.versionId = uuid(99);
    expect(await isHermesVideoTask(f.prisma, directFrame.id)).toBe(false);
  });
  it('persists the explicit video intent without creating another source analysis', async () => {
    const f = fixture(); f.db.hermesResearchRuns.length = 0; f.db.hermesResearchSteps.length = 0;
    const run = await createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro,
      ingestionTaskIds: [ids.ingestion], idempotencyKey: 'new-video', generation: { ...grant, output: 'video' } as HermesNarrativeGrant });
    expect(run.generationSettings).toEqual({ ...settings, output: 'video' });
    expect(run).toMatchObject({ profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9 });
    expect(f.db.agentTasks.map(task => task.id)).toEqual([ids.sourceTask]);
    expect(f.debits()).toHaveLength(0);
  });
  it('reserves the video task alongside source/composition costs and the existing correction slot', async () => {
    const f = fixture();
    await reconcileHermesResearchRuns(f.deps);
    expect(f.generated()).toHaveLength(1);
    expect(f.generated()[0]!.payload.storyboard).toEqual({ ...settings, output: 'video', narrative: true, narrativeSceneLimit: 4 });
    expect(f.generated()[0]!.payload.hermesRunAuthority.profile).toBe(VISUAL_NARRATIVE_PROFILE);
    expect(f.run()).toMatchObject({ status: 'generating_storyboard', maxAgentTasks: 9 });
    expect(f.debits()).toHaveLength(1);
  });
  it('preserves the absent-output settings bytes and old idempotency digest', async () => {
    const f = fixture(null); f.db.hermesResearchRuns.length = 0; f.db.hermesResearchSteps.length = 0;
    const input = { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion], idempotencyKey: 'old-image', generation: grant };
    const run = await createHermesResearchRun(f.deps, input);
    expect(JSON.stringify(run.generationSettings)).toBe('{"locale":"zh","style":"scientific","instruction":"Explain the supported transfer."}');
    expect(f.run().requestDigest).toBe(hash({ actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion], generation: grant }));
    await expect(createHermesResearchRun(f.deps, input)).resolves.toEqual(run);
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.debits()).toHaveLength(0);
  });
  it('keeps absent output on the image default path without reserving a video', async () => {
    const f = fixture(null);
    f.deps.readVideoReadiness = vi.fn(async () => false);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.generated()[0]!.payload.storyboard).toEqual({ ...settings, output: 'image', narrative: true, narrativeSceneLimit: 5 });
    expect(f.generated().some(task => task.payload.kind === 'video')).toBe(false);
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it.each([null, ['video'], 'image', 'audio', 1])('rejects malformed explicit output %j without new tasks or charges', async output => {
    const f = fixture(); f.db.hermesResearchRuns.length = 0; f.db.hermesResearchSteps.length = 0;
    await expect(createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion],
      idempotencyKey: 'bad-output', generation: { ...grant, output } as unknown as HermesNarrativeGrant })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.db.hermesResearchRuns).toHaveLength(0);
    expect(f.generated()).toHaveLength(0);
    expect(f.debits()).toHaveLength(0);
  });
  it('allows a requested video run to reuse a reviewed image chain without upgrading it or creating source AI tasks', async () => {
    const f = fixture(null);
    for (const step of f.db.hermesResearchSteps) Object.assign(step, { ingestionTaskId: ids.ingestion, artifactId: ids.artifact, agentTaskId: ids.sourceTask });
    const before = structuredClone(f.run());
    const input = { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion], idempotencyKey: 'different-video-intent',
      generation: { ...grant, output: 'video' as const } };
    const run = await createHermesResearchRun(f.deps, input);
    expect(run).toMatchObject({ status: 'awaiting_claim_review', versionId: ids.version, sourceClaimIds: [ids.claim],
      generationSettings: { ...settings, output: 'video' } });
    expect(f.db.hermesResearchRuns.find(row => row.id === run.id)!.sourceReviewDigest).toBe(before.sourceReviewDigest);
    expect(f.db.hermesResearchRuns).toHaveLength(2);
    expect(f.run()).toEqual(before);
    expect(f.run().generationSettings).not.toHaveProperty('output');
    expect(f.db.agentTasks.map(task => task.id)).toEqual([ids.sourceTask]);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review' && step.agentTaskId === ids.sourceTask)).toHaveLength(1);
    expect(f.debits()).toHaveLength(0);
    await expect(createHermesResearchRun(f.deps, { ...input, idempotencyKey: 'second-video-key' })).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
    expect(f.db.hermesResearchRuns).toHaveLength(2);
  });
  it.each(['failed', 'running', 'stopped', 'succeeded'])('refuses a second video key even when the existing video run is %s', async status => {
    const f = fixture(); f.run().status = status;
    await expect(createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion],
      idempotencyKey: 'duplicate-video-key', generation: { ...grant, output: 'video' } })).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.db.agentTasks.map(task => task.id)).toEqual([ids.sourceTask]);
    expect(f.debits()).toHaveLength(0);
  });
  it.each(['completed', 'started'] as const)('reuses only a %s native paper reviewer without creating or reinitializing source AI', async state => {
    const f = fixture(null);
    f.db.hermesResearchSteps.splice(f.db.hermesResearchSteps.findIndex(step => step.stage === 'source_composition'), 1);
    for (const step of f.db.hermesResearchSteps) Object.assign(step, { ingestionTaskId: ids.ingestion, artifactId: ids.artifact, agentTaskId: ids.sourceTask });
    const runtime = f.deps.nativeAgentRuntime!;
    const marker = (taskId: string, profile: 'paper-author' | 'paper-source-review') => {
      const value = initialNativeAgentExecution(runtime, profile)!;
      const cp: NativeAgentCheckpointReference = { taskId, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
        size: 100, artifactId: ids.artifact, documentSha256: f.sourceMapRef.contentHash, sourceMapHash: f.sourceMapRef.serializedSha256,
        executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
        responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
      value.nativeAgentExecution.checkpoint = cp;
      return { ...value, scientificReview: { kind: 'hermes_agent_review', profile, status: 'review_received', contractVersion: 5,
        runtimeId: runtime.runtimeId, skillCatalogueId: runtime.skillCatalogueId, ...cp.target, responseHash: cp.responseHash } };
    };
    const canonical = f.db.agentTasks[0]!;
    const original = structuredClone(canonical.result);
    const authorId = uuid(80);
    f.db.agentTasks.push({ ...canonical, id: authorId, executionAttempt: 1, payload: { artifactId: ids.artifact, researchObjectId: ids.ro },
      result: { ...structuredClone(original), ...marker(authorId, 'paper-author') } });
    canonical.result = { ...original, ...marker(canonical.id, 'paper-source-review') };
    canonical.result.scientificReview.sourceAgentTaskId = authorId;
    canonical.result.nativeAgentExecution.checkpoint.state = state;
    const before = structuredClone(f.db.agentTasks);
    const create = createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion],
      idempotencyKey: 'reviewed-native-video', generation: { ...grant, output: 'video' } });
    if (state === 'completed') {
      await expect(create).resolves.toMatchObject({ status: 'awaiting_claim_review', versionId: ids.version, sourceClaimIds: [ids.claim] });
      expect(f.db.hermesResearchRuns).toHaveLength(2);
      expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review' && step.agentTaskId === ids.sourceTask)).toHaveLength(1);
    } else {
      await expect(create).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
      expect(f.db.hermesResearchRuns).toHaveLength(1);
    }
    expect(f.db.agentTasks).toEqual(before);
    expect(f.debits()).toHaveLength(0);
  });
  it.each(['failed', 'running', 'awaiting_source_review'])('does not create a video from an ambiguous/held image source state %s', async status => {
    const f = fixture(null); f.run().status = status;
    for (const step of f.db.hermesResearchSteps) Object.assign(step, { ingestionTaskId: ids.ingestion, artifactId: ids.artifact, agentTaskId: ids.sourceTask });
    await expect(createHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion],
      idempotencyKey: 'ambiguous-video-source', generation: { ...grant, output: 'video' } })).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.debits()).toHaveLength(0);
  });
  it('rejects an output change under the same idempotency key', async () => {
    const f = fixture(); f.db.hermesResearchRuns.length = 0; f.db.hermesResearchSteps.length = 0;
    const input = { actorId: ids.actor, researchObjectId: ids.ro, ingestionTaskIds: [ids.ingestion], idempotencyKey: 'bound-intent', generation: grant };
    await createHermesResearchRun(f.deps, input);
    await expect(createHermesResearchRun(f.deps, { ...input, generation: { ...grant, output: 'video' } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.debits()).toHaveLength(0);
  });
  it.each([11, 13])('does not treat correction grant %s as a video budget', async maxAgentTasks => {
    const f = fixture(); f.run().maxAgentTasks = maxAgentTasks;
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('failed');
    expect(f.generated()).toHaveLength(0);
    expect(f.debits()).toHaveLength(0);
    await expect(authorizeHermesGenerationGrant(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, runId: ids.run,
      expectedVersion: f.run().version, idempotencyKey: 'not-a-video-extension',
      generationGrant: { profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: maxAgentTasks as 11 | 13 } })).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
  });
  it('counts prior presentation attempts and fails before planning when three scenes cannot fit', async () => {
    const f = fixture();
    for (let ordinal = 0; ordinal < 3; ordinal++) f.db.agentTasks.push({ id: uuid(30 + ordinal), kind: 'presentation.generate', status: 'failed',
      payload: { hermesRunAuthority: { runId: ids.run, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } } });
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run()).toMatchObject({ status: 'failed', maxAgentTasks: 9 });
    expect(f.run().error).toMatch(/grant.*three video scenes/u);
    expect(f.generated()).toHaveLength(3);
    expect(f.debits()).toHaveLength(0);
  });
  it('rejects a technically reviewed plan that exceeds the authorized scene limit before making frames', async () => {
    const f = fixture();
    await reconcileHermesResearchRuns(f.deps);
    await finishStoryboard(f, 5);
    await reconcileHermesResearchRuns(f.deps);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('failed');
    expect(f.generated()).toHaveLength(1);
    expect(f.debits()).toHaveLength(1);
  });
  it('automatically consumes technically qualified private native parents and stops at final video review', async () => {
    const { f, parent, frames } = await framesReady();
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run()).toMatchObject({ profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, status: 'generating_video' });
    const videoTasks = f.generated().filter(task => task.payload.kind === 'video');
    expect(videoTasks).toHaveLength(1);
    const video = videoTasks[0]!;
    expect(video.payload.video).toEqual({ profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parent.asset.id, sceneImageAssetIds: frames.map(frame => frame.asset.id) });
    expect(video.payload.hermesRunAuthority).toEqual({ runId: ids.run, stage: 'video', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE });
    expect(f.db.presentationAssets.every(asset => asset.status === 'draft')).toBe(true);
    expect(f.debits()).toHaveLength(5);
    await requireHermesPresentationTaskAuthority(f.prisma as never, { actorId: ids.actor, taskId: video.id,
      payload: parsePresentationGenerationPayload(video.payload), authority: video.payload.hermesRunAuthority });
    f.deps.readVideoReadiness = vi.fn(async () => false);
    video.status = 'succeeded';
    f.db.presentationAssets.push({ id: video.id, researchObjectId: ids.ro, versionId: ids.version, kind: 'video', status: 'draft',
      deletedAt: null, contentHash: '9'.repeat(64), provenance: {}, createdAt: time, updatedAt: time });
    f.db.presentationAssetClaims.push({ presentationAssetId: video.id, claimId: ids.claim });
    await reconcileHermesResearchRuns(f.deps);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('awaiting_video_review');
    expect(f.debits()).toHaveLength(5);
    expect(f.db.presentationAssets.every(asset => asset.status === 'draft')).toBe(true);
    expect(f.db.agentTasks.filter(task => task.kind === 'sdf.extract').map(task => task.id)).toEqual([ids.sourceTask]);
    expect((await getHermesResearchRun(f.deps, { actorId: ids.actor, researchObjectId: ids.ro, runId: ids.run })).generationHold).toBeUndefined();
    expect(f.deps.readVideoReadiness).not.toHaveBeenCalled();
  });
  it('does not create or debit a duplicate video when reconcilers overlap', async () => {
    const { f } = await framesReady();
    await Promise.all([reconcileHermesResearchRuns(f.deps), reconcileHermesResearchRuns(f.deps)]);
    expect(f.generated().filter(task => task.payload.kind === 'video')).toHaveLength(1);
    expect(f.debits()).toHaveLength(5);
  });
  it.each(['started-checkpoint', 'missing-review', 'missing-owner', 'source-changed', 'run-authority'])('does not advance invalid native storyboard proof: %s', async change => {
    const { f, parent } = await storyboardReady();
    if (change === 'started-checkpoint') parent.cp.state = 'started';
    if (change === 'missing-review') delete parent.task.result.storyboardReview;
    if (change === 'missing-owner') parent.task.status = 'failed';
    if (change === 'source-changed') f.db.evidenceRecords[0]!.exactQuote += ' Changed';
    if (change === 'run-authority') parent.task.payload.hermesRunAuthority.runId = uuid(99);
    await reconcileHermesResearchRuns(f.deps);
    expect(['failed', 'stopped']).toContain(f.run().status);
    expect(f.generated().filter(task => task.payload.kind === 'image')).toHaveLength(0);
    expect(f.debits()).toHaveLength(1);
    expect(parent.asset.status).toBe('draft');
  });
  it.each(['missing-owner', 'failed-owner', 'missing-native-review', 'started-review', 'wrong-pixels', 'import', 'cross-parent'])('does not advance invalid real frame proof: %s', async change => {
    const { f, frames } = await framesReady();
    const frame = frames[0]!;
    if (change === 'missing-owner') f.db.agentTasks.splice(f.db.agentTasks.findIndex(task => task.id === frame.task.id), 1);
    if (change === 'failed-owner') frame.task.status = 'failed';
    if (change === 'missing-native-review') delete frame.task.result.nativeImageReview;
    if (change === 'started-review') frame.task.result.nativeImageReview.state = 'started';
    if (change === 'wrong-pixels') frame.asset.contentHash = '0'.repeat(64);
    if (change === 'import') frame.asset.provenance.source = 'admin_reviewed_import';
    if (change === 'cross-parent') frame.asset.provenance.sceneImage.storyboardAssetId = uuid(99);
    await reconcileHermesResearchRuns(f.deps);
    expect(['failed', 'stopped']).toContain(f.run().status);
    expect(f.generated().filter(task => task.payload.kind === 'video')).toHaveLength(0);
    expect(f.debits()).toHaveLength(4);
    expect(f.db.presentationAssets.every(asset => asset.status === 'draft')).toBe(true);
  });
  it('leaves legacy draft storyboard consumption awaiting approval', async () => {
    const { f, parent } = await storyboardReady();
    f.run().profile = CONTENT_DRIVEN_PROFILE;
    f.run().maxAgentTasks = 8;
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('awaiting_storyboard_review');
    expect(f.generated().filter(task => task.payload.kind === 'image')).toHaveLength(0);
    expect(parent.asset.status).toBe('draft');
  });
  it('does not let an image-only authority execute a video task', async () => {
    const f = fixture(null);
    f.run().status = 'generating_video';
    f.db.hermesResearchSteps.push(f.step('video', { status: 'running', agentTaskId: uuid(90) }));
    const payload = parsePresentationGenerationPayload({ schemaVersion: 1, kind: 'video', researchObjectId: ids.ro, versionId: ids.version,
      sourceClaimIds: [ids.claim], video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: uuid(91), sceneImageAssetIds: [uuid(92), uuid(93), uuid(94)] },
      hermesRunAuthority: { runId: ids.run, stage: 'video', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
    await expect(requireHermesPresentationTaskAuthority(f.prisma as never, { actorId: ids.actor, taskId: uuid(90),
      payload, authority: payload.hermesRunAuthority! })).rejects.toThrow(/authority/u);
    expect(f.debits()).toHaveLength(0);
  });
  it('privately stops insufficient timing revision budget and preserves the old failed task, step and audio diagnosis', async () => {
    const { f, video } = await timingReady();
    const before = structuredClone(video);
    const step = f.db.hermesResearchSteps.find(item => item.stage === 'video')!;
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run()).toMatchObject({ status: 'stopped', maxAgentTasks: 9 });
    expect(f.run().error).toMatch(/timing.*budget/iu);
    expect(f.db.hermesResearchSteps.find(item => item.id === step.id)).toMatchObject({ agentTaskId: video.id, status: 'failed' });
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(before);
    expect(f.generated()).toHaveLength(5);
    expect(f.debits()).toHaveLength(5);
  });
  it('rolls back a timing replacement and its charge when the run transition loses its CAS', async () => {
    const { f, video } = await timingReady(1);
    const oldSteps = structuredClone(f.db.hermesResearchSteps);
    const originalTask = structuredClone(video);
    vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    const result = await reconcileHermesResearchRuns(f.deps);
    expect(result.errors).toBe(1);
    expect(f.run().status).toBe('generating_video');
    expect(f.db.hermesResearchSteps).toEqual(oldSteps);
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(originalTask);
    expect(f.generated()).toHaveLength(5);
    expect(f.debits()).toHaveLength(5);
  });
  it('creates one normal base-bound timing revision, reuses verified unchanged frames and preserves old steps and paid receipts', async () => {
    const { f, parent, frames, video } = await timingReady(1);
    const before = structuredClone(video);
    const oldSteps = structuredClone(f.db.hermesResearchSteps);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('generating_storyboard');
    const revision = f.generated().filter(task => task.payload.kind === 'interactive_html').at(-1)!;
    expect(revision.payload.storyboard).toMatchObject({ output: 'video', narrative: true, baseAssetId: parent.asset.id, revisionSceneIndex: 1, narrativeSceneLimit: 3 });
    expect(revision.payload.storyboard).not.toHaveProperty('revisionTaskId');
    expect(revision.payload.storyboard.instruction).toContain('source-faithful');
    expect(revision.payload.storyboard.instruction).toContain('5/10/15');
    expect(revision.payload.hermesRunAuthority.ordinal).toBe(1);
    expect(f.debits()).toHaveLength(6);
    await requireHermesPresentationTaskAuthority(f.prisma as never, { actorId: ids.actor, taskId: revision.id,
      payload: parsePresentationGenerationPayload(revision.payload), authority: revision.payload.hermesRunAuthority });
    await expect(requireHermesPresentationTaskAuthority(f.prisma as never, { actorId: ids.actor, taskId: video.id,
      payload: parsePresentationGenerationPayload(video.payload), authority: video.payload.hermesRunAuthority })).rejects.toThrow();
    await reconcileHermesResearchRuns(f.deps);
    expect(f.generated().filter(task => task.payload.kind === 'interactive_html')).toHaveLength(2);
    const revised = await finishStoryboard(f, 3, parent);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('awaiting_storyboard_review');
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('generating_scene_images');
    const changed = f.generated().filter(task => task.payload.kind === 'image' && task.payload.sceneImage.storyboardAssetId === revised.asset.id);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.payload.sceneImage.sceneIndex).toBe(1);
    expect(changed[0]!.payload.hermesRunAuthority.ordinal).toBe(3);
    const made = finishFrames(f, revised);
    await reconcileHermesResearchRuns(f.deps);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('generating_video');
    const replacement = f.generated().filter(task => task.payload.kind === 'video').at(-1)!;
    expect(replacement.id).not.toBe(video.id);
    expect(replacement.payload.video).toEqual({ profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: revised.asset.id,
      sceneImageAssetIds: [frames[0]!.asset.id, made[0]!.asset.id, frames[2]!.asset.id] });
    expect(replacement.payload.hermesRunAuthority.ordinal).toBe(1);
    expect(f.run().maxAgentTasks).toBe(9);
    expect(f.debits()).toHaveLength(8); // one source-review slot plus eight presentation tasks
    for (const step of oldSteps) {
      const actual = f.db.hermesResearchSteps.find(item => item.id === step.id)!;
      expect(actual.agentTaskId).toBe(step.agentTaskId);
      expect(actual.presentationAssetId).toBe(step.presentationAssetId);
      expect(actual.ordinal).toBe(step.ordinal);
    }
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(before);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'storyboard')).toHaveLength(2);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'video')).toHaveLength(2);
    expect(f.db.presentationAssets.every(asset => asset.status === 'draft')).toBe(true);
  });
  it('rejects a timing receipt bound only to the storyboard instead of the full video parents', async () => {
    const { f, video, timing } = await timingReady(1);
    const parents = (await requireVideoGenerationParents(f.prisma, parsePresentationGenerationPayload(video.payload)))!;
    expect(timing.parentIdentity).toBe(parents.identity);
    expect(parents.storyboardIdentity).not.toBe(parents.identity);
    timing.parentIdentity = parents.storyboardIdentity!;
    const before = structuredClone(video);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('failed');
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(before);
    expect(f.generated()).toHaveLength(5);
    expect(f.debits()).toHaveLength(5);
  });
  it('rejects a stale full-frame parent timing receipt even when the current pixels have a valid accepted review', async () => {
    const { f, video, timing, frames } = await timingReady(1);
    const payload = parsePresentationGenerationPayload(video.payload);
    const beforeParents = (await requireVideoGenerationParents(f.prisma, payload))!;
    const frame = frames[0]!, changedHash = '6'.repeat(64);
    frame.asset.contentHash = changedHash;
    frame.asset.provenance.imageReview.contentHash = changedHash;
    frame.task.result.contentHash = changedHash;
    frame.task.result.imageReview.contentHash = changedHash;
    frame.task.result.nativeImageReview.contentHash = changedHash;
    frame.task.result.nativeImageReview.review.contentHash = changedHash;
    const currentParents = (await requireVideoGenerationParents(f.prisma, payload))!;
    expect(currentParents.storyboardIdentity).toBe(beforeParents.storyboardIdentity);
    expect(currentParents.parentSourceEvidenceIdentity).toBe(beforeParents.parentSourceEvidenceIdentity);
    expect(currentParents.identity).not.toBe(timing.parentIdentity);
    const before = structuredClone(video);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('failed');
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(before);
    expect(f.generated()).toHaveLength(5);
    expect(f.debits()).toHaveLength(5);
  });
  it.each(['unknown', 'video-submitted', 'task', 'attempt', 'parent', 'source', 'narration', 'duration', 'audio-task', 'hash', 'voice', 'speed'])(
    'never revises an uncertain or mismatched timing diagnosis: %s', async change => {
    const { f, video, timing } = await timingReady(1);
    if (change === 'unknown') video.result = null;
    if (change === 'video-submitted') timing.noVideoSubmissions = false;
    if (change === 'task') timing.taskId = uuid(99);
    if (change === 'attempt') timing.executionAttempt = 2;
    if (change === 'parent') timing.parentIdentity += 'changed';
    if (change === 'source') timing.sourceEvidenceIdentity = '0'.repeat(64);
    if (change === 'narration') timing.scenes[0]!.narration += ' New content';
    if (change === 'duration') timing.scenes[0]!.plannedDurationSeconds = 5;
    if (change === 'audio-task') timing.scenes[0]!.taskId = '';
    if (change === 'hash') timing.inputHash = '';
    if (change === 'voice') timing.voice = '';
    if (change === 'speed') timing.speed = 0;
    const before = structuredClone(video);
    await reconcileHermesResearchRuns(f.deps);
    expect(['failed', 'stopped']).toContain(f.run().status);
    expect(f.db.agentTasks.find(task => task.id === video.id)).toEqual(before);
    expect(f.generated()).toHaveLength(5);
    expect(f.debits()).toHaveLength(5);
  });
});
