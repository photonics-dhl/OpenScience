import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const redis = createFakeRedis();
  const dispatch = vi.fn(async () => 1);
  Object.assign(redis, { lpush: dispatch });
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  db.workspaces.push({ id: id(1), status: 'active' });
  db.memberships.push({ workspaceId: id(1), userId: user.id, role: 'author' });
  db.researchObjects.push({ id: id(2), workspaceId: id(1), status: 'draft', deletedAt: null });
  db.artifacts.push({ id: id(3), workspaceId: id(1), blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: id(4), userId: user.id, researchObjectId: id(2) });
  db.agentSessions.push({ id: id(5), userId: user.id, researchObjectId: id(2), status: 'active', deletedAt: null });
  db.agentTasks.push({ id: id(6), sessionId: id(5), kind: 'sdf.extract', status: 'succeeded', executionAttempt: 1,
    retryCount: 0, progress: 100, deletedAt: null, error: null, dispatchedAt: new Date(),
    payload: { artifactId: id(3), researchObjectId: id(2) }, result: {
      status: 'needs_review', reason: 'unresolved pages remain', sourceMapRef: {
        schemaVersion: 1, parserStatus: 'needs_review', artifactId: id(3), contentHash: 'a'.repeat(64),
        objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100,
      },
    } });
  db.ingestionTasks.push({ id: id(7), batchId: id(4), artifactId: id(3), agentTaskId: id(6),
    state: 'needs_review', retryCount: 0, error: null });
  db.hermesResearchRuns.push({ id: id(8), actorId: user.id, researchObjectId: id(2), status: 'failed', version: 3,
    versionId: null, sourceClaimIds: [], sourceReviewDigest: null, profile: 'visual-narrative-v1', maxAgentTasks: 9,
    generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain this paper' }, error: 'scientific review required' });
  db.hermesResearchSteps.push({ id: id(9), runId: id(8), stage: 'source_ingestion', ordinal: 0, status: 'succeeded',
    ingestionTaskId: id(7), artifactId: id(3), agentTaskId: id(6), presentationAssetId: null, error: null });
  Object.assign(prisma.hermesResearchRun, { findUniqueOrThrow: async (args: Parameters<typeof prisma.hermesResearchRun.findUnique>[0]) =>
    prisma.hermesResearchRun.findUnique(args) });
  Object.assign(prisma.auditLog, { findMany: async ({ where }: { where: { action: string; actorId: string;
    AND: Array<{ metadata: { path: string[]; equals: string } }> } }) => db.auditLogs.filter(row => row.action === where.action
      && row.actorId === where.actorId && where.AND.every(clause => row.metadata[clause.metadata.path[0]!] === clause.metadata.equals)) });
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false,
    audit: { record: async (event, tx) => { await (tx as typeof prisma).auditLog.create({ data: event as never }); } } });
  apps.push(app);
  return { app, db, dispatch, cookies: { openscience_session: token }, url: `/research-objects/${id(2)}/hermes-runs/${id(8)}` };
}

describe('source parser recovery API contract', () => {
  it('returns safe diagnostic identity on GET and resumes the same run/task on explicit idempotent POST', async () => {
    const f = await fixture();
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run).toMatchObject({ generationRecovery: 'source-parser', canRetryGeneration: true,
      chargeableAttempts: 0, sourceParsing: { status: 'needs_review', ingestionTaskId: id(7), agentTaskId: id(6), providerChargeMayApply: true } });
    expect(read.body).not.toContain('sourceMapRef'); expect(f.dispatch).not.toHaveBeenCalled();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'explicit-source-resume' }, payload: { expectedVersion: 3 } };
    const started = await f.app.inject(request);
    expect(started.statusCode).toBe(202);
    expect(started.json().run).toMatchObject({ id: id(8), version: 4, status: 'running', maxAgentTasks: 9,
      steps: [{ ingestionTaskId: id(7), agentTaskId: id(6), status: 'waiting' }] });
    expect((await f.app.inject(request)).statusCode).toBe(202);
    expect(f.dispatch).toHaveBeenCalledTimes(1); expect(f.db.usageLedger).toHaveLength(0);
    const conflict = await f.app.inject({ ...request, payload: { expectedVersion: 4 } });
    expect(conflict.statusCode).toBe(409);
  });

  it('rejects client-selected pages/checkpoints and a missing key without queuing work', async () => {
    const f = await fixture();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'explicit-source-resume' }, payload: { expectedVersion: 3, unresolvedPageNumbers: [18] } };
    expect((await f.app.inject(request)).statusCode).toBe(400);
    expect((await f.app.inject({ ...request, payload: { expectedVersion: 3 }, headers: {} })).statusCode).toBe(400);
    expect(f.dispatch).not.toHaveBeenCalled(); expect(f.db.auditLogs).toHaveLength(0);
  });
});
