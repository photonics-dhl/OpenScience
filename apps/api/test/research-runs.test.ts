import { afterEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const RO_ID = '00000000-0000-4000-8000-000000000100';
const INGESTION_ID = '00000000-0000-4000-8000-000000000200';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function fixture(role = 'author') {
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
  // The shared fake lacks this existing Prisma reader; keep its transaction rollback and real run writer.
  prisma.hermesResearchRun.findFirst = async args => {
    const where = args.where as { actorId?: string; researchObjectId?: string; profile?: string;
      generationSettings?: { equals: unknown }; steps?: { some: { stage: string; ingestionTaskId: string } } };
    const row = db.hermesResearchRuns.find(candidate => (!where.actorId || candidate.actorId === where.actorId)
      && (!where.researchObjectId || candidate.researchObjectId === where.researchObjectId) && (!where.profile || candidate.profile === where.profile)
      && (!where.generationSettings || candidate.generationSettings?.output === where.generationSettings.equals)
      && (!where.steps || db.hermesResearchSteps.some(step => step.runId === candidate.id
        && step.stage === where.steps!.some.stage && step.ingestionTaskId === where.steps!.some.ingestionTaskId)));
    return row ? prisma.hermesResearchRun.findUnique({ where: { id: row.id }, include: args.include }) : null;
  };
  prisma.hermesResearchRun.findUniqueOrThrow = async args => {
    const row = await prisma.hermesResearchRun.findUnique(args); if (!row) throw new Error('Missing API run fixture'); return row;
  };
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, storage: {} as StorageAdapter });
  const errors: Error[] = []; app.addHook('onError', async (_request, _reply, error) => { errors.push(error); });
  apps.push(app);
  return { app, db, errors, cookies: { openscience_session: token } };
}

describe('Hermes research run API contract', () => {
  it('binds an explicit video intent to the original nine-task grant and replays the same run', async () => {
    const { app, db, errors, cookies } = await fixture();
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
