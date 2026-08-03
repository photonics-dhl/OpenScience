import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { getBalance, topupCredit } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requirePlatformAdmin } from './admin';

/** P1A-6：请求级审计上下文（requestId/ip）。 */
function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const resourceParam = z.object({ resource: z.string().min(1).max(64) });
const policyBody = z.object({
  scope: z.enum(['global', 'user_level', 'workspace']),
  scopeKey: z.string().min(1).max(64).nullable().optional(),
  limit: z.coerce.number().int().min(0),
});
const creditBody = z.object({
  userId: z.string().uuid(),
  amount: z.coerce.number().int().positive(),
  reason: z.string().max(200).optional(),
});
const usageQuery = z.object({
  userId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  resource: z.string().max(64).optional(),
});

/** P1A-7 admin 配额/账务端点：policy 读写 + credit 追加 + usage 查询（均 platform_admin）。 */
export function registerAdminUsageRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/quota-policies', async (req, reply) => {
    const admin = await requirePlatformAdmin(deps, req, reply);
    if (!admin) return;
    const rows = await deps.prisma.quotaPolicy.findMany({ orderBy: [{ scope: 'asc' }, { resource: 'asc' }] });
    return reply.send({
      policies: rows.map((r) => ({ id: r.id, scope: r.scope, scopeKey: r.scopeKey, resource: r.resource, limit: Number(r.limitValue) })),
    });
  });

  app.put('/quota-policies/:resource', async (req, reply) => {
    const admin = await requirePlatformAdmin(deps, req, reply);
    if (!admin) return;
    const { resource } = resourceParam.parse(req.params);
    const body = policyBody.parse(req.body);
    const row = await deps.prisma.$transaction(async (tx) => {
      // Prisma upsert 复合唯一键不接受 nullable scope_key，改 findFirst + create/update（保留 null 语义）
      const existing = await tx.quotaPolicy.findFirst({
        where: { scope: body.scope, scopeKey: body.scopeKey ?? null, resource },
      });
      const r = existing
        ? await tx.quotaPolicy.update({
            where: { id: existing.id },
            data: { limitValue: BigInt(body.limit), updatedBy: admin.userId },
          })
        : await tx.quotaPolicy.create({
            data: { scope: body.scope, scopeKey: body.scopeKey ?? null, resource, limitValue: BigInt(body.limit), updatedBy: admin.userId },
          });
      await deps.audit?.record(
        {
          actorId: admin.userId,
          action: 'quota.policy.upsert',
          targetType: 'quota_policy',
          targetId: r.id,
          metadata: { scope: body.scope, resource, limit: body.limit },
        },
        tx,
      );
      return r;
    });
    return reply.send({ id: row.id, scope: row.scope, scopeKey: row.scopeKey, resource: row.resource, limit: Number(row.limitValue) });
  });

  app.post('/credits', async (req, reply) => {
    const admin = await requirePlatformAdmin(deps, req, reply);
    if (!admin) return;
    const body = creditBody.parse(req.body);
    const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
    await topupCredit(deps, { userId: body.userId, amount: body.amount, reason: body.reason, idempotencyKey }, admin.userId, auditCtx(req));
    const balance = await getBalance(deps, { userId: body.userId, resource: 'ai_credit' });
    return reply.status(201).send({ userId: body.userId, resource: 'ai_credit', balance });
  });

  app.get('/usage', async (req, reply) => {
    const admin = await requirePlatformAdmin(deps, req, reply);
    if (!admin) return;
    const q = usageQuery.parse(req.query);
    const rows = await deps.prisma.usageLedger.findMany({
      where: { userId: q.userId, workspaceId: q.workspaceId, resource: q.resource },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reply.send({
      entries: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        workspaceId: r.workspaceId,
        resource: r.resource,
        delta: Number(r.delta),
        kind: r.kind,
        period: r.period,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    });
  });
}
