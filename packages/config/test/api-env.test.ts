import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../src/api-env';

describe('loadApiEnv', () => {
  it('throws in production when DATABASE_URL is missing', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('throws in production when COOKIE_SECRET is missing', () => {
    expect(() =>
      loadApiEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' }),
    ).toThrow(/COOKIE_SECRET/);
  });

  it('accepts a complete production env and defaults secureCookies on', () => {
    const env = loadApiEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      REDIS_URL: 'redis://x',
      COOKIE_SECRET: 's3cret',
    });
    expect(env.secureCookies).toBe(true);
  });

  it('falls back to dev defaults outside production', () => {
    const env = loadApiEnv({});
    expect(env.databaseUrl).toContain('127.0.0.1:5432');
    expect(env.redisUrl).toBe('redis://127.0.0.1:6379');
    expect(env.port).toBe(3001);
    expect(env.secureCookies).toBe(false);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadApiEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  // P1A-8：限流 + CORS env
  it('dev 缺省：限流开、login 5/60、CORS 空（同源）', () => {
    const env = loadApiEnv({});
    expect(env.rateLimitEnabled).toBe(true);
    expect(env.rateLimitLoginLimit).toBe(5);
    expect(env.rateLimitLoginWindowSec).toBe(60);
    expect(env.allowedOrigins).toEqual([]);
  });

  it('ALLOWED_ORIGINS 逗号串 → 数组', () => {
    const env = loadApiEnv({ ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com' });
    expect(env.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('RATE_LIMIT_* 可覆盖', () => {
    const env = loadApiEnv({ RATE_LIMIT_LOGIN_LIMIT: '10', RATE_LIMIT_LOGIN_WINDOW_SEC: '120', RATE_LIMIT_ENABLED: 'false' });
    expect(env.rateLimitLoginLimit).toBe(10);
    expect(env.rateLimitLoginWindowSec).toBe(120);
    expect(env.rateLimitEnabled).toBe(false);
  });

  it('RATE_LIMIT_* 非法值 → 快速失败', () => {
    expect(() => loadApiEnv({ RATE_LIMIT_LOGIN_LIMIT: 'abc' })).toThrow(/RATE_LIMIT_LOGIN_LIMIT/);
    expect(() => loadApiEnv({ RATE_LIMIT_LOGIN_WINDOW_SEC: 'abc' })).toThrow(/RATE_LIMIT_LOGIN_WINDOW_SEC/);
  });
});
