import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import { getEffectiveLicenses, setLicenses, setVersionLicenses, LICENSE_CATALOG } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** licenses 路由依赖：AuthDeps（仅 prisma）。 */
export type LicenseRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const roVersionParams = z.object({ id: z.string().uuid(), versionId: z.string().uuid() });
const licensesBody = z.object({
  text: z.string().min(1).max(64),
  code: z.string().min(1).max(64),
  data: z.string().min(1).max(64),
});

/** 可选会话：读走 canAccessRo（public 匿名可读，§4.2）。 */
async function optionalUser(deps: AuthDeps, req: FastifyRequest): Promise<{ userId: string } | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  try {
    const user = await getCurrentUser(deps, token);
    return user ? { userId: user.userId } : null;
  } catch {
    return null;
  }
}

/**
 * P1C-4：/licenses 三类许可 API（§6.3 + §2.2 决策 6 + §5.3 manifest.licenses + §6.3 已公开不可变）。
 * GET /research-objects/:id/licenses              有效许可（版本级优先回退 RO 级）
 * PUT /research-objects/:id/licenses              RO 级全量 upsert
 * GET /research-objects/:id/licenses/:versionId   某版本有效许可
 * PUT /research-objects/:id/licenses/:versionId   版本级（已公开拒绝，§6.3）
 */
export function registerLicenseRoutes(app: FastifyInstance, deps: LicenseRouteDeps): void {
  // 目录（§6.3 标准标识 + 名称；完整法律文案 §24 待确认，不在此写死）
  app.get('/licenses/catalog', async () => ({ catalog: LICENSE_CATALOG }));

  app.get('/research-objects/:id/licenses', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ licenses: await getEffectiveLicenses(deps, { researchObjectId: id, userId: user?.userId }) });
  });

  app.put('/research-objects/:id/licenses', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = licensesBody.parse(req.body);
    const rows = await setLicenses(deps, { researchObjectId: id, userId: user.userId, licenses: body }, auditCtx(req));
    return reply.send({ assignments: rows });
  });

  app.get('/research-objects/:id/licenses/:versionId', async (req, reply) => {
    const { id, versionId } = roVersionParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ licenses: await getEffectiveLicenses(deps, { researchObjectId: id, userId: user?.userId, versionId }) });
  });

  app.put('/research-objects/:id/licenses/:versionId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, versionId } = roVersionParams.parse(req.params);
    const body = licensesBody.parse(req.body);
    const rows = await setVersionLicenses(deps, { researchObjectId: id, userId: user.userId, versionId, licenses: body }, auditCtx(req));
    return reply.send({ assignments: rows });
  });
}
