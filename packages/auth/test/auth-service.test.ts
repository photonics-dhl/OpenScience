import { describe, expect, it } from 'vitest';
import { AuthError } from '../src/errors';
import { confirmSignup, getCurrentUser, login, register, requestSignupCode, resendCode, verifyEmail, type AuthDeps } from '../src/auth-service';
import { hashPassword } from '../src/password';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

const NOW = new Date('2026-07-28T12:00:00Z');

function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const deps: AuthDeps = { prisma, redis, mailer, now: () => NOW };
  return { deps, db, redis, mailer };
}

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

async function seedVerifiedUser(deps: AuthDeps, db: ReturnType<typeof createFakePrisma>['db'], email = 'user@example.com') {
  db.users.push({
    id: 'user-1',
    email,
    passwordHash: await hashPassword('passw0rd-x'),
    displayName: 'User',
    status: 'email_verified',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('register', () => {
  it('redeems a valid invitation and sends a verification code', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const result = await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email: 'new@example.com',
      password: 'passw0rd-x',
      displayName: 'New',
    });
    expect(result.status).toBe('invited');
    expect(db.invitations[0].usedBy).toBe(result.userId);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].text).toMatch(/\d{6}/);
    // 验证码不明文落库
    const code = mailer.sent[0].text.match(/(\d{6})/)![1];
    expect(db.emailVerifications[0].codeHash).not.toBe(code);
  });

  it('rejects unknown invitation codes', async () => {
    const { deps } = makeDeps();
    await expect(
      register(deps, { invitationCode: 'NOPE', email: 'a@b.c', password: 'passw0rd-x', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('rejects already-used invitations', async () => {
    const { deps, db } = makeDeps();
    seedInvitation(db, { usedBy: 'someone', usedAt: NOW });
    await expect(
      register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'a@b.c', password: 'passw0rd-x', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('maps duplicate email to EMAIL_ALREADY_REGISTERED', async () => {
    const { deps, db } = makeDeps();
    seedInvitation(db);
    await seedVerifiedUser(deps, db, 'dup@example.com');
    await expect(
      register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'dup@example.com', password: 'passw0rd-x', displayName: 'D' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('rejects a second registration with the same invitation code (guarded redemption)', async () => {
    const { deps, db } = makeDeps();
    seedInvitation(db);
    await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email: 'first@example.com',
      password: 'passw0rd-x',
      displayName: 'First',
    });
    await expect(
      register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'second@example.com', password: 'passw0rd-x', displayName: 'S' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    // 串行场景：usedBy 已写入，assertInvitationRedeemable 在 user.create 之前拒绝，故第二个用户未创建；
    // 并发竞态（两个事务都通过 assert 后才写 usedBy）由 guarded updateMany 的 count=0 兜底并回滚。
    expect(db.users.filter((u) => u.email === 'second@example.com')).toHaveLength(0);
  });
});

describe('email-code signup', () => {
  it('requests a code without creating a user, then confirms into a verified user', async () => {
    const { deps, db, mailer } = makeDeps();
    await requestSignupCode(deps, { email: 'apply@example.com', displayName: 'Applicant' });
    expect(db.users).toHaveLength(0);
    expect(mailer.sent[0].text).toMatch(/\d{6}/);
    const code = mailer.sent[0].text.match(/(\d{6})/)![1];
    const result = await confirmSignup(deps, { email: 'apply@example.com', displayName: 'Applicant', password: 'passw0rd-x', code });
    expect(result.status).toBe('email_verified');
    expect(db.users[0].status).toBe('email_verified');
    expect(db.signupChallenges[0].consumedAt).not.toBeNull();
  });

  it('rejects an invalid signup code without creating a user', async () => {
    const { deps, db } = makeDeps();
    await requestSignupCode(deps, { email: 'invalid-code@example.com', displayName: 'Applicant' });
    await expect(confirmSignup(deps, { email: 'invalid-code@example.com', displayName: 'Applicant', password: 'passw0rd-x', code: '000000' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
    expect(db.users).toHaveLength(0);
  });
});

describe('verifyEmail', () => {
  async function registerUser(deps: AuthDeps, mailer: { sent: Array<{ text: string }> }) {
    const result = await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email: 'v@example.com',
      password: 'passw0rd-x',
      displayName: 'V',
    });
    const code = mailer.sent[mailer.sent.length - 1].text.match(/(\d{6})/)![1];
    return { ...result, code };
  }

  it('verifies the correct code and issues a session', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const { code } = await registerUser(deps, mailer);
    const result = await verifyEmail(deps, { email: 'v@example.com', code });
    expect(result.status).toBe('email_verified');
    expect(result.sessionToken).toBeTruthy();
    expect(db.users[0].status).toBe('email_verified');
  });

  it('wrong code increments attempts; fifth failure locks', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    await registerUser(deps, mailer);
    for (let i = 0; i < 4; i++) {
      await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
        code: 'CODE_INVALID',
      });
    }
    await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
    expect(db.emailVerifications[0].lockedUntil).not.toBeNull();
    await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
      code: 'CODE_LOCKED',
    });
  });

  it('expired code is rejected with CODE_EXPIRED', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const { code } = await registerUser(deps, mailer);
    db.emailVerifications[0].expiresAt = new Date(NOW.getTime() - 1);
    await expect(verifyEmail(deps, { email: 'v@example.com', code })).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });

  it('unknown email gets the same CODE_INVALID (anti-enumeration)', async () => {
    const { deps } = makeDeps();
    await expect(verifyEmail(deps, { email: 'ghost@example.com', code: '123456' })).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
  });
});

describe('resendCode', () => {
  it('is silent for unknown emails (anti-enumeration)', async () => {
    const { deps, mailer } = makeDeps();
    await resendCode(deps, { email: 'ghost@example.com' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('cooldown is silent (no throw, no send); resend after window invalidates the old code', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    await register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'r@example.com', password: 'passw0rd-x', displayName: 'R' });
    expect(mailer.sent).toHaveLength(1);
    // 冷却中：静默成功、不发送，外部行为与未知邮箱一致（防枚举）
    await resendCode(deps, { email: 'r@example.com' });
    expect(mailer.sent).toHaveLength(1);
    // 越过冷却窗口后可重发，且旧码失效
    const later = new Date(NOW.getTime() + 61_000);
    deps.now = () => later;
    const firstCodeHash = db.emailVerifications[0].codeHash;
    await resendCode(deps, { email: 'r@example.com' });
    expect(mailer.sent).toHaveLength(2);
    expect(db.emailVerifications[0].expiresAt.getTime()).toBeLessThanOrEqual(later.getTime());
    const latest = db.emailVerifications[db.emailVerifications.length - 1];
    expect(latest.codeHash).not.toBe(firstCodeHash);
  });
});

describe('login', () => {
  it('unknown email and wrong password produce identical errors', async () => {
    const { deps, db } = makeDeps();
    await seedVerifiedUser(deps, db);
    const unknown = await login(deps, { email: 'ghost@example.com', password: 'passw0rd-x' }).catch((e: AuthError) => e);
    const wrongPw = await login(deps, { email: 'user@example.com', password: 'wr0ngpass' }).catch((e: AuthError) => e);
    expect(unknown.code).toBe('CREDENTIALS_INVALID');
    expect(wrongPw.code).toBe('CREDENTIALS_INVALID');
    expect(unknown.message).toBe(wrongPw.message);
  });

  it('invited users cannot log in before verifying', async () => {
    const { deps, db } = makeDeps();
    db.users.push({
      id: 'u2', email: 'i@example.com', passwordHash: await hashPassword('passw0rd-x'),
      displayName: 'I', status: 'invited', createdAt: NOW, updatedAt: NOW,
    });
    await expect(login(deps, { email: 'i@example.com', password: 'passw0rd-x' })).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });

  it('verified user logs in and gets a working session', async () => {
    const { deps, db } = makeDeps();
    await seedVerifiedUser(deps, db);
    const result = await login(deps, { email: 'user@example.com', password: 'passw0rd-x' });
    expect(result.sessionToken).toBeTruthy();
    const me = await getCurrentUser(deps, result.sessionToken);
    expect(me.email).toBe('user@example.com');
  });
});

describe('getCurrentUser', () => {
  it('rejects suspended users immediately and destroys the session', async () => {
    const { deps, db, redis } = makeDeps();
    await seedVerifiedUser(deps, db);
    const { sessionToken } = await login(deps, { email: 'user@example.com', password: 'passw0rd-x' });
    db.users[0].status = 'suspended';
    await expect(getCurrentUser(deps, sessionToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    expect(redis.store.size).toBe(0);
  });
});

describe('verifyEmail onEmailVerified 回调（P1A-4）', () => {
  // 与既有 verifyEmail 用例相同的 seed 方式：seedInvitation + register + 从 mailer 取明文验证码
  async function seedVerifiedFlowUser(
    deps: AuthDeps,
    db: ReturnType<typeof createFakePrisma>['db'],
    mailer: { sent: Array<{ text: string }> },
    email: string,
  ) {
    seedInvitation(db);
    await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email,
      password: 'passw0rd-x',
      displayName: 'CB',
    });
    const plainCode = mailer.sent[mailer.sent.length - 1].text.match(/(\d{6})/)![1];
    return { plainCode };
  }

  it('验证通过时在同事务内调用回调（tx + 用户信息）', async () => {
    const { deps, db, mailer } = makeDeps();
    const calls: Array<{ tx: unknown; user: { id: string; email: string; displayName: string } }> = [];
    deps.onEmailVerified = async (tx, user) => {
      calls.push({ tx, user });
    };
    const { plainCode } = await seedVerifiedFlowUser(deps, db, mailer, 'cb@example.com');
    await verifyEmail(deps, { email: 'cb@example.com', code: plainCode });
    expect(calls).toHaveLength(1);
    expect(calls[0].user).toMatchObject({ email: 'cb@example.com' });
    expect(calls[0].tx).toBe(deps.prisma); // fake $transaction 的 tx 即 prisma 自身
  });

  it('回调抛错时 verifyEmail 整体失败（真实 PG 由事务回滚，云上集成测试覆盖）', async () => {
    const { deps, db, mailer } = makeDeps();
    deps.onEmailVerified = async () => {
      throw new Error('boom');
    };
    const { plainCode } = await seedVerifiedFlowUser(deps, db, mailer, 'cb2@example.com');
    await expect(verifyEmail(deps, { email: 'cb2@example.com', code: plainCode })).rejects.toThrow('boom');
  });
});
