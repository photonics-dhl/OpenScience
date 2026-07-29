import { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from '@openscience/database';

export interface ApiEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  cookieSecret: string;
  secureCookies: boolean;
}

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

  return {
    nodeEnv,
    port,
    databaseUrl,
    redisUrl,
    cookieSecret,
    secureCookies: env.SECURE_COOKIES === 'true' || nodeEnv === 'production',
  };
}
