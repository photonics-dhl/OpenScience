import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { httpStatusForError } from './error-map';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth';
import { registerWorkspaceRoutes } from './routes/workspaces';

export interface BuildAppOptions extends AuthRouteDeps {
  cookieSecret: string;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: opts.cookieSecret });

  app.setErrorHandler((err, _req, reply) => {
    const { status, body } = httpStatusForError(err);
    void reply.status(status).send(body);
  });

  // CORS/CSRF/rate-limit 挂载点：2.8 安全基线统一接入（本任务不实现）。
  await app.register(async (instance) => registerAuthRoutes(instance, opts), { prefix: '/auth' });
  await app.register(async (instance) => registerWorkspaceRoutes(instance, opts), { prefix: '/workspaces' });
  return app;
}
