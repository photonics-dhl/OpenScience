import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { confirmIngestionTask, persistDocumentSourceMapReference } from '@openscience/domain';
import { Readable } from 'node:stream';
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
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: async (key, body) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.concat(await (body as Readable).toArray()); objects.set(key, bytes); return { key, size: bytes.length, etag: 'test' }; },
    getObject: async key => ({ body: Readable.from([objects.get(key)!]), size: objects.get(key)!.length }),
    headObject: async key => objects.has(key) ? { size: objects.get(key)!.length, etag: 'test' } : null,
    deleteObject: async key => { objects.delete(key); },
  };
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, storage });
  apps.push(app);
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  db.workspaces.push({ id: 'workspace', name: 'Study', type: 'team', status: 'active', ownerId: user.id });
  db.memberships.push({ id: 'member', workspaceId: 'workspace', userId: user.id, role: 'viewer' });
  db.researchObjects.push({ id: RO_ID, workspaceId: 'workspace', title: 'Shared study', version: 1 });
  db.ingestionBatches.push({ id: 'batch', userId: 'another-creator', researchObjectId: RO_ID });
  db.artifacts.push({ id: 'artifact', logicalPath: 'shared.pdf' });
  db.ingestionTasks.push({ id: 'task', batchId: 'batch', artifactId: 'artifact', state: 'needs_review', retryCount: 0, updatedAt: new Date() });
  return { app, db, prisma, user, deps: { prisma, redis, storage }, cookies: { openscience_session: token } };
}

describe('GET /ingestion scoped actionable feed', () => {
  it('keeps imported source references private in Claim/Evidence payloads while resolving source text', async () => {
    const { app, db, deps, user, cookies } = await fixture();
    db.memberships[0].role = 'author';
    db.researchObjects[0].status = 'draft';
    db.artifacts[0].workspaceId = 'workspace';
    db.artifacts[0].blobSha256 = 'a'.repeat(64);
    const core = { schemaVersion: '0.1.0', problem: 'Source statement', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
    db.sdfDocuments.push({ id: 'sdf', researchObjectId: RO_ID, coreJson: core });
    for (const nodeType of Object.keys(core).filter(key => key !== 'schemaVersion')) db.sdfNodes.push({ id: nodeType, sdfDocumentId: 'sdf', nodeType, content: '' });
    const quote = 'Original source passage.';
    const sourceMapRef = await persistDocumentSourceMapReference(deps.storage, {
      artifactId: 'artifact', contentHash: 'a'.repeat(64), parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 600, height: 800, blocks: [{ id: 'block', kind: 'paragraph', text: quote,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 }, parser: { name: 'fixture', version: '1' }, transformations: [] }] }],
    }, 'succeeded');
    db.agentTasks.push({ id: 'extract', result: { core, evidence: { problem: { quote } }, sourceMapRef } });
    db.ingestionTasks[0].agentTaskId = 'extract';
    const confirmed = await confirmIngestionTask(deps, { userId: user.id, taskId: 'task', version: 1, core });
    const scope = `/research-objects/${RO_ID}/versions/${confirmed.confirmation.versionId}`;
    for (const resource of ['claims', 'evidence']) {
      const response = await app.inject({ method: 'GET', url: `${scope}/${resource}`, cookies });
      expect(response.statusCode).toBe(200);
      expect(response.json()[resource]).toHaveLength(1);
      expect(response.body).not.toMatch(/sourceMapRef|objectKey|derived\/source-maps/);
    }
    expect(db.evidenceRecords[0].provenance.sourceMapRef).toEqual(sourceMapRef);
    const source = await app.inject({ method: 'GET', url: `${scope}/evidence/${db.evidenceRecords[0].id}/source`, cookies });
    expect(source.statusCode).toBe(200);
    expect(source.json()).toEqual({ source: { text: quote } });
  });
  it('recovers completed material history for RO members', async () => {
    const { app, db, cookies } = await fixture();
    db.ingestionTasks[0].state = 'confirmed';
    const response = await app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/ingestion`, cookies });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ researchObjectId: RO_ID, version: 1, latestConfirmation: null,
      tasks: [{ id: 'task', state: 'confirmed', logicalPath: 'shared.pdf', confirmation: null }] });
    db.memberships.length = 0;
    const denied = await app.inject({ method: 'GET', url: `/research-objects/${RO_ID}/ingestion`, cookies });
    expect(denied.statusCode).toBe(404);
    expect(denied.body).not.toContain('shared.pdf');
  });
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

describe('reviewed ingestion Claim/Evidence route contract', () => {
  const VERSION_ID = '00000000-0000-4000-8000-000000000201';
  const TASK_ID = '00000000-0000-4000-8000-000000000301';

  it('requires an idempotency key and a strict reviewed selection DTO', async () => {
    const { app, db, cookies } = await fixture();
    db.memberships[0]!.role = 'author';
    const url = `/research-objects/${RO_ID}/versions/${VERSION_ID}/ingestion-claim-evidence/${TASK_ID}`;
    const missingKey = await app.inject({
      method: 'POST', url, cookies,
      payload: { snapshotToken: 'a'.repeat(64), selections: [{ clientKey: 'result', sourceField: 'results', kind: 'core', statement: 'Result', attachSourceQuote: false }] },
    });
    expect(missingKey.statusCode).toBe(400);

    const unknownField = await app.inject({
      method: 'POST', url, cookies, headers: { 'idempotency-key': 'review-1' },
      payload: { snapshotToken: 'a'.repeat(64), selections: [{ clientKey: 'result', sourceField: 'results', kind: 'core', statement: 'Result', attachSourceQuote: false, verified: true }] },
    });
    expect(unknownField.statusCode).toBe(400);
  });

  it('marks extracted-quote preview responses private and non-cacheable', async () => {
    const { app, db, cookies } = await fixture();
    db.memberships[0]!.role = 'author';
    const response = await app.inject({
      method: 'GET', url: `/research-objects/${RO_ID}/versions/not-a-version/ingestion-claim-evidence`, cookies,
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});
