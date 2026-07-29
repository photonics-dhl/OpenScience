import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 6 位数字邮箱验证码（允许前导零）。 */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 验证码只存 sha256，不明文落库（security-review：日志/库泄漏不直接泄露验证码）。 */
export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** 32 字节随机会话 token，base64url 编码。 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 20 位邀请码，字母表去除易混淆字符（0/O、1/I/L）。 */
export function generateInvitationCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
