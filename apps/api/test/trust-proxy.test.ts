import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

describe('P1A-8 trustProxy', () => {
  it('trustProxy=true：req.ip 取 X-Forwarded-For（信任一层代理）', async () => {
    const { prisma } = createFakePrisma();
    const app = await buildApp({
      prisma,
      redis: createFakeRedis(),
      mailer: createFakeMailer(),
      cookieSecret: 'test-secret',
      secureCookies: false,
      trustProxy: true,
    });
    // 探测 hook：把 req.ip 写入响应头，验证 trustProxy 生效
    app.addHook('onSend', (req, reply, _payload, done) => {
      reply.header('x-debug-ip', req.ip);
      done();
    });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-debug-ip']).toBe('203.0.113.9');
    await app.close();
  });

  it('trustProxy 缺省：req.ip 忽略 XFF（127.0.0.1）', async () => {
    const { prisma } = createFakePrisma();
    const app = await buildApp({
      prisma,
      redis: createFakeRedis(),
      mailer: createFakeMailer(),
      cookieSecret: 'test-secret',
      secureCookies: false,
    });
    app.addHook('onSend', (req, reply, _payload, done) => {
      reply.header('x-debug-ip', req.ip);
      done();
    });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-debug-ip']).toBe('127.0.0.1');
    await app.close();
  });
});
