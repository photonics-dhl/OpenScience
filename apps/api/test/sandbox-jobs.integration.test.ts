import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@openscience/database';
import {
  createSandboxJob,
  getSandboxJob,
  checkPythonTaskQuota,
  SandboxQuotaError,
  updateSandboxJobStatus,
  onSandboxJobCompleted,
} from '@openscience/domain';

/**
 * P1E-5 集成测试（云上执行）：Python 沙箱作业 API
 * - 配额检查（月度任务数、并发数、运行时）
 * - 幂等性（Idempotency-Key）
 * - 事件处理（审计 + usage）
 */

const prisma = createPrismaClient();

let testUserId: string;
let testWorkspaceId: string;

beforeAll(async () => {
  // 创建测试用户与 workspace
  const user = await prisma.user.create({
    data: {
      email: `sandbox-test-${Date.now()}@example.com`,
      displayName: 'Sandbox Test User',
      passwordHash: 'test',
      status: 'email_verified',
      level: 'free',
    },
  });
  testUserId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Sandbox Test Workspace',
      type: 'personal',
      ownerId: testUserId,
    },
  });
  testWorkspaceId = workspace.id;

  await prisma.membership.create({
    data: {
      userId: testUserId,
      workspaceId: testWorkspaceId,
      role: 'owner',
    },
  });

  // 本测试依赖 user_level=free 的沙箱配额策略（3/月、并发 1、900s/月）。
  // 迁移 20 的 seed 会被其他集成文件 afterAll 的 quotaPolicy.deleteMany() 全表清理抹掉
  //（2026-08-06 云上实证：quota_policies 0 行 → resolvePolicy null → 配额永不触发），
  // 故自建夹具，afterAll 按行精确回收。
  for (const [resource, limitValue] of [
    ['python_task_count', 3],
    ['concurrent_tasks', 1],
    ['python_runtime_seconds', 900],
  ] as const) {
    await prisma.quotaPolicy.create({
      data: { scope: 'user_level', scopeKey: 'free', resource, limitValue },
    });
  }
});

afterAll(async () => {
  // 清理测试数据（含 beforeAll 自建的 free 档配额策略行）
  await prisma.quotaPolicy.deleteMany({ where: { scope: 'user_level', scopeKey: 'free' } });
  await prisma.sandboxJob.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.membership.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.workspace.delete({ where: { id: testWorkspaceId } });
  await prisma.usageLedger.deleteMany({ where: { userId: testUserId } });
  await prisma.auditLog.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.$disconnect();
});

describe('P1E-5 Sandbox Jobs API（迁移 13+14）', () => {
  it('创建沙箱作业并查询状态', async () => {
    const script = 'print("Hello, sandbox!")';
    const job = await createSandboxJob(
      { prisma },
      {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        script,
      },
    );

    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');
    expect(job.script).toBe(script);

    const retrieved = await getSandboxJob({ prisma }, job.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(job.id);
    expect(retrieved!.status).toBe('pending');
    expect(retrieved!.artifacts).toEqual([]);
  });

  it('幂等性：同一 idempotencyKey 返回相同作业', async () => {
    const idempotencyKey = `test-idempotency-${Date.now()}`;
    const script = 'print("Idempotent test")';

    const job1 = await createSandboxJob(
      { prisma },
      {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        script,
        idempotencyKey,
      },
    );

    const job2 = await createSandboxJob(
      { prisma },
      {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        script: 'print("Different script")', // 不同内容
        idempotencyKey, // 相同 key
      },
    );

    expect(job2.id).toBe(job1.id);
    expect(job2.script).toBe(script); // 返回原始作业
  });

  it('月度任务数配额超限', async () => {
    // Free tier: 3 tasks/month（已在 migration 14 中设置）
    const currentMonth = new Date().toISOString().slice(0, 7);

    // 创建 3 个作业（达到 free tier 配额）
    for (let i = 0; i < 3; i++) {
      await createSandboxJob(
        { prisma },
        {
          workspaceId: testWorkspaceId,
          userId: testUserId,
          script: `print("Task ${i}")`,
        },
      );
    }

    // 第 4 个作业应触发配额限制
    await expect(
      checkPythonTaskQuota(
        { prisma },
        {
          workspaceId: testWorkspaceId,
          userId: testUserId,
          userLevel: 'free',
          currentMonth,
        },
      ),
    ).rejects.toThrow(SandboxQuotaError);
  });

  it('并发任务数配额超限', async () => {
    // 清理之前的作业
    await prisma.sandboxJob.deleteMany({ where: { workspaceId: testWorkspaceId } });

    // Free tier: 1 concurrent task
    await createSandboxJob(
      { prisma },
      {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        script: 'import time; time.sleep(10)', // pending 状态
      },
    );

    const currentMonth = new Date().toISOString().slice(0, 7);

    // 第 2 个并发作业应触发配额限制
    await expect(
      checkPythonTaskQuota(
        { prisma },
        {
          workspaceId: testWorkspaceId,
          userId: testUserId,
          userLevel: 'free',
          currentMonth,
        },
      ),
    ).rejects.toThrow(SandboxQuotaError);
  });

  it('作业完成事件：审计日志 + 用量记录', async () => {
    // 创建作业
    const job = await createSandboxJob(
      { prisma },
      {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        script: 'print("Event test")',
      },
    );

    // 模拟作业完成
    const result = {
      stdout: 'Event test\n',
      stderr: '',
      exitCode: 0,
      runtimeSeconds: 5,
    };

    await updateSandboxJobStatus(
      { prisma },
      {
        jobId: job.id,
        status: 'completed',
        result,
      },
    );

    // 触发完成事件
    const updatedJob = await getSandboxJob({ prisma }, job.id);
    await onSandboxJobCompleted(
      { prisma },
      {
        job: updatedJob!,
        result,
        actorId: testUserId,
      },
    );

    // 验证审计日志
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId: testWorkspaceId,
        action: 'sandbox.execute',
      },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
    const log = auditLogs[auditLogs.length - 1];
    expect(log.actorId).toBe(testUserId);
    expect(log.metadata).toMatchObject({
      jobId: job.id,
      status: 'completed',
      runtimeSeconds: 5,
    });

    // 验证用量记录
    const usageLedger = await prisma.usageLedger.findMany({
      where: {
        userId: testUserId,
        resource: 'python_runtime_seconds',
      },
    });
    expect(usageLedger.length).toBeGreaterThan(0);
    const usage = usageLedger[usageLedger.length - 1];
    expect(usage.delta).toBe(BigInt(-5)); // 消费 5 秒
  });
});
