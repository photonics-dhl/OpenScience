import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
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
}

export interface RegisterInput {
  invitationCode: string;
  email: string;
  password: string;
  displayName: string;
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

export async function register(deps: AuthDeps, input: RegisterInput): Promise<AuthResult> {
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

export async function verifyEmail(
  deps: AuthDeps,
  input: { email: string; code: string },
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
    return tx.user.update({ where: { id: user.id }, data: { status: 'email_verified' } });
  });
  const sessionToken = await createSession(deps.redis, { userId: updated.id, status: updated.status });
  return { userId: updated.id, status: updated.status, sessionToken };
}

/** 防枚举：用户不存在、已验证或冷却中均静默成功（与成功响应一致，不发送）。RESEND_COOLDOWN 错误码保留备用。 */
export async function resendCode(deps: AuthDeps, input: { email: string }): Promise<void> {
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
}

// 模块级常量：预计算的 argon2id 哈希（内容任意，仅用于抹平"用户不存在"路径的计时差）
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$oIwSLHTnNJ5fzX0eQexTUw$lVp0KMOgf6m8vqLfZWjaVQxaHa4TYcc6LwsIFGo9Fyg';

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<Required<AuthResult>> {
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  // 防枚举：邮箱不存在与密码错误完全同文案同错误码
  if (!user) {
    await verifyPassword(DUMMY_PASSWORD_HASH, input.password); // 抹平计时侧信道，结果丢弃
    throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  if (user.status === 'invited') throw new AuthError('ACCOUNT_NOT_ACTIVE', '请先完成邮箱验证');
  if (user.status === 'suspended' || user.status === 'deleted') {
    throw new AuthError('ACCOUNT_NOT_ACTIVE', '账户不可用');
  }
  const sessionToken = await createSession(deps.redis, { userId: user.id, status: user.status });
  return { userId: user.id, status: user.status, sessionToken };
}

export async function logout(deps: AuthDeps, sessionToken: string): Promise<void> {
  await destroySession(deps.redis, sessionToken);
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
  return { userId: user.id, email: user.email, displayName: user.displayName, status: user.status };
}
