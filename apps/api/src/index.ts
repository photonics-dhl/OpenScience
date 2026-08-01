import { DevOutboxMailer } from '@openscience/auth';
import { loadApiEnv } from '@openscience/config';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createLogger } from '@openscience/observability';
import { buildApp } from './app';

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
  const logger = createLogger({ level: env.nodeEnv === 'production' ? 'info' : 'debug' });
  const app = await buildApp({
    prisma,
    redis,
    mailer,
    // P1A-6：审计落库（domain/auth 写操作 + authz.deny 经 deps.audit 流出）
    audit: createPrismaAuditSink(prisma),
    // P1A-4：邮箱验证通过同事务创建 Personal Workspace（回调注入，避免 auth→domain 反向依赖）
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: env.cookieSecret,
    secureCookies: env.secureCookies,
    logger,
  });
  await app.listen({ port: env.port, host: '127.0.0.1' });
  app.log.info({ port: env.port, nodeEnv: env.nodeEnv }, 'API listening');
}

void main();
