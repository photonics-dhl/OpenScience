import { sendPresentationAssetContent } from './presentation-asset-content';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { getBlob } from '@openscience/storage';
import { getPublicEvidenceSource, PublicEvidenceSourceError, readPublicationMetadata, publicVersionNumber, publicHistoryMedia, readPublicArtifactManifest, getPublicArtifactDownload } from '@openscience/domain';

/** /research 公开路由依赖：AuthDeps（仅用 prisma）。 */
export type ResearchRouteDeps = AuthDeps & { storage?: StorageAdapter };

const roParams = z.object({ publicId: z.string() });
const versionParams = z.object({ publicId: z.string(), versionNo: z.coerce.number().int().positive() });
const evidenceSourceParams = versionParams.extend({ evidenceId: z.string().uuid() });
const presentationAssetParams = versionParams.extend({ assetId: z.string().uuid() });
const artifactDownloadParams = versionParams.extend({ artifactId: z.string().uuid() });
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : [];
}

/** Public science comes only from the issued record; source coordinates/provenance stay private. */
function frozenPublicGraph(researchRecord: unknown) {
  const frozen = record(researchRecord);
  const dto = record(frozen.dto);
  const sources = record(frozen.sources);
  const manifest = recordList(dto.manifest);
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const claims = recordList(dto.claims).flatMap(claim => typeof claim.id === 'string' && typeof claim.kind === 'string' && typeof claim.statement === 'string' ? [{
    id: claim.id, parentClaimId: typeof claim.parentClaimId === 'string' ? claim.parentClaimId : null,
    kind: claim.kind, statement: claim.statement, conditions: strings(claim.conditions), limitations: strings(claim.limitations),
    assessment: typeof claim.assessment === 'string' ? claim.assessment : 'missing',
  }] : []);
  const evidence = recordList(dto.evidence).flatMap(item => {
    if (typeof item.id !== 'string' || typeof item.claimId !== 'string' || typeof item.kind !== 'string'
      || typeof item.title !== 'string' || typeof item.relation !== 'string' || typeof item.contentHash !== 'string') return [];
    const source = record(sources[item.id]);
    const artifact = record(item.artifact ?? source.artifact);
    const entry = manifest.find(candidate => candidate.artifactId === item.artifactId && candidate.blobSha256 === item.contentHash);
    return [{
      id: item.id, claimId: item.claimId, kind: item.kind, title: item.title,
      exactQuote: typeof source.exactQuote === 'string' ? source.exactQuote : typeof item.exactQuote === 'string' ? item.exactQuote : null,
      relation: item.relation, locator: publicLocator(item.locator),
      extractionConfidence: typeof item.extractionConfidence === 'number' ? item.extractionConfidence : null,
      verified: item.extractionStatus === 'succeeded' && item.verified === true,
      artifact: {
        logicalPath: typeof artifact.logicalPath === 'string' ? artifact.logicalPath : typeof entry?.logicalPath === 'string' ? entry.logicalPath : '',
        mediaType: typeof artifact.mediaType === 'string' ? artifact.mediaType : typeof artifact.mimeType === 'string' ? artifact.mimeType : 'application/octet-stream',
        contentHash: item.contentHash,
      },
    }];
  });
  return { claims, evidence };
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
  // Corrected legacy ordinals are temporary aliases, never publication numbers.
  // A subsequently issued canonical ordinal always wins over a former typo.
  async function redirectCorrectedPublication(publicId: string, versionNo: number, reply: FastifyReply, suffix = '') {
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId }, select: { id: true, visibility: true } });
    if (!ro || ro.visibility !== 'public') return false;
    const canonical = await deps.prisma.version.findFirst({
      where: { researchObjectId: ro.id, publicationNo: versionNo, publications: { some: {} } }, select: { id: true },
    });
    if (canonical) return false;
    const matches = await deps.prisma.version.findMany({
      where: { researchObjectId: ro.id, publications: { some: {} },
        researchRecord: { path: ['publicationCorrection', 'previousPublicVersionId'], equals: `${publicId}-v${versionNo}` } },
      select: { publicationNo: true, publicVersionId: true, researchRecord: true },
      take: 2,
    });
    if (matches.length !== 1) return false;
    const corrected = matches[0];
    if (!corrected?.publicationNo || corrected.publicationNo === versionNo) return false;
    const correction = record(record(corrected.researchRecord).publicationCorrection);
    if (correction.correctedPublicationNo !== corrected.publicationNo
      || correction.correctedPublicVersionId !== corrected.publicVersionId) return false;
    // Relative Location works through both /api public proxy and internal API origin.
    const depth = suffix.split('/').filter(Boolean).length;
    reply.header('Cache-Control', 'no-store').redirect(`${'../'.repeat(depth)}${corrected.publicationNo}${suffix}`, 307);
    return true;
  }

  app.get('/research/:publicId', async (req, reply) => {
    const { publicId } = roParams.parse(req.params);
    return sendResearch(publicId, undefined, reply);
  });

  app.get('/research/:publicId/v/:versionNo', async (req, reply) => {
    const { publicId, versionNo } = versionParams.parse(req.params);
    if (await redirectCorrectedPublication(publicId, versionNo, reply)) return;
    return sendResearch(publicId, versionNo, reply);
  });

  // Resolve latest once, then use the same publication-scoped reader as exact versions.
  async function sendResearch(publicId: string, requestedVersionNo: number | undefined, reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store')
      .header('Link', '</api/research-record/openapi>; rel="service-desc"; type="application/vnd.oai.openapi+json", </developers>; rel="service-doc"; type="text/html"');
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId } });
    if (!ro || ro.visibility !== 'public') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '未找到' } });
    }
    const version = await deps.prisma.version.findFirst({
      where: {
        researchObjectId: ro.id,
        ...(requestedVersionNo === undefined ? {} : { publicationNo: requestedVersionNo }),
        publications: { some: {} },
      },
      orderBy: { publicationNo: 'desc' },
      include: {
        manifest: { include: { entries: true } },
        publications: { orderBy: { publishedAt: 'desc' }, take: 1 },
        aiReview: true,
      },
    });
    if (!version) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '版本未找到' } });
    }
    const versionNo = requestedVersionNo ?? publicVersionNumber(version);
    if (versionNo === null) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '版本未找到' } });
    }
    const publicPath = `/research/${encodeURIComponent(publicId)}/v/${versionNo}`;
    reply.header('Content-Location', `/api${publicPath}`);
    const publication = version.publications[0] ?? null;
    const journalRelease = await deps.prisma.journalRelease?.findUnique({ where: { versionId: version.id }, include: { article: true } });
    let journalPackage: Record<string, unknown> | null = null;
    if (journalRelease) {
      reply.header('Cache-Control', 'no-store');
      const rights = journalRelease.article.rights as Record<string, unknown>;
      if (journalRelease.article.contentState !== 'active' || rights.publicDerivative !== true) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '内容当前不公开' } });
      journalPackage = { ...(journalRelease.snapshot as Record<string, unknown>), articleId: journalRelease.articleId };
      if (rights.publicSource !== true) {
        const source = { ...(journalPackage.source as Record<string, unknown>) }; delete source.text; journalPackage.source = source;
      }
    }
    const metadata = readPublicationMetadata(version.researchRecord);
    const contentAvailable = version.status === 'published' || version.status === 'revised';
    const { claims, evidence } = frozenPublicGraph(version.researchRecord);
    const history = await deps.prisma.version.findMany({
        where: {
          researchObjectId: ro.id,
          publications: { some: {} },
        },
        select: {
          publicationNo: true,
          publicVersionId: true,
          status: true,
          researchRecord: true,
          publications: {
            select: { publicVersionId: true, publishedAt: true, contentSha256: true },
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { publicationNo: 'desc' },
        take: 100,
      });
    const core = (contentAvailable ? version.manifest?.coreJson ?? {} : {}) as Record<string, string>;

    return reply.send({
      research: {
        publicId,
        ...(requestedVersionNo === undefined ? { latestVersion: versionNo } : {}),
        links: {
          self: `/api${publicPath}`,
          latest: `/api/research/${encodeURIComponent(publicId)}`,
          human: publicPath,
          openapi: '/api/research-record/openapi',
        },
        recordUrl: `/api/research-objects/${ro.id}/versions/${version.id}/record`,
        title: metadata.title ?? 'Research object (title not recorded)',
        url: publicPath,
        visibility: ro.visibility,
        version: {
          versionNo,
          publicationNo: versionNo,
          publicVersionId: publication?.publicVersionId ?? version.publicVersionId ?? `${publicId}-v${versionNo}`,
          status: version.status,
          publishedAt: publication?.publishedAt ?? null,
          contentSha256: publication?.contentSha256 ?? null,
          legalDisclaimer: publication?.legalDisclaimer ?? null,
          core,
        },
        authors: metadata.authors,
        contributions: metadata.contributions,
        licenses: metadata.licenses,
        metadataCapture: { source: metadata.captureSource, capturedAt: metadata.capturedAt, fieldSources: metadata.fieldSources ?? null },
        aiReview: version.aiReview
          ? { status: version.aiReview.status, hardBlocks: version.aiReview.hardBlocks, warnings: version.aiReview.warnings }
          : null,
        citation: metadata.citation.text ?? '',
        ...(journalPackage ? { journalPackage } : {}),
        artifactPaths: (contentAvailable ? readPublicArtifactManifest(version.researchRecord, { publicId, versionNo, researchObjectId: ro.id, versionId: version.id }) : []).map(({ logicalPath, artifactId, blobSha256, downloadAccess, downloadUrl }) => ({ logicalPath, artifactId, blobSha256, downloadAccess, ...(downloadUrl ? { downloadUrl } : {}) })),
        claims: orderPublicClaims(contentAvailable ? claims : []).map((claim) => ({
          id: claim.id,
          parentClaimId: claim.parentClaimId,
          kind: claim.kind,
          statement: claim.statement,
          conditions: claim.conditions,
          limitations: claim.limitations,
          assessment: claim.assessment,
        })),
        evidence: contentAvailable ? evidence : [],
        presentationAssets: (contentAvailable ? publicHistoryMedia(version.researchRecord) : []).map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          label: asset.label,
          contentHash: asset.contentHash,
          generator: { name: asset.generator, version: asset.generatorVersion },
          sourceClaimIds: asset.sourceClaimIds,
          ...(asset.reader ? { reader: { order: asset.reader.order, title: asset.reader.title, narration: asset.reader.narration } } : {}),
          url: `/api/research/${publicId}/v/${versionNo}/presentation-assets/${asset.id}`,
        })),
        history: history.flatMap((item) => {
          const published = item.publications[0];
          return published ? [{
            versionNo: publicVersionNumber(item),
            publicationNo: publicVersionNumber(item),
            status: item.status,
            title: readPublicationMetadata(item.researchRecord).title,
            publicVersionId: published.publicVersionId,
            publishedAt: published.publishedAt,
            contentSha256: published.contentSha256,
            url: `/research/${publicId}/v/${publicVersionNumber(item)}`,
          }] : [];
        }),
      },
    });
  }

  app.get('/research/:publicId/v/:versionNo/artifacts/:artifactId/download', async (req, reply) => {
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'Published attachment is temporarily unavailable');
    const params = artifactDownloadParams.parse(req.params);
    if (await redirectCorrectedPublication(params.publicId, params.versionNo, reply, `/artifacts/${params.artifactId}/download`)) return;
    const download = await getPublicArtifactDownload(deps, params);
    let blob;
    try { blob = await getBlob(deps.storage, download.blobSha256); }
    catch (error) { throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'Published attachment is temporarily unavailable', { cause: error }); }
    if (blob.size !== download.size) { blob.body.destroy(); throw new PublicEvidenceSourceError('NOT_FOUND', 'Published attachment not found'); }
    return reply.header('Content-Type', download.mimeType)
      .header('Content-Disposition', download.contentDisposition)
      .header('Content-Length', String(download.size))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
      .send(blob.body);
  });

  app.get('/research/:publicId/v/:versionNo/evidence/:evidenceId/source', async (req, reply) => {
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable');
    const { publicId, versionNo, evidenceId } = evidenceSourceParams.parse(req.params);
    if (await redirectCorrectedPublication(publicId, versionNo, reply, `/evidence/${evidenceId}/source`)) return;
    return reply.send(await getPublicEvidenceSource({ ...deps, storage: deps.storage }, { publicId, versionNo, evidenceId }));
  });

  app.get('/research/:publicId/v/:versionNo/presentation-assets/:assetId', async (req, reply) => {
    if (!deps.storage) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published asset is temporarily unavailable');
    const { publicId, versionNo, assetId } = presentationAssetParams.parse(req.params);
    if (await redirectCorrectedPublication(publicId, versionNo, reply, `/presentation-assets/${assetId}`)) return;
    const ro = await deps.prisma.researchObject.findUnique({ where: { publicId } });
    if (!ro || ro.visibility !== 'public') throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    const version = await deps.prisma.version.findFirst({
      where: {
        researchObjectId: ro.id, publicationNo: versionNo, status: { in: ['published', 'revised'] }, publications: { some: {} },
      },
      select: { id: true, researchRecord: true },
    });
    if (!version) throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');
    const asset = publicHistoryMedia(version.researchRecord).find(item => item.id === assetId && item.researchObjectId === ro.id && item.versionId === version.id);
    if (!asset) throw new PublicEvidenceSourceError('NOT_FOUND', 'published asset not found');

    return sendPresentationAssetContent(deps.storage, asset, reply, 'public', req.headers);
  });
}
