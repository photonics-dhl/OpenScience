import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@openscience/observability';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

function captureStream(lines: string[]): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
}

describe('P1A-6 logger 注入（loggerInstance 路径回归）', () => {
  it('注入 pino 实例 → buildApp 不抛（FST_ERR_LOG_INVALID_LOGGER_CONFIG 回归）且请求产生日志行', async () => {
    const lines: string[] = [];
    const logger = createLogger({ destination: captureStream(lines) });
    const { prisma } = createFakePrisma();
    const app = await buildApp({
      prisma,
      redis: createFakeRedis(),
      mailer: createFakeMailer(),
      cookieSecret: 'test-secret',
      secureCookies: false,
      logger,
    });
    const res = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(res.statusCode).toBe(401);
    await new Promise((resolve) => setImmediate(resolve));
    expect(lines.some((l) => l.includes('request completed'))).toBe(true);
  });

  it('真实 HTTP 请求（真 socket 成环）不触发 sanitizeValue 栈溢出，进程存活且有请求日志', async () => {
    const lines: string[] = [];
    const logger = createLogger({ destination: captureStream(lines) });
    const { prisma } = createFakePrisma();
    const app = await buildApp({
      prisma,
      redis: createFakeRedis(),
      mailer: createFakeMailer(),
      cookieSecret: 'test-secret',
      secureCookies: false,
      logger,
    });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const res = await fetch(`${address}/workspaces`);
      expect(res.status).toBe(401);
      // 进程未因 RangeError 崩溃：再发一次确认服务仍可用
      const res2 = await fetch(`${address}/workspaces`);
      expect(res2.status).toBe(401);
      await new Promise((resolve) => setImmediate(resolve));
      expect(lines.some((l) => l.includes('incoming request'))).toBe(true);
      expect(lines.some((l) => l.includes('request completed'))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
