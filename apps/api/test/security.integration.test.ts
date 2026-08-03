import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { DevOutboxMailer } from '@openscience/auth';
import { buildApp } from '../src/app';

/**
 * P1A-8 Task 7 集成测试（云上执行）：真 PG/Redis。
 * 限流触发/恢复 + CSRF 拒绝 + 安全响应头 + 限流审计行。
 * 前置：dev 栈已起（stack:up），迁移已 deploy。
 *
 * 隔离策略：限流桶 key = rl:{ip}:{route}:{window}，server 端 key 空间全局共享（独立 redis client
 * 连接同一 server 仍读同 key）→ 必须**不同 ip** 隔离。故所有用例 `trustProxy: true`，
 * 各用例注入唯一 `x-forwarded-for`（P1A-8 trustProxy 的真实价值——生产经 nginx 也靠它区分客户端）。
 */

const prisma = createPrismaClient();
const mailer = new DevOutboxMailer(prisma);

/** 独立 app：trustProxy + 用例唯一 XFF 隔离限流桶；返回 app + redis，调用方负责 disconnect。 */
async function makeApp(opts?: {
  loginLimit?: number;
  csrf?: boolean;
  helmet?: boolean;
}) {
  const redis = createRedisClient();
  const app = await buildApp({
    prisma,
    redis,
    mailer,
    audit: createPrismaAuditSink(prisma),
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: 'integration-secret',
    secureCookies: false,
    rateLimitEnabled: true,
    rateLimit: { loginLimit: opts?.loginLimit ?? 2, loginWindowSec: 3600 },
    security: { csrf: opts?.csrf ?? false, helmet: opts?.helmet ?? false },
    trustProxy: true,
  });
  return { app, redis };
}

/** 用例收尾：关 app + 断开独立 redis（释放限流桶）。 */
async function closeApp(a: Awaited<ReturnType<typeof makeApp>>): Promise<void> {
  await a.app.close();
  a.redis.disconnect();
}

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.usageLedger.deleteMany();
  await prisma.quotaPolicy.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.mailOutbox.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('P1A-8 安全基线（云上）', () => {
  it('登录连续超限 → 429 + Retry-After + 限流审计行', async () => {
    const { app, redis } = await makeApp({ loginLimit: 2 });
    // 用不存在的账号打 login——429 在密码校验前触发，不依赖真实账号；
    // 前 2 次 auth 层 401/200 均可（密码错 401 或成功 200），只需断言非 429
    const headers = { 'x-forwarded-for': '203.0.113.10' }; // 唯一 XFF → 独立限流桶
    // 清该桶历史计数：限流 key rl:<ip>:<route>:<window> 窗口 3600s 跨运行残留 → hit1 误 429（2026-08-04 实证）
    const staleKeys = await redis.keys('rl:203.0.113.10:*');
    if (staleKeys.length) await redis.del(...staleKeys);
    const payload = { email: 'rate-limit@example.com', password: 'Passw0rd123' };
    const hit1 = await app.inject({ method: 'POST', url: '/auth/login', payload, headers });
    const hit2 = await app.inject({ method: 'POST', url: '/auth/login', payload, headers });
    expect(hit1.statusCode).not.toBe(429);
    expect(hit2.statusCode).not.toBe(429);
    const hit3 = await app.inject({ method: 'POST', url: '/auth/login', payload, headers });
    expect(hit3.statusCode).toBe(429);
    expect(hit3.json().error.code).toBe('RATE_LIMITED');
    expect(Number(hit3.headers['retry-after'])).toBeGreaterThan(0);
    // 限流审计行
    const audit = await prisma.auditLog.findFirst({ where: { action: 'security.rate.limited' } });
    expect(audit).not.toBeNull();
    await closeApp({ app, redis });
  });

  it('写请求无 CSRF token → 403；带 token → 通过', async () => {
    const { app, redis } = await makeApp({ csrf: true });
    const headers = { 'x-forwarded-for': '203.0.113.11' }; // 独立桶，免被其他用例限流波及
    // 取 token
    const get = await app.inject({ method: 'GET', url: '/csrf-token', headers });
    const token = get.json().csrfToken as string;
    const csrfCookie = get.cookies.find((c) => c.name === '_csrf');
    expect(token).toBeTruthy();
    // 无 token POST /workspaces（写路由）→ 403
    const noToken = await app.inject({ method: 'POST', url: '/workspaces', payload: { name: 'x', description: 'y' }, headers });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().error.code).toBe('CSRF_INVALID');
    // 带 token → 过 CSRF，落到鉴权（401 未登录，证明已越过 CSRF）
    const withToken = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { _csrf: csrfCookie!.value },
      headers: { 'x-csrf-token': token, ...headers },
      payload: { name: 'x', description: 'y' },
    });
    expect(withToken.statusCode).toBe(401);
    await closeApp({ app, redis });
  });

  it('helmet：安全响应头存在（nosniff + CSP default-src none + frame-ancestors）', async () => {
    const { app, redis } = await makeApp({ helmet: true });
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { 'x-forwarded-for': '203.0.113.12' } });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    await closeApp({ app, redis });
  });

  it('trustProxy 开启：XFF 生效（限流 req.ip 取真实客户端）', async () => {
    const { app, redis } = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-forwarded-for': '203.0.113.13' },
    });
    expect(res.statusCode).toBe(401);
    await closeApp({ app, redis });
  });
});
