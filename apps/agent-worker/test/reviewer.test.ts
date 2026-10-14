import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { AiGateway, Provider } from '@openscience/ai-gateway';
import { cancelAgentTask } from '@openscience/domain';
import { aiWarningGuard, reviewAnalyzeHandler, WARNING_CATEGORIES } from '../src/reviewer';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';

const WARNINGS = [
  {
    id: 'w1', category: 'method_logic', evidence: '§方法第 2 段', uncertainty: '无法确认对照组设置',
    suggestion: '补充对照组说明',
  },
];

function warningTaskLock(prisma: ReturnType<typeof createFakePrisma>['prisma'], db: ReturnType<typeof createFakePrisma>['db']) {
  const queryRaw = prisma.$queryRaw.bind(prisma);
  prisma.$queryRaw = (async (query: TemplateStringsArray, ...values: unknown[]) => {
    const sql = query.join('?');
    if (sql.includes('agent_tasks')) {
      if (sql !== 'SELECT id FROM agent_tasks WHERE id = ?::uuid FOR UPDATE' || values.length !== 1) {
        throw new Error('Unexpected task row-lock query');
      }
      return db.agentTasks.filter(task => task.id === values[0]).map(task => ({ id: task.id }));
    }
    return queryRaw(query, ...values);
  }) as typeof prisma.$queryRaw;
}

describe('aiWarningGuard（§11.2 结构化报告 + §9.3 Schema 校验）', () => {
  it('合法警告（evidence + uncertainty 非空）通过', () => {
    expect(aiWarningGuard(WARNINGS)).toBe(true);
    expect(aiWarningGuard([])).toBe(true);
  });

  it('缺 evidence/uncertainty / 非法 category → 拒绝', () => {
    expect(aiWarningGuard([{ ...WARNINGS[0], evidence: '' }])).toBe(false);
    expect(aiWarningGuard([{ ...WARNINGS[0], uncertainty: '' }])).toBe(false);
    expect(aiWarningGuard([{ ...WARNINGS[0], category: 'nope' }])).toBe(false);
    expect(aiWarningGuard('not-array')).toBe(false);
  });

  it('七类枚举完整（§11.2）', () => {
    // 直接消费 WARNING_CATEGORIES（消除重复字面量，防枚举漂移）
    expect(aiWarningGuard(WARNING_CATEGORIES.map((category) => ({ id: 'w', category, evidence: 'e', uncertainty: 'u', suggestion: 's' })))).toBe(true);
    expect(WARNING_CATEGORIES).toHaveLength(7);
  });
});

describe('reviewAnalyzeHandler（§11.2 警告层 + 不阻断）', () => {
  it('调 completeStructured → 写 warnings + 返回 count（不触 status）', async () => {
    const { prisma, db } = createFakePrisma();
    warningTaskLock(prisma, db);
    const user = seedUser(db, { id: 'rvw-user' });
    db.researchObjects.push({ id: 'ro-1', workspaceId: 'ws', title: 'R', createdBy: user.id, status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    const ver = { id: 'v-1', researchObjectId: 'ro-1', commitId: 'c', versionNo: 1, status: 'draft', createdAt: new Date() };
    db.versions.push(ver);
    db.aiReviews.push({
      id: 'review-1', versionId: 'v-1', researchObjectId: 'ro-1', status: 'passed',
      hardBlocks: [], warnings: [], verdict: 'passed', createdAt: new Date(),
    });

    const provider: Provider = { name: 'mock', model: 'mock', complete: async () => ({ text: JSON.stringify(WARNINGS), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const deps = { prisma, mailer: {} as never, redis: { lpush: async () => 1 } } as never;

    db.agentSessions.push({ id: 'session-1', userId: user.id, researchObjectId: 'ro-1', kind: 'review', status: 'active' });
    db.agentTasks.push({
      id: 'task-1', sessionId: 'session-1', kind: 'review.analyze',
      payload: { versionId: 'v-1', coreText: '研究正文……' },
      status: 'running', executionAttempt: 1,
    });
    const result = await reviewAnalyzeHandler(gateway, deps, { id: 'task-1', executionAttempt: 1 });
    expect(result.warningCount).toBe(1);
    const review = await prisma.aiReview.findUnique({ where: { versionId: 'v-1' } });
    expect(review!.warnings).toHaveLength(1);
    // 不阻断：status 仍 passed（无 hardBlocks）
    expect(review!.status).toBe('passed');
  });

  it('refuses to write warnings when the task session and Version belong to different ROs', async () => {
    const { prisma, db } = createFakePrisma();
    const user = seedUser(db, { id: 'rvw-cross-ro-user' });
    db.researchObjects.push(
      { id: 'ro-1', workspaceId: 'ws', title: 'R1', createdBy: user.id, status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 'ro-2', workspaceId: 'ws', title: 'R2', createdBy: user.id, status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() },
    );
    db.versions.push({ id: 'v-2', researchObjectId: 'ro-2', commitId: 'c2', versionNo: 1, status: 'draft', createdAt: new Date() });
    db.agentSessions.push({ id: 'session-1', userId: user.id, researchObjectId: 'ro-1', kind: 'review' });
    db.agentTasks.push({
      id: 'task-1', sessionId: 'session-1', kind: 'review.analyze',
      payload: { versionId: 'v-2', coreText: 'Private text from RO 2' },
    });
    const provider: Provider = { name: 'mock', model: 'mock', complete: async () => ({ text: JSON.stringify(WARNINGS), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const deps = { prisma, mailer: {} as never, redis: { lpush: async () => 1 } } as never;

    await expect(reviewAnalyzeHandler(gateway, deps, { id: 'task-1', executionAttempt: 1 })).rejects.toThrow(/research object/i);
    expect(db.aiReviews).toHaveLength(0);
  });
});

async function executionFixture(onModel: () => Promise<void> = async () => {}) {
  const { prisma, db } = createFakePrisma();
  warningTaskLock(prisma, db);
  const user = seedUser(db, { id: 'warning-owner' });
  db.workspaces.push({ id: 'ws', status: 'active', type: 'team', ownerId: user.id });
  db.memberships.push({ id: 'member', workspaceId: 'ws', userId: user.id, role: 'owner' });
  db.researchObjects.push({ id: 'ro', workspaceId: 'ws', createdBy: user.id, status: 'draft', visibility: 'private' });
  db.versions.push({ id: 'version', researchObjectId: 'ro', commitId: 'original-commit', status: 'draft' });
  db.agentSessions.push({ id: 'session', userId: user.id, researchObjectId: 'ro', kind: 'review', status: 'active' });
  db.agentTasks.push({ id: 'task', sessionId: 'session', kind: 'review.analyze', status: 'running',
    executionAttempt: 1, retryCount: 0, progress: 10, error: null, result: null,
    payload: { coreText: 'Original source', versionId: 'version' }, createdAt: new Date(), updatedAt: new Date() });
  db.aiReviews.push({ id: 'review', versionId: 'version', researchObjectId: 'ro', status: 'blocked',
    hardBlocks: [{ code: 'license_missing', reason: 'keep' }], verdict: 'keep', createdAt: new Date(),
    warnings: [{ code: 'claim_evidence_snapshot', digest: 'original' }, { code: 'old_warning' }] });
  const complete = vi.fn(async () => {
    await onModel();
    return { text: JSON.stringify(WARNINGS), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' };
  });
  const provider: Provider = { name: 'mock', model: 'mock', complete };
  const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] });
  const deps = { prisma, mailer: {} as never, redis: { lpush: async () => 1 } as never };
  const task = { id: 'task', executionAttempt: 1 };
  const stop = () => cancelAgentTask(deps, { userId: user.id, taskId: task.id, expectedExecutionAttempt: 1 });
  return { prisma, db, gateway, deps, task, complete, stop };
}

describe('reviewAnalyzeHandler cancellation adoption boundary', () => {
  it('denies warnings when stop commits between beforePersist and the actual adoption transaction', async () => {
    const { prisma, db, gateway, deps, task, complete, stop } = await executionFixture();
    const before = structuredClone(db.aiReviews[0]);
    const transaction = prisma.$transaction.bind(prisma);
    let afterCheck = false;
    prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      if (afterCheck) { afterCheck = false; await stop(); }
      return transaction(callback, options as never);
    }) as typeof prisma.$transaction;
    const write = vi.spyOn(prisma.aiReview, 'update');
    await expect(reviewAnalyzeHandler(gateway, deps, task, { beforePersist: async () => {
      expect(db.agentTasks[0]).toMatchObject({ status: 'running', executionAttempt: 1 });
      afterCheck = true;
    } })).rejects.toThrow(/review execution/i);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(db.aiReviews[0]).toEqual(before);
  });

  it.each([undefined, 0, 2, NaN])('rejects missing/invalid/stale claimed attempt %s before model submission', async (executionAttempt) => {
    const { db, gateway, deps, complete } = await executionFixture();
    const before = structuredClone(db.aiReviews[0]);
    await expect(reviewAnalyzeHandler(gateway, deps, { id: 'task', executionAttempt } as never)).rejects.toThrow(/review execution/i);
    expect(complete).not.toHaveBeenCalled();
    expect(db.aiReviews[0]).toEqual(before);
  });

  it('does not replace the captured attempt with a newer caller or persisted attempt after the model', async () => {
    const replace = () => { task.executionAttempt = 2; db.agentTasks[0].executionAttempt = 2; };
    const { db, gateway, deps, task, complete } = await executionFixture(async () => replace());
    const before = structuredClone(db.aiReviews[0]);
    await expect(reviewAnalyzeHandler(gateway, deps, task)).rejects.toThrow(/review execution/i);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(db.aiReviews[0]).toEqual(before);
  });

  it('keeps original source binding when the task payload changes during the model', async () => {
    const replace = () => { db.agentTasks[0].payload.coreText = 'Replacement source'; };
    const { db, gateway, deps, task, complete } = await executionFixture(async () => replace());
    const before = structuredClone(db.aiReviews[0]);
    await expect(reviewAnalyzeHandler(gateway, deps, task)).rejects.toThrow(/review execution/i);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(db.aiReviews[0]).toEqual(before);
  });

  it.each(['P2034', 'raw40001'])('retries only adoption after %s without another model call or losing original markers', async (code) => {
    const { prisma, db, gateway, deps, task, complete } = await executionFixture();
    const before = structuredClone(db.aiReviews[0]);
    const transaction = prisma.$transaction.bind(prisma);
    let attempts = 0;
    prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      attempts += 1;
      return transaction(async tx => {
        const result = await callback(tx);
        if (attempts === 1) throw Object.assign(new Error('serialization conflict'), code === 'P2034'
          ? { code: 'P2034' } : { code: 'P2010', meta: { code: '40001' } });
        return result;
      }, options as never);
    }) as typeof prisma.$transaction;
    await expect(reviewAnalyzeHandler(gateway, deps, task)).resolves.toEqual({ warningCount: 1 });
    expect(attempts).toBe(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(db.aiReviews[0]).toEqual({ ...before, warnings: [before.warnings[0], ...WARNINGS] });
  });
});
