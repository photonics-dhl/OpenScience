import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import * as domain from '@openscience/domain';
import * as zod from 'zod';
import { createSession } from '@openscience/auth';
import { plannedFixture, id, hash } from '../../../packages/domain/test/agent/first-image-continuation-fixture';
import { buildGuidePresentationContext } from '../../web/components/hermes/HermesAssistantDrawer';
import { buildApp } from '../src/app';
import { httpStatusForError } from '../src/error-map';
import * as sessionGuard from '../src/routes/session-guard';
import { createFakeRedis, createFakeMailer } from './helpers/fakes';

import { agentSessionBodySchema, agentTaskBodySchema } from '../src/routes/agent';

const selectedApps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(selectedApps.splice(0).map(app => app.close())); });

function publishedReaderSource(file: string) {
  return execFileSync('git', ['show', `2877a739d39f3b6fe304096b7c8a9ad01ee6b76c:${file}`],
    { cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8' });
}
function publishedReaderWriter() {
  const source = publishedReaderSource('apps/web/components/hermes/HermesAssistantDrawer.tsx');
  const ast = ts.createSourceFile('drawer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['legacyGuidePresentationContext', 'buildGuidePresentationContext'];
  const retained = names.map(name => {
    const node = ast.statements.find(value => ts.isFunctionDeclaration(value) && value.name?.text === name);
    if (!node) throw new Error(`Published reader function missing: ${name}`);
    return node.getText(ast);
  }).join('\n');
  const code = ts.transpileModule(retained, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { buildGuidePresentationContext: typeof buildGuidePresentationContext } };
  new Function('exports', code)(module.exports);
  return module.exports.buildGuidePresentationContext;
}
function publishedReaderRoutes() {
  const source = publishedReaderSource('apps/api/src/routes/agent.ts');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as typeof import('../src/routes/agent') };
  const imports: Record<string, unknown> = { '@openscience/domain': domain, zod, './session-guard': sessionGuard };
  new Function('require', 'exports', code)((name: string) => {
    if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected actual-route dependency: ${name}`);
    return imports[name];
  }, module.exports);
  return module.exports;
}
async function selectedApiFixture(writerStage: boolean) {
  const f = await plannedFixture();
  const parent = f.db.presentationAssets[0]; parent.status = 'approved';
  const sceneImage = { storyboardAssetId: parent.id, sceneIndex: 0 };
  const base = await domain.requireSceneImageParent(f.prisma, { researchObjectId: id(3), versionId: id(4), sourceClaimIds: [id(6)], sceneImage });
  const image = { id: id(55), researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', deletedAt: null,
    contentHash: hash, objectKey: 'private/selected.png', provenance: { subtype: 'storyboard_scene_image', contentType: 'image/png', sceneImage, parentIdentity: base!.identity } };
  f.db.presentationAssets.push(image); f.db.presentationAssetClaims.push({ presentationAssetId: image.id, claimId: id(6) });
  const redis = Object.assign(createFakeRedis(), { lpush: vi.fn(async () => 1) });
  const token = await createSession(redis, { userId: id(1), status: 'email_verified' });
  const deps = { ...f.deps, prisma: f.prisma, redis, audit: f.deps.audit!, mailer: createFakeMailer() };
  const session = await domain.createAgentSession(deps, { userId: id(1), researchObjectId: id(3), kind: 'workspace.guide' });
  let app: FastifyInstance;
  if (!writerStage) {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    app.setErrorHandler((error, request, reply) => { const mapped = httpStatusForError(error, String(request.id)); void reply.status(mapped.status).send(mapped.body); });
    publishedReaderRoutes().registerAgentRoutes(app, deps);
  } else app = await buildApp({ ...deps, cookieSecret: 'test-secret', secureCookies: false });
  selectedApps.push(app);
  const input = { actorId: id(1), goal: 'Make the left line clearer', presentation: { researchObjectId: id(3), versionId: id(4) },
    imageContext: { actorId: id(1), researchObjectId: id(3), versionId: id(4), selectedImageAssetId: image.id, images: [{ assetId: image.id, label: 'Relation' }] } };
  const projection = (writerStage ? buildGuidePresentationContext : publishedReaderWriter())(input);
  const payload = { goal: input.goal, locale: 'en', route: 'research-object-edit', target: null,
    context: { tasks: [], researchObjects: [], presentation: projection.presentation } };
  const body = { sessionId: session.id, kind: 'workspace.guide', payload };
  const send = (next = body) => app.inject({ method: 'POST', url: '/agent/tasks', cookies: { openscience_session: token },
    headers: { 'idempotency-key': 'selected-http-once' }, payload: next });
  return { ...f, app, image, body, send, redis, token };
}

describe('selected-image published reader and actual writer HTTP', () => {
  it('keeps actual R UI emission legacy and rejects a manual selected member before charge', async () => {
    const f = await selectedApiFixture(false);
    expect(f.body.payload.context.presentation).not.toHaveProperty('selectedImageAssetId');
    const tasks = f.db.agentTasks.length, ledger = f.db.usageLedger.length;
    const forged = { ...f.body, payload: { ...f.body.payload, context: { ...f.body.payload.context,
      presentation: { ...f.body.payload.context.presentation!, selectedImageAssetId: f.image.id } } } };
    expect((await f.send(forged)).statusCode).toBe(400);
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toHaveLength(ledger); expect(f.redis.lpush).not.toHaveBeenCalled();
    const created = await f.send(); expect(created.statusCode).toBe(201);
    expect(f.db.usageLedger).toHaveLength(ledger + 1);
    expect(f.db.usageLedger.filter(row => row.idempotencyKey === `agent-task-reserve:${created.json().task.id}`)).toHaveLength(1);
  });
  it('uses both actual W consumption points, charges once and replays exact accepted source after removal and null legacy context', async () => {
    const f = await selectedApiFixture(true);
    const ledger = f.db.usageLedger.length;
    expect(f.body.payload.context.presentation).toHaveProperty('selectedImageAssetId', f.image.id);
    const first = await f.send(); expect(first.statusCode, first.body).toBe(201);
    const task = first.json().task;
    expect(task.result.selectedImageReference).toMatchObject({ assetId: f.image.id, versionId: id(4) });
    const stored = f.db.agentTasks.find(row => row.id === task.id)!;
    stored.interestContext = null; f.image.deletedAt = new Date() as never;
    const replay = await f.send(); expect(replay.statusCode, replay.body).toBe(201); expect(replay.json().task.id).toBe(task.id);
    expect(stored.payload).toEqual(f.body.payload);
    expect(f.db.usageLedger).toHaveLength(ledger + 1);
    expect(f.db.usageLedger.filter(row => row.idempotencyKey === `agent-task-reserve:${task.id}`)).toHaveLength(1);
    expect(f.db.agentTasks.filter(row => row.idempotencyKey === 'selected-http-once')).toHaveLength(1);
  });
  it.each(['viewer', 'deleted', 'version', 'session-ro'])('denies W %s at actual auth/source code without task or debit', async change => {
    const f = await selectedApiFixture(true);
    if (change === 'viewer') f.db.memberships[0].role = 'viewer';
    if (change === 'deleted') f.image.deletedAt = new Date() as never;
    if (change === 'version') f.image.versionId = id(99);
    if (change === 'session-ro') f.db.agentSessions.find(row => row.id === f.body.sessionId)!.researchObjectId = id(99);
    const tasks = f.db.agentTasks.length, ledger = f.db.usageLedger.length;
    const response = await f.send(); expect(response.statusCode).toBe(change === 'viewer' ? 403 : 404);
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toHaveLength(ledger); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
});

const validGuide = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  kind: 'workspace.guide',
  payload: {
    goal: 'Help me organise this workspace',
    locale: 'en',
    route: 'dashboard',
    target: null,
    context: { tasks: [], researchObjects: [] },
  },
};

describe('agent task payload boundary', () => {
  it('preserves explicit first-image intent only on an exact saved research scope', () => {
    const request = { ...validGuide, payload: { ...validGuide.payload, goal: 'Generate one image explaining this paper.',
      route: 'research-object-edit', executionIntent: 'first-image', context: { tasks: [], researchObjects: [],
        presentation: { researchObjectId: validGuide.sessionId, versionId: '00000000-0000-4000-8000-000000000002' } } } };
    expect(agentTaskBodySchema.parse(request)).toEqual(request);
    for (const goal of ['Do not generate an image', 'How can I generate an image?', 'Only plan an image'])
      expect(() => agentTaskBodySchema.parse({ ...request, payload: { ...request.payload, goal } })).toThrow();
    expect(() => agentTaskBodySchema.parse({ ...request, payload: { ...request.payload, firstImageRun: { runId: 'forged' } } })).toThrow();
  });
  it('reserves internal task names from public session creation', () => {
    expect(() => agentSessionBodySchema.parse({ kind: 'search.index' })).toThrow();
    expect(agentSessionBodySchema.parse({ kind: 'extract' })).toEqual({ kind: 'extract' });
  });

  it('accepts the bounded workspace.guide contract', () => {
    expect(agentTaskBodySchema.parse(validGuide)).toEqual(validGuide);
    expect(agentTaskBodySchema.parse({
      ...validGuide,
      payload: {
        ...validGuide.payload,
        route: 'research-object-edit',
        context: { tasks: [], researchObjects: [], presentation: { researchObjectId: validGuide.sessionId } },
      },
    })).toMatchObject({ payload: { context: { presentation: { researchObjectId: validGuide.sessionId } } } });
    expect(agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: { versionId: validGuide.sessionId, coreText: 'Review this research object.' },
      currentGoal: 'Check the central claim',
      activeClaimId: '00000000-0000-4000-8000-000000000002',
    })).toMatchObject({ currentGoal: 'Check the central claim' });
  });

  it('requires the bounded review target contract at the public boundary', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: {},
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: { versionId: validGuide.sessionId, coreText: 'x'.repeat(8_001) },
    })).toThrow();
  });

  it('rejects client-supplied InterestContext and inferred traits', () => {
    expect(() => agentTaskBodySchema.parse({ ...validGuide, interestContext: { primaryIdentity: 'reviewer' } })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: {},
      offsiteHistory: ['example.org'],
    })).toThrow();
  });

  it('rejects oversized guide goals and context before persistence or dispatch', () => {
    expect(() => agentTaskBodySchema.parse({
      ...validGuide,
      payload: { ...validGuide.payload, goal: 'x'.repeat(2001) },
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      ...validGuide,
      payload: {
        ...validGuide.payload,
        context: { tasks: Array.from({ length: 21 }, (_, index) => ({ id: `t-${index}`, researchObjectId: 'ro', state: 'queued' })), researchObjects: [] },
      },
    })).toThrow();
  });

  it('reserves search.index for trusted server-side producers', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'search.index',
      payload: {},
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'not.registered',
      payload: {},
    })).toThrow();
  });

  it('reserves source retrieval for the unified literature acquisition endpoint', () => {
    expect(() => agentSessionBodySchema.parse({ kind: 'retrieval' })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'source.retrieve',
      payload: { query: 'ultrafast science', providers: ['semantic_scholar', 'tavily'], limit: 5 },
    })).toThrow();
  });

  it('reserves the durable retrieval marker from every public generic task payload', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'demo.echo',
      payload: { message: 'ordinary task', retryContractVersion: 1 },
    })).toThrow();
  });
});
