export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function isCodeExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function inCooldown(lastSentAt: Date, now: Date): boolean {
  return now.getTime() - lastSentAt.getTime() < RESEND_COOLDOWN_MS;
}

/** 记录一次失败尝试；达到 MAX_ATTEMPTS 时返回锁定截止时间。 */
export function registerFailedAttempt(
  currentAttempts: number,
  now: Date,
): { attempts: number; lockedUntil: Date | null } {
  const attempts = currentAttempts + 1;
  return attempts >= MAX_ATTEMPTS
    ? { attempts, lockedUntil: new Date(now.getTime() + LOCK_MS) }
    : { attempts, lockedUntil: null };
}
