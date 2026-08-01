import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import type { AuditEvent, AuditSink } from '@openscience/observability';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

function createRecordingAudit(): { audit: AuditSink; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return { audit: { record: async (event) => { events.push(event); } }, events };
}

async function setup(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const app = await buildApp({ prisma, redis, mailer, audit, cookieSecret: 'test-secret', secureCookies: false });
  const loginAs = async (userId: string, email: string, displayName = 'User'): Promise<string> => {
    db.users.push({ id: userId, email, displayName, passwordHash: 'x', status: 'email_verified', createdAt: new Date(), updatedAt: new Date() });
    return createSession(redis, { userId, status: 'email_verified' });
  };
  const authed = (token: string) => ({ cookies: { openscience_session: token } });
  return { app, db, mailer, loginAs, authed };
}

async function createTeam(app: any, token: string, name = 'Lab'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/workspaces', ...({ cookies: { openscience_session: token } }), payload: { name } });
  return res.json().id;
}

describe('/workspaces 认证与创建', () => {
  it('无 cookie → 401 SESSION_INVALID', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_INVALID');
  });

  it('创建 team → 201 且出现在我的空间列表', async () => {
    const { app, authed, loginAs } = await setup();
    const token = await loginAs(U1, 'a@example.com');
    const created = await app.inject({ method: 'POST', url: '/workspaces', ...authed(token), payload: { name: 'NLP Lab' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ type: 'team', name: 'NLP Lab', role: 'owner' });
    const list = await app.inject({ method: 'GET', url: '/workspaces', ...authed(token) });
    expect(list.json().workspaces.map((w: any) => w.id)).toContain(created.json().id);
  });

  it('POST /workspaces 成功 → domain 审计事件经 deps.audit 流出（含 requestId）', async () => {
    const { audit, events } = createRecordingAudit();
    const { app, authed, loginAs } = await setup(audit);
    const token = await loginAs(U1, 'a@example.com');
    const created = await app.inject({ method: 'POST', url: '/workspaces', ...authed(token), payload: { name: 'Lab' } });
    expect(created.statusCode).toBe(201);
    const created_ = events.find((e) => e.action === 'workspace.create');
    expect(created_).toBeDefined();
    expect(created_?.actorId).toBe(U1);
    expect(typeof created_?.requestId).toBe('string');
    expect(created_?.requestId).not.toBe('');
  });
});

describe('越权与角色检查', () => {
  it('非成员访问详情 → 404 WORKSPACE_NOT_FOUND（不泄露存在性）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'GET', url: `/workspaces/${id}`, ...authed(t2) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('viewer 改资料 → 403 FORBIDDEN', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-v', workspaceId: id, userId: U2, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, ...authed(t2), payload: { name: 'X' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('非法请求体（邮箱格式错误）→ 400 VALIDATION_ERROR', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'not-an-email', role: 'author' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('邀请闭环', () => {
  it('author 邀请 → 403；owner 邀请 → 202 且发出通知邮件', async () => {
    const { app, db, mailer, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-a', workspaceId: id, userId: U2, role: 'author', createdAt: new Date(), updatedAt: new Date() });
    const forbidden = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t2), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(forbidden.statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(ok.statusCode).toBe(202);
    expect(mailer.sent.some((m) => m.to === 'c@example.com')).toBe(true);
  });

  it('邀请预指派 owner → 400 VALIDATION_ERROR（所有权只能经 transfer 产生，2026-07-29 评审裁决）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'owner' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('受邀者可见待邀 → accept 201 → 出现在成员列表', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t3 = await loginAs(U3, 'c@example.com');
    const id = await createTeam(app, t1);
    await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'author' } });

    const inbox = await app.inject({ method: 'GET', url: '/workspaces/invitations', ...authed(t3) });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().invitations).toHaveLength(1);
    expect(inbox.json().invitations[0]).toMatchObject({ workspaceId: id, workspaceName: 'Lab', role: 'author' });

    const accepted = await app.inject({ method: 'POST', url: `/workspaces/invitations/${inbox.json().invitations[0].id}/accept`, ...authed(t3) });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ workspaceId: id, userId: U3, role: 'author' });

    const members = await app.inject({ method: 'GET', url: `/workspaces/${id}/members`, ...authed(t1) });
    expect(members.json().members.map((m: any) => m.userId)).toContain(U3);
  });

  it('accept 他人邀请 → 404（枚举面控制）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    const invited = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'author' } });
    const res = await app.inject({ method: 'POST', url: `/workspaces/invitations/${invited.json().invitationId}/accept`, ...authed(t2) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('personal 空间拒绝邀请 → 409 PERSONAL_WORKSPACE', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    db.workspaces.push({ id: '44444444-4444-4444-8444-444444444444', type: 'personal', name: '我的空间', ownerId: U1, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: '44444444-4444-4444-8444-444444444444', userId: U1, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: '/workspaces/44444444-4444-4444-8444-444444444444/invitations', ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PERSONAL_WORKSPACE');
  });
});

describe('成员管理与不变量', () => {
  it('降级唯一 owner → 409 LAST_OWNER', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}/members/${U1}`, ...authed(t1), payload: { role: 'maintainer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LAST_OWNER');
  });

  it('唯一 owner 退出 → 409 LAST_OWNER；普通成员退出 → 204', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-a', workspaceId: id, userId: U2, role: 'author', createdAt: new Date(), updatedAt: new Date() });
    const ownerLeave = await app.inject({ method: 'POST', url: `/workspaces/${id}/leave`, ...authed(t1) });
    expect(ownerLeave.statusCode).toBe(409);
    const memberLeave = await app.inject({ method: 'POST', url: `/workspaces/${id}/leave`, ...authed(t2) });
    expect(memberLeave.statusCode).toBe(204);
  });

  it('归档后拒绝邀请 → 409 WORKSPACE_ARCHIVED', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const archived = await app.inject({ method: 'POST', url: `/workspaces/${id}/archive`, ...authed(t1) });
    expect(archived.statusCode).toBe(204);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('WORKSPACE_ARCHIVED');
  });

  it('转让所有权 → 204，原 owner 变 maintainer', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-m', workspaceId: id, userId: U2, role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/transfer`, ...authed(t1), payload: { newOwnerId: U2 } });
    expect(res.statusCode).toBe(204);
    expect(db.memberships.find((m: any) => m.userId === U1).role).toBe('maintainer');
    expect(db.workspaces.find((w: any) => w.id === id).ownerId).toBe(U2);
  });
});
