import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { IngestionDeps } from './ingestion-service';
import { SDF_NODE_TYPES } from '../research-object/types';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { createBlockSourceLocator, resolveSourceLocator } from '../research-intelligence/source-locator';
import { validateSourceLocator } from '../research-intelligence/validation';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function claimProvenance(value: unknown): Record<string, unknown> {
  const provenance = { ...record(value) };
  delete provenance.sourceMapRef;
  return provenance;
}

/** Carry the prior graph into a new version without rewriting its immutable source rows. */
export async function carryVersionEvidence(tx: Prisma.TransactionClient, input: { researchObjectId: string; previousVersionId: string; versionId: string }) {
  const [previous, target] = await Promise.all([
    tx.version.findUnique({ where: { id: input.previousVersionId } }),
    tx.version.findUnique({ where: { id: input.versionId } }),
  ]);
  if (!previous || !target || previous.id === target.id || previous.researchObjectId !== input.researchObjectId
    || target.researchObjectId !== input.researchObjectId) throw new Error('Research graph scope mismatch');
  // Share the predecessor row fence with graph edits before reading its working rows.
  await tx.version.update({ where: { id: previous.id }, data: { status: previous.status } });
  const where = { researchObjectId: input.researchObjectId, versionId: input.previousVersionId };
  const claims = await tx.claimNode.findMany({ where });
  const evidence = await tx.evidenceRecord.findMany({ where });
  const ids = new Map(claims.map(claim => [claim.id, randomUUID()]));
  // Insert parents first; source data already obeys the scoped parent foreign key.
  const pending = [...claims];
  const inserted = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex(claim => !claim.parentClaimId || inserted.has(claim.parentClaimId));
    if (index < 0) throw new Error('Existing Claim graph cannot be copied');
    const claim = pending.splice(index, 1)[0]!;
    await tx.claimNode.create({ data: {
      id: ids.get(claim.id)!, researchObjectId: input.researchObjectId, versionId: input.versionId,
      parentClaimId: claim.parentClaimId ? ids.get(claim.parentClaimId) : undefined,
      kind: claim.kind, statement: claim.statement, assessment: claim.assessment === 'supported' ? 'missing' : claim.assessment,
      conditions: claim.conditions, limitations: claim.limitations, extractionStatus: 'needs_review',
      provenance: { ...claimProvenance(claim.provenance), previousVersionId: input.previousVersionId, previousClaimId: claim.id } as Prisma.InputJsonValue,
    } });
    inserted.add(claim.id);
  }
  for (const item of evidence) await tx.evidenceRecord.create({ data: {
    researchObjectId: input.researchObjectId, versionId: input.versionId, workspaceId: item.workspaceId,
    claimId: ids.get(item.claimId)!, artifactId: item.artifactId, kind: item.kind, title: item.title,
    exactQuote: item.exactQuote, relation: item.relation, locator: item.locator as Prisma.InputJsonValue,
    contentHash: item.contentHash, extractionConfidence: item.extractionConfidence, extractionStatus: 'needs_review', verifiedByUserId: null,
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
    let locator: ReturnType<typeof createBlockSourceLocator>;
    if (Object.prototype.hasOwnProperty.call(result, 'evidenceLocation')) {
      // Canonical parser outcomes are authoritative. Unresolved or malformed
      // supplied metadata must never be upgraded by a narrower legacy rematch.
      const location = record(record(result.evidenceLocation)[field]);
      if (location.status !== 'located' || (location.origin !== 'model_quote' && location.origin !== 'explicit_field_label')
        || (location.matching !== 'exact' && location.matching !== 'whitespace')
        || Object.keys(location).sort().join(',') !== 'matching,origin,sourceLocator,status') continue;
      try {
        locator = validateSourceLocator(location.sourceLocator);
        const block = resolveSourceLocator(sourceMap, locator);
        if (!locator.charRange || block.text?.slice(locator.charRange.start, locator.charRange.end) !== quote) continue;
      } catch {
        continue;
      }
    } else {
      // Older results without canonical metadata retain conservative exact matching.
      const matches = sourceMap.pages.flatMap(page => page.blocks.flatMap(block => {
        const start = block.text?.indexOf(quote) ?? -1;
        if (start < 0) return [];
        // A second occurrence must count as ambiguity, even if another block matches once.
        return block.text?.indexOf(quote, start + 1) === -1 ? [{ block, start }] : [{ block, start }, { block, start }];
      }));
      if (matches.length !== 1) continue;
      const { block, start } = matches[0]!;
      locator = createBlockSourceLocator(sourceMap, block.id, { charRange: { start, end: start + quote.length } });
    }
    const provenance = { source: 'deterministic', provider: 'ingestion-source-match', providerVersion: '1',
      inputHash: task.artifact.blobSha256, ingestionTaskId: task.id, field };
    const claim = await deps.prisma.claimNode.create({ data: {
      researchObjectId: task.batch.researchObjectId, versionId: input.versionId,
      // Extraction fields do not establish parent relationships. Preserve the field in
      // provenance and use a valid root; users may classify it within a grounded graph.
      kind: 'core',
      statement, assessment: 'missing', extractionStatus: 'needs_review', provenance: provenance as Prisma.InputJsonValue,
    } });
    await deps.prisma.evidenceRecord.create({ data: {
      researchObjectId: task.batch.researchObjectId, versionId: input.versionId, workspaceId: task.artifact.workspaceId,
      claimId: claim.id, artifactId: task.artifactId, kind: 'passage', title: field, exactQuote: quote,
      relation: 'context', locator: locator as unknown as Prisma.InputJsonValue, contentHash: task.artifact.blobSha256,
      extractionStatus: 'needs_review', provenance: { ...provenance, sourceMapRef: { ...reference } } as Prisma.InputJsonValue,
    } });
  }
}
