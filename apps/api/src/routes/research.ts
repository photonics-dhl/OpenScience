import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';

/** /research 公开路由依赖：AuthDeps（仅用 prisma）。 */
export type ResearchRouteDeps = AuthDeps;

const roParams = z.object({ publicId: z.string() });
const versionParams = z.object({ publicId: z.string(), versionNo: z.coerce.number().int().positive() });

/**
 * P1B-6：公开稳定 URL（§6.1 /research/OSR-YYYY-NNNNNN/v/N）。
 * 匿名可读 public RO；private/不存在 → 404（不泄露存在性）。
 * 已撤回/删除 → Phase 1D 状态说明页（P1B-6 直接 404）。
 */
export function registerResearchRoutes(app: FastifyInstance, deps: ResearchRouteDeps): void {
  app.get('/research/:publicId', async (req, reply) => {
    const { publicId } = roParams.parse(req.params);
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId } });
    if (!ro || ro.visibility !== 'public') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '未找到' } });
    }
    const latestVersion = await deps.prisma.version.findFirst({
      where: { researchObjectId: ro.id },
      orderBy: { versionNo: 'desc' },
    });
    return reply.send({
      research: {
        publicId,
        title: ro.title,
        url: `/research/${publicId}/v/${latestVersion?.versionNo ?? 1}`,
        latestVersion: latestVersion?.versionNo ?? null,
      },
    });
  });

  app.get('/research/:publicId/v/:versionNo', async (req, reply) => {
    const { publicId, versionNo } = versionParams.parse(req.params);
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId } });
    if (!ro || ro.visibility !== 'public') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '未找到' } });
    }
    const version = await deps.prisma.version.findFirst({
      where: { researchObjectId: ro.id, versionNo },
      include: { manifest: { include: { entries: true } }, publications: true },
    });
    if (!version) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '版本未找到' } });
    }
    const publication = version.publications[0] ?? null;
    return reply.send({
      version: {
        publicVersionId: version.publicVersionId ?? `${publicId}-v${versionNo}`,
        versionNo,
        title: ro.title,
        publishedAt: publication?.publishedAt ?? null,
        contentSha256: publication?.contentSha256 ?? null,
        core: version.manifest?.coreJson ?? {},
        artifacts: (version.manifest?.entries ?? []).map((e) => ({
          logicalPath: e.logicalPath,
          blobSha256: e.blobSha256,
        })),
      },
    });
  });
}
