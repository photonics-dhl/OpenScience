import type { FastifyInstance } from 'fastify';
import type { Redis } from '@openscience/database';
import { rateLimitHit } from '@openscience/database';
import type { AuditSink } from '@openscience/observability';
import { buildErrorBody } from '@openscience/observability';

export interface RouteRule {
  limit: number;
  windowSec: number;
}

/**
 * 限流路由 → 档位声明表（P1A-8 挂接点）。
 * 后续 Phase（1B 发布/上传、1D 搜索、1E 沙箱、AI 调用）接入限流时**只加表行 + 依赖档位**，
 * 中间件零改动。key = 完整路径（含 prefix）。
 */
export const RATE_LIMIT_ROUTES: Record<string, RouteRule> = {
  '/auth/login': { limit: 5, windowSec: 60 },
  '/auth/request-signup-code': { limit: 3, windowSec: 300 },
  '/auth/confirm-signup': { limit: 10, windowSec: 300 },
  '/auth/register': { limit: 5, windowSec: 600 },
  '/auth/resend-code': { limit: 3, windowSec: 300 },
  '/auth/verify-email': { limit: 10, windowSec: 300 },
  // P1C-3：协作写入限流（§17 + task 4.3 要求；key=完整路径）
  '/research-objects/:id/issues': { limit: 20, windowSec: 60 },
  '/research-objects/:id/issues/:issueId/comments': { limit: 30, windowSec: 60 },
  // P1C-6：PR 创建限流（§17）
  '/research-objects/:id/pull-requests': { limit: 20, windowSec: 60 },
  // P1D-9：公开只读防爬（匿名高频抓取保护；宽松档位，SSR/索引流量勿误伤）
  '/research/:publicId': { limit: 60, windowSec: 60 },
  '/research/:publicId/v/:versionNo': { limit: 120, windowSec: 60 },
  // P1E-5：沙箱作业创建限流（§21.2-17）
  '/sandbox-jobs': { limit: 10, windowSec: 60 },
  // Hermes/AI task submission: authenticated and credit-gated, but still bound burst traffic.
  '/agent/tasks': { limit: 20, windowSec: 60 },
  '/agent/tasks/:id/retry': { limit: 10, windowSec: 60 },
  // Unified browser entry point for literature retrieval (provider selection is server-owned).
  '/literature/acquisitions': { limit: 10, windowSec: 60 },
  // Research ingestion: authenticated but memory/storage/AI intensive.
  '/research-objects/:id/ingest': { limit: 5, windowSec: 60 },
  '/ingestion/:taskId/retry': { limit: 10, windowSec: 60 },
  '/temporary-documents/:id/download-link': { limit: 10, windowSec: 60 },
  '/temporary-documents/:id/download/:accessId': { limit: 20, windowSec: 60 },
};

export interface RegisterRateLimitOptions {
  redis: Redis;
  audit?: AuditSink;
  enabled: boolean;
  /** env 覆盖 login 档位（生产可调）。 */
  loginLimit?: number;
  loginWindowSec?: number;
}

/** 注册限流 preHandler：命中声明表路由先过 Redis 固定窗口；超限 429 + Retry-After + 审计。 */
export function registerRateLimit(app: FastifyInstance, opts: RegisterRateLimitOptions): void {
  if (!opts.enabled) return;
  const rules: Record<string, RouteRule> = {
    ...RATE_LIMIT_ROUTES,
    '/auth/login': {
      limit: opts.loginLimit ?? RATE_LIMIT_ROUTES['/auth/login'].limit,
      windowSec: opts.loginWindowSec ?? RATE_LIMIT_ROUTES['/auth/login'].windowSec,
    },
  };

  // 键支持 `:param` 段（如 /research-objects/:id/issues）→ 转正则（P1C-3 路径参数路由限流）
  const compiled = Object.entries(rules).map(([path, rule]) => ({
    path,
    rule,
    regex: new RegExp('^' + path.replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$'),
  }));

  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0];
    const matched = compiled.find(({ regex }) => regex.test(path));
    const rule = matched?.rule;
    if (!rule) return;
    const r = await rateLimitHit(opts.redis, { ip: req.ip, route: matched.path, windowSec: rule.windowSec, limit: rule.limit });
    if (!r.allowed) {
      await opts.audit?.record({
        actorId: null,
        action: 'security.rate.limited',
        metadata: { route: path, limit: rule.limit, windowSec: rule.windowSec },
        requestId: String(req.id),
        ip: req.ip,
      });
      void reply
        .header('retry-after', String(r.resetInSec))
        .status(429)
        .send(buildErrorBody('RATE_LIMITED', '请求过于频繁，请稍后重试', String(req.id)));
      return reply;
    }
  });
}
