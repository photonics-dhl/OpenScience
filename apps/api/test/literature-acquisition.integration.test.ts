import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createPrismaAuditSink, createPrismaClient } from '@openscience/database';
import {
  recoverUndispatchedAgentTasks,
  submitLiteratureAcquisition,
  type AgentError,
} from '@openscience/domain';
import type { AuditSink } from '@openscience/observability';

const prisma = createPrismaClient();
const cleanupUserIds: string[] = [];

function createRedisStub(failFirst = false) {
  const pushed: string[] = [];
  let failed = false;
  return {
    pushed,
    lpush: async (_queue: string, taskId: string) => {
      if (failFirst && !failed) {
        failed = true;
        throw new Error('redis unavailable');
      }
      pushed.push(taskId);
      return pushed.length;
    },
  };
}

function createAuditBarrier() {
  const persisted = createPrismaAuditSink(prisma);
  let enter!: () => void;
  let release!: () => void;
  let blocked = false;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const audit: AuditSink = {
    record: async (event, tx) => {
      if (!blocked && event.action === 'research_object.create') {
        blocked = true;
        enter();
        await released;
      }
      await persisted.record(event, tx);
    },
  };
  return { audit, entered, release };
}

async function createFixture(credit: number, audit: AuditSink = createPrismaAuditSink(prisma)) {
  const user = await prisma.user.create({
    data: {
      email: `literature-${randomUUID()}@example.com`,
      displayName: 'Literature integration',
      passwordHash: 'x',
      status: 'email_verified',
    },
  });
  cleanupUserIds.push(user.id);
  const workspace = await prisma.workspace.create({
    data: {
      type: 'personal',
      name: 'Personal literature integration',
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'owner' } },
    },
    include: { members: true },
  });
  if (credit > 0) {
    await prisma.usageLedger.create({
      data: { userId: user.id, resource: 'ai_credit', delta: credit, kind: 'admin_topup' },
    });
  }
  const redis = createRedisStub();
  return {
    user,
    workspace,
    membership: workspace.members[0],
    redis,
    deps: { prisma, redis: redis as never, mailer: { send: async () => undefined }, audit },
  };
}

async function acquisitionCounts(userId: string) {
  const researchObjects = await prisma.researchObject.findMany({ where: { createdBy: userId }, select: { id: true } });
  const documents = await prisma.sdfDocument.findMany({
    where: { researchObjectId: { in: researchObjects.map(({ id }) => id) } },
    select: { id: true },
  });
  return {
    researchObjects: researchObjects.length,
    sdfDocuments: documents.length,
    sdfNodes: await prisma.sdfNode.count({ where: { sdfDocumentId: { in: documents.map(({ id }) => id) } } }),
    sessions: await prisma.agentSession.count({ where: { userId } }),
    tasks: await prisma.agentTask.count({ where: { session: { userId } } }),
    debits: await prisma.usageLedger.count({ where: { userId, resource: 'ai_credit', delta: { lt: 0 } } }),
    audits: await prisma.auditLog.count({ where: { actorId: userId } }),
  };
}

async function expectNoAcquisitionRows(userId: string) {
  await expect(acquisitionCounts(userId)).resolves.toEqual({
    researchObjects: 0, sdfDocuments: 0, sdfNodes: 0, sessions: 0, tasks: 0, debits: 0, audits: 0,
  });
}

afterEach(async () => {
  while (cleanupUserIds.length > 0) {
    const userId = cleanupUserIds.pop()!;
    await prisma.workspace.deleteMany({ where: { ownerId: userId } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.usageLedger.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('literature acquisition atomic PostgreSQL transaction', () => {
  it('rolls back RO, SDF, session, task, debit, and audit rows on zero credit', async () => {
    const { deps, user } = await createFixture(0);
    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'zero-credit', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDIT' });
    await expectNoAcquisitionRows(user.id);
  });

  it('rolls back every acquisition row when the transactional audit sink fails', async () => {
    const persistedAudit = createPrismaAuditSink(prisma);
    const failingAudit: AuditSink = {
      record: async (event, tx) => {
        await persistedAudit.record(event, tx);
        if (event.action === 'agent.task.submit') throw new Error('audit unavailable');
      },
    };
    const { deps, user } = await createFixture(1, failingAudit);
    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'audit-failure', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toThrow(/audit unavailable/);
    await expectNoAcquisitionRows(user.id);
  });

  it('returns an exact last-credit replay without a second debit or audit', async () => {
    const { deps, user } = await createFixture(1);
    const input = { userId: user.id, idempotencyKey: 'last-credit', query: 'attosecond dynamics', target: { kind: 'personal' as const } };
    const first = await submitLiteratureAcquisition(deps as never, input);
    const replay = await submitLiteratureAcquisition(deps as never, input);
    expect(replay).toMatchObject({
      researchObject: { id: first.researchObject.id }, session: { id: first.session.id }, task: { id: first.task.id },
    });
    await expect(acquisitionCounts(user.id)).resolves.toEqual({
      researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
    });
  });

  it('serializes concurrent identical requests into one aggregate and one debit', async () => {
    const { deps, user } = await createFixture(1);
    const input = { userId: user.id, idempotencyKey: 'same-request', query: 'attosecond dynamics', target: { kind: 'personal' as const } };
    const [first, second] = await Promise.all([
      submitLiteratureAcquisition(deps as never, input),
      submitLiteratureAcquisition(deps as never, input),
    ]);
    expect(second).toMatchObject({
      researchObject: { id: first.researchObject.id }, session: { id: first.session.id }, task: { id: first.task.id },
    });
    await expect(acquisitionCounts(user.id)).resolves.toMatchObject({
      researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
    });
  });

  it('allows exactly one different-key request to commit against one credit', async () => {
    const { deps, user } = await createFixture(1);
    const outcomes = await Promise.allSettled([
      submitLiteratureAcquisition(deps as never, { userId: user.id, idempotencyKey: 'key-a', query: 'first', target: { kind: 'personal' } }),
      submitLiteratureAcquisition(deps as never, { userId: user.id, idempotencyKey: 'key-b', query: 'second', target: { kind: 'personal' } }),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason as AgentError).toMatchObject({ code: 'INSUFFICIENT_CREDIT' });
    await expect(acquisitionCounts(user.id)).resolves.toMatchObject({
      researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
    });
  });

  it('has only serial outcomes when workspace archival races acquisition', async () => {
    const barrier = createAuditBarrier();
    const { deps, user, workspace } = await createFixture(1, barrier.audit);
    const acquisitionPromise = submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'archive-race', query: 'attosecond dynamics', target: { kind: 'personal' },
    });
    await barrier.entered;
    const archivePromise = prisma.workspace.update({ where: { id: workspace.id }, data: { status: 'archived' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    barrier.release();
    const [acquisition] = await Promise.allSettled([acquisitionPromise, archivePromise]);
    expect((await prisma.workspace.findUnique({ where: { id: workspace.id } }))?.status).toBe('archived');
    if (acquisition.status === 'fulfilled') {
      await expect(acquisitionCounts(user.id)).resolves.toEqual({
        researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
      });
    } else {
      expect((acquisition.reason as { code?: string }).code).toMatch(/WORKSPACE_ARCHIVED|DUPLICATE_IDEMPOTENCY_KEY/);
      await expectNoAcquisitionRows(user.id);
    }
  });

  it('has only serial outcomes when membership removal races acquisition', async () => {
    const barrier = createAuditBarrier();
    const { deps, user, membership } = await createFixture(1, barrier.audit);
    const acquisitionPromise = submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'membership-race', query: 'attosecond dynamics', target: { kind: 'personal' },
    });
    await barrier.entered;
    const removalPromise = prisma.membership.delete({ where: { id: membership.id } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    barrier.release();
    const [acquisition] = await Promise.allSettled([acquisitionPromise, removalPromise]);
    if (acquisition.status === 'fulfilled') {
      await expect(acquisitionCounts(user.id)).resolves.toEqual({
        researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
      });
    } else {
      expect((acquisition.reason as { code?: string }).code).toMatch(/WORKSPACE_NOT_FOUND|RESEARCH_OBJECT_NOT_FOUND|DUPLICATE_IDEMPOTENCY_KEY/);
      await expectNoAcquisitionRows(user.id);
    }
  });

  it('keeps one pending task after Redis failure and recovers it without duplicate persistence', async () => {
    const { user, workspace, membership } = await createFixture(1);
    void workspace;
    void membership;
    const redis = createRedisStub(true);
    const deps = { prisma, redis: redis as never, mailer: { send: async () => undefined }, audit: createPrismaAuditSink(prisma) };
    const input = { userId: user.id, idempotencyKey: 'redis-recovery', query: 'attosecond dynamics', target: { kind: 'personal' as const } };
    await expect(submitLiteratureAcquisition(deps as never, input)).rejects.toThrow(/redis unavailable/);
    const pending = await prisma.agentTask.findFirst({ where: { session: { userId: user.id } } });
    expect(pending).toMatchObject({ status: 'pending', dispatchedAt: null });
    expect(await recoverUndispatchedAgentTasks(deps as never)).toBe(1);
    const replay = await submitLiteratureAcquisition(deps as never, input);
    expect(replay.task.id).toBe(pending?.id);
    expect(await recoverUndispatchedAgentTasks(deps as never)).toBe(0);
    expect(redis.pushed).toEqual([pending?.id]);
    await expect(acquisitionCounts(user.id)).resolves.toMatchObject({
      researchObjects: 1, sdfDocuments: 1, sdfNodes: 6, sessions: 1, tasks: 1, debits: 1, audits: 3,
    });
  });
});
