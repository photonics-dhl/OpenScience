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
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, storage: {} as StorageAdapter });
  apps.push(app);
  return { app, db, cookies: { openscience_session: token } };
}

describe('Hermes research run API contract', () => {
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
});
