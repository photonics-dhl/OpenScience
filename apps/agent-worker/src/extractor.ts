import { AiGatewayError, type AiGateway, type SchemaGuard } from '@openscience/ai-gateway';
import {
  createBlockSourceLocator,
  parseDocumentSourceMap,
  resolveSourceLocator,
  validateSourceLocator,
  type DocumentSourceMap,
  type SourceLocator,
} from '@openscience/domain';
import { SDF_CORE_FIELDS, SDF_CORE_VERSION } from '@openscience/sdf-schema';
import { RESEARCH_UNDERSTANDING_SKILL } from './skills/research-understanding.js';

/** 六字段 core 结构（§5.1：schemaVersion + 6 字段，全部 string）。 */
export interface ExtractedCore {
  schemaVersion: string;
  problem: string;
  insight: string;
  method: string;
  results: string;
  limitations: string;
  reproducibility: string;
}

interface ExtractedFieldProposal {
  summary: string;
  sourceQuote: string;
  sourceBlockIds?: string[];
  sourceWindowId?: string;
  sourcePassageIds?: string[];
  sourceRange?: EvidenceMatch;
  verifiedSegments?: Array<{ quote: string; sourceLocator: SourceLocator }>;
  sourceLocator?: string;
  needsMoreInformation: boolean;
}

interface ExtractedProposal {
  schemaVersion: string;
  fields: Record<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>;
}

export interface ExtractionResult extends Record<string, unknown> {
  core: ExtractedCore;
  evidence: Record<(typeof SDF_CORE_FIELDS)[number], { quote: string; locator: string }>;
  needsMoreInformation: Array<(typeof SDF_CORE_FIELDS)[number]>;
  /** Present only when trusted canonical parser context was supplied outside the user payload. */
  evidenceLocation?: Record<(typeof SDF_CORE_FIELDS)[number], EvidenceLocation>;
  /** Exact canonical block segments selected by the model and materialized by the worker. */
  evidenceSegments?: Record<(typeof SDF_CORE_FIELDS)[number], Array<{ quote: string; sourceLocator: SourceLocator }>>;
  /** Present only when structured retries exhausted after retaining at least one supported canonical field. */
  reason?: 'canonical_partial_validation_exhausted';
  /** Exact final guard reasons for unresolved fields; explicitly missing fields are omitted. */
  fieldDiagnostics?: Record<string, string>;
  /** Numeric validation context for unresolved fields; never contains source text. */
  fieldDiagnosticsDetails?: Record<string, string>;
  /** Read-only drafts whose source binding failed; never canonical core or evidence. */
  unverifiedSummaries?: Record<string, string>;
  /** Bounded, known canonical passage IDs from failed fields; never canonical evidence. */
  unverifiedSourcePassageIds?: Record<string, string[]>;
  /** Server-owned canonical selection contract used to prevent obsolete paid repair loops. */
  canonicalExtractionContract?: 'windowed-source-v2' | 'exact-quote-v1' | 'grounded-summary-v1' | 'grounded-passages-v1' | 'grounded-passages-v2';
}

export type EvidenceLocation = {
  status: 'located';
  sourceLocator: SourceLocator;
  origin: 'model_quote' | 'explicit_field_label';
  matching: 'exact' | 'whitespace';
} | {
  status: 'ambiguous' | 'cross_block' | 'missing';
  origin: 'model_quote' | 'explicit_field_label';
  matching?: 'exact' | 'whitespace';
  reason: 'empty-quote' | 'multiple-matches' | 'match-spans-blocks' | 'no-match' | 'locator-roundtrip-failed';
};

/**
 * SDF core 类型守卫（§9.3 JSON 输出必须经 Schema 校验；对齐 sdf-schema JSON Schema §5.1/§5.3）。
 */
export const sdfCoreGuard: SchemaGuard<ExtractedCore> = (v: unknown): v is ExtractedCore => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.schemaVersion !== SDF_CORE_VERSION) return false; // 对齐 coreSchema const（§5.3）
  for (const field of SDF_CORE_FIELDS) {
    if (typeof obj[field] !== 'string') return false;
  }
  return true;
};

const sdfProposalGuard: SchemaGuard<ExtractedProposal> = (value: unknown): value is ExtractedProposal => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proposal = value as Record<string, unknown>;
  if (proposal.schemaVersion !== SDF_CORE_VERSION || !proposal.fields || typeof proposal.fields !== 'object' || Array.isArray(proposal.fields)) return false;
  const fields = proposal.fields as Record<string, unknown>;
  for (const field of SDF_CORE_FIELDS) {
    const candidate = fields[field];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    if (typeof item.summary !== 'string' || typeof item.sourceQuote !== 'string' || typeof item.needsMoreInformation !== 'boolean') return false;
    if (!item.needsMoreInformation && (!item.summary.trim() || !item.sourceQuote.trim())) return false;
  }
  return true;
};

const KEY_EVIDENCE = /limitations?|constraints?|uncertaint|data availability|code availability|reproduc|materials? and methods?|experimental setup|results?|discussion|局限|限制|不确定|数据可用|代码可用|复现|方法|结果/gi;
const MAX_EXCERPT_CHARS = 24_000;
const MAX_EVIDENCE_SEGMENTS = 32;
const MAX_FIELD_EVIDENCE_CHARS = 8_000;
const MAX_CANONICAL_CORE_CHARS = 4_000;
const CANONICAL_EXTRACTION_CONTRACT = 'grounded-passages-v2';

/** Compatibility text for the existing SDF prompt, derived only from canonical parser output. */
export function sourceMapToManuscriptText(sourceMap: DocumentSourceMap): string {
  return sourceMap.pages
    .flatMap((page) => page.blocks.flatMap((block) => {
      const text = block.text?.trim();
      return text ? [text] : [];
    }))
    .join('\n');
}

export function selectManuscriptEvidence(manuscriptText: string): string {
  const text = manuscriptText.replace(/\r\n/g, '\n').trim();
  if (text.length <= MAX_EXCERPT_CHARS) return `--- SOURCE chars:0-${text.length} ---\n${text}`;

  const head = { start: 0, end: 8_000 };
  const tail = { start: text.length - 8_000, end: text.length };
  const keywordRanges: Array<{ start: number; end: number }> = [];
  KEY_EVIDENCE.lastIndex = 0;
  for (let match = KEY_EVIDENCE.exec(text); match && keywordRanges.length < 8; match = KEY_EVIDENCE.exec(text)) {
    // Already included evidence must not consume the middle-window allowance.
    if (match.index < head.end || match.index >= tail.start) continue;
    const previous = keywordRanges.at(-1);
    if (previous && match.index + match[0].length <= previous.end) continue;
    const start = Math.max(head.end, match.index - 1_200);
    const end = Math.min(tail.start, match.index + match[0].length + 1_800);
    if (end > start) keywordRanges.push({ start, end });
  }
  keywordRanges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of keywordRanges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }

  let remaining = 8_000;
  const excerpts = [`--- SOURCE chars:${head.start}-${head.end} ---\n${text.slice(head.start, head.end)}`];
  for (const range of merged) {
    if (remaining <= 0) break;
    const end = Math.min(range.end, range.start + remaining);
    excerpts.push(`--- SOURCE chars:${range.start}-${end} ---\n${text.slice(range.start, end)}`);
    remaining -= end - range.start;
  }
  excerpts.push(`--- SOURCE chars:${tail.start}-${tail.end} ---\n${text.slice(tail.start, tail.end)}`);
  return excerpts.join('\n\n');
}

type EvidenceMatch = { start: number; end: number; matching: 'exact' | 'whitespace' };

function findEvidenceMatches(source: string, proposedQuote: string): EvidenceMatch[] {
  const quote = proposedQuote.trim();
  if (!quote) return [];
  const matches: EvidenceMatch[] = [];
  for (let start = source.indexOf(quote); start >= 0; start = source.indexOf(quote, start + 1)) {
    matches.push({ start, end: start + quote.length, matching: 'exact' });
    // Two distinct ranges already prove ambiguity; never enumerate the rest.
    if (matches.length === 2) return matches;
  }

  let normalizedSource = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let whitespaceOpen = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      if (!whitespaceOpen) {
        normalizedSource += ' ';
        starts.push(index);
        ends.push(index + 1);
        whitespaceOpen = true;
      } else {
        ends[ends.length - 1] = index + 1;
      }
      continue;
    }
    whitespaceOpen = false;
    normalizedSource += character;
    starts.push(index);
    ends.push(index + 1);
  }
  const normalizedQuote = quote.replace(/\s+/g, ' ');
  for (let start = normalizedSource.indexOf(normalizedQuote); start >= 0; start = normalizedSource.indexOf(normalizedQuote, start + 1)) {
    const end = start + normalizedQuote.length - 1;
    const match: EvidenceMatch = { start: starts[start]!, end: ends[end]!, matching: 'whitespace' };
    if (!matches.some((existing) => existing.start === match.start && existing.end === match.end)) matches.push(match);
    if (matches.length === 2) return matches;
  }
  return matches;
}

/** Existing pure-text compatibility path. Canonical source-map evidence intentionally uses stricter matching above. */
function findLegacyEvidenceRange(source: string, proposedQuote: string): EvidenceMatch | null {
  const direct = findEvidenceMatches(source, proposedQuote)[0];
  if (direct) return direct;
  const quote = proposedQuote.trim();
  const tokenize = (input: string) => {
    const tokens: Array<{ text: string; start: number; end: number }> = [];
    let current: { text: string; start: number; end: number } | null = null;
    for (let index = 0; index < input.length;) {
      const codePoint = input.codePointAt(index);
      if (codePoint === undefined) break;
      const original = String.fromCodePoint(codePoint);
      const end = index + original.length;
      for (const character of original.normalize('NFKC').toLocaleLowerCase('en-US')) {
        if (/^[\p{L}\p{N}]$/u.test(character)) {
          if (!current) current = { text: '', start: index, end };
          current.text += character;
          current.end = end;
        } else if (current) {
          tokens.push(current);
          current = null;
        }
      }
      if (!/^[\p{L}\p{N}]+$/u.test(original.normalize('NFKC')) && current) {
        tokens.push(current);
        current = null;
      }
      index = end;
    }
    if (current) tokens.push(current);
    return tokens;
  };
  const sourceTokens = tokenize(source);
  const quoteTokens = tokenize(quote);
  if (quoteTokens.reduce((length, token) => length + token.text.length, 0) < 24 || quoteTokens.length === 0) return null;
  const matches: number[] = [];
  for (let start = 0; start <= sourceTokens.length - quoteTokens.length; start += 1) {
    if (quoteTokens.every((token, offset) => token.text === sourceTokens[start + offset].text)) matches.push(start);
    if (matches.length > 1) return null;
  }
  if (matches.length !== 1) return null;
  const first = sourceTokens[matches[0]]!;
  const last = sourceTokens[matches[0]! + quoteTokens.length - 1]!;
  return { start: first.start, end: last.end, matching: 'exact' };
}

const EXPLICIT_FIELD_LABELS: Record<(typeof SDF_CORE_FIELDS)[number], string> = {
  problem: 'Problem|问题',
  insight: 'Insight|洞见',
  method: 'Method|方法',
  results: 'Results?|结果',
  limitations: 'Limitations?|局限|限制',
  reproducibility: 'Reproducibility|可复现性|复现',
};

function findExplicitFieldEvidence(
  source: string,
  field: (typeof SDF_CORE_FIELDS)[number],
): { quote: string; start: number; end: number } | null {
  const match = new RegExp(`^(?:${EXPLICIT_FIELD_LABELS[field]})\\s*[:：]\\s*([^\\r\\n]+)$`, 'im').exec(source);
  if (!match?.[1]?.trim()) return null;
  const raw = match[1];
  const quote = raw.trim();
  const start = (match.index ?? 0) + match[0].indexOf(raw) + raw.indexOf(quote);
  return { quote, start, end: start + quote.length };
}

interface CanonicalTextBlock {
  id: string;
  text: string;
  textStart: number;
  textEnd: number;
  originalStart: number;
  page: number;
  boundingBox: SourceLocator['boundingBox'];
}

function canonicalTextBlocks(sourceMap: DocumentSourceMap): CanonicalTextBlock[] {
  const blocks: CanonicalTextBlock[] = [];
  let cursor = 0;
  for (const page of sourceMap.pages) {
    // Keep native blocks in the stored map. When a vision transcription exists,
    // use that canonical page representation without duplicating garbled native text.
    const visionBlocks = page.blocks.filter((block) => block.parser.name === 'llm_ocr_candidate' && block.text?.trim());
    for (const block of visionBlocks.length ? visionBlocks : page.blocks) {
      const text = block.text?.trim();
      if (!text) continue;
      if (blocks.length > 0) cursor += 1;
      const originalStart = block.text!.indexOf(text);
      blocks.push({
        id: block.id,
        text,
        textStart: cursor,
        textEnd: cursor + text.length,
        originalStart,
        page: page.page,
        boundingBox: block.boundingBox,
      });
      cursor += text.length;
    }
  }
  return blocks;
}

interface CanonicalPassageSlice {
  block: CanonicalTextBlock;
  start: number;
  end: number;
}

interface CanonicalPassage {
  id: string;
  pageStart: number;
  pageEnd: number;
  fragmented: boolean;
  blockCount: number;
  evidenceChars: number;
  text: string;
  slices: readonly CanonicalPassageSlice[];
}

const PASSAGE_TARGET_MIN_CHARS = 800;
const PASSAGE_MAX_CHARS = 1_200;
const MAX_PASSAGE_BLOCKS = 5;
const MAX_SOURCE_PASSAGE_IDS = MAX_EVIDENCE_SEGMENTS;
const USUAL_SOURCE_PASSAGE_IDS = 6;

function splitCanonicalBlock(block: CanonicalTextBlock): CanonicalPassageSlice[] {
  const result: CanonicalPassageSlice[] = [];
  let start = 0;
  while (start < block.text.length) {
    const maximum = Math.min(block.text.length, start + PASSAGE_MAX_CHARS);
    let end = maximum;
    if (maximum < block.text.length) {
      const minimum = Math.min(maximum, start + PASSAGE_TARGET_MIN_CHARS);
      const candidate = block.text.slice(minimum, maximum);
      const boundaries = [...candidate.matchAll(/[.!?。！？;；](?:\s|$)/gu)];
      const natural = boundaries.at(-1);
      if (natural?.index !== undefined) end = minimum + natural.index + natural[0].length;
      else {
        const whitespace = block.text.slice(minimum, maximum).search(/\s(?=\S)/u);
        if (whitespace >= 0) end = minimum + whitespace + 1;
      }
    }
    if (end <= start) end = maximum;
    result.push({ block, start, end });
    start = end;
  }
  return result;
}

function passageText(slices: readonly CanonicalPassageSlice[]): string {
  return slices.map((slice, index) => {
    const separator = index > 0 && slices[index - 1]!.block.id !== slice.block.id ? '\n' : '';
    return `${separator}${slice.block.text.slice(slice.start, slice.end)}`;
  }).join('');
}

function canonicalPassages(sourceMap: DocumentSourceMap): CanonicalPassage[] {
  const blocks = canonicalTextBlocks(sourceMap);
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0) + Math.max(0, blocks.length - 1);
  if (total > 120_000) throw new Error('[blocked] Paper exceeds the full-document understanding limit; split the document into research sections before analysis');
  const passages: CanonicalPassage[] = [];
  let pending: CanonicalPassageSlice[] = [];
  const flush = () => {
    if (!pending.length) return;
    const id = `P${String(passages.length + 1).padStart(5, '0')}`;
    passages.push(Object.freeze({
      id,
      pageStart: pending[0]!.block.page,
      pageEnd: pending.at(-1)!.block.page,
      fragmented: pending.some((slice) => slice.start > 0 || slice.end < slice.block.text.length),
      blockCount: new Set(pending.map((slice) => slice.block.id)).size,
      evidenceChars: passageText(pending).length,
      text: passageText(pending),
      slices: Object.freeze(pending.map((slice) => Object.freeze({ ...slice }))),
    }));
    pending = [];
  };
  for (const slice of blocks.flatMap(splitCanonicalBlock)) {
    const candidateSlices = [...pending, slice];
    const candidate = passageText(candidateSlices);
    const candidateBlockCount = new Set(candidateSlices.map((entry) => entry.block.id)).size;
    if (pending.length && (candidate.length > PASSAGE_MAX_CHARS || candidateBlockCount > MAX_PASSAGE_BLOCKS)) flush();
    pending.push(slice);
    if (passageText(pending).length >= PASSAGE_TARGET_MIN_CHARS
      || new Set(pending.map((entry) => entry.block.id)).size >= MAX_PASSAGE_BLOCKS) flush();
  }
  flush();
  return passages;
}

function canonicalPassagePrompt(passages: readonly CanonicalPassage[]): string {
  return passages.map((passage) => {
    const page = passage.pageStart === passage.pageEnd ? `${passage.pageStart}` : `${passage.pageStart}-${passage.pageEnd}`;
    return `[${passage.id} page:${page} blocks:${passage.blockCount} chars:${passage.evidenceChars}${passage.fragmented ? ' fragment:true' : ''}]\n${passage.text}\n[/${passage.id}]`;
  }).join('\n\n');
}

interface SelectedPassageRange {
  block: CanonicalTextBlock;
  start: number;
  end: number;
}

function selectedPassageRanges(
  passageIds: readonly string[],
  allowed: ReadonlyMap<string, CanonicalPassage>,
): SelectedPassageRange[] {
  const byBlock = new Map<string, SelectedPassageRange[]>();
  for (const id of passageIds) {
    const passage = allowed.get(id);
    if (!passage) throw new Error('unknown canonical passage');
    for (const slice of passage.slices) {
      const ranges = byBlock.get(slice.block.id) ?? [];
      ranges.push({ block: slice.block, start: slice.start, end: slice.end });
      byBlock.set(slice.block.id, ranges);
    }
  }
  const union: SelectedPassageRange[] = [];
  for (const ranges of byBlock.values()) {
    ranges.sort((left, right) => left.start - right.start || left.end - right.end);
    for (const range of ranges) {
      const previous = union.at(-1);
      if (previous?.block.id === range.block.id && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        union.push({ ...range });
      }
    }
  }
  return union.sort((left, right) => left.block.textStart - right.block.textStart || left.start - right.start);
}

function selectedPassageBudget(
  passageIds: readonly string[],
  allowed: ReadonlyMap<string, CanonicalPassage>,
): { segmentCount: number; evidenceChars: number } {
  const ranges = selectedPassageRanges(passageIds, allowed);
  return {
    segmentCount: ranges.length,
    evidenceChars: ranges.reduce((sum, range) => sum + range.end - range.start, 0)
      + Math.max(0, ranges.length - 1),
  };
}

function segmentsForPassages(
  sourceMap: DocumentSourceMap,
  passageIds: readonly string[],
  allowed: ReadonlyMap<string, CanonicalPassage>,
): Array<{ quote: string; sourceLocator: SourceLocator }> {
  const ordered = selectedPassageRanges(passageIds, allowed);
  if (!ordered.length || ordered.length > MAX_EVIDENCE_SEGMENTS) throw new Error('segment_count_1_to_32');
  return ordered.map(({ block, start, end }) => {
    const quote = block.text.slice(start, end);
    const sourceLocator = validateSourceLocator({
      artifactId: sourceMap.artifactId,
      contentHash: sourceMap.contentHash,
      blockId: block.id,
      page: block.page,
      boundingBox: block.boundingBox,
      charRange: { start: block.originalStart + start, end: block.originalStart + end },
    });
    const resolved = resolveSourceLocator(sourceMap, sourceLocator);
    const located = resolved.text?.slice(sourceLocator.charRange!.start, sourceLocator.charRange!.end);
    if (resolved.id !== block.id || located !== quote) throw new Error('canonical source locator round-trip failed');
    return { quote, sourceLocator };
  });
}

type CanonicalFieldValidationReason =
  | 'malformed_item'
  | 'missing_requires_empty'
  | 'summary_required'
  | 'passage_ids_required'
  | 'unknown_passage'
  | 'duplicate_passage'
  | 'locator_roundtrip_failed'
  | 'segment_count_1_to_32'
  | 'source_text_limit_8000'
  | 'core_text_limit_4000';

interface CanonicalRepairResponse {
  schemaVersion: string;
  fields: Record<string, unknown>;
}

interface CanonicalPartialResult {
  proposal: ExtractedProposal;
  fieldDiagnostics: Record<string, CanonicalFieldValidationReason>;
  fieldDiagnosticsDetails: Record<string, string>;
  unverifiedSummaries: Record<string, string>;
  unverifiedSourcePassageIds: Record<string, string[]>;
}

function canonicalProposalValidation(sourceMap: DocumentSourceMap, passages: readonly CanonicalPassage[]): {
  guard: SchemaGuard<CanonicalRepairResponse>;
  validationFeedback: () => string | undefined;
  validationDiagnostic: () => string | undefined;
  partialResult: () => CanonicalPartialResult | undefined;
  mergeRetained: () => ExtractedProposal;
} {
  const allowed = new Map(passages.map((passage) => [passage.id, passage]));
  const retained = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();
  const draftSummaries = new Map<(typeof SDF_CORE_FIELDS)[number], string>();
  const draftPassageIds = new Map<(typeof SDF_CORE_FIELDS)[number], string[]>();
  const draftFailures = new Map<(typeof SDF_CORE_FIELDS)[number], { reason: CanonicalFieldValidationReason; detail?: string }>();
  let expectedFields: Array<(typeof SDF_CORE_FIELDS)[number]> = [...SDF_CORE_FIELDS];
  let invalidFields = new Map<string, CanonicalFieldValidationReason>();
  let invalidDetails = new Map<string, string>();
  const validateField = (item: unknown): { candidate?: ExtractedFieldProposal; reason?: CanonicalFieldValidationReason; detail?: string } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { reason: 'malformed_item' };
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sourcePassageIds,summary'
      || typeof candidate.summary !== 'string' || typeof candidate.needsMoreInformation !== 'boolean'
      || !Array.isArray(candidate.sourcePassageIds)) return { reason: 'malformed_item' };
    if (candidate.needsMoreInformation) {
      return { candidate: { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true } };
    }
    if (!candidate.summary.trim()) return { reason: 'summary_required' };
    if (candidate.summary.length > MAX_CANONICAL_CORE_CHARS) return { reason: 'core_text_limit_4000' };
    const invalidIdType = candidate.sourcePassageIds.some((id) => typeof id !== 'string');
    if (candidate.sourcePassageIds.length < 1 || candidate.sourcePassageIds.length > MAX_SOURCE_PASSAGE_IDS
      || invalidIdType) return {
        reason: 'passage_ids_required',
        detail: `selectedIds=${candidate.sourcePassageIds.length};limit=${MAX_SOURCE_PASSAGE_IDS};invalidIdType=${invalidIdType}`,
      };
    const ids = candidate.sourcePassageIds as string[];
    if (new Set(ids).size !== ids.length) return { reason: 'duplicate_passage' };
    if (ids.some((id) => !allowed.has(id))) return { reason: 'unknown_passage' };
    const budget = selectedPassageBudget(ids, allowed);
    const detail = `selectedIds=${ids.length};expandedSegments=${budget.segmentCount};expandedChars=${budget.evidenceChars}`;
    if (budget.segmentCount > MAX_EVIDENCE_SEGMENTS) return { reason: 'segment_count_1_to_32', detail };
    if (budget.evidenceChars > MAX_FIELD_EVIDENCE_CHARS) return { reason: 'source_text_limit_8000', detail };
    let segments: Array<{ quote: string; sourceLocator: SourceLocator }>;
    try { segments = segmentsForPassages(sourceMap, ids, allowed); }
    catch (error) {
      return { reason: error instanceof Error && error.message === 'segment_count_1_to_32'
        ? 'segment_count_1_to_32' : 'locator_roundtrip_failed' };
    }
    const sourceQuote = segments.map((segment) => segment.quote).join('\n');
    if (sourceQuote.length > MAX_FIELD_EVIDENCE_CHARS) return { reason: 'source_text_limit_8000', detail };
    return { candidate: {
      summary: candidate.summary.trim(), sourceQuote, sourcePassageIds: [...ids],
      sourceBlockIds: segments.map((segment) => segment.sourceLocator.blockId!),
      verifiedSegments: segments, needsMoreInformation: false,
    } };
  };
  const guard: SchemaGuard<CanonicalRepairResponse> = (value: unknown): value is CanonicalRepairResponse => {
    invalidFields = new Map();
    invalidDetails = new Map();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      invalidFields.set('response', 'malformed_item');
      return false;
    }
    const proposal = value as Record<string, unknown>;
    if (proposal.schemaVersion !== SDF_CORE_VERSION || !proposal.fields || typeof proposal.fields !== 'object' || Array.isArray(proposal.fields)) {
      invalidFields.set('response', 'malformed_item');
      return false;
    }
    const fields = proposal.fields as Record<string, unknown>;
    const fieldsToValidate = [...expectedFields];
    if (Object.keys(fields).sort().join(',') !== fieldsToValidate.slice().sort().join(',')) {
      invalidFields.set('response', 'malformed_item');
      return false;
    }
    for (const field of fieldsToValidate) {
      const previous = retained.get(field);
      // Once a supported field has passed server-side passage materialization, schema
      // retries repair only unresolved fields and cannot replace that verified result.
      if (previous?.needsMoreInformation === false) continue;
      const validation = validateField(fields[field]);
      if (validation.candidate) {
        const previousFailure = draftFailures.get(field);
        if (validation.candidate.needsMoreInformation && draftSummaries.has(field) && previousFailure) {
          invalidFields.set(field, previousFailure.reason);
          if (previousFailure.detail) invalidDetails.set(field, previousFailure.detail);
          continue;
        }
        retained.set(field, validation.candidate);
        draftSummaries.delete(field);
        draftPassageIds.delete(field);
        draftFailures.delete(field);
      }
      else {
        const draft = fields[field];
        if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
          const item = draft as Record<string, unknown>;
          if (item.needsMoreInformation === false && typeof item.summary === 'string'
            && item.summary.trim() && item.summary.length <= MAX_CANONICAL_CORE_CHARS) {
            draftSummaries.set(field, item.summary.trim());
            draftFailures.set(field, { reason: validation.reason!, detail: validation.detail });
            const sourcePassageIds = Array.isArray(item.sourcePassageIds) ? item.sourcePassageIds : [];
            const knownPassageIds = sourcePassageIds.every((id): id is string => typeof id === 'string' && allowed.has(id))
              ? sourcePassageIds : undefined;
            if (knownPassageIds && knownPassageIds.length >= 1
              && knownPassageIds.length <= MAX_SOURCE_PASSAGE_IDS
              && new Set(knownPassageIds).size === knownPassageIds.length) {
              draftPassageIds.set(field, [...knownPassageIds]);
            } else {
              draftPassageIds.delete(field);
            }
          }
        }
        invalidFields.set(field, validation.reason!);
        if (validation.detail) invalidDetails.set(field, validation.detail);
      }
    }
    return invalidFields.size === 0;
  };
  return {
    guard,
    validationFeedback: () => {
      if (invalidFields.size === 0) return undefined;
      const nextExpectedFields = invalidFields.has('response') ? expectedFields : [...invalidFields.keys()].filter(
          (field): field is (typeof SDF_CORE_FIELDS)[number] => SDF_CORE_FIELDS.includes(field as (typeof SDF_CORE_FIELDS)[number]),
        );
      const priorSelections = nextExpectedFields.flatMap((field) => {
        const ids = draftPassageIds.get(field);
        return ids ? [`${field} priorSelection=${ids.join(',')}`] : [];
      });
      const rejected = priorSelections.length ? ` Rejected IDs: ${priorSelections.join('; ')}.` : '';
      const failure = [...invalidFields].map(([field, reason]) => `${field}:${reason}${invalidDetails.get(field) ? `(${invalidDetails.get(field)})` : ''}`).join(',');
      const shape = Object.fromEntries(nextExpectedFields.map((field) => [field, {
        summary: '', sourcePassageIds: [], needsMoreInformation: true,
      }]));
      const compactFeedback = `Repair only the failed canonical fields. Failure=${failure}.${rejected} Return exactly one JSON object shaped ${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: shape })}; fields must have exactly these keys: ${nextExpectedFields.join(',')}. Other fields already passed server validation and are retained. For each nonempty summary use needsMoreInformation=false and valid P labels. For source_text_limit_8000 or segment_count_1_to_32, remove nonessential claims first, then remove only passages no retained claim needs; never truncate source or leave a retained claim unsupported. Method may use dispersed key assumptions, steps and validation without every derivation. Reproducibility uses only directly disclosed parameters, materials, procedures, data/code availability and explicit access gaps. Expanded evidence must fit 32 segments and 8000 chars. If the smallest sufficient evidence cannot fit, return that field empty with needsMoreInformation=true; never call a capacity failure an author omission. Do not return quotes or commentary.`;
      const fallbackFeedback = `Repair only failed fields (${failure}). Return exactly schemaVersion and fields with these keys: ${nextExpectedFields.join(',')}; each field has exactly summary, sourcePassageIds, needsMoreInformation. Keep the smallest sufficient valid P-label set within 32 segments/8000 chars, but never drop evidence for a retained claim or truncate source. If sufficient evidence cannot fit, return that field empty with needsMoreInformation=true. Other fields are already retained. No quotes or commentary.`;
      expectedFields = nextExpectedFields;
      return compactFeedback.length <= 1_900 ? compactFeedback : fallbackFeedback;
    },
    validationDiagnostic: () => invalidFields.size === 0
      ? undefined : [...invalidFields].map(([field, reason]) => `${field}:${reason}`).join(','),
    partialResult: () => {
      if (!SDF_CORE_FIELDS.some((field) => retained.get(field)?.needsMoreInformation === false) && draftSummaries.size === 0) return undefined;
      const responseReason = invalidFields.get('response');
      const fieldDiagnostics: Record<string, CanonicalFieldValidationReason> = {};
      const fieldDiagnosticsDetails: Record<string, string> = {};
      const fields = Object.fromEntries(SDF_CORE_FIELDS.map((field) => {
        const candidate = retained.get(field);
        if (candidate && !invalidFields.has(field) && !responseReason) return [field, candidate];
        if (candidate?.needsMoreInformation === false) return [field, candidate];
        fieldDiagnostics[field] = invalidFields.get(field) ?? responseReason ?? 'malformed_item';
        const detail = invalidDetails.get(field) ?? invalidDetails.get('response');
        if (detail) fieldDiagnosticsDetails[field] = detail;
        return [field, { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true } satisfies ExtractedFieldProposal];
      })) as ExtractedProposal['fields'];
      return { proposal: { schemaVersion: SDF_CORE_VERSION, fields }, fieldDiagnostics, fieldDiagnosticsDetails,
        unverifiedSummaries: Object.fromEntries([...draftSummaries].filter(([field]) => Object.hasOwn(fieldDiagnostics, field))),
        unverifiedSourcePassageIds: Object.fromEntries([...draftPassageIds]
          .filter(([field]) => Object.hasOwn(fieldDiagnostics, field))) };
    },
    mergeRetained: () => ({
      schemaVersion: SDF_CORE_VERSION,
      fields: Object.fromEntries(SDF_CORE_FIELDS.map((field) => {
        const candidate = retained.get(field);
        if (!candidate) throw new Error(`Canonical field was not validated: ${field}`);
        return [field, candidate];
      })) as ExtractedProposal['fields'],
    }),
  };
}

async function repairCanonicalPartial(
  gateway: AiGateway,
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  partial: CanonicalPartialResult,
): Promise<CanonicalPartialResult> {
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const repairFields = SDF_CORE_FIELDS.filter((field) => partial.fieldDiagnostics[field]
    && partial.unverifiedSummaries[field]?.trim()
    && partial.unverifiedSourcePassageIds[field]?.length);
  if (!repairFields.length) return partial;
  const candidatesByField = new Map(repairFields.map((field) => [field, new Set(partial.unverifiedSourcePassageIds[field]!)]));
  const candidateIds = new Set(repairFields.flatMap((field) => partial.unverifiedSourcePassageIds[field]!));
  const candidatePassages = passages.filter((passage) => candidateIds.has(passage.id));
  const repaired = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();

  const selectEvidence = (claims: Array<{ text: string; supportSets: string[][] }>, allowedIds: Set<string>): ExtractedFieldProposal | undefined => {
    const summary = claims.map((claim) => claim.text.trim()).join('');
    if (!summary || summary.length > MAX_CANONICAL_CORE_CHARS) return undefined;
    let unions: Array<Set<string>> = [new Set()];
    for (const claim of claims) {
      const next = new Map<string, Set<string>>();
      for (const existing of unions) {
        for (const supportSet of claim.supportSets) {
          if (!supportSet.length || supportSet.some((id) => !allowedIds.has(id))) continue;
          const union = new Set([...existing, ...supportSet]);
          if (union.size > MAX_SOURCE_PASSAGE_IDS) continue;
          const ids = passages.filter((passage) => union.has(passage.id)).map((passage) => passage.id);
          const budget = selectedPassageBudget(ids, passageById);
          if (budget.segmentCount <= MAX_EVIDENCE_SEGMENTS && budget.evidenceChars <= MAX_FIELD_EVIDENCE_CHARS) {
            next.set(ids.join(','), union);
          }
        }
      }
      unions = [...next.values()];
      if (!unions.length) return undefined;
    }
    const choices = unions.map((union) => {
      const ids = passages.filter((passage) => union.has(passage.id)).map((passage) => passage.id);
      return { ids, budget: selectedPassageBudget(ids, passageById) };
    }).sort((left, right) => left.budget.evidenceChars - right.budget.evidenceChars
      || left.budget.segmentCount - right.budget.segmentCount || left.ids.length - right.ids.length);
    const sourcePassageIds = choices[0]!.ids;
    let verifiedSegments: Array<{ quote: string; sourceLocator: SourceLocator }>;
    try { verifiedSegments = segmentsForPassages(sourceMap, sourcePassageIds, passageById); }
    catch { return undefined; }
    return {
      summary,
      sourceQuote: verifiedSegments.map((segment) => segment.quote).join('\n'),
      sourcePassageIds,
      sourceBlockIds: verifiedSegments.map((segment) => segment.sourceLocator.blockId!),
      verifiedSegments,
      needsMoreInformation: false,
    };
  };

  const guard: SchemaGuard<CanonicalRepairResponse> = (value: unknown): value is CanonicalRepairResponse => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const response = value as Record<string, unknown>;
    if (Object.keys(response).sort().join(',') !== 'fields,schemaVersion' || response.schemaVersion !== SDF_CORE_VERSION
      || !response.fields || typeof response.fields !== 'object' || Array.isArray(response.fields)) return false;
    const fields = response.fields as Record<string, unknown>;
    if (Object.keys(fields).sort().join(',') !== repairFields.slice().sort().join(',')) return false;
    for (const field of repairFields) {
      const item = fields[field];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const candidate = item as Record<string, unknown>;
      if (Object.keys(candidate).sort().join(',') !== 'claims,needsMoreInformation'
        || typeof candidate.needsMoreInformation !== 'boolean' || !Array.isArray(candidate.claims)) continue;
      if (candidate.needsMoreInformation) {
        if (candidate.claims.length === 0) repaired.set(field, {
          summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true,
        });
        continue;
      }
      if (candidate.claims.length < 1 || candidate.claims.length > 8) continue;
      const claims: Array<{ text: string; supportSets: string[][] }> = [];
      let valid = true;
      for (const claimValue of candidate.claims) {
        if (!claimValue || typeof claimValue !== 'object' || Array.isArray(claimValue)) { valid = false; break; }
        const claim = claimValue as Record<string, unknown>;
        if (Object.keys(claim).sort().join(',') !== 'supportSets,text' || typeof claim.text !== 'string'
          || !claim.text.trim() || claim.text.length > 800 || !/[。；！？.!?]$/u.test(claim.text.trim())
          || !Array.isArray(claim.supportSets) || claim.supportSets.length < 1 || claim.supportSets.length > 3) { valid = false; break; }
        const supportSets: string[][] = [];
        for (const supportValue of claim.supportSets) {
          if (!Array.isArray(supportValue) || supportValue.length < 1 || supportValue.length > MAX_SOURCE_PASSAGE_IDS
            || supportValue.some((id) => typeof id !== 'string') || new Set(supportValue).size !== supportValue.length) { valid = false; break; }
          supportSets.push(supportValue as string[]);
        }
        if (!valid) break;
        claims.push({ text: claim.text.trim(), supportSets });
      }
      if (!valid) continue;
      const proposal = selectEvidence(claims, candidatesByField.get(field)!);
      if (proposal) repaired.set(field, proposal);
    }
    return true;
  };

  const supportedContext = Object.fromEntries(SDF_CORE_FIELDS.flatMap((field) => {
    const candidate = partial.proposal.fields[field];
    return candidate.needsMoreInformation ? [] : [[field, candidate.summary]];
  }));
  try {
    await gateway.completeStructured(guard, [{ role: 'system', content: [
      '你是Hermes科研证据修订器。只修复先前因证据容量失败的字段；候选原文来自同一已验证SourceMap。科学取舍由你完成，程序仅核对来源身份、主张覆盖组合和预算。',
      '每个claims条目是一句完整主张，text必须以标点结束；supportSets列出1到3个可独立充分支持该主张的P编号组合。组合内来源共同支持，组合之间可替代。不得把诊断摘要当作真值，允许据原文纠错和去重。',
      '保留字段的关键假设、步骤、条件与验证；不得为预算删掉核心主张。若候选不足、矛盾未解或任何核心主张没有充分来源，返回claims=[]且needsMoreInformation=true。不得把容量或技术失败写成作者未报告。只输出JSON。',
      `输出schemaVersion="${SDF_CORE_VERSION}"，fields必须且只能包含${repairFields.join(',')}。每字段只能包含claims与needsMoreInformation。`,
    ].join(' ') }, { role: 'user', content: [
      `已验证字段只读语境：${JSON.stringify(supportedContext)}`,
      `待修订诊断摘要（未验证）：${JSON.stringify(Object.fromEntries(repairFields.map((field) => [field, partial.unverifiedSummaries[field]])))}`,
      `此前失败与实算预算：${JSON.stringify(Object.fromEntries(repairFields.map((field) => [field, {
        reason: partial.fieldDiagnostics[field], detail: partial.fieldDiagnosticsDetails[field] ?? '',
      }])))}`,
      canonicalPassagePrompt(candidatePassages),
    ].join('\n\n') }], { temperature: 0.1, maxRetries: 0 });
  } catch { return partial; }
  if (!repaired.size) return partial;
  for (const [field, candidate] of repaired) {
    partial.proposal.fields[field] = candidate;
    delete partial.fieldDiagnostics[field];
    delete partial.fieldDiagnosticsDetails[field];
    delete partial.unverifiedSummaries[field];
    delete partial.unverifiedSourcePassageIds[field];
  }
  return partial;
}

function materializeCanonicalProposal(proposal: ExtractedProposal): ExtractionResult {
  const core = { schemaVersion: SDF_CORE_VERSION } as ExtractedCore;
  const evidence = {} as ExtractionResult['evidence'];
  const evidenceLocation = {} as NonNullable<ExtractionResult['evidenceLocation']>;
  const evidenceSegments = {} as NonNullable<ExtractionResult['evidenceSegments']>;
  const needsMoreInformation: ExtractionResult['needsMoreInformation'] = [];
  for (const field of SDF_CORE_FIELDS) {
    const candidate = proposal.fields[field];
    const ids = candidate.sourcePassageIds ?? [];
    if (candidate.needsMoreInformation) {
      core[field] = '';
      evidence[field] = { quote: '', locator: '' };
      evidenceSegments[field] = [];
      evidenceLocation[field] = { status: 'missing', origin: 'model_quote', reason: 'empty-quote' };
      needsMoreInformation.push(field);
      continue;
    }
    const segments = candidate.verifiedSegments;
    if (!segments?.length) throw new Error('verified canonical evidence is missing');
    const quote = segments.map((segment) => segment.quote).join('\n');
    if (quote !== candidate.sourceQuote) throw new Error('canonical source materialization changed');
    core[field] = candidate.summary;
    evidence[field] = { quote, locator: `passages:${ids.join(',')}` };
    evidenceSegments[field] = segments;
    evidenceLocation[field] = segments.length === 1
      ? { status: 'located', sourceLocator: segments[0]!.sourceLocator, origin: 'model_quote', matching: 'exact' }
      : { status: 'cross_block', origin: 'model_quote', matching: 'exact', reason: 'match-spans-blocks' };
  }
  return { core, evidence, needsMoreInformation, evidenceLocation, evidenceSegments,
    understandingSkill: { id: RESEARCH_UNDERSTANDING_SKILL.id, version: RESEARCH_UNDERSTANDING_SKILL.version },
    canonicalExtractionContract: CANONICAL_EXTRACTION_CONTRACT };
}

function locateCanonicalEvidence(
  sourceMap: DocumentSourceMap,
  blocks: CanonicalTextBlock[],
  quote: string,
  origin: EvidenceLocation['origin'],
  manuscriptText: string,
  matches: EvidenceMatch[] = findEvidenceMatches(manuscriptText, quote),
): EvidenceLocation {
  if (matches.length === 0) return { status: 'missing', origin, reason: quote.trim() ? 'no-match' : 'empty-quote' };
  if (matches.length > 1) return { status: 'ambiguous', origin, reason: 'multiple-matches' };
  const match = matches[0]!;
  const block = blocks.find((candidate) => match.start >= candidate.textStart && match.end <= candidate.textEnd);
  if (!block) return { status: 'cross_block', origin, matching: match.matching, reason: 'match-spans-blocks' };
  try {
    const sourceLocator = createBlockSourceLocator(sourceMap, block.id, {
      charRange: {
        start: block.originalStart + match.start - block.textStart,
        end: block.originalStart + match.end - block.textStart,
      },
    });
    const resolved = resolveSourceLocator(sourceMap, sourceLocator);
    if (resolved.id !== block.id) throw new Error('locator resolved to a different block');
    const selectedText = manuscriptText.slice(match.start, match.end);
    const locatedText = resolved.text?.slice(sourceLocator.charRange!.start, sourceLocator.charRange!.end);
    const sameText = match.matching === 'exact'
      ? locatedText === selectedText
      : locatedText?.replace(/\s+/gu, ' ') === selectedText.replace(/\s+/gu, ' ');
    if (!sameText) throw new Error('locator text does not match selected evidence');
    return { status: 'located', sourceLocator, origin, matching: match.matching };
  } catch {
    return { status: 'missing', origin, matching: match.matching, reason: 'locator-roundtrip-failed' };
  }
}

function materializeProposal(proposal: ExtractedProposal, manuscriptText: string, sourceMap?: DocumentSourceMap): ExtractionResult {
  const core = { schemaVersion: SDF_CORE_VERSION } as ExtractedCore;
  const evidence = {} as ExtractionResult['evidence'];
  const needsMoreInformation: ExtractionResult['needsMoreInformation'] = [];
  const blocks = sourceMap ? canonicalTextBlocks(sourceMap) : undefined;
  const evidenceLocation = sourceMap ? {} as NonNullable<ExtractionResult['evidenceLocation']> : undefined;
  for (const field of SDF_CORE_FIELDS) {
    const candidate = proposal.fields[field];
    const matches = sourceMap ? findEvidenceMatches(manuscriptText, candidate.sourceQuote) : [];
    const range = sourceMap ? (matches[0] ?? null) : findLegacyEvidenceRange(manuscriptText, candidate.sourceQuote);
    const explicit = findExplicitFieldEvidence(manuscriptText, field);
    if (!candidate.needsMoreInformation && range) {
      core[field] = candidate.summary.trim();
      evidence[field] = { quote: manuscriptText.slice(range.start, range.end), locator: `chars:${range.start}-${range.end}` };
      if (sourceMap && evidenceLocation && blocks) {
        evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, candidate.sourceQuote, 'model_quote', manuscriptText, matches);
      }
    } else if (explicit) {
      const explicitMatches = findEvidenceMatches(manuscriptText, explicit.quote);
      if (explicitMatches.length > 0) {
        const explicitRange = explicitMatches[0]!;
        core[field] = manuscriptText.slice(explicitRange.start, explicitRange.end);
        evidence[field] = { quote: core[field], locator: `chars:${explicitRange.start}-${explicitRange.end}` };
        if (sourceMap && evidenceLocation && blocks) {
          evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, explicit.quote, 'explicit_field_label', manuscriptText, explicitMatches);
        }
      } else {
        core[field] = '';
        evidence[field] = { quote: '', locator: '' };
        needsMoreInformation.push(field);
        if (sourceMap && evidenceLocation && blocks) {
          evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, explicit.quote, 'explicit_field_label', manuscriptText, explicitMatches);
        }
      }
    } else {
      core[field] = '';
      evidence[field] = { quote: '', locator: '' };
      needsMoreInformation.push(field);
      if (sourceMap && evidenceLocation && blocks) {
        evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, candidate.sourceQuote, 'model_quote', manuscriptText, matches);
      }
    }
  }
  return { core, evidence, needsMoreInformation, ...(evidenceLocation ? { evidenceLocation } : {}) };
}

/**
 * SDF Extractor handler（§9.2 + §5.4）：
 * - 从正文提取六字段建议（Gateway 结构化输出 + Schema 校验）
 * - **不写 SDF**（§9.2 禁止直接覆盖正文；建议由用户确认后经前端 updateSdf 落库）
 */
export async function extractHandler(
  gateway: AiGateway,
  task: { payload: Record<string, unknown> },
  trustedContext: { sourceMap?: DocumentSourceMap } = {},
): Promise<ExtractionResult> {
  const canonicalSourceMap = trustedContext.sourceMap
    ? parseDocumentSourceMap(trustedContext.sourceMap)
    : undefined;
  const manuscriptText = canonicalSourceMap
    ? sourceMapToManuscriptText(canonicalSourceMap)
    : typeof task.payload?.manuscriptText === 'string' ? task.payload.manuscriptText : '';
  if (!manuscriptText.trim()) {
    throw new Error('缺少正文（payload.manuscriptText）');
  }
  const passages = canonicalSourceMap ? canonicalPassages(canonicalSourceMap) : undefined;
  const prompt = [
    { role: 'system' as const, content: [
      '你是Hermes科研阅读助手。综合给定全文理解论文，再用SDF六个展示维度 problem/insight/method/results/limitations/reproducibility 组织凝练内容；字段不对应固定章节或固定原文段落。',
      '保持证据类型与认识边界：明确区分实验实测、理论估计、数值仿真、作者归因或解释、以及讨论中的能力或上限；不得把其中一种改写成另一种，也不得把讨论上限写成已验证性能。',
      '保持物理量身份：明确区分入射量与局域量、场振幅与强度、脉冲能量与功率，并保留数值、单位、比例的对象和适用条件；除非原文明确给出关系，不得自行换算或混用。',
      '先理解全文研究逻辑并形成有依据的综合概括，再关联支持各项断言的来源。可以跨章节整合分散的建模、推导和研究步骤，不要求存在同名章节或单段总结；不得补造原文不存在的中间论证。来源须支撑数字、比较、因果、能力限定与必要条件；作者归因不能改写成已证因果。',
      '方法或配置披露不等于独立复现完成；reproducibility 只能概括原文明示的材料、参数、步骤、数据或代码可用性及其缺口。若某个条款缺少直接证据，从 summary 删除该条款；若字段已无可支持内容，则按缺失字段返回 needsMoreInformation=true。',
      ...(passages ? [
        RESEARCH_UNDERSTANDING_SKILL.instructions,
        '只输出JSON：schemaVersion="0.1.0"，fields下六个字段必须且只能是 {"summary":string,"sourcePassageIds":string[],"needsMoreInformation":boolean}。不得返回引文、窗口ID或来源正文。',
        `完整输出结构如下（这是空结构，不是论文结论；必须用原文支持的摘要与实际P编号填充）：${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: '', sourcePassageIds: [], needsMoreInformation: true }])) })}`,
        'sourcePassageIds必须是字符串数组，例如["P00001"]，不能填页码、对象或区间字符串。JSON字符串中的反斜杠必须转义；摘要优先使用普通文字与Unicode数学符号，避免输出不合法的LaTeX转义。',
        `每字段凝练成中文摘要，通常120–300字，方法可用简洁步骤；优先解释研究逻辑，不逐式重抄推导。同一来源可以支撑不同展示维度，但各维度概括的语义应不同。先完成全文综合，再为每个非空摘要选择通常1–${USUAL_SOURCE_PASSAGE_IDS}个关键sourcePassageIds作为最小充分集合；只有确有必要时才能增加，但不得超过${MAX_SOURCE_PASSAGE_IDS}个硬上限。ID只能来自下方标签，服务端回读原始SourceMap，模型不要复制或改写证据。`,
        `摘要最多${MAX_CANONICAL_CORE_CHARS}字符；来源展开后合计最多${MAX_FIELD_EVIDENCE_CHARS}字符、${MAX_EVIDENCE_SEGMENTS}个精确来源段。每个passage最多5个原始块、1200字符，标签给出实际blocks和chars预算。方法用分布于全文的关键passage证明主要假设、研究步骤和验证，不需要引用每段中间推导；reproducibility只选择直接披露参数、材料、步骤、数据或代码可用性及明确缺口的passage，不要附上整条方法链。同一原始块内重叠或相邻的选段会合并，彼此分隔的选段保留为独立来源段并分别计入限额。`,
        '选择能完整支持主语、条件、否定、数字和单位的最少passage。不要为了符合限额扩大或改写结论。若无充分证据，summary="",sourcePassageIds=[],needsMoreInformation=true；缺失字段里的解释会被服务端丢弃，不影响其他有证据字段。无法辨认的公式不要猜写。',
      ] : [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须含 summary、sourceQuote、needsMoreInformation。',
        'sourceQuote 必须逐字复制 SOURCE 中支持 summary 的最短充分原文；不得概括、改写或虚构引文。',
        '若材料不足，summary 与 sourceQuote 置空，needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
      ]),
    ].join(' ') },
    { role: 'user' as const, content: passages ? canonicalPassagePrompt(passages) : selectManuscriptEvidence(manuscriptText) },
  ];
  if (canonicalSourceMap && passages) {
    const validation = canonicalProposalValidation(canonicalSourceMap, passages);
    try {
      await gateway.completeStructured(validation.guard, prompt, {
        temperature: 0.2,
        validationFeedback: validation.validationFeedback,
        validationDiagnostic: validation.validationDiagnostic,
        maxRetries: 0,
      });
    } catch (error) {
      if (!(error instanceof AiGatewayError) || !['SCHEMA_VALIDATION', 'STRUCTURED_JSON_INVALID'].includes(error.code)) throw error;
      if (!(error.cause instanceof AiGatewayError) || !['SCHEMA_VALIDATION', 'STRUCTURED_JSON_INVALID'].includes(error.cause.code)) throw error;
      const initialPartial = validation.partialResult();
      if (!initialPartial) throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_validation_exhausted', error);
      const partial = await repairCanonicalPartial(gateway, canonicalSourceMap, passages, initialPartial);
      if (Object.keys(partial.fieldDiagnostics).length === 0) return materializeCanonicalProposal(partial.proposal);
      return {
        ...materializeCanonicalProposal(partial.proposal),
        reason: 'canonical_partial_validation_exhausted',
        fieldDiagnostics: partial.fieldDiagnostics,
        fieldDiagnosticsDetails: partial.fieldDiagnosticsDetails,
        unverifiedSummaries: partial.unverifiedSummaries,
        unverifiedSourcePassageIds: partial.unverifiedSourcePassageIds,
      };
    }
    const proposal = validation.mergeRetained();
    if (SDF_CORE_FIELDS.every((field) => proposal.fields[field].needsMoreInformation)) {
      throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_all_fields_missing');
    }
    return materializeCanonicalProposal(proposal);
  }
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText);
}
