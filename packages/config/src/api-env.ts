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
  /** P1A-9：mailer 驱动（smtp 真发 / outbox dev 捕获）；dev 缺省 outbox，生产缺省 smtp。 */
  mailerDriver: 'smtp' | 'outbox';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  /** P1B-3：对象存储（StorageAdapter）S3_* env（缺省 dev MinIO，127.0.0.1:9000）。 */
  storage: {
    driver: 'minio' | 'oss';
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
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

  // P1A-9：mailer 驱动（dev 缺省 outbox 不阻塞本地；生产缺省 smtp 真发，缺 SMTP env 快速失败）
  const mailerDriver = (env.MAILER_DRIVER ?? (nodeEnv === 'production' ? 'smtp' : 'outbox')) as 'smtp' | 'outbox';
  if (mailerDriver !== 'smtp' && mailerDriver !== 'outbox') {
    throw new Error(`MAILER_DRIVER must be 'smtp' or 'outbox', got "${env.MAILER_DRIVER}"`);
  }
  const smtpHost = env.SMTP_HOST ?? '';
  const smtpPort = Number(env.SMTP_PORT ?? '465');
  const smtpUser = env.SMTP_USER ?? '';
  const smtpPass = env.SMTP_PASS ?? '';
  if (mailerDriver === 'smtp') {
    if (!smtpHost) throw new Error('SMTP_HOST is required when MAILER_DRIVER=smtp');
    if (!smtpPort) throw new Error('SMTP_PORT is required when MAILER_DRIVER=smtp');
    if (!smtpUser) throw new Error('SMTP_USER is required when MAILER_DRIVER=smtp');
    if (!smtpPass) throw new Error('SMTP_PASS is required when MAILER_DRIVER=smtp');
  }

  // P1B-3：对象存储（P1A-2 storageConfigFromEnv 同源，S3_* env）
  const rawDriver = env.S3_DRIVER ?? 'minio';
  if (rawDriver !== 'minio' && rawDriver !== 'oss') {
    throw new Error(`S3_DRIVER must be 'minio' or 'oss', got "${env.S3_DRIVER}"`);
  }
  const storage: ApiEnv['storage'] = {
    driver: rawDriver,
    endPoint: env.S3_ENDPOINT ?? '127.0.0.1',
    port: Number(env.S3_PORT ?? '9000'),
    useSSL: env.S3_USE_SSL === 'true',
    accessKey: env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: env.S3_SECRET_KEY ?? 'openscience_minio_dev',
    bucket: env.S3_BUCKET ?? 'openscience-dev',
  };

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
    mailerDriver,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    storage,
  };
}
