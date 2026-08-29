import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import {
  claimAgentTask, createAgentSession, submitAgentTask, getAgentTask, listAgentTasks, markTaskProgress,
  prepareAgentTaskForCrashRecovery, recoverUndispatchedAgentTasks, retryAgentTask,
} from '../../src/agent/agent';
import { buildInterestContext } from '../../src/research-intelligence/interest-context';

/** 内存 Redis fake（队列：agent:queue）。 */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  return {
    lists,
    lpush: async (key: string, val: string) => {
      const arr = lists.get(key) ?? [];
      arr.unshift(val);
      lists.set(key, arr);
      return arr.length;
    },
    brpoplpush: async (src: string, dst: string, timeout: number) => {
      void timeout;
      const arr = lists.get(src);
      const val = arr?.pop();
      if (!val) return null;
      lists.set(src, arr!);
      const dstArr = lists.get(dst) ?? [];
      dstArr.push(val);
      lists.set(dst, dstArr);
      return val;
    },
    lrem: async (key: string, _count: number, val: string) => {
      const arr = lists.get(key) ?? [];
      lists.set(key, arr.filter((v) => v !== val));
      return 0;
    },
  };
}

async function makeDeps(credit = 100) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'agent-user' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  // AI Credit 余额（§2.4-7）
  db.usageLedger.push({ id: 'u-1', userId: user.id, resource: 'ai_credit', delta: credit, kind: 'grant', createdAt: new Date() });
  const redis = fakeRedis();
  const deps = { prisma, mailer: {} as never, redis } as never;
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  return { deps: { prisma, mailer: {} as never, redis } as never, db, user, ro, redis };
}

describe('AgentSession/AgentTask（§15 + §16 幂等 + §9.1 配额）', () => {
  it('retries one failed task without reserving a second AI credit', async () => {
    const { deps, user, ro, redis, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: 'bounded' } });
    await markTaskProgress(deps, { taskId: task.id, status: 'running' });
    await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: 'provider timeout' });
    const retried = await retryAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(retried.status).toBe('pending');
    expect(retried.retryCount).toBe(1);
    expect(db.agentTasks[0].payload).toEqual({ manuscriptText: 'bounded' });
    expect(db.agentTasks[0].retryCount).toBe(1);
    expect(db.usageLedger.filter((entry) => entry.resource === 'ai_credit' && entry.delta < 0)).toHaveLength(1);
    expect(redis.lists.get('agent:queue')?.filter((id) => id === task.id)).toHaveLength(2);
    await markTaskProgress(deps, { taskId: task.id, status: 'running' });
    await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: 'provider timeout again' });
    await expect(retryAgentTask(deps, { userId: user.id, taskId: task.id })).rejects.toThrow(/already retried/i);
  });

  it('persists server-owned interest context outside the client payload', async () => {
    const { deps, user, ro, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const interestContext = buildInterestContext({
      currentGoal: 'Inspect the evidence',
      activeResearchObjectId: ro.id,
    });
    await submitAgentTask(deps, {
      sessionId: session.id,
      userId: user.id,
      kind: 'sdf.extract',
      payload: { manuscriptText: 'bounded' },
      interestContext,
    });

    expect(db.agentTasks[0].payload).toEqual({ manuscriptText: 'bounded' });
    expect(db.agentTasks[0].interestContext).toEqual(interestContext);
  });

  it('snapshots a neutral server context when an internal task caller omits it', async () => {
    const { deps, user, ro, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: 'bounded' } });
    expect(db.agentTasks[0].interestContext).toMatchObject({
      schemaVersion: 1, profileVersion: 0, primaryIdentity: 'reader', activeResearchObjectId: ro.id, profileMissing: true,
    });
  });

  it('rejects retry for blocked, artifact-backed, and non-extractor tasks', async () => {
    const { deps, user, ro, db } = await makeDeps(4);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    for (const candidate of [
      { kind: 'sdf.extract', payload: { manuscriptText: 'safe' }, error: '[blocked] malware detected' },
      { kind: 'demo.echo', payload: {}, error: 'provider timeout' },
    ]) {
      const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, ...candidate });
      await markTaskProgress(deps, { taskId: task.id, status: 'running' });
      await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: candidate.error });
      await expect(retryAgentTask(deps, { userId: user.id, taskId: task.id })).rejects.toThrow(/not retryable/i);
    }
    const artifactTask = await submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: 'safe' },
    });
    db.agentTasks.find((task) => task.id === artifactTask.id).payload = {
      manuscriptText: 'safe', artifactId: '00000000-0000-0000-0000-000000000001',
    };
    await markTaskProgress(deps, { taskId: artifactTask.id, status: 'running' });
    await markTaskProgress(deps, { taskId: artifactTask.id, status: 'failed', error: 'provider timeout' });
    await expect(retryAgentTask(deps, { userId: user.id, taskId: artifactTask.id })).rejects.toThrow(/not retryable/i);
  });

  it('durably reconciles an extractor retry when Redis dispatch fails', async () => {
    const { deps, user, ro, redis, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: { manuscriptText: 'bounded' } });
    await markTaskProgress(deps, { taskId: task.id, status: 'running' });
    await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: 'provider timeout' });
    const originalLpush = redis.lpush;
    redis.lpush = async () => { throw new Error('redis unavailable'); };
    await expect(retryAgentTask(deps, { userId: user.id, taskId: task.id })).rejects.toThrow(/redis unavailable/);
    expect(db.agentTasks[0]).toMatchObject({ status: 'pending', dispatchedAt: null, retryCount: 1 });
    redis.lpush = originalLpush;
    expect(await recoverUndispatchedAgentTasks(deps)).toBe(1);
    expect(redis.lists.get('agent:queue')?.filter((id) => id === task.id)).toHaveLength(2);
  });
  it('建会话 + 提交任务入队 + 进度查询', async () => {
    const { deps, user, ro, redis } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    expect(session.researchObjectId).toBe(ro.id);

    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'hi' } });
    expect(task.status).toBe('pending');
    expect(redis.lists.get('agent:queue')?.includes(task.id)).toBe(true);

    const view = await getAgentTask(deps, { userId: user.id, taskId: task.id });
    expect(view.kind).toBe('demo.echo');
  });

  it('lists only the current user actionable tasks with RO context', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: {} });
    const rows = await listAgentTasks(deps, { userId: user.id, actionableOnly: true });
    expect(rows).toEqual([
      expect.objectContaining({ id: task.id, researchObjectId: ro.id, status: 'pending' }),
    ]);
  });

  it('幂等键重放 → 返回既有任务（§16 不重复）', async () => {
    const { deps, user, ro, redis } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: { message: 'x' }, idempotencyKey: 'k1' };
    const first = await submitAgentTask(deps, input);
    const replay = await submitAgentTask(deps, input);
    expect(replay.id).toBe(first.id);
    expect(redis.lists.get('agent:queue')).toEqual([first.id]);
  });

  it('Redis dispatch 失败后重放可恢复同一 pending 任务', async () => {
    const { deps, user, ro, redis, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const originalLpush = redis.lpush;
    let firstAttempt = true;
    redis.lpush = async (key: string, value: string) => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('redis unavailable');
      }
      return originalLpush(key, value);
    };
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, idempotencyKey: 'recover-dispatch' };
    await expect(submitAgentTask(deps, input)).rejects.toThrow(/redis unavailable/);
    expect(db.agentTasks).toHaveLength(1);
    const replay = await submitAgentTask(deps, input);
    expect(redis.lists.get('agent:queue')).toEqual([replay.id]);
  });

  it('worker reconciliation 重派已提交但未写入 Redis 的任务', async () => {
    const { deps, user, ro, redis, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'workspace.guide' });
    const originalLpush = redis.lpush;
    redis.lpush = async () => { throw new Error('redis unavailable'); };
    const input = {
      sessionId: session.id,
      userId: user.id,
      kind: 'workspace.guide',
      payload: {},
      idempotencyKey: 'recover-without-client-replay',
    };
    await expect(submitAgentTask(deps, input)).rejects.toThrow(/redis unavailable/);
    const [pending] = db.agentTasks;
    expect(pending.dispatchedAt).toBeNull();

    redis.lpush = originalLpush;
    expect(await recoverUndispatchedAgentTasks(deps)).toBe(1);
    expect(redis.lists.get('agent:queue')).toEqual([pending.id]);
    expect(db.agentTasks[0].dispatchedAt).toBeInstanceOf(Date);
  });

  it('worker CAS claim 只允许一个消费者执行任务', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} });
    expect(await claimAgentTask(deps, task.id)).toMatchObject({ status: 'running', executionAttempt: 1 });
    expect(await claimAgentTask(deps, task.id)).toBeNull();
  });

  it('幂等键不能重放不同的 server interest context', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const firstContext = buildInterestContext({ currentGoal: 'Goal A', activeResearchObjectId: ro.id });
    const secondContext = buildInterestContext({ currentGoal: 'Goal B', activeResearchObjectId: ro.id });
    await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, interestContext: firstContext, idempotencyKey: 'context-key' });
    await expect(submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, interestContext: secondContext, idempotencyKey: 'context-key',
    })).rejects.toThrow(/幂等键/);
  });

  it('profile changes do not invalidate an otherwise identical idempotent replay', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, idempotencyKey: 'profile-change-key' };
    const first = await submitAgentTask(deps, input);
    db.researchIdentityProfiles.push({
      userId: user.id, identities: ['author'], primaryIdentity: 'author', disciplines: ['physics'], methods: [], topics: ['optics'],
      languages: ['en'], acceptedSignals: [], rejectedSignals: [], profileVersion: 2,
    });
    await expect(submitAgentTask(deps, input)).resolves.toMatchObject({ id: first.id });
  });

  it('replays a pre-migration null-context task only when no explicit goal or claim was added', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const input = { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {}, idempotencyKey: 'legacy-null-context' };
    const first = await submitAgentTask(deps, input);
    db.agentTasks[0].interestContext = null;
    await expect(submitAgentTask(deps, input)).resolves.toMatchObject({ id: first.id });
    await expect(submitAgentTask(deps, {
      ...input, interestContext: buildInterestContext({ currentGoal: 'new goal', activeResearchObjectId: ro.id }),
    })).rejects.toThrow(/幂等键/);
  });

  it('replays a pre-migration workspace guide when its persisted payload proves the same goal', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'workspace.guide' });
    const payload = {
      goal: 'Map this evidence', locale: 'en', route: 'research-object-edit', target: 'sdf-evidence',
      context: { tasks: [], researchObjects: [] },
    };
    const interestContext = buildInterestContext({ currentGoal: payload.goal, activeResearchObjectId: ro.id });
    const input = {
      sessionId: session.id, userId: user.id, kind: 'workspace.guide', payload, interestContext,
      idempotencyKey: 'legacy-workspace-guide',
    };
    const first = await submitAgentTask(deps, input);
    db.agentTasks[0].interestContext = null;
    await expect(submitAgentTask(deps, input)).resolves.toMatchObject({ id: first.id });
    await expect(submitAgentTask(deps, {
      ...input, payload: { ...payload, goal: 'Different goal' },
      interestContext: buildInterestContext({ currentGoal: 'Different goal', activeResearchObjectId: ro.id }),
    })).rejects.toThrow(/幂等键/);
  });

  it('preserves operational database errors while resolving a new task context', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const operational = new Error('db unavailable');
    const prisma = (deps as { prisma: { researchIdentityProfile: { findUnique: (args: unknown) => Promise<unknown> } } }).prisma;
    prisma.researchIdentityProfile.findUnique = async () => { throw operational; };
    await expect(submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {},
    })).rejects.toBe(operational);
  });

  it('rejects terminal writes from a stale worker execution epoch', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {},
    });
    const first = await claimAgentTask(deps, task.id);
    expect(first?.executionAttempt).toBe(1);
    expect(await prepareAgentTaskForCrashRecovery(deps, task.id)).toBe(true);
    const second = await claimAgentTask(deps, task.id);
    expect(second?.executionAttempt).toBe(2);

    await expect(markTaskProgress(deps, {
      taskId: task.id,
      status: 'failed',
      error: 'stale worker failed',
      expectedExecutionAttempt: first!.executionAttempt,
    })).rejects.toThrow(/新的 worker/);
    await expect(markTaskProgress(deps, {
      taskId: task.id,
      status: 'succeeded',
      progress: 100,
      result: { ok: true },
      expectedExecutionAttempt: second!.executionAttempt,
    })).resolves.toMatchObject({ status: 'succeeded', executionAttempt: 2 });
  });

  it('任务幂等键不能跨 Hermes 会话重放', async () => {
    const { deps, user, ro } = await makeDeps();
    const firstSession = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const secondSession = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await submitAgentTask(deps, {
      sessionId: firstSession.id, userId: user.id, kind: 'demo.echo', payload: { message: 'first' }, idempotencyKey: 'shared-task-key',
    });
    await expect(submitAgentTask(deps, {
      sessionId: secondSession.id, userId: user.id, kind: 'demo.echo', payload: { message: 'second' }, idempotencyKey: 'shared-task-key',
    })).rejects.toThrow(/幂等键/);
  });

  it('会话并发 P2002 恢复不能返回其他用户的会话', async () => {
    const { deps, db, user, ro } = await makeDeps();
    const outsider = seedUser(db, { id: 'session-outsider' });
    db.agentSessions.push({
      id: 'outsider-session', userId: outsider.id, researchObjectId: null, kind: 'ingestion', title: '', status: 'active',
      idempotencyKey: 'raced-session-key', createdAt: new Date(), updatedAt: new Date(),
    });
    const prisma = (deps as { prisma: { agentSession: { findUnique: (args: unknown) => Promise<unknown> } } }).prisma;
    const originalFindUnique = prisma.agentSession.findUnique;
    let lookupCount = 0;
    prisma.agentSession.findUnique = async (args: unknown) => {
      lookupCount += 1;
      if (lookupCount === 1) return null;
      return originalFindUnique(args);
    };

    await expect(createAgentSession(deps, {
      userId: user.id, researchObjectId: ro.id, kind: 'ingestion', idempotencyKey: 'raced-session-key',
    })).rejects.toThrow(/幂等键/);
  });

  it('AI Credit 不足 → INSUFFICIENT_CREDIT（§9.1）', async () => {
    const { deps, user, ro } = await makeDeps(0);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await expect(
      submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} }),
    ).rejects.toThrow(/AI Credit 不足/);
  });

  it('提交时原子预留 AI Credit，不能在首个任务完成前继续透支', async () => {
    const { deps, user, ro, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'workspace.guide' });
    const first = await submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'workspace.guide', payload: {}, idempotencyKey: 'reserve-one', dispatch: false,
    });
    expect(db.usageLedger.filter((entry) => entry.idempotencyKey === `agent-task-reserve:${first.id}`)).toHaveLength(1);
    await expect(submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'workspace.guide', payload: {}, idempotencyKey: 'reserve-two', dispatch: false,
    })).rejects.toThrow(/AI Credit 不足/);
  });

  it('Serializable 冲突后重试额度预留且只创建一个任务', async () => {
    const { deps, user, ro, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'workspace.guide' });
    const prisma = (deps as { prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown> } }).prisma;
    const originalTransaction = prisma.$transaction;
    let attempts = 0;
    prisma.$transaction = async (fn, options) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
      return originalTransaction(fn, options);
    };

    const task = await submitAgentTask(deps, {
      sessionId: session.id,
      userId: user.id,
      kind: 'workspace.guide',
      payload: {},
      idempotencyKey: 'serializable-retry',
      dispatch: false,
    });

    expect(attempts).toBe(2);
    expect(db.agentTasks.filter((entry) => entry.id === task.id)).toHaveLength(1);
    expect(db.usageLedger.filter((entry) => entry.idempotencyKey === `agent-task-reserve:${task.id}`)).toHaveLength(1);
  });

  it('creates the task audit and credit reservation before Redis dispatch', async () => {
    const { deps, user, ro, redis, db } = await makeDeps(1);
    const events: Array<{ action: string }> = [];
    (deps as { audit?: unknown }).audit = { record: async (event: { action: string }) => { events.push(event); } };
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'workspace.guide' });
    redis.lpush = async () => {
      expect(events.map((event) => event.action)).toContain('agent.task.submit');
      expect(db.usageLedger.some((entry) => String(entry.idempotencyKey).startsWith('agent-task-reserve:'))).toBe(true);
      return 1;
    };
    await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'workspace.guide', payload: {} });
  });

  it('workspace.guide 任务不能借用其他 kind 的会话', async () => {
    const { deps, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await expect(submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'workspace.guide', payload: {}, dispatch: false,
    })).rejects.toThrow(/会话类型/);
  });

  it('他人会话提交 → 404（§17 越权）', async () => {
    const { deps, db, user, ro } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const outsider = seedUser(db, { id: 'agent-outsider' });
    await expect(
      submitAgentTask(deps, { sessionId: session.id, userId: outsider.id, kind: 'x', payload: {} }),
    ).rejects.toThrow(/会话不存在/);
  });

  it('拒绝把其它 Workspace 的 Artifact 绑定到 sdf.extract 会话', async () => {
    const { deps, db, user, ro } = await makeDeps();
    db.artifacts.push({
      id: 'artifact-other-workspace', logicalPath: 'private-paper.pdf', mimeType: 'application/pdf', size: 12n,
      blobSha256: 'a'.repeat(64), uploadedBy: 'other-user', workspaceId: 'ws-other', createdAt: new Date(), idempotencyKey: null,
    });
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'ingestion' });

    await expect(submitAgentTask(deps, {
      sessionId: session.id,
      userId: user.id,
      kind: 'sdf.extract',
      payload: { artifactId: 'artifact-other-workspace', researchObjectId: ro.id },
      dispatch: false,
    })).rejects.toThrow(/Artifact/);
    expect(db.agentTasks).toHaveLength(0);
  });

  it('rejects review.analyze when the target Version belongs to another research object', async () => {
    const { deps, db, user, ro } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'review' });
    db.researchObjects.push({
      id: 'ro-other', workspaceId: 'ws-1', title: 'Other RO', createdBy: user.id,
      status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    db.versions.push({
      id: 'version-other', researchObjectId: 'ro-other', commitId: 'commit-other',
      versionNo: 1, status: 'draft', createdAt: new Date(),
    });

    await expect(submitAgentTask(deps, {
      sessionId: session.id,
      userId: user.id,
      kind: 'review.analyze',
      payload: { versionId: 'version-other', coreText: 'Private text from another RO' },
      dispatch: false,
    })).rejects.toThrow(/Version.*研究对象/i);
    expect(db.agentTasks).toHaveLength(0);
    expect(db.usageLedger.filter((entry) => entry.delta < 0)).toHaveLength(0);
  });

  it('任务状态机：非法迁移拒绝 + 终态幂等', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} });
    // pending → succeeded 非法（需经 running）
    await expect(
      markTaskProgress(deps, { taskId: task.id, status: 'succeeded' }),
    ).rejects.toThrow(/非法/);
    // pending → running → succeeded
    await markTaskProgress(deps, { taskId: task.id, status: 'running', progress: 50 });
    const done = await markTaskProgress(deps, { taskId: task.id, status: 'succeeded', progress: 100, result: { ok: true } });
    expect(done.status).toBe('succeeded');
    expect(db.usageLedger.filter((entry) => entry.idempotencyKey === `agent-task-reserve:${task.id}`)).toHaveLength(1);
    // 终态重放 → skip（§16 幂等，不抛错不覆盖）
    const replay = await markTaskProgress(deps, { taskId: task.id, status: 'running', progress: 10 });
    expect(replay.status).toBe('succeeded');
    expect(replay.progress).toBe(100);
  });

  it('rejects an unknown task kind before persistence or credit reservation', async () => {
    const { deps, user, ro, db } = await makeDeps(1);
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'extract' });
    await expect(submitAgentTask(deps, {
      sessionId: session.id, userId: user.id, kind: 'not.registered', payload: {},
    })).rejects.toThrow(/不支持/);
    expect(db.agentTasks).toHaveLength(0);
    expect(db.usageLedger.filter((entry) => entry.delta < 0)).toHaveLength(0);
  });

  it('永久阻断错误同步为 failed_blocked，不允许普通 retry', async () => {
    const { deps, user, ro, db } = await makeDeps();
    const session = await createAgentSession(deps, { userId: user.id, researchObjectId: ro.id, kind: 'ingestion' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'sdf.extract', payload: {} });
    db.ingestionTasks.push({
      id: 'ingestion-task-1', batchId: 'batch-1', artifactId: 'artifact-1', agentTaskId: task.id,
      state: 'parsing', retryCount: 0, error: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await markTaskProgress(deps, { taskId: task.id, status: 'running' });
    await markTaskProgress(deps, { taskId: task.id, status: 'failed', error: '[blocked] parser rejected unsafe content' });
    expect(db.ingestionTasks[0].state).toBe('failed_blocked');
  });
});
