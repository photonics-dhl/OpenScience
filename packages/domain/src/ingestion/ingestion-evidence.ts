import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { IngestionDeps } from './ingestion-service';
import { SDF_NODE_TYPES } from '../research-object/types';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { createBlockSourceLocator, resolveSourceLocator } from '../research-intelligence/source-locator';
import { validateSourceLocator } from '../research-intelligence/validation';
import { IngestionError } from './errors';
import { MAX_CANONICAL_EVIDENCE_CHARS, MAX_CANONICAL_EVIDENCE_SEGMENTS } from './canonical-evidence-contract';

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
  const [previous, target, previousManifest, targetManifest] = await Promise.all([
    tx.version.findUnique({ where: { id: input.previousVersionId } }),
    tx.version.findUnique({ where: { id: input.versionId } }),
    tx.versionManifest.findUnique({ where: { versionId: input.previousVersionId }, include: { entries: true } }),
    tx.versionManifest.findUnique({ where: { versionId: input.versionId }, include: { entries: true } }),
  ]);
  if (!previous || !target || previous.id === target.id || previous.researchObjectId !== input.researchObjectId
    || target.researchObjectId !== input.researchObjectId || !previousManifest || !targetManifest) {
    throw new Error('Research graph scope mismatch');
  }
  // Share the predecessor row fence with graph edits before reading its working rows.
  await tx.version.update({ where: { id: previous.id }, data: { status: previous.status } });
  const where = { researchObjectId: input.researchObjectId, versionId: input.previousVersionId };
  const claims = await tx.claimNode.findMany({ where });
  const evidence = await tx.evidenceRecord.findMany({ where });
  const previousCore = record(previousManifest.coreJson);
  const targetCore = record(targetManifest.coreJson);
  const changedFields = new Set(SDF_NODE_TYPES.filter(field => !isDeepStrictEqual(previousCore[field], targetCore[field])));
  const targetArtifacts = new Set(targetManifest.entries.map(entry => `${entry.artifactId}:${entry.blobSha256}`));
  const claimFields = new Map<string, typeof SDF_NODE_TYPES[number] | undefined>();
  for (const claim of claims) {
    const field = record(claim.provenance).field;
    claimFields.set(claim.id, typeof field === 'string' && SDF_NODE_TYPES.includes(field as typeof SDF_NODE_TYPES[number])
      ? field as typeof SDF_NODE_TYPES[number] : undefined);
  }
  const changedClaims = new Set(claims.filter(claim => {
    const field = claimFields.get(claim.id);
    return field ? changedFields.has(field) : false;
  }).map(claim => claim.id));
  const omittedClaims = new Set(claims.filter(claim => {
    const field = claimFields.get(claim.id);
    return field && changedFields.has(field) && !String(targetCore[field] ?? '').trim();
  }).map(claim => claim.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const claim of claims) {
      if (!omittedClaims.has(claim.id) && claim.parentClaimId && omittedClaims.has(claim.parentClaimId)) {
        omittedClaims.add(claim.id);
        changed = true;
      }
    }
  }
  const carriedClaims = claims.filter(claim => !omittedClaims.has(claim.id));
  const carriedClaimIds = new Set(carriedClaims.map(claim => claim.id));
  const carriedEvidence = evidence.filter(item => carriedClaimIds.has(item.claimId));
  const reviewClaims = new Set([
    ...changedClaims,
    ...carriedEvidence.filter(item => !targetArtifacts.has(`${item.artifactId}:${item.contentHash}`)).map(item => item.claimId),
  ]);
  for (let changed = true; changed;) {
    changed = false;
    for (const claim of carriedClaims) {
      if (!reviewClaims.has(claim.id) && claim.parentClaimId && reviewClaims.has(claim.parentClaimId)) {
        reviewClaims.add(claim.id);
        changed = true;
      }
    }
  }
  const invalidEvidence = new Set(carriedEvidence.filter(item => reviewClaims.has(item.claimId)).map(item => item.id));
  const ids = new Map(carriedClaims.map(claim => [claim.id, randomUUID()]));
  // Insert parents first; source data already obeys the scoped parent foreign key.
  const pending = [...carriedClaims];
  const inserted = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex(claim => !claim.parentClaimId || inserted.has(claim.parentClaimId));
    if (index < 0) throw new Error('Existing Claim graph cannot be copied');
    const claim = pending.splice(index, 1)[0]!;
    const provenance = claimProvenance(claim.provenance);
    const field = claimFields.get(claim.id);
    const fieldChanged = field ? changedFields.has(field) : false;
    const requiresReview = reviewClaims.has(claim.id);
    await tx.claimNode.create({ data: {
      id: ids.get(claim.id)!, researchObjectId: input.researchObjectId, versionId: input.versionId,
      parentClaimId: claim.parentClaimId ? ids.get(claim.parentClaimId) : undefined,
      kind: claim.kind, statement: fieldChanged ? String(targetCore[field!] ?? '') : claim.statement,
      assessment: requiresReview ? 'missing' : claim.assessment,
      conditions: claim.conditions, limitations: claim.limitations,
      extractionStatus: requiresReview ? 'needs_review' : claim.extractionStatus,
      provenance: { ...provenance, previousVersionId: input.previousVersionId, previousClaimId: claim.id } as Prisma.InputJsonValue,
    } });
    inserted.add(claim.id);
  }
  for (const item of carriedEvidence) {
    const sourceRemoved = invalidEvidence.has(item.id);
    await tx.evidenceRecord.create({ data: {
      researchObjectId: input.researchObjectId, versionId: input.versionId, workspaceId: item.workspaceId,
      claimId: ids.get(item.claimId)!, artifactId: item.artifactId, kind: item.kind, title: item.title,
      exactQuote: item.exactQuote, relation: item.relation, locator: item.locator as Prisma.InputJsonValue,
      contentHash: item.contentHash, extractionConfidence: item.extractionConfidence,
      extractionStatus: sourceRemoved ? 'needs_review' : item.extractionStatus,
      verifiedByUserId: sourceRemoved ? null : item.verifiedByUserId,
      provenance: { ...record(item.provenance), previousVersionId: input.previousVersionId, previousEvidenceId: item.id } as Prisma.InputJsonValue,
    } });
  }
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
      if (values.length > MAX_CANONICAL_EVIDENCE_SEGMENTS) throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence exceeds the segment limit');
      const fieldSources: IngestionEvidenceSource[] = [];
      let total = 0;
      let previousPage = 0;
      let previousBlockOrdinal = -1;
      let previousBlockId: string | undefined;
      let previousRangeEnd = 0;
      for (const [index, value] of values.entries()) {
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
        const sameBlock = locator.blockId === previousBlockId;
        if (!locator.blockId || !locator.charRange || locator.artifactId !== task.artifactId
          || locator.contentHash !== task.artifact.blobSha256
          || (locator.page ?? 0) < previousPage
          || (sameBlock && (locator.page !== previousPage || locator.charRange.start < previousRangeEnd))
          || block.text?.slice(locator.charRange.start, locator.charRange.end) !== segment.quote) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence segment does not match its source');
        }
        const blockOrdinal = sourceMap.pages.find(page => page.page === locator.page)?.blocks
          .findIndex(candidate => candidate.id === locator.blockId) ?? -1;
        if (blockOrdinal < 0 || (locator.page === previousPage
          && (sameBlock ? blockOrdinal !== previousBlockOrdinal : blockOrdinal <= previousBlockOrdinal))) {
          throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence segments are out of source order');
        }
        total += segment.quote.length + (index > 0 ? 1 : 0);
        if (total > MAX_CANONICAL_EVIDENCE_CHARS) throw new IngestionError('VALIDATION_ERROR', 'Canonical ingestion evidence exceeds the quote limit');
        previousBlockId = locator.blockId;
        previousRangeEnd = locator.charRange.end;
        previousBlockOrdinal = blockOrdinal;
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
    const rewritten = statement !== proposed[field];
    const provenance = rewritten
      ? { source: 'human', provider: 'ingestion-confirmation', providerVersion: '1', inputHash: task.artifact.blobSha256,
          ingestionTaskId: task.id, field, revision: 'human', proposalSource: 'sdf.extract',
          proposalStatementSha256: createHash('sha256').update(String(proposed[field] ?? '')).digest('hex') }
      : { source: 'deterministic', provider: 'ingestion-source-match', providerVersion: '1',
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
      relation: 'context', locator: source.locator as unknown as Prisma.InputJsonValue, contentHash: task.artifact.blobSha256,
      extractionStatus: 'needs_review', verifiedByUserId: null,
      provenance: { ...provenance, segmentIndex, sourceMapRef: { ...reference! } } as Prisma.InputJsonValue,
    } });
  }
}
