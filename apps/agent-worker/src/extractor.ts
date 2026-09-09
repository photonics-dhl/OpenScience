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
  canonicalExtractionContract?: 'windowed-source-v2' | 'exact-quote-v1';
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
const CANONICAL_EXTRACTION_CONTRACT = 'exact-quote-v1';

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
    for (const block of page.blocks) {
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
  const selected = new Set<number>();
  let remaining = MAX_EXCERPT_CHARS;
  // The source budget measures evidence text. Stable IDs and boundary labels must not
  // displace manuscript content simply because the parser produced more blocks.
  const sourceLength = (block: PromptCanonicalBlock) => block.text.length + 1;
  const addRange = (start: number, end: number): boolean => {
    const candidates = blocks.slice(start, end + 1).filter((block) => !selected.has(block.ordinal));
    const cost = candidates.reduce((total, block) => total + sourceLength(block), 0);
    if (cost > remaining) return false;
    candidates.forEach((block) => selected.add(block.ordinal));
    remaining -= cost;
    return true;
  };
  const contextualRange = (ordinal: number): { start: number; end: number } => {
    let start = ordinal;
    let end = ordinal;
    let before = 0;
    let after = 0;
    while (start > 0 && before < 1_200) {
      start -= 1;
      before += sourceLength(blocks[start]!);
    }
    while (end < blocks.length - 1 && after < 1_800) {
      end += 1;
      after += sourceLength(blocks[end]!);
    }
    return { start, end };
  };
  let headCost = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const cost = sourceLength(blocks[index]!);
    if (headCost + cost > 8_000 || !addRange(index, index)) break;
    headCost += cost;
  }
  for (const block of blocks) {
    if (remaining <= 8_000) break;
    KEY_EVIDENCE.lastIndex = 0;
    if (KEY_EVIDENCE.test(block.text)) {
      const range = contextualRange(block.ordinal);
      addRange(range.start, range.end);
    }
  }
  let tailCost = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const cost = selected.has(index) ? 0 : sourceLength(blocks[index]!);
    if (tailCost + cost > 8_000 || !addRange(index, index)) break;
    tailCost += cost;
  }
  let window = 0;
  let previousOrdinal: number | undefined;
  return blocks.filter((block) => selected.has(block.ordinal)).map((block) => {
    if (previousOrdinal === undefined || block.ordinal !== previousOrdinal + 1) window += 1;
    previousOrdinal = block.ordinal;
    return { ...block, windowId: `W${String(window).padStart(3, '0')}` };
  });
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
    if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sourceQuote,sourceWindowId,summary'
      || typeof candidate.summary !== 'string' || typeof candidate.needsMoreInformation !== 'boolean'
      || typeof candidate.sourceQuote !== 'string' || typeof candidate.sourceWindowId !== 'string') {
      return { reason: 'malformed_item' };
    }
    if (candidate.needsMoreInformation) {
      return candidate.summary.trim() || candidate.sourceQuote.trim() || candidate.sourceWindowId.trim()
        ? { reason: 'missing_requires_empty' }
        : { candidate: candidate as unknown as ExtractedFieldProposal };
    }
    if (!candidate.summary.trim()) return { reason: 'summary_required' };
    if (!candidate.sourceWindowId.trim()) return { reason: 'window_required' };
    const window = allowedWindows.get(candidate.sourceWindowId);
    if (!window) return { reason: 'unknown_window' };
    if (!candidate.sourceQuote.trim()) return { reason: 'quote_required' };
    const matches = findEvidenceMatches(window.text, candidate.sourceQuote);
    if (matches.length === 0) return { reason: 'quote_not_found' };
    if (matches.length !== 1) return { reason: 'quote_ambiguous' };
    const match = matches[0]!;
    const sourceRange: EvidenceMatch = {
      start: window.textStart + match.start,
      end: window.textStart + match.end,
      matching: match.matching,
    };
    const selected = window.blocks.filter((block) => block.textEnd > sourceRange.start && block.textStart < sourceRange.end);
    if (selected.length === 0 || selected.length > MAX_EVIDENCE_SEGMENTS) return { reason: 'segment_count_1_to_32' };
    const evidenceLength = selected.reduce((total, block) => total
      + Math.max(0, Math.min(block.textEnd, sourceRange.end) - Math.max(block.textStart, sourceRange.start)), 0);
    if (evidenceLength > MAX_FIELD_EVIDENCE_CHARS) {
      return { reason: 'source_text_limit_8000' };
    }
    const sourceQuote = window.text.slice(match.start, match.end);
    if (sourceQuote.length > MAX_CANONICAL_CORE_CHARS) {
      return { reason: 'core_text_limit_4000' };
    }
    try {
      const segments = canonicalSegmentsForRange(sourceMap, selected, sourceRange);
      if (segments.length !== selected.length || segments.map((segment) => segment.quote).join('\n') !== sourceQuote) {
        return { reason: 'quote_not_found' };
      }
    } catch {
      return { reason: 'quote_not_found' };
    }
    return {
      candidate: {
        summary: candidate.summary,
        sourceQuote,
        sourceWindowId: window.id,
        sourceBlockIds: selected.map((block) => block.promptId),
        sourceRange,
        needsMoreInformation: false,
      } as unknown as ExtractedFieldProposal,
    };
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
        'For each non-missing field, copy one shortest complete supported passage exactly from inside one explicitly labelled SOURCE_WINDOW. Return that window id and the copied passage as sourceQuote. Never combine text from different windows or omit words inside the copied passage. A window edge may itself cut through a longer sentence or argument; choose a complete supported point inside the window, or mark the field missing when it contains no complete point. Prefer at most 600 characters, but never truncate the subject, qualifiers, units, or necessary evidence to meet that preference. The server uniquely matches sourceQuote and materializes the matched original text as canonical core; summary does not become core.',
        'A missing field must have summary="", sourceWindowId="", sourceQuote="", needsMoreInformation=true. Do not include a nonempty explanation in a missing field.',
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
  sourceMap: DocumentSourceMap,
  promptBlocks: PromptCanonicalBlock[],
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
    if (!candidate.sourceRange) throw new Error('canonical source range is missing');
    const segments = canonicalSegmentsForRange(sourceMap, promptBlocks, candidate.sourceRange);
    // Canonical core is source text. The model summary remains wire-compatible metadata only.
    const quote = segments.map((segment) => segment.quote).join('\n');
    if (quote !== candidate.sourceQuote) throw new Error('canonical source materialization changed');
    core[field] = quote;
    evidence[field] = { quote, locator: `blocks:${ids.join(',')}` };
    evidenceSegments[field] = segments;
    evidenceLocation[field] = segments.length === 1
      ? { status: 'located', sourceLocator: segments[0]!.sourceLocator, origin: 'model_quote', matching: candidate.sourceRange.matching }
      : { status: 'cross_block', origin: 'model_quote', matching: candidate.sourceRange.matching, reason: 'match-spans-blocks' };
  }
  return { core, evidence, needsMoreInformation, evidenceLocation, evidenceSegments,
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
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须且只能是 {"summary": string, "sourceWindowId": string, "sourceQuote": string, "needsMoreInformation": boolean}，不得把字段写成字符串、数组或增加其他键。',
        `每个非缺失字段只能从一个明确标注的 SOURCE_WINDOW 正文中逐字复制一个连续 sourceQuote，并填写该窗口 id。不得跨窗口拼接，因为窗口之间存在未提供的原文。窗口边缘自身也可能截断更长的句子或论证；必须选择窗口内部完整且受支持的论点，若没有完整论点则将该字段标为缺失，不得用限额为截断辩解。服务端只接受窗口内唯一的精确匹配或仅空白连续段有差异的匹配，并从服务器原文还原 core 与来源位置；不接受模糊匹配、改写、重排或省略。映射后的证据必须包含 1-${MAX_EVIDENCE_SEGMENTS} 个原始块，证据合计不超过 ${MAX_FIELD_EVIDENCE_CHARS} 字符，canonical core 不超过 ${MAX_CANONICAL_CORE_CHARS} 字符。`,
        '逐字段独立判断：先复制能直接陈述一个核心要点的最短完整句段，优先不超过600字符；600字符只是偏好，不得为缩短而丢失主语、否定、适用条件、数值单位、实验或理论性质。sourceQuote 和 summary 都不能替代服务器原文；最终 core 只取服务器匹配到的原文。',
        '自然语言证据跨度必须包含完整主语、完整句子或完整论证起止，不得从句中术语或未闭合从句开始，也不得在未完成的词组、限定条件或因果链中结束；可向前后扩展连续块以保留这些条件。公式、参数或符号可保留其自身完整上下文，不要求机械按句号裁切。不同字段应各自选择最直接、独立支持其字段含义的跨度。',
        'summary 仅为兼容现有 JSON wire shape，填写非空简短说明；它不会进入 canonical core。若完整证据需超过32块或4000字符，应缩小到仍完整受支持的单一要点，不能任意截断必要证据。不要因一个字段缺失而清空其他字段。',
        '跨行文字可以作为同一个 sourceQuote，但只能来自同一窗口内连续原文；允许空格或换行连续段不同，文字、符号、标点、数字及顺序必须保持。',
        '严格区分理论预测、仿真与实测，不能把缺少主语或限定词的片段扩写成实验结论；results 中的理论或仿真结果必须明确注明其性质。',
        '只有在全部已给 SOURCE_WINDOW 中找不到该字段任何受支持要点时，才将 summary、sourceWindowId、sourceQuote 置空并令 needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
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
        ...materializeCanonicalProposal(partial.proposal, canonicalSourceMap, promptBlocks),
        reason: 'canonical_partial_validation_exhausted',
        fieldDiagnostics: partial.fieldDiagnostics,
      };
    }
    const proposal = validation.mergeRetained();
    if (SDF_CORE_FIELDS.every((field) => proposal.fields[field].needsMoreInformation)) {
      throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_all_fields_missing');
    }
    return materializeCanonicalProposal(proposal, canonicalSourceMap, promptBlocks);
  }
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText);
}
