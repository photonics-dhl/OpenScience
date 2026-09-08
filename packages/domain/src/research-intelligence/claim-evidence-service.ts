import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AuditContext } from '@openscience/observability';
import type { ArtifactDeps } from '../artifact/artifacts';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import type {
  ClaimAssessment,
  ClaimKind,
  ClaimRelation,
  EvidenceKind,
  SourceLocator,
} from './types';
import { CLAIM_ASSESSMENTS, CLAIM_KINDS, CLAIM_RELATIONS, EVIDENCE_KINDS } from './types';
import { validateSourceLocator } from './validation';
import { resolveSourceLocator } from './source-locator';
import type { DocumentSourceMap } from './document-source-map';
import {
  loadDocumentSourceMapReference,
  parseDocumentSourceMapReference,
  type DocumentSourceMapReference,
} from './source-map-ref';
import { ClaimEvidenceError } from './claim-evidence-errors';

const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
// A published Version row is immutable forever. The legacy `published -> revised`
// status transition does not create a new snapshot, so `revised` must not reopen it.
const MUTABLE_VERSION_STATES = new Set(['draft']);
const MAX_LIST_ITEMS = 100;

function transactionDeps(deps: ArtifactDeps, prisma: unknown): ArtifactDeps {
  return { ...deps, prisma: prisma as ArtifactDeps['prisma'] };
}

async function serializableWrite<T>(
  deps: ArtifactDeps,
  operation: (transaction: ArtifactDeps) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await deps.prisma.$transaction(
        async (prisma) => operation(transactionDeps(deps, prisma)),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

type VersionContext = {
  id: string;
  researchObjectId: string;
  status: string;
  commitId: string;
  researchObject: { id: string; workspaceId: string };
  manifest: { coreJson?: unknown; entries: Array<{ artifactId: string; logicalPath: string; blobSha256: string }> } | null;
};

export interface ClaimInput {
  id: string;
  userId: string;
  researchObjectId: string;
  versionId: string;
  parentClaimId?: string;
  kind: ClaimKind;
  statement: string;
  assessment: ClaimAssessment;
  conditions?: string[];
  limitations?: string[];
}

export interface EvidenceRightsInput {
  decision: 'reuse' | 'link_only' | 'metadata_only' | 'deny';
  sourceUrl?: string;
  license?: string;
  checkedAt?: string;
}

export interface EvidenceInput {
  id: string;
  userId: string;
  researchObjectId: string;
  versionId: string;
  claimId: string;
  artifactId: string;
  kind: EvidenceKind;
  title: string;
  exactQuote?: string;
  relation: ClaimRelation;
  locator: SourceLocator;
  extractionConfidence?: number;
  rights?: EvidenceRightsInput;
}

export interface ReviewedIngestionClaimEvidenceBatchInput {
  userId: string;
  researchObjectId: string;
  versionId: string;
  sourceTaskId: string;
  snapshotToken: string;
  batchDigest: string;
  authority: {
    taskUpdatedAt: string;
    agentTaskId: string;
    agentTaskUpdatedAt: string;
    versionCommitId: string;
    artifactId: string;
    contentHash: string;
    manifestCoreDigest: string;
    sourceMapRef: DocumentSourceMapReference;
  };
  claims: Array<Omit<ClaimInput, 'userId' | 'researchObjectId' | 'versionId'>>;
  evidence: Array<Omit<EvidenceInput, 'userId' | 'researchObjectId' | 'versionId'>>;
}

export interface UpdateClaimInput {
  userId: string;
  researchObjectId: string;
  versionId: string;
  claimId: string;
  expectedUpdatedAt: Date;
  patch: {
    parentClaimId?: string | null;
    kind?: ClaimKind;
    statement?: string;
    assessment?: ClaimAssessment;
    conditions?: string[];
    limitations?: string[];
  };
}

export interface UpdateEvidenceInput {
  userId: string;
  researchObjectId: string;
  versionId: string;
  evidenceId: string;
  expectedUpdatedAt: Date;
  patch: {
    claimId?: string;
    artifactId?: string;
    kind?: EvidenceKind;
    title?: string;
    exactQuote?: string | null;
    relation?: ClaimRelation;
    locator?: SourceLocator;
    extractionConfidence?: number | null;
    rights?: EvidenceRightsInput | null;
  };
}

function boundedText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || value.length > maximum) throw new ClaimEvidenceError('VALIDATION_ERROR', `${label} is invalid`);
  return normalized;
}

function boundedList(values: string[] | undefined, label: string): string[] {
  const result = values ?? [];
  if (result.length > MAX_LIST_ITEMS) throw new ClaimEvidenceError('VALIDATION_ERROR', `${label} has too many values`);
  const normalized = result.map((value) => boundedText(value, label, 500));
  if (new Set(normalized).size !== normalized.length) throw new ClaimEvidenceError('VALIDATION_ERROR', `${label} contains duplicates`);
  return normalized;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function inputHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function humanProvenance(
  value: unknown,
  rights?: EvidenceRightsInput,
  sourceMapRef?: DocumentSourceMapReference,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: 'human',
    provider: 'openscience-api',
    providerVersion: '1',
    inputHash: inputHash(value),
    ...(rights ? { rights: { ...rights } } : {}),
    ...(sourceMapRef ? { sourceMapRef } : {}),
    ...metadata,
  };
}

async function invalidatePublicationReview(deps: ArtifactDeps, versionId: string): Promise<void> {
  await deps.prisma.aiReview.updateMany({
    where: { versionId, status: 'passed' },
    data: {
      status: 'blocked',
      hardBlocks: [{ code: 'review_stale', reason: 'Claim/Evidence changed after publication review' }] as never,
      verdict: 'Claim/Evidence changed after publication review',
    },
  });
}

async function touchMutableVersion(deps: ArtifactDeps, versionId: string): Promise<void> {
  const touched = await deps.prisma.version.updateMany({
    where: { id: versionId, status: 'draft' },
    data: { status: 'draft' },
  });
  if (touched.count !== 1) throw new ClaimEvidenceError('VERSION_IMMUTABLE', 'Version is immutable');
}

async function versionContext(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string },
  write: boolean,
): Promise<VersionContext> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: { include: { entries: true } } },
  }) as VersionContext | null;
  if (!version || version.researchObjectId !== input.researchObjectId) throw new ClaimEvidenceError('NOT_FOUND', 'Version not found');
  const { workspace, membership } = await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  if (write && workspace.status !== 'active') throw new ClaimEvidenceError('FORBIDDEN', 'Archived workspace is read-only');
  if (write && !WRITE_ROLES.has(membership.role)) throw new ClaimEvidenceError('FORBIDDEN', 'Insufficient permission');
  if (write && !MUTABLE_VERSION_STATES.has(version.status)) throw new ClaimEvidenceError('VERSION_IMMUTABLE', 'Version is immutable');
  return version;
}

function sameStringLists(left: unknown, right: readonly string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameClaim(row: Record<string, unknown>, input: ClaimInput, conditions: string[], limitations: string[]): boolean {
  return row.researchObjectId === input.researchObjectId && row.versionId === input.versionId
    && (row.parentClaimId ?? undefined) === input.parentClaimId && row.kind === input.kind
    && row.statement === input.statement.trim() && row.assessment === input.assessment
    && sameStringLists(row.conditions, conditions) && sameStringLists(row.limitations, limitations);
}

async function requireScopedClaim(deps: ArtifactDeps, input: { claimId: string; researchObjectId: string; versionId: string }) {
  const claim = await deps.prisma.claimNode.findUnique({ where: { id: input.claimId } });
  if (!claim || claim.researchObjectId !== input.researchObjectId || claim.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Claim not found');
  }
  return claim;
}

async function validateClaimParent(
  deps: ArtifactDeps,
  input: { id: string; kind: ClaimKind; parentClaimId?: string; researchObjectId: string; versionId: string },
): Promise<void> {
  if (input.kind === 'core' && input.parentClaimId) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Core Claim cannot have a parent');
  if (input.kind !== 'core' && !input.parentClaimId) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Child Claim requires a parent');
  if (!input.parentClaimId) return;
  if (input.parentClaimId === input.id) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Claim cannot parent itself');
  await requireScopedClaim(deps, { claimId: input.parentClaimId, researchObjectId: input.researchObjectId, versionId: input.versionId });
  const claims = await deps.prisma.claimNode.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    select: { id: true, parentClaimId: true },
  });
  const parents = new Map(claims.map((claim) => [claim.id, claim.parentClaimId]));
  parents.set(input.id, input.parentClaimId);
  const seen = new Set<string>();
  let current: string | null | undefined = input.id;
  while (current) {
    if (seen.has(current)) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Claim graph contains a cycle');
    seen.add(current);
    current = parents.get(current);
  }
}

async function createClaimInTransaction(
  deps: ArtifactDeps, input: ClaimInput, ctx: AuditContext, provenanceMetadata: Record<string, unknown> = {},
) {
  const version = await versionContext(deps, input, true);
  if (!CLAIM_KINDS.includes(input.kind) || !CLAIM_ASSESSMENTS.includes(input.assessment)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Claim kind or assessment is invalid');
  }
  const statement = boundedText(input.statement, 'Claim statement', 4_000);
  const conditions = boundedList(input.conditions, 'Claim conditions');
  const limitations = boundedList(input.limitations, 'Claim limitations');
  await validateClaimParent(deps, input);
  const existing = await deps.prisma.claimNode.findUnique({ where: { id: input.id } });
  if (existing) {
    if (sameClaim(existing as unknown as Record<string, unknown>, input, conditions, limitations)) return existing;
    throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Claim id was already used for another payload');
  }
  const provenanceInput = { parentClaimId: input.parentClaimId, kind: input.kind, statement, assessment: input.assessment, conditions, limitations };
  const created = await deps.prisma.claimNode.create({ data: {
    id: input.id, researchObjectId: input.researchObjectId, versionId: input.versionId,
    parentClaimId: input.parentClaimId ?? null, kind: input.kind, statement,
    assessment: input.assessment, conditions, limitations,
    provenance: humanProvenance(provenanceInput, undefined, undefined, provenanceMetadata) as never, extractionStatus: 'succeeded',
  } });
  await touchMutableVersion(deps, input.versionId);
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'claim.create', workspaceId: version.researchObject.workspaceId,
    targetType: 'claim', targetId: created.id,
    metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, assessment: input.assessment },
  }, ctx);
  return created;
}

async function updateClaimInTransaction(deps: ArtifactDeps, input: UpdateClaimInput, ctx: AuditContext) {
  const version = await versionContext(deps, input, true);
  const existing = await requireScopedClaim(deps, input);
  const kind = input.patch.kind ?? existing.kind;
  const assessment = input.patch.assessment ?? existing.assessment;
  if (!CLAIM_KINDS.includes(kind) || !CLAIM_ASSESSMENTS.includes(assessment)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Claim kind or assessment is invalid');
  }
  const statement = input.patch.statement === undefined
    ? existing.statement : boundedText(input.patch.statement, 'Claim statement', 4_000);
  const conditions = input.patch.conditions === undefined
    ? existing.conditions : boundedList(input.patch.conditions, 'Claim conditions');
  const limitations = input.patch.limitations === undefined
    ? existing.limitations : boundedList(input.patch.limitations, 'Claim limitations');
  const parentClaimId = Object.prototype.hasOwnProperty.call(input.patch, 'parentClaimId')
    ? input.patch.parentClaimId ?? undefined : existing.parentClaimId ?? undefined;
  await validateClaimParent(deps, {
    id: existing.id, kind, parentClaimId, researchObjectId: input.researchObjectId, versionId: input.versionId,
  });
  const provenanceInput = { parentClaimId, kind, statement, assessment, conditions, limitations };
  const existingProvenance = recordValue(existing.provenance);
  const sourceTaskLineage = typeof existingProvenance.sourceTaskId === 'string'
    ? existingProvenance.sourceTaskId
    : typeof existingProvenance.sourceTaskLineage === 'string' ? existingProvenance.sourceTaskLineage : undefined;
  const updated = await deps.prisma.claimNode.updateMany({
    where: { id: existing.id, updatedAt: input.expectedUpdatedAt },
    data: {
      parentClaimId: parentClaimId ?? null, kind, statement, assessment, conditions, limitations,
      provenance: humanProvenance(provenanceInput, undefined, undefined,
        sourceTaskLineage ? { sourceTaskLineage } : {}) as never,
      extractionStatus: 'succeeded',
    },
  });
  if (updated.count !== 1) throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Claim changed while being updated');
  await touchMutableVersion(deps, input.versionId);
  if (existing.kind !== kind || existing.statement !== statement || existing.assessment !== assessment
    || existing.extractionStatus !== 'succeeded'
    || !sameStringLists(existing.conditions, conditions) || !sameStringLists(existing.limitations, limitations)) {
    await invalidateClaimPresentations(deps, input);
  }
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'claim.update', workspaceId: version.researchObject.workspaceId,
    targetType: 'claim', targetId: existing.id,
    metadata: {
      researchObjectId: input.researchObjectId, versionId: input.versionId,
      before: { kind: existing.kind, assessment: existing.assessment, parentClaimId: existing.parentClaimId },
      after: { kind, assessment, parentClaimId: parentClaimId ?? null },
    },
  }, ctx);
  const current = await deps.prisma.claimNode.findUnique({ where: { id: existing.id } });
  if (!current) throw new ClaimEvidenceError('NOT_FOUND', 'Claim not found');
  return current;
}

async function invalidateClaimPresentations(
  deps: ArtifactDeps,
  input: { researchObjectId: string; versionId: string; claimId: string },
): Promise<void> {
  await deps.prisma.presentationAsset.updateMany({
    where: {
      researchObjectId: input.researchObjectId,
      versionId: input.versionId,
      sourceClaims: { some: { claimId: input.claimId } },
      status: { in: ['draft', 'approved'] },
    },
    data: { status: 'rejected' },
  });
}

async function deleteClaimInTransaction(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; claimId: string; expectedUpdatedAt: Date },
  ctx: AuditContext,
): Promise<void> {
  const version = await versionContext(deps, input, true);
  const existing = await requireScopedClaim(deps, input);
  const [children, evidence] = await Promise.all([
    deps.prisma.claimNode.count({ where: { parentClaimId: existing.id } }),
    deps.prisma.evidenceRecord.count({ where: { claimId: existing.id } }),
  ]);
  if (children > 0 || evidence > 0) throw new ClaimEvidenceError('DEPENDENT_RECORDS', 'Remove child Claims and Evidence before deleting this Claim');
  await touchMutableVersion(deps, input.versionId);
  await invalidateClaimPresentations(deps, input);
  // Retain the rejected asset and its provenance, but release the Claim's RESTRICT foreign key.
  await deps.prisma.presentationAssetClaim.deleteMany({ where: {
    researchObjectId: input.researchObjectId, versionId: input.versionId, claimId: input.claimId,
  } });
  const deleted = await deps.prisma.claimNode.deleteMany({ where: { id: existing.id, updatedAt: input.expectedUpdatedAt } });
  if (deleted.count !== 1) throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Claim changed while being deleted');
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'claim.delete', workspaceId: version.researchObject.workspaceId,
    targetType: 'claim', targetId: existing.id,
    metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: existing.kind, assessment: existing.assessment },
  }, ctx);
}

export type ResolvedEvidenceSource = {
  text?: string;
  sourceMapRef?: DocumentSourceMapReference;
  region?: { x: number; y: number; width: number; height: number };
};

async function assertEvidenceSourceIdentity(
  deps: ArtifactDeps,
  version: VersionContext,
  artifactId: string,
  locator: SourceLocator,
  sourceMapRef?: DocumentSourceMapReference,
): Promise<void> {
  const entry = version.manifest?.entries.find((candidate) => candidate.artifactId === artifactId);
  const artifact = await deps.prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!entry || !artifact || artifact.workspaceId !== version.researchObject.workspaceId
    || entry.blobSha256 !== artifact.blobSha256 || locator.contentHash !== artifact.blobSha256) {
    throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Evidence artifact/hash is absent from the exact VersionManifest');
  }
  if (locator.codeRange) {
    throw new ClaimEvidenceError(
      'VALIDATION_ERROR',
      'Code Evidence is unavailable until the Version records an authoritative source revision',
    );
  }
  if (sourceMapRef && (sourceMapRef.artifactId !== artifactId
    || sourceMapRef.contentHash !== locator.contentHash || sourceMapRef.parserStatus !== 'succeeded')) {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'SourceMap reference does not match Evidence source');
  }
}

type ResolveEvidenceSourceInput = {
  researchObjectId: string;
  versionId: string;
  artifactId: string;
  locator: SourceLocator;
  exactQuote?: string;
  sourceMapRef?: unknown;
};

export type CanonicalEvidenceSource = { quote: string; locator: SourceLocator };

/** Validates exact canonical slices against one already parsed SourceMap. */
export function validateCanonicalEvidenceSources(
  sourceMap: DocumentSourceMap,
  sources: readonly CanonicalEvidenceSource[],
): ResolvedEvidenceSource[] {
  if (sources.length === 0 || sources.length > 32) {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Canonical Evidence segment count is invalid');
  }
  const blocks = new Map<string, {
    ordinal: number; page: number; pageWidth: number; pageHeight: number;
    text?: string; boundingBox: NonNullable<SourceLocator['boundingBox']>;
  }>();
  let ordinal = 0;
  for (const page of sourceMap.pages) {
    for (const block of page.blocks) {
      if (!block.text?.trim()) continue;
      blocks.set(block.id, {
        ordinal, page: page.page, pageWidth: page.width, pageHeight: page.height,
        text: block.text, boundingBox: block.boundingBox,
      });
      ordinal += 1;
    }
  }
  let priorOrdinal: number | undefined;
  let total = 0;
  const resolved: ResolvedEvidenceSource[] = [];
  for (const source of sources) {
    const locator = validateSourceLocator(source.locator);
    const block = locator.blockId ? blocks.get(locator.blockId) : undefined;
    if (locator.artifactId !== sourceMap.artifactId || locator.contentHash !== sourceMap.contentHash
      || !block || locator.page !== block.page || !isDeepStrictEqual(locator.boundingBox, block.boundingBox)
      || !locator.charRange || typeof block.text !== 'string'
      || block.text.slice(locator.charRange.start, locator.charRange.end) !== source.quote
      || locator.charRange.end - locator.charRange.start !== source.quote.length
      || (priorOrdinal !== undefined && block.ordinal <= priorOrdinal)) {
      throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Canonical Evidence does not match strictly ordered exact source blocks');
    }
    priorOrdinal = block.ordinal;
    total += source.quote.length;
    const box = locator.boundingBox!;
    resolved.push({
      text: source.quote,
      region: {
        x: Math.min(1, box.x / block.pageWidth),
        y: Math.min(1, box.y / block.pageHeight),
        width: Math.min(1 - Math.min(1, box.x / block.pageWidth), box.width / block.pageWidth),
        height: Math.min(1 - Math.min(1, box.y / block.pageHeight), box.height / block.pageHeight),
      },
    });
  }
  if (total > 8_000) throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Canonical Evidence passage is too large');
  return resolved;
}

async function resolveEvidenceSourceInternal(
  deps: ArtifactDeps,
  input: ResolveEvidenceSourceInput,
  loadedSourceMap?: DocumentSourceMap,
): Promise<ResolvedEvidenceSource> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: { include: { entries: true } } },
  }) as VersionContext | null;
  if (!version || version.researchObjectId !== input.researchObjectId) throw new ClaimEvidenceError('NOT_FOUND', 'Version not found');
  const locator = validateSourceLocator(input.locator);
  if (locator.artifactId !== input.artifactId) throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Locator artifact does not match Evidence artifact');
  await assertEvidenceSourceIdentity(deps, version, input.artifactId, locator);
  try {
    let sourceMapRef = input.sourceMapRef;
    if (sourceMapRef === undefined) {
      const ingestion = await deps.prisma.ingestionTask.findFirst({
        where: {
          artifactId: input.artifactId,
          batch: { researchObjectId: input.researchObjectId },
          agentTask: { is: { status: 'succeeded' } },
        },
        include: { agentTask: true },
        orderBy: { updatedAt: 'desc' },
      });
      const result = ingestion?.agentTask?.result;
      sourceMapRef = result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>).sourceMapRef : undefined;
    }
    const reference = parseDocumentSourceMapReference(sourceMapRef);
    if (reference.artifactId !== input.artifactId || reference.contentHash !== locator.contentHash) {
      throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'SourceMap reference does not match Evidence source');
    }
    if (reference.parserStatus !== 'succeeded') throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Parser output still requires review');
    const sourceMap = loadedSourceMap ?? await loadDocumentSourceMapReference(deps.storage, reference);
    const block = resolveSourceLocator(sourceMap, locator);
    const page = locator.page === undefined ? undefined : sourceMap.pages.find((candidate) => candidate.page === locator.page);
    const box = locator.boundingBox ?? block.boundingBox;
    const region = page ? {
      x: Math.min(1, box.x / page.width),
      y: Math.min(1, box.y / page.height),
      width: Math.min(1 - Math.min(1, box.x / page.width), box.width / page.width),
      height: Math.min(1 - Math.min(1, box.y / page.height), box.height / page.height),
    } : undefined;
    let text = block.text;
    if (input.exactQuote !== undefined) {
      if (!text) throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Quoted Evidence requires a text-bearing source');
      const selected = locator.charRange ? text.slice(locator.charRange.start, locator.charRange.end) : text.trim();
      if ((!locator.charRange && !locator.tableCell) || selected !== input.exactQuote) {
        throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Exact quote does not match deterministic source range');
      }
      text = selected;
    }
    return { ...(text === undefined ? {} : { text }), sourceMapRef: reference, ...(region ? { region } : {}) };
  } catch (error) {
    if (error instanceof ClaimEvidenceError) throw error;
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Evidence locator could not be resolved', error);
  }
}

export async function resolveEvidenceSource(
  deps: ArtifactDeps,
  input: ResolveEvidenceSourceInput,
): Promise<ResolvedEvidenceSource> {
  return resolveEvidenceSourceInternal(deps, input);
}

function normalizedRights(rights: EvidenceRightsInput | undefined): EvidenceRightsInput | undefined {
  if (!rights) return undefined;
  if (rights.sourceUrl !== undefined) {
    let parsed: URL;
    try { parsed = new URL(rights.sourceUrl); } catch { throw new ClaimEvidenceError('VALIDATION_ERROR', 'Rights sourceUrl is invalid'); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ClaimEvidenceError('VALIDATION_ERROR', 'Rights sourceUrl protocol is invalid');
  }
  if (rights.checkedAt !== undefined && Number.isNaN(Date.parse(rights.checkedAt))) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Rights checkedAt is invalid');
  return { ...rights };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicEvidenceRow<T extends { provenance: unknown }>(row: T): T {
  const provenance = { ...recordValue(row.provenance) };
  delete provenance.sourceMapRef;
  return { ...row, provenance };
}

function sameEvidence(
  row: Record<string, unknown>,
  input: EvidenceInput,
  title: string,
  quote: string | undefined,
  locator: SourceLocator,
  provenanceHash: string,
): boolean {
  return row.researchObjectId === input.researchObjectId && row.versionId === input.versionId
    && row.claimId === input.claimId && row.artifactId === input.artifactId && row.kind === input.kind
    && row.title === title && (row.exactQuote ?? undefined) === quote && row.relation === input.relation
    && JSON.stringify(row.locator) === JSON.stringify(locator)
    && recordValue(row.provenance).inputHash === provenanceHash;
}

async function createEvidenceInTransaction(
  deps: ArtifactDeps,
  input: EvidenceInput,
  resolved: ResolvedEvidenceSource,
  ctx: AuditContext,
  provenanceMetadata: Record<string, unknown> = {},
) {
  const version = await versionContext(deps, input, true);
  if (!EVIDENCE_KINDS.includes(input.kind) || !CLAIM_RELATIONS.includes(input.relation)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Evidence kind or relation is invalid');
  }
  await requireScopedClaim(deps, input);
  const title = boundedText(input.title, 'Evidence title', 500);
  const exactQuote = input.exactQuote === undefined ? undefined : boundedText(input.exactQuote, 'Evidence exactQuote', 20_000);
  if (input.extractionConfidence !== undefined && (!Number.isFinite(input.extractionConfidence)
    || input.extractionConfidence < 0 || input.extractionConfidence > 1)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Evidence extractionConfidence must be between 0 and 1');
  }
  const locator = validateSourceLocator(input.locator);
  await assertEvidenceSourceIdentity(deps, version, input.artifactId, locator, resolved.sourceMapRef);
  const rights = normalizedRights(input.rights);
  const provenanceInput = {
    claimId: input.claimId, artifactId: input.artifactId, kind: input.kind, title, exactQuote,
    relation: input.relation, locator, extractionConfidence: input.extractionConfidence, rights,
  };
  const provenanceHash = inputHash(provenanceInput);
  const existing = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.id } });
  if (existing) {
    if (sameEvidence(existing as unknown as Record<string, unknown>, input, title, exactQuote, locator, provenanceHash)) return existing;
    throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Evidence id was already used for another payload');
  }
  const created = await deps.prisma.evidenceRecord.create({ data: {
    id: input.id, researchObjectId: input.researchObjectId, versionId: input.versionId,
    workspaceId: version.researchObject.workspaceId, claimId: input.claimId, artifactId: input.artifactId,
    kind: input.kind, title, exactQuote: exactQuote ?? null, relation: input.relation,
    locator: locator as never, contentHash: locator.contentHash,
    extractionConfidence: input.extractionConfidence ?? null, extractionStatus: 'needs_review',
    verifiedByUserId: null, provenance: humanProvenance(provenanceInput, rights, resolved.sourceMapRef, provenanceMetadata) as never,
  } });
  await touchMutableVersion(deps, input.versionId);
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'evidence.create', workspaceId: version.researchObject.workspaceId,
    targetType: 'evidence', targetId: created.id,
    metadata: {
      researchObjectId: input.researchObjectId, versionId: input.versionId,
      claimId: input.claimId, artifactId: input.artifactId, kind: input.kind,
      relation: input.relation, contentHash: locator.contentHash, locator,
    },
  }, ctx);
  return created;
}

async function updateEvidenceInTransaction(
  deps: ArtifactDeps,
  input: UpdateEvidenceInput,
  resolved: ResolvedEvidenceSource,
  ctx: AuditContext,
) {
  const version = await versionContext(deps, input, true);
  const existing = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!existing || existing.researchObjectId !== input.researchObjectId || existing.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  const claimId = input.patch.claimId ?? existing.claimId;
  const artifactId = input.patch.artifactId ?? existing.artifactId;
  const kind = input.patch.kind ?? existing.kind;
  const relation = input.patch.relation ?? existing.relation;
  if (!EVIDENCE_KINDS.includes(kind) || !CLAIM_RELATIONS.includes(relation)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Evidence kind or relation is invalid');
  }
  await requireScopedClaim(deps, { claimId, researchObjectId: input.researchObjectId, versionId: input.versionId });
  const title = input.patch.title === undefined ? existing.title : boundedText(input.patch.title, 'Evidence title', 500);
  const exactQuote = Object.prototype.hasOwnProperty.call(input.patch, 'exactQuote')
    ? (input.patch.exactQuote == null ? undefined : boundedText(input.patch.exactQuote, 'Evidence exactQuote', 20_000))
    : existing.exactQuote ?? undefined;
  const extractionConfidence = Object.prototype.hasOwnProperty.call(input.patch, 'extractionConfidence')
    ? input.patch.extractionConfidence ?? undefined : existing.extractionConfidence ?? undefined;
  if (extractionConfidence !== undefined && (!Number.isFinite(extractionConfidence)
    || extractionConfidence < 0 || extractionConfidence > 1)) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Evidence extractionConfidence must be between 0 and 1');
  }
  const locator = validateSourceLocator(input.patch.locator ?? existing.locator);
  await assertEvidenceSourceIdentity(deps, version, artifactId, locator, resolved.sourceMapRef);
  const existingProvenance = recordValue(existing.provenance);
  const existingRights = existingProvenance.rights && typeof existingProvenance.rights === 'object' && !Array.isArray(existingProvenance.rights)
    ? existingProvenance.rights as unknown as EvidenceRightsInput : undefined;
  const rights = normalizedRights(Object.prototype.hasOwnProperty.call(input.patch, 'rights') ? input.patch.rights ?? undefined : existingRights);
  const provenanceInput = { claimId, artifactId, kind, title, exactQuote, relation, locator, extractionConfidence, rights };
  const updated = await deps.prisma.evidenceRecord.updateMany({
    where: { id: existing.id, updatedAt: input.expectedUpdatedAt },
    data: {
      claimId, artifactId, kind, title, exactQuote: exactQuote ?? null, relation,
      locator: locator as never, contentHash: locator.contentHash,
      extractionConfidence: extractionConfidence ?? null,
      extractionStatus: 'needs_review', verifiedByUserId: null,
      provenance: humanProvenance(provenanceInput, rights, resolved.sourceMapRef) as never,
    },
  });
  if (updated.count !== 1) throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Evidence changed while being updated');
  await touchMutableVersion(deps, input.versionId);
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'evidence.update', workspaceId: version.researchObject.workspaceId,
    targetType: 'evidence', targetId: existing.id,
    metadata: {
      researchObjectId: input.researchObjectId, versionId: input.versionId,
      before: { claimId: existing.claimId, artifactId: existing.artifactId, relation: existing.relation, verifiedByUserId: existing.verifiedByUserId },
      after: { claimId, artifactId, relation, contentHash: locator.contentHash, locator, verifiedByUserId: null },
    },
  }, ctx);
  const current = await deps.prisma.evidenceRecord.findUnique({ where: { id: existing.id } });
  if (!current) throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  return current;
}

async function verifyEvidenceInTransaction(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; evidenceId: string; expectedUpdatedAt: Date },
  resolved: ResolvedEvidenceSource,
  ctx: AuditContext,
) {
  const version = await versionContext(deps, input, true);
  const evidence = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!evidence || evidence.researchObjectId !== input.researchObjectId || evidence.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  const locator = validateSourceLocator(evidence.locator);
  await assertEvidenceSourceIdentity(deps, version, evidence.artifactId, locator, resolved.sourceMapRef);
  const updated = await deps.prisma.evidenceRecord.updateMany({
    where: { id: evidence.id, updatedAt: input.expectedUpdatedAt },
    data: { extractionStatus: 'succeeded', verifiedByUserId: input.userId },
  });
  if (updated.count !== 1) throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Evidence changed while being verified');
  await touchMutableVersion(deps, input.versionId);
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'evidence.verify', workspaceId: version.researchObject.workspaceId,
    targetType: 'evidence', targetId: evidence.id,
    metadata: {
      researchObjectId: input.researchObjectId, versionId: input.versionId,
      claimId: evidence.claimId, artifactId: evidence.artifactId,
      contentHash: evidence.contentHash, locator: evidence.locator,
    },
  }, ctx);
  const current = await deps.prisma.evidenceRecord.findUnique({ where: { id: evidence.id } });
  if (!current) throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  return current;
}

export async function getEvidenceSource(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; evidenceId: string },
): Promise<{ text?: string }> {
  await versionContext(deps, input, false);
  const evidence = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!evidence || evidence.researchObjectId !== input.researchObjectId || evidence.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  const { text } = await resolveEvidenceSource(deps, {
    researchObjectId: input.researchObjectId,
    versionId: input.versionId,
    artifactId: evidence.artifactId,
    locator: evidence.locator as unknown as SourceLocator,
    exactQuote: evidence.exactQuote ?? undefined,
    sourceMapRef: recordValue(evidence.provenance).sourceMapRef,
  });
  return text === undefined ? {} : { text };
}

async function deleteEvidenceInTransaction(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; evidenceId: string; expectedUpdatedAt: Date },
  ctx: AuditContext,
): Promise<void> {
  const version = await versionContext(deps, input, true);
  const existing = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!existing || existing.researchObjectId !== input.researchObjectId || existing.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  const deleted = await deps.prisma.evidenceRecord.deleteMany({ where: { id: existing.id, updatedAt: input.expectedUpdatedAt } });
  if (deleted.count !== 1) throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Evidence changed while being deleted');
  await touchMutableVersion(deps, input.versionId);
  await invalidatePublicationReview(deps, input.versionId);
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'evidence.delete', workspaceId: version.researchObject.workspaceId,
    targetType: 'evidence', targetId: existing.id,
    metadata: {
      researchObjectId: input.researchObjectId, versionId: input.versionId,
      claimId: existing.claimId, artifactId: existing.artifactId, contentHash: existing.contentHash,
    },
  }, ctx);
}

export async function createClaim(deps: ArtifactDeps, input: ClaimInput, ctx: AuditContext = {}) {
  try {
    return await serializableWrite(deps, (transaction) => createClaimInTransaction(transaction, input, ctx));
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'P2002') throw error;
    const existing = await deps.prisma.claimNode.findUnique({ where: { id: input.id } });
    const conditions = boundedList(input.conditions, 'Claim conditions');
    const limitations = boundedList(input.limitations, 'Claim limitations');
    if (existing && sameClaim(existing as unknown as Record<string, unknown>, input, conditions, limitations)) return existing;
    throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Claim id was already used for another payload', error);
  }
}

/**
 * Creates a user-reviewed ingestion batch in one serializable transaction.
 * Evidence deliberately remains needs_review; reviewing the batch is not proof
 * that each extracted quote and locator has been independently verified.
 */
export async function createClaimEvidenceBatch(
  deps: ArtifactDeps,
  input: ReviewedIngestionClaimEvidenceBatchInput,
  ctx: AuditContext = {},
) {
  boundedText(input.sourceTaskId, 'Source task id', 200);
  boundedText(input.snapshotToken, 'Snapshot token', 200);
  boundedText(input.batchDigest, 'Batch digest', 200);
  if (input.claims.length === 0 || input.claims.length > 12 || input.evidence.length > 6 * 32) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Reviewed ingestion batch size is invalid');
  }
  if (input.claims.some((claim) => claim.assessment !== 'missing')) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Reviewed ingestion Claims must start with missing assessment');
  }
  const claimIds = new Set(input.claims.map((claim) => claim.id));
  if (claimIds.size !== input.claims.length || new Set(input.evidence.map((evidence) => evidence.id)).size !== input.evidence.length
    || input.evidence.some((evidence) => !claimIds.has(evidence.claimId))) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Reviewed ingestion batch references are invalid');
  }
  const base = { userId: input.userId, researchObjectId: input.researchObjectId, versionId: input.versionId };
  const authority = input.authority;
  let exactReference: DocumentSourceMapReference;
  try {
    exactReference = parseDocumentSourceMapReference(authority.sourceMapRef);
  } catch (error) {
    throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Reviewed ingestion SourceMap reference is invalid', error);
  }
  if (exactReference.parserStatus !== 'succeeded' || exactReference.artifactId !== authority.artifactId
    || exactReference.contentHash !== authority.contentHash) {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Reviewed ingestion SourceMap is not an exact successful source');
  }
  const provenanceMetadata = {
    source: 'reviewed_ingestion', sourceTaskId: input.sourceTaskId,
    sourceTaskLineage: input.sourceTaskId,
    snapshotToken: input.snapshotToken, batchDigest: input.batchDigest,
  };
  await versionContext(deps, base, true);
  const sourceMap = input.evidence.length > 0
    ? await loadDocumentSourceMapReference(deps.storage, exactReference)
    : undefined;
  const preparedEvidence = input.evidence.map((evidence) => {
    const complete = { ...base, ...evidence } satisfies EvidenceInput;
    const locator = validateSourceLocator(complete.locator);
    const exactQuote = complete.exactQuote === undefined
      ? undefined : boundedText(complete.exactQuote, 'Evidence exactQuote', 20_000);
    if (exactQuote === undefined) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Reviewed ingestion Evidence requires an exact quote');
    if (complete.artifactId !== authority.artifactId || locator.artifactId !== complete.artifactId
      || locator.contentHash !== authority.contentHash) {
      throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Reviewed ingestion Evidence source identity is invalid');
    }
    return { input: complete, source: { quote: exactQuote, locator } };
  });
  const resolvedById = new Map<string, ResolvedEvidenceSource>();
  for (const claimId of claimIds) {
    const group = preparedEvidence.filter((item) => item.input.claimId === claimId);
    if (group.length === 0) continue;
    const resolved = validateCanonicalEvidenceSources(sourceMap!, group.map((item) => item.source));
    group.forEach((item, index) => resolvedById.set(item.input.id, {
      ...resolved[index]!, sourceMapRef: exactReference,
    }));
  }
  const resolvedEvidence = preparedEvidence.map((item) => ({
    input: item.input, resolved: resolvedById.get(item.input.id)!,
  }));
  const materialize = async (transaction: ArtifactDeps) => {
    const [authoritativeTask, authoritativeVersion] = await Promise.all([
      transaction.prisma.ingestionTask.findUnique({
        where: { id: input.sourceTaskId },
        include: { artifact: true, batch: true, agentTask: true },
      }),
      transaction.prisma.version.findUnique({
        where: { id: input.versionId },
        include: { researchObject: true, manifest: { include: { entries: true } } },
      }),
    ]);
    const taskResult = recordValue(authoritativeTask?.agentTask?.result);
    let currentReference: DocumentSourceMapReference | undefined;
    try { currentReference = parseDocumentSourceMapReference(taskResult.sourceMapRef); } catch { /* handled below */ }
    const taskMatches = authoritativeTask?.state === 'confirmed'
      && authoritativeTask.batch?.researchObjectId === input.researchObjectId
      && authoritativeTask.artifactId === authority.artifactId
      && authoritativeTask.artifact?.blobSha256 === authority.contentHash
      && authoritativeTask.updatedAt?.toISOString() === authority.taskUpdatedAt
      && authoritativeTask.agentTask?.id === authority.agentTaskId
      && authoritativeTask.agentTask.status === 'succeeded'
      && authoritativeTask.agentTask.updatedAt?.toISOString() === authority.agentTaskUpdatedAt
      && currentReference?.serializedSha256 === exactReference.serializedSha256
      && currentReference?.objectKey === exactReference.objectKey
      && currentReference?.parserStatus === exactReference.parserStatus
      && currentReference?.artifactId === exactReference.artifactId
      && currentReference?.contentHash === exactReference.contentHash;
    const versionMatches = authoritativeVersion?.researchObjectId === input.researchObjectId
      && authoritativeVersion.status === 'draft'
      && authoritativeVersion.commitId === authority.versionCommitId
      && authoritativeVersion.manifest
      && inputHash(authoritativeVersion.manifest.coreJson) === authority.manifestCoreDigest
      && authoritativeVersion.manifest.entries.some((entry) => entry.artifactId === authority.artifactId
        && entry.blobSha256 === authority.contentHash);
    if (!taskMatches || !versionMatches) {
      throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Ingestion or version authority changed; preview again');
    }
    const existingClaims = await transaction.prisma.claimNode.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    });
    const priorBatchClaims = existingClaims.filter((claim) => {
      const provenance = recordValue(claim.provenance);
      return provenance.sourceTaskId === input.sourceTaskId || provenance.sourceTaskLineage === input.sourceTaskId;
    });
    if (priorBatchClaims.length > 0) {
      const sameBatch = priorBatchClaims.every((claim) => {
        const provenance = recordValue(claim.provenance);
        return provenance.snapshotToken === input.snapshotToken && provenance.batchDigest === input.batchDigest;
      });
      if (!sameBatch || priorBatchClaims.length !== input.claims.length) {
        throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Reviewed ingestion task was already materialized with another batch');
      }
      const expectedClaimIds = new Set(input.claims.map((claim) => claim.id));
      if (priorBatchClaims.some((claim) => !expectedClaimIds.has(claim.id))) {
        throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Reviewed ingestion batch ids do not match');
      }
      const existingEvidence = await transaction.prisma.evidenceRecord.findMany({
        where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
      });
      const priorBatchEvidence = existingEvidence.filter((item) => {
        const provenance = recordValue(item.provenance);
        return provenance.source === 'reviewed_ingestion' && provenance.sourceTaskId === input.sourceTaskId
          && provenance.snapshotToken === input.snapshotToken && provenance.batchDigest === input.batchDigest;
      });
      const expectedEvidenceIds = new Set(input.evidence.map((item) => item.id));
      if (priorBatchEvidence.length !== input.evidence.length || priorBatchEvidence.some((item) => !expectedEvidenceIds.has(item.id))) {
        throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Reviewed ingestion Evidence replay does not match');
      }
      return { claims: priorBatchClaims, evidence: priorBatchEvidence.map(publicEvidenceRow) };
    }
    const claims = [];
    for (const claim of input.claims) {
      claims.push(await createClaimInTransaction(transaction, { ...base, ...claim }, ctx, provenanceMetadata));
    }
    if (resolvedEvidence.length > 0) {
      const evidenceData = resolvedEvidence.map(({ input: evidenceInput, resolved }) => {
        if (!EVIDENCE_KINDS.includes(evidenceInput.kind) || !CLAIM_RELATIONS.includes(evidenceInput.relation)) {
          throw new ClaimEvidenceError('VALIDATION_ERROR', 'Evidence kind or relation is invalid');
        }
        const title = boundedText(evidenceInput.title, 'Evidence title', 500);
        const exactQuote = evidenceInput.exactQuote === undefined
          ? undefined : boundedText(evidenceInput.exactQuote, 'Evidence exactQuote', 20_000);
        const locator = validateSourceLocator(evidenceInput.locator);
        const rights = normalizedRights(evidenceInput.rights);
        const provenanceInput = {
          claimId: evidenceInput.claimId, artifactId: evidenceInput.artifactId, kind: evidenceInput.kind,
          title, exactQuote, relation: evidenceInput.relation, locator,
          extractionConfidence: evidenceInput.extractionConfidence, rights,
        };
        return {
          id: evidenceInput.id, researchObjectId: evidenceInput.researchObjectId,
          versionId: evidenceInput.versionId, workspaceId: authoritativeVersion.researchObject.workspaceId,
          claimId: evidenceInput.claimId, artifactId: evidenceInput.artifactId, kind: evidenceInput.kind,
          title, exactQuote: exactQuote ?? null, relation: evidenceInput.relation,
          locator: locator as never, contentHash: locator.contentHash,
          extractionConfidence: evidenceInput.extractionConfidence ?? null,
          extractionStatus: 'needs_review' as const, verifiedByUserId: null,
          provenance: humanProvenance(provenanceInput, rights, resolved.sourceMapRef, provenanceMetadata) as never,
        };
      });
      const created = await transaction.prisma.evidenceRecord.createMany({ data: evidenceData });
      if (created.count !== evidenceData.length) {
        throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Reviewed ingestion Evidence batch was not created atomically');
      }
      await touchMutableVersion(transaction, input.versionId);
      await invalidatePublicationReview(transaction, input.versionId);
      await recordAudit(transaction, transaction.prisma, {
        actorId: input.userId, action: 'evidence.batch_create',
        workspaceId: authoritativeVersion.researchObject.workspaceId,
        targetType: 'version', targetId: input.versionId,
        metadata: {
          researchObjectId: input.researchObjectId, versionId: input.versionId,
          sourceTaskId: input.sourceTaskId, evidenceIds: evidenceData.map((item) => item.id),
        },
      }, ctx);
    }
    const evidenceIds = input.evidence.map((item) => item.id);
    const storedEvidence = evidenceIds.length === 0 ? [] : await transaction.prisma.evidenceRecord.findMany({
      where: { id: { in: evidenceIds } },
    });
    if (storedEvidence.length !== evidenceIds.length) {
      throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Reviewed ingestion Evidence batch is incomplete');
    }
    const storedById = new Map(storedEvidence.map((item) => [item.id, item]));
    return { claims, evidence: evidenceIds.map((id) => publicEvidenceRow(storedById.get(id)!)) };
  };
  try {
    return await serializableWrite(deps, materialize);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'P2002') throw error;
    return serializableWrite(deps, materialize);
  }
}

export async function updateClaim(deps: ArtifactDeps, input: UpdateClaimInput, ctx: AuditContext = {}) {
  return serializableWrite(deps, (transaction) => updateClaimInTransaction(transaction, input, ctx));
}

export async function deleteClaim(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; claimId: string; expectedUpdatedAt: Date },
  ctx: AuditContext = {},
): Promise<void> {
  return serializableWrite(deps, (transaction) => deleteClaimInTransaction(transaction, input, ctx));
}

export async function createEvidence(deps: ArtifactDeps, input: EvidenceInput, ctx: AuditContext = {}) {
  await versionContext(deps, input, true);
  await requireScopedClaim(deps, input);
  const locator = validateSourceLocator(input.locator);
  const exactQuote = input.exactQuote === undefined ? undefined : boundedText(input.exactQuote, 'Evidence exactQuote', 20_000);
  const title = boundedText(input.title, 'Evidence title', 500);
  const rights = normalizedRights(input.rights);
  const provenanceHash = inputHash({
    claimId: input.claimId, artifactId: input.artifactId, kind: input.kind, title, exactQuote,
    relation: input.relation, locator, extractionConfidence: input.extractionConfidence, rights,
  });
  const replay = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.id } });
  if (replay) {
    if (sameEvidence(replay as unknown as Record<string, unknown>, input, title, exactQuote, locator, provenanceHash)) {
      return publicEvidenceRow(replay);
    }
    throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Evidence id was already used for another payload');
  }
  const resolved = await resolveEvidenceSource(deps, { ...input, locator, exactQuote });
  try {
    const created = await serializableWrite(deps, (transaction) => createEvidenceInTransaction(transaction, input, resolved, ctx));
    return publicEvidenceRow(created);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'P2002') throw error;
    const existing = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.id } });
    if (existing && sameEvidence(existing as unknown as Record<string, unknown>, input, title, exactQuote, locator, provenanceHash)) {
      return publicEvidenceRow(existing);
    }
    throw new ClaimEvidenceError('IDEMPOTENCY_CONFLICT', 'Evidence id was already used for another payload', error);
  }
}

export async function updateEvidence(deps: ArtifactDeps, input: UpdateEvidenceInput, ctx: AuditContext = {}) {
  await versionContext(deps, input, true);
  const existing = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!existing || existing.researchObjectId !== input.researchObjectId || existing.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Evidence changed while being updated');
  }
  const artifactId = input.patch.artifactId ?? existing.artifactId;
  const exactQuote = Object.prototype.hasOwnProperty.call(input.patch, 'exactQuote')
    ? (input.patch.exactQuote == null ? undefined : boundedText(input.patch.exactQuote, 'Evidence exactQuote', 20_000))
    : existing.exactQuote ?? undefined;
  const locator = validateSourceLocator(input.patch.locator ?? existing.locator);
  const existingProvenance = recordValue(existing.provenance);
  const resolved = await resolveEvidenceSource(deps, {
    researchObjectId: input.researchObjectId, versionId: input.versionId, artifactId, locator, exactQuote,
    sourceMapRef: artifactId === existing.artifactId ? existingProvenance.sourceMapRef : undefined,
  });
  const updated = await serializableWrite(deps, (transaction) => updateEvidenceInTransaction(transaction, input, resolved, ctx));
  return publicEvidenceRow(updated);
}

export async function verifyEvidence(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; evidenceId: string; expectedUpdatedAt: Date },
  ctx: AuditContext = {},
) {
  await versionContext(deps, input, true);
  const evidence = await deps.prisma.evidenceRecord.findUnique({ where: { id: input.evidenceId } });
  if (!evidence || evidence.researchObjectId !== input.researchObjectId || evidence.versionId !== input.versionId) {
    throw new ClaimEvidenceError('NOT_FOUND', 'Evidence not found');
  }
  if (evidence.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Evidence changed while being verified');
  }
  const resolved = await resolveEvidenceSource(deps, {
    researchObjectId: input.researchObjectId, versionId: input.versionId,
    artifactId: evidence.artifactId, locator: evidence.locator as unknown as SourceLocator,
    exactQuote: evidence.exactQuote ?? undefined,
    sourceMapRef: recordValue(evidence.provenance).sourceMapRef,
  });
  const verified = await serializableWrite(deps, (transaction) => verifyEvidenceInTransaction(transaction, input, resolved, ctx));
  return publicEvidenceRow(verified);
}

export async function deleteEvidence(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionId: string; evidenceId: string; expectedUpdatedAt: Date },
  ctx: AuditContext = {},
): Promise<void> {
  return serializableWrite(deps, (transaction) => deleteEvidenceInTransaction(transaction, input, ctx));
}

export async function listClaims(deps: ArtifactDeps, input: { userId: string; researchObjectId: string; versionId: string }) {
  await versionContext(deps, input, false);
  return deps.prisma.claimNode.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function listEvidence(deps: ArtifactDeps, input: { userId: string; researchObjectId: string; versionId: string }) {
  await versionContext(deps, input, false);
  const evidence = await deps.prisma.evidenceRecord.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    orderBy: { createdAt: 'asc' },
  });
  return evidence.map(publicEvidenceRow);
}
