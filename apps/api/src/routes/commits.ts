import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createRequire } from 'node:module';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { buildExportPackage, compareVersions, createCommit, getVersion, rebuildVersion } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** commits 路由依赖：AuthDeps + StorageAdapter（P1B-4 重建校验读对象存储）。 */
export type CommitRouteDeps = AuthDeps & { storage: StorageAdapter };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const versionIdParams = z.object({ id: z.string().uuid() });

const commitBody = z.object({
  message: z.string().min(1).max(500),
  version: z.number().int().positive(),
  sdfCore: z.record(z.string(), z.unknown()).optional(),
  artifacts: z
    .array(z.object({ logicalPath: z.string().min(1).max(1024), artifactId: z.string().uuid() }))
    .optional(),
});

/**
 * P1B-4：/commits + /versions 增量版本引擎 API（§16 + §7.2.3 Manifest + §7.2.5 JSON Patch + §16 幂等/乐观锁 + §2.2.3 不可变）。
 * POST /research-objects/:id/commits：创建 Commit + Version + Manifest（Idempotency-Key 头）。
 * GET /versions/:id：版本详情（Manifest 快照）。
 * GET /versions/:id/rebuild：完整重建 + blob sha256 校验（§7.1）。
 */
export function registerCommitRoutes(app: FastifyInstance, deps: CommitRouteDeps): void {
  app.post('/research-objects/:id/commits', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = commitBody.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'];
    const result = await createCommit(
      deps,
      {
        researchObjectId: id,
        userId: user.userId,
        message: body.message,
        version: body.version,
        sdfCore: body.sdfCore,
        artifacts: body.artifacts,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ commit: result });
  });

  app.get('/versions/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = versionIdParams.parse(req.params);
    return reply.send({ version: await getVersion(deps, { userId: user.userId, versionId: id }) });
  });

  app.get('/versions/:id/rebuild', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = versionIdParams.parse(req.params);
    return reply.send({ version: await rebuildVersion(deps, { userId: user.userId, versionId: id }) });
  });

  app.get('/versions/:from/comparison', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { from } = z.object({ from: z.string().uuid() }).parse(req.params);
    const query = z.object({ to: z.string().uuid() }).parse(req.query);
    return reply.send({
      diff: await compareVersions(deps, { userId: user.userId, fromVersionId: from, toVersionId: query.to }),
    });
  });

  // P1B-10：SDF 标准导出包下载（§5.2 目录树 + §5.3 manifest，zip）
  app.get('/versions/:id/export', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = versionIdParams.parse(req.params);
    const files = await buildExportPackage(deps, { userId: user.userId, versionId: id });
    // archiver 是 CJS 函数导出，@types 只有类 → createRequire 加载（api 编译为 CJS，__dirname 可用）
    const localRequire = createRequire(__dirname);
    const archiver = localRequire('archiver') as (format: 'zip', opts?: { zlib?: { level: number } }) => { append: (buf: Buffer, meta: { name: string }) => void; finalize: () => Promise<void> };
    const archive = archiver('zip', { zlib: { level: 9 } });
    for (const f of files) archive.append(f.content, { name: `open-science-object/${f.path}` });
    await archive.finalize();
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="open-science-object.zip"')
      .send(archive);
  });
}
