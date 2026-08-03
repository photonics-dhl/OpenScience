import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerSecurity } from '../../src/security/security';
import { httpStatusForError } from '../../src/error-map';

/** 独立 Fastify 实例测 security.ts：CSRF 拒绝、安全头、CORS 白名单。 */
async function makeApp(opts: { secureCookies?: boolean; allowedOrigins?: string[]; csrf?: boolean; cors?: boolean; helmet?: boolean }) {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  app.setErrorHandler((err, req, reply) => {
    const { status, body } = httpStatusForError(err, String(req.id));
    void reply.status(status).send(body);
  });
  await registerSecurity(app, {
    allowedOrigins: opts.allowedOrigins ?? [],
    secureCookies: opts.secureCookies ?? false,
    csrf: opts.csrf ?? false,
    cors: opts.cors ?? false,
    helmet: opts.helmet ?? false,
  });
  // 只注册受保护 POST 路由，测 CSRF
  app.post('/protected', async () => ({ ok: true }));
  // 公开 GET（无 CSRF 校验）
  app.get('/public', async () => ({ ok: true }));
  // /auth 豁免路径
  app.post('/auth/login', async () => ({ ok: true }));
  return app;
}

describe('registerSecurity（CSRF/CORS/helmet）', () => {
  it('CSRF 开启：写请求无 token → 403 CSRF_INVALID', async () => {
    const app = await makeApp({ csrf: true });
    const res = await app.inject({ method: 'POST', url: '/protected', payload: { x: 1 } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_INVALID');
    await app.close();
  });

  it('CSRF 开启：先取 token 再提交 → 通过', async () => {
    const app = await makeApp({ csrf: true });
    const get = await app.inject({ method: 'GET', url: '/csrf-token' });
    const token = get.json().csrfToken as string;
    const csrfCookie = get.cookies.find((c) => c.name === '_csrf');
    expect(token).toBeTruthy();
    expect(csrfCookie).toBeDefined();
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      cookies: { _csrf: csrfCookie!.value },
      headers: { 'x-csrf-token': token },
      payload: { x: 1 },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('CSRF 关闭：写请求放行', async () => {
    const app = await makeApp({ csrf: false });
    const res = await app.inject({ method: 'POST', url: '/protected', payload: { x: 1 } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('helmet 开启：nosniff + CSP default-src none + frame-ancestors', async () => {
    const app = await makeApp({ helmet: true });
    const res = await app.inject({ method: 'GET', url: '/public' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    await app.close();
  });

  it('CORS 白名单：允许域放行 + 凭证头，非白名单拒绝', async () => {
    const app = await makeApp({ cors: true, allowedOrigins: ['https://app.example.com'] });
    const allowed = await app.inject({
      method: 'GET', url: '/public', headers: { origin: 'https://app.example.com' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await app.inject({
      method: 'GET', url: '/public', headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
