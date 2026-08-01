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
});
