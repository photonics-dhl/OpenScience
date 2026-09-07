import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { IngestionDeps } from './ingestion-service';
import { SDF_NODE_TYPES } from '../research-object/types';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { createBlockSourceLocator } from '../research-intelligence/source-locator';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Carry the prior graph into a new version without rewriting its immutable source rows. */
export async function carryIngestionEvidence(deps: IngestionDeps, input: { researchObjectId: string; previousVersionId: string; versionId: string }) {
  const where = { researchObjectId: input.researchObjectId, versionId: input.previousVersionId };
  const claims = await deps.prisma.claimNode.findMany({ where });
  const evidence = await deps.prisma.evidenceRecord.findMany({ where });
  const ids = new Map(claims.map(claim => [claim.id, randomUUID()]));
  // Insert parents first; source data already obeys the scoped parent foreign key.
  const pending = [...claims];
  const inserted = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex(claim => !claim.parentClaimId || inserted.has(claim.parentClaimId));
    if (index < 0) throw new Error('Existing Claim graph cannot be copied');
    const claim = pending.splice(index, 1)[0]!;
    await deps.prisma.claimNode.create({ data: {
      id: ids.get(claim.id)!, researchObjectId: input.researchObjectId, versionId: input.versionId,
      parentClaimId: claim.parentClaimId ? ids.get(claim.parentClaimId) : undefined,
      kind: claim.kind, statement: claim.statement, assessment: claim.assessment,
      conditions: claim.conditions, limitations: claim.limitations, extractionStatus: 'needs_review',
      provenance: { ...record(claim.provenance), previousVersionId: input.previousVersionId, previousClaimId: claim.id } as Prisma.InputJsonValue,
    } });
    inserted.add(claim.id);
  }
  for (const item of evidence) await deps.prisma.evidenceRecord.create({ data: {
    researchObjectId: input.researchObjectId, versionId: input.versionId, workspaceId: item.workspaceId,
    claimId: ids.get(item.claimId)!, artifactId: item.artifactId, kind: item.kind, title: item.title,
    exactQuote: item.exactQuote, relation: item.relation, locator: item.locator as Prisma.InputJsonValue,
    contentHash: item.contentHash, extractionConfidence: item.extractionConfidence, extractionStatus: 'needs_review',
    provenance: { ...record(item.provenance), previousVersionId: input.previousVersionId, previousEvidenceId: item.id } as Prisma.InputJsonValue,
  } });
}

/** Only exact, unambiguous source matches become evidence. SDF acceptance is not evidence verification. */
export async function writeIngestionEvidence(deps: IngestionDeps, input: {
  task: {
    id: string; artifactId: string;
    artifact: { blobSha256: string; workspaceId: string };
    agentTask: { result: unknown } | null;
    batch: { researchObjectId: string };
  };
  versionId: string;
  core: Record<string, string>;
}) {
  const { task } = input;
  const result = record(task.agentTask?.result);
  const proposed = record(result.core);
  const evidence = record(result.evidence);
  // Old imports may not have a source map. Keep that gap explicit; never invent a locator.
  if (!result.sourceMapRef) return;
  let sourceMap;
  let reference;
  try {
    reference = parseDocumentSourceMapReference(result.sourceMapRef);
    if (reference.artifactId !== task.artifactId || reference.contentHash !== task.artifact.blobSha256) return;
    sourceMap = await loadDocumentSourceMapReference(deps.storage, reference);
  } catch {
    // Missing/corrupt parser output cannot certify evidence; the original artifact still survives.
    return;
  }
  for (const field of SDF_NODE_TYPES) {
    const statement = input.core[field]?.trim();
    const quote = record(evidence[field]).quote;
    if (!statement || statement !== proposed[field] || typeof quote !== 'string' || !quote.trim()) continue;
    const matches = sourceMap.pages.flatMap(page => page.blocks.flatMap(block => {
      const start = block.text?.indexOf(quote) ?? -1;
      if (start < 0) return [];
      // A second occurrence must count as ambiguity, even if another block matches once.
      return block.text?.indexOf(quote, start + 1) === -1 ? [{ block, start }] : [{ block, start }, { block, start }];
    }));
    if (matches.length !== 1) continue;
    const { block, start } = matches[0]!;
    const locator = createBlockSourceLocator(sourceMap, block.id, { charRange: { start, end: start + quote.length } });
    const provenance = { source: 'deterministic', provider: 'ingestion-source-match', providerVersion: '1',
      inputHash: task.artifact.blobSha256, ingestionTaskId: task.id, field, sourceMapRef: { ...reference } };
    const claim = await deps.prisma.claimNode.create({ data: {
      researchObjectId: task.batch.researchObjectId, versionId: input.versionId,
      kind: field === 'method' ? 'method' : field === 'limitations' ? 'boundary' : 'core',
      statement, assessment: 'missing', extractionStatus: 'needs_review', provenance: provenance as Prisma.InputJsonValue,
    } });
    await deps.prisma.evidenceRecord.create({ data: {
      researchObjectId: task.batch.researchObjectId, versionId: input.versionId, workspaceId: task.artifact.workspaceId,
      claimId: claim.id, artifactId: task.artifactId, kind: 'passage', title: field, exactQuote: quote,
      relation: 'context', locator: locator as unknown as Prisma.InputJsonValue, contentHash: task.artifact.blobSha256,
      extractionStatus: 'needs_review', provenance: provenance as Prisma.InputJsonValue,
    } });
  }
}
