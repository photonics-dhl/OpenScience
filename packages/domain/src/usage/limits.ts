/** P1A-7 超额判定纯函数（§13.3 配额）。消费点（1B/1D/1E）传入「当前用量 + 生效限额」即可判定。 */

export interface CheckLimitInput {
  used: number;
  /** null = 无限制。 */
  limit: number | null;
}

export interface CheckLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkLimit({ used, limit }: CheckLimitInput): CheckLimitResult {
  if (limit === null) return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  const remaining = limit - used;
  return { allowed: used <= limit, remaining };
}
