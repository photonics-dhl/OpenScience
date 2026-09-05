import type { AuditContext } from '@openscience/observability';
import type { PresentationAsset, PresentationAssetStatus, Prisma } from '@prisma/client';
import { createAgentSession, getAgentTask, submitAgentTask, submitDeterministicPresentationTask, type AgentDeps, type AgentTaskView } from '../agent/agent';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';
import { PresentationAssetError } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ['chart', 'interactive_html', 'image', 'video'] as const;
export const DETERMINISTIC_PRESENTATION_GENERATOR = 'OpenScience deterministic renderer';
export const DETERMINISTIC_PRESENTATION_GENERATOR_VERSION = 'openscience-presentation-v2';
export type PresentationGenerationKind = (typeof KINDS)[number];
export interface PresentationGenerationPayload { schemaVersion: 1; researchObjectId: string; versionId: string; kind: PresentationGenerationKind; sourceClaimIds: string[] }
export interface PresentationAssetView {
  canTransition: boolean;
  id: string;
  researchObjectId: string;
  versionId: string;
  kind: PresentationAsset['kind'];
  contentHash: string;
  generator: string;
  generatorVersion: string;
  status: PresentationAsset['status'];
  label: string;
  sourceClaimIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function parsePresentationGenerationPayload(value: unknown): PresentationGenerationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload is invalid');
  const payload = value as Record<string, unknown>;
  const expected = ['kind', 'researchObjectId', 'schemaVersion', 'sourceClaimIds', 'versionId'];
  const keys = Object.keys(payload).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || payload.schemaVersion !== 1
    || typeof payload.researchObjectId !== 'string' || !UUID.test(payload.researchObjectId)
    || typeof payload.versionId !== 'string' || !UUID.test(payload.versionId)
    || typeof payload.kind !== 'string' || !(KINDS as readonly string[]).includes(payload.kind)
    || !Array.isArray(payload.sourceClaimIds) || payload.sourceClaimIds.length < 1 || payload.sourceClaimIds.length > 12
    || payload.sourceClaimIds.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload is invalid');
  }
  const sourceClaimIds = [...new Set(payload.sourceClaimIds as string[])].sort();
  if (sourceClaimIds.length !== payload.sourceClaimIds.length) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation payload contains duplicate Claims');
  return { schemaVersion: 1, researchObjectId: payload.researchObjectId, versionId: payload.versionId, kind: payload.kind as PresentationGenerationKind, sourceClaimIds };
}

type PresentationScope = { userId: string; researchObjectId: string; versionId: string };

export async function getPresentationTask(deps: AgentDeps, input: PresentationScope & { taskId: string }): Promise<AgentTaskView> {
  await requireScope(deps.prisma, input);
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  const payload = task?.payload;
  if (!task || task.kind !== 'presentation.generate' || task.session.userId !== input.userId
    || task.session.researchObjectId !== input.researchObjectId
    || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.researchObjectId !== input.researchObjectId || payload.versionId !== input.versionId) {
    throw new PresentationAssetError('NOT_FOUND', 'Presentation task not found');
  }
  return getAgentTask(deps, input);
}
type ScopeDb = Pick<Prisma.TransactionClient, 'version' | 'workspace' | 'membership'>;
const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);

async function requireScope(prisma: ScopeDb, input: PresentationScope, write = false) {
  const version = await prisma.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
  if (!version || version.researchObjectId !== input.researchObjectId || !version.researchObject) throw new PresentationAssetError('NOT_FOUND', 'Research Object version not found');
  const { workspace, membership } = await requireMembership({ prisma }, version.researchObject.workspaceId, input.userId);
  if (write && (workspace.status !== 'active' || !WRITE_ROLES.has(membership.role))) throw new PresentationAssetError('FORBIDDEN', 'Presentation writes require an active workspace and a content-writing role');
  if (write && version.status !== 'draft') throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation assets can only change on a draft version');
  return version;
}

export function requirePresentationWriteScope(prisma: ScopeDb, input: PresentationScope) {
  return requireScope(prisma, input, true);
}

/** Same draft row fence and Serializable retry policy as Claim/Evidence writes. */
export async function withPresentationAssetWrite<T>(
  prisma: Pick<AgentDeps['prisma'], '$transaction'>,
  input: PresentationScope,
  operation: (tx: Prisma.TransactionClient, version: Awaited<ReturnType<typeof requirePresentationWriteScope>>) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const version = await requirePresentationWriteScope(tx, input);
        const touched = await tx.version.updateMany({ where: { id: input.versionId, status: 'draft' }, data: { status: 'draft' } });
        if (touched.count !== 1) throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation assets can only change on a draft version');
        return operation(tx, version);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

async function requirePlatformAdmin(deps: AgentDeps, userId: string): Promise<void> {
  const user = await deps.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  if (user?.platformRole !== 'platform_admin') throw new PresentationAssetError('ADMIN_REQUIRED', 'Generated image and video requests require a platform administrator');
}

export async function submitPresentationGeneration(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string; kind: PresentationGenerationKind; sourceClaimIds: string[]; idempotencyKey: string;
}, ctx: AuditContext = {}): Promise<AgentTaskView> {
  await requirePresentationWriteScope(deps.prisma, input);
  const payload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, sourceClaimIds: input.sourceClaimIds });
  const claims = await deps.prisma.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: input.researchObjectId, versionId: input.versionId }, select: { id: true, extractionStatus: true } });
  const returnedClaimIds = new Set(claims.map((claim) => claim.id));
  if (claims.length !== payload.sourceClaimIds.length || payload.sourceClaimIds.some((id) => !returnedClaimIds.has(id))
    || claims.some((claim) => claim.extractionStatus !== 'succeeded')) {
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Every source Claim must be verified in the exact version');
  }
  if (input.kind === 'image' || input.kind === 'video') await requirePlatformAdmin(deps, input.userId);
  const session = await createAgentSession(deps, { userId: input.userId, researchObjectId: input.researchObjectId, kind: 'visualization', title: 'Presentation asset generation', idempotencyKey: `presentation-session:${input.userId}:${input.researchObjectId}:${input.versionId}` }, ctx);
  const taskInput = { sessionId: session.id, userId: input.userId, kind: 'presentation.generate' as const, payload: payload as unknown as Record<string, unknown>, idempotencyKey: input.idempotencyKey };
  return input.kind === 'chart' || input.kind === 'interactive_html'
    ? submitDeterministicPresentationTask(deps, taskInput, ctx)
    : submitAgentTask(deps, taskInput, ctx);
}

export async function listPresentationAssets(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string;
}): Promise<PresentationAssetView[]> {
  const version = await requireScope(deps.prisma, input);
  const { workspace, membership } = await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  const user = await deps.prisma.user.findUnique({ where: { id: input.userId }, select: { platformRole: true } });
  const canWrite = version.status === 'draft' && workspace.status === 'active' && WRITE_ROLES.has(membership.role);
  const assets = await deps.prisma.presentationAsset.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    include: { sourceClaims: { select: { claimId: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return assets.map((asset) => ({
    canTransition: canWrite && asset.status === 'draft' && (!(asset.kind === 'image' || asset.kind === 'video') || user?.platformRole === 'platform_admin'),
    id: asset.id,
    researchObjectId: asset.researchObjectId,
    versionId: asset.versionId,
    kind: asset.kind,
    contentHash: asset.contentHash,
    generator: asset.generator,
    generatorVersion: asset.generatorVersion,
    status: asset.status,
    label: asset.label,
    sourceClaimIds: asset.sourceClaims.map((source) => source.claimId).sort(),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }));
}

/** Server-only content lookup; storage coordinates must never enter metadata responses. */
export async function getPresentationAssetForRead(deps: AgentDeps, input: PresentationScope & { assetId: string }): Promise<PresentationAsset> {
  await requireScope(deps.prisma, input);
  const asset = await deps.prisma.presentationAsset.findUnique({ where: { id: input.assetId } });
  if (!asset || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId) {
    throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
  }
  return asset;
}

export async function transitionPresentationAsset(deps: AgentDeps, input: {
  userId: string; researchObjectId: string; versionId: string; assetId: string; status: Extract<PresentationAssetStatus, 'approved' | 'rejected'>; expectedUpdatedAt: Date;
}, ctx: AuditContext = {}): Promise<PresentationAsset> {
  return withPresentationAssetWrite(deps.prisma, input, async (tx, version) => {
    const transaction = { ...deps, prisma: tx as AgentDeps['prisma'] };
    const asset = await tx.presentationAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.researchObjectId !== input.researchObjectId || asset.versionId !== input.versionId) throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
    if (asset.label !== PRESENTATION_ASSET_LABEL) throw new PresentationAssetError('VALIDATION_ERROR', 'Presentation asset label is invalid');
    if (asset.status !== 'draft') throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Presentation asset status is terminal');
    if (asset.kind === 'image' || asset.kind === 'video') await requirePlatformAdmin(transaction, input.userId);
    const changed = await tx.presentationAsset.updateMany({ where: { id: asset.id, status: 'draft', updatedAt: input.expectedUpdatedAt }, data: { status: input.status } });
    if (changed.count !== 1) throw new PresentationAssetError('CONCURRENT_UPDATE', 'Presentation asset changed concurrently');
    const current = await tx.presentationAsset.findUnique({ where: { id: asset.id } });
    if (!current) throw new PresentationAssetError('NOT_FOUND', 'Presentation asset not found');
    await recordAudit(transaction, tx, { actorId: input.userId, action: `presentation_asset.${input.status}`, workspaceId: version.researchObject.workspaceId, targetType: 'presentation_asset', targetId: asset.id, metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: asset.kind } }, ctx);
    return current;
  });
}

export { PresentationAssetError } from './errors';
