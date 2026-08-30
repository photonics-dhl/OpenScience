import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import {
  AiGateway,
  AnthropicCompatProvider,
  MiniMaxCodingPlanVisionProvider,
  MutableProviderKillSwitch,
  OpenAiCompatProvider,
  type ExternalProcessingPolicy,
  type MiniMaxVisionPricing,
  type ProviderCapabilityPolicy,
} from '@openscience/ai-gateway';
import {
  claimAgentTask, markTaskProgress, prepareAgentTaskForCrashRecovery, recoverUndispatchedAgentTasks,
  AGENT_TASK_QUEUE, persistDocumentSourceMapReference, type AgentDeps,
} from '@openscience/domain';
import { createStorageAdapter, getBlob, storageConfigFromEnv, type StorageAdapter } from '@openscience/storage';
import {
  createSearchPrismaClient,
  EmbeddingClient,
  SearchStorage,
  type DenseModelIdentity,
} from '@openscience/search';
import type { OcrAuthorizationContext } from '@openscience/ai-gateway';
import type { DocumentSourceMap, ExtractionResult as ParserExtractionResult } from '@openscience/domain';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { extractHandler, sourceMapToManuscriptText } from './extractor';
import { MAX_PARSER_INPUT, type IngestionAdapters } from './ingestion-parser';
import { reviewAnalyzeHandler } from './reviewer';
import { visualizationPlanHandler } from './planner';
import { workspaceGuideHandler } from './workspace-guide';
import { createClamAvScanner, type MalwareScanner } from './clamav';
import { createParserStageJobClient, expectedSidecarParserMetadata } from './parser-job-isolation';
import { runParserCascadeSelfTest } from './parser-self-test';
import { authorizeSearchIndexJob, createSearchIndexer, type SearchIndexer } from './search-indexer';
import {
  runParserCascade,
  type ParserCascadeFeatureFlags,
} from './parsers/cascade-orchestrator';
import { createTextExtractor, type TextStageAdapter } from './parsers/text-extractor';
import type { ParserInput } from './parsers/types';
import { canonicalParserMediaType } from './parser-media-type';
import { createSemanticScholarAdapter } from './retrieval/semantic-scholar';
import { createTavilyAdapter } from './retrieval/tavily';
import { createScanSciAdapter } from './retrieval/scansci';
import { createSourceRetrieveHandler } from './retrieval/handler';
import { collectExpiredTemporaryDocuments } from './retrieval/garbage-collector';

const BGE_M3_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const INGESTION_EXTERNAL_PROCESSING_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);

export type SearchIndexRuntimeConfig =
  | { enabled: false }
  | { enabled: true; endpoint: string; modelIdentity: DenseModelIdentity };

export function loadSearchIndexRuntimeConfig(env: NodeJS.ProcessEnv = process.env): SearchIndexRuntimeConfig {
  const enabled = env.BGE_M3_ENABLED ?? 'false';
  if (enabled === 'false') return { enabled: false };
  if (enabled !== 'true') throw new Error('BGE_M3_ENABLED must be true or false');

  const modelVersionId = env.BGE_M3_MODEL_VERSION_ID ?? '';
  const modelRevision = env.BGE_M3_MODEL_REVISION ?? '';
  const sourceSha256 = env.BGE_M3_SOURCE_SHA256 ?? '';
  const packageFreezeSha256 = env.BGE_M3_PACKAGE_FREEZE_SHA256 ?? '';
  const modelManifestSha256 = env.BGE_M3_MODEL_MANIFEST_SHA256 ?? '';
  const endpoint = env.EMBEDDING_WORKER_URL ?? 'http://embedding-worker:8080';
  if (!UUID_PATTERN.test(modelVersionId)) throw new Error('BGE_M3_MODEL_VERSION_ID is invalid');
  if (modelRevision !== BGE_M3_REVISION) throw new Error('BGE_M3_MODEL_REVISION is invalid');
  for (const [name, value] of [
    ['BGE_M3_SOURCE_SHA256', sourceSha256],
    ['BGE_M3_PACKAGE_FREEZE_SHA256', packageFreezeSha256],
    ['BGE_M3_MODEL_MANIFEST_SHA256', modelManifestSha256],
  ] as const) {
    if (!SHA256_PATTERN.test(value)) throw new Error(`${name} is invalid`);
  }
  if (env.NODE_ENV === 'production' && endpoint !== 'http://embedding-worker:8080') {
    throw new Error('EMBEDDING_WORKER_URL must use the internal embedding worker in production');
  }
  return {
    enabled: true,
    endpoint,
    modelIdentity: {
      modelVersionId,
      modelRevision,
      sourceSha256,
      packageFreezeSha256,
      modelManifestSha256,
    },
  };
}

export function buildSearchIndexerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = globalThis.fetch,
): SearchIndexer | undefined {
  const config = loadSearchIndexRuntimeConfig(env);
  if (!config.enabled) return undefined;
  const client = createSearchPrismaClient({ env });
  return createSearchIndexer({
    storage: new SearchStorage(client),
    embedder: new EmbeddingClient({
      baseUrl: config.endpoint,
      fetchImpl: fetcher,
      logger: (message) => console.warn(message),
    }),
    modelIdentity: config.modelIdentity,
  });
}

/** 任务处理器注册表（Q4：kind → 执行函数）。 */
export interface ParserCascadeAuthorization {
  trustedAuthorizationContext: Readonly<OcrAuthorizationContext>;
  externalProcessingEligible: boolean;
}

export type ParserCascadeRunner = ((
  input: ParserInput,
  authorization: ParserCascadeAuthorization,
) => Promise<ParserExtractionResult<DocumentSourceMap>>) & {
  readonly featureFlags: Readonly<ParserCascadeFeatureFlags>;
};

export type WorkerDeps = AgentDeps & { storage?: StorageAdapter; ingestionAdapters?: IngestionAdapters; malwareScanner?: MalwareScanner };
export type TaskHandler = (
  deps: WorkerDeps,
  task: { id: string; payload: Record<string, unknown>; interestContext?: unknown; executionAttempt: number },
) => Promise<Record<string, unknown>>;

interface ScanSciTokenFileSystem {
  openSync(path: string, flags: number): number;
  fstatSync(fd: number): { isFile(): boolean; uid: number; gid: number; mode: number; nlink: number; size: number };
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number | null): number;
  closeSync(fd: number): void;
}

export function loadScanSciServiceTokenFile(
  path: string,
  fileSystem: ScanSciTokenFileSystem = { openSync, fstatSync, readSync, closeSync },
): string {
  let descriptor: number | undefined;
  try {
    descriptor = fileSystem.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fileSystem.fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== 1000 || stat.gid !== 1000 || (stat.mode & 0o7777) !== 0o400 || stat.nlink !== 1 || stat.size < 1 || stat.size > 4096) {
      throw new Error('invalid');
    }
    const bytes = Buffer.alloc(stat.size);
    if (fileSystem.readSync(descriptor, bytes, 0, bytes.length, null) !== bytes.length) throw new Error('short');
    const token = bytes.toString('utf8').trim();
    if (!token) throw new Error('empty');
    return token;
  } catch {
    throw new Error('SCANSCI_SERVICE_TOKEN_FILE must be a private regular file');
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); }
}

/** Production-safe cascade composition: one V2 sidecar stage plus disabled candidate routes. */
export function createWorkerParserCascade(
  gateway: Pick<AiGateway, 'ocr'>,
  parserJobAdapter: TextStageAdapter,
): ParserCascadeRunner {
  const extractText = createTextExtractor({
    pdf: parserJobAdapter,
    docx: parserJobAdapter,
    image: parserJobAdapter,
    xlsx: parserJobAdapter,
  });
  const featureFlags: Readonly<ParserCascadeFeatureFlags> = Object.freeze({
    detectLayout: false,
    grobid: false,
    localOcr: true,
    llmOcr: false,
  });
  return Object.assign(
    (input: ParserInput, authorization: ParserCascadeAuthorization) => runParserCascade(input, {
      adapters: {
        extractText,
        isolatedLocalOcr: {
          inventoryPages: (stageInput) => parserJobAdapter({
            schemaVersion: 2,
            operation: 'inventory_pages',
            artifactId: stageInput.artifactId,
            contentHash: stageInput.contentHash,
            mediaType: stageInput.mediaType,
            options: {},
          }, Buffer.from(stageInput.content)),
          ocrPages: (stageInput, pages) => parserJobAdapter({
            schemaVersion: 2,
            operation: 'ocr_page',
            artifactId: stageInput.artifactId,
            contentHash: stageInput.contentHash,
            mediaType: stageInput.mediaType,
            options: { pageNumbers: pages.map(({ page }) => page) },
          }, Buffer.from(stageInput.content)),
        },
      },
      aiGateway: gateway,
      trustedAuthorizationContext: authorization.trustedAuthorizationContext,
      externalProcessingEligible: authorization.externalProcessingEligible,
      featureFlags,
    }),
    { featureFlags },
  );
}

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
export function createHandlers(
  gateway: AiGateway,
  options: {
    searchIndexer?: SearchIndexer;
    parserCascade?: ParserCascadeRunner;
    externalProcessingPolicy?: ExternalProcessingPolicy;
    sourceRetrieveHandler?: TaskHandler;
  } = {},
): Record<string, TaskHandler> {
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
        include: { session: { include: { researchObject: { include: { workspace: true } } } } },
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
      if (bytes.byteLength !== Number(artifact.size)
        || createHash('sha256').update(bytes).digest('hex') !== artifact.blobSha256) {
        throw new Error('[blocked] artifact integrity mismatch');
      }
      await deps.malwareScanner(bytes);
      if (!options.parserCascade) throw new Error('[blocked] parser cascade unavailable');
      const trustedAuthorizationContext = Object.freeze({
        taskId: ownerTask.id,
        workspaceId: ownerResearchObject.workspaceId,
        actorId: ownerTask.session.userId,
      });
      const serverDerivedEligibility = ownerTask.id === task.id
        && ownerTask.kind === 'sdf.extract'
        && ownerTask.status === 'running'
        && ownerResearchObject.workspace.status === 'active'
        && membership.userId === ownerTask.session.userId
        && membership.workspaceId === ownerResearchObject.workspaceId
        && typeof membership.role === 'string'
        && INGESTION_EXTERNAL_PROCESSING_ROLES.has(membership.role);
      const externalProcessingEligible = serverDerivedEligibility
        && await (options.externalProcessingPolicy?.(trustedAuthorizationContext) ?? false);
      const parsed = await options.parserCascade({
        artifactId: artifact.id,
        contentHash: artifact.blobSha256,
        content: bytes,
        mediaType: canonicalParserMediaType(artifact.logicalPath, artifact.mimeType),
      }, { trustedAuthorizationContext, externalProcessingEligible });
      const format = artifact.logicalPath.split('.').at(-1)?.toLowerCase() ?? 'unknown';
      if (parsed.status === 'blocked') throw new Error(`[blocked] ${parsed.code}`);
      const sourceMapRef = (parsed.status === 'succeeded' || parsed.status === 'needs_review') && parsed.sourceMap
        ? await persistDocumentSourceMapReference(deps.storage, parsed.sourceMap, parsed.status)
        : undefined;
      if (parsed.status !== 'succeeded') {
        return {
          status: 'needs_review',
          format,
          reason: parsed.status === 'failed' ? parsed.message : parsed.reasons.join('; '),
          ...(sourceMapRef ? { sourceMapRef } : {}),
        };
      }
      const manuscriptText = sourceMapToManuscriptText(parsed.sourceMap);
      if (!manuscriptText.trim()) return { status: 'needs_review', format, reason: 'empty-parsed-text', sourceMapRef };
      try {
        return { ...await extractHandler(gateway, { payload: { manuscriptText } }), sourceMapRef };
      } catch {
        return { status: 'needs_review', format, reason: 'sdf-proposal-unavailable', sourceMapRef };
      }
    },
    'review.analyze': async (deps, task) => reviewAnalyzeHandler(gateway, deps, task),
    'visualization.plan': async (_deps, task) => visualizationPlanHandler(gateway, task), // P1E-1
    'workspace.guide': async (deps, task) => workspaceGuideHandler(gateway, deps, task),
    ...(options.searchIndexer === undefined ? {} : {
      'search.index': async (_deps: WorkerDeps, task) =>
        options.searchIndexer!.index(await authorizeSearchIndexJob(_deps, task)),
    }),
    ...(options.sourceRetrieveHandler === undefined ? {} : {
      'source.retrieve': options.sourceRetrieveHandler,
    }),
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

    let claimed: Awaited<ReturnType<typeof claimAgentTask>> = null;
    try {
      const task = await deps.prisma.agentTask.findUnique({
        where: { id: taskId },
        include: { session: { select: { userId: true } } },
      });
      if (!task) return true;
      claimed = await claimAgentTask(deps, taskId);
      if (!claimed) return true;
      const handler = handlers[task.kind];
      if (!handler) throw new Error('unsupported agent task kind');
      const result = await handler(deps, {
        id: task.id,
        payload: (task.payload ?? {}) as Record<string, unknown>,
        interestContext: task.interestContext,
        executionAttempt: claimed.executionAttempt,
      });
      await markTaskProgress(deps, {
        taskId,
        status: 'succeeded',
        progress: 100,
        result,
        expectedExecutionAttempt: claimed.executionAttempt,
      });
      return true;
    } catch (e) {
      await markTaskProgress(deps, {
        taskId,
        status: 'failed',
        error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
        expectedExecutionAttempt: claimed?.executionAttempt,
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
    prisma, redis, storage,
    audit: createPrismaAuditSink(prisma),
    malwareScanner: process.env.CLAMAV_HOST ? createClamAvScanner(process.env.CLAMAV_HOST, Number(process.env.CLAMAV_PORT ?? 3310)) : undefined,
    mailer: { send: async () => undefined },
  };
  // Gateway（§24 占位：AI_ENABLED=false 时懒加载；生产 env 注入密钥，§17）
  const externalProcessingPolicy: ExternalProcessingPolicy = async () => false;
  const gateway = buildGateway(
    process.env,
    globalThis.fetch,
    createPrismaAuditSink(prisma),
    externalProcessingPolicy,
  );
  const parserJobAdapter = createParserStageJobClient(parserJobDir, expectedSidecarParserMetadata);
  const parserCascade = createWorkerParserCascade(gateway, parserJobAdapter);
  const parserSelfTest = await runParserCascadeSelfTest(parserCascade);
  if (!parserSelfTest.pdf.textMatched || !parserSelfTest.docx.textMatched
    || !parserSelfTest.scan.textMatched || !parserSelfTest.scan.locatorMatched
    || !parserSelfTest.scan.tesseractMatched || !parserSelfTest.scan.confidenceMatched
    || !parserSelfTest.scan.boundingBoxMatched
    || !parserSelfTest.candidateFallbackDisabled) {
    throw new Error('parser cascade startup self-test failed');
  }
  const handlers = createHandlers(gateway, {
    parserCascade,
    externalProcessingPolicy,
    searchIndexer: buildSearchIndexerFromEnv(process.env),
    sourceRetrieveHandler: buildSourceRetrieveHandlerFromEnv(process.env),
  });
  const pollOnce = await createPollOnce(handlers);
  await recoverProcessingQueue(deps);
  let cleanupRunning = false;
  const cleanupTimer = setInterval(() => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    void collectExpiredTemporaryDocuments({ prisma, storage }, { workerId: `agent-worker-${process.pid}` })
      .then((result) => {
        if (result.claimed || result.failed) console.log('temporary document cleanup', result);
      })
      .catch((error) => console.error('temporary document cleanup error', error))
      .finally(() => { cleanupRunning = false; });
  }, 60_000);
  cleanupTimer.unref();
  await collectExpiredTemporaryDocuments({ prisma, storage }, { workerId: `agent-worker-${process.pid}` });
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
  externalProcessingPolicy: ExternalProcessingPolicy = async () => false,
  runtimeCapabilityPolicy: ProviderCapabilityPolicy = new MutableProviderKillSwitch(),
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

  const ocrProviders = env.NODE_ENV !== 'production' && env.MINIMAX_VISION_ENABLED === 'true' && keys[0]
    ? [new MiniMaxCodingPlanVisionProvider('minimax-vision', {
        baseUrl: visionOrigin(env),
        apiKey: keys[0],
        model: env.MINIMAX_VISION_MODEL ?? 'coding-plan-vlm',
        pricing: visionPricing(env),
        maxPageBytes: optionalBoundedInteger(env.MINIMAX_VISION_MAX_PAGE_BYTES, 4 * 1024 * 1024, 'MINIMAX_VISION_MAX_PAGE_BYTES'),
      }, fetcher)]
    : [];
  const staticallyDisabled = new Set((env.AI_DISABLED_PROVIDERS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const killSwitch: ProviderCapabilityPolicy = {
    async isEnabled(provider, capability) {
      if (staticallyDisabled.has(provider)) return { enabled: false, reason: 'operator_disabled' };
      return runtimeCapabilityPolicy.isEnabled(provider, capability);
    },
  };
  const ocrLimits = {
    maxPages: optionalBoundedInteger(env.LLM_OCR_MAX_PAGES, 4, 'LLM_OCR_MAX_PAGES'),
    maxPageBytes: optionalBoundedInteger(env.LLM_OCR_MAX_PAGE_BYTES, 4 * 1024 * 1024, 'LLM_OCR_MAX_PAGE_BYTES'),
    maxTotalBytes: optionalBoundedInteger(env.LLM_OCR_MAX_TOTAL_BYTES, 8 * 1024 * 1024, 'LLM_OCR_MAX_TOTAL_BYTES'),
  };
  return new AiGateway({
    providers,
    ocrProviders,
    audit,
    logger: console,
    killSwitch,
    externalProcessingPolicy,
    ocrLimits,
  });
}

export function buildSourceRetrieveHandlerFromEnv(env: NodeJS.ProcessEnv = process.env): TaskHandler {
  const queryHmacSecret = env.RETRIEVAL_QUERY_HMAC_SECRET ?? '';
  if (Buffer.byteLength(queryHmacSecret, 'utf8') < 32) {
    throw new Error('RETRIEVAL_QUERY_HMAC_SECRET must be at least 32 bytes');
  }
  const scansciEnabled = env.SCANSCI_ENABLED === 'true';
  if (env.SCANSCI_ENABLED && env.SCANSCI_ENABLED !== 'true' && env.SCANSCI_ENABLED !== 'false') {
    throw new Error('SCANSCI_ENABLED must be true or false');
  }
  if (env.TAVILY_ENABLED && env.TAVILY_ENABLED !== 'true' && env.TAVILY_ENABLED !== 'false') {
    throw new Error('TAVILY_ENABLED must be true or false');
  }
  const scansciBaseUrl = env.SCANSCI_BASE_URL ?? 'http://scansci-legal:8080';
  if (env.NODE_ENV === 'production' && scansciEnabled && scansciBaseUrl !== 'http://scansci-legal:8080') {
    throw new Error('SCANSCI_BASE_URL must use the isolated internal legal-only service in production');
  }
  if (env.SCANSCI_SERVICE_TOKEN !== undefined) throw new Error('SCANSCI_SERVICE_TOKEN is forbidden; use SCANSCI_SERVICE_TOKEN_FILE');
  if (scansciEnabled && !env.SCANSCI_SERVICE_TOKEN_FILE) throw new Error('SCANSCI_SERVICE_TOKEN_FILE is required when ScanSci is enabled');
  if (env.NODE_ENV === 'production' && scansciEnabled
    && env.SCANSCI_SERVICE_TOKEN_FILE !== '/run/scansci-worker-secrets/scansci_service_token') {
    throw new Error('SCANSCI_SERVICE_TOKEN_FILE must use the fixed Worker secret path in production');
  }
  const scansciServiceToken = env.SCANSCI_SERVICE_TOKEN_FILE ? loadScanSciServiceTokenFile(env.SCANSCI_SERVICE_TOKEN_FILE) : undefined;
  return createSourceRetrieveHandler({
    queryHmacSecret,
    semanticScholar: createSemanticScholarAdapter({ apiKey: env.SEMANTIC_SCHOLAR_API_KEY }),
    tavily: createTavilyAdapter({ apiKey: env.TAVILY_API_KEY, enabled: env.TAVILY_ENABLED !== 'false' }),
    scansci: createScanSciAdapter({
      enabled: scansciEnabled,
      baseUrl: scansciBaseUrl,
      serviceToken: scansciServiceToken,
    }),
  });
}

function visionOrigin(env: NodeJS.ProcessEnv): string {
  const region = env.MINIMAX_VISION_REGION ?? 'global';
  if (region === 'global') return 'https://api.minimax.io';
  if (region === 'cn') return 'https://api.minimaxi.com';
  throw new Error('MINIMAX_VISION_REGION must be global or cn');
}

function visionPricing(env: NodeJS.ProcessEnv): MiniMaxVisionPricing | undefined {
  const rawCost = env.MINIMAX_VISION_USD_MICROS_PER_PAGE;
  if (rawCost === undefined || rawCost.trim() === '') return undefined;
  const usdMicrosPerPage = Number(rawCost);
  if (!Number.isSafeInteger(usdMicrosPerPage) || usdMicrosPerPage < 0 || usdMicrosPerPage > 1_000_000_000) {
    throw new Error('MINIMAX_VISION_USD_MICROS_PER_PAGE must be a non-negative integer');
  }
  const version = env.MINIMAX_VISION_PRICING_VERSION ?? '';
  const effectiveDate = env.MINIMAX_VISION_PRICING_EFFECTIVE_DATE ?? '';
  const serviceTier = env.MINIMAX_VISION_SERVICE_TIER ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(serviceTier)) {
    throw new Error('MiniMax vision pricing metadata is incomplete or invalid');
  }
  return { usdMicrosPerPage, version, effectiveDate, serviceTier };
}

function optionalBoundedInteger(raw: string | undefined, maximum: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return maximum;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  return value;
}

// 主进程入口；被测试 import 时不启动
if (require.main === module) {
  void main();
}
