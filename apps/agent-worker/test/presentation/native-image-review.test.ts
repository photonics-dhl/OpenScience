import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../../../../packages/domain/test/helpers/fakes';
import { createAgentSession, submitAgentTask } from '../../../../packages/domain/src/agent/agent';
import { requireSceneImageParent } from '@openscience/domain';
import { AiGateway, AnthropicCompatProvider } from '@openscience/ai-gateway';
import { createNativeImageReviewSubmission } from '../../src/index';
import { createPresentationGenerationHandler, requireIllustrationReviewSubmission } from '../../src/presentation/handler';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');

async function fixture() {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: id(1), platformRole: 'platform_admin' });
  db.workspaces.push({ id: id(2), status: 'active' });
  db.memberships.push({ id: 'membership', userId: id(1), workspaceId: id(2), role: 'owner' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2), createdBy: id(1), status: 'draft', visibility: 'private' });
  db.commits.push({ id: id(9), branchId: id(10) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft', versionNo: 1, commitId: id(9), publicVersionId: null, createdAt: new Date() });
  db.claimNodes.push({ id: id(5), researchObjectId: id(3), versionId: id(4), kind: 'core', statement: 'The field points along x.',
    assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded' });
  const evidence = { id: id(6), claimId: id(5), researchObjectId: id(3), versionId: id(4), artifactId: id(7), contentHash: 'a'.repeat(64),
    exactQuote: 'The field points along x.', relation: 'supports', locator: { page: 1 }, extractionStatus: 'succeeded', updatedAt: new Date(), provenance: {} };
  db.evidenceRecords.push(evidence);
  db.artifacts.push({ id: id(7), workspaceId: id(2), blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  const { id: evidenceId, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance } = evidence;
  const evidenceIdentity = sha(JSON.stringify([{ id: evidenceId, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance }]));
  const parent = { id: id(8), researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', status: 'approved', contentHash: 'c'.repeat(64),
    provenance: { subtype: 'sourced_storyboard', sourceEvidenceIdentity: evidenceIdentity,
      storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain the field.', output: 'image' },
      storyboardDocument: { schemaVersion: 1, title: 'Field', scenes: [{ title: 'Field direction', narration: 'The field points along x.',
        visualAction: 'One arrow along x.', sourceClaimIds: [id(5)] }] } } };
  db.presentationAssets.push(parent); db.presentationAssetClaims.push({ presentationAssetId: id(8), claimId: id(5) });
  const deps = { prisma, redis: { lpush: async () => 1 }, mailer: {} as never,
    storage: { getObject: async () => ({ body: Readable.from([bytes]), size: bytes.length }) } };
  const session = await createAgentSession(deps as never, { userId: id(1), researchObjectId: id(3), kind: 'visualization' });
  const payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'image', sourceClaimIds: [id(5)],
    sceneImage: { storyboardAssetId: id(8), sceneIndex: 0 } };
  const submitted = await submitAgentTask(deps as never, { userId: id(1), sessionId: session.id, kind: 'presentation.generate', payload,
    idempotencyKey: 'native-review', dispatch: false });
  const owner = db.agentTasks.find(task => task.id === submitted.id)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
  const approvedParent = (await requireSceneImageParent(prisma, payload as never))!;
  const asset = { id: owner.id, researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', objectKey: 'saved.png', contentHash: sha(bytes),
    provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: owner.id, contentType: 'image/png',
      sceneImage: payload.sceneImage, sourceEvidenceIdentity: evidenceIdentity, parentIdentity: approvedParent.identity } };
  db.presentationAssets.push(asset); db.presentationAssetClaims.push({ presentationAssetId: owner.id, claimId: id(5) });
  // Add only Prisma methods that the shared fake does not provide, retaining its real transaction rollback and CAS.
  prisma.trashEntry = { findFirst: async () => null } as never;
  prisma.agentTask.findUniqueOrThrow = async args => (await prisma.agentTask.findUnique(args))!;
  prisma.presentationAsset.findUniqueOrThrow = async args => (await prisma.presentationAsset.findUnique(args))!;
  prisma.presentationAsset.update = async ({ where, data }) => {
    const row = db.presentationAssets.find(value => value.id === where.id)!; Object.assign(row, data); return row;
  };
  let activeTransactions = 0;
  const transact = prisma.$transaction.bind(prisma);
  prisma.$transaction = (async (...args: Parameters<typeof prisma.$transaction>) => {
    activeTransactions += 1;
    try { return await transact(...args); } finally { activeTransactions -= 1; }
  }) as typeof prisma.$transaction;
  const fetcher = vi.fn(async () => {
    expect(activeTransactions).toBe(0);
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'text', text: JSON.stringify({
    decision: 'accepted', summary: 'The actual field arrow points along x.', repairInstruction: null }) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  });
  const provider = new AnthropicCompatProvider('minimax-key-1-model-1', { apiKey: 'test', baseUrl: 'https://minimax.example', model: 'MiniMax-M3' }, fetcher as never);
  const gateway = new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: input => requireIllustrationReviewSubmission(prisma, input),
    nativeImageReviewSubmission: createNativeImageReviewSubmission(prisma, () => ({ taskId: owner.id, executionAttempt: owner.executionAttempt })) });
  const generateImage = vi.fn(); Object.assign(gateway, { generateImage });
  const handler = createPresentationGenerationHandler({ gateway });
  const task = () => ({ id: owner.id, executionAttempt: db.agentTasks.find(value => value.id === owner.id)!.executionAttempt,
    retryCount: 0, payload }) as never;
  return { prisma, db, deps, handler, task, owner, fetcher, generateImage, parent, asset };
}

describe('real Worker native image review persistence and replay', () => {
  it('saves the native review with its completed task checkpoint and replays without either paid call', async () => {
    const f = await fixture(); const first = await f.handler(f.deps as never, f.task());
    expect(first).toMatchObject({ imageReview: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', decision: 'accepted' } });
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('completed');
    expect(f.db.agentTasks[0].result.nativeImageReview.review).toEqual(f.asset.provenance.imageReview);
    f.db.agentTasks[0].executionAttempt = 2;
    expect(await f.handler(f.deps as never, f.task())).toEqual(first);
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.generateImage).not.toHaveBeenCalled();
  });

  it('keeps an uncertain started call and refuses resubmission after a Worker crash', async () => {
    const f = await fixture(); f.fetcher.mockRejectedValue(new Error('connection closed after acceptance'));
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('started');
    f.db.agentTasks[0].executionAttempt = 2;
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow(/another submission is forbidden/);
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.generateImage).not.toHaveBeenCalled();
  });

  it.each(['membership', 'parent', 'source', 'lease'])('stops completion if %s changes while the model runs', async change => {
    const f = await fixture(); const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async () => {
      if (change === 'membership') f.db.memberships[0].role = 'viewer';
      if (change === 'parent') f.parent.contentHash = 'e'.repeat(64);
      if (change === 'source') f.db.evidenceRecords[0].exactQuote = 'Changed evidence';
      if (change === 'lease') f.db.agentTasks[0].executionAttempt = 2;
      return original();
    });
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('started');
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
});
