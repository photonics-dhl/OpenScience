import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { AiGateway, AnthropicCompatProvider, OpenAiCompatProvider } from '@openscience/ai-gateway';
import {
  claimAgentTask, markTaskProgress, prepareAgentTaskForCrashRecovery, recoverUndispatchedAgentTasks,
  AGENT_TASK_QUEUE, type AgentDeps,
} from '@openscience/domain';
import { createStorageAdapter, getBlob, storageConfigFromEnv, type StorageAdapter } from '@openscience/storage';
import type { Readable } from 'node:stream';
import { extractHandler } from './extractor';
import { MAX_PARSER_INPUT, parseIngestion, parseIngestionWithAdapters, type IngestionAdapters } from './ingestion-parser';
import { reviewAnalyzeHandler } from './reviewer';
import { visualizationPlanHandler } from './planner';
import { workspaceGuideHandler } from './workspace-guide';
import { createClamAvScanner, type MalwareScanner } from './clamav';
import { createParserJobAdapters } from './parser-job-isolation';

/** 任务处理器注册表（Q4：kind → 执行函数）。 */
export type WorkerDeps = AgentDeps & { storage?: StorageAdapter; ingestionAdapters?: IngestionAdapters; malwareScanner?: MalwareScanner };
export type TaskHandler = (deps: WorkerDeps, task: { id: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>;

export async function streamToBufferBounded(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy();
      throw new Error('object body exceeds limit');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

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
      const ownerTask = await deps.prisma.agentTask.findUnique({
        where: { id: task.id },
        include: { session: { include: { researchObject: true } } },
      });
      const artifact = await deps.prisma.artifact.findUnique({ where: { id: artifactId } });
      const ownerResearchObject = ownerTask?.session.researchObject;
      if (!artifact || !ownerResearchObject
        || task.payload.researchObjectId !== ownerResearchObject.id
        || artifact.workspaceId !== ownerResearchObject.workspaceId) {
        throw new Error('Artifact 不存在或不属于当前研究对象 Workspace');
      }
      const membership = await deps.prisma.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: ownerResearchObject.workspaceId,
            userId: ownerTask.session.userId,
          },
        },
      });
      if (!membership) throw new Error('[blocked] workspace membership revoked');
      if (Number(artifact.size) > MAX_PARSER_INPUT) {
        throw new Error('[blocked] artifact exceeds parser limit');
      }
      if (!deps.malwareScanner) throw new Error('[blocked] malware scanner unavailable');
      const blob = await getBlob(deps.storage, artifact.blobSha256);
      const bytes = await streamToBufferBounded(blob.body, MAX_PARSER_INPUT);
      await deps.malwareScanner(bytes);
      const parsed = deps.ingestionAdapters
        ? await parseIngestionWithAdapters(artifact.logicalPath, bytes, deps.ingestionAdapters)
        : parseIngestion(artifact.logicalPath, bytes);
      if (parsed.status === 'needs_review') return { status: parsed.status, format: parsed.format, reason: parsed.reason };
      return extractHandler(gateway, { payload: { manuscriptText: parsed.text } });
    },
    'review.analyze': async (deps, task) => reviewAnalyzeHandler(gateway, deps, task),
    'visualization.plan': async (_deps, task) => visualizationPlanHandler(gateway, task), // P1E-1
    'workspace.guide': async (deps, task) => workspaceGuideHandler(gateway, deps, task),
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AGENT_TASK_PROCESSING_QUEUE = `${AGENT_TASK_QUEUE}:processing`;

/** Single-consumer startup recovery for tasks stranded by a previous worker process. */
export async function recoverProcessingQueue(deps: WorkerDeps): Promise<number> {
  let recovered = 0;
  while (true) {
    const taskId = await deps.redis.lindex(AGENT_TASK_PROCESSING_QUEUE, -1);
    if (!taskId) return recovered;
    const retryable = await prepareAgentTaskForCrashRecovery(deps, taskId);
    if (retryable) {
      const moved = await deps.redis.rpoplpush(AGENT_TASK_PROCESSING_QUEUE, AGENT_TASK_QUEUE);
      if (moved) recovered += 1;
    } else {
      await deps.redis.lrem(AGENT_TASK_PROCESSING_QUEUE, 1, taskId);
    }
  }
}

/**
 * P1D-2/3 agent-worker 消费者（§14.1 + §9.3 长任务异步 + §16 幂等）：
 * 轮询 Redis 队列 → handler 执行 → markTaskProgress（状态机前进，succeeded 后重放 skip）。
 */
export async function createPollOnce(handlers: Record<string, TaskHandler>): Promise<(deps: WorkerDeps) => Promise<boolean>> {
  return async function pollOnce(deps: WorkerDeps): Promise<boolean> {
    await recoverUndispatchedAgentTasks(deps);
    // BRPOPLPUSH：原子弹出 → 处理中队列（崩溃恢复用）
    const taskId = await deps.redis.brpoplpush(AGENT_TASK_QUEUE, AGENT_TASK_PROCESSING_QUEUE, 1);
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
      await deps.redis.lrem(AGENT_TASK_PROCESSING_QUEUE, 1, taskId).catch(() => undefined);
    }
  };
}

/** 主循环（独立进程入口，云上 systemd/nohup 常驻）。 */
async function main(): Promise<void> {
  const parserJobDir = process.env.PARSER_JOB_DIR;
  if (!parserJobDir) throw new Error('PARSER_JOB_DIR is required; unsafe in-worker binary parsing is disabled');
  const prisma = createPrismaClient();
  const redis = createRedisClient();
  const storage = createStorageAdapter(storageConfigFromEnv());
  const deps: WorkerDeps = {
    prisma, redis, storage, ingestionAdapters: createParserJobAdapters(parserJobDir),
    audit: createPrismaAuditSink(prisma),
    malwareScanner: process.env.CLAMAV_HOST ? createClamAvScanner(process.env.CLAMAV_HOST, Number(process.env.CLAMAV_PORT ?? 3310)) : undefined,
    mailer: { send: async () => undefined },
  };
  // Gateway（§24 占位：AI_ENABLED=false 时懒加载；生产 env 注入密钥，§17）
  const gateway = buildGateway(process.env, globalThis.fetch, createPrismaAuditSink(prisma));
  const handlers = createHandlers(gateway);
  const pollOnce = await createPollOnce(handlers);
  await recoverProcessingQueue(deps);
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
export function buildGateway(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = globalThis.fetch,
  audit?: ConstructorParameters<typeof AiGateway>[0]['audit'],
): AiGateway {
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
  return new AiGateway({ providers, audit, logger: console });
}

// 主进程入口；被测试 import 时不启动
if (require.main === module) {
  void main();
}
