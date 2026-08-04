import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createAgentSession, submitAgentTask, createApproval, approveApproval, revokeApproval, AGENT_TASK_QUEUE } from '@openscience/domain';

/**
 * P1D-4 集成测试（云上执行）：真 PG/Redis。
 * ToolApproval 生命周期：create → approve → revoke + 审计（§9.4/§15/§17）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();

beforeAll(async () => {
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.toolApproval.deleteMany();
  await prisma.agentTask.deleteMany();
  await prisma.agentSession.deleteMany();
});

afterAll(async () => {
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.toolApproval.deleteMany();
  await prisma.agentTask.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.usageLedger.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1D-4 R0-R4 分级审批（云上，迁移 15 ToolApproval）', () => {
  it('R3 审批 create → approve → 状态 + 审计 + 五要素（§9.4/§15/§17）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined }, audit: createPrismaAuditSink(prisma) };
    const user = await prisma.user.create({
      data: { email: `ap${Date.now()}@example.com`, displayName: 'ap', passwordHash: 'x', status: 'email_verified' },
    });
    await prisma.usageLedger.create({ data: { userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });
    const session = await createAgentSession(deps, { userId: user.id, kind: 'publish' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} });

    // create（R3：merge.pull_request 分级判定）
    const approval = await createApproval(deps, { taskId: task.id, action: 'merge.pull_request', scope: 'pr:1', title: '合并 PR' });
    expect(approval).not.toBeNull();
    expect(approval!.level).toBe(3);
    expect(approval!.status).toBe('pending');
    // §9.4 五要素
    expect(approval!.confirmation.what).toContain('合并 PR');
    expect(approval!.confirmation.scope).toBeTruthy();
    expect(approval!.confirmation.reversible).toBeTruthy();

    // approve（owner）
    const approved = await approveApproval(deps, { userId: user.id, approvalId: approval!.id });
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(user.id);

    // §17 审计
    const audit = await prisma.auditLog.count({ where: { action: 'approval.approve', targetId: approval!.id } });
    expect(audit).toBe(1);

    // revoke（§2.5-7 撤销）
    const revoked = await revokeApproval(deps, { userId: user.id, approvalId: approval!.id });
    expect(revoked.status).toBe('revoked');
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('非 owner approve → 403；R0 action 不建审批（§9.4）', async () => {
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    const userA = await prisma.user.create({
      data: { email: `ap2a${Date.now()}@example.com`, displayName: 'ap2a', passwordHash: 'x', status: 'email_verified' },
    });
    const userB = await prisma.user.create({
      data: { email: `ap2b${Date.now()}@example.com`, displayName: 'ap2b', passwordHash: 'x', status: 'email_verified' },
    });
    await prisma.usageLedger.create({ data: { userId: userA.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });
    const session = await createAgentSession(deps, { userId: userA.id, kind: 'extract' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: userA.id, kind: 'demo.echo', payload: {} });

    // R0 自动执行
    const auto = await createApproval(deps, { taskId: task.id, action: 'get' });
    expect(auto).toBeNull();

    // 非 owner → 403
    const approval = await createApproval(deps, { taskId: task.id, action: 'license.upsert' });
    await expect(
      approveApproval(deps, { userId: userB.id, approvalId: approval!.id }),
    ).rejects.toThrow(/仅任务所有者/);
    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });
});
