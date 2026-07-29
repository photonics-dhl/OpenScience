import type { Redis } from 'ioredis';
import { AuthError } from './errors';
import { generateSessionToken } from './tokens';

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface SessionData {
  userId: string;
  status: string;
  createdAt: string;
}

function sessionKey(token: string): string {
  return `sess:${token}`;
}

export async function createSession(
  redis: Redis,
  data: Omit<SessionData, 'createdAt'>,
  now: Date = new Date(),
): Promise<string> {
  const token = generateSessionToken();
  const payload: SessionData = { ...data, createdAt: now.toISOString() };
  await redis.set(sessionKey(token), JSON.stringify(payload), 'EX', SESSION_TTL_SECONDS);
  return token;
}

/** 校验并滑动续期；不存在/过期抛 AuthError('SESSION_INVALID')。 */
export async function resolveSession(redis: Redis, token: string): Promise<SessionData> {
  const raw = await redis.get(sessionKey(token));
  if (!raw) throw new AuthError('SESSION_INVALID', '会话不存在或已过期');
  await redis.expire(sessionKey(token), SESSION_TTL_SECONDS);
  return JSON.parse(raw) as SessionData;
}

export async function destroySession(redis: Redis, token: string): Promise<void> {
  await redis.del(sessionKey(token));
}
