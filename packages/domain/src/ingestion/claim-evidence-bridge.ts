import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import type { SourceLocator, ClaimKind } from '../research-intelligence/types';
import { CLAIM_KINDS } from '../research-intelligence/types';
import { validateSourceLocator } from '../research-intelligence/validation';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { ClaimEvidenceError } from '../research-intelligence/claim-evidence-errors';
import { createClaimEvidenceBatch } from '../research-intelligence/claim-evidence-service';
import { authorizeIngestionWrite, type IngestionDeps } from './ingestion-service';

export const INGESTION_BRIDGE_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
export type IngestionBridgeField = typeof INGESTION_BRIDGE_FIELDS[number];

export interface IngestionClaimEvidenceSuggestion {
  sourceField: IngestionBridgeField;
  originalStatement: string;
  reviewedStatement: string;
  rewritten: boolean;
  defaultQuoteAssociation: boolean;
  source?: { quote: string; locator: SourceLocator };
  sources?: Array<{ quote: string; locator: SourceLocator }>;
}

export interface IngestionClaimEvidencePreview {
  taskId: string;
  researchObjectId: string;
  versionId: string;
  commitId: string;
  artifact: { id: string; logicalPath: string; contentHash: string };
  snapshotToken: string;
  suggestions: IngestionClaimEvidenceSuggestion[];
}

export interface IngestionClaimSelection {
  clientKey: string;
  sourceField: IngestionBridgeField;
  kind: ClaimKind;
  parentClientKey?: string;
  statement: string;
  conditions?: string[];
  limitations?: string[];
  attachSourceQuote: boolean;
}

type BridgeTask = {
  id: string; state: string; updatedAt: Date; artifactId: string;
  artifact: { id: string; logicalPath: string; blobSha256: string };
  batch: { researchObjectId: string; researchObject: { id: string; workspaceId: string } };
  agentTask: { id: string; status: string; updatedAt: Date; result: unknown } | null;
};

type BridgeVersion = {
  id: string; researchObjectId: string; status: string; commitId: string;
  researchObject: { id: string; workspaceId: string };
  manifest: { coreJson: unknown; entries: Array<{ artifactId: string; logicalPath: string; blobSha256: string }> } | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasBridgeFields(value: Record<string, unknown>): boolean {
  return INGESTION_BRIDGE_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function stableUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

async function loadSnapshot(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string; versionId: string; taskId: string },
): Promise<{ task: BridgeTask; version: BridgeVersion; preview: IngestionClaimEvidencePreview }> {
  await authorizeIngestionWrite(deps, input);
  const [taskValue, versionValue] = await Promise.all([
    deps.prisma.ingestionTask.findUnique({
      where: { id: input.taskId },
      include: { artifact: true, batch: { include: { researchObject: true } }, agentTask: true },
    }),
    deps.prisma.version.findUnique({
      where: { id: input.versionId },
      include: { researchObject: true, manifest: { include: { entries: true } } },
    }),
  ]);
  const task = taskValue as unknown as BridgeTask | null;
  const version = versionValue as unknown as BridgeVersion | null;
  if (!task || task.batch.researchObjectId !== input.researchObjectId || task.state !== 'confirmed'
    || !task.agentTask || task.agentTask.status !== 'succeeded') {
    throw new ClaimEvidenceError('NOT_FOUND', 'Confirmed ingestion task not found');
  }
  if (!version || version.researchObjectId !== input.researchObjectId) throw new ClaimEvidenceError('NOT_FOUND', 'Version not found');
  if (version.status !== 'draft') throw new ClaimEvidenceError('VERSION_IMMUTABLE', 'Version is immutable');
  if (!version.manifest) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Version manifest is unavailable');
  const entry = version.manifest.entries.find((candidate) => candidate.artifactId === task.artifactId);
  if (!entry || entry.blobSha256 !== task.artifact.blobSha256) {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Ingestion artifact is not part of this version');
  }
  const result = record(task.agentTask.result);
  const originalCore = record(result.core);
  const reviewedCore = record(version.manifest.coreJson);
  const evidence = record(result.evidence);
  const locations = record(result.evidenceLocation);
  const segmentBundle = result.evidenceSegments === undefined ? undefined : record(result.evidenceSegments);
  const missingFields = Array.isArray(result.needsMoreInformation) ? new Set(result.needsMoreInformation) : undefined;
  if (!hasBridgeFields(originalCore) || !hasBridgeFields(reviewedCore) || !hasBridgeFields(evidence) || !hasBridgeFields(locations)
    || (segmentBundle && (!hasBridgeFields(segmentBundle) || !missingFields))
    || INGESTION_BRIDGE_FIELDS.some((field) => typeof originalCore[field] !== 'string' || typeof reviewedCore[field] !== 'string')) {
    throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Confirmed extraction or committed SDF snapshot is incomplete');
  }
  let reference;
  try {
    reference = parseDocumentSourceMapReference(result.sourceMapRef);
  } catch (error) {
    throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Trusted extraction source is unavailable', error);
  }
  if (reference.artifactId !== task.artifactId || reference.contentHash !== task.artifact.blobSha256) {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Trusted extraction source does not match the ingestion artifact');
  }
  if (reference.parserStatus !== 'succeeded') {
    throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Confirmed extraction source still requires review');
  }
  const suggestions = INGESTION_BRIDGE_FIELDS.map((sourceField): IngestionClaimEvidenceSuggestion => {
    const originalStatement = typeof originalCore[sourceField] === 'string' ? originalCore[sourceField] as string : '';
    const reviewedStatement = typeof reviewedCore[sourceField] === 'string' ? reviewedCore[sourceField] as string : '';
    const rewritten = originalStatement.trim() !== reviewedStatement.trim();
    const evidenceValue = record(evidence[sourceField]);
    const location = record(locations[sourceField]);
    let sources: Array<{ quote: string; locator: SourceLocator }> = [];
    if (segmentBundle) {
      const segments = segmentBundle[sourceField];
      if (!Array.isArray(segments) || segments.length > 32) throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Canonical evidence segments are invalid');
      let total = 0;
      let priorPage = 0;
      let priorLocator: ReturnType<typeof validateSourceLocator> | undefined;
      let priorRangeEnd = 0;
      const closedBlockIds = new Set<string>();
      sources = segments.map((value, index) => {
        const segment = record(value);
        if (typeof segment.quote !== 'string') throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Canonical evidence segment quote is invalid');
        const locator = validateSourceLocator(segment.sourceLocator);
        total += segment.quote.length + (index > 0 ? 1 : 0);
        const sameBlock = locator.blockId === priorLocator?.blockId;
        const invalidSameBlockRange = sameBlock && priorLocator !== undefined && locator.charRange !== undefined && (
          locator.page !== priorLocator.page
          || !isDeepStrictEqual(locator.boundingBox, priorLocator.boundingBox)
          || locator.charRange.start < priorRangeEnd
        );
        if (locator.artifactId !== reference.artifactId || locator.contentHash !== reference.contentHash
          || !locator.blockId || !locator.charRange || locator.charRange.end - locator.charRange.start !== segment.quote.length
          || (locator.page ?? 0) < priorPage || invalidSameBlockRange
          || (!sameBlock && closedBlockIds.has(locator.blockId)) || total > 8_000) {
          throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Canonical evidence segments do not match the extraction source');
        }
        if (!sameBlock && priorLocator?.blockId) closedBlockIds.add(priorLocator.blockId);
        priorLocator = locator;
        priorRangeEnd = locator.charRange.end;
        priorPage = locator.page ?? priorPage;
        return { quote: segment.quote, locator };
      });
      if (typeof evidenceValue.quote !== 'string' || evidenceValue.quote !== sources.map((source) => source.quote).join('\n')
        || (sources.length === 0) !== missingFields!.has(sourceField)
        || (sources.length === 0) !== !originalStatement.trim()
        || (sources.length === 1 && (location.status !== 'located'
          || !location.sourceLocator || !isDeepStrictEqual(validateSourceLocator(location.sourceLocator), sources[0]!.locator)))
        || (sources.length > 1 && location.status !== 'cross_block')
        || (sources.length === 0 && location.status !== 'missing')) {
        throw new ClaimEvidenceError('LOCATOR_MISMATCH', 'Canonical evidence segment bundle is inconsistent');
      }
    } else if (location.status === 'located' && location.matching === 'exact' && typeof evidenceValue.quote === 'string' && evidenceValue.quote.trim()) {
      try {
        const locator = validateSourceLocator(location.sourceLocator);
        if (locator.artifactId === reference.artifactId && locator.contentHash === reference.contentHash) {
          sources = [{ quote: evidenceValue.quote, locator }];
        }
      } catch { /* An invalid model locator stays unavailable for review. */ }
    }
    return {
      sourceField, originalStatement, reviewedStatement, rewritten,
      defaultQuoteAssociation: sources.length > 0 && !rewritten,
      ...(sources.length > 0 ? { sources } : {}), ...(sources.length === 1 ? { source: sources[0] } : {}),
    };
  });
  const snapshotToken = digest({
    taskId: task.id, taskUpdatedAt: task.updatedAt.toISOString(), agentTaskId: task.agentTask.id,
    agentTaskUpdatedAt: task.agentTask.updatedAt.toISOString(), sourceMap: reference.serializedSha256,
    versionId: version.id, commitId: version.commitId, core: version.manifest.coreJson,
    artifact: { id: task.artifactId, hash: task.artifact.blobSha256 },
  });
  return {
    task, version,
    preview: {
      taskId: task.id, researchObjectId: input.researchObjectId, versionId: version.id, commitId: version.commitId,
      artifact: { id: task.artifact.id, logicalPath: entry.logicalPath, contentHash: task.artifact.blobSha256 },
      snapshotToken, suggestions,
    },
  };
}

export async function previewIngestionClaimEvidenceBridge(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string; versionId: string; taskId: string },
): Promise<IngestionClaimEvidencePreview> {
  return (await loadSnapshot(deps, input)).preview;
}

export async function listIngestionClaimEvidenceCandidates(
  deps: IngestionDeps,
  input: { userId: string; researchObjectId: string; versionId: string },
): Promise<IngestionClaimEvidencePreview[]> {
  await authorizeIngestionWrite(deps, input);
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId }, include: { manifest: { include: { entries: true } } },
  });
  if (!version || version.researchObjectId !== input.researchObjectId) throw new ClaimEvidenceError('NOT_FOUND', 'Version not found');
  if (version.status !== 'draft') throw new ClaimEvidenceError('VERSION_IMMUTABLE', 'Version is immutable');
  const artifactIds = version.manifest?.entries.map((entry) => entry.artifactId) ?? [];
  if (artifactIds.length === 0) return [];
  const existingClaims = await deps.prisma.claimNode.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: input.versionId }, select: { provenance: true },
  });
  const materializedTaskIds = existingClaims.flatMap((claim) => {
    const provenance = record(claim.provenance);
    const lineage = typeof provenance.sourceTaskLineage === 'string'
      ? provenance.sourceTaskLineage
      : provenance.source === 'reviewed_ingestion' && typeof provenance.sourceTaskId === 'string'
        ? provenance.sourceTaskId : undefined;
    return lineage ? [lineage] : [];
  });
  const tasks = await deps.prisma.ingestionTask.findMany({
    where: {
      state: 'confirmed', batch: { researchObjectId: input.researchObjectId }, artifactId: { in: artifactIds },
      ...(materializedTaskIds.length > 0 ? { id: { notIn: materializedTaskIds } } : {}),
    },
    select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 20,
  });
  const previews: IngestionClaimEvidencePreview[] = [];
  for (const task of tasks) {
    try {
      previews.push(await previewIngestionClaimEvidenceBridge(deps, { ...input, taskId: task.id }));
    } catch (error) {
      if (!(error instanceof ClaimEvidenceError)
        || !['NOT_FOUND', 'LOCATOR_MISMATCH', 'ORIGINAL_MISSING', 'VALIDATION_ERROR'].includes(error.code)) throw error;
    }
  }
  return previews;
}

export async function confirmIngestionClaimEvidenceBridge(
  deps: IngestionDeps,
  input: {
    userId: string; researchObjectId: string; versionId: string; taskId: string;
    snapshotToken: string; idempotencyKey: string; selections: IngestionClaimSelection[];
  },
  ctx: AuditContext = {},
  existingTransaction?: Prisma.TransactionClient,
) {
  const scoped = existingTransaction ? { ...deps, prisma: existingTransaction as IngestionDeps['prisma'] } : deps;
  const { preview, task, version } = await loadSnapshot(scoped, input);
  if (input.snapshotToken !== preview.snapshotToken) {
    throw new ClaimEvidenceError('CONCURRENT_UPDATE', 'Ingestion or version snapshot changed; preview again');
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200 || input.selections.length === 0 || input.selections.length > 12) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Reviewed selection is invalid');
  }
  const keys = new Set(input.selections.map((selection) => selection.clientKey));
  if (keys.size !== input.selections.length) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection clientKey must be unique');
  const suggestionByField = new Map(preview.suggestions.map((suggestion) => [suggestion.sourceField, suggestion]));
  const claimIdByKey = new Map(input.selections.map((selection) => [selection.clientKey,
    stableUuid(`ingestion-claim:${input.versionId}:${input.taskId}:${idempotencyKey}:${selection.clientKey}`)]));
  const selectionByKey = new Map(input.selections.map((selection) => [selection.clientKey, selection]));
  const orderedSelections: IngestionClaimSelection[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (selection: IngestionClaimSelection): void => {
    if (visited.has(selection.clientKey)) return;
    if (visiting.has(selection.clientKey)) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection parent graph contains a cycle');
    visiting.add(selection.clientKey);
    if (selection.parentClientKey) {
      const parent = selectionByKey.get(selection.parentClientKey);
      if (!parent) throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection parent is invalid');
      visit(parent);
    }
    visiting.delete(selection.clientKey);
    visited.add(selection.clientKey);
    orderedSelections.push(selection);
  };
  input.selections.forEach(visit);
  const claims = orderedSelections.map((selection) => {
    if (!INGESTION_BRIDGE_FIELDS.includes(selection.sourceField) || !CLAIM_KINDS.includes(selection.kind)) {
      throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection sourceField or kind is invalid');
    }
    const clientKey = selection.clientKey.trim();
    const statement = selection.statement.trim();
    if (!clientKey || clientKey.length > 100 || !statement || selection.statement.length > 4_000) {
      throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection text is invalid');
    }
    const parentClaimId = selection.parentClientKey ? claimIdByKey.get(selection.parentClientKey) : undefined;
    if ((selection.kind === 'core' && selection.parentClientKey) || (selection.kind !== 'core' && !parentClaimId)) {
      throw new ClaimEvidenceError('VALIDATION_ERROR', 'Selection parent is invalid');
    }
    return {
      id: claimIdByKey.get(selection.clientKey)!, ...(parentClaimId ? { parentClaimId } : {}), kind: selection.kind,
      statement, assessment: 'missing' as const, conditions: selection.conditions, limitations: selection.limitations,
    };
  });
  const attachedFields = input.selections.filter((selection) => selection.attachSourceQuote)
    .map((selection) => selection.sourceField);
  if (new Set(attachedFields).size !== attachedFields.length) {
    throw new ClaimEvidenceError('VALIDATION_ERROR', 'Each extraction field may be attached to only one Claim');
  }
  const evidence = input.selections.flatMap((selection) => {
    if (!selection.attachSourceQuote) return [];
    const sources = suggestionByField.get(selection.sourceField)?.sources
      ?? (suggestionByField.get(selection.sourceField)?.source ? [suggestionByField.get(selection.sourceField)!.source!] : []);
    if (sources.length === 0) throw new ClaimEvidenceError('ORIGINAL_MISSING', 'Selected extraction quote is unavailable; preview again');
    const claimId = claimIdByKey.get(selection.clientKey)!;
    return sources.map((source, segmentIndex) => ({
      id: stableUuid(`ingestion-evidence:${input.versionId}:${input.taskId}:${idempotencyKey}:${selection.clientKey}:${segmentIndex}`),
      claimId, artifactId: preview.artifact.id, kind: 'passage' as const,
      title: `${selection.sourceField} extraction quote`, exactQuote: source.quote,
      relation: 'supports' as const, locator: source.locator,
    }));
  });
  const batchDigest = digest({ versionId: input.versionId, taskId: input.taskId, idempotencyKey, claims, evidence });
  const batch = {
    userId: input.userId, researchObjectId: input.researchObjectId, versionId: input.versionId,
    sourceTaskId: input.taskId, snapshotToken: input.snapshotToken, batchDigest,
    authority: {
      taskUpdatedAt: task.updatedAt.toISOString(), agentTaskId: task.agentTask!.id,
      agentTaskUpdatedAt: task.agentTask!.updatedAt.toISOString(), versionCommitId: version.commitId,
      artifactId: preview.artifact.id, contentHash: preview.artifact.contentHash,
      manifestCoreDigest: digest(version.manifest!.coreJson),
      sourceMapRef: parseDocumentSourceMapReference(record(task.agentTask!.result).sourceMapRef),
    },
    claims, evidence,
  };
  return existingTransaction
    ? createClaimEvidenceBatch(scoped, batch, ctx, scoped)
    : createClaimEvidenceBatch(scoped, batch, ctx);
}
