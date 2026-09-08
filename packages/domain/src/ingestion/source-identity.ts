import { createHash } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { SourceLocator } from '../research-intelligence/types';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { resolveSourceLocator } from '../research-intelligence/source-locator';
import { validateSourceLocator } from '../research-intelligence/validation';
import { IngestionError } from './errors';

export const SOURCE_IDENTITY_FIELDS = ['title', 'authors', 'doi', 'articleLicense'] as const;
export type SourceIdentityField = typeof SOURCE_IDENTITY_FIELDS[number];
export type SourceIdentityProposalState = 'proposed' | 'needs_review' | 'not_extracted';
export type SourceIdentitySnapshotState = 'recorded' | 'needs_review' | 'not_recorded';
export type SourceIdentityValue = string | string[];
export type SourceIdentitySegment = { quote: string; sourceLocator: SourceLocator };
export type SourceIdentityProposalItem = { state: SourceIdentityProposalState; value: SourceIdentityValue; evidenceSegments: SourceIdentitySegment[] };
export type SourceIdentityProposal = { schemaVersion: '0.1.0' } & Record<SourceIdentityField, SourceIdentityProposalItem>;
export type SourceIdentitySnapshotItem = { state: SourceIdentitySnapshotState; value: SourceIdentityValue; evidenceSegments: SourceIdentitySegment[] };
export type SourceIdentitySnapshot = { schemaVersion: '0.1.0'; reviewed: true } & Record<SourceIdentityField, SourceIdentitySnapshotItem>;
export type SourceIdentityReview = { token: string; acceptedFields: SourceIdentityField[] };

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => [key, canonical(nested)]));
}

function fail(message: string, cause?: unknown): never {
  throw new IngestionError('VALIDATION_ERROR', message, cause);
}

function parseValue(field: SourceIdentityField, value: unknown, state: SourceIdentityProposalState): SourceIdentityValue {
  if (field === 'authors') {
    if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 300)) {
      fail('Source author proposal is invalid');
    }
    if (state === 'proposed' && value.length === 0) fail('Proposed source authors cannot be empty');
    if (state === 'not_extracted' && value.length !== 0) fail('Unextracted source authors must be empty');
    return [...value] as string[];
  }
  const limit = field === 'title' ? 1_000 : field === 'doi' ? 300 : 80;
  if (typeof value !== 'string' || value.length > limit) fail(`Source ${field} proposal is invalid`);
  if (state === 'proposed' && !value.trim()) fail(`Proposed source ${field} cannot be empty`);
  if (state === 'not_extracted' && value !== '') fail(`Unextracted source ${field} must be empty`);
  if (field === 'doi' && value && !/^10\.\d{4,9}\/\S+$/i.test(value)) fail('Source DOI proposal is invalid');
  if (field === 'articleLicense' && value && !/^[A-Za-z0-9][A-Za-z0-9.-]{0,79}$/.test(value)) fail('Source article license proposal is invalid');
  return value;
}

export function parseSourceIdentityProposal(value: unknown, identity: { artifactId: string; contentHash: string }): SourceIdentityProposal {
  const source = record(value);
  if (source.schemaVersion !== '0.1.0' || Object.keys(source).sort().join(',') !== 'articleLicense,authors,doi,schemaVersion,title') {
    fail('Source identity proposal is invalid');
  }
  const parsed = { schemaVersion: '0.1.0' } as SourceIdentityProposal;
  for (const field of SOURCE_IDENTITY_FIELDS) {
    const item = record(source[field]);
    if (Object.keys(item).sort().join(',') !== 'evidenceSegments,state,value'
      || !['proposed', 'needs_review', 'not_extracted'].includes(String(item.state)) || !Array.isArray(item.evidenceSegments)
      || item.evidenceSegments.length > 32) fail(`Source identity ${field} proposal is invalid`);
    const state = item.state as SourceIdentityProposalState;
    let quotedLength = 0;
    const segments = item.evidenceSegments.map((candidate): SourceIdentitySegment => {
      const segment = record(candidate);
      if (Object.keys(segment).sort().join(',') !== 'quote,sourceLocator' || typeof segment.quote !== 'string'
        || !segment.quote || segment.quote.length > 8_000) fail(`Source identity ${field} evidence is invalid`);
      let sourceLocator: SourceLocator;
      try { sourceLocator = validateSourceLocator(segment.sourceLocator); }
      catch (error) { fail(`Source identity ${field} locator is invalid`, error); }
      quotedLength += segment.quote.length;
      if (quotedLength > 8_000) fail(`Source identity ${field} evidence is too long`);
      if (sourceLocator.artifactId !== identity.artifactId || sourceLocator.contentHash !== identity.contentHash
        || !sourceLocator.page || !sourceLocator.blockId || !sourceLocator.boundingBox || !sourceLocator.charRange) fail(`Source identity ${field} source does not match the artifact`);
      return { quote: segment.quote, sourceLocator };
    });
    if (state === 'proposed' && segments.length === 0) fail(`Proposed source identity ${field} requires evidence`);
    if (state === 'not_extracted' && segments.length !== 0) fail(`Unextracted source identity ${field} cannot contain evidence`);
    parsed[field] = { state, value: parseValue(field, item.value, state), evidenceSegments: segments };
  }
  return parsed;
}

export function sourceIdentityToken(input: {
  taskId: string; artifactId: string; contentHash: string; sourceMapRef: unknown; sourceIdentity: SourceIdentityProposal;
}): string {
  let reference: ReturnType<typeof parseDocumentSourceMapReference>;
  try { reference = parseDocumentSourceMapReference(input.sourceMapRef); }
  catch (error) { fail('Source identity source reference is unavailable', error); }
  if (reference.artifactId !== input.artifactId || reference.contentHash !== input.contentHash) fail('Source identity reference does not match the artifact');
  const resultDigest = createHash('sha256').update(JSON.stringify(canonical(input.sourceIdentity))).digest('hex');
  return createHash('sha256').update(JSON.stringify(canonical({
    taskId: input.taskId, artifactId: input.artifactId, contentHash: input.contentHash,
    sourceMapSha256: reference.serializedSha256, resultDigest,
  }))).digest('hex');
}

export function projectSourceIdentity(input: {
  taskId: string; artifactId: string; contentHash: string; result: unknown;
}): { sourceIdentity: SourceIdentityProposal; sourceIdentityToken: string } | null {
  const result = record(input.result);
  if (result.sourceIdentity === undefined) return null;
  const sourceIdentity = parseSourceIdentityProposal(result.sourceIdentity, input);
  return { sourceIdentity, sourceIdentityToken: sourceIdentityToken({ ...input, sourceMapRef: result.sourceMapRef, sourceIdentity }) };
}

export async function confirmSourceIdentity(input: {
  storage: StorageAdapter; taskId: string; artifactId: string; contentHash: string; result: unknown; review?: SourceIdentityReview;
}): Promise<SourceIdentitySnapshot | undefined> {
  const projected = projectSourceIdentity(input);
  if (!projected) {
    if (input.review) fail('Source identity review is unavailable');
    return undefined;
  }
  if (!input.review) fail('Source identity proposal must be reviewed before confirmation');
  const acceptedFields = input.review?.acceptedFields ?? [];
  if (new Set(acceptedFields).size !== acceptedFields.length || acceptedFields.some(field => !SOURCE_IDENTITY_FIELDS.includes(field))) {
    fail('Source identity review selection is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(input.review.token) || input.review.token !== projected.sourceIdentityToken) {
    fail('Source identity proposal changed; review it again');
  }
  const result = record(input.result);
  let reference: ReturnType<typeof parseDocumentSourceMapReference>;
  try { reference = parseDocumentSourceMapReference(result.sourceMapRef); }
  catch (error) { fail('Source identity source reference is unavailable', error); }
  if (reference.parserStatus !== 'succeeded') fail('Source identity source still requires review');
  let sourceMap: Awaited<ReturnType<typeof loadDocumentSourceMapReference>> | null = null;
  if (acceptedFields.length) {
    try { sourceMap = await loadDocumentSourceMapReference(input.storage, reference); }
    catch (error) { fail('Source identity source map is unavailable', error); }
  }
  const snapshot = { schemaVersion: '0.1.0', reviewed: true } as SourceIdentitySnapshot;
  for (const field of SOURCE_IDENTITY_FIELDS) {
    const proposal = projected.sourceIdentity[field];
    const accepted = acceptedFields.includes(field);
    if (accepted && proposal.state !== 'proposed') fail(`Source identity ${field} cannot be accepted`);
    if (accepted) {
      let previousPage = 0;
      let previousOrdinal = -1;
      for (const segment of proposal.evidenceSegments) {
        let block: ReturnType<typeof resolveSourceLocator>;
        try { block = resolveSourceLocator(sourceMap!, segment.sourceLocator); }
        catch (error) { fail(`Source identity ${field} evidence cannot be located`, error); }
        if (block.text?.slice(segment.sourceLocator.charRange!.start, segment.sourceLocator.charRange!.end) !== segment.quote) {
          fail(`Source identity ${field} evidence does not match the source`);
        }
        const ordinal = sourceMap!.pages.find(page => page.page === segment.sourceLocator.page)?.blocks.findIndex(row => row.id === segment.sourceLocator.blockId) ?? -1;
        if (ordinal < 0 || (segment.sourceLocator.page! < previousPage)
          || (segment.sourceLocator.page === previousPage && ordinal <= previousOrdinal)) fail(`Source identity ${field} evidence is out of source order`);
        previousPage = segment.sourceLocator.page!;
        previousOrdinal = ordinal;
      }
    }
    snapshot[field] = {
      state: accepted ? 'recorded' : proposal.state === 'not_extracted' ? 'not_recorded' : 'needs_review',
      value: proposal.value,
      evidenceSegments: proposal.evidenceSegments,
    };
  }
  return snapshot;
}

export function parseSourceIdentitySnapshot(value: unknown): SourceIdentitySnapshot | undefined {
  const source = record(value);
  if (source.schemaVersion !== '0.1.0' || source.reviewed !== true
    || Object.keys(source).sort().join(',') !== 'articleLicense,authors,doi,reviewed,schemaVersion,title') return undefined;
  try {
    const parsed = { schemaVersion: '0.1.0', reviewed: true } as SourceIdentitySnapshot;
    for (const field of SOURCE_IDENTITY_FIELDS) {
      const item = record(source[field]);
      if (Object.keys(item).sort().join(',') !== 'evidenceSegments,state,value'
        || !['recorded', 'needs_review', 'not_recorded'].includes(String(item.state)) || !Array.isArray(item.evidenceSegments)
        || item.evidenceSegments.length > 32) return undefined;
      const state = item.state as SourceIdentitySnapshotState;
      const proposalState: SourceIdentityProposalState = state === 'recorded' ? 'proposed' : state === 'not_recorded' ? 'not_extracted' : 'needs_review';
      const parsedValue = parseValue(field, item.value, proposalState);
      let quotedLength = 0;
      const evidenceSegments = item.evidenceSegments.map((candidate): SourceIdentitySegment => {
        const segment = record(candidate);
        if (Object.keys(segment).sort().join(',') !== 'quote,sourceLocator' || typeof segment.quote !== 'string'
          || !segment.quote || segment.quote.length > 8_000) throw new Error('invalid segment');
        quotedLength += segment.quote.length;
        if (quotedLength > 8_000) throw new Error('segments too long');
        const sourceLocator = validateSourceLocator(segment.sourceLocator);
        if (!sourceLocator.page || !sourceLocator.blockId || !sourceLocator.boundingBox || !sourceLocator.charRange) throw new Error('incomplete locator');
        return { quote: segment.quote, sourceLocator };
      });
      if (state === 'recorded' && evidenceSegments.length === 0) return undefined;
      if (state === 'not_recorded' && evidenceSegments.length !== 0) return undefined;
      parsed[field] = { state, value: parsedValue, evidenceSegments };
    }
    return parsed;
  } catch { return undefined; }
}
