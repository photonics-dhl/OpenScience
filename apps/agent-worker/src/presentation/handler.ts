import type { AiGateway } from '@openscience/ai-gateway';
import { requireStoryboardBase, type StoryboardDocument } from '@openscience/domain';
import { generateStoryboard, renderStoryboard } from './storyboard';
import { createHash } from 'node:crypto';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, PRESENTATION_ASSET_LABEL, parsePresentationGenerationPayload, requirePresentationWriteScope, withPresentationAssetWrite } from '@openscience/domain';
import type { TaskHandler } from '../index';
import { generateClaimChartSvg, canonicalPresentationClaims, type PresentationClaim } from './chart-generator';
import { generateClaimInteractiveHtml } from './interactive-html';
import { requirePresentationMediaGenerator, type PresentationMediaGenerator } from './minimax-admin';

function presentationClaimContent(claims: readonly PresentationClaim[]): string {
  return JSON.stringify(canonicalPresentationClaims(claims).map(({ id, kind, statement, assessment, conditions, limitations, extractionStatus }) => ({
    id, kind, statement, assessment, conditions, limitations, extractionStatus,
  })));
}

export function createPresentationGenerationHandler(options: { gateway?: Pick<AiGateway, 'completeStructured'>; mediaGenerator?: PresentationMediaGenerator } = {}): TaskHandler {
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
    const scope = { userId: owner.session.userId, researchObjectId: payload.researchObjectId, versionId: payload.versionId };
    await requirePresentationWriteScope(deps.prisma, scope);
    const existing = await deps.prisma.presentationAsset.findUnique({ where: { id: task.id }, include: { sourceClaims: true } });
    if (existing) return { assetId: existing.id, kind: existing.kind, status: existing.status, contentHash: existing.contentHash, sourceClaimIds: payload.sourceClaimIds };
    const claimRows = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
    const returnedClaimIds = new Set(claimRows.map((claim) => claim.id));
    if (claimRows.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
      || claimRows.some((claim) => claim.extractionStatus !== 'succeeded')) {
      throw new Error('[blocked] source Claims are not verified in the exact version');
    }
    const claims = canonicalPresentationClaims(claimRows as PresentationClaim[]);
    const base = await requireStoryboardBase(deps.prisma, payload);
    let storyboardDocument: StoryboardDocument | undefined;
    let bytes: Buffer;
    let extension: string;
    let contentType: string;
    let generator = DETERMINISTIC_PRESENTATION_GENERATOR;
    let generatorVersion = DETERMINISTIC_PRESENTATION_GENERATOR_VERSION;
    let promptHash: string | null = null;
    if (payload.storyboard) {
      if (!options.gateway) throw new Error('[blocked] storyboard planner unavailable');
      const planned = await generateStoryboard(options.gateway, claims, payload.storyboard, base?.view);
      storyboardDocument = planned.document; promptHash = planned.promptHash;
      bytes = renderStoryboard(planned.document, payload.storyboard); extension = 'html'; contentType = 'text/html; charset=utf-8';
      generator = 'OpenScience Hermes storyboard planner'; generatorVersion = '1';
    } else if (payload.kind === 'chart') {
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
    const asset = await withPresentationAssetWrite(deps.prisma, scope, async (tx) => {
      const currentTask = await tx.agentTask.findUnique({ where: { id: task.id }, include: { session: true } });
      if (!currentTask || currentTask.kind !== 'presentation.generate' || currentTask.status !== 'running'
        || currentTask.session.userId !== scope.userId || currentTask.session.researchObjectId !== payload.researchObjectId) {
        throw new Error('[blocked] presentation task authority changed');
      }
      if (payload.kind === 'image' || payload.kind === 'video') {
        const currentUser = await tx.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
        if (currentUser?.platformRole !== 'platform_admin') throw new Error('[blocked] presentation media generation requires a platform administrator');
      }
      const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      const currentIds = new Set(currentClaims.map((claim) => claim.id));
      if (currentClaims.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !currentIds.has(id))
        || currentClaims.some((claim) => claim.extractionStatus !== 'succeeded')
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)) {
        throw new Error('[blocked] source Claims changed before presentation completion');
      }
      if (base && (await requireStoryboardBase(tx, payload))?.identity !== base.identity) throw new Error('[blocked] base storyboard changed before completion');
      const created = await tx.presentationAsset.create({ data: {
        id: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind,
        objectKey, contentHash, generator, generatorVersion, promptHash, label: PRESENTATION_ASSET_LABEL,
        provenance: { source: 'verified_claims', taskId: task.id, sourceClaimIds: payload.sourceClaimIds, contentType, ...(storyboardDocument && payload.storyboard ? { subtype: 'sourced_storyboard', storyboardDocument: JSON.parse(JSON.stringify(storyboardDocument)), storyboardSettings: JSON.parse(JSON.stringify(payload.storyboard)) } : {}) },
      } });
      await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: created.id, claimId, researchObjectId: payload.researchObjectId, versionId: payload.versionId })) });
      if (storyboardDocument) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'sourced_storyboard', baseAssetId: payload.storyboard?.baseAssetId ?? null } }, tx);
      return created;
    });
    return { assetId: asset.id, kind: asset.kind, status: asset.status, contentHash, sourceClaimIds: payload.sourceClaimIds };
  };
}
