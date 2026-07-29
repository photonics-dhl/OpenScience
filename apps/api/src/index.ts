import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { buildApp } from './app';
import { loadApiEnv } from './env';

async function main(): Promise<void> {
  const env = loadApiEnv();
  if (env.nodeEnv === 'production') {
    // §24 邮件服务商未定：生产尚无真实 Mailer，拒绝带 outbox 启动（宁可快速失败也不静默吞邮件）
    throw new Error('No production mailer configured (Spec §24 pending); refusing to start with DevOutboxMailer');
  }
  const prisma = createPrismaClient({ datasourceUrl: env.databaseUrl });
  const redis = createRedisClient(env.redisUrl);
  // MAILER_DRIVER=smtp 预留：§24 邮件服务商未定，dev 一律 outbox 捕获。
  const mailer = new DevOutboxMailer(prisma);
  const app = await buildApp({
    prisma,
    redis,
    mailer,
    cookieSecret: env.cookieSecret,
    secureCookies: env.secureCookies,
  });
  await app.listen({ port: env.port, host: '127.0.0.1' });
  console.log(`API listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
}

void main();
