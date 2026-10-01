import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createAgentSession, submitAgentTask, markTaskProgress, projectAgentTaskResult, retryAgentTask } from '../../src/agent/agent';
import { readStoredGeneratedImageReview, requireSceneImageParent, requireSceneImageRevision } from '../../src/assets/scene-image';
import { startNativeImageReview, completeNativeImageReview } from '../../src/assets/native-image-review';
import { initialNativeImageReviewResult } from '../../src/assets/scene-image';

const review = (requestId = 'native-task') => ({ stage: 'generated-image', requestId, contentHash: 'a'.repeat(64),
  sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'exact-approved-parent', promptHash: 'c'.repeat(64),
  responseHash: 'd'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', decision: 'accepted',
  summary: 'The actual axes and arrows agree with the approved science.', repairInstruction: null });
const identity = (requestId = 'native-task') => ({ requestId, contentHash: 'a'.repeat(64),
  sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'exact-approved-parent' });
const completed = (requestId = 'native-task') => ({ mode: 'model-native', state: 'completed', executionAttempt: 1,
  ...identity(requestId), promptHash: 'c'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', review: review(requestId) });

async function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'native-review-user' });
  db.workspaces.push({ id: 'native-ws', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'native-member', workspaceId: 'native-ws', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.usageLedger.push({ id: 'native-credit', userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant', createdAt: new Date() });
  const deps = { prisma, mailer: {} as never, redis: { lpush: async () => 1 } } as never;
  const ro = await createResearchObject(deps, { workspaceId: 'native-ws', userId: user.id, title: 'Native review' });
  const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'visualization' });
  const payload = { schemaVersion: 1, researchObjectId: ro.id, versionId: '11111111-1111-4111-8111-111111111111',
    kind: 'image', sourceClaimIds: ['22222222-2222-4222-8222-222222222222'],
    sceneImage: { storyboardAssetId: '33333333-3333-4333-8333-333333333333', sceneIndex: 0 } };
  const input = { userId: user.id, sessionId: session.id, kind: 'presentation.generate' as const, payload,
    idempotencyKey: 'native-image-intent', dispatch: false };
  const task = await submitAgentTask(deps, input);
  const row = db.agentTasks.find(candidate => candidate.id === task.id)!;
  return { deps, db, input, task, row, prisma };
}

describe('server-owned native image review role', () => {
  it.each(['valid', 'missing', 'started', 'changed'])('binds the actual rejected-image correction path to the %s native checkpoint', async change => {
    const f = await fixture(); const payload = f.input.payload;
    const parentId = payload.sceneImage.storyboardAssetId;
    await f.prisma.presentationAsset.create({ data: { id: parentId, kind: 'interactive_html', status: 'approved', deletedAt: null,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, contentHash: 'e'.repeat(64), provenance: {
        subtype: 'sourced_storyboard', sourceEvidenceIdentity: 'b'.repeat(64),
        storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain', output: 'image' },
        storyboardDocument: { schemaVersion: 1, title: 'Field', scenes: [{ title: 'Field', narration: 'Along x.',
          visualAction: 'Arrow along x.', sourceClaimIds: payload.sourceClaimIds }] } } } as never });
    f.db.presentationAssetClaims.push({ presentationAssetId: parentId, claimId: payload.sourceClaimIds[0] });
    const parent = (await requireSceneImageParent(f.prisma, payload))!;
    const answer = { ...review(f.task.id), parentIdentity: parent.identity, decision: 'blocked', repairInstruction: 'Point the arrow along x.' };
    const proof = { ...completed(f.task.id), parentIdentity: parent.identity, review: answer } as Record<string, unknown>;
    if (change === 'started') { proof.state = 'started'; delete proof.review; }
    if (change === 'changed') proof.promptHash = 'f'.repeat(64);
    Object.assign(f.row, { status: 'succeeded', result: change === 'missing' ? null : { nativeImageReview: proof },
      payload: { ...payload, hermesRunAuthority: { runId: 'run', profile: 'visual-narrative-v1' } } });
    await f.prisma.presentationAsset.create({ data: { id: f.task.id, kind: 'image', status: 'rejected', deletedAt: null,
      researchObjectId: payload.researchObjectId, versionId: payload.versionId, contentHash: 'a'.repeat(64),
      provenance: { subtype: 'storyboard_scene_image', sceneImage: payload.sceneImage, parentIdentity: parent.identity, imageReview: answer } } as never });
    f.db.presentationAssetClaims.push({ presentationAssetId: f.task.id, claimId: payload.sourceClaimIds[0] });
    const input = { ...payload, sceneImage: { ...payload.sceneImage, revisionAssetId: f.task.id },
      hermesRunAuthority: { runId: 'run', profile: 'visual-narrative-v1' } };
    if (change === 'valid') await expect(requireSceneImageRevision(f.prisma, input)).resolves.toEqual({ assetId: f.task.id, repairInstruction: answer.repairInstruction });
    else await expect(requireSceneImageRevision(f.prisma, input)).rejects.toThrow();
  });
  it.each(['not_started', 'started', 'completed'])('never erases the %s role through generic manual retry', async state => {
    const f = await fixture(); Object.assign(f.row, { status: 'failed', error: 'connection closed', executionAttempt: 1 });
    const checkpoint = state === 'not_started' ? { mode: 'model-native', state } : completed(f.task.id) as Record<string, unknown>;
    if (state === 'started') { checkpoint.state = 'started'; delete checkpoint.review; }
    f.row.result = { nativeImageReview: checkpoint };
    if (state === 'started') await expect(retryAgentTask(f.deps, { taskId: f.task.id, userId: f.input.userId })).rejects.toThrow();
    else await retryAgentTask(f.deps, { taskId: f.task.id, userId: f.input.userId });
    expect(f.db.agentTasks[0].result).toEqual({ nativeImageReview: checkpoint });
  });
  it('starts once under the exact execution lease and keeps uncertainty across a new lease', async () => {
    const f = await fixture(); Object.assign(f.row, { status: 'running', executionAttempt: 1 });
    const input = { taskId: f.task.id, executionAttempt: 1, identity: identity(f.task.id),
      target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'c'.repeat(64) } };
    await startNativeImageReview(f.prisma, input);
    await expect(startNativeImageReview(f.prisma, input)).rejects.toThrow();
    f.row.executionAttempt = 2;
    await expect(startNativeImageReview(f.prisma, { ...input, executionAttempt: 2 })).rejects.toThrow();
    expect(f.row.result).toMatchObject({ nativeImageReview: { state: 'started', executionAttempt: 1 } });
  });

  it.each(['lease', 'image', 'source', 'provider', 'prompt'])('refuses completed review when %s changed', async change => {
    const f = await fixture(); Object.assign(f.row, { status: 'running', executionAttempt: 1 });
    const saved = completed(f.task.id) as Record<string, unknown>; saved.state = 'started'; delete saved.review;
    f.row.result = { nativeImageReview: saved };
    const answer = review(f.task.id);
    if (change === 'lease') f.row.executionAttempt = 2;
    if (change === 'image') answer.contentHash = 'e'.repeat(64);
    if (change === 'source') answer.sourceEvidenceIdentity = 'e'.repeat(64);
    if (change === 'provider') answer.provider = 'minimax-key-2-model-1';
    if (change === 'prompt') answer.promptHash = 'e'.repeat(64);
    await expect(completeNativeImageReview(f.prisma, { taskId: f.task.id, executionAttempt: 1, review: answer as never })).rejects.toThrow();
    expect(f.row.result).toEqual({ nativeImageReview: saved });
  });

  it('merges only the authoritative completed role into terminal success for the exact persisted image', async () => {
    const f = await fixture(); Object.assign(f.row, { status: 'running', executionAttempt: 1 });
    f.row.result = { nativeImageReview: completed(f.task.id) };
    await f.prisma.presentationAsset.create({ data: { id: f.task.id, kind: 'image', deletedAt: null,
      researchObjectId: f.input.payload.researchObjectId, versionId: f.input.payload.versionId, contentHash: 'a'.repeat(64),
      provenance: { source: 'approved_storyboard_scene', taskId: f.task.id, parentIdentity: 'exact-approved-parent',
        sourceEvidenceIdentity: 'b'.repeat(64), imageReview: review(f.task.id) } } as never });
    await markTaskProgress(f.deps, { taskId: f.task.id, status: 'succeeded', expectedExecutionAttempt: 1,
      result: { assetId: f.task.id, contentHash: 'a'.repeat(64), imageReview: review(f.task.id) } });
    expect(f.row.result).toMatchObject({ nativeImageReview: completed(f.task.id), imageReview: review(f.task.id) });
  });

  it('does not stamp a plan, video or explicit legacy image role', () => {
    const base = { schemaVersion: 1, kind: 'image', sceneImage: { storyboardAssetId: '33333333-3333-4333-8333-333333333333', sceneIndex: 0 } };
    expect(initialNativeImageReviewResult('presentation.generate', { ...base, kind: 'video' })).toBeUndefined();
    expect(initialNativeImageReviewResult('presentation.generate', { ...base, kind: 'interactive_html' })).toBeUndefined();
    expect(initialNativeImageReviewResult('presentation.generate', { ...base, hermesRunAuthority: { profile: 'content-driven-image-v1' } })).toBeUndefined();
  });
  it('mints a private not-started role only for a newly created scene-image task', async () => {
    const f = await fixture();
    expect(f.row.result).toEqual({ nativeImageReview: { mode: 'model-native', state: 'not_started' } });
    expect(f.task.result).toBeNull();
  });

  it('does not convert an exact historical replay or charge it again', async () => {
    const f = await fixture(); f.row.result = null;
    const ledger = structuredClone(f.db.usageLedger);
    expect(await submitAgentTask(f.deps, f.input)).toMatchObject({ id: f.task.id });
    expect(f.row.result).toBeNull(); expect(f.db.usageLedger).toEqual(ledger);
  });

  it('keeps the checkpoint out of the public result while retaining ordinary image fields', () => {
    expect(projectAgentTaskResult({ assetId: 'asset', nativeImageReview: completed() }, 'presentation.generate')).toEqual({ assetId: 'asset' });
  });

  it('accepts M3 only with the owning task completed checkpoint and exact saved review', () => {
    expect(readStoredGeneratedImageReview(review(), identity(), { nativeImageReview: completed() })).toEqual(review());
  });

  it.each(['missing', 'started', 'wrong-mode', 'wrong-image', 'wrong-source', 'wrong-parent', 'wrong-prompt', 'wrong-provider',
    'wrong-model', 'wrong-review', 'extra-field'])(
    'rejects a native receipt with %s ownership proof', change => {
      const checkpoint = completed();
      if (change === 'started') { (checkpoint as Record<string, unknown>).state = 'started'; delete (checkpoint as Record<string, unknown>).review; }
      if (change === 'wrong-mode') checkpoint.mode = 'web';
      if (change === 'wrong-image') checkpoint.contentHash = 'e'.repeat(64);
      if (change === 'wrong-source') checkpoint.sourceEvidenceIdentity = 'e'.repeat(64);
      if (change === 'wrong-parent') checkpoint.parentIdentity = 'other';
      if (change === 'wrong-prompt') checkpoint.promptHash = 'e'.repeat(64);
      if (change === 'wrong-provider') checkpoint.provider = 'minimax-key-2-model-1';
      if (change === 'wrong-model') checkpoint.model = 'MiniMax-M2.7';
      if (change === 'wrong-review') checkpoint.review.summary = 'Different response';
      if (change === 'extra-field') Object.assign(checkpoint, { bypass: true });
      expect(() => readStoredGeneratedImageReview(review(), identity(), change === 'missing' ? undefined : { nativeImageReview: checkpoint })).toThrow();
    });

  it('does not allow a native task to change to the historical Web provider', () => {
    const legacy = { ...review(), provider: 'chatgpt-web-science-review', model: 'chatgpt-web/5.6-sol' };
    expect(() => readStoredGeneratedImageReview(legacy, identity(), { nativeImageReview: completed() })).toThrow();
    expect(readStoredGeneratedImageReview(legacy, identity())).toEqual(legacy);
  });

  it('preserves a started checkpoint when a failed handler returns diagnostics', async () => {
    const f = await fixture(); Object.assign(f.row, { status: 'running', executionAttempt: 1 });
    const started = completed(f.task.id) as Record<string, unknown>; started.state = 'started'; delete started.review;
    f.row.result = { nativeImageReview: started };
    await markTaskProgress(f.deps, { taskId: f.task.id, status: 'failed', result: { diagnostic: 'provider outcome unknown' }, expectedExecutionAttempt: 1 });
    expect(f.db.agentTasks.find(row => row.id === f.task.id)!.result).toEqual({ diagnostic: 'provider outcome unknown', nativeImageReview: started });
  });

  it('rejects terminal success before the submitted call has a completed checkpoint', async () => {
    const f = await fixture(); Object.assign(f.row, { status: 'running', executionAttempt: 1 });
    const started = completed(f.task.id) as Record<string, unknown>; started.state = 'started'; delete started.review;
    f.row.result = { nativeImageReview: started };
    await expect(markTaskProgress(f.deps, { taskId: f.task.id, status: 'succeeded',
      result: { assetId: f.task.id, contentHash: 'a'.repeat(64), imageReview: review(f.task.id) }, expectedExecutionAttempt: 1 })).rejects.toThrow();
    expect(f.db.agentTasks.find(row => row.id === f.task.id)!.status).toBe('running');
  });
});
