import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { getPublicEvidenceSource, PublicEvidenceSourceError } from '@openscience/domain';

/** /research 公开路由依赖：AuthDeps（仅用 prisma）。 */
export type ResearchRouteDeps = AuthDeps & { storage?: StorageAdapter };

const roParams = z.object({ publicId: z.string() });
const versionParams = z.object({ publicId: z.string(), versionNo: z.coerce.number().int().positive() });
const evidenceSourceParams = versionParams.extend({ evidenceId: z.string().uuid() });
const presentationAssetParams = versionParams.extend({ assetId: z.string().uuid() });
const MAX_PUBLIC_PRESENTATION_BYTES = 16 * 1024 * 1024;
const safeInlineImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const safeInlineVideos = new Set(['video/mp4', 'video/webm']);
const publicLocatorSchema = z.object({
  blockId: z.string().min(1).optional(),
  page: z.number().int().positive().optional(),
  boundingBox: z.object({
    x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative(),
  }).optional(),
  charRange: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).optional(),
  tableCell: z.object({
    sheet: z.string().optional(), row: z.number().int().nonnegative(), column: z.number().int().nonnegative(),
  }).optional(),
  codeRange: z.object({
    commit: z.string(), path: z.string(),
    startLine: z.number().int().positive(), endLine: z.number().int().positive(),
  }).optional(),
});

function publicLocator(value: unknown): Record<string, unknown> {
  const parsed = publicLocatorSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function orderPublicClaims<T extends { id: string; parentClaimId: string | null; kind: string }>(claims: T[]): T[] {
  const rank = new Map(['core', 'supporting', 'method', 'boundary', 'counter'].map((kind, index) => [kind, index]));
  const position = new Map(claims.map((claim, index) => [claim.id, index]));
  const compare = (left: T, right: T) =>
    (rank.get(left.kind) ?? rank.size) - (rank.get(right.kind) ?? rank.size)
    || (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0)
    || left.id.localeCompare(right.id);
  const children = new Map<string | null, T[]>();
  const knownIds = new Set(claims.map((claim) => claim.id));
  for (const claim of claims) {
    const parentId = claim.parentClaimId && knownIds.has(claim.parentClaimId) ? claim.parentClaimId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), claim]);
  }
  for (const siblings of children.values()) siblings.sort(compare);
  const ordered: T[] = [];
  const visited = new Set<string>();
  const append = (claim: T) => {
    if (visited.has(claim.id)) return;
    visited.add(claim.id);
    ordered.push(claim);
    for (const child of children.get(claim.id) ?? []) append(child);
  };
  for (const root of children.get(null) ?? []) append(root);
  for (const claim of claims) append(claim);
  return ordered;
}

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
      where: {
        researchObjectId: ro.id,
        status: 'published',
        publications: { some: {} },
      },
      orderBy: { versionNo: 'desc' },
    });
    if (!latestVersion) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '未找到' } });
    }
    return reply.send({
      research: {
        publicId,
        title: ro.title,
        url: `/research/${publicId}/v/${latestVersion.versionNo}`,
        latestVersion: latestVersion.versionNo,
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
      where: {
        researchObjectId: ro.id,
        versionNo,
        status: 'published',
        publications: { some: {} },
      },
      include: {
        manifest: { include: { entries: true } },
        publications: { orderBy: { publishedAt: 'desc' }, take: 1 },
        aiReview: true,
      },
    });
    if (!version) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '版本未找到' } });
    }
    const publication = version.publications[0] ?? null;
    // P1D-9：§4.3 必显数据聚合
    const [authors, contributions, licenses, claims, evidence, presentationAssets, history] = await Promise.all([
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
      deps.prisma.claimNode.findMany({
        where: { researchObjectId: ro.id, versionId: version.id },
        select: {
          id: true, parentClaimId: true, kind: true, statement: true,
          assessment: true, conditions: true, limitations: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
      deps.prisma.evidenceRecord.findMany({
        where: { researchObjectId: ro.id, versionId: version.id },
        select: {
          id: true, claimId: true, kind: true, title: true, exactQuote: true,
          relation: true, locator: true, contentHash: true, extractionConfidence: true,
          extractionStatus: true, verifiedByUserId: true,
          artifact: { select: { logicalPath: true, mimeType: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
      deps.prisma.presentationAsset.findMany({
        where: { researchObjectId: ro.id, versionId: version.id, status: 'approved' },
        select: {
          id: true, kind: true, contentHash: true, label: true,
          generator: true, generatorVersion: true,
          sourceClaims: { select: { claimId: true }, orderBy: { claimId: 'asc' } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
      }),
      deps.prisma.version.findMany({
        where: {
          researchObjectId: ro.id,
          status: 'published',
          publications: { some: {} },
        },
        select: {
          versionNo: true,
          publications: {
            select: { publicVersionId: true, publishedAt: true, contentSha256: true },
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { versionNo: 'desc' },
        take: 100,
      }),
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
        claims: orderPublicClaims(claims).map((claim) => ({
          id: claim.id,
          parentClaimId: claim.parentClaimId,
          kind: claim.kind,
          statement: claim.statement,
          conditions: claim.conditions,
          limitations: claim.limitations,
          assessment: claim.assessment,
        })),
        evidence: evidence.map((item) => ({
          id: item.id,
          claimId: item.claimId,
          kind: item.kind,
          title: item.title,
          exactQuote: item.exactQuote,
          relation: item.relation,
          locator: publicLocator(item.locator),
          extractionConfidence: item.extractionConfidence,
          verified: item.extractionStatus === 'succeeded' && item.verifiedByUserId !== null,
          artifact: {
            logicalPath: item.artifact.logicalPath,
            mediaType: item.artifact.mimeType ?? 'application/octet-stream',
            contentHash: item.contentHash,
          },
        })),
        presentationAssets: presentationAssets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          label: asset.label,
          contentHash: asset.contentHash,
          generator: { name: asset.generator, version: asset.generatorVersion },
          sourceClaimIds: asset.sourceClaims.map((source) => source.claimId),
          url: `/api/research/${publicId}/v/${versionNo}/presentation-assets/${asset.id}`,
        })),
        history: history.flatMap((item) => {
          const published = item.publications[0];
          return published ? [{
            versionNo: item.versionNo,
            publicVersionId: published.publicVersionId,
            publishedAt: published.publishedAt,
            contentSha256: published.contentSha256,
            url: `/research/${publicId}/v/${item.versionNo}`,
          }] : [];
        }),
      },
    });
  });

  app.get('/research/:publicId/v/:versionNo/evidence/:evidenceId/source', async (req, reply) => {
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable');
    const { publicId, versionNo, evidenceId } = evidenceSourceParams.parse(req.params);
    return reply.send(await getPublicEvidenceSource({ ...deps, storage: deps.storage }, { publicId, versionNo, evidenceId }));
  });

  app.get('/research/:publicId/v/:versionNo/presentation-assets/:assetId', async (req, reply) => {
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable');
    const { publicId, versionNo, assetId } = presentationAssetParams.parse(req.params);
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId } });
    if (!ro || ro.visibility !== 'public') throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    const version = await deps.prisma.version.findFirst({
      where: {
        researchObjectId: ro.id, versionNo, status: 'published', publications: { some: {} },
      },
      select: { id: true },
    });
    if (!version) throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    const asset = await deps.prisma.presentationAsset.findFirst({ where: {
      id: assetId, researchObjectId: ro.id, versionId: version.id, status: 'approved',
    } });
    if (!asset) throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');

    let head;
    try {
      head = await deps.storage.headObject(asset.objectKey);
    } catch (error) {
      throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable', { cause: error });
    }
    if (!head) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable');
    if (head.size < 1 || head.size > MAX_PUBLIC_PRESENTATION_BYTES) {
      throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    }
    let object;
    try {
      object = await deps.storage.getObject(asset.objectKey);
    } catch (error) {
      throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable', { cause: error });
    }
    if (object.size !== head.size || object.size > MAX_PUBLIC_PRESENTATION_BYTES) {
      object.body.destroy();
      throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    }
    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let received = 0;
    try {
      for await (const value of object.body) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        received += chunk.length;
        if (received > object.size || received > MAX_PUBLIC_PRESENTATION_BYTES) {
          object.body.destroy();
          throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
        }
        digest.update(chunk);
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof PublicEvidenceSourceError) throw error;
      throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable', { cause: error });
    }
    if (received !== object.size || digest.digest('hex') !== asset.contentHash.toLowerCase()) {
      throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    }

    const storedType = (object.contentType ?? head.contentType ?? '').toLowerCase().split(';', 1)[0] ?? '';
    const inline = ((asset.kind === 'image' || asset.kind === 'chart') && safeInlineImages.has(storedType))
      || (asset.kind === 'video' && safeInlineVideos.has(storedType));
    const contentType = inline ? storedType : 'application/octet-stream';
    return reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="presentation-${asset.id}"`)
      .header('Content-Length', String(received))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "sandbox; default-src 'none'")
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(Buffer.concat(chunks));
  });
}
