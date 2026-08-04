import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace, createAgentSession, submitAgentTask, getAgentTask, AGENT_TASK_QUEUE } from '@openscience/domain';
import { createHandlers, createPollOnce } from '@openscience/agent-worker';
import type { AiGateway } from '@openscience/ai-gateway';
import { createStorageAdapter, storageConfigFromEnv } from '@openscience/storage';
import { buildApp } from '../src/app';

/**
 * P1D-5 集成测试（云上执行）：真 PG/Redis/MinIO。
 * 发布审核硬阻断：缺许可版本 → blocked；正常版本 → passed（§11.1/§15/§6.3/§7）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const storage = createStorageAdapter(storageConfigFromEnv());
const repoRoot = path.resolve(__dirname, '../../..');

async function makeApp() {
  return buildApp({
    prisma, redis, mailer, storage,
    audit: createPrismaAuditSink(prisma),
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: 'integration-secret',
    secureCookies: false,
  });
}
function createInviteCode(email: string): string {
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts/invite.mjs'), 'create', '--email', email], { encoding: 'utf8' });
  const m = out.match(/[A-Z2-9]{20}/);
  return m![0];
}
async function latestOutboxCode(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } });
  return mail!.bodyText.match(/\d{6}/)![0];
}
async function registerAndVerify(app: Awaited<ReturnType<typeof makeApp>>, email: string): Promise<string> {
  const code = createInviteCode(email);
  await app.inject({ method: 'POST', url: '/auth/register', payload: { invitationCode: code, email, password: 'Passw0rd123', displayName: 'x' } });
  const vc = await latestOutboxCode(email);
  await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code: vc } });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'Passw0rd123' } });
  return login.cookies.find((c) => c.name === 'openscience_session')!.value;
}
async function getPersonalWorkspace(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  return (await prisma.workspace.findFirst({ where: { type: 'personal', ownerId: user!.id } }))!.id;
}

beforeAll(async () => {
  // 清队列残留（防 poll 消费陈旧任务 id）
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
});

afterAll(async () => {
  await redis.del(AGENT_TASK_QUEUE);
  await redis.del(`${AGENT_TASK_QUEUE}:processing`);
  await prisma.aiReview.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.licenseAssignment.deleteMany();
  await prisma.manifestEntry.deleteMany();
  await prisma.versionManifest.deleteMany();
  await prisma.version.deleteMany();
  await prisma.commit.deleteMany();
  await prisma.branch.updateMany({ data: { headCommitId: null } });
  await prisma.branch.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.usageLedger.deleteMany();
  await prisma.quotaPolicy.deleteMany();
  await prisma.sdfNode.deleteMany();
  await prisma.sdfDocument.deleteMany();
  await prisma.researchObject.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.mailOutbox.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1D-5 发布审核硬阻断（云上，迁移 16）', () => {
  it('缺许可版本 → blocked license_missing；正常版本 → passed（§11.1/§6.3）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'p5@example.com');
    const wsId = await getPersonalWorkspace('p5@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'P5 RO' } });
    const ro = createRo.json().researchObject;

    // commit（完整 core，无许可）
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    expect(commit.statusCode).toBe(201);
    const versionId = commit.json().commit.versionId;

    // 缺许可 → blocked
    const blocked = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().review.status).toBe('blocked');
    expect(blocked.json().review.hardBlocks.some((b: { code: string }) => b.code === 'license_missing')).toBe(true);

    // 补许可 → passed
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookie }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const passed = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(passed.json().review.status).toBe('passed');
    expect(passed.json().review.hardBlocks).toHaveLength(0);

    // §11.3 稳定记录可查
    const saved = await app.inject({ method: 'GET', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(saved.json().review.status).toBe('passed');

    // §16 ai_review.completed 事件
    const notif = await prisma.notification.findFirst({ where: { type: 'ai_review.completed' } });
    expect(notif?.payload).toMatchObject({ versionId });
    await app.close();
  });

  it('隐私泄露（core 含身份证）→ blocked sensitive_leak（§17）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'p5b@example.com');
    const wsId = await getPersonalWorkspace('p5b@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'P5B RO' } });
    const ro = createRo.json().researchObject;
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookie }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: '身份证 110105199003071234', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    const versionId = commit.json().commit.versionId;
    const review = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(review.json().review.status).toBe('blocked');
    expect(review.json().review.hardBlocks.some((b: { code: string }) => b.code === 'sensitive_leak')).toBe(true);
    await app.close();
  });

  it('P1D-6 警告层：含警告版本 status 仍 passed（§11.2 不阻断）', async () => {
    const app = await makeApp();
    const cookie = await registerAndVerify(app, 'p6@example.com');
    const wsId = await getPersonalWorkspace('p6@example.com');
    const createRo = await app.inject({ method: 'POST', url: '/research-objects', cookies: { openscience_session: cookie }, payload: { workspaceId: wsId, title: 'P6 RO' } });
    const ro = createRo.json().researchObject;
    await app.inject({ method: 'PUT', url: `/research-objects/${ro.id}/licenses`, cookies: { openscience_session: cookie }, payload: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' } });
    const commit = await app.inject({ method: 'POST', url: `/research-objects/${ro.id}/commits`, cookies: { openscience_session: cookie }, payload: { message: 'v1', version: 1, sdfCore: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' } } });
    const versionId = commit.json().commit.versionId;

    // 硬阻断 passed（可发布）
    const review = await app.inject({ method: 'POST', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(review.json().review.status).toBe('passed');

    // mock gateway 注入 worker → review.analyze 生成警告 → warnings 落库
    const deps = { prisma, redis, mailer: { send: async () => undefined } };
    const user = await prisma.user.findUnique({ where: { email: 'p6@example.com' } });
    await prisma.usageLedger.create({ data: { userId: user!.id, resource: 'ai_credit', delta: 100, kind: 'grant' } });
    const mockProvider = { name: 'mock', complete: async () => ({ text: JSON.stringify([
      { id: 'w1', category: 'overreach', evidence: '§results 第 3 段', uncertainty: '样本量小，无法确认普适性', suggestion: '补充局限说明' },
    ]), usage: { inputTokens: 2, outputTokens: 2 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [mockProvider], logger: console }) as AiGateway;
    const handlers = createHandlers(gateway);
    const pollOnce = await createPollOnce(handlers);
    const session = await createAgentSession(deps, { userId: user!.id, kind: 'review' });
    const task = await submitAgentTask(deps, { sessionId: session.id, userId: user!.id, kind: 'review.analyze', payload: { versionId, coreText: '研究正文……' } });
    // 消费队列直至本任务完成（队列可能含路由异步入队的 analyze，逐项消费）
    for (let i = 0; i < 5; i++) {
      await pollOnce(deps);
      const cur = await getAgentTask(deps, { userId: user!.id, taskId: task.id });
      if (cur.status === 'succeeded' || cur.status === 'failed') break;
    }
    const done = await getAgentTask(deps, { userId: user!.id, taskId: task.id });
    expect(done.status).toBe('succeeded');

    // 警告随审核记录可查（§11.2 随版本存档 + §15 AIReview.warnings）
    const saved = await app.inject({ method: 'GET', url: `/versions/${versionId}/review`, cookies: { openscience_session: cookie } });
    expect(saved.json().review.warnings).toHaveLength(1);
    const w = saved.json().review.warnings[0];
    // 结构化：证据位置 + 不确定性，无单一分数（§11.2）
    expect(w.evidence).toContain('§results');
    expect(w.uncertainty).toBeTruthy();
    expect(typeof w.score).toBe('undefined');
    // 不阻断：status 仍 passed
    expect(saved.json().review.status).toBe('passed');
    await app.close();
  });
});
