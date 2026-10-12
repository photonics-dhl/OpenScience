import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { createPresentationGenerationHandler } from '../../src/presentation/handler';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma transaction double exposes only the handler surface */

const TASK = '10000000-0000-4000-8000-000000000001';
const USER = '20000000-0000-4000-8000-000000000001';
const WORKSPACE = '30000000-0000-4000-8000-000000000001';
const RO = '40000000-0000-4000-8000-000000000001';
const VERSION = '50000000-0000-4000-8000-000000000001';
const CLAIM_A = '60000000-0000-4000-8000-000000000001';
const CLAIM_B = '60000000-0000-4000-8000-000000000002';
const PARENT = '70000000-0000-4000-8000-000000000001';
const claims = [
  { id: CLAIM_A, kind: 'core', statement: 'Transfer completes in 43 fs', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded' },
  { id: CLAIM_B, kind: 'supporting', statement: 'Signal < 2 & stable', assessment: 'supported', conditions: ['300 K'], limitations: ['n=4'], extractionStatus: 'succeeded' },
];

function fixture() {
  const rows: any[] = [];
  const evidence = claims.map(claim => ({ id: `e-${claim.id}`, claimId: claim.id, artifactId: 'artifact', contentHash: 'content', exactQuote: claim.statement,
    relation: null, locator: null, extractionStatus: 'succeeded', updatedAt: new Date(0), provenance: null }));
  const sourceEvidenceIdentity = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const parent = { id: PARENT, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'approved', contentHash: 'parent',
    sourceClaims: claims.map(claim => ({ claimId: claim.id })), provenance: { subtype: 'sourced_storyboard', sourceEvidenceIdentity,
      storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain', output: 'image' }, storyboardDocument: { schemaVersion: 1, title: 'Plan', scenes: [
        { title: 'Scene', narration: 'Finding', visualAction: 'Wave passing slit', sourceClaimIds: claims.map(claim => claim.id) },
      ] } } };
  const task = { id: TASK, executionAttempt: 1, retryCount: 0, payload: { schemaVersion: 1, researchObjectId: RO, versionId: VERSION,
    kind: 'image', sourceClaimIds: claims.map(claim => claim.id), sceneImage: { storyboardAssetId: PARENT, sceneIndex: 0 } } };
  const owner = { id: TASK, kind: 'presentation.generate', status: 'running', deletedAt: null, executionAttempt: 1, retryCount: 0, result: null,
    payload: task.payload, session: { userId: USER, researchObjectId: RO, status: 'active', deletedAt: null,
      researchObject: { id: RO, workspaceId: WORKSPACE, deletedAt: null, workspace: { status: 'active' } } } };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
  const putObject = vi.fn(async () => ({ key: 'stored', size: png.length, etag: 'stored' }));
  const reviewScientific = vi.fn(async (request: { prompt: string }) => {
    const text = JSON.stringify({ decision: 'accepted', summary: 'The saved image matches the approved scene.', repairInstruction: null });
    return { text, promptHash: createHash('sha256').update(request.prompt).digest('hex'), responseHash: createHash('sha256').update(text).digest('hex'),
      provider: 'chatgpt-web-science-review', model: 'gpt-5.6-sol' };
  });
  const prisma: any = {
    agentTask: { findUnique: async () => owner, findUniqueOrThrow: async () => owner },
    version: { findUnique: async () => ({ id: VERSION, researchObjectId: RO, versionNo: 1, createdAt: new Date(0), status: 'draft', publicVersionId: null,
      researchRecord: null, commit: { branchId: 'branch' }, researchObject: { id: RO, workspaceId: WORKSPACE, title: 'Test', originalDoi: null } }),
      findFirst: async () => ({ id: VERSION }), updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    workspace: { findUnique: async () => ({ id: WORKSPACE, status: 'active' }) },
    user: { findUnique: async () => ({ id: USER, platformRole: 'user' }) },
    researchObject: { findUnique: async () => ({ id: RO, workspaceId: WORKSPACE, createdBy: USER, deletedAt: null, title: 'Test', originalDoi: null }) },
    membership: { findUnique: async () => ({ userId: USER, workspaceId: WORKSPACE, role: 'author' }) },
    claimNode: { findMany: async () => claims }, evidenceRecord: { findMany: async () => evidence },
    presentationAsset: {
      findUnique: async ({ where }: any) => where.id === PARENT ? parent : (rows[0] ? { ...rows[0], sourceClaims: claims.map(claim => ({ claimId: claim.id })) } : null),
      findUniqueOrThrow: async ({ where }: any) => where.id === PARENT ? parent : rows[0],
      findMany: async () => rows.map(row => ({ ...row, sourceClaims: claims.map(claim => ({ claimId: claim.id })) })),
      create: async ({ data }: any) => { const row = { ...data, status: 'draft' }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find(item => item.id === where.id)!; Object.assign(row, data); return row; },
    },
    presentationAssetClaim: { createMany: async () => ({ count: claims.length }) }, trashObjectCleanup: { updateMany: async () => ({ count: 0 }) },
    trashEntry: { findFirst: async () => null }, author: { findMany: async () => [] }, licenseAssignment: { findMany: async () => [] },
    contribution: { findMany: async () => [] }, artifact: { findMany: async () => [{ id: 'artifact' }] },
    $executeRaw: async () => [], $queryRaw: async () => [{ deleted_at: null }],
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => { const size = rows.length; try { return await work(prisma); } catch (error) { rows.splice(size); throw error; } };
  const storage = { putObject, getObject: vi.fn(async () => ({ body: Readable.from(png), size: png.length })) };
  const generateImage = vi.fn(async () => ({ bytes: png, contentType: 'image/png' as const, model: 'image-01', provider: 'synclip', promptHash: 'prompt' }));
  const completeStructured = vi.fn(async () => ({ brief: 'A wavefront approaches a slit and spreads after it. Keep the direction explicit.' }));
  return { prisma, storage, rows, task, generateImage, reviewScientific, completeStructured, parent };
}

it('allows a normal author through the beta scene-image path and leaves a reviewed private draft', async () => {
  const ctx = fixture();
  const handler = createPresentationGenerationHandler({ gateway: { completeStructured: ctx.completeStructured, generateImage: ctx.generateImage, reviewScientific: ctx.reviewScientific } as never });
  await handler({ prisma: ctx.prisma, storage: ctx.storage, sceneImageEnabled: true } as never, ctx.task as never);
  expect(ctx.generateImage).toHaveBeenCalledOnce();
  expect(ctx.reviewScientific).toHaveBeenCalledOnce();
  expect(ctx.rows).toHaveLength(1);
  expect(ctx.rows[0]).toMatchObject({ status: 'draft', kind: 'image' });
});

