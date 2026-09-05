import { presentationStoryboardView } from '@openscience/domain';
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

  it('wraps long English and Chinese without losing conditions or scientific qualifiers', () => {
    const statement = 'Numerical accuracy was 91.75% on 10,000 held-out images; experimental agreement was 88% on 50 selected examples. '.repeat(8);
    const chinese = '\u5149\u5b66\u5b9e\u9a8c\u7ed3\u679c\u4e0d\u4ee3\u8868\u5168\u90e8\u6d4b\u8bd5\u96c6'.repeat(20);
    const svg = generateClaimChartSvg([{ ...claims[0]!, statement, assessment: 'missing', conditions: [chinese], limitations: ['Selected successful examples only; not an unbiased MNIST accuracy estimate.'] }]).toString('utf8');
    const lines = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((match) => match[1]!);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.join(' ').replace(/\s/g, '')).toContain(statement.replace(/\s/g, ''));
    expect(lines.join('')).toContain(chinese);
    expect(lines.join(' ')).toContain('not an unbiased MNIST accuracy estimate.');
    expect(svg).toContain('Evidence not assessed');
    expect(svg).toContain('Research claims');
    expect(svg).toContain('not scientific evidence');
    expect(svg).not.toContain('Verified claims');
    expect(svg).not.toContain('…');
  });

  it('escapes injected markup in every display field and gives HTML truthful labels', () => {
    const payload = '<script>alert("x")</script>';
    const input = [{ ...claims[0]!, id: payload, statement: payload, assessment: 'missing', conditions: [payload], limitations: [payload] }];
    for (const output of [generateClaimChartSvg(input), generateClaimInteractiveHtml(input)]) {
      const source = output.toString('utf8');
      expect(source).not.toContain('<script>');
      expect(source).toContain('&lt;script&gt;');
      expect(source).toContain('Research claims');
      expect(source).toContain('Evidence not assessed');
      expect(source).toContain('not scientific evidence');
    }
  });

  it('rejects an oversized but valid claim set rather than clipping scientific qualifiers', () => {
    const oversized = Array.from({ length: 12 }, (_, i) => ({ ...claims[0]!, id: String(i), statement: '光'.repeat(4000), conditions: Array(100).fill('条'.repeat(500)), limitations: Array(100).fill('限'.repeat(500)) }));
    expect(() => generateClaimChartSvg(oversized)).toThrow('Select fewer claims');
    expect(() => generateClaimChartSvg([...oversized].reverse())).toThrow('Select fewer claims');
    const accepted = generateClaimChartSvg(Array.from({ length: 12 }, (_, i) => ({ ...claims[0]!, id: String(i), statement: '光'.repeat(300) }))).toString('utf8');
    const height = Number(accepted.match(/viewBox="0 0 1200 (\d+)"/)?.[1]);
    expect(height).toBeGreaterThan(3000);
    expect(height).toBeLessThanOrEqual(8192);
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

describe('sourced storyboard planning', () => {
    const settings = { locale: 'en' as const, style: 'technical' as const, instruction: 'Explain the scoped findings' };
    const document = () => ({ schemaVersion: 1, title: '<script>alert(1)</script>', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Signal < 2', visualAction: '<img src=x onerror=alert(1)>', durationSeconds: 8, sourceClaimIds: [CLAIM_A, CLAIM_B] })) });
    it('uses Gateway, preserves qualifiers, escapes output and saves a draft with truthful provenance', async () => {
        const ctx = authorityFixture();
        const completeStructured = vi.fn(async () => document());
        const task = { ...ctx.task, payload: { ...ctx.task.payload, kind: 'interactive_html', storyboard: settings } };
        await createPresentationGenerationHandler({ gateway: { completeStructured } as never })(ctx.deps as never, task);
        expect(JSON.stringify(completeStructured.mock.calls)).toContain('n=4');
        expect(JSON.stringify(completeStructured.mock.calls)).toContain('300 K');
        const html = ctx.putObject.mock.calls[0][1].toString();
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;script&gt;');
        expect(ctx.rows[0]).toMatchObject({ status: 'draft', generator: 'OpenScience Hermes storyboard planner', generatorVersion: '1', provenance: { subtype: 'sourced_storyboard', storyboardDocument: document() } });
    });
    it.each(['model', 'storage'])('rejects source edits during %s', async (phase) => {
        const ctx = authorityFixture();
        const completeStructured = vi.fn(async () => { if (phase === 'model')
            ctx.authority.statement = 'Changed'; return document(); });
        if (phase === 'storage')
            ctx.putObject.mockImplementation(async () => { ctx.authority.statement = 'Changed'; return { key: 'stored', size: 200, etag: 'stored' }; });
        await expect(createPresentationGenerationHandler({ gateway: { completeStructured } as never })(ctx.deps as never, { ...ctx.task, payload: { ...ctx.task.payload, kind: 'interactive_html', storyboard: settings } })).rejects.toThrow('source Claims changed');
        expect(ctx.rows).toHaveLength(0);
    });
    it.each(['model', 'storage'])('rejects base invalidation during %s', async (phase) => {
        const ctx = authorityFixture();
        const base = { id: CLAIM_A, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'draft', updatedAt: new Date(), contentHash: 'base', sourceClaims: [{ claimId: CLAIM_A }, { claimId: CLAIM_B }], provenance: { subtype: 'sourced_storyboard', storyboardSettings: settings, storyboardDocument: document() } };
        ctx.prisma.presentationAsset.findUnique = async ({ where }: any) => where.id === CLAIM_A ? base : null;
        const completeStructured = vi.fn(async () => { if (phase === 'model')
            base.status = 'rejected'; return document(); });
        if (phase === 'storage')
            ctx.putObject.mockImplementation(async () => { base.status = 'rejected'; return { key: 'stored', size: 200, etag: 'stored' }; });
        await expect(createPresentationGenerationHandler({ gateway: { completeStructured } as never })(ctx.deps as never, { ...ctx.task, payload: { ...ctx.task.payload, kind: 'interactive_html', storyboard: { ...settings, baseAssetId: CLAIM_A } } })).rejects.toThrow();
        expect(ctx.rows).toHaveLength(0);
    });
});


it.each(['already-approved', 'model', 'storage'])('creates an independent revision and replays without side effects when base approval occurs at %s', async phase => {
  const ctx = authorityFixture();
  const settings = { locale: 'en' as const, style: 'ink' as const, instruction: 'Explain the mechanism' };
  const baseDocument = { schemaVersion: 1, title: 'Original', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Finding with limits', visualAction: 'Wave meets detector', durationSeconds: 8, sourceClaimIds: [CLAIM_A, CLAIM_B] })) };
  const base = { id: CLAIM_A, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: phase === 'already-approved' ? 'approved' : 'draft', updatedAt: new Date(), contentHash: 'base-content', sourceClaims: [{ claimId: CLAIM_A }, { claimId: CLAIM_B }], provenance: { subtype: 'sourced_storyboard', storyboardSettings: settings, storyboardDocument: baseDocument } };
  const originalContent = JSON.stringify(base.provenance);
  ctx.prisma.presentationAsset.findUnique = async ({ where }: any) => where.id === base.id ? base : ctx.rows.find(row => row.id === where.id) ?? null;
  const joins = vi.fn(async () => ({ count: 2 }));
  ctx.prisma.presentationAssetClaim.createMany = joins;
  const record = vi.fn(async () => undefined);
  const approve = () => { base.status = 'approved'; base.updatedAt = new Date(base.updatedAt.getTime() + 1); };
  const revised = { ...baseDocument, title: 'Revised mechanism' };
  const completeStructured = vi.fn(async () => { if (phase === 'model') approve(); return revised; });
  if (phase === 'storage') ctx.putObject.mockImplementation(async () => { approve(); return { key: 'stored', size: 200, etag: 'stored' }; });
  const task = { ...ctx.task, payload: { ...ctx.task.payload, kind: 'interactive_html', storyboard: { ...settings, baseAssetId: base.id } } };
  const handler = createPresentationGenerationHandler({ gateway: { completeStructured } as never });
  const deps = { ...ctx.deps, audit: { record } };
  const first = await handler(deps as never, task);
  expect(await handler(deps as never, task)).toEqual(first);
  expect(base.status).toBe('approved');
  expect(JSON.stringify(base.provenance)).toBe(originalContent);
  expect(ctx.rows).toHaveLength(1);
  expect(ctx.rows[0]).toMatchObject({ id: TASK, status: 'draft' });
  expect(presentationStoryboardView(ctx.rows[0], [CLAIM_A, CLAIM_B])).toEqual({ document: revised, locale: 'en', style: 'ink', baseAssetId: base.id });
  expect(joins).toHaveBeenCalledWith({ data: [CLAIM_A, CLAIM_B].map(claimId => ({ presentationAssetId: TASK, claimId, researchObjectId: RO, versionId: VERSION })) });
  expect(completeStructured).toHaveBeenCalledTimes(1);
  expect(ctx.putObject).toHaveBeenCalledTimes(1);
  expect(joins).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledTimes(1);
});

const PARENT = '70000000-0000-4000-8000-000000000001';
function sceneHandlerFixture() {
  const ctx = authorityFixture();
  const parent = { id: PARENT, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'approved', contentHash: 'parent', sourceClaims: [CLAIM_A, CLAIM_B].map(claimId => ({claimId})), provenance: {subtype:'sourced_storyboard',storyboardSettings:{locale:'en',style:'ink',instruction:'Explain'},storyboardDocument:{schemaVersion:1,title:'Plan',scenes:Array.from({length:3},()=>({title:'Scene',narration:'Finding',visualAction:'Wave passing slit',durationSeconds:8,sourceClaimIds:[CLAIM_A,CLAIM_B]}))}}};
  ctx.prisma.presentationAsset.findUnique = async ({where}:any) => where.id === PARENT ? parent : ctx.rows[0] ?? null;
  ctx.prisma.user = { findUnique:async()=>({platformRole:'platform_admin'}) };
  const completeStructured = vi.fn(async()=>({prompt:'Ink illustration of wave passing slit; room temperature; limited sample. No text overlay. Illustration, not evidence.'}));
  const bytes = Buffer.alloc(64, 7);
  const generateImage = vi.fn(async()=>({bytes,contentType:'image/png' as const,model:'image-01',provider:'minimax',promptHash:'actual-prompt-hash'}));
  const task = {...ctx.task,payload:{...ctx.task.payload,kind:'image',sceneImage:{storyboardAssetId:PARENT,sceneIndex:1}}};
  const handler = createPresentationGenerationHandler({gateway:{completeStructured,generateImage} as never});
  return {...ctx,parent,task,handler,completeStructured,generateImage,bytes};
}
it('generates one real scene image with correct MIME extension and all parent Claim links, then replays without generation',async()=>{
  const ctx=sceneHandlerFixture();
  await ctx.handler(ctx.deps as never,ctx.task);
  expect(ctx.generateImage).toHaveBeenCalledTimes(1);
  expect(ctx.putObject).toHaveBeenCalledWith(expect.stringMatching(/\.png$/),ctx.bytes,expect.objectContaining({contentType:'image/png'}));
  expect(ctx.rows[0].provenance.sceneImage).toEqual(ctx.task.payload.sceneImage);
  expect(ctx.rows[0].generator).toContain('minimax');
  await ctx.handler(ctx.deps as never,ctx.task);
  expect(ctx.generateImage).toHaveBeenCalledTimes(1);
});
it.each(['draft','changed','rejected','claims','authority'])('blocks scene image persistence after %s source change',async change=>{
  const ctx=sceneHandlerFixture();
  ctx.putObject.mockImplementation(async()=>{
    if(change==='draft'||change==='rejected')ctx.parent.status=change;
    if(change==='changed')ctx.parent.contentHash='new';
    if(change==='claims')ctx.authority.statement='Changed';
    if(change==='authority')ctx.authority.role='viewer';
    return {key:'stored',size:64,etag:'stored'};
  });
  await expect(ctx.handler(ctx.deps as never,ctx.task)).rejects.toThrow();
  expect(ctx.rows).toHaveLength(0);
});
it('refuses uncertain paid replay with no saved asset before calling either model',async()=>{
  const ctx=sceneHandlerFixture();
  await expect(ctx.handler(ctx.deps as never,{...ctx.task,executionAttempt:2})).rejects.toThrow();
  expect(ctx.completeStructured).not.toHaveBeenCalled();
  expect(ctx.generateImage).not.toHaveBeenCalled();
});
it('blocks a changed parent after text planning before paid image generation',async()=>{
  const ctx=sceneHandlerFixture();
  ctx.completeStructured.mockImplementation(async()=>{ctx.parent.status='rejected';return {prompt:'Draw qualified wave as an illustration.'};});
  await expect(ctx.handler(ctx.deps as never,ctx.task)).rejects.toThrow();
  expect(ctx.generateImage).not.toHaveBeenCalled();
});
it('rejects oversized condensed prompts without silently truncating or invoking image provider',async()=>{
  const ctx=sceneHandlerFixture();
  ctx.completeStructured.mockResolvedValue({prompt:'x'.repeat(1501)});
  await expect(ctx.handler(ctx.deps as never,ctx.task)).rejects.toThrow();
  expect(ctx.generateImage).not.toHaveBeenCalled();
});

it('audits a generated scene image within its asset transaction using metadata only',async()=>{
  const ctx=sceneHandlerFixture();
  const record=vi.fn();
  await ctx.handler({...ctx.deps,audit:{record}} as never,ctx.task);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({action:'presentation_asset.generated',targetId:TASK,metadata:{taskId:TASK,researchObjectId:RO,versionId:VERSION,subtype:'storyboard_scene_image',storyboardAssetId:PARENT,sceneIndex:1,provider:'minimax',model:'image-01',contentHash:ctx.rows[0].contentHash}}),ctx.prisma);
  expect(record.mock.calls[0][0].metadata).not.toHaveProperty('parentIdentity');
  expect(record.mock.calls[0][0].metadata).not.toHaveProperty('prompt');
});
