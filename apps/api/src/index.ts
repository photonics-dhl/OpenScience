import { DevOutboxMailer, SmtpMailer } from '@openscience/auth';
import { loadApiEnv } from '@openscience/config';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { createLogger } from '@openscience/observability';
import { buildApp } from './app';

async function main(): Promise<void> {
  const env = loadApiEnv();
  const prisma = createPrismaClient({ datasourceUrl: env.databaseUrl });
  const redis = createRedisClient(env.redisUrl);
  // P1A-9 §3：mailer 驱动（dev 缺省 outbox 捕获；生产 smtp 真发，QQ SMTP env 缺失已在 loadApiEnv 快速失败）
  const mailer = env.mailerDriver === 'smtp'
    ? new SmtpMailer({ host: env.smtpHost, port: env.smtpPort, user: env.smtpUser, pass: env.smtpPass })
    : new DevOutboxMailer(prisma);
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
  // 生产容器绑 0.0.0.0（docker 发布端口连容器 eth0；compose 已限制宿主 127.0.0.1:3001，外部不可达）；
  // dev 绑 127.0.0.1（本机直连）。
  await app.listen({ port: env.port, host: env.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1' });
  app.log.info({ port: env.port, nodeEnv: env.nodeEnv }, 'API listening');
}

void main();
