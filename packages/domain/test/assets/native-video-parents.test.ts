import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { initialNativeAgentExecution, type NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { describeIllustrationBrief, type IllustrationBrief } from '../../src/assets/illustration-brief';
import { presentationClaimContent, presentationEvidenceIdentity, readVisualNarrativeSource } from '../../src/assets/illustration-source';
import { parseStoryboardDocument } from '../../src/assets/storyboard';
import { listPresentationAssets } from '../../src/assets/presentation-asset';
import { CONTENT_DRIVEN_PROFILE, ONCHIP_FIELD_SAMPLING_PROFILE, ONCHIP_SCENE_ROLES, ONCHIP_SOURCE_CONTENT_HASH, requireNativeVideoSceneImage, requireNativeVideoStoryboard, requireVideoGenerationParents } from '../../src/assets/video';

const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
const roId = uuid(1), versionId = uuid(2), claimId = uuid(3), parentId = uuid(4), artifactId = uuid(5), ingestionId = uuid(6);
const now = new Date('2026-10-08T00:00:00Z');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (value: unknown) => value as Record<string, unknown>;
const parentIdentity = (asset: { contentHash: string; provenance: unknown }) => JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids: [claimId] });
type RenderResources = Array<{ id: string; version?: string; upstreamCommit?: string; resources: string[] }>;

function document() {
  const illustration: IllustrationBrief = { schemaVersion: 2, message: 'The source transfers energy to the receiver.', domain: 'real-space',
    encoding: 'The supported transfer runs left to right.', subjects: [{ description: 'A source left of a receiver',
      basis: { claimId, evidenceId: uuid(7), quote: 'The source transfers energy to the receiver.' } }],
    composition: 'Both objects remain visible.', treatment: 'Scientific linework.', labels: ['Source', 'Receiver'], constraints: ['No invented apparatus.'] };
  return { schemaVersion: 1, title: 'Energy transfer', narrative: { mainMessage: 'Explain the supported transfer.', audience: 'Researchers' },
    videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep the same source and receiver.', audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
    scenes: Array.from({ length: 3 }, () => ({ title: 'Transfer', narration: 'The source transfers energy to the receiver.',
      visualAction: describeIllustrationBrief(illustration), illustration: structuredClone(illustration), durationSeconds: 10, sourceClaimIds: [claimId],
      videoDirection: { shotType: 'mechanism', purpose: 'Explain the transfer.', subjectLock: 'Source stays left of receiver.', generatedElements: 'One transfer trace.',
        motion: 'Trace advances left to right.', camera: 'Fixed view.', reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration',
        subtitleMode: 'sidecar', negativeConstraints: ['No invented apparatus.'], modelPolicy: 'commercial-primary' } })) };
}

async function fixture() {
  const claims = [{ id: claimId, researchObjectId: roId, versionId, parentClaimId: null, kind: 'finding', statement: 'The source transfers energy to the receiver.',
    assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded', updatedAt: now,
    provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
  const evidence = [{ id: uuid(7), claimId, researchObjectId: roId, versionId, artifactId, contentHash: 'a'.repeat(64), exactQuote: claims[0]!.statement,
    relation: 'supports', locator: { page: 1 }, extractionStatus: 'succeeded', updatedAt: now, provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId, contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  const session = { id: uuid(8), userId: uuid(9), researchObjectId: roId, deletedAt: null as Date | null, status: 'active' };
  const ro = { id: roId, workspaceId: uuid(10), deletedAt: null as Date | null };
  const version = { id: versionId, researchObjectId: roId, manifest: { id: uuid(11), coreJson: {}, entries: [{ artifactId, blobSha256: sourceMapRef.contentHash }] } };
  const ingestion = { id: ingestionId, artifactId, state: 'confirmed', batch: { userId: session.userId, researchObjectId: roId },
    artifact: { workspaceId: ro.workspaceId, blobSha256: sourceMapRef.contentHash, deletedAt: null as Date | null, bytesPurgedAt: null },
    agentTask: { id: uuid(12), kind: 'sdf.extract', status: 'succeeded', deletedAt: null as Date | null, updatedAt: now, session,
      result: { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: 4, responseHash: 'c'.repeat(64) },
        core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' } } } };
  const payload = { schemaVersion: 1, researchObjectId: roId, versionId, kind: 'interactive_html', sourceClaimIds: [claimId],
    storyboard: { locale: 'zh', style: 'scientific', instruction: 'Explain the supported transfer.', output: 'video', narrative: true } };
  const cp: NativeAgentCheckpointReference = { taskId: parentId, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
    size: 100, artifactId, documentSha256: sourceMapRef.contentHash, sourceMapHash: sourceMapRef.serializedSha256,
    executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
    responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  const storyboardDocument = parseStoryboardDocument(document(), [claimId], 'video', { nativeNarrativeVideo: true });
  const sourceEvidenceIdentity = presentationEvidenceIdentity(evidence as never);
  const review = { stage: 'final-brief', decision: 'accepted', requestId: parentId, candidateHash: hash(storyboardDocument), sourceEvidenceIdentity,
    summary: 'Supported by the saved paper.', ...cp.target, responseHash: cp.responseHash };
  const context = { payload: structuredClone(payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(claims), baseIdentity: null, narrativeSourceIdentity: '' };
  const result = { ...initialNativeAgentExecution({ runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' }, 'paper-illustration')!,
    sourceMapRef: structuredClone(sourceMapRef), assetId: parentId, contentHash: '1'.repeat(64), nativeIllustrationContext: context,
    storyboardCheckpoint: { ...structuredClone(context), executionAttempt: 1, planned: { document: structuredClone(storyboardDocument), promptHash: review.promptHash, reviewFormat: 2,
      designSkills: [{ id: 'scientific', version: '20', resources: ['SKILL.md#Execution'] }] as RenderResources } }, storyboardReview: structuredClone(review),
    nativeIllustration: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', planToolCallId: 'actual-art', reviewToolCallId: 'actual-review' },
    illustrationPrompts: storyboardDocument.scenes.map((_, sceneIndex) => ({ sceneIndex, prompt: `Verified frame ${sceneIndex}`, videoPrompt: `Verified motion ${sceneIndex}` })) };
  result.nativeAgentExecution.checkpoint = cp;
  const parent = { id: parentId, researchObjectId: roId, versionId, kind: 'interactive_html', status: 'draft', deletedAt: null as Date | null,
    contentHash: result.contentHash, sourceClaims: [{ claimId }], provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: parentId,
      sourceEvidenceIdentity, storyboardSettings: structuredClone(payload.storyboard), storyboardDocument, illustrationReview: structuredClone(review) } };
  Object.assign(parent.provenance, { designSkills: structuredClone(result.storyboardCheckpoint.planned.designSkills) });
  const parentTask = { id: parentId, sessionId: session.id, session, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
    error: null as string | null, executionAttempt: 1, payload, result };
  const frames = Array.from({ length: 3 }, (_, sceneIndex) => {
    const id = uuid(20 + sceneIndex), contentHash = String(sceneIndex + 2).repeat(64);
    const imageReview = { stage: 'generated-image', requestId: id, decision: 'accepted', summary: 'Saved pixels preserve the source.', repairInstruction: null,
      contentHash, sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), promptHash: '4'.repeat(64), responseHash: '5'.repeat(64),
      provider: 'minimax-key-1-model-1', model: 'MiniMax-M3' };
    return { id, researchObjectId: roId, versionId, kind: 'image', status: 'draft', deletedAt: null as Date | null, contentHash, sourceClaims: [{ claimId }],
      provenance: { source: 'approved_storyboard_scene', taskId: id, subtype: 'storyboard_scene_image', sceneImage: { storyboardAssetId: parentId, sceneIndex },
        sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), imageReview } };
  });
  const frameTasks = frames.map(frame => ({ id: frame.id, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
    result: { assetId: frame.id, contentHash: frame.contentHash, imageReview: structuredClone(frame.provenance.imageReview),
      nativeImageReview: { mode: 'model-native', state: 'completed', executionAttempt: 1, requestId: frame.id, contentHash: frame.contentHash,
        sourceEvidenceIdentity, parentIdentity: frame.provenance.parentIdentity, promptHash: '4'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3',
        review: structuredClone(frame.provenance.imageReview) } } }));
  const ancestors: Array<typeof parent> = [], ancestorTasks: Array<typeof parentTask> = [];
  type Where = { id?: { in: string[] }; claimId?: { in: string[] }; researchObjectId?: string; versionId?: string; extractionStatus?: string; contentHash?: string; exactQuote?: unknown };
  const prisma = {
    presentationAsset: { findUnique: async ({ where }: { where: { id: string } }) => [parent, ...ancestors, ...frames].find(asset => asset.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => frames.filter(frame => where.id.in.includes(frame.id)) },
    agentTask: { findUnique: async ({ where }: { where: { id: string } }) => [parentTask, ...ancestorTasks, ...frameTasks].find(task => task.id === where.id) ?? null },
    agentSession: { findUnique: async () => session }, researchObject: { findUnique: async () => ro },
    claimNode: { findMany: async ({ where }: { where: Where }) => claims.filter(claim => (!where.id || where.id.in.includes(claim.id))
      && (!where.researchObjectId || claim.researchObjectId === where.researchObjectId) && (!where.versionId || claim.versionId === where.versionId)
      && (!where.extractionStatus || claim.extractionStatus === where.extractionStatus)) },
    evidenceRecord: { findMany: async ({ where }: { where: Where }) => evidence.filter(row => (!where.claimId || where.claimId.in.includes(row.claimId))
      && (!where.researchObjectId || row.researchObjectId === where.researchObjectId) && (!where.versionId || row.versionId === where.versionId)
      && (!where.extractionStatus || row.extractionStatus === where.extractionStatus) && (!where.contentHash || row.contentHash === where.contentHash)) },
    version: { findFirst: async () => version }, ingestionTask: { findUnique: async () => ingestion },
  };
  const source = await readVisualNarrativeSource(prisma as never, { userId: session.userId, workspaceId: ro.workspaceId, researchObjectId: roId, versionId, sourceClaimIds: [claimId] });
  context.narrativeSourceIdentity = source.identity;
  result.storyboardCheckpoint.narrativeSourceIdentity = source.identity;
  const input = { researchObjectId: roId, versionId, sourceClaimIds: [claimId],
    video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parentId, sceneImageAssetIds: frames.map(frame => frame.id) } };
  return { prisma, input, parent, parentTask, frames, frameTasks, ancestors, ancestorTasks, claims, evidence, ingestion, version, context, cp, sourceEvidenceIdentity };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type ChainEntry = { asset: Fixture['parent']; task: Fixture['parentTask'] };
function refreshChain(f: Fixture, chain: ChainEntry[]) {
  for (const { asset, task } of chain) {
    task.id = asset.id;
    task.payload.storyboard = structuredClone(asset.provenance.storyboardSettings);
    task.result.assetId = asset.id; task.result.contentHash = asset.contentHash;
    task.result.nativeAgentExecution.checkpoint!.taskId = asset.id;
    asset.provenance.taskId = asset.id;
    asset.provenance.storyboardDocument = parseStoryboardDocument(asset.provenance.storyboardDocument, [claimId], 'video', { nativeNarrativeVideo: true });
    task.result.storyboardCheckpoint.planned.document = structuredClone(asset.provenance.storyboardDocument);
    task.result.storyboardReview.requestId = asset.id;
    task.result.storyboardReview.candidateHash = hash(asset.provenance.storyboardDocument);
    asset.provenance.illustrationReview = structuredClone(task.result.storyboardReview);
    record(asset.provenance).designSkills = structuredClone(task.result.storyboardCheckpoint.planned.designSkills);
  }
  for (const { asset, task } of chain) {
    const baseId = record(asset.provenance.storyboardSettings).baseAssetId;
    const base = chain.find(entry => entry.asset.id === baseId);
    for (const context of [task.result.nativeIllustrationContext, task.result.storyboardCheckpoint]) {
      context.payload = structuredClone(task.payload);
      record(context).baseIdentity = base ? parentIdentity(base.asset) : null;
    }
  }
  f.frames.forEach((frame, index) => {
    const parent = chain.find(entry => entry.asset.id === frame.provenance.sceneImage.storyboardAssetId);
    if (!parent) return;
    frame.provenance.parentIdentity = parentIdentity(parent.asset);
    frame.provenance.imageReview.parentIdentity = frame.provenance.parentIdentity;
    const result = f.frameTasks[index]!.result;
    result.imageReview = structuredClone(frame.provenance.imageReview);
    result.nativeImageReview.parentIdentity = frame.provenance.parentIdentity;
    result.nativeImageReview.review = structuredClone(frame.provenance.imageReview);
  });
}
async function chainFixture(count = 3) {
  const f = await fixture();
  for (let index = 1; index < count; index++) {
    const asset = structuredClone(f.parent), task = structuredClone(f.parentTask);
    asset.id = uuid(100 + index); asset.contentHash = hash({ parent: asset.id });
    f.ancestors.push(asset); f.ancestorTasks.push(task);
  }
  const chain: ChainEntry[] = [{ asset: f.parent, task: f.parentTask }, ...f.ancestors.map((asset, index) => ({ asset, task: f.ancestorTasks[index]! }))];
  chain.forEach((entry, index) => {
    if (chain[index + 1]) record(entry.asset.provenance.storyboardSettings).baseAssetId = chain[index + 1]!.asset.id;
  });
  const origin = chain.at(-1)!;
  f.frames.forEach(frame => { frame.provenance.sceneImage.storyboardAssetId = origin.asset.id; });
  refreshChain(f, chain);
  return { ...f, chain, origin };
}

function frameRenderResources(sceneIndex: number): RenderResources {
  return [{ id: 'openscience-research-illustration', version: '20', resources: ['SKILL.md#Execution', 'SKILL.md#Visual craft'] },
    { id: 'baoyu-article-illustrator', upstreamCommit: 'a'.repeat(40), resources: [`references/styles/scene-${sceneIndex}.md`] }];
}
function refreshRenderResourceChain(f: Fixture, chain: ChainEntry[]) {
  for (const entry of chain) {
    const merged: RenderResources = [{ id: 'openscience-research-illustration', version: '20', resources: ['SKILL.md#Planning'] }];
    for (const prompt of entry.task.result.illustrationPrompts) {
      for (const usage of (record(prompt).renderResources ?? []) as RenderResources) {
        const existing = merged.find(row => row.id === usage.id && row.version === usage.version && row.upstreamCommit === usage.upstreamCommit);
        if (existing) existing.resources = [...new Set([...existing.resources, ...usage.resources])];
        else merged.push(structuredClone(usage));
      }
    }
    entry.task.result.storyboardCheckpoint.planned.designSkills = merged;
  }
  refreshChain(f, chain);
}
async function renderResourceFixture() {
  const f = await chainFixture();
  for (const entry of f.chain) {
    entry.asset.provenance.storyboardSettings.style = 'auto';
    entry.task.result.illustrationPrompts.forEach((prompt, sceneIndex) => { record(prompt).renderResources = frameRenderResources(sceneIndex); });
  }
  refreshRenderResourceChain(f, f.chain);
  return f;
}

async function listFixture(base?: Fixture) {
  const f = base ?? await fixture(), userId = f.parentTask.session.userId;
  const ro = await f.prisma.researchObject.findUnique();
  const version = Object.assign(f.version, { status: 'draft', publicVersionId: null, researchRecord: null,
    researchObject: { ...ro, createdBy: userId }, commit: { branchId: uuid(70) } });
  const tip = { id: versionId }, workspace = { id: ro.workspaceId, status: 'active' }, membership = { role: 'author' }, user = { platformRole: 'platform_admin' };
  const assets = [f.parent, ...f.ancestors, ...f.frames].map(asset => Object.assign(asset, {
    generator: asset.kind === 'interactive_html' ? 'OpenScience Hermes storyboard planner' : 'OpenScience Hermes scene image / test',
    generatorVersion: 'test', objectKey: `test/${asset.id}`, label: 'presentation_not_evidence', createdAt: now, updatedAt: now,
  }));
  const prisma = { ...f.prisma,
    presentationAsset: { ...f.prisma.presentationAsset,
      findMany: async ({ where }: { where: { id?: { in: string[] }; researchObjectId?: string; versionId?: string; deletedAt?: null } }) => where.id
        ? assets.filter(asset => where.id!.in.includes(asset.id))
        : assets.filter(asset => !asset.deletedAt && asset.researchObjectId === where.researchObjectId && asset.versionId === where.versionId) },
    version: { ...f.prisma.version, findUnique: async () => version,
      findFirst: async ({ where }: { where: { id?: string } }) => where.id ? version : { ...version, id: tip.id } },
    workspace: { findUnique: async () => workspace }, membership: { findUnique: async () => membership }, user: { findUnique: async () => user },
    hermesResearchStep: { findFirst: async () => null },
  };
  const input = { userId, researchObjectId: roId, versionId };
  return { ...f, prisma, input, assets, version, tip, workspace, membership, user };
}

describe('native narrative video technical parents', () => {
  it('accepts an English native video with matching reconstructed settings and original pixel-parent identities', async () => {
    const f = await fixture();
    f.parent.provenance.storyboardSettings.locale = 'en';
    refreshChain(f, [{ asset: f.parent, task: f.parentTask }]);
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    expect(proof.settings.locale).toBe('en');
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    expect(parents?.storyboardView.locale).toBe('en');
    expect(parents?.orderedImages.map(frame => frame.id)).toEqual(f.input.video.sceneImageAssetIds);
  });

  it.each(['draft', 'approved'])('consumes a %s native storyboard and reviewed frames without approving any assets', async status => {
    const f = await fixture(); f.parent.status = status; f.frames.forEach(frame => { frame.status = status; });
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    expect(parents?.storyboard.id).toBe(parentId);
    expect(parents?.orderedImages.map(image => image.id)).toEqual(f.input.video.sceneImageAssetIds);
    expect(record(parents).parentSourceEvidenceIdentity).toBe(f.sourceEvidenceIdentity);
    expect(f.parent.status).toBe(status); expect(f.frames.every(frame => frame.status === status)).toBe(true);
  });

  it('exposes the completed task, settings and ordered frame/video prompts through the shared native proof helper', async () => {
    const f = await fixture();
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    expect(proof.task.id).toBe(f.parentTask.id);
    expect(proof.settings).toEqual(f.parentTask.payload.storyboard);
    expect(proof.prompts).toEqual(f.parentTask.result.illustrationPrompts);
    expect(proof.sourceEvidenceIdentity).toBe(f.sourceEvidenceIdentity);
  });

  it.each(['missing', 'count', 'order', 'frame-prompt', 'video-prompt', 'resources', 'art-call', 'review-call', 'runtime', 'checkpoint-payload'])('rejects incomplete native prompt ownership: %s', async change => {
    const f = await fixture(), result = f.parentTask.result;
    if (change === 'missing') delete record(result).illustrationPrompts;
    if (change === 'count') result.illustrationPrompts.pop();
    if (change === 'order') result.illustrationPrompts.reverse();
    if (change === 'frame-prompt') result.illustrationPrompts[0]!.prompt = '';
    if (change === 'video-prompt') delete record(result.illustrationPrompts[0]).videoPrompt;
    if (change === 'resources') result.storyboardCheckpoint.planned.designSkills[0]!.version = 'different';
    if (change === 'art-call') result.nativeIllustration.planToolCallId = '';
    if (change === 'review-call') result.nativeIllustration.reviewToolCallId = '';
    if (change === 'runtime') result.nativeIllustration.runtimeId = 'different';
    if (change === 'checkpoint-payload') result.storyboardCheckpoint.payload.versionId = uuid(90);
    await expect(requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input)).rejects.toThrow();
  });

  it.each(['missing-task', 'failed-task', 'deleted-task', 'blocked-task', 'wrong-kind', 'wrong-profile', 'missing-checkpoint', 'started-checkpoint',
    'checkpoint-task', 'checkpoint-response', 'wrong-asset', 'wrong-content', 'rejected-review', 'candidate', 'review-owner', 'review-copy', 'checkpoint-document', 'checkpoint-source', 'payload-output', 'payload-narrative', 'payload-version'])('rejects parent proof drift: %s', async change => {
    const f = await fixture();
    f.parent.status = 'approved';
    if (change === 'missing-task') f.parentTask.id = uuid(90);
    if (change === 'failed-task') f.parentTask.status = 'failed';
    if (change === 'deleted-task') f.parentTask.deletedAt = now;
    if (change === 'blocked-task') f.parentTask.error = '[blocked] Native source changed';
    if (change === 'wrong-kind') f.parentTask.kind = 'sdf.extract';
    if (change === 'wrong-profile') f.parentTask.result.nativeAgentExecution.profile = 'paper-author';
    if (change === 'missing-checkpoint') delete f.parentTask.result.nativeAgentExecution.checkpoint;
    if (change === 'started-checkpoint') f.cp.state = 'started';
    if (change === 'checkpoint-task') f.cp.taskId = uuid(90);
    if (change === 'checkpoint-response') f.cp.responseHash = '0'.repeat(64);
    if (change === 'wrong-asset') f.parentTask.result.assetId = uuid(90);
    if (change === 'wrong-content') f.parentTask.result.contentHash = '0'.repeat(64);
    if (change === 'rejected-review') f.parentTask.result.storyboardReview.decision = 'blocked';
    if (change === 'candidate') f.parentTask.result.storyboardReview.candidateHash = '0'.repeat(64);
    if (change === 'review-owner') f.parentTask.result.storyboardReview.requestId = uuid(90);
    if (change === 'review-copy') f.parent.provenance.illustrationReview.summary = 'Different receipt';
    if (change === 'checkpoint-document') f.parentTask.result.storyboardCheckpoint.planned.document.scenes[0]!.narration = 'Altered narration';
    if (change === 'checkpoint-source') f.parentTask.result.storyboardCheckpoint.sourceEvidenceIdentity = '0'.repeat(64);
    if (change === 'payload-output') f.parentTask.payload.storyboard.output = 'image';
    if (change === 'payload-narrative') record(f.parentTask.payload.storyboard).narrative = undefined;
    if (change === 'payload-version') f.parentTask.payload.versionId = uuid(90);
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it.each(['claim', 'evidence', 'paper', 'manifest', 'source-review', 'source-map'])('rechecks the actual terminal source after parsing the parent task: %s', async change => {
    const f = await fixture();
    if (change === 'claim') f.claims[0]!.statement += ' Changed';
    if (change === 'evidence') f.evidence[0]!.exactQuote += ' Changed';
    if (change === 'paper') f.ingestion.artifact.deletedAt = now;
    if (change === 'manifest') f.version.manifest.entries = [];
    if (change === 'source-review') f.ingestion.agentTask.result.scientificReview.status = 'needs_review';
    if (change === 'source-map') f.parentTask.result.sourceMapRef.contentHash = '0'.repeat(64);
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it.each(['rejected', 'blocked', 'deleted'])('rejects a %s storyboard', async state => {
    const f = await fixture(); if (state === 'deleted') f.parent.deletedAt = now; else f.parent.status = state;
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it.each(['rejected', 'blocked', 'deleted', 'import', 'history', 'wrong-task-id', 'missing-owner', 'failed-owner', 'deleted-owner', 'missing-native-review',
    'started-review', 'blocked-review', 'review-content', 'review-source', 'review-parent', 'review-prompt', 'wrong-order', 'wrong-version', 'wrong-claims'])('rejects invalid native frame eligibility: %s', async change => {
    const f = await fixture(), frame = f.frames[0]!, owner = f.frameTasks[0]!;
    if (change === 'rejected' || change === 'blocked') frame.status = change;
    if (change === 'deleted') frame.deletedAt = now;
    if (change === 'import') frame.provenance.source = 'admin_reviewed_import';
    if (change === 'history') frame.provenance.source = 'version_history_copy';
    if (change === 'wrong-task-id') frame.provenance.taskId = uuid(90);
    if (change === 'missing-owner') owner.id = uuid(90);
    if (change === 'failed-owner') owner.status = 'failed';
    if (change === 'deleted-owner') owner.deletedAt = now;
    if (change === 'missing-native-review') delete record(owner.result).nativeImageReview;
    if (change === 'started-review') { owner.result.nativeImageReview.state = 'started'; delete record(owner.result.nativeImageReview).review; }
    if (change === 'blocked-review') { frame.provenance.imageReview.decision = 'blocked'; owner.result.nativeImageReview.review.decision = 'blocked'; }
    if (change === 'review-content') frame.contentHash = '0'.repeat(64);
    if (change === 'review-source') frame.provenance.sourceEvidenceIdentity = '0'.repeat(64);
    if (change === 'review-parent') frame.provenance.parentIdentity = 'stale-parent';
    if (change === 'review-prompt') frame.provenance.imageReview.promptHash = '0'.repeat(64);
    if (change === 'wrong-order') f.input.video.sceneImageAssetIds.reverse();
    if (change === 'wrong-version') frame.versionId = uuid(90);
    if (change === 'wrong-claims') frame.sourceClaims = [{ claimId: uuid(90) }];
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it('does not infer cross-base replay proof from equal stored prompts and scene content', async () => {
    const f = await fixture();
    f.frames[0]!.provenance.sceneImage.storyboardAssetId = uuid(90);
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it('requires the native DB readers only for the native video path', async () => {
    const f = await fixture();
    const legacyDb = { presentationAsset: f.prisma.presentationAsset, evidenceRecord: f.prisma.evidenceRecord, claimNode: f.prisma.claimNode };
    await expect(requireVideoGenerationParents(legacyDb as never, f.input)).rejects.toThrow();
  });

  it.each(['presentationAsset', 'claimNode', 'evidenceRecord', 'agentTask', 'agentSession', 'researchObject', 'version', 'ingestionTask'])('reports an ineligible native plan rather than a TypeError when the %s reader is missing', async reader => {
    const f = await fixture(), prisma = { ...f.prisma };
    delete record(prisma)[reader];
    await expect(requireNativeVideoStoryboard(prisma as never, f.parent as never, f.input)).rejects.toMatchObject({ name: 'PresentationAssetError', code: 'VALIDATION_ERROR' });
  });

  it.each(['marker', 'terminal-review', 'current-source'])('converts the expected native %s transition failure at the proof boundary', async change => {
    const f = await fixture();
    if (change === 'marker') record(f.parentTask.result.nativeAgentExecution).profile = 'unrecognized';
    if (change === 'terminal-review') f.cp.responseHash = '0'.repeat(64);
    if (change === 'current-source') f.claims[0]!.statement += ' Changed';
    await expect(requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input)).rejects.toMatchObject({ name: 'PresentationAssetError', code: 'VALIDATION_ERROR' });
  });

  it('preserves unexpected DB failures instead of hiding them as eligibility failures', async () => {
    const f = await fixture(), failure = new Error('Database connection unavailable');
    f.prisma.claimNode.findMany = async () => { throw failure; };
    await expect(requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input)).rejects.toBe(failure);
  });
});

describe('explicit native video base-chain frame reuse', () => {
  it('qualifies an exact-index candidate directly for read projections and returns its actual parent proof', async () => {
    const f = await chainFixture();
    const current = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    const parent = await requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, current, f.input, 0);
    expect(parent).toMatchObject({ storyboardAssetId: f.origin.asset.id, identity: parentIdentity(f.origin.asset), sourceEvidenceIdentity: f.sourceEvidenceIdentity,
      nativeParent: { task: { id: f.origin.asset.id } } });
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[1] as never, f.parent as never, current, f.input, 0)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a checked proof passed with the wrong current storyboard', async () => {
    const f = await chainFixture();
    const other = await requireNativeVideoStoryboard(f.prisma as never, f.origin.asset as never, f.input);
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, other, f.input, 0)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each(['content', 'document', 'review', 'provenance-task'])('rejects a checked proof passed with a changed current storyboard %s snapshot', async change => {
    const f = await chainFixture();
    const current = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    if (change === 'content') f.parent.contentHash = '0'.repeat(64);
    if (change === 'document') f.parent.provenance.storyboardDocument.scenes[2]!.narration += ' Changed';
    if (change === 'review') f.parent.provenance.illustrationReview.summary = 'Different receipt';
    if (change === 'provenance-task') f.parent.provenance.taskId = uuid(90);
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, current, f.input, 0)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('preserves unexpected frame-owner DB failures during individual qualification', async () => {
    const f = await fixture(), failure = new Error('Pixel owner DB unavailable');
    const current = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    f.prisma.agentTask.findUnique = async () => { throw failure; };
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, current, f.input, 0)).rejects.toBe(failure);
  });

  it.each([2, 3])('reuses reviewed original frames across %i native parents without aliasing them', async count => {
    const f = await chainFixture(count);
    const originals = structuredClone(f.frames);
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    expect(parents?.orderedImages).toEqual(originals);
    expect(record(record(parents).nativeParent).task).toMatchObject({ id: parentId });
    const actualParents = record(parents).originalFrameParents as Array<{ storyboardAssetId: string; identity: string; sourceEvidenceIdentity: string; nativeParent: { task: { id: string } } }>;
    expect(actualParents.map(parent => parent.storyboardAssetId)).toEqual(f.frames.map(() => f.origin.asset.id));
    expect(actualParents.every(parent => parent.identity === parentIdentity(f.origin.asset) && parent.sourceEvidenceIdentity === f.sourceEvidenceIdentity
      && parent.nativeParent.task.id === f.origin.asset.id)).toBe(true);
    expect(f.frames).toEqual(originals);
  });

  it('allows a corrected third scene with new pixels while reusing the unchanged first two frames', async () => {
    const f = await chainFixture();
    f.parent.provenance.storyboardDocument.scenes[2]!.narration = 'The supported transfer stays within the stated conditions.';
    f.parentTask.result.illustrationPrompts[2]!.prompt = 'New reviewed third frame';
    f.parentTask.result.illustrationPrompts[2]!.videoPrompt = 'New reviewed third motion';
    f.parent.provenance.storyboardSettings.instruction = 'Correct only the third scene.';
    record(f.parent.provenance.storyboardSettings).revisionSceneIndex = 2;
    f.frames[2]!.provenance.sceneImage.storyboardAssetId = parentId;
    refreshChain(f, f.chain);
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    const actualParents = record(parents).originalFrameParents as Array<{ storyboardAssetId: string }>;
    expect(actualParents.map(parent => parent.storyboardAssetId)).toEqual([f.origin.asset.id, f.origin.asset.id, parentId]);
    expect(parents?.orderedImages.map(frame => frame.id)).toEqual(f.input.video.sceneImageAssetIds);
  });

  it.each(['scene', 'illustration', 'scene-claims', 'scene-count', 'narrative', 'continuity', 'audio-policy', 'locale', 'style', 'frame-prompt', 'video-prompt', 'resources'])('rejects a valid completed intermediate parent whose %s differs even when current and original match', async change => {
    const f = await chainFixture(), middle = f.chain[1]!;
    const scene = middle.asset.provenance.storyboardDocument.scenes[0]!;
    if (change === 'scene') scene.narration = 'A different supported narration.';
    if (change === 'illustration') { scene.illustration!.treatment = 'Different visual treatment'; scene.visualAction = describeIllustrationBrief(scene.illustration!); }
    if (change === 'scene-claims') scene.sourceClaimIds = [uuid(90)];
    if (change === 'scene-count') middle.asset.provenance.storyboardDocument.scenes.push(structuredClone(scene));
    if (change === 'narrative') middle.asset.provenance.storyboardDocument.narrative!.audience = 'A different audience';
    if (change === 'continuity') middle.asset.provenance.storyboardDocument.videoProduction!.visualContinuity = 'A different continuity instruction';
    if (change === 'audio-policy') middle.asset.provenance.storyboardDocument.videoProduction!.audioPolicy = 'native-first';
    if (change === 'locale') middle.asset.provenance.storyboardSettings.locale = 'en';
    if (change === 'style') middle.asset.provenance.storyboardSettings.style = 'watercolor';
    if (change === 'frame-prompt') middle.task.result.illustrationPrompts[0]!.prompt += ' Different frame';
    if (change === 'video-prompt') middle.task.result.illustrationPrompts[0]!.videoPrompt += ' Different motion';
    if (change === 'resources') middle.task.result.storyboardCheckpoint.planned.designSkills[0]!.version = '21';
    if (change === 'scene-claims') {
      await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
      return;
    }
    if (change === 'scene-count') middle.task.result.illustrationPrompts.push({ sceneIndex: 3, prompt: 'Fourth frame', videoPrompt: 'Fourth motion' });
    refreshChain(f, f.chain);
    for (const entry of f.chain) await expect(requireNativeVideoStoryboard(f.prisma as never, entry.asset as never, f.input)).resolves.toBeDefined();
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow('Native video frame reuse changed');
  });

  it.each(['missing', 'cycle', 'foreign-ro', 'foreign-version', 'source-claims', 'source-evidence', 'uncompleted-native', 'deleted-parent', 'figure-plan'])('rejects invalid ancestry: %s', async change => {
    const f = await chainFixture();
    if (change === 'missing') { f.ancestors.pop(); f.ancestorTasks.pop(); }
    if (change === 'cycle') { record(f.origin.asset.provenance.storyboardSettings).baseAssetId = parentId; refreshChain(f, f.chain); }
    if (change === 'foreign-ro') f.origin.asset.researchObjectId = uuid(90);
    if (change === 'foreign-version') f.origin.asset.versionId = uuid(90);
    if (change === 'source-claims') f.origin.asset.sourceClaims = [{ claimId: uuid(90) }];
    if (change === 'source-evidence') f.origin.task.result.nativeIllustrationContext.sourceEvidenceIdentity = '0'.repeat(64);
    if (change === 'uncompleted-native') f.origin.task.status = 'failed';
    if (change === 'deleted-parent') f.origin.asset.deletedAt = now;
    if (change === 'figure-plan') record(f.origin.asset.provenance.storyboardSettings).figurePlan = { figures: [{ id: 'Fig. 1', decision: 'reuse' }] };
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it('accepts 32 parents and rejects a chain beyond the explicit traversal bound', async () => {
    const accepted = await chainFixture(32);
    await expect(requireVideoGenerationParents(accepted.prisma as never, accepted.input)).resolves.toBeDefined();
    const rejected = await chainFixture(33);
    await expect(requireVideoGenerationParents(rejected.prisma as never, rejected.input)).rejects.toThrow('Native video base chain');
  });

  it.each(['parent-identity', 'review-owner', 'blocked-review', 'import', 'aliased-parent'])('checks the actual original frame parent and native pixel owner: %s', async change => {
    const f = await chainFixture(), frame = f.frames[0]!;
    if (change === 'parent-identity') frame.provenance.parentIdentity = parentIdentity(f.parent);
    if (change === 'review-owner') f.frameTasks[0]!.id = uuid(90);
    if (change === 'blocked-review') { frame.provenance.imageReview.decision = 'blocked'; f.frameTasks[0]!.result.nativeImageReview.review.decision = 'blocked'; }
    if (change === 'import') frame.provenance.source = 'admin_reviewed_import';
    if (change === 'aliased-parent') frame.provenance.sceneImage.storyboardAssetId = parentId;
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });
});

describe('native per-frame render-resource reuse', () => {
  it('preserves optional per-frame resources and keeps original prompt rows unchanged when they are absent', async () => {
    const f = await renderResourceFixture();
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    expect(record(proof.prompts[0]).renderResources).toEqual(record(f.parentTask.result.illustrationPrompts[0]).renderResources);
    const old = await fixture();
    const legacyProof = await requireNativeVideoStoryboard(old.prisma as never, old.parent as never, old.input);
    expect(legacyProof.prompts).toEqual(old.parentTask.result.illustrationPrompts);
    expect(legacyProof.prompts.every(prompt => !Object.hasOwn(prompt, 'renderResources'))).toBe(true);
  });

  it('keeps auto-style frames one and two eligible when only the third scene art resources change', async () => {
    const f = await renderResourceFixture();
    record(f.parent.provenance.storyboardSettings).revisionSceneIndex = 2;
    f.parent.provenance.storyboardSettings.instruction = 'Restyle only the third scene.';
    const third = record(f.parentTask.result.illustrationPrompts[2]).renderResources as RenderResources;
    third[1]!.resources = ['references/styles/changed-third-scene.md'];
    refreshRenderResourceChain(f, f.chain);
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    expect(f.parentTask.result.storyboardCheckpoint.planned.designSkills).not.toEqual(f.origin.task.result.storyboardCheckpoint.planned.designSkills);
    for (const sceneIndex of [0, 1]) {
      await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[sceneIndex] as never, f.parent as never, proof, f.input, sceneIndex)).resolves.toMatchObject({ storyboardAssetId: f.origin.asset.id });
    }
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[2] as never, f.parent as never, proof, f.input, 2)).rejects.toThrow('Native video frame reuse changed');

    const newFrame = structuredClone(f.frames[2]!), newTask = structuredClone(f.frameTasks[2]!);
    newFrame.id = uuid(350); newFrame.provenance.taskId = newFrame.id;
    newFrame.provenance.sceneImage.storyboardAssetId = parentId; newFrame.provenance.imageReview.requestId = newFrame.id;
    newTask.id = newFrame.id; newTask.result.assetId = newFrame.id; newTask.result.nativeImageReview.requestId = newFrame.id;
    f.frames.push(newFrame); f.frameTasks.push(newTask);
    refreshChain(f, f.chain);
    f.input.video.sceneImageAssetIds[2] = newFrame.id;
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    expect(parents?.orderedImages.map(frame => frame.id)).toEqual([f.frames[0]!.id, f.frames[1]!.id, newFrame.id]);
    const listing = await listFixture(f);
    const view = (await listPresentationAssets({ prisma: listing.prisma } as never, listing.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateVideo: true, videoFrameAssetIds: f.input.video.sceneImageAssetIds });
  });

  it.each(['version', 'upstreamCommit', 'resources'])('rejects a shared frame rendering %s change despite identical prompt text', async change => {
    const f = await renderResourceFixture();
    const resources = record(f.parentTask.result.illustrationPrompts[0]).renderResources as RenderResources;
    if (change === 'version') resources[0]!.version = '21';
    if (change === 'upstreamCommit') resources[1]!.upstreamCommit = 'b'.repeat(40);
    if (change === 'resources') resources[0]!.resources.push('SKILL.md#Different shared rendering section');
    refreshRenderResourceChain(f, f.chain);
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, proof, f.input, 0)).rejects.toThrow('Native video frame reuse changed');
  });

  it.each(['current', 'base'])('uses the conservative merged-resource comparison when %s prompt rows lack per-frame metadata', async missing => {
    const f = await renderResourceFixture();
    const entry = missing === 'current' ? f.chain[0]! : f.chain[1]!;
    entry.task.result.illustrationPrompts.forEach(prompt => { delete record(prompt).renderResources; });
    const proof = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, proof, f.input, 0)).resolves.toBeDefined();
    const merged = f.parentTask.result.storyboardCheckpoint.planned.designSkills;
    merged.find(row => row.id === 'baoyu-article-illustrator')!.resources.push('references/styles/unproven-third-scene.md');
    refreshChain(f, f.chain);
    const changed = await requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input);
    await expect(requireNativeVideoSceneImage(f.prisma as never, f.frames[0] as never, f.parent as never, changed, f.input, 0)).rejects.toThrow('Native video frame reuse changed');
  });

  it.each([undefined, null, 'not-an-array', {}, [{ resources: ['SKILL.md'] }], [{ id: 'render', resources: 'SKILL.md' }],
    [{ id: 'render', resources: [1] }], [{ id: 'render', version: 20, resources: ['SKILL.md'] }],
    [{ id: 'render', upstreamCommit: 20, resources: ['SKILL.md'] }], [{ id: 'render', resources: ['SKILL.md'], extra: true }],
    [{ id: ' ', resources: [] }], [{ id: 'render', resources: [' '] }]].map(metadata => [metadata] as const))('rejects malformed optional render resources (%j) rather than guessing a fallback', async metadata => {
    const f = await fixture();
    record(f.parentTask.result.illustrationPrompts[0]).renderResources = metadata;
    await expect(requireNativeVideoStoryboard(f.prisma as never, f.parent as never, f.input)).rejects.toThrow('Native video render resources');
  });
});

describe('native video asset-list capabilities', () => {
  it('exposes the English native video capability and its qualified frame IDs', async () => {
    const base = await fixture();
    base.parent.provenance.storyboardSettings.locale = 'en';
    refreshChain(base, [{ asset: base.parent, task: base.parentTask }]);
    const f = await listFixture(base);
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ storyboard: { locale: 'en' }, canGenerateSceneImage: true, canGenerateVideo: true, videoFrameAssetIds: f.frames.map(frame => frame.id) });
  });

  it('exposes ordered qualified draft frame IDs and native draft generation capabilities without approving assets', async () => {
    const f = await listFixture();
    f.assets.reverse();
    const views = await listPresentationAssets({ prisma: f.prisma } as never, f.input);
    expect(views.find(asset => asset.id === parentId)).toMatchObject({ status: 'draft', canGenerateSceneImage: true, canGenerateVideo: true,
      videoFrameAssetIds: f.frames.map(frame => frame.id) });
    expect(views).toHaveLength(f.assets.length);
    expect(f.parent.status).toBe('draft'); expect(f.frames.every(frame => frame.status === 'draft')).toBe(true);
    expect(JSON.stringify(views)).not.toContain('nativeAgentExecution');
  });

  it('allows scene-image generation before any reviewed frames exist', async () => {
    const base = await fixture(); base.frames.length = 0; base.frameTasks.length = 0;
    const f = await listFixture(base);
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: true, canGenerateVideo: false });
    expect(view?.videoFrameAssetIds).toBeUndefined();
  });

  it.each(['missing-pixel', 'blocked-pixel', 'failed-pixel-owner', 'history', 'import', 'orphan', 'rejected', 'missing-frame'])('keeps assets visible while rejecting %s as a native video frame', async change => {
    const base = await fixture(), frame = base.frames[0]!;
    if (change === 'missing-pixel') delete record(base.frameTasks[0]!.result).nativeImageReview;
    if (change === 'blocked-pixel') { frame.provenance.imageReview.decision = 'blocked'; base.frameTasks[0]!.result.nativeImageReview.review.decision = 'blocked'; }
    if (change === 'failed-pixel-owner') base.frameTasks[0]!.status = 'failed';
    if (change === 'history') frame.provenance.source = 'version_history_copy';
    if (change === 'import') frame.provenance.source = 'admin_reviewed_import';
    if (change === 'orphan') frame.provenance.sceneImage.storyboardAssetId = uuid(90);
    if (change === 'rejected') frame.status = 'rejected';
    if (change === 'missing-frame') base.frames.shift();
    const f = await listFixture(base), views = await listPresentationAssets({ prisma: f.prisma } as never, f.input);
    const view = views.find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: true, canGenerateVideo: false });
    expect(view?.videoFrameAssetIds).toBeUndefined();
    expect(views).toHaveLength(f.assets.length);
  });

  it('selects explicit-base frames in scene order while retaining their original identities', async () => {
    const base = await chainFixture(), f = await listFixture(base);
    const originalFrames = structuredClone(f.frames);
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: true, canGenerateVideo: true, videoFrameAssetIds: f.frames.map(frame => frame.id) });
    expect(f.frames).toEqual(originalFrames);
  });

  it('prefers qualified current-parent frames over qualified base frames at the same index', async () => {
    const base = await chainFixture(), frame = structuredClone(base.frames[0]!), task = structuredClone(base.frameTasks[0]!);
    frame.id = uuid(300); frame.provenance.taskId = frame.id; frame.provenance.sceneImage.storyboardAssetId = parentId;
    frame.provenance.parentIdentity = parentIdentity(base.parent); frame.provenance.imageReview.requestId = frame.id;
    frame.provenance.imageReview.parentIdentity = frame.provenance.parentIdentity;
    task.id = frame.id; task.result.assetId = frame.id; task.result.imageReview = structuredClone(frame.provenance.imageReview);
    task.result.nativeImageReview.requestId = frame.id; task.result.nativeImageReview.parentIdentity = frame.provenance.parentIdentity;
    task.result.nativeImageReview.review = structuredClone(frame.provenance.imageReview);
    base.frames.push(frame); base.frameTasks.push(task);
    const f = await listFixture(base);
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view?.videoFrameAssetIds).toEqual([frame.id, base.frames[1]!.id, base.frames[2]!.id]);
  });

  it.each(['failed-task', 'started-cp', 'claim-drift', 'missing-evidence', 'deleted-paper', 'missing-manifest', 'source-review', 'source-map'])('marks a stale native %s proof ineligible without crashing or hiding saved assets', async change => {
    const base = await fixture();
    if (change === 'failed-task') base.parentTask.status = 'failed';
    if (change === 'started-cp') base.cp.state = 'started';
    if (change === 'claim-drift') base.claims[0]!.statement += ' Changed';
    if (change === 'missing-evidence') base.evidence.length = 0;
    if (change === 'deleted-paper') base.ingestion.artifact.deletedAt = now;
    if (change === 'missing-manifest') base.version.manifest.entries.length = 0;
    if (change === 'source-review') base.ingestion.agentTask.result.scientificReview.status = 'needs_review';
    if (change === 'source-map') base.ingestion.agentTask.result.sourceMapRef.contentHash = '0'.repeat(64);
    const f = await listFixture(base), views = await listPresentationAssets({ prisma: f.prisma } as never, f.input);
    const view = views.find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: false, canGenerateVideo: false });
    expect(view?.videoFrameAssetIds).toBeUndefined();
    expect(views).toHaveLength(f.assets.length);
  });

  it.each(['non-admin', 'viewer', 'archived-workspace', 'immutable-version', 'historical-tip'])('retains the existing %s actor/write restriction', async change => {
    const f = await listFixture();
    if (change === 'non-admin') f.user.platformRole = 'user';
    if (change === 'viewer') f.membership.role = 'viewer';
    if (change === 'archived-workspace') f.workspace.status = 'archived';
    if (change === 'immutable-version') f.version.status = 'published';
    if (change === 'historical-tip') f.tip.id = uuid(90);
    const views = await listPresentationAssets({ prisma: f.prisma } as never, f.input);
    expect(views.find(asset => asset.id === parentId)).toMatchObject({ canGenerateSceneImage: false, canGenerateVideo: false });
    expect(views).toHaveLength(f.assets.length);
  });

  it('revalidates the selected set before exposing IDs when a pixel owner changes after candidate qualification', async () => {
    const f = await listFixture(), readAssets = f.prisma.presentationAsset.findMany;
    f.prisma.presentationAsset.findMany = async args => {
      if (args.where.id) f.frameTasks[0]!.status = 'failed';
      return readAssets(args);
    };
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: true, canGenerateVideo: false });
    expect(view?.videoFrameAssetIds).toBeUndefined();
  });

  it.each(['Database unavailable', '[blocked] Database unavailable'])('propagates unexpected system error: %s', async message => {
    const f = await listFixture(), failure = new Error(message);
    f.prisma.agentTask.findUnique = async () => { throw failure; };
    await expect(listPresentationAssets({ prisma: f.prisma } as never, f.input)).rejects.toBe(failure);
  });

  it.each(['approved', 'draft', 'draft-frame'])('preserves the %s legacy animation projection', async state => {
    const f = await listFixture();
    f.parent.status = state === 'draft' ? 'draft' : 'approved';
    f.frames.forEach(frame => { frame.status = 'approved'; });
    if (state === 'draft-frame') f.frames[0]!.status = 'draft';
    delete record(f.parent.provenance.storyboardSettings).narrative;
    record(f.parent.provenance).storyboardDocument = { schemaVersion: 1, title: 'Legacy', scenes: Array.from({ length: 3 }, () => ({
      title: 'Legacy scene', narration: 'Supported transfer.', visualAction: 'Move the supported object.', durationSeconds: 8, sourceClaimIds: [claimId], animation: {
        objects: [{ id: 'source', kind: 'ellipse', x: 0.1, y: 0.1, width: 0.1, height: 0.1, color: 'teal', sourceClaimIds: [claimId] }],
        actions: [{ kind: 'translate', target: 'source', start: 0, end: 1, toX: 0.5, toY: 0.1, meaning: 'Supported transfer', basis: { claimId, quote: f.claims[0]!.statement } }] } })) };
    f.frames.forEach(frame => { frame.provenance.parentIdentity = parentIdentity(f.parent); });
    const view = (await listPresentationAssets({ prisma: f.prisma } as never, f.input)).find(asset => asset.id === parentId);
    expect(view).toMatchObject({ canGenerateSceneImage: state !== 'draft', canGenerateVideo: state === 'approved' });
    expect(view?.videoFrameAssetIds).toBeUndefined();
  });
});

describe('legacy video parent compatibility', () => {
  function legacyFixture() {
    const storyboardDocument = { schemaVersion: 1, title: 'Legacy', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Supported transfer.',
      visualAction: 'Move the supported object.', durationSeconds: 8, sourceClaimIds: [claimId], animation: {
        objects: [{ id: 'source', kind: 'ellipse', x: 0.1, y: 0.1, width: 0.1, height: 0.1, color: 'teal', sourceClaimIds: [claimId] }],
        actions: [{ kind: 'translate', target: 'source', start: 0, end: 1, toX: 0.5, toY: 0.1, meaning: 'Supported transfer', basis: { claimId, quote: 'The source transfers energy to the receiver.' } }] } })) };
    const parent = { id: parentId, researchObjectId: roId, versionId, kind: 'interactive_html', status: 'approved', deletedAt: null as Date | null,
      contentHash: '1'.repeat(64), sourceClaims: [{ claimId }], provenance: { subtype: 'sourced_storyboard',
        storyboardSettings: { locale: 'zh', style: 'ink', instruction: 'Explain', output: 'video' }, storyboardDocument } };
    const frames = storyboardDocument.scenes.map((_, sceneIndex) => ({ id: uuid(20 + sceneIndex), researchObjectId: roId, versionId, kind: 'image',
      status: 'approved', deletedAt: null as Date | null, contentHash: '2'.repeat(64), sourceClaims: [{ claimId }],
      provenance: { subtype: 'storyboard_scene_image', sceneImage: { storyboardAssetId: parentId, sceneIndex }, parentIdentity: parentIdentity(parent) } }));
    const evidence = [{ id: uuid(7), claimId, contentHash: ONCHIP_SOURCE_CONTENT_HASH, artifactId, updatedAt: now }];
    const prisma = { presentationAsset: { findUnique: async () => parent, findMany: async () => frames }, evidenceRecord: { findMany: async () => evidence },
      claimNode: { findMany: async () => [{ id: claimId, statement: 'The source transfers energy to the receiver.', updatedAt: now }] } };
    const input = { researchObjectId: roId, versionId, sourceClaimIds: [claimId], video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parentId, sceneImageAssetIds: frames.map(frame => frame.id) } };
    return { prisma, parent, frames, evidence, input };
  }

  it('accepts the unchanged approved animation route with the original three DB delegates', async () => {
    const f = legacyFixture();
    const parents = await requireVideoGenerationParents(f.prisma as never, f.input);
    expect(parents?.orderedImages).toEqual(f.frames);
    expect(parents?.identity).toBe(JSON.stringify({ profile: CONTENT_DRIVEN_PROFILE, storyboard: parentIdentity(f.parent),
      images: f.frames.map(asset => ({ id: asset.id, contentHash: asset.contentHash, provenance: asset.provenance })),
      sourceEvidence: f.evidence, sourceClaims: [{ id: claimId, updatedAt: now }] }));
  });

  it('keeps the legacy English video rejection', async () => {
    const f = legacyFixture();
    f.parent.provenance.storyboardSettings.locale = 'en';
    f.frames.forEach(frame => { frame.provenance.parentIdentity = parentIdentity(f.parent); });
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it.each(['draft-parent', 'draft-frame', 'animation', 'evidence', 'order', 'parent-identity'])('keeps the legacy %s rejection', async change => {
    const f = legacyFixture();
    if (change === 'draft-parent') f.parent.status = 'draft';
    if (change === 'draft-frame') f.frames[0]!.status = 'draft';
    if (change === 'animation') delete record(f.parent.provenance.storyboardDocument.scenes[0]).animation;
    if (change === 'evidence') f.evidence.length = 0;
    if (change === 'order') f.input.video.sceneImageAssetIds.reverse();
    if (change === 'parent-identity') f.frames[0]!.provenance.parentIdentity = 'changed';
    await expect(requireVideoGenerationParents(f.prisma as never, f.input)).rejects.toThrow();
  });

  it('keeps the approved five-scene on-chip route independent of native task readers', async () => {
    const f = legacyFixture();
    f.parent.provenance.storyboardDocument.scenes = Array.from({ length: 5 }, () => structuredClone(f.parent.provenance.storyboardDocument.scenes[0]!));
    f.frames.push(...[3, 4].map(sceneIndex => ({ ...structuredClone(f.frames[0]!), id: uuid(20 + sceneIndex),
      provenance: { ...structuredClone(f.frames[0]!.provenance), sceneImage: { storyboardAssetId: parentId, sceneIndex }, parentIdentity: parentIdentity(f.parent) } })));
    f.frames.forEach(frame => { frame.provenance.parentIdentity = parentIdentity(f.parent); });
    const video = { profile: ONCHIP_FIELD_SAMPLING_PROFILE, storyboardAssetId: parentId, sceneImageAssetIds: f.frames.map(frame => frame.id) as [string, string, string, string, string], sceneRoles: ONCHIP_SCENE_ROLES };
    const parents = await requireVideoGenerationParents(f.prisma as never, { ...f.input, video });
    expect(parents?.orderedImages).toEqual(f.frames);
    expect(parents?.identity).toBe(JSON.stringify({ profile: ONCHIP_FIELD_SAMPLING_PROFILE, storyboard: parentIdentity(f.parent),
      images: f.frames.map(asset => ({ id: asset.id, contentHash: asset.contentHash, provenance: asset.provenance })), sourceContentHash: ONCHIP_SOURCE_CONTENT_HASH }));
  });
});
