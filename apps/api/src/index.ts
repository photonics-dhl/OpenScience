import { DevOutboxMailer, SmtpMailer } from '@openscience/auth';
import { loadApiEnv } from '@openscience/config';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createStorageAdapter } from '@openscience/storage';
import { createLogger } from '@openscience/observability';
import { ChatGptWebSpoolImageProvider, CodexSpoolImageProvider, type ImageProvider, type ImageRecoveryState } from '@openscience/ai-gateway';
import { buildApp } from './app';
import { buildHybridSearchFromEnv } from './search-runtime';
import { createSearchPrismaClient, deleteSearchContent, setSearchContentVisibility } from '@openscience/search';

/** Spool providers are the only ones that can answer a recovery question about a paid attempt. */
type RecoverableImageProvider = ImageProvider & { inspectRecoveryState(requestId: string): Promise<ImageRecoveryState> };

async function main(): Promise<void> {
  let ownedPrisma: ReturnType<typeof createPrismaClient> | undefined;
  let ownedRedis: ReturnType<typeof createRedisClient> | undefined;
  let ownedSearch: ReturnType<typeof createSearchPrismaClient> | undefined;
  let ownedApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  let shutdown: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    if (!shutdown) shutdown = (async () => {
      try {
        await ownedApp?.close();
      } catch (error) {
        console.error('API close failed', error);
        process.exitCode = 1;
      } finally {
        // Requests and close hooks finish before their database/queue dependencies close.
        const redis = ownedRedis;
        const closed = await Promise.allSettled([
          ...(redis ? [redis.quit().catch(error => { redis.disconnect(); throw error; })] : []),
          ...(ownedSearch ? [ownedSearch.$disconnect()] : []),
          ...(ownedPrisma ? [ownedPrisma.$disconnect()] : []),
        ]);
        for (const result of closed) if (result.status === 'rejected') {
          console.error('API dependency close failed', result.reason);
          process.exitCode = 1;
        }
      }
    })();
    return shutdown;
  };
  try {
    const env = loadApiEnv();
    const prisma = ownedPrisma = createPrismaClient({ datasourceUrl: env.databaseUrl });
    const redis = ownedRedis = createRedisClient(env.redisUrl);
    // P1A-9 §3：mailer 驱动（dev 缺省 outbox 捕获；生产 smtp 真发，QQ SMTP env 缺失已在 loadApiEnv 快速失败）
    const mailer = env.mailerDriver === 'smtp'
      ? new SmtpMailer({ host: env.smtpHost, port: env.smtpPort, user: env.smtpUser, pass: env.smtpPass })
      : new DevOutboxMailer(prisma);
    // P1B-3：对象存储（S3_* env，dev 缺省 MinIO 127.0.0.1:9000）
    const storage = createStorageAdapter(env.storage);
    const searchPrisma = ownedSearch = process.env.SEARCH_DATABASE_URL ? createSearchPrismaClient() : undefined;
    const researchObjectSearch = buildHybridSearchFromEnv(prisma, searchPrisma);
    const logger = createLogger({ level: env.nodeEnv === 'production' ? 'info' : 'debug' });
    const codexImageInboxDir = process.env.CODEX_IMAGE_INBOX_DIR?.trim();
    const codexImageResultsDir = process.env.CODEX_IMAGE_RESULTS_DIR?.trim();
    const chatGptImageInboxDir = process.env.CHATGPT_WEB_IMAGE_INBOX_DIR?.trim();
    const chatGptImageResultsDir = process.env.CHATGPT_WEB_IMAGE_RESULTS_DIR?.trim();
    const spoolImageProvider = (kind: string): RecoverableImageProvider | undefined => {
      if (!env.ai.sceneImageEnabled) return undefined;
      if (kind === 'codex' && codexImageInboxDir && codexImageResultsDir) {
        return new CodexSpoolImageProvider({ inboxDir: codexImageInboxDir, resultsDir: codexImageResultsDir });
      }
      if (kind === 'chatgpt-web' && chatGptImageInboxDir && chatGptImageResultsDir) {
        return new ChatGptWebSpoolImageProvider({ inboxDir: chatGptImageInboxDir, resultsDir: chatGptImageResultsDir });
      }
      return undefined;
    };
    // Recovery must see a result the worker's fallback provider produced, otherwise an
    // operator is pushed into an explicitly charged new generation. Only the worker's
    // primary provider is the payer, and only its spool may testify that nothing was
    // submitted: when the primary has no spool at all (minimax) there is no payer to
    // consult, and promoting a never-used spare into that role would let an empty inbox
    // authorise reusing a reservation the payer may already have spent.
    const imagePrimaryKind = process.env.HERMES_SCENE_IMAGE_PROVIDER?.trim() || 'minimax';
    const imageFallbackKind = process.env.HERMES_SCENE_IMAGE_FALLBACK_PROVIDER?.trim() || undefined;
    const payerImageProvider = spoolImageProvider(imagePrimaryKind);
    const spareImageProvider = imageFallbackKind && imageFallbackKind !== imagePrimaryKind
      ? spoolImageProvider(imageFallbackKind) : undefined;
    if (imageFallbackKind && !payerImageProvider) {
      logger.warn(`image fallback '${imageFallbackKind}' is configured but primary '${imagePrimaryKind}' has no spool; an interrupted attempt needs an explicitly charged new generation`);
    }
    const inspectPooledImageRecoveryState = payerImageProvider
      ? async (requestId: string): Promise<ImageRecoveryState> => {
          const inspect = async (provider: RecoverableImageProvider): Promise<ImageRecoveryState> => {
            try { return await provider.inspectRecoveryState(requestId); } catch (cause) {
              logger.warn(`image recovery inspection failed: ${cause instanceof Error ? cause.message : String(cause)}`);
              return 'unsafe';
            }
          };
          // Only a saved result may be answered by the spare, because resuming one is a
          // read. Every other verdict stays with the payer.
          if (spareImageProvider && await inspect(spareImageProvider) === 'completed') return 'completed';
          return inspect(payerImageProvider);
        }
      : undefined;
    const app = ownedApp = await buildApp({
      prisma,
      redis,
      mailer,
      storage,
      ...(researchObjectSearch ? { researchObjectSearch } : {}),
      ...(searchPrisma ? { deleteSearchContent: (scope: Parameters<typeof deleteSearchContent>[1]) => deleteSearchContent(searchPrisma, scope) } : {}),
      ...(searchPrisma ? { setSearchContentVisibility: (scope, _visible, tx) => setSearchContentVisibility(searchPrisma, tx, scope) } : {}),
      sceneImageEnabled: env.ai.sceneImageEnabled,
      videoEnabled: env.ai.videoEnabled,
      ...(inspectPooledImageRecoveryState && payerImageProvider ? {
        canResumeImageBeforeSubmission: async (requestId: string) => payerImageProvider.canResumeBeforeSubmission
          ? await payerImageProvider.canResumeBeforeSubmission(requestId) : false,
        inspectImageRecoveryState: inspectPooledImageRecoveryState,
      } : {}),
      // P1A-6：审计落库（domain/auth 写操作 + authz.deny 经 deps.audit 流出）
      audit: createPrismaAuditSink(prisma),
      // P1A-4：邮箱验证通过同事务创建 Personal Workspace（回调注入，避免 auth→domain 反向依赖）
      onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
      cookieSecret: env.cookieSecret,
      secureCookies: env.secureCookies,
      orcid: env.orcid,
      institutionEmailDomains: env.institutionEmailDomains,
      logger,
      // P1A-8：生产启用安全基线——限流（登录 5/min）+ helmet 安全头 + CSRF + CORS 白名单；
      // dev 不传则 buildApp 缺省关闭（测试现状）。CORS 白名单空 = 同源策略。
      trustProxy: env.nodeEnv === 'production',
      rateLimitEnabled: env.rateLimitEnabled,
      rateLimit: { loginLimit: env.rateLimitLoginLimit, loginWindowSec: env.rateLimitLoginWindowSec },
      security: {
        allowedOrigins: env.allowedOrigins,
        csrf: true,
        cors: env.allowedOrigins.length > 0,
        helmet: true,
      },
      publicIdPrefix: env.publicIdPrefix,
      downloadSigningSecret: env.downloadSigningSecret,
      downloadSigningKeyId: env.downloadSigningKeyId,
    });
    process.on('SIGTERM', () => { void stop(); });
    process.on('SIGINT', () => { void stop(); });
    // 生产容器绑 0.0.0.0（docker 发布端口连容器 eth0；compose 已限制宿主 127.0.0.1:3001，外部不可达）；
    // dev 绑 127.0.0.1（本机直连）。
    await app.listen({ port: env.port, host: env.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1' });
    app.log.info({ port: env.port, nodeEnv: env.nodeEnv }, 'API listening');
  } catch (error) {
    await stop();
    throw error;
  }
}

void main().catch(error => { console.error('API startup failed', error); process.exitCode = 1; });
