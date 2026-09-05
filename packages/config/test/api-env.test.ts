import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../src/api-env';

describe('loadApiEnv', () => {
  const PROD_SMTP = { SMTP_HOST: 'smtp.qq.com', SMTP_PORT: '465', SMTP_USER: 'a@qq.com', SMTP_PASS: 'code' };
  const TEMP_DOCUMENT_SIGNING_SECRET = 'production-temporary-document-signing-secret';

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
      TEMP_DOCUMENT_SIGNING_SECRET,
      ...PROD_SMTP,
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

  // P1A-9：SMTP env + MAILER_DRIVER
  it('dev 缺省 mailerDriver=outbox（无 SMTP env 不炸）', () => {
    const env = loadApiEnv({});
    expect(env.mailerDriver).toBe('outbox');
    expect(env.smtpHost).toBe('');
  });

  it('MAILER_DRIVER=smtp + SMTP env 完整 → 字段就位', () => {
    const env = loadApiEnv({
      MAILER_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.qq.com',
      SMTP_PORT: '465',
      SMTP_USER: 'openscience@qq.com',
      SMTP_PASS: 'auth-code',
    });
    expect(env.mailerDriver).toBe('smtp');
    expect(env.smtpHost).toBe('smtp.qq.com');
    expect(env.smtpPort).toBe(465);
    expect(env.smtpUser).toBe('openscience@qq.com');
    expect(env.smtpPass).toBe('auth-code');
  });

  it('生产缺省 mailerDriver=smtp；smtp 缺 SMTP env → 快速失败', () => {
    const base = {
      NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x', COOKIE_SECRET: 's3cret',
      TEMP_DOCUMENT_SIGNING_SECRET,
    };
    expect(loadApiEnv({ ...base, ...PROD_SMTP }).mailerDriver).toBe('smtp');
    expect(() => loadApiEnv({ ...base, MAILER_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);
    // smtpPort 有默认 465，给 host 后下一个缺失是 SMTP_USER
    expect(() => loadApiEnv({ ...base, MAILER_DRIVER: 'smtp', SMTP_HOST: 'smtp.qq.com' })).toThrow(/SMTP_USER/);
  });

  it('keeps academic identity providers disabled until complete credentials are configured', () => {
    const env = loadApiEnv({ INSTITUTION_EMAIL_DOMAINS: 'zju.edu.cn, @mit.edu' });
    expect(env.orcid.clientId).toBe('');
    expect(env.institutionEmailDomains).toEqual(['zju.edu.cn', 'mit.edu']);
    expect(() => loadApiEnv({ ORCID_CLIENT_ID: 'APP-ONLY' })).toThrow(/configured together/);
  });

  it('accepts a complete ORCID Sandbox configuration', () => {
    const env = loadApiEnv({
      ORCID_CLIENT_ID: 'APP-TEST', ORCID_CLIENT_SECRET: 'secret',
      ORCID_REDIRECT_URI: 'http://127.0.0.1:3000/api/auth/orcid/callback',
    });
    expect(env.orcid.baseUrl).toBe('https://sandbox.orcid.org');
    expect(env.orcid.redirectUri).toContain('/api/auth/orcid/callback');
  });
});

it('scene imagery is opt-in and requires enabled AI plus a configured credential', () => {
  expect(loadApiEnv({}).ai.sceneImageEnabled).toBe(false);
  expect(loadApiEnv({ MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: 'test' }).ai.sceneImageEnabled).toBe(false);
  expect(loadApiEnv({ AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true' }).ai.sceneImageEnabled).toBe(false);
  expect(loadApiEnv({ AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: 'test' }).ai.sceneImageEnabled).toBe(true);
});

it('scene image config shares key2 readiness and ignores blank credentials', () => {
  const flags = { AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true' };
  expect(loadApiEnv({ ...flags, MINIMAX_API_KEY: '   ' }).ai.sceneImageEnabled).toBe(false);
  expect(loadApiEnv({ ...flags, MINIMAX_API_KEY: '   ', MINIMAX_API_KEY_2: ' second ' }).ai.sceneImageEnabled).toBe(true);
  expect(loadApiEnv({ ...flags, MINIMAX_API_KEY_2: 'second', AI_DISABLED_PROVIDERS: ' minimax-image ' }).ai.sceneImageEnabled).toBe(false);
});
