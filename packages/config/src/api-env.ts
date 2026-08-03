import { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from './dev-defaults';

export interface ApiEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  cookieSecret: string;
  secureCookies: boolean;
  /** P1A-8：CORS 白名单（逗号分隔 env 解析为数组）；空 = 同源策略（dev 默认）。 */
  allowedOrigins: string[];
  /** P1A-8：限流总开关（集成测试可关）。 */
  rateLimitEnabled: boolean;
  rateLimitLoginLimit: number;
  rateLimitLoginWindowSec: number;
}

const DEV_RATE_LIMIT_LOGIN_LIMIT = 5;
const DEV_RATE_LIMIT_LOGIN_WINDOW_SEC = 60;

/** 启动期 env 校验：生产缺必需 env 立即 throw（快速失败，终审 parked 项修复）；dev 回落 P1A-2 默认值。 */
export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const nodeEnv = env.NODE_ENV ?? 'development';

  const databaseUrl = env.DATABASE_URL ?? (nodeEnv === 'production' ? '' : DEFAULT_DEV_DATABASE_URL);
  if (!databaseUrl) throw new Error('DATABASE_URL is required when NODE_ENV=production');

  const redisUrl = env.REDIS_URL ?? (nodeEnv === 'production' ? '' : DEFAULT_DEV_REDIS_URL);
  if (!redisUrl) throw new Error('REDIS_URL is required when NODE_ENV=production');

  const cookieSecret = env.COOKIE_SECRET ?? (nodeEnv === 'production' ? '' : 'openscience-dev-cookie-secret');
  if (!cookieSecret) throw new Error('COOKIE_SECRET is required when NODE_ENV=production');

  const port = Number(env.PORT ?? '3001');
  if (Number.isNaN(port)) throw new Error(`PORT must be a number, got "${env.PORT}"`);

  const rateLimitLoginLimit = Number(env.RATE_LIMIT_LOGIN_LIMIT ?? String(DEV_RATE_LIMIT_LOGIN_LIMIT));
  if (!Number.isInteger(rateLimitLoginLimit) || rateLimitLoginLimit < 1) {
    throw new Error(`RATE_LIMIT_LOGIN_LIMIT must be a positive integer, got "${env.RATE_LIMIT_LOGIN_LIMIT}"`);
  }
  const rateLimitLoginWindowSec = Number(env.RATE_LIMIT_LOGIN_WINDOW_SEC ?? String(DEV_RATE_LIMIT_LOGIN_WINDOW_SEC));
  if (!Number.isInteger(rateLimitLoginWindowSec) || rateLimitLoginWindowSec < 1) {
    throw new Error(`RATE_LIMIT_LOGIN_WINDOW_SEC must be a positive integer, got "${env.RATE_LIMIT_LOGIN_WINDOW_SEC}"`);
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    redisUrl,
    cookieSecret,
    secureCookies: env.SECURE_COOKIES === 'true' || nodeEnv === 'production',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    rateLimitEnabled: env.RATE_LIMIT_ENABLED !== 'false',
    rateLimitLoginLimit,
    rateLimitLoginWindowSec,
  };
}
