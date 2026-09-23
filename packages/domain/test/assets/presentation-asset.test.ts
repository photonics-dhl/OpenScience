import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import {
  parsePresentationGenerationPayload,
  listPresentationAssets,
  getPresentationTask,
  submitPresentationGeneration,
  submitExistingSceneImageReview,
  transitionPresentationAsset,
} from '../../src/assets/presentation-asset';

const USER = '10000000-0000-4000-8000-000000000001';
const WORKSPACE = '20000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const CLAIM = '50000000-0000-4000-8000-000000000001';
const ASSET = '60000000-0000-4000-8000-000000000001';

function fixture(platformRole = 'user') {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: USER, platformRole });
  db.workspaces.push({ id: WORKSPACE, status: 'active' });
  db.memberships.push({ id: 'membership', workspaceId: WORKSPACE, userId: USER, role: 'author' });
  db.researchObjects.push({ id: RO, workspaceId: WORKSPACE, createdBy: USER, status: 'draft', visibility: 'private' });
  db.versions.push({ id: VERSION, researchObjectId: RO, status: 'draft', versionNo: 1 });
  db.claimNodes.push({
    id: CLAIM, researchObjectId: RO, versionId: VERSION, kind: 'core', statement: 'Transfer completes in 43 fs.',
    assessment: 'supported', conditions: ['room temperature'], limitations: [], extractionStatus: 'succeeded',
  });
  db.usageLedger.push({ id: 'credit', userId: USER, resource: 'ai_credit', delta: 20, kind: 'grant', createdAt: new Date() });
  return { prisma, db, redis: { lpush: async () => 1 } };
}

describe('Presentation asset domain contract', () => {
  it.each(['pending', 'running', 'succeeded'])('reads the existing %s task DTO in its exact scope, including archived memberships', async (status) => {
    const ctx = fixture();
    const task = await submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'scoped-read' });
    ctx.db.agentTasks[0].status = status;
    ctx.db.workspaces[0].status = 'archived';
    const response = await getPresentationTask(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, taskId: task.id });
    expect(response).toMatchObject({ id: task.id, kind: 'presentation.generate', status });
    expect(response).not.toHaveProperty('researchObjectId');
    expect(response).not.toHaveProperty('payload');
  });

  it.each(['session-ro', 'payload-ro', 'payload-version', 'kind', 'creator', 'membership'])('rejects scoped task recovery with mismatched %s', async (mismatch) => {
    const ctx = fixture();
    const task = await submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'scoped-read' });
    if (mismatch === 'session-ro') ctx.db.agentSessions[0].researchObjectId = ASSET;
    if (mismatch === 'payload-ro') ctx.db.agentTasks[0].payload.researchObjectId = ASSET;
    if (mismatch === 'payload-version') ctx.db.agentTasks[0].payload.versionId = ASSET;
    if (mismatch === 'kind') ctx.db.agentTasks[0].kind = 'sdf.extract';
    if (mismatch === 'creator') ctx.db.agentSessions[0].userId = ASSET;
    if (mismatch === 'membership') ctx.db.memberships.length = 0;
    await expect(getPresentationTask(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, taskId: task.id })).rejects.toThrow();
  });

  it.each(['viewer', 'reviewer'])('keeps %s read-only for generation and approval', async (role) => {
    const ctx = fixture();
    ctx.db.memberships[0].role = role;
    const updatedAt = new Date();
    ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft', label: 'presentation_not_evidence', updatedAt });
    await expect(submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'read-only' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(transitionPresentationAsset(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(ctx.db.agentTasks).toHaveLength(0);
    expect(ctx.db.presentationAssets[0].status).toBe('draft');
    expect(await listPresentationAssets(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION })).toHaveLength(1);
  });

  it.each(['under_review', 'approved', 'published', 'revised'])('cannot generate or approve on immutable %s versions', async (status) => {
    const ctx = fixture();
    ctx.db.versions[0].status = status;
    const updatedAt = new Date();
    ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft', label: 'presentation_not_evidence', updatedAt });
    await expect(submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'immutable' })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    await expect(transitionPresentationAsset(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(ctx.db.presentationAssets[0].status).toBe('draft');
  });

  it('keeps archived assets readable while rejecting writes', async () => {
    const ctx = fixture();
    ctx.db.workspaces[0].status = 'archived';
    await expect(listPresentationAssets(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION })).resolves.toEqual([]);
    await expect(submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'archived' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not approve when publication wins the draft row fence', async () => {
    const ctx = fixture();
    const updatedAt = new Date();
    ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft', label: 'presentation_not_evidence', updatedAt });
    const update = ctx.prisma.version.updateMany;
    vi.spyOn(ctx.prisma.version, 'updateMany').mockImplementation(async (args) => {
      ctx.db.versions[0].status = 'published';
      return update(args);
    });
    await expect(transitionPresentationAsset(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(ctx.db.presentationAssets[0].status).toBe('draft');
  });

  it('canonicalizes exact-version source Claims and creates one replay-safe task', async () => {
    const ctx = fixture();
    const input = {
      userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart' as const,
      sourceClaimIds: [CLAIM], idempotencyKey: 'presentation-1',
    };

    const first = await submitPresentationGeneration(ctx as never, input);
    const replay = await submitPresentationGeneration(ctx as never, input);

    expect(first).toEqual(replay);
    expect(ctx.db.agentTasks).toHaveLength(1);
    expect(ctx.db.agentTasks[0]?.kind).toBe('presentation.generate');
    expect(ctx.db.agentTasks[0]?.payload).toEqual({
      schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM],
    });
    expect(ctx.db.usageLedger.filter((entry) => entry.resource === 'ai_credit' && entry.delta < 0)).toHaveLength(0);
  });

  it('rejects cross-version, unverified and non-admin media requests', async () => {
    const cross = fixture();
    cross.db.claimNodes[0].versionId = '40000000-0000-4000-8000-000000000099';
    await expect(submitPresentationGeneration(cross as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'cross',
    })).rejects.toMatchObject({ code: 'SOURCE_CLAIM_INVALID' });

    const unverified = fixture();
    unverified.db.claimNodes[0].extractionStatus = 'needs_review';
    await expect(submitPresentationGeneration(unverified as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', sourceClaimIds: [CLAIM], idempotencyKey: 'unverified',
    })).rejects.toMatchObject({ code: 'SOURCE_CLAIM_INVALID' });

    const media = fixture();
    await expect(submitPresentationGeneration(media as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'image', sourceClaimIds: [CLAIM], idempotencyKey: 'media',
    })).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });

    const revoked = fixture();
    revoked.db.memberships.length = 0;
    await expect(submitPresentationGeneration(revoked as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM], idempotencyKey: 'revoked',
    })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });

  it('parses only the durable schema and enforces draft terminal transitions with optimistic locking', async () => {
    expect(parsePresentationGenerationPayload({
      schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM],
    })).toEqual({ schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM] });
    expect(() => parsePresentationGenerationPayload({
      schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [], extra: true,
    })).toThrow(/payload/i);
    const internal = parsePresentationGenerationPayload({
      schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', sourceClaimIds: [CLAIM],
      storyboard: { locale: 'zh', style: 'technical', instruction: 'Five reviewed scenes' },
      hermesRunAuthority: { runId: ASSET, stage: 'storyboard', ordinal: 0, profile: 'onchip-field-sampling-v1' },
    });
    expect(internal.hermesRunAuthority).toEqual({ runId: ASSET, stage: 'storyboard', ordinal: 0, profile: 'onchip-field-sampling-v1' });
    expect(() => parsePresentationGenerationPayload({ ...internal,
      hermesRunAuthority: { ...internal.hermesRunAuthority, profile: 'arbitrary-profile' },
    })).toThrow(/authority/i);

    const ctx = fixture();
    const updatedAt = new Date('2026-09-05T00:00:00.000Z');
    ctx.db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft',
      label: 'presentation_not_evidence', updatedAt,
    });
    const approved = await transitionPresentationAsset(ctx as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET,
      status: 'approved', expectedUpdatedAt: updatedAt,
    });
    expect(approved.status).toBe('approved');
    await expect(transitionPresentationAsset(ctx as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET,
      status: 'rejected', expectedUpdatedAt: approved.updatedAt,
    })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const invalidLabel = fixture();
    invalidLabel.db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft', label: 'evidence', updatedAt,
    });
    await expect(transitionPresentationAsset(invalidLabel as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET,
      status: 'approved', expectedUpdatedAt: updatedAt,
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const stale = fixture();
    stale.db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft',
      label: 'presentation_not_evidence', updatedAt,
    });
    await expect(transitionPresentationAsset(stale as never, {
      userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET,
      status: 'approved', expectedUpdatedAt: new Date('2026-09-04T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
  });

  it('lets only the owning run actor review its exactly bound media asset', async () => {
    const ctx = fixture();
    const updatedAt = new Date('2026-09-08T00:00:00.000Z');
    ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'image',
      status: 'draft', label: 'presentation_not_evidence', provenance: {}, updatedAt });
    ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM, researchObjectId: RO, versionId: VERSION });
    ctx.db.hermesResearchRuns.push({ id: '70000000-0000-4000-8000-000000000001', actorId: USER,
      researchObjectId: RO, versionId: VERSION, profile: 'onchip-field-sampling-v1', maxAgentTasks: 7,
      sourceClaimIds: [CLAIM], status: 'awaiting_scene_images_review' });
    ctx.db.hermesResearchSteps.push({ id: 'step', runId: ctx.db.hermesResearchRuns[0].id, stage: 'scene_image',
      ordinal: 0, status: 'awaiting_approval', presentationAssetId: ASSET });
    await expect(transitionPresentationAsset(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION,
      assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).resolves.toMatchObject({ status: 'approved' });

    const denied = fixture();
    denied.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'image',
      status: 'draft', label: 'presentation_not_evidence', provenance: {}, updatedAt });
    denied.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM, researchObjectId: RO, versionId: VERSION });
    await expect(transitionPresentationAsset(denied as never, { userId: USER, researchObjectId: RO, versionId: VERSION,
      assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  it('lists only public metadata and exact source Claim identities', async () => {
    const ctx = fixture();
    const createdAt = new Date('2026-09-05T00:00:00.000Z');
    ctx.db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft',
      label: 'presentation_not_evidence', objectKey: 'private/key.svg', promptHash: 'private',
      contentHash: 'a'.repeat(64), generator: 'hermes-chart', generatorVersion: '1', createdAt, updatedAt: createdAt,
    });
    ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM, researchObjectId: RO, versionId: VERSION });

    const assets = await listPresentationAssets(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION });
    expect(assets).toEqual([expect.objectContaining({ id: ASSET, sourceClaimIds: [CLAIM] })]);
    expect(assets[0]).not.toHaveProperty('objectKey');
    expect(assets[0]).not.toHaveProperty('promptHash');
  });
});


it('reports media transition capability only for an admin with workspace write access', async () => {
  const ctx=fixture('user');
  ctx.db.presentationAssets.push({id:ASSET,researchObjectId:RO,versionId:VERSION,kind:'video',status:'draft',label:'presentation_not_evidence',updatedAt:new Date()});
  expect((await listPresentationAssets(ctx as never,{userId:USER,researchObjectId:RO,versionId:VERSION}))[0].canTransition).toBe(false);
  ctx.db.users[0].platformRole='platform_admin';
  expect((await listPresentationAssets(ctx as never,{userId:USER,researchObjectId:RO,versionId:VERSION}))[0].canTransition).toBe(true);
  ctx.db.memberships[0].role='viewer';
  expect((await listPresentationAssets(ctx as never,{userId:USER,researchObjectId:RO,versionId:VERSION}))[0].canTransition).toBe(false);
});

it('charges storyboard submissions once and blocks the free path', async () => {
    const ctx = fixture();
    const input = { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html' as const, sourceClaimIds: [CLAIM], storyboard: { locale: 'en' as const, style: 'technical' as const, instruction: 'Explain this finding' }, idempotencyKey: 'storyboard' };
    const first = await submitPresentationGeneration(ctx as never, input);
    expect((await submitPresentationGeneration(ctx as never, input)).id).toBe(first.id);
    expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(1);
    expect(ctx.db.usageLedger.find(row => row.delta < 0)?.delta).toBe(-1n);
    const { submitDeterministicPresentationTask } = await import('../../src/agent/agent');
    await expect(submitDeterministicPresentationTask(ctx as never, { sessionId: ctx.db.agentSessions[0].id, userId: USER, kind: 'presentation.generate', payload: ctx.db.agentTasks[0].payload, idempotencyKey: 'bypass' })).rejects.toThrow();
});
it.each(['foreign', 'version', 'rejected', 'legacy', 'malformed', 'claim-set'])('rejects an invalid %s revision base without charge', async (reason) => {
    const ctx = fixture();
    const document = { schemaVersion: 1, title: 'Plan', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Finding', visualAction: 'Wave', durationSeconds: 8, sourceClaimIds: [CLAIM] })) };
    const base = { id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'draft', provenance: { subtype: 'sourced_storyboard', storyboardDocument: document, storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain' } } };
    if (reason === 'foreign')
        base.researchObjectId = ASSET;
    if (reason === 'version')
        base.versionId = ASSET;
    if (reason === 'rejected')
        base.status = 'rejected';
    if (reason === 'legacy')
        base.provenance.subtype = 'legacy';
    if (reason === 'malformed')
        document.scenes = [];
    ctx.db.presentationAssets.push(base);
    ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: reason === 'claim-set' ? ASSET : CLAIM });
    await expect(submitPresentationGeneration(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', sourceClaimIds: [CLAIM], storyboard: { locale: 'en', style: 'ink', instruction: 'Revise', baseAssetId: ASSET }, idempotencyKey: 'invalid-base' })).rejects.toThrow();
    expect(ctx.db.agentTasks).toHaveLength(0);
    expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(0);
});

it.each([undefined, 'legacy'])('blocks planner-owned assets with invalid subtype %s from approval', async subtype => {
  const ctx = fixture();
  const updatedAt = new Date();
  ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'draft', label: 'presentation_not_evidence', generator: 'OpenScience Hermes storyboard planner', generatorVersion: '1', updatedAt, provenance: { subtype } });
  ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM });
  const assets = await listPresentationAssets(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION });
  expect(assets[0].canTransition).toBe(false);
  expect(assets[0].storyboard).toBeUndefined();
  await expect(transitionPresentationAsset(ctx as never, { userId: USER, researchObjectId: RO, versionId: VERSION, assetId: ASSET, status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(ctx.db.presentationAssets[0].status).toBe('draft');
});

function sceneFixture() {
  const ctx = fixture('platform_admin');
  const document = { schemaVersion: 1, title: 'Plan', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Finding', visualAction: 'Wave', durationSeconds: 8, sourceClaimIds: [CLAIM] })) };
  ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'approved', label: 'presentation_not_evidence', updatedAt: new Date(), contentHash: 'parent', provenance: { subtype: 'sourced_storyboard', storyboardDocument: document, storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain' } } });
  ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM });
  const input = { userId: USER, researchObjectId: RO, versionId: VERSION, kind: 'image' as const, sourceClaimIds: [CLAIM], sceneImage: { storyboardAssetId: ASSET, sceneIndex: 1 }, idempotencyKey: 'scene' };
  return { ...ctx, input };
}
it('starts one charged review-only task from an existing manual PNG without another render', async () => {
  const ctx = sceneFixture();
  const branchId = '80000000-0000-4000-8000-000000000001';
  const commitId = '90000000-0000-4000-8000-000000000001';
  ctx.db.commits.push({ id: commitId, branchId });
  ctx.db.versions[0].commitId = commitId;
  ctx.db.versions[0].commit = { branchId };
  ctx.db.versions[0].publicVersionId = null;
  ctx.db.versions[0].createdAt = new Date('2026-09-23T00:00:00Z');
  ctx.db.researchObjects[0].title = 'Reviewed image fixture';
  ctx.db.presentationAssets[0].provenance.sourceEvidenceIdentity = 'a'.repeat(64);
  ctx.prisma.presentationAsset.findFirst = async () => null;
  ctx.prisma.$executeRaw = async () => 1;
  ctx.prisma.$queryRaw = async () => [{ deleted_at: null }];
  const source = await submitPresentationGeneration(ctx as never, ctx.input);
  ctx.db.agentTasks[0].status = 'succeeded';
  const { requireSceneImageParent } = await import('../../src/assets/scene-image');
  const parent = await requireSceneImageParent(ctx.prisma, ctx.input);
  ctx.db.presentationAssets.push({ id: source.id, researchObjectId: RO, versionId: VERSION,
    kind: 'image', status: 'draft', label: 'presentation_not_evidence', updatedAt: new Date(),
    objectKey: 'private/review-source.png', contentHash: 'b'.repeat(64), generator: 'OpenScience scene image',
    provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: source.id,
      sceneImage: ctx.input.sceneImage, parentIdentity: parent!.identity,
      sourceEvidenceIdentity: 'a'.repeat(64), contentType: 'image/png' } });
  ctx.db.presentationAssetClaims.push({ presentationAssetId: source.id, claimId: CLAIM });
  const originalFindMany = ctx.prisma.presentationAsset.findMany;
  ctx.prisma.presentationAsset.findMany = async (args: any) => args.where?.provenance?.path?.[0] === 'reviewSourceAssetId'
    ? ctx.db.presentationAssets.filter(asset => asset.provenance?.reviewSourceAssetId === source.id)
    : originalFindMany(args);
  ctx.prisma.presentationAsset.findUniqueOrThrow = async ({ where }: any) => {
    const found = ctx.db.presentationAssets.find(asset => asset.id === where.id);
    if (!found) throw Error('NOT_FOUND');
    return { ...found, sourceClaims: ctx.db.presentationAssetClaims.filter(link => link.presentationAssetId === found.id) };
  };
  ctx.prisma.trashObjectCleanup = { updateMany: async () => ({ count: 0 }) };
  ctx.prisma.artifact.findMany = async () => [];
  const input = { userId: USER, researchObjectId: RO, versionId: VERSION, assetId: source.id, idempotencyKey: 'review-original-png' };
  const reviewed = await submitExistingSceneImageReview(ctx as never, input);
  expect(reviewed.id).not.toBe(source.id);
  expect(ctx.db.presentationAssets.find(asset => asset.id === reviewed.id)).toMatchObject({
    status: 'draft', objectKey: 'private/review-source.png', contentHash: 'b'.repeat(64),
    provenance: { reviewSourceAssetId: source.id, taskId: reviewed.id },
  });
  expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(2);
  expect((await submitExistingSceneImageReview(ctx as never, input)).id).toBe(reviewed.id);
  expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(2);
  await expect(submitExistingSceneImageReview(ctx as never, { ...input, idempotencyKey: 'duplicate-review' }))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(2);
});
it('submits one charged scene image with exact replay and narrow capability', async () => {
  const ctx = sceneFixture();
  const first = await submitPresentationGeneration(ctx as never, ctx.input);
  expect((await submitPresentationGeneration(ctx as never, ctx.input)).id).toBe(first.id);
  expect(ctx.db.agentTasks[0].payload.sceneImage).toEqual(ctx.input.sceneImage);
  expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(1);
  expect((await listPresentationAssets(ctx as never, ctx.input))[0].canGenerateSceneImage).toBe(true);
});
it.each(['draft', 'rejected', 'foreign', 'version', 'claim-set', 'index'])('blocks invalid scene parent %s before charging', async reason => {
  const ctx = sceneFixture();
  const parent = ctx.db.presentationAssets[0];
  if (reason === 'draft' || reason === 'rejected') parent.status = reason;
  if (reason === 'foreign') parent.researchObjectId = ASSET;
  if (reason === 'version') parent.versionId = ASSET;
  if (reason === 'claim-set') ctx.db.presentationAssetClaims[0].claimId = ASSET;
  if (reason === 'index') ctx.input.sceneImage.sceneIndex = 3;
  await expect(submitPresentationGeneration(ctx as never, ctx.input)).rejects.toThrow();
  expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(0);
});
it('strictly parses scene requests and forbids mixed modes', () => {
  const { input } = sceneFixture();
  const payload = {schemaVersion:1,researchObjectId:RO,versionId:VERSION,kind:'image',sourceClaimIds:[CLAIM],sceneImage:input.sceneImage};
  expect(parsePresentationGenerationPayload(payload)).toMatchObject({sceneImage:input.sceneImage});
  for (const change of [{kind:'chart'},{sceneImage:{...input.sceneImage,sceneIndex:0.5}},{sceneImage:{...input.sceneImage,extra:true}},{storyboard:{locale:'en',style:'ink',instruction:'x'}}]) expect(() => parsePresentationGenerationPayload({...payload,...change})).toThrow();
});

it('rejects an approved parent and atomically invalidates its draft and approved scene images', async () => {
  const ctx = sceneFixture();
  const {requireSceneImageParent} = await import('../../src/assets/scene-image');
  const parent = await requireSceneImageParent(ctx.prisma,ctx.input);
  const children = ['draft','approved'].map((status,i)=>({id:`70000000-0000-4000-8000-00000000000${i}`,researchObjectId:RO,versionId:VERSION,kind:'image',status,provenance:{subtype:'storyboard_scene_image',sceneImage:ctx.input.sceneImage,parentIdentity:parent!.identity}}));
  ctx.db.presentationAssets.push(...children);
  const original=ctx.prisma.presentationAsset.updateMany;
  ctx.prisma.presentationAsset.updateMany=async({where,data}: {where:{id:string | {in:string[]};status:{in:string[]}};data:{status:string}})=>{
    if(typeof where.id==='object') {const ids=where.id.in;const selected=ctx.db.presentationAssets.filter(row=>ids.includes(row.id)&&where.status.in.includes(row.status));selected.forEach(row=>Object.assign(row,data));return {count:selected.length};}
    return original({where,data});
  };
  const record=vi.fn();
  await transitionPresentationAsset({...ctx,audit:{record}} as never,{...ctx.input,assetId:ASSET,status:'rejected',expectedUpdatedAt:ctx.db.presentationAssets[0].updatedAt});
  expect(ctx.db.presentationAssets.map(row=>row.status)).toEqual(['rejected','rejected','rejected']);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({action:'presentation_asset.rejected',targetId:ASSET,metadata:expect.objectContaining({invalidatedSceneImageCount:2})}),expect.objectContaining({presentationAsset:ctx.prisma.presentationAsset}));
});
it.each(['parent-rejected','parent-changed','malformed'])('blocks scene approval and transition capability for %s', async reason=>{
  const ctx=sceneFixture();
  const {requireSceneImageParent}=await import('../../src/assets/scene-image');
  const parent=await requireSceneImageParent(ctx.prisma,ctx.input);
  const childId='70000000-0000-4000-8000-000000000001';
  const updatedAt=new Date();
  ctx.db.presentationAssets.push({id:childId,researchObjectId:RO,versionId:VERSION,kind:'image',status:'draft',label:'presentation_not_evidence',updatedAt,generator:'OpenScience Hermes scene image / minimax',provenance:reason==='malformed'?{}:{subtype:'storyboard_scene_image',sceneImage:ctx.input.sceneImage,parentIdentity:parent!.identity}});
  ctx.db.presentationAssetClaims.push({presentationAssetId:childId,claimId:CLAIM});
  if(reason==='parent-rejected')ctx.db.presentationAssets[0].status='rejected';
  if(reason==='parent-changed')ctx.db.presentationAssets[0].contentHash='changed';
  expect((await listPresentationAssets(ctx as never,ctx.input)).find(a=>a.id===childId)?.canTransition).toBe(false);
  await expect(transitionPresentationAsset(ctx as never,{...ctx.input,assetId:childId,status:'approved',expectedUpdatedAt:updatedAt})).rejects.toThrow();
});

it('blocks unreviewed narrative image approval while preserving rejection and legacy profiles', async () => {
  const ctx = sceneFixture();
  const branchId = '80000000-0000-4000-8000-000000000001';
  const commitId = '90000000-0000-4000-8000-000000000001';
  ctx.db.commits.push({ id: commitId, branchId });
  ctx.db.versions[0].commitId = commitId;
  ctx.db.versions[0].commit = { branchId };
  ctx.prisma.$executeRaw = async () => 1;
  ctx.prisma.$queryRaw = async () => [{ deleted_at: null }];
  vi.spyOn(ctx.prisma.presentationAsset, 'updateMany').mockImplementation(async () => {
    throw new Error('Scene image reached status update');
  });
  const { requireSceneImageParent } = await import('../../src/assets/scene-image');
  ctx.db.presentationAssets[0].provenance.sourceEvidenceIdentity = 'a'.repeat(64);
  const currentParent = await requireSceneImageParent(ctx.prisma, ctx.input);
  const childId = '70000000-0000-4000-8000-000000000001';
  const updatedAt = new Date();
  ctx.db.presentationAssets.push({ id: childId, researchObjectId: RO, versionId: VERSION,
    kind: 'image', status: 'draft', label: 'presentation_not_evidence', updatedAt,
    generator: 'OpenScience Hermes scene image / chatgpt-web', contentHash: 'b'.repeat(64),
    provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: childId, sceneImage: ctx.input.sceneImage,
      parentIdentity: currentParent!.identity, sourceEvidenceIdentity: 'a'.repeat(64) } });
  ctx.db.presentationAssetClaims.push({ presentationAssetId: childId, claimId: CLAIM });
  ctx.db.agentTasks.push({ id: childId, payload: { hermesRunAuthority: { profile: 'visual-narrative-v1' } } });

  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: false });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'rejected', expectedUpdatedAt: updatedAt })).rejects.toThrow('Scene image reached status update');
  expect(ctx.db.presentationAssets.at(-1)?.status).toBe('draft');
  const review = { stage: 'generated-image', requestId: childId, decision: 'blocked', summary: 'Wrong scale bar',
    repairInstruction: null, contentHash: 'b'.repeat(64), sourceEvidenceIdentity: 'a'.repeat(64),
    parentIdentity: currentParent!.identity, promptHash: 'c'.repeat(64), responseHash: 'd'.repeat(64),
    provider: 'chatgpt-web-science-review', model: 'ChatGPT 6 Pro' };
  ctx.db.presentationAssets.at(-1)!.provenance.imageReview = review;
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: false });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  ctx.db.presentationAssets.at(-1)!.provenance.imageReview = { ...review, decision: 'accepted', summary: 'Exact labels and scale verified', contentHash: 'e'.repeat(64) };
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: false });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  for (const [key, value] of [
    ['requestId', ASSET], ['parentIdentity', 'stale-parent'], ['sourceEvidenceIdentity', 'e'.repeat(64)],
  ] as const) {
    ctx.db.presentationAssets.at(-1)!.provenance.imageReview = {
      ...review, decision: 'accepted', summary: 'Exact labels and scale verified', [key]: value,
    };
    expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)?.canApprove).toBe(false);
    await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
      status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  ctx.db.presentationAssets.at(-1)!.provenance.imageReview = { ...review, decision: 'accepted', summary: 'Exact labels and scale verified' };
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: true });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toThrow('Scene image reached status update');
  ctx.db.presentationAssets.at(-1)!.provenance.imageReview = { ...review, decision: 'accepted',
    summary: 'Source-bound labels and scale verified', provider: 'codex-sol-image-review', model: 'gpt-5.6-sol' };
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)?.canApprove).toBe(true);
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toThrow('Scene image reached status update');
  ctx.db.presentationAssets.at(-1)!.provenance.imageReview = { ...review, decision: 'accepted',
    summary: 'False provider identity', provider: 'codex-sol-image-review', model: 'chatgpt-web/6-pro' };
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)?.canApprove).toBe(false);
  delete ctx.db.presentationAssets.at(-1)!.provenance.imageReview;
  ctx.db.presentationAssets.at(-1)!.provenance.pixelReviewRequired = 'generated-image-v1';
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: false });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  delete ctx.db.presentationAssets.at(-1)!.provenance.pixelReviewRequired;
  ctx.db.agentTasks[0].payload.hermesRunAuthority.profile = 'content-driven-image-v1';
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: true });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toThrow('Scene image reached status update');
  delete ctx.db.agentTasks[0].payload.hermesRunAuthority;
  expect((await listPresentationAssets(ctx as never, ctx.input)).find(asset => asset.id === childId)).toMatchObject({ canTransition: true, canApprove: false });
  await expect(transitionPresentationAsset(ctx as never, { ...ctx.input, assetId: childId,
    status: 'approved', expectedUpdatedAt: updatedAt })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
