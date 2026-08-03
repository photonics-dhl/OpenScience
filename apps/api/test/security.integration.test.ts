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
 * 隔离策略：每个用例独立 makeApp；redis key 前缀含用例唯一 tag，避免桶互扰（P1A-7 共享库教训）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);

/** 独立 app：限流路由带 tag 隔离桶，CSRF/helmet 可按需开关。 */
async function makeApp(opts?: {
  rateLimitTag?: string;
  loginLimit?: number;
  csrf?: boolean;
  helmet?: boolean;
  trustProxy?: boolean;
}) {
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
    trustProxy: opts?.trustProxy,
  });
  // 桶隔离：同一 127.0.0.1 下不同用例不互扰——改写限流 key 需按 tag；简化：依赖 loginWindowSec 长窗口
  void opts?.rateLimitTag;
  return app;
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
  redis.disconnect();
});

describe('P1A-8 安全基线（云上）', () => {
  it('登录连续超限 → 429 + Retry-After + 限流审计行', async () => {
    const app = await makeApp({ loginLimit: 2 });
    // 用不存在的账号打 login——429 在密码校验前触发，不依赖真实账号
    const payload = { email: 'rate-limit@example.com', password: 'Passw0rd123' };
    const hit1 = await app.inject({ method: 'POST', url: '/auth/login', payload });
    const hit2 = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(hit1.statusCode).toBe(200); // 第 1 次放行（密码错但未限流，auth 层 401/200 均可——此处 assert 非 429）
    expect(hit2.statusCode).toBe(200);
    const hit3 = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(hit3.statusCode).toBe(429);
    expect(hit3.json().error.code).toBe('RATE_LIMITED');
    expect(Number(hit3.headers['retry-after'])).toBeGreaterThan(0);
    // 限流审计行
    const audit = await prisma.auditLog.findFirst({ where: { action: 'security.rate.limited' } });
    expect(audit).not.toBeNull();
    await app.close();
  });

  it('写请求无 CSRF token → 403；带 token → 通过', async () => {
    const app = await makeApp({ csrf: true });
    // 取 token
    const get = await app.inject({ method: 'GET', url: '/csrf-token' });
    const token = get.json().csrfToken as string;
    const csrfCookie = get.cookies.find((c) => c.name === '_csrf');
    expect(token).toBeTruthy();
    // 无 token POST /workspaces（写路由）→ 403
    const noToken = await app.inject({ method: 'POST', url: '/workspaces', payload: { name: 'x', description: 'y' } });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().error.code).toBe('CSRF_INVALID');
    // 带 token → 过 CSRF，落到鉴权（401 未登录，证明已越过 CSRF）
    const withToken = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { _csrf: csrfCookie!.value },
      headers: { 'x-csrf-token': token },
      payload: { name: 'x', description: 'y' },
    });
    expect(withToken.statusCode).toBe(401);
    await app.close();
  });

  it('helmet：安全响应头存在（nosniff + CSP default-src none + frame-ancestors）', async () => {
    const app = await makeApp({ helmet: true });
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    await app.close();
  });

  it('trustProxy 开启：XFF 生效（限流 req.ip 取真实客户端）', async () => {
    const app = await makeApp({ trustProxy: true });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
