import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@openscience/observability';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

describe('P1A-6 logger 注入（loggerInstance 路径回归）', () => {
  it('注入 pino 实例 → buildApp 不抛（FST_ERR_LOG_INVALID_LOGGER_CONFIG 回归）且请求产生日志行', async () => {
    const lines: string[] = [];
    const capture = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger({ destination: capture });
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
});
