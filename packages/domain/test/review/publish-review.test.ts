import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createCommit } from '../../src/commit/commits';
import { setLicenses } from '../../src/license/licenses';
import { runPublicationReview, getPublicationReview, saveWarnings } from '../../src/review/publish-review';
import { cancelAgentTask } from '../../src/agent/agent';

function memoryStorage(): StorageAdapter {
  const store = new Map<string, { body: Buffer }>();
  return {
    putObject: async (key, body) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      store.set(key, { body: buf });
      return { key, size: buf.length, etag: 'x' };
    },
    getObject: async (key) => {
      const hit = store.get(key);
      if (!hit) throw new Error(`Object not found: ${key}`);
      return { body: Readable.from([hit.body]), size: hit.body.length };
    },
    headObject: async (key) => (store.has(key) ? { size: store.get(key)!.body.length, etag: 'x' } : null),
    deleteObject: async (key) => void store.delete(key),
  };
}

const CORE = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'pv-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never, storage: memoryStorage() };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  const commit = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1, sdfCore: CORE });
  db.claimNodes.push({
    id: 'review-core', researchObjectId: ro.id, versionId: commit.versionId, parentClaimId: null,
    kind: 'core', statement: 'Synthetic review contribution', assessment: 'missing', conditions: [], limitations: [],
    extractionStatus: 'succeeded', provenance: { source: 'human' },
  });
  return { deps, db, user, ro, versionId: commit.versionId };
}

describe('runPublicationReview（§11.1 七类硬阻断 + §15 AIReview）', () => {
  it.each(['viewer', 'reviewer', 'contributor'])('%s cannot overwrite a passed canonical review', async (role) => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    await runPublicationReview(deps, { versionId, userId: user.id });
    const saved = structuredClone(db.aiReviews[0]);
    db.memberships[0].role = role;
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toEqual([saved]);
  });

  it('publication review rechecks a demotion before writing the canonical verdict', async () => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const prisma = deps.prisma as unknown as { $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown> };
    const transaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = async (callback, options) => {
      db.memberships[0].role = 'viewer';
      return transaction(callback, options);
    };
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it.each(['viewer', 'reviewer', 'contributor'])('%s cannot trigger the automated publication review, even as creator', async (role) => {
    const { deps, db, user, versionId } = await makeDeps();
    db.memberships[0].role = role;
    await expect(runPublicationReview(deps, { versionId, userId: user.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.aiReviews).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it('正常版本（完整 core + 许可 + manifest + 发布者）→ passed', async () => {
    const { deps, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('passed');
    expect(review.hardBlocks).toHaveLength(0);
    // AIReview 记录稳定可引用（§11.3）
    const saved = await getPublicationReview(deps, { versionId, userId: user.id });
    expect(saved?.status).toBe('passed');
  });

  it('缺许可 → blocked（§6.3）', async () => {
    const { deps, user, versionId } = await makeDeps();
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('blocked');
    expect(review.hardBlocks.some((b) => b.code === 'license_missing')).toBe(true);
  });

  it('Contributor 不能覆盖发布审核（§3.3）', async () => {
    const { deps, db, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: db.users[0].id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const collab = seedUser(db, { id: 'pv-collab' });
    db.memberships.push({ id: 'm-2', workspaceId: 'ws-1', userId: collab.id, role: 'contributor', createdAt: new Date(), updatedAt: new Date() });
    await expect(runPublicationReview(deps, { versionId, userId: collab.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('版本无 manifest → blocked manifest_invalid（§7）', async () => {
    const { deps, db, user, ro, versionId } = await makeDeps();
    await setLicenses(deps, { researchObjectId: ro.id, userId: user.id, licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    // 删 manifest → manifest_invalid
    db.versionManifests = db.versionManifests.filter((m) => m.versionId !== versionId);
    const review = await runPublicationReview(deps, { versionId, userId: user.id });
    expect(review.status).toBe('blocked');
    expect(review.hardBlocks.some((b) => b.code === 'manifest_invalid')).toBe(true);
  });
});

async function warningFixture() {
  const fixture = await makeDeps();
  const { deps, db, user, ro, versionId } = fixture;
  await runPublicationReview(deps, { versionId, userId: user.id });
  db.aiReviews[0].warnings.push({ code: 'old_warning', evidence: 'original' });
  db.agentSessions.push({ id: 'warning-session', userId: user.id, researchObjectId: ro.id, kind: 'review', status: 'active' });
  db.agentTasks.push({ id: 'warning-task', sessionId: 'warning-session', kind: 'review.analyze', status: 'running',
    progress: 10, executionAttempt: 1, retryCount: 0, payload: { versionId, coreText: 'Original review source' },
    createdAt: new Date(), updatedAt: new Date(), error: null, result: null });
  const queryRaw = deps.prisma.$queryRaw.bind(deps.prisma);
  deps.prisma.$queryRaw = (async (query: TemplateStringsArray, ...values: unknown[]) => {
    const sql = query.join('?');
    if (sql.includes('agent_tasks')) {
      if (sql !== 'SELECT id FROM agent_tasks WHERE id = ?::uuid FOR UPDATE' || values.length !== 1) {
        throw new Error('Unexpected task row-lock query');
      }
      return db.agentTasks.filter(task => task.id === values[0]).map(task => ({ id: task.id }));
    }
    return queryRaw(query, ...values);
  }) as typeof deps.prisma.$queryRaw;
  const execution = { taskId: 'warning-task', executionAttempt: 1, sessionId: 'warning-session',
    researchObjectId: ro.id, coreText: 'Original review source',
    versionCommitId: db.versions.find(version => version.id === versionId)!.commitId };
  const input = { versionId, execution, warnings: [{ code: 'new_warning', evidence: 'new' }] };
  const stop = () => cancelAgentTask({ ...deps, redis: { lpush: async () => 1 } } as never,
    { userId: user.id, taskId: execution.taskId, expectedExecutionAttempt: 1 });
  return { ...fixture, execution, input, stop };
}

describe('saveWarnings owned execution adoption', () => {
  it('stop committed after the caller check but before adoption leaves the entire review unchanged', async () => {
    const { deps, db, input, stop } = await warningFixture();
    const before = structuredClone(db.aiReviews[0]);
    const transaction = deps.prisma.$transaction.bind(deps.prisma);
    let pause = true;
    deps.prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      if (pause) { pause = false; await stop(); }
      return transaction(callback, options as never);
    }) as typeof deps.prisma.$transaction;
    const write = vi.spyOn(deps.prisma.aiReview, 'update');
    await expect(saveWarnings(deps, input)).rejects.toThrow(/review execution/i);
    expect(db.agentTasks[0]).toMatchObject({ status: 'failed', executionAttempt: 2 });
    expect(write).not.toHaveBeenCalled();
    expect(db.aiReviews[0]).toEqual(before);
  });

  it('adoption committed first preserves snapshot markers and hard blocks through a later stop', async () => {
    const { deps, db, input, stop } = await warningFixture();
    const before = structuredClone(db.aiReviews[0]);
    let reachedWrite!: () => void;
    const reached = new Promise<void>(resolve => { reachedWrite = resolve; });
    let releaseWrite!: () => void;
    const release = new Promise<void>(resolve => { releaseWrite = resolve; });
    const update = deps.prisma.aiReview.update.bind(deps.prisma.aiReview);
    vi.spyOn(deps.prisma.aiReview, 'update').mockImplementation((async args => {
      reachedWrite();
      await release;
      return update(args);
    }) as typeof deps.prisma.aiReview.update);
    const adopting = saveWarnings(deps, input);
    await reached;
    const stopping = stop();
    releaseWrite();
    await adopting;
    await stopping;
    expect(db.aiReviews[0]).toEqual({ ...before, warnings: [before.warnings[0], ...input.warnings] });
    expect(db.aiReviews[0].status).toBe('blocked');
    expect(db.aiReviews[0].hardBlocks).toEqual(before.hardBlocks);
    expect(db.agentTasks[0]).toMatchObject({ status: 'failed', executionAttempt: 2 });
  });

  it.each(['attempt', 'task-deleted', 'task-missing', 'session-deleted', 'session-closed', 'session-binding',
    'ro-deleted', 'ro-missing', 'cross-ro', 'version-missing', 'version-commit', 'review-ro', 'source', 'payload-version', 'kind', 'lease'])(
    'rejects changed %s binding without changing any review content', async (change) => {
      const { deps, db, input } = await warningFixture();
      if (change === 'attempt') db.agentTasks[0].executionAttempt = 2;
      if (change === 'task-deleted') db.agentTasks[0].deletedAt = new Date();
      if (change === 'task-missing') db.agentTasks.splice(0);
      if (change === 'session-deleted') db.agentSessions[0].deletedAt = new Date();
      if (change === 'session-closed') db.agentSessions[0].status = 'closed';
      if (change === 'session-binding') db.agentTasks[0].sessionId = 'another-session';
      if (change === 'ro-deleted') db.researchObjects[0].deletedAt = new Date();
      if (change === 'ro-missing') db.researchObjects.splice(0);
      if (change === 'cross-ro') db.agentSessions[0].researchObjectId = 'another-ro';
      if (change === 'version-missing') db.versions.splice(0);
      if (change === 'version-commit') db.versions[0].commitId = 'another-commit';
      if (change === 'review-ro') db.aiReviews[0].researchObjectId = 'another-ro';
      if (change === 'source') db.agentTasks[0].payload.coreText = 'Replacement source';
      if (change === 'payload-version') db.agentTasks[0].payload.versionId = 'another-version';
      if (change === 'kind') db.agentTasks[0].kind = 'demo.echo';
      if (change === 'lease') db.agentTasks[0].status = 'pending';
      const before = structuredClone(db.aiReviews[0]);
      await expect(saveWarnings(deps, input)).rejects.toThrow(/review execution/i);
      expect(db.aiReviews[0]).toEqual(before);
    },
  );

  it.each(['empty', 'wrong-task', 'multiple'])('rejects %s task-row lock acquisition without a warning write', async (shape) => {
    const { deps, db, input } = await warningFixture();
    const before = structuredClone(db.aiReviews[0]);
    const queryRaw = deps.prisma.$queryRaw.bind(deps.prisma);
    deps.prisma.$queryRaw = (async (query: TemplateStringsArray, ...values: unknown[]) => {
      if (query.join('?') === 'SELECT id FROM agent_tasks WHERE id = ?::uuid FOR UPDATE') {
        return shape === 'empty' ? [] : shape === 'wrong-task' ? [{ id: 'another-task' }]
          : [{ id: input.execution.taskId }, { id: input.execution.taskId }];
      }
      return queryRaw(query, ...values);
    }) as typeof deps.prisma.$queryRaw;
    const write = vi.spyOn(deps.prisma.aiReview, 'update');
    await expect(saveWarnings(deps, input)).rejects.toThrow(/review execution/i);
    expect(write).not.toHaveBeenCalled();
    expect(db.aiReviews[0]).toEqual(before);
  });

  it.each(['P2034', 'raw40001'])('reauthorizes after %s at the task-row lock without adopting a stopped snapshot', async (code) => {
    const { deps, db, input, stop } = await warningFixture();
    const before = structuredClone(db.aiReviews[0]);
    const queryRaw = deps.prisma.$queryRaw.bind(deps.prisma);
    let conflict = true;
    let rowLocks = 0;
    const serializationError = Object.assign(new Error('old task snapshot'), code === 'P2034'
      ? { code: 'P2034' } : { code: 'P2010', meta: { code: '40001' } });
    deps.prisma.$queryRaw = (async (query: TemplateStringsArray, ...values: unknown[]) => {
      if (query.join('?') === 'SELECT id FROM agent_tasks WHERE id = ?::uuid FOR UPDATE') {
        rowLocks += 1;
        if (conflict) { conflict = false; throw serializationError; }
      }
      return queryRaw(query, ...values);
    }) as typeof deps.prisma.$queryRaw;
    const transaction = deps.prisma.$transaction.bind(deps.prisma);
    deps.prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      try { return await transaction(callback, options as never); }
      catch (error) {
        if (error === serializationError) await stop();
        throw error;
      }
    }) as typeof deps.prisma.$transaction;
    const write = vi.spyOn(deps.prisma.aiReview, 'update');
    await expect(saveWarnings(deps, input)).rejects.toThrow(/review execution/i);
    expect(rowLocks).toBe(2);
    expect(write).not.toHaveBeenCalled();
    expect(db.aiReviews[0]).toEqual(before);
  });

  it.each([{ code: 'P2010', meta: { code: '42601' } }, { code: 'P2010' }, { code: '40001' }])(
    'does not retry unrelated raw error %j', async (details) => {
      const { deps, db, input } = await warningFixture();
      const before = structuredClone(db.aiReviews[0]);
      const failure = Object.assign(new Error('raw failure'), details);
      const transaction = vi.spyOn(deps.prisma, '$transaction').mockRejectedValue(failure);
      await expect(saveWarnings(deps, input)).rejects.toBe(failure);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(db.aiReviews[0]).toEqual(before);
    },
  );

  it('rolls back a conflicting write, then reauthorizes the original attempt on P2034 retry', async () => {
    const { deps, db, input, stop } = await warningFixture();
    const before = structuredClone(db.aiReviews[0]);
    const transaction = deps.prisma.$transaction.bind(deps.prisma);
    let conflict = true;
    let calls = 0;
    deps.prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      if (!conflict) return transaction(callback, options as never);
      conflict = false;
      try {
        return await transaction(async tx => {
          calls += 1;
          await callback(tx);
          throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
        }, options as never);
      } catch (error) {
        expect(db.aiReviews[0]).toEqual(before);
        await stop();
        throw error;
      }
    }) as typeof deps.prisma.$transaction;
    await expect(saveWarnings(deps, input)).rejects.toThrow(/review execution/i);
    expect(calls).toBe(1);
    expect(db.aiReviews[0]).toEqual(before);
    expect(db.agentTasks[0]).toMatchObject({ status: 'failed', executionAttempt: 2 });
  });
});
