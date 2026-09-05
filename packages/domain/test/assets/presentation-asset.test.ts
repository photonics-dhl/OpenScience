import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import {
  parsePresentationGenerationPayload,
  listPresentationAssets,
  getPresentationTask,
  submitPresentationGeneration,
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
