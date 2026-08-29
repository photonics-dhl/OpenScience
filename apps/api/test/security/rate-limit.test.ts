import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerRateLimit, RATE_LIMIT_ROUTES } from '../../src/security/rate-limit';
import type { AuditSink } from '@openscience/observability';
import { httpStatusForError } from '../../src/error-map';

/** 固定窗口 fake：key 计数单调递增（手动控制窗口翻转）。 */
function makeFakeRedis() {
  const store = new Map<string, number>();
  return {
    multi: () => {
      const calls: Array<['incr' | 'expire', string, number?]> = [];
      const chain = {
        incr: (k: string) => (calls.push(['incr', k]), chain),
        expire: (k: string, s: number) => (calls.push(['expire', k, s]), chain),
        exec: async () => {
          const out: Array<[Error | null, unknown]> = [];
          for (const [op, k] of calls) {
            if (op === 'incr') {
              const next = (store.get(k) ?? 0) + 1;
              store.set(k, next);
              out.push([null, next]);
            } else out.push([null, 1]);
          }
          return out;
        },
      };
      return chain;
    },
    store,
  };
}

function makeAudit() {
  const record = vi.fn().mockResolvedValue(undefined);
  const sink: AuditSink = { record };
  return { record, sink };
}

describe('registerRateLimit（Fastify 封装）', () => {
  it('登录超限 → 429 + Retry-After + 审计行', async () => {
    const f = makeFakeRedis();
    const { record, sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    app.setErrorHandler((err, req, reply) => {
      const { status, body } = httpStatusForError(err, String(req.id));
      void reply.status(status).send(body);
    });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: true, loginLimit: 2, loginWindowSec: 60 });
    app.post('/auth/login', async () => ({ ok: true }));

    const hit1 = await app.inject({ method: 'POST', url: '/auth/login' });
    const hit2 = await app.inject({ method: 'POST', url: '/auth/login' });
    const hit3 = await app.inject({ method: 'POST', url: '/auth/login' });
    expect(hit1.statusCode).toBe(200);
    expect(hit2.statusCode).toBe(200);
    expect(hit3.statusCode).toBe(429);
    expect(hit3.json().error.code).toBe('RATE_LIMITED');
    expect(hit3.headers['retry-after']).toBeDefined();
    expect(Number(hit3.headers['retry-after'])).toBeGreaterThan(0);
    // 限流触发记审计（第三次）
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ action: 'security.rate.limited' });
    await app.close();
  });

  it('enabled=false → 全放行', async () => {
    const f = makeFakeRedis();
    const { record, sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: false, loginLimit: 1, loginWindowSec: 60 });
    app.post('/auth/login', async () => ({ ok: true }));
    const a = await app.inject({ method: 'POST', url: '/auth/login' });
    const b = await app.inject({ method: 'POST', url: '/auth/login' });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(record).not.toHaveBeenCalled();
    await app.close();
  });

  it('非登录路由不限流', async () => {
    const f = makeFakeRedis();
    const { sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: true, loginLimit: 1, loginWindowSec: 60 });
    app.post('/other', async () => ({ ok: true }));
    const a = await app.inject({ method: 'POST', url: '/other' });
    const b = await app.inject({ method: 'POST', url: '/other' });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    await app.close();
  });

  it.each([
    ['/auth/request-signup-code', 3],
    ['/auth/confirm-signup', 10],
  ])('%s 超过验证码档位后返回 429', async (path, limit) => {
    const f = makeFakeRedis();
    const { sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: true });
    app.post(path, async () => ({ ok: true }));
    for (let hit = 0; hit < limit; hit++) {
      expect((await app.inject({ method: 'POST', url: path })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: path })).statusCode).toBe(429);
    await app.close();
  });

  it.each([
    ['/research-objects/:id/ingest', '/research-objects/ro-1/ingest', 5],
    ['/ingestion/:taskId/retry', '/ingestion/task-1/retry', 10],
    ['/agent/tasks', '/agent/tasks', 20],
    ['/agent/tasks/:id/retry', '/agent/tasks/00000000-0000-4000-8000-000000000001/retry', 10],
  ])('%s 超过资源密集型档位后返回 429', async (route, url, limit) => {
    const f = makeFakeRedis();
    const { sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: true });
    app.post(route, async () => ({ ok: true }));
    for (let hit = 0; hit < limit; hit++) {
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(429);
    await app.close();
  });

  it('不同 RO UUID 共享同一 ingestion 路由限流桶', async () => {
    const f = makeFakeRedis();
    const { sink } = makeAudit();
    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await registerRateLimit(app, { redis: f as never, audit: sink, enabled: true });
    app.post('/research-objects/:id/ingest', async () => ({ ok: true }));
    for (let hit = 0; hit < 5; hit++) {
      expect((await app.inject({ method: 'POST', url: `/research-objects/00000000-0000-4000-8000-00000000000${hit}/ingest` })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: '/research-objects/00000000-0000-4000-8000-000000000099/ingest' })).statusCode).toBe(429);
    await app.close();
  });

  it('RATE_LIMIT_ROUTES 声明表含登录档位（挂接点）', () => {
    expect(RATE_LIMIT_ROUTES['/auth/login']).toBeDefined();
    expect(RATE_LIMIT_ROUTES['/auth/login'].windowSec).toBe(60);
  });
});
