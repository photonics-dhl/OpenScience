import { describe, expect, it, vi } from 'vitest';
import { generateClaimChartSvg } from '../../src/presentation/chart-generator';
import { generateClaimInteractiveHtml } from '../../src/presentation/interactive-html';
import { createPresentationGenerationHandler } from '../../src/presentation/handler';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma transaction doubles intentionally expose only the handler surface */

const TASK = '10000000-0000-4000-8000-000000000001';
const USER = '20000000-0000-4000-8000-000000000001';
const WORKSPACE = '30000000-0000-4000-8000-000000000001';
const RO = '40000000-0000-4000-8000-000000000001';
const VERSION = '50000000-0000-4000-8000-000000000001';
const CLAIM_A = '60000000-0000-4000-8000-000000000001';
const CLAIM_B = '60000000-0000-4000-8000-000000000002';

const claims = [
  { id: CLAIM_B, kind: 'supporting', statement: 'Signal < 2 & stable', assessment: 'supported', conditions: ['300 K'], limitations: ['n=4'], extractionStatus: 'succeeded' },
  { id: CLAIM_A, kind: 'core', statement: 'Transfer completes in 43 fs', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded' },
];

function scopeTables() {
  return {
    version: { findUnique: async () => ({ id: VERSION, researchObjectId: RO, status: 'draft', researchObject: { id: RO, workspaceId: WORKSPACE } }), updateMany: async () => ({ count: 1 }) },
    workspace: { findUnique: async () => ({ id: WORKSPACE, status: 'active' }) },
  };
}

function authorityFixture() {
  const authority = { role: 'author', version: 'draft', workspace: 'active', member: true, claimStatus: 'succeeded', statement: null as string | null };
  const rows: any[] = [];
  const prisma: any = {
    agentTask: { findUnique: async () => ({ id: TASK, kind: 'presentation.generate', status: 'running', session: { userId: USER, researchObjectId: RO, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: authority.workspace } } } }) },
    version: { findUnique: async () => ({ id: VERSION, researchObjectId: RO, status: authority.version, researchObject: { id: RO, workspaceId: WORKSPACE } }), updateMany: async ({ where }: any) => ({ count: authority.version === where.status ? 1 : 0 }) },
    workspace: { findUnique: async () => ({ id: WORKSPACE, status: authority.workspace }) },
    membership: { findUnique: async () => authority.member ? { userId: USER, workspaceId: WORKSPACE, role: authority.role } : null },
    claimNode: { findMany: async () => claims.map((claim) => ({ ...claim, statement: authority.statement ?? claim.statement, extractionStatus: authority.claimStatus })) },
    presentationAsset: { findUnique: async () => null, create: async ({ data }: any) => { const row = { ...data, status: 'draft' }; rows.push(row); return row; } },
    presentationAssetClaim: { createMany: async () => ({ count: 2 }) },
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const putObject = vi.fn(async () => ({ key: 'stored', size: 200, etag: 'stored' }));
  const task = { id: TASK, payload: { schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM_A, CLAIM_B] } };
  return { authority, rows, prisma, putObject, task, deps: { prisma, storage: { putObject } } };
}

describe('deterministic presentation generation', () => {
  it.each(['viewer', 'reviewer'])('blocks %s before generating or storing output', async (role) => {
    const ctx = authorityFixture();
    ctx.authority.role = role;
    await expect(createPresentationGenerationHandler()(ctx.deps as never, ctx.task)).rejects.toThrow();
    expect(ctx.putObject).not.toHaveBeenCalled();
    expect(ctx.rows).toHaveLength(0);
  });

  it.each(['published', 'revised'])('blocks immutable %s versions before storage', async (status) => {
    const ctx = authorityFixture();
    ctx.authority.version = status;
    await expect(createPresentationGenerationHandler()(ctx.deps as never, ctx.task)).rejects.toThrow();
    expect(ctx.putObject).not.toHaveBeenCalled();
  });

  it.each(['demoted', 'revoked', 'published', 'archived', 'claim-invalid', 'claim-edited'])('rejects completion when authority changes after rendering: %s', async (change) => {
    const ctx = authorityFixture();
    ctx.putObject.mockImplementation(async () => {
      if (change === 'demoted') ctx.authority.role = 'viewer';
      if (change === 'revoked') ctx.authority.member = false;
      if (change === 'published') ctx.authority.version = 'published';
      if (change === 'archived') ctx.authority.workspace = 'archived';
      if (change === 'claim-invalid') ctx.authority.claimStatus = 'failed';
      if (change === 'claim-edited') ctx.authority.statement = 'Revised conclusion with succeeded extraction status';
      return { key: 'stored', size: 200, etag: 'stored' };
    });
    await expect(createPresentationGenerationHandler()(ctx.deps as never, ctx.task)).rejects.toThrow();
    expect(ctx.rows).toHaveLength(0);
  });

  it('rejects completion when publication wins the version row fence after its scope read', async () => {
    const ctx = authorityFixture();
    ctx.prisma.version.updateMany = async () => { ctx.authority.version = 'published'; return { count: 0 }; };
    await expect(createPresentationGenerationHandler()(ctx.deps as never, ctx.task)).rejects.toThrow();
    expect(ctx.rows).toHaveLength(0);
  });

  it('does not persist media if platform-admin authority is revoked after the provider returned', async () => {
    const ctx = authorityFixture();
    let platformRole = 'platform_admin';
    ctx.prisma.user = { findUnique: async () => ({ platformRole }) };
    const generate = vi.fn(async () => ({ bytes: Buffer.alloc(64), contentType: 'image/webp', generator: 'configured-test', generatorVersion: '1', promptHash: null }));
    ctx.putObject.mockImplementation(async () => { platformRole = 'user'; return { key: 'stored', size: 64, etag: 'stored' }; });
    const handler = createPresentationGenerationHandler({ mediaGenerator: { generate } });
    await expect(handler(ctx.deps as never, { ...ctx.task, payload: { ...ctx.task.payload, kind: 'image' } })).rejects.toThrow(/platform administrator/);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(ctx.rows).toHaveLength(0);
  });

  it('produces byte-identical escaped SVG and no-script HTML for reordered Claims', () => {
    const svg = generateClaimChartSvg(claims);
    const html = generateClaimInteractiveHtml(claims);
    expect(generateClaimChartSvg([...claims].reverse())).toEqual(svg);
    expect(generateClaimInteractiveHtml([...claims].reverse())).toEqual(html);
    expect(svg.toString('utf8')).toContain('Signal &lt; 2 &amp; stable');
    expect(html.toString('utf8')).toContain('Signal &lt; 2 &amp; stable');
    expect(html.toString('utf8')).toContain("default-src 'none'");
    expect(html.toString('utf8')).not.toMatch(/<script|https?:\/\//i);
  });

  it('stores one content-addressed asset and reuses it on task replay', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const putObject = vi.fn(async (key: string, bytes: Buffer, opts: { sha256: string }) => ({ key, size: bytes.length, etag: opts.sha256 }));
    const prisma: any = {
      ...scopeTables(),
      agentTask: { findUnique: async () => ({
        id: TASK, kind: 'presentation.generate', status: 'running',
        session: { userId: USER, researchObjectId: RO, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } },
      }) },
      membership: { findUnique: async () => ({ userId: USER, workspaceId: WORKSPACE, role: 'author' }) },
      claimNode: { findMany: async () => claims },
      presentationAsset: {
        findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
        create: async ({ data }: any) => { const row = { id: '70000000-0000-4000-8000-000000000001', status: 'draft', ...data }; rows.push(row); return row; },
      },
      presentationAssetClaim: { createMany: vi.fn(async () => ({ count: 2 })) },
      $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
    };
    const handler = createPresentationGenerationHandler();
    const task = { id: TASK, payload: { schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'chart', sourceClaimIds: [CLAIM_B, CLAIM_A] } };

    const first = await handler({ prisma, storage: { putObject } } as never, task);
    const replay = await handler({ prisma, storage: { putObject } } as never, task);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({ kind: 'chart', status: 'draft', sourceClaimIds: [CLAIM_A, CLAIM_B], contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(putObject.mock.calls[0]?.[0]).toMatch(/^presentation\/40000000-0000-4000-8000-000000000001\/50000000-0000-4000-8000-000000000001\/[0-9a-f]{64}\.svg$/);
  });

  it('fails closed for generated image and video without a configured AI Gateway media capability', async () => {
    const handler = createPresentationGenerationHandler();
    const prisma: any = {
      ...scopeTables(),
      agentTask: { findUnique: async () => ({ id: TASK, kind: 'presentation.generate', status: 'running', session: { userId: USER, researchObjectId: RO, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } } }) },
      membership: { findUnique: async () => ({ userId: USER, workspaceId: WORKSPACE, role: 'author' }) },
      user: { findUnique: async () => ({ id: USER, platformRole: 'platform_admin' }) },
      claimNode: { findMany: async () => [claims[1]] },
      presentationAsset: { findUnique: async () => null },
    };
    await expect(handler({ prisma, storage: { putObject: vi.fn() } } as never, {
      id: TASK, payload: { schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'image', sourceClaimIds: [CLAIM_A] },
    })).rejects.toThrow(/media capability is disabled/i);
  });

  it('rechecks platform-admin authority in the worker before any media provider call', async () => {
    const generate = vi.fn();
    const handler = createPresentationGenerationHandler({ mediaGenerator: { generate } });
    const prisma: any = {
      ...scopeTables(),
      agentTask: { findUnique: async () => ({ id: TASK, kind: 'presentation.generate', status: 'running', session: { userId: USER, researchObjectId: RO, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } } }) },
      membership: { findUnique: async () => ({ userId: USER, workspaceId: WORKSPACE, role: 'author' }) },
      user: { findUnique: async () => ({ id: USER, platformRole: 'user' }) },
      claimNode: { findMany: async () => [claims[1]] },
      presentationAsset: { findUnique: async () => null },
    };
    await expect(handler({ prisma, storage: { putObject: vi.fn() } } as never, {
      id: TASK, payload: { schemaVersion: 1, researchObjectId: RO, versionId: VERSION, kind: 'image', sourceClaimIds: [CLAIM_A] },
    })).rejects.toThrow(/platform administrator/i);
    expect(generate).not.toHaveBeenCalled();
  });
});
