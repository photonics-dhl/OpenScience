import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { httpStatusForError } from './error-map';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth';
import { registerWorkspaceRoutes } from './routes/workspaces';

export interface BuildAppOptions extends AuthRouteDeps {
  cookieSecret: string;
  /** P1A-6：注入结构化 logger（pino 实例满足 FastifyBaseLogger）；缺省关闭（测试现状）。 */
  logger?: FastifyBaseLogger;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  // fastify 5：pino 实例必须走 loggerInstance（logger 仅接受配置对象，传实例抛 FST_ERR_LOG_INVALID_LOGGER_CONFIG）
  const app = Fastify(opts.logger ? { loggerInstance: opts.logger } : { logger: false });
  await app.register(cookie, { secret: opts.cookieSecret });

  app.setErrorHandler((err, req, reply) => {
    const { status, body } = httpStatusForError(err, String(req.id));
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    else req.log.warn({ err: { code: body.error.code } }, 'request rejected');
    void reply.status(status).send(body);
  });

  // CORS/CSRF/rate-limit 挂载点：2.8 安全基线统一接入（本任务不实现）。
  await app.register(async (instance) => registerAuthRoutes(instance, opts), { prefix: '/auth' });
  await app.register(async (instance) => registerWorkspaceRoutes(instance, opts), { prefix: '/workspaces' });
  return app;
}
