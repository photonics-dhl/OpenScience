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
  orcid: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    baseUrl: string;
  };
  institutionEmailDomains: string[];
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
  /** P1B-6：公开 ID 前缀（§6.1 OSR-YYYY-NNNNNN；§24 待确认项，配置而非常量）。 */
  publicIdPrefix: string;
  downloadSigningSecret: string;
  downloadSigningKeyId: string;
  /** P1D-1：AI Gateway（§9.3 + §24 待确认：MiniMax-M3 及回退模型配置，先占位不写死）。 */
  ai: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    primaryModel: string;
    fallbackModels: string[];
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
  const downloadSigningSecret = env.TEMP_DOCUMENT_SIGNING_SECRET
    ?? (nodeEnv === 'production' ? '' : 'openscience-dev-temporary-document-signing-secret');
  if (Buffer.byteLength(downloadSigningSecret, 'utf8') < 32) {
    throw new Error('TEMP_DOCUMENT_SIGNING_SECRET must be at least 32 bytes');
  }
  const downloadSigningKeyId = env.TEMP_DOCUMENT_SIGNING_KEY_ID ?? 'download-v1';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(downloadSigningKeyId)) {
    throw new Error('TEMP_DOCUMENT_SIGNING_KEY_ID is invalid');
  }

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

  const orcid = {
    clientId: env.ORCID_CLIENT_ID ?? '',
    clientSecret: env.ORCID_CLIENT_SECRET ?? '',
    redirectUri: env.ORCID_REDIRECT_URI ?? '',
    baseUrl: (env.ORCID_BASE_URL ?? (nodeEnv === 'production' ? 'https://orcid.org' : 'https://sandbox.orcid.org')).replace(/\/$/, ''),
  };
  const orcidPartiallyConfigured = [orcid.clientId, orcid.clientSecret, orcid.redirectUri].some(Boolean)
    && ![orcid.clientId, orcid.clientSecret, orcid.redirectUri].every(Boolean);
  if (orcidPartiallyConfigured) throw new Error('ORCID_CLIENT_ID, ORCID_CLIENT_SECRET and ORCID_REDIRECT_URI must be configured together');
  if (orcid.redirectUri) {
    const redirect = new URL(orcid.redirectUri);
    if (nodeEnv === 'production' && redirect.protocol !== 'https:') throw new Error('ORCID_REDIRECT_URI must use HTTPS in production');
  }
  const institutionEmailDomains = (env.INSTITUTION_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

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

  // P1B-6：公开 ID 前缀（§24 待确认，配置化）
  const publicIdPrefix = (env.PUBLIC_ID_PREFIX ?? 'OSR').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(publicIdPrefix)) {
    throw new Error(`PUBLIC_ID_PREFIX must be 2-8 uppercase alphanumeric, got "${publicIdPrefix}"`);
  }

  // P1D-1：AI Gateway 配置（§24 待确认：MiniMax-M3 及回退模型具体 API/ID，先占位）
  const aiEnabled = env.AI_ENABLED === 'true';
  const ai = {
    enabled: aiEnabled,
    baseUrl: env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1',
    apiKey: env.MINIMAX_API_KEY ?? '',
    primaryModel: env.MINIMAX_MODEL ?? 'MiniMax-M3',
    fallbackModels: (env.AI_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0),
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
    orcid,
    institutionEmailDomains,
    storage,
    publicIdPrefix,
    downloadSigningSecret,
    downloadSigningKeyId,
    ai,
  };
}
