import type { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import csrfProtection from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';

export interface SecurityOptions {
  /** CORS 白名单；空 = 同源策略（dev 默认）。 */
  allowedOrigins: string[];
  /** Cookie secure 标记（生产必 true），驱动 CSRF cookie + HSTS。 */
  secureCookies: boolean;
  csrf: boolean;
  cors: boolean;
  helmet: boolean;
}

const PUBLIC_AUTH_WRITES = new Set([
  '/auth/request-signup-code',
  '/auth/confirm-signup',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-code',
  '/auth/login',
]);

/** 仅无会话的公开认证写入豁免；logout 等会话变更仍受 CSRF 保护。 */
function isWriteRoute(req: FastifyRequest): boolean {
  if (PUBLIC_AUTH_WRITES.has(req.url.split('?')[0] ?? req.url)) return false;
  return req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
}

/**
 * 集中注册安全基线（P1A-8 Task 4）：
 * CORS 白名单 + CSRF 双提交（HMAC 模式）+ helmet 全套安全头。单处开关，集成测试可关 CSRF 隔离用例。
 *
 * CSRF 双提交模式（@fastify/csrf-protection + @fastify/cookie）：
 *   - cookie `_csrf` 存 HMAC secret（httpOnly，前端不可读）
 *   - `GET /csrf-token` 返回签名 token（前端存内存，写请求带 `x-csrf-token` 头）
 *   - 写路由 preHandler 用 cookie secret 校验 header token，失败 403（FST_CSRF_INVALID_TOKEN，
 *     由 error-map 映射为 CSRF_INVALID，不走 500）
 */
export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  if (opts.cors) {
    await app.register(cors, {
      // 白名单精确匹配；禁 '*'。空数组 → origin false = 同源策略（浏览器同源请求不触发 CORS）。
      origin: opts.allowedOrigins.length ? opts.allowedOrigins : false,
      credentials: true, // 会话 cookie 跨域需显式允许
      allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key'],
    });
  }

  if (opts.csrf) {
    await app.register(csrfProtection, {
      // 双提交模式（默认 sessionPlugin '@fastify/cookie'）；getToken 默认已读 x-csrf-token 头
      cookieOpts: { httpOnly: true, sameSite: 'lax', secure: opts.secureCookies, path: '/' },
    });
    // 前端取 CSRF token 端点：cookie 存 secret（httpOnly），token 存前端内存，写请求带 x-csrf-token 头
    app.get('/csrf-token', async (_req, reply) => {
      const token = reply.generateCsrf();
      return reply.send({ csrfToken: token });
    });
    app.addHook('preHandler', (req, reply, done) => {
      if (isWriteRoute(req)) app.csrfProtection(req, reply, done);
      else done();
    });
  }

  if (opts.helmet) {
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"], // API 纯 JSON，无外链
          frameAncestors: ["'none'"], // 禁 iframe 嵌入（点击劫持）
        },
      },
      hsts: opts.secureCookies ? { maxAge: 31536000 } : false, // 本地 http 无 HSTS
      crossOriginResourcePolicy: false, // API 纯 JSON，无需 CORP
    });
  }
}
