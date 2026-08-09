import { createPrismaClient, createRedisClient } from '@openscience/database';
import { AiGateway, AnthropicCompatProvider, OpenAiCompatProvider } from '@openscience/ai-gateway';
import { claimAgentTask, markTaskProgress, AGENT_TASK_QUEUE, type AgentDeps } from '@openscience/domain';
import { createStorageAdapter, getBlob, storageConfigFromEnv, streamToBuffer, type StorageAdapter } from '@openscience/storage';
import { extractHandler } from './extractor';
import { createDefaultIngestionAdapters, parseIngestion, parseIngestionWithAdapters, type IngestionAdapters } from './ingestion-parser';
import { reviewAnalyzeHandler } from './reviewer';
import { visualizationPlanHandler } from './planner';
import { createClamAvScanner, type MalwareScanner } from './clamav';

/** 任务处理器注册表（Q4：kind → 执行函数）。 */
export type WorkerDeps = AgentDeps & { storage?: StorageAdapter; ingestionAdapters?: IngestionAdapters; malwareScanner?: MalwareScanner };
export type TaskHandler = (deps: WorkerDeps, task: { id: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>;

/** 构造处理器注册表（P1D-3 挂 sdf.extract；后续 5.5 审核等挂接）。 */
export function createHandlers(gateway: AiGateway): Record<string, TaskHandler> {
  return {
    'demo.echo': async () => {
      await sleep(300);
      return { echoed: true };
    },
    'sdf.extract': async (deps, task) => {
      const artifactId = typeof task.payload.artifactId === 'string' ? task.payload.artifactId : null;
      if (!artifactId) return extractHandler(gateway, task);
      if (!deps.storage) throw new Error('缺少对象存储适配器，无法读取 Artifact');
      const artifact = await deps.prisma.artifact.findUnique({ where: { id: artifactId } });
      if (!artifact) throw new Error('Artifact 不存在');
      const blob = await getBlob(deps.storage, artifact.blobSha256);
      const bytes = await streamToBuffer(blob.body);
      if (deps.malwareScanner) await deps.malwareScanner(bytes);
      const parsed = deps.ingestionAdapters
        ? await parseIngestionWithAdapters(artifact.logicalPath, bytes, deps.ingestionAdapters)
        : parseIngestion(artifact.logicalPath, bytes);
      if (parsed.status === 'needs_review') return { status: parsed.status, format: parsed.format, reason: parsed.reason };
      return extractHandler(gateway, { payload: { manuscriptText: parsed.text } });
    },
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
export async function createPollOnce(handlers: Record<string, TaskHandler>): Promise<(deps: WorkerDeps) => Promise<boolean>> {
  return async function pollOnce(deps: WorkerDeps): Promise<boolean> {
    // BRPOPLPUSH：原子弹出 → 处理中队列（崩溃恢复用）
    const taskId = await deps.redis.brpoplpush(AGENT_TASK_QUEUE, `${AGENT_TASK_QUEUE}:processing`, 1);
    if (!taskId) return false;

    try {
      const task = await deps.prisma.agentTask.findUnique({ where: { id: taskId } });
      if (!task) return true;
      if (!await claimAgentTask(deps, taskId)) return true;
      const handler = handlers[task.kind] ?? handlers['demo.echo'];
      const result = await handler(deps, { id: task.id, payload: (task.payload ?? {}) as Record<string, unknown> });
      await markTaskProgress(deps, { taskId, status: 'succeeded', progress: 100, result });
      return true;
    } catch (e) {
      await markTaskProgress(deps, {
        taskId, status: 'failed', error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
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
  const storage = createStorageAdapter(storageConfigFromEnv());
  const deps: WorkerDeps = {
    prisma, redis, storage, ingestionAdapters: createDefaultIngestionAdapters(),
    malwareScanner: process.env.CLAMAV_HOST ? createClamAvScanner(process.env.CLAMAV_HOST, Number(process.env.CLAMAV_PORT ?? 3310)) : undefined,
    mailer: { send: async () => undefined },
  };
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
export function buildGateway(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = globalThis.fetch): AiGateway {
  const primaryModel = env.MINIMAX_MODEL ?? 'MiniMax-M3';
  const fallbackModels = (env.AI_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const models = [primaryModel, ...fallbackModels];
  const keys = [env.MINIMAX_API_KEY, env.MINIMAX_API_KEY_2].filter(
    (key, index, all): key is string => Boolean(key) && all.indexOf(key) === index,
  );
  const configuredKeys = keys.length > 0 ? keys : [''];
  const providers = configuredKeys.flatMap((apiKey, keyIndex) => {
    const configuredMode = env.MINIMAX_API_MODE ?? 'auto';
    const tokenPlan = configuredMode === 'anthropic' || (configuredMode === 'auto' && apiKey.startsWith('sk-cp-'));
    const baseUrl = tokenPlan
      ? env.MINIMAX_TOKEN_PLAN_BASE_URL ?? 'https://api.minimax.io/anthropic'
      : env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1';
    return models.map((model, modelIndex) => {
      const name = `minimax-key-${keyIndex + 1}-model-${modelIndex + 1}`;
      const config = { baseUrl, apiKey, model };
      return tokenPlan
        ? new AnthropicCompatProvider(name, config, fetcher)
        : new OpenAiCompatProvider(name, config, fetcher);
    });
  });
  return new AiGateway({ providers, logger: console });
}

// 主进程入口；被测试 import 时不启动
if (require.main === module) {
  void main();
}
