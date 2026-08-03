import type { Redis } from 'ioredis';

export interface RateLimitOptions {
  ip: string;
  route: string;
  windowSec: number;
  limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSec: number;
}

/**
 * Redis 固定窗口限流（P1A-8 Task 1）。
 * key = `rl:{ip}:{route}:{windowBucket}`，INCR + EXPIRE 同 multi 原子执行；
 * 窗口翻转自动换 key，旧 key 靠 EXPIRE 回收，无后台清理。
 * Redis 不可用 → fail-open（放行），避免限流依赖把服务整体打挂。
 */
export async function rateLimitHit(
  redis: Redis,
  opts: RateLimitOptions,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const bucket = Math.floor(nowMs / 1000 / opts.windowSec);
  const key = `rl:${opts.ip}:${opts.route}:${bucket}`;
  try {
    const multi = redis.multi().incr(key).expire(key, opts.windowSec);
    const results = await multi.exec();
    const count = results?.[0]?.[1] as number | undefined;
    const hit = count ?? 0;
    const remaining = Math.max(0, opts.limit - hit);
    return {
      allowed: hit <= opts.limit,
      remaining,
      resetInSec: opts.windowSec - (Math.floor(nowMs / 1000) % opts.windowSec),
    };
  } catch {
    return { allowed: true, remaining: opts.limit, resetInSec: opts.windowSec };
  }
}
