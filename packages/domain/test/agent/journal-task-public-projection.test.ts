import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import {
  AGENT_TASK_KINDS, getAgentTask, listAgentSessions, listAgentTasks, projectAgentTaskResult, retryAgentTask, submitAgentTask,
  type AgentDeps,
} from '../../src/agent/agent';

// Shape persisted by journal/processing.ts and native-agent/journal-task-store.ts.
function journalResult(state: 'started' | 'completed' = 'started') {
  return {
    nativeAgentExecution: { kind: 'hermes-agent', profile: 'journal-editor', runtimeId: 'installed-runtime',
      skillCatalogueId: 'installed-catalogue', model: 'MiniMax-M3' },
    nativeAgentObjects: [{ objectKey: 'derived/native-agent/journal-private.json' }],
    journalNativeCheckpoint: {
      taskId: 'journal-task', objectKey: 'derived/native-agent/journal-private.json',
      serializedSha256: 'a'.repeat(64), size: 100, executionAttempt: 1, jobId: 'journal-job',
      sourceDigest: 'b'.repeat(64), revision: 1, sourceTextSha256: 'c'.repeat(64), turnCount: 1, state,
      target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) },
      ...(state === 'completed' ? { responseHash: 'e'.repeat(64), finishReason: 'stop', hasToolCalls: false } : {}),
    },
  };
}

function fixture(kind = 'journal.generate', sessionKind = 'journal-editor', status = 'running') {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'journal-requester' });
  const now = new Date();
  const session = { id: 'journal-session', userId: user.id, researchObjectId: null as string | null, kind: sessionKind,
    title: 'Journal journal-job', status: 'active', deletedAt: null as Date | null, idempotencyKey: 'journal-native-session:journal-job',
    createdAt: now, updatedAt: now };
  const task = { id: 'journal-task', sessionId: session.id, kind, status, progress: 0,
    retryCount: 0, executionAttempt: 1, deletedAt: null, dispatchedAt: null,
    payload: { journalJobId: 'journal-job', leaseToken: 'private-lease', sourceDigest: 'b'.repeat(64), revision: 1 },
    interestContext: null, idempotencyKey: 'journal-native-task:journal-job', result: journalResult(),
    error: null as string | null, createdAt: now, updatedAt: now };
  db.agentSessions.push(session);
  db.agentTasks.push(task);
  const redis = { lpush: vi.fn() };
  const deps = { prisma, mailer: {}, redis } as unknown as AgentDeps;
  return { deps, db, user, session, task, redis };
}

describe('journal control tasks stay private to their journal workflow', () => {
  it.each(['started', 'completed'] as const)('projects no journal control result, including new internal fields (%s)', state => {
    const stored = { ...journalResult(state), futureJournalControl: { paidOutcome: 'unknown', privateToken: 'control' } };
    const before = structuredClone(stored);
    expect(projectAgentTaskResult(stored, 'journal.generate')).toBeNull();
    expect(stored).toEqual(before);
  });

  it.each(AGENT_TASK_KINDS)('strips journal checkpoints from %s without changing its product result', kind => {
    const product = { progressNote: 'Paid request outcome unconfirmed', assetId: 'saved-asset',
      status: 'unknown', resultVersion: { futurePublicField: 'retained' } };
    const stored = { ...product, ...journalResult() };
    const before = structuredClone(stored);
    expect(projectAgentTaskResult(stored, kind)).toEqual(product);
    expect(stored).toEqual(before);
  });

  it('excludes internal journal tasks before the dashboard limit and applies redaction to public list/get', async () => {
    const { deps, db, user, session, task } = fixture();
    for (let index = 1; index <= 25; index += 1) db.agentTasks.push({ ...task, id: `journal-control-${index}`,
      ...(index % 2 === 0 ? { kind: 'demo.echo' } : {}) });
    const publicSession = { ...session, id: 'public-session', kind: 'extract', idempotencyKey: null };
    const product = { progressNote: 'Paid request outcome unconfirmed', status: 'unknown', assetId: 'saved-asset' };
    const publicTask = { ...task, id: 'public-task', sessionId: publicSession.id, kind: 'presentation.generate',
      result: { ...product, journalNativeCheckpoint: journalResult().journalNativeCheckpoint } };
    db.agentSessions.push(publicSession);
    db.agentTasks.push(publicTask);
    const historicalTask = { ...publicTask, id: 'historical-paid-task', kind: 'historical.paid-task', result: product };
    db.agentTasks.push(historicalTask);
    const other = seedUser(db, { id: 'other-requester' });
    db.agentSessions.push({ ...publicSession, id: 'other-session', userId: other.id });
    db.agentTasks.push({ ...publicTask, id: 'other-task', sessionId: 'other-session' });
    const before = structuredClone(db.agentTasks);

    for (const actionableOnly of [undefined, true, false]) {
      const tasks = await listAgentTasks(deps, { userId: user.id, actionableOnly });
      expect(tasks).toEqual([
        expect.objectContaining({ id: publicTask.id, canRetry: false, result: product }),
        expect.objectContaining({ id: historicalTask.id, canRetry: false, result: product }),
      ]);
    }
    await expect(listAgentTasks(deps, { userId: user.id, kind: 'journal.generate' })).resolves.toEqual([]);
    await expect(listAgentTasks(deps, { userId: user.id, kind: publicTask.kind }))
      .resolves.toEqual([expect.objectContaining({ id: publicTask.id, result: product })]);
    await expect(getAgentTask(deps, { userId: user.id, taskId: publicTask.id }))
      .resolves.toMatchObject({ id: publicTask.id, result: product, canRetry: false });
    await expect(getAgentTask(deps, { userId: user.id, taskId: historicalTask.id }))
      .resolves.toMatchObject({ id: historicalTask.id, result: product, canRetry: false });
    await expect(getAgentTask(deps, { userId: other.id, taskId: publicTask.id }))
      .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    expect(db.agentTasks).toEqual(before);
  });

  it('omits control and retained sessions from the ordinary assistant session list', async () => {
    const { deps, db, user, session } = fixture();
    db.agentSessions.push({ ...session, id: 'public-session', kind: 'retrieval' });
    db.agentSessions.push({ ...session, id: 'retained-session', kind: 'retained.products' });
    db.agentSessions.push({ ...session, id: 'other-session', kind: 'extract', userId: 'other-user' });
    await expect(listAgentSessions(deps, { userId: user.id }))
      .resolves.toEqual([expect.objectContaining({ id: 'public-session', kind: 'retrieval' })]);
  });

  it.each(['running', 'failed', 'succeeded'])('excludes an internal session from targeted source recovery (%s)', async status => {
    const { deps, db, user, session, task } = fixture('source.retrieve', 'journal-editor', status);
    db.workspaces.push({ id: 'workspace', status: 'active' });
    db.researchObjects.push({ id: 'research-object', workspaceId: 'workspace', deletedAt: null });
    db.memberships.push({ workspaceId: 'workspace', userId: user.id, role: 'owner' });
    session.researchObjectId = 'research-object';
    Object.assign(task, { error: status === 'failed' ? '[retryable] upstream timeout' : null,
      payload: { query: 'paper', providers: ['semantic_scholar', 'tavily'], limit: 10, includeFullText: false,
        retryContractVersion: 1, target: { kind: 'personal' } } });
    const before = structuredClone(db.agentTasks);
    await expect(listAgentTasks(deps, { userId: user.id, kind: 'source.retrieve', recoveryPreferred: true,
      recoveryTarget: { kind: 'personal' } })).resolves.toEqual([]);
    expect(db.agentTasks).toEqual(before);
  });

  it('rejects normal task submission into an internal journal session before charging or dispatching', async () => {
    const { deps, db, user, session, redis } = fixture();
    db.usageLedger.push({ id: 'credit-grant', userId: user.id, resource: 'ai_credit', delta: 10, kind: 'grant', createdAt: new Date() });
    const tasksBefore = structuredClone(db.agentTasks);
    const ledgerBefore = structuredClone(db.usageLedger);
    await expect(submitAgentTask(deps, { userId: user.id, sessionId: session.id, kind: 'demo.echo', payload: { message: 'hello' } }))
      .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    expect(db.agentTasks).toEqual(tasksBefore);
    expect(db.usageLedger).toEqual(ledgerBefore);
    expect(redis.lpush).not.toHaveBeenCalled();
  });

  it.each([['journal.generate', 'extract'], ['demo.echo', 'journal-editor']])(
    'rejects partial control identity (%s in %s)', async (kind, sessionKind) => {
      const { deps, user, task } = fixture(kind, sessionKind);
      await expect(getAgentTask(deps, { userId: user.id, taskId: task.id }))
        .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    },
  );

  it.each(['pending', 'running', 'succeeded', 'failed'])('does not expose an owner journal control task (%s)', async status => {
    const { deps, db, user, session, task, redis } = fixture('journal.generate', 'journal-editor', status);
    if (status === 'succeeded') {
      task.result = journalResult('completed');
      session.deletedAt = new Date();
    }
    if (status === 'failed') task.error = 'provider response unavailable';
    const before = structuredClone(db.agentTasks);

    await expect(getAgentTask(deps, { userId: user.id, taskId: task.id }))
      .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    expect(db.agentTasks).toEqual(before);
    expect(redis.lpush).not.toHaveBeenCalled();
    expect(db.usageLedger).toEqual([]);
  });

  it.each(['pending', 'running', 'succeeded', 'failed'])('does not retry an owner journal control task (%s)', async status => {
    const { deps, db, user, task, redis } = fixture('journal.generate', 'journal-editor', status);
    if (status === 'failed') task.error = 'provider response unavailable';
    const before = structuredClone(db.agentTasks);
    await expect(retryAgentTask(deps, { userId: user.id, taskId: task.id }))
      .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    expect(db.agentTasks).toEqual(before);
    expect(redis.lpush).not.toHaveBeenCalled();
    expect(db.usageLedger).toEqual([]);
  });
});
