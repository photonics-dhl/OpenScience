import { describe, expect, it } from 'vitest';
import { checkLimit } from '../src/usage/limits';

describe('checkLimit 超额判定', () => {
  it('恰好 = limit → allowed, remaining 0', () => {
    expect(checkLimit({ used: 100, limit: 100 })).toEqual({ allowed: true, remaining: 0 });
  });

  it('超 1 → not allowed, remaining 负', () => {
    expect(checkLimit({ used: 101, limit: 100 })).toEqual({ allowed: false, remaining: -1 });
  });

  it('低于 limit → allowed, remaining 正', () => {
    expect(checkLimit({ used: 40, limit: 100 })).toEqual({ allowed: true, remaining: 60 });
  });

  it('负 used（如删除后）→ allowed', () => {
    expect(checkLimit({ used: -5, limit: 100 })).toEqual({ allowed: true, remaining: 105 });
  });

  it('limit 0 且 used 0 → allowed', () => {
    expect(checkLimit({ used: 0, limit: 0 })).toEqual({ allowed: true, remaining: 0 });
  });

  it('limit 0 且 used 1 → not allowed', () => {
    expect(checkLimit({ used: 1, limit: 0 })).toEqual({ allowed: false, remaining: -1 });
  });

  it('null limit → 无限制', () => {
    const r = checkLimit({ used: 999999, limit: null });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY);
  });
});
