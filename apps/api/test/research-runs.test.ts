import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const RO_ID = '00000000-0000-4000-8000-000000000100';
const INGESTION_ID = '00000000-0000-4000-8000-000000000200';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
type RunQuery = { where?: { actorId?: string; researchObjectId?: string; profile?: string;
  generationSettings?: { equals: unknown }; steps?: { some: { stage: string; ingestionTaskId: string } } };
  orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
  cursor?: { id: string }; skip?: number; take?: number };

async function fixture(role = 'author', video: Pick<Parameters<typeof buildApp>[0], 'videoEnabled' | 'readVideoReadiness' | 'readAudioAuditionReadiness'> = {}) {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const user = seedUser(db, { email: 'run@example.com', displayName: 'Run User' });
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  db.workspaces.push({ id: 'workspace', status: 'active', name: 'Study', type: 'team', ownerId: user.id });
  db.memberships.push({ id: 'membership', workspaceId: 'workspace', userId: user.id, role });
  db.researchObjects.push({ id: RO_ID, workspaceId: 'workspace', title: 'Draft', status: 'draft', version: 1 });
  db.ingestionBatches.push({ id: 'batch', userId: user.id, researchObjectId: RO_ID });
  db.artifacts.push({ id: 'artifact', workspaceId: 'workspace', logicalPath: 'paper.pdf' });
  db.agentTasks.push({ id: 'agent-task', status: 'running' });
  db.ingestionTasks.push({ id: INGESTION_ID, batchId: 'batch', artifactId: 'artifact', agentTaskId: 'agent-task', state: 'parsing', error: null });
  // Query the shared fake's durable rows, including ordering and cursor pages.
  // This reader deliberately has no output-intent selection behavior.
  const queryRows = (args: RunQuery) => {
    const where = args.where ?? {};
    const rows = db.hermesResearchRuns.filter(candidate => (!where.actorId || candidate.actorId === where.actorId)
      && (!where.researchObjectId || candidate.researchObjectId === where.researchObjectId) && (!where.profile || candidate.profile === where.profile)
      && (!where.generationSettings || candidate.generationSettings?.output === where.generationSettings.equals)
      && (!where.steps || db.hermesResearchSteps.some(step => step.runId === candidate.id
        && step.stage === where.steps!.some.stage && step.ingestionTaskId === where.steps!.some.ingestionTaskId)));
    rows.sort((left, right) => {
      for (const order of args.orderBy ?? []) {
        for (const [field, direction] of Object.entries(order)) {
          const a = field === 'createdAt' ? +left.createdAt : left.id, b = field === 'createdAt' ? +right.createdAt : right.id;
          if (a !== b) return (a < b ? -1 : 1) * (direction === 'asc' ? 1 : -1);
        }
      }
      return 0;
    });
    const offset = args.cursor ? rows.findIndex(row => row.id === args.cursor!.id) : 0;
    return offset < 0 ? [] : rows.slice(offset + (args.skip ?? 0), args.take === undefined ? undefined : offset + (args.skip ?? 0) + args.take);
  };
  prisma.hermesResearchRun.findFirst = async args => {
    const row = queryRows(args as RunQuery)[0];
    return row ? prisma.hermesResearchRun.findUnique({ where: { id: row.id }, include: args.include }) : null;
  };
  prisma.hermesResearchRun.findMany = async args => Promise.all(queryRows(args as RunQuery).map(row =>
    prisma.hermesResearchRun.findUnique({ where: { id: row.id }, include: args.include })));
  prisma.hermesResearchRun.findUniqueOrThrow = async args => {
    const row = await prisma.hermesResearchRun.findUnique(args); if (!row) throw new Error('Missing API run fixture'); return row;
  };
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false,
    storage: {} as StorageAdapter, ...video });
  const errors: Error[] = []; app.addHook('onError', async (_request, _reply, error) => { errors.push(error); });
  apps.push(app);
  return { app, db, errors, actorId: user.id, cookies: { openscience_session: token } };
}

const querySettings = { locale: 'en', style: 'scientific', instruction: 'Explain the reviewed paper.' };
function storedRun(f: Awaited<ReturnType<typeof fixture>>, generationSettings: unknown = querySettings,
  changes: { actorId?: string; researchObjectId?: string; ingestionTaskId?: string; profile?: string; status?: string; createdAt?: Date } = {}) {
  const id = `00000000-0000-4000-8000-${String(300 + f.db.hermesResearchRuns.length).padStart(12, '0')}`;
  const row = { id, actorId: changes.actorId ?? f.actorId, researchObjectId: changes.researchObjectId ?? RO_ID,
    versionId: '00000000-0000-4000-8000-000000000400', profile: changes.profile ?? 'visual-narrative-v1', maxAgentTasks: 9,
    generationSettings, sourceClaimIds: [], sourceReviewDigest: null, status: changes.status ?? 'succeeded', version: 7,
    error: null, idempotencyKey: `original-once-key:${id}`, requestDigest: `original-digest:${id}`,
    createdAt: changes.createdAt ?? new Date('2026-10-08T00:00:00Z'), updatedAt: new Date('2026-10-08T01:00:00Z') };
  f.db.hermesResearchRuns.push(row);
  f.db.hermesResearchSteps.push({ id: `source:${id}`, runId: id, stage: 'source_ingestion', ordinal: 0, status: 'succeeded',
    ingestionTaskId: changes.ingestionTaskId ?? INGESTION_ID, artifactId: 'artifact', agentTaskId: null, presentationAssetId: null, error: null });
  return row;
}

describe('Hermes research run API contract', () => {
  it('binds an explicit video intent to the original nine-task grant and replays the same run', async () => {
    const { app, db, errors, cookies } = await fixture('author', { videoEnabled: true, readVideoReadiness: async () => true });
    Object.assign(db.artifacts[0], { mimeType: 'application/pdf' }); Object.assign(db.agentTasks[0], { kind: 'sdf.extract' });
    const generation = { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'aged-academia',
      instruction: 'Explain this paper in a source-bound narrated video.', output: 'video' };
    const request = { method: 'POST' as const, url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
      headers: { 'idempotency-key': 'explicit-native-video' }, payload: { ingestionTaskIds: [INGESTION_ID], generation } };
    const first = await app.inject(request), replay = await app.inject(request);
    expect(first.statusCode, errors[0]?.stack ?? first.body).toBe(202); expect(replay.statusCode, replay.body).toBe(202);
    expect(replay.json().run.id).toBe(first.json().run.id);
    expect(db.hermesResearchRuns[0]).toMatchObject({ profile: 'visual-narrative-v1', maxAgentTasks: 9,
      generationSettings: { output: 'video', locale: 'en' } });
    const changed = await app.inject({ ...request, payload: { ingestionTaskIds: [INGESTION_ID], generation: {
      profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'aged-academia', instruction: generation.instruction } } });
    expect(changed.statusCode).toBe(409); expect(db.hermesResearchRuns).toHaveLength(1);
  });

  for (const [name, video] of [
    ['disabled', { videoEnabled: false, readVideoReadiness: async () => true }],
    ['closed', { videoEnabled: true, readVideoReadiness: async () => false }],
    ['missing', { videoEnabled: true }],
    ['unreadable', { videoEnabled: true, readVideoReadiness: async () => { throw new Error('local readiness read failed'); } }],
  ] as const) {
    it(`rejects a new video run before any task or debit when service is ${name}`, async () => {
      const { app, db, cookies } = await fixture('author', video);
      Object.assign(db.artifacts[0], { mimeType: 'application/pdf' }); Object.assign(db.agentTasks[0], { kind: 'sdf.extract' });
      const response = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
        headers: { 'idempotency-key': 'closed-native-video' }, payload: { ingestionTaskIds: [INGESTION_ID],
          generation: { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'scientific', instruction: 'Explain the paper.', output: 'video' } } });
      expect(response.statusCode, response.body).toBe(503);
      expect(response.json().error.code).toBe('VIDEO_UNAVAILABLE');
      expect(db.hermesResearchRuns).toHaveLength(0);
      expect(db.agentTasks).toHaveLength(1);
      expect(db.usageLedger).toHaveLength(0);
    });
  }

  it('reads dynamic video capability without creating a run or exposing executor configuration', async () => {
    let ready = true;
    const { app, db, cookies } = await fixture('author', { videoEnabled: true, readVideoReadiness: async () => ready });
    const url = `/research-objects/${RO_ID}/hermes-video-capability`;
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const available = await app.inject({ method: 'GET', url, cookies });
    expect(available.statusCode, available.body).toBe(200);
    expect(available.json()).toEqual({ canGenerateVideo: true, audioAudition: null });
    expect(available.headers['cache-control']).toContain('no-store');
    ready = false;
    expect((await app.inject({ method: 'GET', url, cookies })).json()).toEqual({ canGenerateVideo: false, audioAudition: null });
    expect(db.hermesResearchRuns).toHaveLength(0);
    expect(db.usageLedger).toHaveLength(0);
  });

  it('serves only a scoped admin audio preset while full-video generation is closed', async () => {
    const readAudioAuditionReadiness = vi.fn(async () => ({ audio: { provider: 'synclip' as const, voice: 'configured-voice', speed: 1 }, maxEstimatedCoins: 0.25 }));
    const { app, db, cookies } = await fixture('author', { videoEnabled: true, readVideoReadiness: async () => false, readAudioAuditionReadiness });
    const url = `/research-objects/${RO_ID}/hermes-video-capability`;
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url, cookies })).json()).toEqual({ canGenerateVideo: false, audioAudition: null });
    expect(readAudioAuditionReadiness).not.toHaveBeenCalled();
    db.users[0].platformRole = 'platform_admin';
    const response = await app.inject({ method: 'GET', url, cookies });
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toEqual({ canGenerateVideo: false, audioAudition: { audio: { provider: 'synclip', voice: 'configured-voice', speed: 1 } } });
    expect(readAudioAuditionReadiness).toHaveBeenCalledTimes(1);
    db.memberships[0].role = 'viewer';
    expect((await app.inject({ method: 'GET', url, cookies })).json()).toEqual({ canGenerateVideo: false, audioAudition: null });
    expect(readAudioAuditionReadiness).toHaveBeenCalledTimes(1);
    expect(db.hermesResearchRuns).toHaveLength(0); expect(db.usageLedger).toHaveLength(0);
  });

  it('preserves same-key run creation replay and read-only restore after video service closes', async () => {
    let ready = true;
    const { app, db, cookies } = await fixture('author', { videoEnabled: true, readVideoReadiness: async () => ready });
    Object.assign(db.artifacts[0], { mimeType: 'application/pdf' }); Object.assign(db.agentTasks[0], { kind: 'sdf.extract' });
    const request = { method: 'POST' as const, url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
      headers: { 'idempotency-key': 'restorable-video-run' }, payload: { ingestionTaskIds: [INGESTION_ID], generation: {
        profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'scientific', instruction: 'Explain the paper.', output: 'video' } } };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(202);
    ready = false;
    const replay = await app.inject(request);
    expect(replay.statusCode, replay.body).toBe(202);
    expect(replay.json().run.id).toBe(first.json().run.id);
    const restored = await app.inject({ method: 'GET', url: `${request.url}/${first.json().run.id}`, cookies });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json().run.id).toBe(first.json().run.id);
    expect(db.hermesResearchRuns).toHaveLength(1);
    expect(db.usageLedger).toHaveLength(0);
  });

  it('rejects expanded video grants and internal execution selectors at the API boundary', async () => {
    const { app, db, cookies } = await fixture();
    const generation = { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'aged-academia', instruction: 'Explain the paper.', output: 'video' };
    for (const altered of [{ ...generation, maxAgentTasks: 11 }, { ...generation, nativeVideo: true }, { ...generation, output: 'image' }]) {
      const response = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
        headers: { 'idempotency-key': 'invalid-video-intent' }, payload: { ingestionTaskIds: [INGESTION_ID], generation: altered } });
      expect(response.statusCode, response.body).toBe(400);
    }
    expect(db.hermesResearchRuns).toHaveLength(0);
  });

  it('projects the pending image-service handoff from the server-owned Native plan without exposing its private context', async () => {
    const { app, db, cookies } = await fixture();
    const response = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
      headers: { 'idempotency-key': 'native-plan-handoff' }, payload: { ingestionTaskIds: [INGESTION_ID] } });
    const run = db.hermesResearchRuns[0];
    Object.assign(run, { profile: 'visual-narrative-v1', status: 'awaiting_storyboard_review', maxAgentTasks: 9,
      generationSettings: { locale: 'en', style: 'aged-academia', instruction: 'Explain the paper.' } });
    db.agentTasks.push({ id: 'native-plan', kind: 'presentation.generate', status: 'succeeded', result: {
      nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-illustration', runtimeId: 'installed', skillCatalogueId: 'catalogue', model: 'MiniMax-M3' },
      nativeIllustrationContext: { private: 'source-context' }, illustrationPrompts: [{ prompt: 'private-image-prompt' }],
    } });
    db.hermesResearchSteps.push({ id: 'plan-step', runId: run.id, stage: 'storyboard', ordinal: 0,
      status: 'awaiting_approval', agentTaskId: 'native-plan', presentationAssetId: 'native-plan' });
    const read = await app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs/${response.json().run.id}`, cookies });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().run).toMatchObject({ status: 'awaiting_storyboard_review', generationHold: 'image-api-pending', canRetryGeneration: false });
    expect(read.body).not.toMatch(/source-context|private-image-prompt|nativeAgentExecution/);
    db.memberships.length = 0;
    expect((await app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs/${run.id}`, cookies })).statusCode).toBe(404);
  });
  it('requires a strict attach-existing-ingestion request and idempotency key', async () => {
    const { app, cookies } = await fixture();
    const missingKey = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies, payload: { ingestionTaskIds: [INGESTION_ID] } });
    expect(missingKey.statusCode).toBe(400);
    const unknown = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies, headers: { 'idempotency-key': 'run-key' }, payload: { ingestionTaskIds: [INGESTION_ID], prompt: 'generate everything' } });
    expect(unknown.statusCode).toBe(400);
  });

  it('creates a durable run for an authorized draft and replays it exactly', async () => {
    const { app, cookies } = await fixture();
    const request = { method: 'POST' as const, url: `/research-objects/${RO_ID}/hermes-runs`, cookies, headers: { 'idempotency-key': 'run-key' }, payload: { ingestionTaskIds: [INGESTION_ID] } };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    expect(first.statusCode).toBe(202);
    expect(replay.statusCode).toBe(202);
    expect(replay.json().run.id).toBe(first.json().run.id);
    expect(first.json().run).toMatchObject({ status: 'running', researchObjectId: RO_ID, steps: [{ ingestionTaskId: INGESTION_ID, status: 'waiting' }] });
    const read = await app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs/${first.json().run.id}`, cookies });
    expect(read.statusCode).toBe(200);
    expect(read.headers['cache-control']).toBe('private, no-store');
  });

  it('denies viewer creation and cross-user reads', async () => {
    const viewer = await fixture('viewer');
    const denied = await viewer.app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies: viewer.cookies, headers: { 'idempotency-key': 'run-key' }, payload: { ingestionTaskIds: [INGESTION_ID] } });
    expect(denied.statusCode).toBe(403);

    const owner = await fixture();
    const created = await owner.app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies: owner.cookies, headers: { 'idempotency-key': 'owner-key' }, payload: { ingestionTaskIds: [INGESTION_ID] } });
    owner.db.memberships.length = 0;
    const hidden = await owner.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs/${created.json().run.id}`, cookies: owner.cookies });
    expect(hidden.statusCode).toBe(404);
  });

  it('keeps the source-review generation grant fixed and rejects server-owned fields on create', async () => {
    const { app, cookies } = await fixture();
    const create = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
      headers: { 'idempotency-key': 'source-review-run' }, payload: { ingestionTaskIds: [INGESTION_ID], runId: RO_ID } });
    expect(create.statusCode).toBe(400);

    const validCreate = await app.inject({ method: 'POST', url: `/research-objects/${RO_ID}/hermes-runs`, cookies,
      headers: { 'idempotency-key': 'source-review-run' }, payload: { ingestionTaskIds: [INGESTION_ID] } });
    const response = await app.inject({ method: 'POST',
      url: `/research-objects/${RO_ID}/hermes-runs/${validCreate.json().run.id}/source-review`, cookies,
      headers: { 'idempotency-key': 'review-key' }, payload: {
        expectedVersion: 1, versionId: RO_ID,
        generationGrant: { profile: 'arbitrary-profile', maxAgentTasks: 7 }, reviews: [],
      } });
    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('existing Hermes run query output contract', () => {
  it('defaults to image and independently retrieves video in the same actor/RO/source scope', async () => {
    const f = await fixture();
    const image = storedRun(f), video = storedRun(f, { ...querySettings, output: 'video' });
    for (const changes of [{ actorId: RO_ID }, { researchObjectId: INGESTION_ID }, { ingestionTaskId: RO_ID }, { profile: 'content-driven-v1' }]) {
      storedRun(f, querySettings, changes); storedRun(f, { ...querySettings, output: 'video' }, changes);
    }
    storedRun(f, querySettings, { createdAt: new Date('2026-10-07T00:00:00Z') });
    const before = structuredClone(f.db.hermesResearchRuns);
    for (const [suffix, expected] of [['', image], ['&output=image', image], ['&output=video', video]] as const) {
      const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}${suffix}`, cookies: f.cookies });
      expect(read.statusCode, read.body).toBe(200);
      expect(read.json().run).toMatchObject({ id: expected.id, versionId: expected.versionId, maxAgentTasks: 9 });
      expect(read.headers['cache-control']).toBe('private, no-store');
    }
    expect(f.db.hermesResearchRuns).toEqual(before);
  });

  it.each([['missing output', querySettings], ['null settings', null], ['explicit image', { ...querySettings, output: 'image' }]])(
    'retrieves legacy image rows without a query output: %s', async (_label, generationSettings) => {
    const f = await fixture(), image = storedRun(f, generationSettings);
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}`, cookies: f.cookies });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json()).toMatchObject({ run: { id: image.id, generationSettings: generationSettings === null ? null : querySettings } });
  });

  it.each(['image', 'video'] as const)('retrieves an older %s after more than two pages of the other intent', async output => {
    const f = await fixture();
    const target = storedRun(f, output === 'video' ? { ...querySettings, output } : querySettings);
    for (let index = 0; index < 61; index++) storedRun(f, output === 'video' ? querySettings : { ...querySettings, output: 'video' });
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}&output=${output}`, cookies: f.cookies });
    expect(read.statusCode, read.body).toBe(200); expect(read.json().run.id).toBe(target.id);
  });

  it.each([['image', 'failed'], ['image', 'unknown'], ['video', 'failed'], ['video', 'unknown']] as const)(
    'returns the newest %s run even when its outcome is %s', async (output, status) => {
    const f = await fixture(), generationSettings = output === 'video' ? { ...querySettings, output } : querySettings;
    storedRun(f, generationSettings); const target = storedRun(f, generationSettings, { status });
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}&output=${output}`, cookies: f.cookies });
    expect(read.statusCode, read.body).toBe(200); expect(read.json().run).toMatchObject({ id: target.id, status });
  });

  it('returns the unchanged null response when no scoped run matches the requested intent', async () => {
    const f = await fixture(); storedRun(f, { ...querySettings, output: 'audio' });
    storedRun(f, querySettings, { ingestionTaskId: RO_ID });
    for (const suffix of ['', '&output=image', '&output=video']) {
      const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}${suffix}`, cookies: f.cookies });
      expect(read.statusCode, read.body).toBe(200); expect(read.json()).toEqual({ run: null });
    }
  });

  it.each(['audio', 'Video', '', 'video&output=image'])('rejects malformed query output %j with 400', async output => {
    const f = await fixture(); storedRun(f);
    const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}&output=${output}`, cookies: f.cookies });
    expect(read.statusCode).toBe(400);
  });

  it('keeps unauthenticated and lost-membership query boundaries at 401 and 404', async () => {
    const f = await fixture(); storedRun(f); storedRun(f, { ...querySettings, output: 'video' });
    for (const suffix of ['', '&output=image', '&output=video']) {
      const url = `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}${suffix}`;
      expect((await f.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
    f.db.memberships.length = 0;
    for (const suffix of ['', '&output=image', '&output=video']) {
      const read = await f.app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/hermes-runs?ingestionTaskId=${INGESTION_ID}${suffix}`, cookies: f.cookies });
      expect(read.statusCode, read.body).toBe(404);
    }
  });
});
