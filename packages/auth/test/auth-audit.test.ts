import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditSink } from '@openscience/observability';
import { login, logout, register, resendCode, verifyEmail, type AuthDeps } from '../src/auth-service';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

const NOW = new Date('2026-07-28T12:00:00Z');

function setup() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const events: AuditEvent[] = [];
  const audit: AuditSink = {
    record: async (e) => {
      events.push(e);
    },
  };
  const deps: AuthDeps = { prisma, redis, mailer, now: () => NOW, audit };
  return { deps, db, redis, mailer, events };
}

/** 与 auth-service.test.ts 相同的本地 seed 写法（fakes.ts 不导出 seed 辅助）。 */
function seedInvitation(db: ReturnType<typeof createFakePrisma>['db'], overrides: Record<string, unknown> = {}) {
  db.invitations.push({
    id: 'inv-1',
    code: 'TESTCODE1234567890AB',
    email: null,
    createdBy: 'test',
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 86400000),
    createdAt: NOW,
    ...overrides,
  });
}

async function registerUser(deps: AuthDeps, mailer: { sent: Array<{ text: string }> }, email = 'a@x.com') {
  const result = await register(deps, {
    invitationCode: 'TESTCODE1234567890AB',
    email,
    password: 'pw-123456',
    displayName: 'A',
  });
  const code = mailer.sent[mailer.sent.length - 1].text.match(/(\d{6})/)![1];
  return { ...result, code };
}

describe('auth 写操作审计', () => {
  it('auth.register：成功注册记录 actorId=userId', async () => {
    const { deps, db, events } = setup();
    seedInvitation(db);
    const r = await register(
      deps,
      { invitationCode: 'TESTCODE1234567890AB', email: 'a@x.com', password: 'pw-123456', displayName: 'A' },
      { requestId: 'req-1' },
    );
    expect(events[0]).toMatchObject({
      actorId: r.userId,
      action: 'auth.register',
      targetType: 'user',
      targetId: r.userId,
      requestId: 'req-1',
    });
  });

  it('auth.login 失败（密码错误）：actorId 已知、metadata 只记原因码', async () => {
    const { deps, db, mailer, events } = setup();
    seedInvitation(db);
    const r = await registerUser(deps, mailer);
    await expect(login(deps, { email: 'a@x.com', password: 'wrong-pw' })).rejects.toMatchObject({
      code: 'CREDENTIALS_INVALID',
    });
    const ev = events.find((e) => e.action === 'auth.login');
    expect(ev?.actorId).toBe(r.userId);
    expect(ev?.metadata).toEqual({ reason: 'credentials_invalid' });
    expect(JSON.stringify(ev)).not.toContain('wrong-pw');
  });

  it('auth.login 失败（邮箱不存在）：actorId=null，不含邮箱明文', async () => {
    const { deps, events } = setup();
    await expect(login(deps, { email: 'ghost@x.com', password: 'x' })).rejects.toMatchObject({
      code: 'CREDENTIALS_INVALID',
    });
    const ev = events.find((e) => e.action === 'auth.login');
    expect(ev?.actorId).toBeNull();
    expect(JSON.stringify(ev)).not.toContain('ghost@x.com');
  });

  it('auth.login 失败（账户不可用）：metadata 只记 account_not_active', async () => {
    const { deps, db, mailer, events } = setup();
    seedInvitation(db);
    await registerUser(deps, mailer); // status=invited，未验证
    await expect(login(deps, { email: 'a@x.com', password: 'pw-123456' })).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_ACTIVE',
    });
    const ev = events.find((e) => e.action === 'auth.login');
    expect(ev?.metadata).toEqual({ reason: 'account_not_active' });
    expect(JSON.stringify(ev)).not.toContain('a@x.com');
  });

  it('auth.login 成功 / auth.logout：均留审计行', async () => {
    const { deps, db, mailer, events } = setup();
    seedInvitation(db);
    const r = await registerUser(deps, mailer);
    await verifyEmail(deps, { email: 'a@x.com', code: r.code });
    const session = await login(deps, { email: 'a@x.com', password: 'pw-123456' }, { requestId: 'req-login' });
    await logout(deps, session.sessionToken, { requestId: 'req-logout' });
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(['auth.register', 'auth.verify', 'auth.login', 'auth.logout']);
    const loginEv = events[2];
    expect(loginEv.metadata?.reason).toBeUndefined();
    expect(loginEv).toMatchObject({ actorId: r.userId, targetId: r.userId, requestId: 'req-login' });
    const logoutEv = events[3];
    expect(logoutEv).toMatchObject({
      actorId: r.userId,
      targetType: 'user',
      targetId: r.userId,
      requestId: 'req-logout',
    });
  });

  it('auth.resend：仅实际签发路径记录；静默 return 不记', async () => {
    const { deps, db, mailer, events } = setup();
    seedInvitation(db);
    await registerUser(deps, mailer);
    // 未知邮箱：静默 return，不记
    await resendCode(deps, { email: 'ghost@x.com' });
    // 冷却中：静默 return，不记
    await resendCode(deps, { email: 'a@x.com' });
    expect(events.filter((e) => e.action === 'auth.resend')).toHaveLength(0);
    // 越过冷却窗口后实际签发：记 auth.resend
    deps.now = () => new Date(NOW.getTime() + 61_000);
    await resendCode(deps, { email: 'a@x.com' }, { requestId: 'req-resend' });
    const ev = events.find((e) => e.action === 'auth.resend');
    expect(ev).toMatchObject({ actorId: db.users[0].id, targetType: 'user', targetId: db.users[0].id, requestId: 'req-resend' });
  });

  it('auth.logout：无效 token 幂等成功（不抛错）且不记审计', async () => {
    const { deps, events } = setup();
    await expect(logout(deps, 'nonexistent-token')).resolves.toBeUndefined();
    expect(events.filter((e) => e.action === 'auth.logout')).toHaveLength(0);
  });

  it('audit 缺省：现有行为零影响', async () => {
    const { prisma } = createFakePrisma();
    const deps: AuthDeps = { prisma, redis: createFakeRedis(), mailer: createFakeMailer(), now: () => NOW };
    await expect(login(deps, { email: 'g@x.com', password: 'x' })).rejects.toMatchObject({
      code: 'CREDENTIALS_INVALID',
    });
    await expect(logout(deps, 'nonexistent-token')).resolves.toBeUndefined();
  });
});
