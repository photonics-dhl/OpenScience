import { createPrismaClient, createRedisClient } from '@openscience/database';
import { markTaskProgress, AGENT_TASK_QUEUE, type AgentDeps } from '@openscience/domain';

/** 任务处理器注册表（Q4：kind → 执行函数；P1D-3 SDF Extractor 挂接）。 */
export type TaskHandler = (deps: AgentDeps, task: { id: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, TaskHandler> = {
  // 占位演示 handler（5.3 Extractor / 5.5 审核实装替换）
  'demo.echo': async (_deps, task) => {
    await sleep(300);
    return { echoed: task.payload?.message ?? null };
  },
};

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * P1D-2 agent-worker 消费者（§14.1 + §9.3 长任务异步 + §16 幂等）：
 * 轮询 Redis 队列 → handler 执行 → markTaskProgress（状态机前进，succeeded 后重放 skip）。
 */
export async function pollOnce(deps: AgentDeps): Promise<boolean> {
  // BRPOPLPUSH：原子弹出 → 处理中队列（崩溃恢复用）
  const taskId = await deps.redis.brpoplpush(AGENT_TASK_QUEUE, `${AGENT_TASK_QUEUE}:processing`, 1);
  if (!taskId) return false;

  try {
    const task = await deps.prisma.agentTask.findUnique({ where: { id: taskId } });
    if (!task) return true;
    // 消费者幂等：已完成（succeeded）→ skip（§16 重放不重复副作用）
    if (task.status === 'succeeded') return true;

    await markTaskProgress(deps, { taskId, status: 'running', progress: 10 });
    const handler = HANDLERS[task.kind] ?? HANDLERS['demo.echo'];
    const result = await handler(deps, { id: task.id, payload: (task.payload ?? {}) as Record<string, unknown> });
    await markTaskProgress(deps, { taskId, status: 'succeeded', progress: 100, result });
    return true;
  } catch (e) {
    await deps.prisma.agentTask.update({
      where: { id: taskId },
      data: { status: 'failed', error: e instanceof Error ? e.message.slice(0, 1000) : String(e) },
    }).catch(() => undefined);
    return true;
  } finally {
    // 从处理中队列移除（已完成）
    await deps.redis.lrem(`${AGENT_TASK_QUEUE}:processing`, 1, taskId).catch(() => undefined);
  }
}

/** 主循环（独立进程入口，云上 systemd/nohup 常驻）。 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const redis = createRedisClient();
  const deps: AgentDeps = { prisma, redis, mailer: { send: async () => undefined } };
  // eslint-disable-next-line no-console
  console.log('agent-worker 启动（P1D-2）');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce(deps);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('poll error', e);
      await sleep(2000);
    }
  }
}

// 主进程入口；被测试 import 时不启动
if (require.main === module) {
  void main();
}
