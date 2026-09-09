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
  /** Server-owned canonical selection contract used to prevent obsolete paid repair loops. */
  canonicalExtractionContract?: 'windowed-source-v2' | 'exact-quote-v1' | 'grounded-summary-v1';
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
const CANONICAL_EXTRACTION_CONTRACT = 'grounded-summary-v1';

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

interface PromptCanonicalBlock extends CanonicalTextBlock {
  promptId: string;
  ordinal: number;
  windowId: string;
  text: string;
}

interface PromptCanonicalWindow {
  id: string;
  startOrdinal: number;
  endOrdinal: number;
  textStart: number;
  textEnd: number;
  text: string;
  blocks: readonly PromptCanonicalBlock[];
}

function canonicalTextBlocks(sourceMap: DocumentSourceMap): CanonicalTextBlock[] {
  const blocks: CanonicalTextBlock[] = [];
  let cursor = 0;
  for (const page of sourceMap.pages) {
    // Keep native blocks in the stored map, but do not feed duplicate garbled text beside
    // the page's vision transcription. Its own OCR locator and page-level bounds remain.
    const visionBlocks = page.blocks.filter((block) => block.parser.name === 'llm_ocr_candidate' && block.text?.trim());
    for (const block of visionBlocks.length ? visionBlocks : page.blocks) {
      const text = block.text?.trim();
      if (!text) continue;
      if (blocks.length > 0) cursor += 1;
      const originalStart = block.text!.indexOf(text);
      blocks.push({
        id: block.id, text, textStart: cursor, textEnd: cursor + text.length, originalStart,
        page: page.page, boundingBox: block.boundingBox,
      });
      cursor += text.length;
    }
  }
  return blocks;
}

function promptCanonicalBlocks(sourceMap: DocumentSourceMap): PromptCanonicalBlock[] {
  const canonical = canonicalTextBlocks(sourceMap);
  return canonical.map((block, ordinal) => ({
    ...block, ordinal, promptId: `B${String(ordinal + 1).padStart(6, '0')}`, windowId: '',
  }));
}

function selectCanonicalBlocks(sourceMap: DocumentSourceMap): PromptCanonicalBlock[] {
  const blocks = promptCanonicalBlocks(sourceMap);
  // Read the entire paper within the bounded model input, never silently discard its middle.
  const total = blocks.reduce((sum, block) => sum + block.text.length + 1, 0);
  if (total > 120_000) throw new Error('[blocked] Paper exceeds the full-document understanding limit; split the document into research sections before analysis');
  return blocks.map((block) => ({ ...block, windowId: `W${String(block.page).padStart(3, '0')}` }));
}
function canonicalWindows(blocks: readonly PromptCanonicalBlock[]): readonly PromptCanonicalWindow[] {
  const windows: PromptCanonicalWindow[] = [];
  for (const block of blocks) {
    const current = windows.at(-1);
    if (!current || current.id !== block.windowId) {
      windows.push({
        id: block.windowId,
        startOrdinal: block.ordinal,
        endOrdinal: block.ordinal,
        textStart: block.textStart,
        textEnd: block.textEnd,
        text: block.text,
        blocks: [block],
      });
      continue;
    }
    current.endOrdinal = block.ordinal;
    current.textEnd = block.textEnd;
    current.text += `\n${block.text}`;
    current.blocks = [...current.blocks, block];
  }
  return windows.map((window) => Object.freeze({ ...window, blocks: Object.freeze([...window.blocks]) }));
}

function canonicalWindowPrompt(windows: readonly PromptCanonicalWindow[]): string {
  return windows.map((window) => [
    `--- SOURCE_WINDOW id:${window.id} originalRange:B${String(window.startOrdinal + 1).padStart(6, '0')}-B${String(window.endOrdinal + 1).padStart(6, '0')} ---`,
    window.text,
    `--- END_SOURCE_WINDOW id:${window.id} ---`,
  ].join('\n')).join('\n\n');
}

function canonicalSegmentsForRange(
  sourceMap: DocumentSourceMap,
  blocks: readonly PromptCanonicalBlock[],
  range: EvidenceMatch,
): Array<{ quote: string; sourceLocator: SourceLocator }> {
  return blocks.filter((block) => block.textEnd > range.start && block.textStart < range.end).map((block) => {
    const localStart = Math.max(0, range.start - block.textStart);
    const localEnd = Math.min(block.text.length, range.end - block.textStart);
    const quote = block.text.slice(localStart, localEnd);
    const sourceLocator = validateSourceLocator({
      artifactId: sourceMap.artifactId,
      contentHash: sourceMap.contentHash,
      blockId: block.id,
      page: block.page,
      boundingBox: block.boundingBox,
      charRange: { start: block.originalStart + localStart, end: block.originalStart + localEnd },
    });
    const resolved = resolveSourceLocator(sourceMap, sourceLocator);
    const located = resolved.text?.slice(sourceLocator.charRange!.start, sourceLocator.charRange!.end);
    if (resolved.id !== block.id || located !== quote) {
      throw new Error('canonical source locator round-trip failed');
    }
    return { quote, sourceLocator };
  });
}

type CanonicalFieldValidationReason =
  | 'malformed_item'
  | 'missing_requires_empty'
  | 'summary_required'
  | 'window_required'
  | 'unknown_window'
  | 'quote_required'
  | 'quote_not_found'
  | 'quote_ambiguous'
  | 'noncontiguous_block_passages'
  | 'segment_count_1_to_32'
  | 'source_text_limit_8000'
  | 'core_text_limit_4000';

interface CanonicalRepairResponse {
  schemaVersion: string;
  fields: Record<string, unknown>;
}

function canonicalProposalValidation(sourceMap: DocumentSourceMap, blocks: PromptCanonicalBlock[]): {
  guard: SchemaGuard<CanonicalRepairResponse>;
  validationFeedback: (value: unknown) => string | undefined;
  validationDiagnostic: (value: unknown) => string | undefined;
  partialResult: () => { proposal: ExtractedProposal; fieldDiagnostics: Record<string, CanonicalFieldValidationReason> } | undefined;
  mergeRetained: () => ExtractedProposal;
} {
  const windows = canonicalWindows(blocks);
  const allowedWindows = new Map(windows.map((window) => [window.id, window]));
  const retained = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();
  let invalidFields = new Map<string, CanonicalFieldValidationReason>();
  const validateField = (item: unknown): { candidate?: ExtractedFieldProposal; reason?: CanonicalFieldValidationReason } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { reason: 'malformed_item' };
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sources,summary'
      || typeof candidate.summary !== 'string' || typeof candidate.needsMoreInformation !== 'boolean'
      || !Array.isArray(candidate.sources)) return { reason: 'malformed_item' };
    if (candidate.needsMoreInformation) {
      return candidate.summary.trim() || candidate.sources.length
        ? { reason: 'missing_requires_empty' }
        : { candidate: { summary: '', sourceQuote: '', needsMoreInformation: true } };
    }
    if (!candidate.summary.trim()) return { reason: 'summary_required' };
    if (candidate.summary.length > MAX_CANONICAL_CORE_CHARS) return { reason: 'core_text_limit_4000' };
    if (candidate.sources.length < 1 || candidate.sources.length > 3) return { reason: 'quote_required' };
    const ranges = new Map<string, { block: PromptCanonicalBlock; start: number; end: number }>();
    for (const source of candidate.sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return { reason: 'malformed_item' };
      const passage = source as Record<string, unknown>;
      if (Object.keys(passage).sort().join(',') !== 'sourceQuote,sourceWindowId'
        || typeof passage.sourceWindowId !== 'string' || typeof passage.sourceQuote !== 'string') return { reason: 'malformed_item' };
      const window = allowedWindows.get(passage.sourceWindowId);
      if (!window) return { reason: 'unknown_window' };
      if (!passage.sourceQuote.trim()) return { reason: 'quote_required' };
      const matches = findEvidenceMatches(window.text, passage.sourceQuote);
      if (!matches.length) return { reason: 'quote_not_found' };
      if (matches.length !== 1) return { reason: 'quote_ambiguous' };
      const match = matches[0]!;
      const start = window.textStart + match.start;
      const end = window.textStart + match.end;
      for (const block of window.blocks.filter((entry) => entry.textEnd > start && entry.textStart < end)) {
        const previous = ranges.get(block.id);
        const localStart = Math.max(block.textStart, start);
        const localEnd = Math.min(block.textEnd, end);
        // Existing consumers require one range per block. Do not add unselected text.
        if (previous && (localStart > previous.end || localEnd < previous.start)) return { reason: 'noncontiguous_block_passages' };
        ranges.set(block.id, { block,
          start: Math.min(previous?.start ?? Infinity, Math.max(block.textStart, start)),
          end: Math.max(previous?.end ?? -Infinity, Math.min(block.textEnd, end)),
        });
      }
    }
    if (!ranges.size || ranges.size > MAX_EVIDENCE_SEGMENTS) return { reason: 'segment_count_1_to_32' };
    const ordered = [...ranges.values()].sort((a, b) => a.block.ordinal - b.block.ordinal);
    try {
      const segments = ordered.flatMap(({ block, start, end }) => canonicalSegmentsForRange(sourceMap, [block], { start, end, matching: 'exact' }));
      const sourceQuote = segments.map((segment) => segment.quote).join('\n');
      if (sourceQuote.length > MAX_FIELD_EVIDENCE_CHARS) return { reason: 'source_text_limit_8000' };
      return { candidate: { summary: candidate.summary.trim(), sourceQuote,
        sourceBlockIds: ordered.map(({ block }) => block.promptId), verifiedSegments: segments, needsMoreInformation: false } };
    } catch { return { reason: 'quote_not_found' }; }
  };
  const guard: SchemaGuard<CanonicalRepairResponse> = (value: unknown): value is CanonicalRepairResponse => {
    invalidFields = new Map();
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
    for (const field of SDF_CORE_FIELDS) {
      const previous = retained.get(field);
      const validation = validateField(fields[field]);
      if (validation.candidate) {
        // A later complete supported span may repair an earlier structurally valid but
        // linguistically truncated endpoint. Never replace supported evidence with a
        // later missing-field response.
        if (!validation.candidate.needsMoreInformation || !previous || previous.needsMoreInformation) {
          retained.set(field, validation.candidate);
        }
      } else {
        invalidFields.set(field, validation.reason!);
      }
    }
    return invalidFields.size === 0;
  };
  return {
    guard,
    validationFeedback: () => {
      if (invalidFields.size === 0) return undefined;
      const details = [...invalidFields].map(([field, reason]) => `${field}:${reason}`).join(', ');
      return [
        'Previous JSON failed canonical validation.',
        `Invalid fields and reason codes: ${details}.`,
        'Return schemaVersion and all six fields again. Repair the invalid fields and recheck every other field for complete grammatical and argument boundaries; the server retains the last valid supported candidate for each field.',
        'Each supported field has a concise scientific summary and sources:[{sourceWindowId,sourceQuote}] with 1–3 independent exact passages supporting every substantive assertion. The server stores the summary separately and reconstructs evidence from original source slices. Preserve complete subjects, qualifications and units; never splice a passage or invent a quote.',
        'A missing field must have summary="", sources:[], needsMoreInformation=true.',
        'For noncontiguous_block_passages, choose one complete passage explicitly including the intervening text, or keep only one supported passage from that block; do not splice quotes.',
        'A field is missing only when no supplied SOURCE_WINDOW passage states a supported point for that field. Preserve whether a point is measured, theoretical, simulated, or author-attributed.',
        'Do not normalize, paraphrase, splice, or reconstruct sourceQuote. Copy its characters from one window; line-break and space runs may differ, but words, symbols, punctuation, numbers, and order must not.',
      ].join(' ');
    },
    validationDiagnostic: () => invalidFields.size === 0
      ? undefined
      : [...invalidFields].map(([field, reason]) => `${field}:${reason}`).join(','),
    partialResult: () => {
      if (!SDF_CORE_FIELDS.some((field) => retained.get(field)?.needsMoreInformation === false)) return undefined;
      const responseReason = invalidFields.get('response');
      const fieldDiagnostics: Record<string, CanonicalFieldValidationReason> = {};
      const fields = Object.fromEntries(SDF_CORE_FIELDS.map((field) => {
        const candidate = retained.get(field);
        if (candidate) return [field, candidate];
        fieldDiagnostics[field] = invalidFields.get(field) ?? responseReason ?? 'malformed_item';
        return [field, {
          summary: '', sourceQuote: '', sourceWindowId: '', sourceBlockIds: [], needsMoreInformation: true,
        } satisfies ExtractedFieldProposal];
      })) as ExtractedProposal['fields'];
      return { proposal: { schemaVersion: SDF_CORE_VERSION, fields }, fieldDiagnostics };
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

function materializeCanonicalProposal(
  proposal: ExtractedProposal,
): ExtractionResult {
  const core = { schemaVersion: SDF_CORE_VERSION } as ExtractedCore;
  const evidence = {} as ExtractionResult['evidence'];
  const evidenceLocation = {} as NonNullable<ExtractionResult['evidenceLocation']>;
  const evidenceSegments = {} as NonNullable<ExtractionResult['evidenceSegments']>;
  const needsMoreInformation: ExtractionResult['needsMoreInformation'] = [];
  for (const field of SDF_CORE_FIELDS) {
    const candidate = proposal.fields[field];
    const ids = candidate.sourceBlockIds ?? [];
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
    evidence[field] = { quote, locator: `blocks:${ids.join(',')}` };
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
  const promptBlocks = canonicalSourceMap ? selectCanonicalBlocks(canonicalSourceMap) : undefined;
  const promptWindows = promptBlocks ? canonicalWindows(promptBlocks) : undefined;
  const prompt = [
    { role: 'system' as const, content: [
      '你是科研结构化提取器。从给定 SOURCE 片段提取 SDF 六字段 problem/insight/method/results/limitations/reproducibility。',
      '保持证据类型与认识边界：明确区分实验实测、理论估计、数值仿真、作者归因或解释、以及讨论中的能力或上限；不得把其中一种改写成另一种，也不得把讨论上限写成已验证性能。',
      '保持物理量身份：明确区分入射量与局域量、场振幅与强度、脉冲能量与功率，并保留数值、单位、比例的对象和适用条件；除非原文明确给出关系，不得自行换算或混用。',
      '先选择原文证据，再形成字段结果。所选原文必须保留每个数字、比较、因果、能力限定和必要条件；不得跨越缺失的中间论证拼接新结论。作者提出的原因必须保留为作者归因，不能写成已证因果。',
      '方法或配置披露不等于独立复现完成；reproducibility 只能概括原文明示的材料、参数、步骤、数据或代码可用性及其缺口。若某个条款缺少直接证据，从 summary 删除该条款；若字段已无可支持内容，则按缺失字段返回 needsMoreInformation=true。',
      ...(promptBlocks ? [
        RESEARCH_UNDERSTANDING_SKILL.instructions,
        '只输出JSON：schemaVersion="0.1.0"，fields下六个字段必须且只能是 {"summary":string,"sources":[{"sourceWindowId":string,"sourceQuote":string}],"needsMoreInformation":boolean}。',
        '每字段凝练成中文摘要，解释该论文的核心要点，避免重复同一段内容填不同字段。每个非空摘要必须由1–3段独立来源充分支持；每段从声明的SOURCE_WINDOW连续逐字复制，不能跨窗口或省略中间文字。允许换行空白差异，不允许文字、符号、单位、数字改变。服务端精确回读来源，摘要与证据分别存储。',
        `摘要最多${MAX_CANONICAL_CORE_CHARS}字符；来源合计最多${MAX_FIELD_EVIDENCE_CHARS}字符、${MAX_EVIDENCE_SEGMENTS}块。选择最短但足以支持摘要的完整句段，不截断主语、条件、否定或数量单位。不为了符合限额扩大或改写结论。`,
        '若无充分证据，summary="",sources=[],needsMoreInformation=true；不要把模型解释写进缺失字段，不要因一个字段缺失清空其他字段。无法辨认的公式不要猜写，可仅概括仍被清晰原文支持的科学关系。',
      ] : [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须含 summary、sourceQuote、needsMoreInformation。',
        'sourceQuote 必须逐字复制 SOURCE 中支持 summary 的最短充分原文；不得概括、改写或虚构引文。',
        '若材料不足，summary 与 sourceQuote 置空，needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
      ]),
    ].join(' ') },
    { role: 'user' as const, content: promptWindows ? canonicalWindowPrompt(promptWindows) : selectManuscriptEvidence(manuscriptText) },
  ];
  if (canonicalSourceMap && promptBlocks) {
    const validation = canonicalProposalValidation(canonicalSourceMap, promptBlocks);
    try {
      await gateway.completeStructured(validation.guard, prompt, {
        temperature: 0.2,
        validationFeedback: validation.validationFeedback,
        validationDiagnostic: validation.validationDiagnostic,
      });
    } catch (error) {
      if (!(error instanceof AiGatewayError) || error.code !== 'SCHEMA_VALIDATION') throw error;
      if (!(error.cause instanceof AiGatewayError) || error.cause.code !== 'SCHEMA_VALIDATION') throw error;
      const partial = validation.partialResult();
      if (!partial) throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_validation_exhausted', error);
      return {
        ...materializeCanonicalProposal(partial.proposal),
        reason: 'canonical_partial_validation_exhausted',
        fieldDiagnostics: partial.fieldDiagnostics,
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
