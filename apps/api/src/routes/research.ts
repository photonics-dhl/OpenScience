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
      include: { manifest: { include: { entries: true } }, publications: true, aiReview: true },
    });
    if (!version) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '版本未找到' } });
    }
    const publication = version.publications[0] ?? null;
    // P1D-9：§4.3 必显数据聚合
    const [authors, contributions, licenses] = await Promise.all([
      deps.prisma.author.findMany({
        where: { researchObjectId: ro.id },
        orderBy: { sortOrder: 'asc' },
        include: { user: { select: { displayName: true, status: true } } },
      }),
      deps.prisma.contribution.findMany({
        where: { researchObjectId: ro.id },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { displayName: true } } },
      }),
      deps.prisma.licenseAssignment.findMany({ where: { researchObjectId: ro.id, versionId: null } }),
    ]);
    const core = (version.manifest?.coreJson ?? {}) as Record<string, string>;
    const citation = `${authors.map((a) => a.user.displayName).join(', ')}. ${ro.title}. ${publicId}-v${versionNo}. ${ro.createdAt.getUTCFullYear()}.`;

    return reply.send({
      research: {
        publicId,
        title: ro.title,
        url: `/research/${publicId}/v/${versionNo}`,
        visibility: ro.visibility,
        version: {
          versionNo,
          publicVersionId: publication?.publicVersionId ?? version.publicVersionId ?? `${publicId}-v${versionNo}`,
          status: version.status,
          publishedAt: publication?.publishedAt ?? null,
          contentSha256: publication?.contentSha256 ?? null,
          legalDisclaimer: publication?.legalDisclaimer ?? null,
          core,
        },
        authors: authors.map((a) => ({ displayName: a.user.displayName, identityStatus: a.user.status, isCorresponding: a.isCorresponding, affiliation: a.affiliation, sortOrder: a.sortOrder })),
        contributions: contributions.map((c) => ({ displayName: c.user.displayName, creditRole: c.creditRole })),
        licenses: Object.fromEntries(licenses.map((l) => [l.licenseType, l.licenseId])),
        aiReview: version.aiReview
          ? { status: version.aiReview.status, hardBlocks: version.aiReview.hardBlocks, warnings: version.aiReview.warnings }
          : null,
        citation,
        artifactPaths: (version.manifest?.entries ?? []).map((e) => ({ logicalPath: e.logicalPath, blobSha256: e.blobSha256 })),
      },
    });
  });
}
