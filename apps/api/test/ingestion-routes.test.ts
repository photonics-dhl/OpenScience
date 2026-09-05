import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import type { StorageAdapter } from '@openscience/storage';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const RO_ID = '00000000-0000-4000-8000-000000000101';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const redis = createFakeRedis();
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, storage: {} as StorageAdapter });
  apps.push(app);
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  db.workspaces.push({ id: 'workspace', name: 'Study', type: 'team', status: 'active', ownerId: user.id });
  db.memberships.push({ id: 'member', workspaceId: 'workspace', userId: user.id, role: 'viewer' });
  db.researchObjects.push({ id: RO_ID, workspaceId: 'workspace', title: 'Shared study', version: 1 });
  db.ingestionBatches.push({ id: 'batch', userId: 'another-creator', researchObjectId: RO_ID });
  db.artifacts.push({ id: 'artifact', logicalPath: 'shared.pdf' });
  db.ingestionTasks.push({ id: 'task', batchId: 'batch', artifactId: 'artifact', state: 'needs_review', retryCount: 0, updatedAt: new Date() });
  return { app, db, cookies: { openscience_session: token } };
}

describe('GET /ingestion scoped actionable feed', () => {
  it('includes another creator task for an RO member without changing the default feed', async () => {
    const { app, cookies } = await fixture();
    const scoped = await app.inject({ method: 'GET', url: `/ingestion?actionable=true&researchObjectId=${RO_ID}`, cookies });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().tasks).toEqual([expect.objectContaining({ id: 'task', researchObjectId: RO_ID, logicalPath: 'shared.pdf' })]);
    const unscoped = await app.inject({ method: 'GET', url: '/ingestion?actionable=true', cookies });
    expect(unscoped.statusCode).toBe(200);
    expect(unscoped.json().tasks).toEqual([]);
  });

  it('rejects invalid research object ids', async () => {
    const { app, cookies } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/ingestion?actionable=true&researchObjectId=invalid', cookies });
    expect(response.statusCode).toBe(400);
  });

  it('rejects nonmembers without revealing research task data', async () => {
    const { app, db, cookies } = await fixture();
    db.memberships.length = 0;
    const response = await app.inject({ method: 'GET', url: `/ingestion?actionable=true&researchObjectId=${RO_ID}`, cookies });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('WORKSPACE_NOT_FOUND');
    expect(response.body).not.toContain('shared.pdf');
  });
});
