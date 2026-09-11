import { planSceneImagePrompt } from './scene-image';
import type { AiGateway } from '@openscience/ai-gateway';
import { requireSceneImageParent, requireStoryboardBase, requireVideoGenerationParents, type StoryboardDocument } from '@openscience/domain';
import { generateStoryboard, renderStoryboard } from './storyboard';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, HERMES_AUTHORITY_REARM_MARKER, PRESENTATION_ASSET_LABEL, parsePresentationGenerationPayload, requireHermesPresentationTaskAuthority, requirePresentationWriteScope, withPresentationAssetWrite } from '@openscience/domain';
import type { TaskHandler } from '../index';
import { generateClaimChartSvg, canonicalPresentationClaims, type PresentationClaim } from './chart-generator';
import { generateClaimInteractiveHtml } from './interactive-html';
import { requirePresentationMediaGenerator, type PresentationMediaGenerator } from './minimax-admin';
import { HostVideoSpool } from './host-video-spool';
import { Prisma } from '@prisma/client';

function presentationClaimContent(claims: readonly PresentationClaim[]): string {
  return JSON.stringify(canonicalPresentationClaims(claims).map(({ id, kind, statement, assessment, conditions, limitations, extractionStatus }) => ({
    id, kind, statement, assessment, conditions, limitations, extractionStatus,
  })));
}

async function readReviewedPresentationEvidence(
  prisma: Pick<Prisma.TransactionClient, 'evidenceRecord'>,
  scope: { researchObjectId: string; versionId: string; sourceClaimIds: string[] },
  lineageByClaim?: ReadonlyMap<string, unknown>,
) {
  const candidates = await prisma.evidenceRecord.findMany({ where: {
    researchObjectId: scope.researchObjectId, versionId: scope.versionId,
    claimId: { in: scope.sourceClaimIds }, extractionStatus: 'succeeded', exactQuote: { not: null },
  }, orderBy: [{ claimId: 'asc' }, { id: 'asc' }] });
  const rows = lineageByClaim ? candidates.filter((row) => {
    const origin = row.provenance as Record<string, unknown> | null;
    const lineage = lineageByClaim.get(row.claimId);
    return typeof lineage === 'string' && origin?.source === 'reviewed_ingestion' && origin.sourceTaskId === lineage;
  }) : candidates;
  if (scope.sourceClaimIds.some((id) => !rows.some((row) => row.claimId === id && row.exactQuote?.trim()))) {
    throw new Error('[blocked] Each source Claim needs reviewed original evidence before scientific media planning');
  }
  return rows;
}

function presentationEvidenceIdentity(rows: Awaited<ReturnType<typeof readReviewedPresentationEvidence>>): string {
  return createHash('sha256').update(JSON.stringify(rows.map(({ id, claimId, artifactId, contentHash,
    exactQuote, relation, locator, extractionStatus, updatedAt, provenance }) => ({
    id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance,
  })))).digest('hex');
}

async function readPresentationInput(storage: NonNullable<Parameters<TaskHandler>[0]['storage']>, objectKey: string, expectedHash: string): Promise<Buffer> {
  const object = await storage.getObject(objectKey);
  if (object.size <= 0 || object.size > 10 * 1024 * 1024) throw new Error('[blocked] video input size is invalid');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of object.body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > object.size || size > 10 * 1024 * 1024) throw new Error('[blocked] video input stream exceeded its bound');
    chunks.push(bytes);
  }
  const result = Buffer.concat(chunks);
  if (result.length !== object.size || createHash('sha256').update(result).digest('hex') !== expectedHash) {
    throw new Error('[blocked] video input content identity changed');
  }
  return result;
}

export function createPresentationGenerationHandler(options: { gateway?: Pick<AiGateway, 'completeStructured'> & Partial<Pick<AiGateway, 'generateImage' | 'canResumeImageBeforeSubmission' | 'canResumeImageFromCompletedResult' | 'resumeImageFromCompletedResult'>>; mediaGenerator?: PresentationMediaGenerator; videoSpool?: HostVideoSpool } = {}): TaskHandler {
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
    const requireHermesAuthority = async (prisma: Parameters<typeof requireHermesPresentationTaskAuthority>[0]) => {
      if (!payload.hermesRunAuthority) return false;
      await requireHermesPresentationTaskAuthority(prisma, {
        taskId: task.id, actorId: scope.userId, payload, authority: payload.hermesRunAuthority,
      });
      return true;
    };
    await requireHermesAuthority(deps.prisma);
    const existing = await deps.prisma.presentationAsset.findUnique({ where: { id: task.id }, include: { sourceClaims: true } });
    if (existing) return { assetId: existing.id, kind: existing.kind, status: existing.status, contentHash: existing.contentHash, sourceClaimIds: payload.sourceClaimIds };
    const preProviderAuthorityRearm = payload.sceneImage && payload.hermesRunAuthority
      && [1, 2].includes(task.executionAttempt) && task.retryCount === 1 && task.recoveryContract === HERMES_AUTHORITY_REARM_MARKER;
    const completedProviderRecovery = payload.sceneImage && task.executionAttempt > 1
      && Boolean(options.gateway?.canResumeImageFromCompletedResult)
      && Boolean(options.gateway?.resumeImageFromCompletedResult)
      && await options.gateway!.canResumeImageFromCompletedResult!(task.id);
    if (payload.sceneImage && task.executionAttempt > 1 && !preProviderAuthorityRearm && !completedProviderRecovery) {
      throw new Error('[blocked] Previous paid image attempt has no saved result; explicit new generation is required');
    }
    if (preProviderAuthorityRearm) {
      if (!options.gateway?.canResumeImageBeforeSubmission
        || !await options.gateway.canResumeImageBeforeSubmission(task.id)) {
        throw new Error('[blocked] Image retry has no durable pre-submission proof');
      }
      const consumed = await deps.prisma.agentTask.updateMany({ where: {
        id: task.id, status: 'running', executionAttempt: task.executionAttempt, retryCount: 1,
        result: { equals: { hermesRecovery: HERMES_AUTHORITY_REARM_MARKER } },
      }, data: { result: Prisma.DbNull } });
      if (consumed.count !== 1) throw new Error('[blocked] Hermes authority retry marker is invalid');
    }
    if (payload.video && task.executionAttempt > 1) throw new Error('[blocked] Previous video attempt has no saved result; explicit new generation is required');
    const claimRows = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
    const returnedClaimIds = new Set(claimRows.map((claim) => claim.id));
    if (claimRows.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
      || claimRows.some((claim) => claim.extractionStatus !== 'succeeded')) {
      throw new Error('[blocked] source Claims are not verified in the exact version');
    }
    const scientificMedia = Boolean(payload.storyboard || payload.sceneImage || payload.video);
    const lineageByClaim = payload.hermesRunAuthority ? new Map(claimRows.map((claim) => {
      const origin = claim.provenance as Record<string, unknown> | null;
      return [claim.id, origin?.sourceTaskLineage ?? origin?.sourceTaskId] as const;
    })) : undefined;
    const sourceEvidence = scientificMedia ? await readReviewedPresentationEvidence(deps.prisma, payload, lineageByClaim) : [];
    if (payload.hermesRunAuthority && scientificMedia) {
      for (const claim of claimRows) {
        const provenance = claim.provenance as Record<string, unknown>;
        const lineage = provenance.sourceTaskLineage ?? provenance.sourceTaskId;
        if (!sourceEvidence.some((row) => {
          const origin = row.provenance as Record<string, unknown>;
          return row.claimId === claim.id && origin.source === 'reviewed_ingestion'
            && typeof lineage === 'string' && origin.sourceTaskId === lineage;
        })) throw new Error('[blocked] Hermes media evidence does not match the reviewed ingestion');
      }
    }
    const sourceEvidenceIdentity = presentationEvidenceIdentity(sourceEvidence);
    const claims = canonicalPresentationClaims(claimRows.map((claim) => ({ ...claim,
      sourcePassages: sourceEvidence.filter((row) => row.claimId === claim.id)
        .map((row) => ({ evidenceId: row.id, text: row.exactQuote!, relation: row.relation })),
    })) as PresentationClaim[]);
    const requireUnchangedEvidence = async (prisma: Pick<Prisma.TransactionClient, 'evidenceRecord'>) => {
      if (scientificMedia && presentationEvidenceIdentity(await readReviewedPresentationEvidence(prisma, payload, lineageByClaim)) !== sourceEvidenceIdentity) {
        throw new Error('[blocked] Reviewed source evidence changed during media generation');
      }
    };
    const base = await requireStoryboardBase(deps.prisma, payload);
    const sceneParent = await requireSceneImageParent(deps.prisma, payload);
    if (sceneParent && ((sceneParent.view.output === 'image' && !sceneParent.sourceEvidenceIdentity)
      || (sceneParent.sourceEvidenceIdentity && sceneParent.sourceEvidenceIdentity !== sourceEvidenceIdentity))) {
      throw new Error('[blocked] Storyboard evidence has changed; revise the illustration plan before generating images');
    }
    const videoParents = await requireVideoGenerationParents(deps.prisma, payload);
    let storyboardDocument: StoryboardDocument | undefined;
    let bytes: Buffer;
    let extension: string;
    let contentType: string;
    let generator = DETERMINISTIC_PRESENTATION_GENERATOR;
    let generatorVersion = DETERMINISTIC_PRESENTATION_GENERATOR_VERSION;
    let promptHash: string | null = null;
    let imageProvider: string | null = null;
    let videoOutput: { filePath: string; size: number; contentHash: string } | undefined;
    let videoProvenance: Record<string, unknown> | undefined;
    if (payload.video && videoParents) {
      const user = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] isolated video generation is unavailable');
      if (!options.videoSpool) throw new Error('[blocked] isolated video generation is unavailable');
      const sceneImages = [];
      for (const asset of videoParents.orderedImages) {
        sceneImages.push(await readPresentationInput(deps.storage, asset.objectKey, asset.contentHash));
      }
      await requirePresentationWriteScope(deps.prisma, scope);
      const [currentOwner, currentUser, currentClaims, currentParents] = await Promise.all([
        deps.prisma.agentTask.findUnique({ where: { id: task.id }, include: { session: true } }),
        deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } }),
        deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } }),
        requireVideoGenerationParents(deps.prisma, payload),
      ]);
      if (!currentOwner || currentOwner.status !== 'running' || currentOwner.executionAttempt !== task.executionAttempt
        || currentOwner.session.userId !== scope.userId || currentOwner.session.researchObjectId !== payload.researchObjectId
        || (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma))
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)
        || currentParents?.identity !== videoParents.identity) {
        throw new Error('[blocked] approved video inputs changed before rendering');
      }
      await requireUnchangedEvidence(deps.prisma);
      const result = await options.videoSpool.generate({
        taskId: task.id, executionAttempt: task.executionAttempt, profile: payload.video.profile,
        ...(payload.video.profile === 'onchip-field-sampling-v1' ? { sceneRoles: payload.video.sceneRoles } : {}),
        sourceClaimIds: payload.sourceClaimIds, storyboard: videoParents.storyboardView.document, sceneImages,
      });
      bytes = Buffer.alloc(0); contentType = result.contentType; extension = 'mp4';
      generator = result.generator; generatorVersion = result.generatorVersion; promptHash = result.inputHash;
      videoOutput = { filePath: result.filePath, size: result.size, contentHash: result.contentHash };
      videoProvenance = {
        subtype: 'approved_storyboard_video', video: payload.video, parentIdentity: videoParents.identity,
        storyboardContentHash: videoParents.storyboard.contentHash,
        sceneImageContentHashes: videoParents.orderedImages.map((asset) => asset.contentHash),
        narration: result.narration, metrics: result.metrics, runtime: result.runtime,
      };
    } else if (payload.sceneImage && sceneParent) {
      const user = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (user?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] presentation media generation requires a platform administrator');
      if (!options.gateway?.generateImage) throw new Error('[blocked] scene image gateway unavailable');
      const prompt = completedProviderRecovery ? null
        : await planSceneImagePrompt(options.gateway, claims, sceneParent.view, payload.sceneImage.sceneIndex);
      await requirePresentationWriteScope(deps.prisma, scope);
      const currentUser = await deps.prisma.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
      if (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(deps.prisma)) throw new Error('[blocked] presentation media authority changed');
      if ((await requireSceneImageParent(deps.prisma, payload))?.identity !== sceneParent.identity) throw new Error('[blocked] approved storyboard changed before image generation');
      const currentClaims = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      if (presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)) throw new Error('[blocked] source Claims changed before image generation');
      await requireUnchangedEvidence(deps.prisma);
      const result = completedProviderRecovery
        ? await options.gateway.resumeImageFromCompletedResult!(task.id)
        : await options.gateway.generateImage({ prompt: prompt!, requestId: task.id });
      bytes = result.bytes; contentType = result.contentType; extension = imageExtension(contentType);
      imageProvider = result.provider;
      generator = `OpenScience Hermes scene image / ${result.provider}`; generatorVersion = result.model; promptHash = result.promptHash;
    } else if (payload.storyboard) {
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
      bytes = result.bytes; extension = payload.kind === 'image' ? imageExtension(result.contentType) : 'mp4'; contentType = result.contentType;
      generator = result.generator; generatorVersion = result.generatorVersion; promptHash = result.promptHash;
    }
    if (videoOutput ? videoOutput.size < 32 || videoOutput.size > 128 * 1024 * 1024 : bytes.length < 32 || bytes.length > 10 * 1024 * 1024) throw new Error('[blocked] presentation output size is invalid');
    const contentHash = videoOutput?.contentHash ?? createHash('sha256').update(bytes).digest('hex');
    const objectKey = `presentation/${payload.researchObjectId}/${payload.versionId}/${contentHash}.${extension}`;
    await deps.storage.putObject(objectKey, videoOutput ? createReadStream(videoOutput.filePath) : bytes, { contentType, sha256: contentHash });
    const asset = await withPresentationAssetWrite(deps.prisma, scope, async (tx) => {
      const currentTask = await tx.agentTask.findUnique({ where: { id: task.id }, include: { session: true } });
      if (!currentTask || currentTask.kind !== 'presentation.generate' || currentTask.status !== 'running'
        || currentTask.executionAttempt !== task.executionAttempt
        || currentTask.session.userId !== scope.userId || currentTask.session.researchObjectId !== payload.researchObjectId) {
        throw new Error('[blocked] presentation task authority changed');
      }
      if (payload.kind === 'image' || payload.kind === 'video') {
        const currentUser = await tx.user.findUnique({ where: { id: scope.userId }, select: { platformRole: true } });
        if (currentUser?.platformRole !== 'platform_admin' && !await requireHermesAuthority(tx)) {
          throw new Error('[blocked] presentation media generation requires a platform administrator or active Hermes run grant');
        }
      }
      const currentClaims = await tx.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: payload.researchObjectId, versionId: payload.versionId } });
      const currentIds = new Set(currentClaims.map((claim) => claim.id));
      if (currentClaims.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !currentIds.has(id))
        || currentClaims.some((claim) => claim.extractionStatus !== 'succeeded')
        || presentationClaimContent(currentClaims as PresentationClaim[]) !== presentationClaimContent(claims)) {
        throw new Error('[blocked] source Claims changed before presentation completion');
      }
      if (base && (await requireStoryboardBase(tx, payload))?.identity !== base.identity) throw new Error('[blocked] base storyboard changed before completion');
      if (sceneParent && (await requireSceneImageParent(tx, payload))?.identity !== sceneParent.identity) throw new Error('[blocked] approved storyboard changed before scene image completion');
      if (videoParents && (await requireVideoGenerationParents(tx, payload))?.identity !== videoParents.identity) throw new Error('[blocked] approved video inputs changed before completion');
      await requireUnchangedEvidence(tx);
      const created = await tx.presentationAsset.create({ data: {
        id: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind,
        objectKey, contentHash, generator, generatorVersion, promptHash, label: PRESENTATION_ASSET_LABEL,
        provenance: { ...(scientificMedia ? { sourceEvidenceIdentity, sourceEvidenceIds: sourceEvidence.map((row) => row.id) } : {}), source: payload.sceneImage ? 'approved_storyboard_scene' : payload.video ? 'approved_storyboard_video' : 'verified_claims', ...(payload.sceneImage && sceneParent ? { subtype: 'storyboard_scene_image', sceneImage: { ...payload.sceneImage }, parentIdentity: sceneParent.identity, storyboardContentHash: sceneParent.contentHash } : {}), ...(videoProvenance ?? {}), taskId: task.id, sourceClaimIds: payload.sourceClaimIds, contentType, ...(storyboardDocument && payload.storyboard ? { subtype: 'sourced_storyboard', storyboardDocument: JSON.parse(JSON.stringify(storyboardDocument)), storyboardSettings: JSON.parse(JSON.stringify(payload.storyboard)) } : {}) },
      } });
      await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: created.id, claimId, researchObjectId: payload.researchObjectId, versionId: payload.versionId })) });
      if (storyboardDocument) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'sourced_storyboard', baseAssetId: payload.storyboard?.baseAssetId ?? null } }, tx);
      if (payload.sceneImage) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'storyboard_scene_image', storyboardAssetId: payload.sceneImage.storyboardAssetId, sceneIndex: payload.sceneImage.sceneIndex, provider: imageProvider, model: generatorVersion, contentHash } }, tx);
      if (payload.video) await deps.audit?.record({ actorId: scope.userId, action: 'presentation_asset.generated', workspaceId: researchObject.workspaceId, targetType: 'presentation_asset', targetId: created.id, metadata: { taskId: task.id, researchObjectId: payload.researchObjectId, versionId: payload.versionId, subtype: 'approved_storyboard_video', storyboardAssetId: payload.video.storyboardAssetId, contentHash, timingStatus: 'estimated_requires_review' } }, tx);
      return created;
    });
    return { assetId: asset.id, kind: asset.kind, status: asset.status, contentHash, sourceClaimIds: payload.sourceClaimIds };
  };
}

function imageExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  throw new Error('[blocked] Unsupported image content type');
}
