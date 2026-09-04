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

describe('deterministic presentation generation', () => {
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
      agentTask: { findUnique: async () => ({
        id: TASK, kind: 'presentation.generate', status: 'running',
        session: { userId: USER, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } },
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
      agentTask: { findUnique: async () => ({ id: TASK, kind: 'presentation.generate', status: 'running', session: { userId: USER, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } } }) },
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
      agentTask: { findUnique: async () => ({ id: TASK, kind: 'presentation.generate', status: 'running', session: { userId: USER, researchObject: { id: RO, workspaceId: WORKSPACE, workspace: { status: 'active' } } } }) },
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
