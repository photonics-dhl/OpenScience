import type { Prisma, PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { AuditContext, AuditEvent, AuditSink } from '@openscience/observability';
import { AuthError } from './errors';
import { assertInvitationRedeemable } from './invitations';
import type { Mailer } from './mailer';
import { hashPassword, verifyPassword } from './password';
import { createSession, destroySession, resolveSession } from './session';
import { generateVerificationCode, hashVerificationCode } from './tokens';
import { CODE_TTL_MS, inCooldown, isCodeExpired, isLocked, registerFailedAttempt } from './verification';

export interface AuthDeps {
  prisma: PrismaClient;
  redis: Redis;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
  /** 邮箱验证通过回调（同事务执行）：P1A-4 挂 Personal Workspace 创建；失败整体回滚。 */
  onEmailVerified?: (
    tx: Prisma.TransactionClient,
    user: { id: string; email: string; displayName: string },
  ) => Promise<void>;
  /** 审计 sink；缺省为 no-op（P1A-6）。 */
  audit?: AuditSink;
}

/** 写 auth 审计行；有 tx 时与业务行同事务。audit 缺省为 no-op。 */
async function recordAuth(
  deps: AuthDeps,
  event: Omit<AuditEvent, 'requestId' | 'ip'>,
  ctx: AuditContext,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip }, tx);
}

export interface AuthResult {
  userId: string;
  status: string;
  sessionToken?: string;
}

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  /** 配额 user_level 档位（users.level，free/pro/team；迁移 21 起入库，默认 free）。 */
  level: string;
}

export interface RegisterInput {
  invitationCode: string;
  email: string;
  password: string;
  displayName: string;
}

export interface SignupCodeRequest {
  email: string;
  displayName: string;
}

export interface SignupConfirmation {
  email: string;
  displayName: string;
  password: string;
  code: string;
}

function now(deps: AuthDeps): Date {
  return deps.now ? deps.now() : new Date();
}

/** 签发新验证码并使该用户所有未验证旧码立即失效，然后投递。 */
async function issueVerificationCode(deps: AuthDeps, userId: string, email: string): Promise<void> {
  const at = now(deps);
  const code = generateVerificationCode();
  await deps.prisma.emailVerification.updateMany({
    where: { userId, verifiedAt: null },
    data: { expiresAt: at },
  });
  await deps.prisma.emailVerification.create({
    data: {
      userId,
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(at.getTime() + CODE_TTL_MS),
      lastSentAt: at,
    },
  });
  await deps.mailer.send({
    to: email,
    subject: 'OpenScience 邮箱验证码',
    text: `你的验证码是 ${code}，10 分钟内有效。`,
  });
}

export async function register(deps: AuthDeps, input: RegisterInput, ctx: AuditContext = {}): Promise<AuthResult> {
  const at = now(deps);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await deps.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { code: input.invitationCode } });
      if (!invitation) throw new AuthError('INVITATION_INVALID', '邀请码无效');
      assertInvitationRedeemable(invitation, input.email, at);
      const created = await tx.user.create({
        data: { email: input.email, passwordHash, displayName: input.displayName, status: 'invited' },
      });
      const redeemed = await tx.invitation.updateMany({
        where: { id: invitation.id, usedBy: null, revokedAt: null },
        data: { usedBy: created.id, usedAt: at },
      });
      if (redeemed.count !== 1) {
        throw new AuthError('INVITATION_INVALID', '邀请码已被使用');
      }
      await recordAuth(deps, { actorId: created.id, action: 'auth.register', targetType: 'user', targetId: created.id }, ctx, tx);
      return created;
    });
    await issueVerificationCode(deps, user.id, input.email);
    return { userId: user.id, status: user.status };
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AuthError('EMAIL_ALREADY_REGISTERED', '该邮箱已注册');
    }
    throw err;
  }
}

/** Request-only signup challenge: no User row is created until the code is confirmed. */
export async function requestSignupCode(deps: AuthDeps, input: SignupCodeRequest, ctx: AuditContext = {}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const at = now(deps);
  const existingUser = await deps.prisma.user.findUnique({ where: { email } });
  if (existingUser && existingUser.status !== 'invited') return;
  const previous = await deps.prisma.signupChallenge.findFirst({ where: { email, consumedAt: null }, orderBy: { createdAt: 'desc' } });
  if (previous && inCooldown(previous.lastSentAt, at)) return;
  const code = generateVerificationCode();
  if (previous) await deps.prisma.signupChallenge.updateMany({ where: { id: previous.id, consumedAt: null }, data: { expiresAt: at } });
  await deps.prisma.signupChallenge.create({
    data: { email, codeHash: hashVerificationCode(code), expiresAt: new Date(at.getTime() + CODE_TTL_MS), lastSentAt: at },
  });
  try {
    await deps.mailer.send({ to: email, subject: 'OpenScience 注册验证码', text: `你的 OpenScience 注册验证码是 ${code}，10 分钟内有效。` });
  } catch (error) {
    throw new AuthError('VERIFICATION_DELIVERY_FAILED', '验证码发送失败，请稍后重试', error);
  }
  await recordAuth(deps, { actorId: null, action: 'auth.signup_code.request', metadata: { channel: 'email' } }, ctx);
}

/** Confirm a signup challenge and atomically create the verified user + personal workspace. */
export async function confirmSignup(deps: AuthDeps, input: SignupConfirmation, ctx: AuditContext = {}): Promise<Required<AuthResult>> {
  const email = input.email.trim().toLowerCase();
  const at = now(deps);
  const existingUser = await deps.prisma.user.findUnique({ where: { email } });
  if (existingUser && existingUser.status !== 'invited') throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  const challenge = await deps.prisma.signupChallenge.findFirst({ where: { email, consumedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!challenge) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  if (isLocked(challenge.lockedUntil, at)) throw new AuthError('CODE_LOCKED', '尝试次数过多，请稍后再试');
  if (isCodeExpired(challenge.expiresAt, at)) throw new AuthError('CODE_EXPIRED', '验证码已过期，请重新获取');
  if (challenge.codeHash !== hashVerificationCode(input.code)) {
    await deps.prisma.signupChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: registerFailedAttempt(challenge.attempts, at) });
    throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  }
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await deps.prisma.$transaction(async (tx) => {
      const redeemed = await tx.signupChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: at } });
      if (redeemed.count !== 1) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
      const created = existingUser
        ? await tx.user.update({ where: { id: existingUser.id }, data: { passwordHash, displayName: input.displayName.trim(), status: 'email_verified' } })
        : await tx.user.create({ data: { email, passwordHash, displayName: input.displayName.trim(), status: 'email_verified' } });
      await deps.onEmailVerified?.(tx, { id: created.id, email: created.email, displayName: created.displayName });
      await recordAuth(deps, { actorId: created.id, action: 'auth.signup_code.confirm', targetType: 'user', targetId: created.id }, ctx, tx);
      return created;
    });
    const sessionToken = await createSession(deps.redis, { userId: user.id, status: user.status });
    return { userId: user.id, status: user.status, sessionToken };
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new AuthError('EMAIL_ALREADY_REGISTERED', '该邮箱已注册');
    throw error;
  }
}

export async function verifyEmail(
  deps: AuthDeps,
  input: { email: string; code: string },
  ctx: AuditContext = {},
): Promise<Required<AuthResult>> {
  const at = now(deps);
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  const record = await deps.prisma.emailVerification.findFirst({
    where: { userId: user.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  if (isLocked(record.lockedUntil, at)) throw new AuthError('CODE_LOCKED', '尝试次数过多，请稍后再试');
  if (isCodeExpired(record.expiresAt, at)) throw new AuthError('CODE_EXPIRED', '验证码已过期，请重新获取');
  if (record.codeHash !== hashVerificationCode(input.code)) {
    const failure = registerFailedAttempt(record.attempts, at);
    await deps.prisma.emailVerification.update({ where: { id: record.id }, data: failure });
    throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  }
  const updated = await deps.prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({ where: { id: record.id }, data: { verifiedAt: at } });
    const u = await tx.user.update({ where: { id: user.id }, data: { status: 'email_verified' } });
    if (deps.onEmailVerified) {
      await deps.onEmailVerified(tx, { id: u.id, email: u.email, displayName: u.displayName });
    }
    await recordAuth(deps, { actorId: u.id, action: 'auth.verify', targetType: 'user', targetId: u.id }, ctx, tx);
    return u;
  });
  const sessionToken = await createSession(deps.redis, { userId: updated.id, status: updated.status });
  return { userId: updated.id, status: updated.status, sessionToken };
}

/** 防枚举：用户不存在、已验证或冷却中均静默成功（与成功响应一致，不发送）。RESEND_COOLDOWN 错误码保留备用。 */
export async function resendCode(deps: AuthDeps, input: { email: string }, ctx: AuditContext = {}): Promise<void> {
  const at = now(deps);
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.status !== 'invited') return;
  const record = await deps.prisma.emailVerification.findFirst({
    where: { userId: user.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (record && inCooldown(record.lastSentAt, at)) {
    // 防枚举：冷却中也静默成功但不发送，外部行为与未知邮箱一致
    return;
  }
  await issueVerificationCode(deps, user.id, input.email);
  await recordAuth(deps, { actorId: user.id, action: 'auth.resend', targetType: 'user', targetId: user.id }, ctx);
}

// 模块级常量：预计算的 argon2id 哈希（内容任意，仅用于抹平"用户不存在"路径的计时差）
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$oIwSLHTnNJ5fzX0eQexTUw$lVp0KMOgf6m8vqLfZWjaVQxaHa4TYcc6LwsIFGo9Fyg';

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
  ctx: AuditContext = {},
): Promise<Required<AuthResult>> {
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  // 防枚举：邮箱不存在与密码错误完全同文案同错误码
  if (!user) {
    await verifyPassword(DUMMY_PASSWORD_HASH, input.password); // 抹平计时侧信道，结果丢弃
    // 审计不记邮箱明文（防枚举信息泄露），actorId=null
    await recordAuth(deps, { actorId: null, action: 'auth.login', metadata: { reason: 'credentials_invalid' } }, ctx);
    throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    await recordAuth(
      deps,
      { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, metadata: { reason: 'credentials_invalid' } },
      ctx,
    );
    throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  }
  if (user.status === 'invited') {
    await recordAuth(
      deps,
      { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, metadata: { reason: 'account_not_active' } },
      ctx,
    );
    throw new AuthError('ACCOUNT_NOT_ACTIVE', '请先完成邮箱验证');
  }
  if (user.status === 'suspended' || user.status === 'deleted') {
    await recordAuth(
      deps,
      { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, metadata: { reason: 'account_not_active' } },
      ctx,
    );
    throw new AuthError('ACCOUNT_NOT_ACTIVE', '账户不可用');
  }
  const sessionToken = await createSession(deps.redis, { userId: user.id, status: user.status });
  await recordAuth(deps, { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id }, ctx);
  return { userId: user.id, status: user.status, sessionToken };
}

export async function logout(deps: AuthDeps, sessionToken: string, ctx: AuditContext = {}): Promise<void> {
  // 幂等登出：无效/过期 token 不抛错（保持既有 API 契约：logout 永远成功并清 cookie），
  // best-effort 销毁后直接返回——无效会话无可记之事，不记审计
  let session;
  try {
    session = await resolveSession(deps.redis, sessionToken);
  } catch {
    await destroySession(deps.redis, sessionToken);
    return;
  }
  await destroySession(deps.redis, sessionToken);
  await recordAuth(deps, { actorId: session.userId, action: 'auth.logout', targetType: 'user', targetId: session.userId }, ctx);
}

/** 会话校验 + 实时用户状态（suspended/deleted 即时拒并销毁会话）。2.5 RBAC 复用此入口。 */
export async function getCurrentUser(deps: AuthDeps, sessionToken: string): Promise<CurrentUser> {
  const session = await resolveSession(deps.redis, sessionToken);
  const user = await deps.prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === 'suspended' || user.status === 'deleted') {
    await destroySession(deps.redis, sessionToken);
    throw new AuthError('SESSION_INVALID', '会话已失效');
  }
  if (user.status === 'invited') throw new AuthError('ACCOUNT_NOT_ACTIVE', '请先完成邮箱验证');
  return { userId: user.id, email: user.email, displayName: user.displayName, status: user.status, level: user.level };
}
