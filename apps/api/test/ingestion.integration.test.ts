import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace, createResearchObject } from '@openscience/domain';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const storage = createStorageAdapter(storageConfigFromEnv());
const repoRoot = path.resolve(__dirname, '../../..');
let createdUserId: string | null = null;

beforeAll(() => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
  if (process.env.NODE_ENV !== 'test' || !/(test|integration)/i.test(databaseUrl.pathname)) {
    throw new Error('Refusing ingestion integration test outside an isolated test database');
  }
});

function field(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}

function ingestionForm(filename: string, processingConsent: boolean): { body: Buffer; contentType: string } {
  const boundary = `----ingestion${Date.now()}`;
  return {
    body: Buffer.concat([
      field(boundary, 'processingConsent', String(processingConsent)),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\nresearch evidence\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function register(app: Awaited<ReturnType<typeof buildApp>>, email: string): Promise<{ cookie: string; userId: string; workspaceId: string }> {
  const output = execFileSync(process.execPath, [path.join(repoRoot, 'scripts/invite.mjs'), 'create', '--email', email], { encoding: 'utf8' });
  const invitationCode = output.match(/[A-Z2-9]{20}/)?.[0];
  if (!invitationCode) throw new Error('missing invitation code');
  await app.inject({ method: 'POST', url: '/auth/register', payload: { invitationCode, email, password: 'Passw0rd123', displayName: 'Ingestion tester' } });
  const mail = await prisma.mailOutbox.findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } });
  const code = mail?.bodyText.match(/\d{6}/)?.[0];
  if (!code) throw new Error('missing verification code');
  const verified = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: user.id, type: 'personal' } });
  return { cookie: verified.cookies.find((item) => item.name === 'openscience_session')!.value, userId: user.id, workspaceId: workspace.id };
}

afterAll(async () => {
  if (createdUserId) {
    const batches = await prisma.ingestionBatch.findMany({ where: { userId: createdUserId }, select: { id: true } });
    const sessions = await prisma.agentSession.findMany({ where: { userId: createdUserId }, select: { id: true } });
    const batchIds = batches.map(({ id }) => id);
    const sessionIds = sessions.map(({ id }) => id);
    await prisma.ingestionTask.deleteMany({ where: { batchId: { in: batchIds } } });
    await prisma.ingestionBatch.deleteMany({ where: { id: { in: batchIds } } });
    await prisma.agentTask.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.agentSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.artifact.deleteMany({ where: { uploadedBy: createdUserId } });
    await prisma.auditLog.deleteMany({ where: { actorId: createdUserId } });
    await prisma.usageLedger.deleteMany({ where: { userId: createdUserId } });
    const documents = await prisma.sdfDocument.findMany({ where: { researchObject: { createdBy: createdUserId } }, select: { id: true } });
    await prisma.sdfNode.deleteMany({ where: { sdfDocumentId: { in: documents.map(({ id }) => id) } } });
    await prisma.sdfDocument.deleteMany({ where: { id: { in: documents.map(({ id }) => id) } } });
    await prisma.researchObject.deleteMany({ where: { createdBy: createdUserId } });
    await prisma.membership.deleteMany({ where: { userId: createdUserId } });
    await prisma.workspace.deleteMany({ where: { ownerId: createdUserId } });
    await prisma.emailVerification.deleteMany({ where: { userId: createdUserId } });
    await prisma.user.delete({ where: { id: createdUserId } });
  }
  await Promise.all([prisma.$disconnect(), redis.quit()]);
});

describe('ingestion API (real PostgreSQL/Redis/MinIO)', () => {
  it('requires consent and queues a supported file for asynchronous extraction', async () => {
    const app = await buildApp({ prisma, redis, mailer, storage, audit: createPrismaAuditSink(prisma), onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user), cookieSecret: 'integration-secret', secureCookies: false });
    const email = `ingestion-${Date.now()}@example.com`;
    const account = await register(app, email);
    createdUserId = account.userId;
    await prisma.usageLedger.create({ data: { userId: account.userId, resource: 'ai_credit', delta: 100n, kind: 'grant', reason: 'integration' } });
    const ro = await createResearchObject({ prisma, mailer }, { workspaceId: account.workspaceId, userId: account.userId, title: 'Ingestion integration' });

    const deniedForm = ingestionForm('paper.pdf', false);
    const denied = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/ingest`, cookies: { openscience_session: account.cookie }, payload: deniedForm.body, headers: { 'content-type': deniedForm.contentType } });
    expect(denied.statusCode).toBe(400);

    const form = ingestionForm('paper.pdf', true);
    const accepted = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/ingest`, cookies: { openscience_session: account.cookie }, payload: form.body, headers: { 'content-type': form.contentType, 'idempotency-key': `ingestion:${Date.now()}` } });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ artifacts: [{ logicalPath: 'paper.pdf' }], tasks: [{ state: 'queued' }] });
    const status = await app.inject({ method: 'GET', url: `/ingestion/${accepted.json().batchId}`, cookies: { openscience_session: account.cookie } });
    expect(status.statusCode).toBe(200);
    expect(status.json().tasks[0]).toMatchObject({ state: 'queued', logicalPath: 'paper.pdf' });
    const actionable = await app.inject({ method: 'GET', url: '/ingestion?actionable=true', cookies: { openscience_session: account.cookie } });
    expect(actionable.statusCode).toBe(200);
    expect(actionable.json().tasks[0]).toMatchObject({
      id: accepted.json().tasks[0].id,
      researchObjectId: ro.id,
      researchTitle: 'Ingestion integration',
      logicalPath: 'paper.pdf',
      state: 'queued',
    });
    await app.close();
  });
});
