import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { StorageAdapter } from '@openscience/storage';
import { httpStatusForError } from './error-map';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth';
import { registerWorkspaceRoutes } from './routes/workspaces';
import { registerAdminRoutes } from './routes/admin';
import { registerAdminUsageRoutes } from './routes/admin-usage';
import { registerUsageRoutes } from './routes/usage';
import { registerResearchObjectRoutes } from './routes/research-objects';
import { registerArtifactRoutes } from './routes/artifacts';
import { registerIngestionRoutes } from './routes/ingestion';
import { registerCommitRoutes } from './routes/commits';
import { registerBranchRoutes } from './routes/branches';
import { registerIssueRoutes } from './routes/issues';
import { registerLicenseRoutes } from './routes/licenses';
import { registerForkRoutes } from './routes/forks';
import { registerPrRoutes } from './routes/prs';
import { registerReviewRoutes } from './routes/reviews';
import { registerPublicationRoutes } from './routes/publications';
import { registerAuthorRoutes } from './routes/authors';
import { registerNotificationRoutes } from './routes/notifications';
import { registerAgentRoutes } from './routes/agent';
import { registerLiteratureRoutes } from './routes/literature';
import { registerAppealRoutes } from './routes/appeals';
import { registerResearchRoutes } from './routes/research';
import { registerExploreRoutes } from './routes/explore';
import { registerEditorialRoutes } from './routes/editorial';
import { registerResearchIdentityRoutes } from './routes/research-identity';
import { registerReadingPreferenceRoutes } from './routes/reading-preferences';
import { registerClaimEvidenceRoutes } from './routes/claim-evidence';
import { registerAdminEditorialRoutes } from './routes/admin-editorial';
import { registerSandboxJobsRoutes } from './routes/sandbox-jobs';
import { registerTemporaryDocumentRoutes } from './routes/temporary-documents';
import { registerPresentationAssetRoutes } from './routes/presentation-assets';
import { registerRateLimit } from './security/rate-limit';
import { registerSecurity, type SecurityOptions } from './security/security';

export interface BuildAppOptions extends AuthRouteDeps {
  cookieSecret: string;
  /** P1A-6：注入结构化 logger（pino 实例满足 FastifyBaseLogger）；缺省关闭（测试现状）。 */
  logger?: FastifyBaseLogger;
  /** P1A-8：生产开启 trustProxy（nginx 反代，XFF 生效）；dev/测试关。 */
  trustProxy?: boolean;
  /** P1A-8：限流档位覆盖（env 传入）。undefined = 用 RATE_LIMIT_ROUTES 默认。 */
  rateLimit?: { loginLimit?: number; loginWindowSec?: number };
  /** P1A-8：安全基线开关（CSRF/CORS/helmet）。缺省全关（测试现状）。 */
  security?: Partial<SecurityOptions>;
  /** P1A-8：限流总开关。缺省关（测试现状，集成测试显式开）。 */
  rateLimitEnabled?: boolean;
  /** P1B-3：对象存储（/artifacts 上传下载）。缺省 undefined = 不注册 artifacts 路由（旧测试零影响）。 */
  storage?: StorageAdapter;
  /** P1B-6：公开 ID 前缀（PUBLIC_ID_PREFIX env，§24）。缺省 'OSR'。 */
  publicIdPrefix?: string;
  downloadSigningSecret?: string;
  downloadSigningKeyId?: string;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  // fastify 5：pino 实例必须走 loggerInstance（logger 仅接受配置对象，传实例抛 FST_ERR_LOG_INVALID_LOGGER_CONFIG）
  // P1A-8：trustProxy 构造选项——生产信任一层 nginx（XFF 生效，req.ip 正确），dev/测试不信任。
  const app = Fastify(
    opts.logger
      ? { loggerInstance: opts.logger, trustProxy: opts.trustProxy ? 1 : false }
      : { logger: false, trustProxy: opts.trustProxy ? 1 : false },
  );

  await app.register(cookie, { secret: opts.cookieSecret });

  app.setErrorHandler((err, req, reply) => {
    const { status, body } = httpStatusForError(err, String(req.id));
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    else req.log.warn({ err: { code: body.error.code } }, 'request rejected');
    void reply.status(status).send(body);
  });

  // P1A-8：限流 + CSRF/CORS/helmet 集中接入（原挂载点）。
  if (opts.rateLimitEnabled) {
    await registerRateLimit(app, {
      redis: opts.redis,
      audit: opts.audit,
      enabled: true,
      loginLimit: opts.rateLimit?.loginLimit,
      loginWindowSec: opts.rateLimit?.loginWindowSec,
    });
  }
  if (opts.security) {
    await registerSecurity(app, {
      allowedOrigins: opts.security.allowedOrigins ?? [],
      secureCookies: opts.secureCookies,
      csrf: opts.security.csrf ?? false,
      cors: opts.security.cors ?? false,
      helmet: opts.security.helmet ?? false,
    });
  }

  await app.register(async (instance) => registerAuthRoutes(instance, opts), { prefix: '/auth' });
  await app.register(async (instance) => registerWorkspaceRoutes(instance, opts), { prefix: '/workspaces' });
  await app.register(async (instance) => registerAdminRoutes(instance, opts), { prefix: '/admin' });
  await app.register(async (instance) => registerAdminUsageRoutes(instance, opts), { prefix: '/admin' });
  await app.register(async (instance) => registerAdminEditorialRoutes(instance, opts), { prefix: '/admin' });
  await app.register(async (instance) => registerUsageRoutes(instance, opts), { prefix: '/usage' });
  await app.register(async (instance) => registerResearchObjectRoutes(instance, opts), {});
  await app.register(async (instance) => registerBranchRoutes(instance, opts), {});
  await app.register(async (instance) => registerIssueRoutes(instance, opts), {});
  await app.register(async (instance) => registerLicenseRoutes(instance, opts), {});
  await app.register(async (instance) => registerAuthorRoutes(instance, opts), {});
  await app.register(async (instance) => registerNotificationRoutes(instance, opts), {});
  await app.register(async (instance) => registerAgentRoutes(instance, opts), {});
  await app.register(async (instance) => registerLiteratureRoutes(instance, opts), {});
  await app.register(async (instance) => registerAppealRoutes(instance, opts), {});
  await app.register(async (instance) => registerResearchRoutes(instance, opts), {});
  await app.register(async (instance) => registerExploreRoutes(instance, opts), {});
  await app.register(async (instance) => registerEditorialRoutes(instance, opts), {});
  await app.register(async (instance) => registerResearchIdentityRoutes(instance, opts), {});
  await app.register(async (instance) => registerReadingPreferenceRoutes(instance, opts), {});
  await app.register(async (instance) => registerSandboxJobsRoutes(instance, opts), {});
  await app.register(async (instance) => registerPresentationAssetRoutes(instance, opts), {});
  if (opts.storage) {
    const storage = opts.storage;
    await app.register(async (instance) => registerArtifactRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerIngestionRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerCommitRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerForkRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerPrRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerReviewRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerPublicationRoutes(instance, { ...opts, storage }), {});
    await app.register(async (instance) => registerClaimEvidenceRoutes(instance, { ...opts, storage }), {});
    if (opts.downloadSigningSecret && opts.downloadSigningKeyId) {
      await app.register(async (instance) => registerTemporaryDocumentRoutes(instance, {
        ...opts,
        storage,
        downloadSigningSecret: opts.downloadSigningSecret!,
        downloadSigningKeyId: opts.downloadSigningKeyId!,
      }), {});
    }
  }
  return app;
}
