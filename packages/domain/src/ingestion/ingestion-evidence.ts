import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { IngestionDeps } from './ingestion-service';
import { SDF_NODE_TYPES } from '../research-object/types';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { createBlockSourceLocator, resolveSourceLocator } from '../research-intelligence/source-locator';
import { validateSourceLocator } from '../research-intelligence/validation';
import { IngestionError } from './errors';

type IngestionEvidenceSource = {
  quote: string;
  locator: ReturnType<typeof validateSourceLocator>;
};

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
  const locations = record(result.evidenceLocation);
  const segmentBundle = result.evidenceSegments === undefined ? undefined : record(result.evidenceSegments);
  // Old imports may not have a source map. Keep Claims as explicit evidence gaps;
  // never invent a locator for them.
  let sourceMap;
  let reference;
  if (result.sourceMapRef) {
    try {
      reference = parseDocumentSourceMapReference(result.sourceMapRef);
      if (reference.artifactId !== task.artifactId || reference.contentHash !== task.artifact.blobSha256
        || reference.parserStatus !== 'succeeded') {
        throw new Error('Source map reference does not certify the ingestion artifact');
      }
      sourceMap = await loadDocumentSourceMapReference(deps.storage, reference);
    } catch (error) {
      // A persisted reference is a producer assertion. Corrupt source identity
      // must abort the transaction rather than silently discard rows.
      throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion source is invalid', error);
    }
  }

  const sourcesByField = new Map<string, IngestionEvidenceSource[]>();
  if (segmentBundle !== undefined) {
    if (!sourceMap || !reference || SDF_NODE_TYPES.some(field => !Array.isArray(segmentBundle[field]))) {
      throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence bundle is invalid');
    }
    const missingFields = Array.isArray(result.needsMoreInformation)
      ? new Set(result.needsMoreInformation) : null;
    if (!missingFields || missingFields.size !== (result.needsMoreInformation as unknown[]).length
      || [...missingFields].some(field => !SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number]))) {
      throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion missing-field bundle is invalid');
    }
    for (const field of SDF_NODE_TYPES) {
      const values = segmentBundle[field] as unknown[];
      if (values.length > 32) throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence exceeds the segment limit');
      const fieldSources: IngestionEvidenceSource[] = [];
      const blockIds = new Set<string>();
      let total = 0;
      let previousPage = 0;
      for (const value of values) {
        const segment = record(value);
        if (Object.keys(segment).sort().join(',') !== 'quote,sourceLocator' || typeof segment.quote !== 'string'
          || !segment.quote.length) throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence segment is invalid');
        let locator: ReturnType<typeof validateSourceLocator>;
        let block: ReturnType<typeof resolveSourceLocator>;
        try {
          locator = validateSourceLocator(segment.sourceLocator);
          block = resolveSourceLocator(sourceMap, locator);
        } catch (error) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence segment does not match its source', error);
        }
        if (!locator.blockId || !locator.charRange || locator.artifactId !== task.artifactId
          || locator.contentHash !== task.artifact.blobSha256 || blockIds.has(locator.blockId)
          || (locator.page ?? 0) < previousPage
          || block.text?.slice(locator.charRange.start, locator.charRange.end) !== segment.quote) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence segment does not match its source');
        }
        total += segment.quote.length;
        if (total > 8_000) throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence exceeds the quote limit');
        blockIds.add(locator.blockId);
        previousPage = locator.page ?? previousPage;
        fieldSources.push({ quote: segment.quote, locator });
      }
      const quote = record(evidence[field]).quote;
      const location = record(locations[field]);
      const statement = typeof proposed[field] === 'string' ? proposed[field].trim() : '';
      const locationKeys = Object.keys(location).sort().join(',');
      const validLocation = fieldSources.length === 0
        ? locationKeys === 'origin,reason,status' && location.status === 'missing'
          && location.origin === 'model_quote' && location.reason === 'empty-quote'
        : fieldSources.length === 1
          ? locationKeys === 'matching,origin,sourceLocator,status' && location.status === 'located'
            && location.origin === 'model_quote' && location.matching === 'exact'
          : locationKeys === 'matching,origin,reason,status' && location.status === 'cross_block'
            && location.origin === 'model_quote' && location.matching === 'exact'
            && location.reason === 'match-spans-blocks';
      if (quote !== fieldSources.map(source => source.quote).join('\n')
        || missingFields.has(field) !== (fieldSources.length === 0)
        || missingFields.has(field) !== !statement
        || !validLocation) {
        throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence bundle is inconsistent');
      }
      if (fieldSources.length === 1) {
        let supplied: ReturnType<typeof validateSourceLocator>;
        try {
          supplied = validateSourceLocator(location.sourceLocator);
        } catch (error) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence locator is invalid', error);
        }
        if (!isDeepStrictEqual(supplied, fieldSources[0]!.locator)) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence locator is inconsistent');
        }
      }
      sourcesByField.set(field, fieldSources);
    }
  }

  for (const field of SDF_NODE_TYPES) {
    const statement = input.core[field]?.trim();
    const quote = record(evidence[field]).quote;
    if (!statement) continue;
    let sources: IngestionEvidenceSource[] = [];
    if (statement === proposed[field] && segmentBundle !== undefined) {
      sources = sourcesByField.get(field) ?? [];
    } else if (statement === proposed[field] && sourceMap && reference && typeof quote === 'string' && quote.trim()
      && Object.prototype.hasOwnProperty.call(result, 'evidenceLocation')) {
      // Canonical parser outcomes are authoritative. Unresolved or malformed
      // supplied metadata must never be upgraded by a narrower legacy rematch.
      const location = record(locations[field]);
      if (location.status === 'located') {
        if ((location.origin !== 'model_quote' && location.origin !== 'explicit_field_label')
          || (location.matching !== 'exact' && location.matching !== 'whitespace')
          || Object.keys(location).sort().join(',') !== 'matching,origin,sourceLocator,status') {
          throw new Error('Canonical ingestion evidence location is malformed');
        }
        let locator: ReturnType<typeof validateSourceLocator>;
        let block: ReturnType<typeof resolveSourceLocator>;
        try {
          locator = validateSourceLocator(location.sourceLocator);
          block = resolveSourceLocator(sourceMap, locator);
        } catch (error) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence location does not match its source', error);
        }
        if (!locator.charRange || block.text?.slice(locator.charRange.start, locator.charRange.end) !== quote) {
          throw new Error('Canonical ingestion evidence quote does not match its source');
        }
        sources = [{ quote, locator }];
      }
    } else if (statement === proposed[field] && sourceMap && reference && typeof quote === 'string' && quote.trim()
      && !Object.prototype.hasOwnProperty.call(result, 'evidenceLocation')) {
      // Older results without canonical metadata retain conservative exact matching.
      const matches = sourceMap.pages.flatMap(page => page.blocks.flatMap(block => {
        const start = block.text?.indexOf(quote) ?? -1;
        if (start < 0) return [];
        // A second occurrence must count as ambiguity, even if another block matches once.
        return block.text?.indexOf(quote, start + 1) === -1 ? [{ block, start }] : [{ block, start }, { block, start }];
      }));
      if (matches.length === 1) {
        const { block, start } = matches[0]!;
        sources = [{ quote, locator: createBlockSourceLocator(sourceMap, block.id, { charRange: { start, end: start + quote.length } }) }];
      }
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
    for (const [segmentIndex, source] of sources.entries()) await deps.prisma.evidenceRecord.create({ data: {
      researchObjectId: task.batch.researchObjectId, versionId: input.versionId, workspaceId: task.artifact.workspaceId,
      claimId: claim.id, artifactId: task.artifactId, kind: 'passage', title: field, exactQuote: source.quote,
      relation: 'supports', locator: source.locator as unknown as Prisma.InputJsonValue, contentHash: task.artifact.blobSha256,
      extractionStatus: 'needs_review', verifiedByUserId: null,
      provenance: { ...provenance, segmentIndex, sourceMapRef: { ...reference! } } as Prisma.InputJsonValue,
    } });
  }
}
