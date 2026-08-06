import { createPrismaClient, createRedisClient } from '@openscience/database';
import { AiGateway, OpenAiCompatProvider } from '@openscience/ai-gateway';
import { markTaskProgress, AGENT_TASK_QUEUE, type AgentDeps } from '@openscience/domain';
import { extractHandler } from './extractor';
import { reviewAnalyzeHandler } from './reviewer';
import { visualizationPlanHandler } from './planner';

/** 任务处理器注册表（Q4：kind → 执行函数）。 */
export type TaskHandler = (deps: AgentDeps, task: { id: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>;

/** 构造处理器注册表（P1D-3 挂 sdf.extract；后续 5.5 审核等挂接）。 */
export function createHandlers(gateway: AiGateway): Record<string, TaskHandler> {
  return {
    'demo.echo': async () => {
      await sleep(300);
      return { echoed: true };
    },
    'sdf.extract': async (_deps, task) => extractHandler(gateway, task),
    'review.analyze': async (deps, task) => reviewAnalyzeHandler(gateway, deps, task),
    'visualization.plan': async (_deps, task) => visualizationPlanHandler(gateway, task), // P1E-1
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * P1D-2/3 agent-worker 消费者（§14.1 + §9.3 长任务异步 + §16 幂等）：
 * 轮询 Redis 队列 → handler 执行 → markTaskProgress（状态机前进，succeeded 后重放 skip）。
 */
export async function createPollOnce(handlers: Record<string, TaskHandler>): Promise<(deps: AgentDeps) => Promise<boolean>> {
  return async function pollOnce(deps: AgentDeps): Promise<boolean> {
    // BRPOPLPUSH：原子弹出 → 处理中队列（崩溃恢复用）
    const taskId = await deps.redis.brpoplpush(AGENT_TASK_QUEUE, `${AGENT_TASK_QUEUE}:processing`, 1);
    if (!taskId) return false;

    try {
      const task = await deps.prisma.agentTask.findUnique({ where: { id: taskId } });
      if (!task) return true;
      // 消费者幂等：已完成（succeeded）→ skip（§16 重放不重复副作用）
      if (task.status === 'succeeded') return true;

      await markTaskProgress(deps, { taskId, status: 'running', progress: 10 });
      const handler = handlers[task.kind] ?? handlers['demo.echo'];
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
  };
}

/** 主循环（独立进程入口，云上 systemd/nohup 常驻）。 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const redis = createRedisClient();
  const deps: AgentDeps = { prisma, redis, mailer: { send: async () => undefined } };
  // Gateway（§24 占位：AI_ENABLED=false 时懒加载；生产 env 注入密钥，§17）
  const gateway = buildGateway();
  const handlers = createHandlers(gateway);
  const pollOnce = await createPollOnce(handlers);
  console.log('agent-worker 启动（P1D-2/3）');
  while (true) {
    try {
      await pollOnce(deps);
    } catch (e) {
      console.error('poll error', e);
      await sleep(2000);
    }
  }
}

/** 从 env 构造 Gateway（AI_ENABLED=false 或缺密钥 → 占位 gateway，sdf.extract 会失败；§24 待确认）。 */
function buildGateway() {
  const baseUrl = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1';
  const apiKey = process.env.MINIMAX_API_KEY ?? '';
  const primaryModel = process.env.MINIMAX_MODEL ?? 'MiniMax-M3';
  const fallbackModels = (process.env.AI_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const providers = [
    new OpenAiCompatProvider(primaryModel, { baseUrl, apiKey, model: primaryModel }),
    ...fallbackModels.map((m) => new OpenAiCompatProvider(m, { baseUrl, apiKey, model: m })),
  ];
  return new AiGateway({ providers, logger: console });
}

// 主进程入口；被测试 import 时不启动
if (require.main === module) {
  void main();
}
