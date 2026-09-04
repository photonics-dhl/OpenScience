import { createHash } from 'node:crypto';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, PRESENTATION_ASSET_LABEL, parsePresentationGenerationPayload } from '@openscience/domain';
import type { TaskHandler } from '../index';
import { generateClaimChartSvg, canonicalPresentationClaims, type PresentationClaim } from './chart-generator';
import { generateClaimInteractiveHtml } from './interactive-html';
import { requirePresentationMediaGenerator, type PresentationMediaGenerator } from './minimax-admin';

export function createPresentationGenerationHandler(options: { mediaGenerator?: PresentationMediaGenerator } = {}): TaskHandler {
  return async (deps, task) => {
    if (!deps.storage) throw new Error('[blocked] presentation object storage unavailable');
    const payload = parsePresentationGenerationPayload(task.payload);
    const owner = await deps.prisma.agentTask.findUnique({
      where: { id: task.id },
      include: { session: { include: { researchObject: { include: { workspace: true } } } } },
    });
    const researchObject = owner?.session.researchObject;
    if (!owner || owner.kind !== 'presentation.generate' || owner.status !== 'running' || !researchObject
      || owner.session.userId == null || researchObject.id !== payload.researchObjectId
      || researchObject.workspace.status !== 'active') throw new Error('[blocked] presentation task authority is invalid');
    const membership = await deps.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: researchObject.workspaceId, userId: owner.session.userId } } });
    if (!membership) throw new Error('[blocked] workspace membership revoked');
    const existing = await deps.prisma.presentationAsset.findUnique({ where: { id: task.id }, include: { sourceClaims: true } });
    if (existing) return { assetId: existing.id, kind: existing.kind, status: existing.status, contentHash: existing.contentHash, sourceClaimIds: payload.sourceClaimIds };
    const claimRows = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
    const returnedClaimIds = new Set(claimRows.map((claim) => claim.id));
    if (claimRows.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
      || claimRows.some((claim) => claim.extractionStatus !== 'succeeded')) {
      throw new Error('[blocked] source Claims are not verified in the exact version');
    }
    const claims = canonicalPresentationClaims(claimRows as PresentationClaim[]);
    let bytes: Buffer;
    let extension: string;
    let contentType: string;
    let generator = DETERMINISTIC_PRESENTATION_GENERATOR;
    let generatorVersion = DETERMINISTIC_PRESENTATION_GENERATOR_VERSION;
    let promptHash: string | null = null;
    if (payload.kind === 'chart') {
      bytes = generateClaimChartSvg(claims); extension = 'svg'; contentType = 'image/svg+xml';
    } else if (payload.kind === 'interactive_html') {
      bytes = generateClaimInteractiveHtml(claims); extension = 'html'; contentType = 'text/html; charset=utf-8';
    } else {
      const user = await deps.prisma.user.findUnique({ where: { id: owner.session.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin') throw new Error('[blocked] presentation media generation requires a platform administrator');
      const result = await requirePresentationMediaGenerator(options.mediaGenerator).generate({ kind: payload.kind, sourceClaimIds: payload.sourceClaimIds });
      bytes = result.bytes; extension = payload.kind === 'image' ? 'webp' : 'mp4'; contentType = result.contentType;
      generator = result.generator; generatorVersion = result.generatorVersion; promptHash = result.promptHash;
    }
    if (bytes.length < 32 || bytes.length > 10 * 1024 * 1024) throw new Error('[blocked] presentation output size is invalid');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const objectKey = `presentation/${payload.researchObjectId}/${payload.versionId}/${contentHash}.${extension}`;
    await deps.storage.putObject(objectKey, bytes, { contentType, sha256: contentHash });
    const asset = await deps.prisma.$transaction(async (tx) => {
      const created = await tx.presentationAsset.create({ data: {
        id: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind,
        objectKey, contentHash, generator, generatorVersion, promptHash, label: PRESENTATION_ASSET_LABEL,
        provenance: { source: 'verified_claims', taskId: task.id, sourceClaimIds: payload.sourceClaimIds, contentType },
      } });
      await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: created.id, claimId, researchObjectId: payload.researchObjectId, versionId: payload.versionId })) });
      return created;
    });
    return { assetId: asset.id, kind: asset.kind, status: asset.status, contentHash, sourceClaimIds: payload.sourceClaimIds };
  };
}
