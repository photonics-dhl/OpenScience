import { describe, expect, it, vi } from 'vitest';
import { rateLimitHit } from '../src/rate-limit';

/**
 * P1A-8 Task 1：固定窗口限流纯函数 + Redis 原子 INCR/EXPIRE。
 * fake redis 用 multi 链式执行；nowMs 注入测窗口翻转（对齐 session.ts now 注入惯例）。
 */

function fakeRedis() {
  const store = new Map<string, number>();
  const exec = vi.fn();
  const multi = () => {
    const calls: Array<['incr' | 'expire', string, number?]> = [];
    const chain = {
      incr: (key: string) => {
        calls.push(['incr', key]);
        return chain;
      },
      expire: (key: string, secs: number) => {
        calls.push(['expire', key, secs]);
        return chain;
      },
      exec: async (): Promise<Array<[Error | null, unknown]>> => {
        exec();
        const results: Array<[Error | null, unknown]> = [];
        for (const [op, key, secs] of calls) {
          if (op === 'incr') {
            const next = (store.get(key) ?? 0) + 1;
            store.set(key, next);
            results.push([null, next]);
          } else if (op === 'expire') {
            void secs;
            results.push([null, 1]);
          }
        }
        return results;
      },
    };
    return chain;
  };
  return { store, exec, multi };
}

describe('rateLimitHit（固定窗口）', () => {
  it('窗口内递增计数，未超限 allowed:true，remaining 递减', async () => {
    const f = fakeRedis();
    const r1 = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(r1).toMatchObject({ allowed: true, remaining: 4 });
    const r2 = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(r2).toMatchObject({ allowed: true, remaining: 3 });
    expect(r2.resetInSec).toBe(60);
  });

  it('第 limit+1 次超限 allowed:false，remaining 为 0', async () => {
    const f = fakeRedis();
    for (let i = 0; i < 5; i++) await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    const last = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(last.allowed).toBe(false);
    expect(last.remaining).toBe(0);
  });

  it('窗口翻转 → 新 key 重置计数', async () => {
    const f = fakeRedis();
    // 同一 bucket（nowMs=0，windowSec=60）打满
    for (let i = 0; i < 5; i++) await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    const blocked = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(blocked.allowed).toBe(false);
    // 下一窗口（nowMs=60000）→ 新 key，重新放行
    const next = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 60_000);
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(4);
  });

  it('不同 ip 或 route 互不共享桶', async () => {
    const f = fakeRedis();
    for (let i = 0; i < 5; i++) await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    const otherIp = await rateLimitHit(f as never, { ip: '2.2.2.2', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(otherIp.allowed).toBe(true);
    const otherRoute = await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'resend', windowSec: 60, limit: 5 }, 0);
    expect(otherRoute.allowed).toBe(true);
  });

  it('INCR 与 EXPIRE 同 multi 原子，exec 恰一次', async () => {
    const f = fakeRedis();
    await rateLimitHit(f as never, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(f.exec).toHaveBeenCalledTimes(1);
  });

  it('Redis 不可用（exec 抛错）→ fail-open，不 throw', async () => {
    const redis = {
      multi: () => ({
        incr: () => ({ expire: () => ({ exec: vi.fn().mockRejectedValue(new Error('redis down')) }) }),
      }),
    } as never;
    const r = await rateLimitHit(redis, { ip: '1.1.1.1', route: 'login', windowSec: 60, limit: 5 }, 0);
    expect(r.allowed).toBe(true);
  });
});
