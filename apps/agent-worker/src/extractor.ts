import { AiGatewayError, type AiGateway, type SchemaGuard } from '@openscience/ai-gateway';
import {
  createBlockSourceLocator,
  parseDocumentSourceMap,
  parseSourceIdentityProposal,
  resolveSourceLocator,
  validateSourceLocator,
  type DocumentSourceMap,
  type SourceIdentityProposal,
  type SourceIdentityProposalItem,
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
  sourceLocator?: string;
  needsMoreInformation: boolean;
}

interface ExtractedProposal {
  schemaVersion: string;
  fields: Record<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>;
}

type ExtractionMissingCause = 'not_selected' | 'model_no_supported_summary' | 'validation_rejected' | 'undetermined';

export interface ExtractionResult extends Record<string, unknown> {
  core: ExtractedCore;
  evidence: Record<(typeof SDF_CORE_FIELDS)[number], { quote: string; locator: string }>;
  needsMoreInformation: Array<(typeof SDF_CORE_FIELDS)[number]>;
  missingDetails?: Partial<Record<(typeof SDF_CORE_FIELDS)[number], {
    cause: ExtractionMissingCause;
  }>>;
  sourceIdentity?: SourceIdentityProposal;
  /** Present only when trusted canonical parser context was supplied outside the user payload. */
  evidenceLocation?: Record<(typeof SDF_CORE_FIELDS)[number], EvidenceLocation>;
  /** Exact canonical block segments selected by the model and materialized by the worker. */
  evidenceSegments?: Record<(typeof SDF_CORE_FIELDS)[number], Array<{ quote: string; sourceLocator: SourceLocator }>>;
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
const AVAILABILITY_HEADING = /^(?:(?:data|code|data and code) availability|availability of data(?: and materials)?|availability of data and code)$/iu;
const AVAILABILITY_STOP_HEADING = /^(?:supplementary materials?|references?|acknowledg(?:e)?ments?|funding|author contributions?|competing interests?|conflicts? of interest)$/iu;
const LIMITATION_EVIDENCE = /\b(?:limitations?|constraints?|uncertaint(?:y|ies)|assum(?:e|ed|es|ing|ption|ptions)|estimat(?:e|ed|es|ing|ion|ions)|sensitivity|not available|remain(?:s|ed)? un(?:known|verified)|future work)\b|局限|限制|不确定|假设|估算|敏感性/iu;
const MAX_EXCERPT_CHARS = 24_000;
const MAX_EVIDENCE_SEGMENTS = 32;
const MAX_FIELD_EVIDENCE_CHARS = 8_000;
const MAX_AVAILABILITY_CHARS = 3_000;
const MAX_LIMITATION_CHARS = 5_000;

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
  text: string;
}

interface CanonicalAvailabilityWindow {
  headingOrdinals: number[];
  contentOrdinals: number[];
  complete: boolean;
}

function normalizedSelectionText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

function headingSpanLength(
  blocks: PromptCanonicalBlock[],
  start: number,
  pattern: RegExp,
): number {
  let joined = '';
  for (let length = 1; length <= 4 && start + length <= blocks.length; length += 1) {
    joined = normalizedSelectionText(`${joined} ${blocks[start + length - 1]!.text}`);
    pattern.lastIndex = 0;
    if (pattern.test(joined)) return length;
  }
  return 0;
}

function canonicalAvailabilityWindows(blocks: PromptCanonicalBlock[]): CanonicalAvailabilityWindow[] {
  const windows: CanonicalAvailabilityWindow[] = [];
  for (let index = 0; index < blocks.length;) {
    const headingLength = headingSpanLength(blocks, index, AVAILABILITY_HEADING);
    if (headingLength === 0) {
      index += 1;
      continue;
    }
    const headingOrdinals = blocks.slice(index, index + headingLength).map(({ ordinal }) => ordinal);
    const contentOrdinals: number[] = [];
    let characters = 0;
    let complete = true;
    let cursor = index + headingLength;
    while (cursor < blocks.length) {
      if (headingSpanLength(blocks, cursor, AVAILABILITY_STOP_HEADING) > 0
        || headingSpanLength(blocks, cursor, AVAILABILITY_HEADING) > 0) break;
      const block = blocks[cursor]!;
      if (characters + block.text.length > MAX_AVAILABILITY_CHARS) {
        complete = false;
        break;
      }
      contentOrdinals.push(block.ordinal);
      characters += block.text.length;
      cursor += 1;
    }
    windows.push({ headingOrdinals, contentOrdinals, complete });
    index = Math.max(cursor, index + headingLength);
  }
  return windows;
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
    ...block, ordinal, promptId: `B${String(ordinal + 1).padStart(6, '0')}`,
  }));
}

function selectCanonicalBlocks(sourceMap: DocumentSourceMap): PromptCanonicalBlock[] {
  const blocks = promptCanonicalBlocks(sourceMap);
  const selected = new Set<number>();
  let remaining = MAX_EXCERPT_CHARS;
  const renderedLength = (block: PromptCanonicalBlock) => `--- SOURCE_BLOCK id:${block.promptId} ---\n${block.text}\n\n`.length;
  const addRange = (start: number, end: number): boolean => {
    const candidates = blocks.slice(start, end + 1).filter((block) => !selected.has(block.ordinal));
    const cost = candidates.reduce((total, block) => total + renderedLength(block), 0);
    if (cost > remaining) return false;
    candidates.forEach((block) => selected.add(block.ordinal));
    remaining -= cost;
    return true;
  };
  // Availability statements are short, source-defined reproducibility facts.
  // Reserve them before repeated Methods/Results headings can consume the
  // middle budget. Exact source blocks and locators remain unchanged.
  let availabilitySpent = 0;
  for (const window of canonicalAvailabilityWindows(blocks)) {
    const ordinals = [...window.headingOrdinals, ...window.contentOrdinals];
    const first = ordinals[0]!;
    const last = ordinals.at(-1)!;
    const before = remaining;
    if (addRange(first, last)) availabilitySpent += before - remaining;
    if (availabilitySpent >= MAX_AVAILABILITY_CHARS) break;
  }

  // Give explicit limitations, assumptions, estimates, and uncertainty
  // contexts their own bounded allowance. Rank explicit headings first, then
  // restore document order in the final prompt.
  const limitationCandidates = blocks
    .filter((block) => LIMITATION_EVIDENCE.test(normalizedSelectionText(block.text)))
    .map((block) => {
      const text = normalizedSelectionText(block.text);
      return {
        block,
        priority: /^(?:limitations?|constraints?|uncertaint(?:y|ies)|局限|限制|不确定)$/iu.test(text)
          ? 0
          : /\b(?:limitations?|constraints?|uncertaint(?:y|ies)|not available|remain(?:s|ed)? un(?:known|verified))\b|局限|限制|不确定/iu.test(text)
            ? 1
            : 2,
      };
    })
    .sort((left, right) => left.priority - right.priority || left.block.ordinal - right.block.ordinal);
  let limitationSpent = 0;
  for (const { block } of limitationCandidates) {
    if (limitationSpent >= MAX_LIMITATION_CHARS) break;
    const before = remaining;
    const start = Math.max(0, block.ordinal - 2);
    const end = Math.min(blocks.length - 1, block.ordinal + 2);
    if (addRange(start, end)) limitationSpent += before - remaining;
  }

  let headCost = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const cost = renderedLength(blocks[index]!);
    if (headCost + cost > 8_000 || !addRange(index, index)) break;
    headCost += cost;
  }
  for (const block of blocks) {
    if (remaining <= 8_000) break;
    KEY_EVIDENCE.lastIndex = 0;
    if (KEY_EVIDENCE.test(block.text)) addRange(Math.max(0, block.ordinal - 3), Math.min(blocks.length - 1, block.ordinal + 3));
  }
  let tailCost = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const cost = selected.has(index) ? 0 : renderedLength(blocks[index]!);
    if (tailCost + cost > 8_000 || !addRange(index, index)) break;
    tailCost += cost;
  }
  return blocks.filter((block) => selected.has(block.ordinal));
}

function canonicalBlockPrompt(blocks: PromptCanonicalBlock[]): string {
  return blocks.map((block) => `--- SOURCE_BLOCK id:${block.promptId} ---\n${block.text}`).join('\n\n');
}

type CanonicalFieldValidationReason =
  | 'malformed_item'
  | 'missing_requires_empty'
  | 'summary_required'
  | 'segment_count_1_to_32'
  | 'duplicate_ids'
  | 'unknown_ids'
  | 'ordered_ids_required'
  | 'source_text_limit_8000'
  | 'all_fields_missing';

interface CanonicalRepairResponse {
  schemaVersion: string;
  fields: Record<string, unknown>;
}

function canonicalProposalValidation(blocks: PromptCanonicalBlock[]): {
  guard: SchemaGuard<CanonicalRepairResponse>;
  validationFeedback: (value: unknown) => string | undefined;
  validationDiagnostic: (value: unknown) => string | undefined;
  validationRejectedFields: () => ReadonlySet<string>;
  allFieldsMissingExhausted: () => boolean;
  mergeRetained: () => ExtractedProposal;
} {
  const allowed = new Map(blocks.map((block) => [block.promptId, block]));
  const retained = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();
  const rejectedFields = new Set<string>();
  let invalidFields = new Map<string, CanonicalFieldValidationReason>();
  let allFieldsMissing = false;
  let allFieldsMissingRejections = 0;
  const validateField = (item: unknown): { candidate?: ExtractedFieldProposal; reason?: CanonicalFieldValidationReason } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { reason: 'malformed_item' };
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sourceBlockIds,summary'
      || typeof candidate.summary !== 'string' || typeof candidate.needsMoreInformation !== 'boolean'
      || !Array.isArray(candidate.sourceBlockIds) || candidate.sourceBlockIds.some((id) => typeof id !== 'string')) {
      return { reason: 'malformed_item' };
    }
    const ids = candidate.sourceBlockIds as string[];
    if (candidate.needsMoreInformation) {
      return candidate.summary.trim() || ids.length > 0
        ? { reason: 'missing_requires_empty' }
        : { candidate: candidate as unknown as ExtractedFieldProposal };
    }
    if (!candidate.summary.trim()) return { reason: 'summary_required' };
    if (ids.length === 0 || ids.length > MAX_EVIDENCE_SEGMENTS) return { reason: 'segment_count_1_to_32' };
    if (new Set(ids).size !== ids.length) return { reason: 'duplicate_ids' };
    if (ids.some((id) => !allowed.has(id))) return { reason: 'unknown_ids' };
    const selected = ids.map((id) => allowed.get(id)!);
    if (selected.some((block, index) => index > 0 && block.ordinal <= selected[index - 1]!.ordinal)) {
      return { reason: 'ordered_ids_required' };
    }
    if (selected.reduce((total, block) => total + block.text.length, 0) > MAX_FIELD_EVIDENCE_CHARS) {
      return { reason: 'source_text_limit_8000' };
    }
    return { candidate: candidate as unknown as ExtractedFieldProposal };
  };
  const guard: SchemaGuard<CanonicalRepairResponse> = (value: unknown): value is CanonicalRepairResponse => {
    invalidFields = new Map();
    allFieldsMissing = false;
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
      // Every valid field, including an explicit missing field, is final for
      // this response. Repair prompts request only invalid fields; allowing a
      // later attempt to rewrite a retained missing field made that contract
      // contradictory and could exhaust retries on otherwise valid output.
      if (previous) continue;
      const validation = validateField(fields[field]);
      if (validation.candidate) retained.set(field, validation.candidate);
      else if (!previous) {
        invalidFields.set(field, validation.reason!);
        rejectedFields.add(field);
      }
    }
    if (invalidFields.size === 0 && SDF_CORE_FIELDS.every((field) => retained.get(field)?.needsMoreInformation === true)) {
      allFieldsMissing = true;
      allFieldsMissingRejections += 1;
      for (const field of SDF_CORE_FIELDS) invalidFields.set(field, 'all_fields_missing');
      // Aggregate rejection reopens all six fields; partial valid missing fields remain retained.
      retained.clear();
    }
    return invalidFields.size === 0;
  };
  return {
    guard,
    validationFeedback: () => {
      if (invalidFields.size === 0) return undefined;
      const details = [...invalidFields].map(([field, reason]) => `${field}:${reason}`).join(', ');
      const allMissingFeedback = allFieldsMissing
        ? 'All six fields were marked missing. Re-examine every field independently against the supplied SOURCE_BLOCKs. Populate every field that has direct support; a field may remain missing only when the source truly provides no direct evidence. Do not invent or weaken evidence requirements.'
        : undefined;
      return [
        'Previous JSON failed canonical validation.',
        `Invalid fields and reason codes: ${details}.`,
        ...(allMissingFeedback ? [allMissingFeedback] : []),
        'Return schemaVersion and fields containing only the invalid fields listed above; already validated fields are retained locally and need not be repeated.',
        'For each repaired non-missing field, write one core statement with its necessary conditions, then select 1-32 blocks that jointly support it; a non-missing field may never have an empty sourceBlockIds array. If more are needed, narrow the statement before selecting evidence; never truncate necessary evidence.',
        'A missing field must have summary="", sourceBlockIds=[], needsMoreInformation=true. Do not include a nonempty explanation in a missing field.',
        'Use only the minimal sufficient SOURCE_BLOCK ids in strictly increasing source order; unrelated blocks may be skipped.',
        'Do not quote or repeat source text in this correction instruction; use the SOURCE_BLOCK ids already provided.',
      ].join(' ');
    },
    validationDiagnostic: () => invalidFields.size === 0
      ? undefined
      : [...invalidFields].map(([field, reason]) => `${field}:${reason}`).join(','),
    validationRejectedFields: () => rejectedFields,
    allFieldsMissingExhausted: () => allFieldsMissingRejections === 3,
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

function fullBlockSegment(sourceMap: DocumentSourceMap, block: PromptCanonicalBlock) {
  return {
    quote: block.text,
    sourceLocator: validateSourceLocator({
      artifactId: sourceMap.artifactId,
      contentHash: sourceMap.contentHash,
      blockId: block.id,
      page: block.page,
      boundingBox: block.boundingBox,
      charRange: { start: block.originalStart, end: block.originalStart + block.text.length },
    }),
  };
}

function emptyIdentityItem(field: 'authors' | 'scalar'): SourceIdentityProposalItem {
  return { state: 'not_extracted', value: field === 'authors' ? [] : '', evidenceSegments: [] };
}

type IdentityField = 'title' | 'authors' | 'doi' | 'articleLicense';
type GeometricPromptCanonicalBlock = PromptCanonicalBlock & {
  boundingBox: NonNullable<PromptCanonicalBlock['boundingBox']>;
};

function geometricBlocksOrUndefined(
  blocks: PromptCanonicalBlock[],
): GeometricPromptCanonicalBlock[] | undefined {
  if (blocks.some((block) => block.boundingBox === undefined)) return undefined;
  return blocks as GeometricPromptCanonicalBlock[];
}

function reviewIdentityItem(field: IdentityField): SourceIdentityProposalItem {
  return { state: 'needs_review', value: field === 'authors' ? [] : '', evidenceSegments: [] };
}

function finalizeSourceIdentityProposal(
  proposal: SourceIdentityProposal,
  sourceMap: DocumentSourceMap,
): SourceIdentityProposal {
  try {
    return parseSourceIdentityProposal(proposal, {
      artifactId: sourceMap.artifactId,
      contentHash: sourceMap.contentHash,
    });
  } catch {
    // Supplemental metadata must not make valid SDF extraction unavailable.
    return parseSourceIdentityProposal({
      schemaVersion: '0.1.0',
      title: reviewIdentityItem('title'),
      authors: reviewIdentityItem('authors'),
      doi: reviewIdentityItem('doi'),
      articleLicense: reviewIdentityItem('articleLicense'),
    }, { artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash });
  }
}

function boundedIdentitySegments(sourceMap: DocumentSourceMap, blocks: PromptCanonicalBlock[]) {
  const geometricBlocks = geometricBlocksOrUndefined(blocks);
  if (!geometricBlocks || geometricBlocks.length === 0 || geometricBlocks.length > MAX_EVIDENCE_SEGMENTS
    || blocks.some((block) => block.text.length > MAX_FIELD_EVIDENCE_CHARS)
    || blocks.reduce((total, block) => total + block.text.length, 0) > MAX_FIELD_EVIDENCE_CHARS) {
    return undefined;
  }
  try {
    return geometricBlocks.map((block) => fullBlockSegment(sourceMap, block));
  } catch {
    return undefined;
  }
}

function sourceIdentityFromFirstPage(sourceMap: DocumentSourceMap): SourceIdentityProposal {
  const pageNumber = sourceMap.pages[0]?.page;
  const blocks = promptCanonicalBlocks(sourceMap).filter((block) => block.page === pageNumber);
  const proposal = {
    schemaVersion: '0.1.0',
    title: emptyIdentityItem('scalar'),
    authors: emptyIdentityItem('authors'),
    doi: emptyIdentityItem('scalar'),
    articleLicense: emptyIdentityItem('scalar'),
  } as SourceIdentityProposal;
  const assign = (field: IdentityField, item: SourceIdentityProposalItem) => {
    try {
      const parsed = parseSourceIdentityProposal({ ...proposal, [field]: item }, {
        artifactId: sourceMap.artifactId,
        contentHash: sourceMap.contentHash,
      });
      proposal[field] = parsed[field];
    } catch {
      // Metadata is supplemental to SDF extraction. Preserve a review state
      // rather than letting an oversized or malformed metadata candidate fail
      // the six scientific fields.
      proposal[field] = reviewIdentityItem(field);
    }
  };

  // The paper DOI is expected in first-page article metadata. Restricting the
  // search to page 1 avoids accidentally selecting a DOI from References.
  const doiCandidates = new Map<string, PromptCanonicalBlock>();
  for (const block of blocks) {
    for (const match of block.text.matchAll(/10\.\d{4,9}\/[^\s|<>]+/giu)) {
      const value = match[0].replace(/[),.;:\]}]+$/u, '').toLocaleLowerCase('en-US');
      if (value) doiCandidates.set(value, block);
    }
  }
  if (doiCandidates.size === 1) {
    const [value, block] = [...doiCandidates][0]!;
    const evidenceSegments = boundedIdentitySegments(sourceMap, [block]);
    assign('doi', evidenceSegments
      ? { state: 'proposed', value, evidenceSegments }
      : reviewIdentityItem('doi'));
  } else if (doiCandidates.size > 1) {
    const seen = new Set<string>();
    const candidateBlocks = [...doiCandidates.values()].filter((block) => {
      if (seen.has(block.id)) return false;
      seen.add(block.id);
      return true;
    });
    const evidenceSegments = boundedIdentitySegments(sourceMap, candidateBlocks);
    assign('doi', evidenceSegments
      ? { state: 'needs_review', value: '', evidenceSegments }
      : reviewIdentityItem('doi'));
  }

  const licenseIndex = blocks.findIndex((block) => /\bcc\s*by\s*4\.0\b/iu.test(block.text));
  if (licenseIndex >= 0) {
    const context = blocks.slice(Math.max(0, licenseIndex - 2), licenseIndex + 1);
    if (/creative\s+commons\s+attribution\s+license[\s\S]*cc\s*by\s*4\.0/iu
      .test(context.map(({ text }) => text).join(' '))) {
      const evidenceSegments = boundedIdentitySegments(sourceMap, context);
      assign('articleLicense', evidenceSegments
        ? { state: 'proposed', value: 'CC-BY-4.0', evidenceSegments }
        : reviewIdentityItem('articleLicense'));
    }
  }

  const articleTypeIndex = blocks.findIndex((block) => /^(?:research|review) article$|^(?:perspective|report)$/iu
    .test(normalizedSelectionText(block.text)));
  if (articleTypeIndex >= 0 && blocks[articleTypeIndex + 1]) {
    const firstTitleBlock = blocks[articleTypeIndex + 1]!;
    if (!firstTitleBlock.boundingBox) {
      assign('title', reviewIdentityItem('title'));
      assign('authors', reviewIdentityItem('authors'));
      return finalizeSourceIdentityProposal(proposal, sourceMap);
    }
    const titleHeight = firstTitleBlock.boundingBox.height;
    let authorStart = -1;
    let headerGeometryComplete = true;
    for (let index = articleTypeIndex + 1; index < Math.min(blocks.length, articleTypeIndex + 24); index += 1) {
      const block = blocks[index]!;
      if (!block.boundingBox) {
        headerGeometryComplete = false;
        break;
      }
      const normalized = normalizedSelectionText(block.text);
      const numericOrPunctuation = /^[\d,.*†‡\s]+$/u.test(normalized);
      if (!numericOrPunctuation && block.boundingBox.height < titleHeight * 0.8) {
        authorStart = index;
        break;
      }
    }
    if (!headerGeometryComplete) {
      assign('title', reviewIdentityItem('title'));
      assign('authors', reviewIdentityItem('authors'));
    } else if (authorStart > articleTypeIndex + 1) {
      const titleBlocks = geometricBlocksOrUndefined(blocks.slice(articleTypeIndex + 1, authorStart));
      if (!titleBlocks) {
        assign('title', reviewIdentityItem('title'));
        assign('authors', reviewIdentityItem('authors'));
        return finalizeSourceIdentityProposal(proposal, sourceMap);
      }
      const superscriptDigits: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      };
      const subscriptDigits: Record<string, string> = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      };
      let ambiguousScript = false;
      const titleValue = titleBlocks.map((block, blockIndex) => {
        const text = block.text.trim();
        if (!/^\d+$/u.test(text) || block.boundingBox.height >= titleHeight * 0.8) return text;
        const neighboringLargeBlocks = titleBlocks.filter((candidate, candidateIndex) => (
          Math.abs(candidateIndex - blockIndex) <= 2
          && candidate.boundingBox.height >= titleHeight * 0.8
          && Math.abs((candidate.boundingBox.y + candidate.boundingBox.height / 2)
            - (block.boundingBox.y + block.boundingBox.height / 2)) <= titleHeight
        ));
        if (neighboringLargeBlocks.length === 0) {
          ambiguousScript = true;
          return text;
        }
        const referenceCenter = neighboringLargeBlocks.reduce((total, candidate) => (
          total + candidate.boundingBox.y + candidate.boundingBox.height / 2
        ), 0) / neighboringLargeBlocks.length;
        const center = block.boundingBox.y + block.boundingBox.height / 2;
        const verticalDelta = referenceCenter - center;
        const threshold = Math.max(1, titleHeight * 0.15);
        if (verticalDelta > threshold) {
          return [...text].map((digit) => superscriptDigits[digit] ?? digit).join('');
        }
        if (verticalDelta < -threshold) {
          return [...text].map((digit) => subscriptDigits[digit] ?? digit).join('');
        }
        ambiguousScript = true;
        return text;
      }).join(' ')
        .replace(/\s+([⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+)/gu, '$1')
        .replace(/\s+/gu, ' ');
      const titleEvidence = boundedIdentitySegments(sourceMap, titleBlocks);
      assign('title', titleEvidence && titleValue.length <= 1_000
        ? { state: ambiguousScript ? 'needs_review' : 'proposed', value: titleValue, evidenceSegments: titleEvidence }
        : reviewIdentityItem('title'));

      const authorBlocks: PromptCanonicalBlock[] = [];
      const authors: string[] = [];
      let uncertain = false;
      let authorBoundaryFound = false;
      let authorGeometryComplete = true;
      const authorScanEnd = Math.min(blocks.length, authorStart + 80);
      const authorStartBlock = blocks[authorStart]!;
      for (let index = authorStart; index < authorScanEnd; index += 1) {
        const block = blocks[index]!;
        const previous = index > authorStart ? blocks[index - 1] : undefined;
        const previousBox = previous?.boundingBox;
        if (!block.boundingBox || (previous && !previousBox) || !authorStartBlock.boundingBox) {
          authorGeometryComplete = false;
          break;
        }
        const next = blocks[index + 1];
        const normalized = normalizedSelectionText(block.text);
        const affiliationMarker = /^\d+(?:,\d+)*[\s*†‡§]*$/u.test(normalized)
          && block.boundingBox.x <= authorStartBlock.boundingBox.x + 8
          && (!!next && /\b(?:university|institute|laborator(?:y|ies)|department|school|centre|center|academy|hospital|infrastructure)\b/iu.test(next.text)
            || previousBox !== undefined && block.boundingBox.y - previousBox.y > 16);
        if (affiliationMarker) {
          authorBoundaryFound = true;
          break;
        }
        if (/^[\d,.*†‡§\s]+$/u.test(normalized)) continue;
        const name = block.text
          .replace(/^\s*,?\s*(?:and\s+)?/iu, '')
          .replace(/[,*†‡\s]+$/gu, '')
          .trim();
        if (!name) continue;
        if (!/^[\p{L}\p{M}.'’\-]+(?:\s+[\p{L}\p{M}.'’\-]+){1,7}$/u.test(name)) uncertain = true;
        authors.push(name);
        authorBlocks.push(block);
      }
      if (!authorBoundaryFound && authorScanEnd < blocks.length) uncertain = true;
      if (!authorGeometryComplete) {
        assign('authors', reviewIdentityItem('authors'));
      } else if (authors.length > 0) {
        const authorEvidence = boundedIdentitySegments(sourceMap, authorBlocks);
        const boundedAuthors = authors.length <= 100 && authors.every((author) => author.length <= 300);
        assign('authors', authorEvidence && boundedAuthors
          ? { state: uncertain ? 'needs_review' : 'proposed', value: authors, evidenceSegments: authorEvidence }
          : reviewIdentityItem('authors'));
      }
    }
  }

  return finalizeSourceIdentityProposal(proposal, sourceMap);
}

function deterministicAvailabilityProposal(
  sourceMap: DocumentSourceMap,
  promptBlocks: PromptCanonicalBlock[],
): { status: 'absent' | 'unrepresentable'; proposal?: undefined }
  | { status: 'usable'; proposal: ExtractedFieldProposal } {
  const allBlocks = promptCanonicalBlocks(sourceMap);
  const windows = canonicalAvailabilityWindows(allBlocks);
  if (windows.length === 0) return { status: 'absent' };
  const selected = new Set(promptBlocks.map(({ promptId }) => promptId));
  const content = windows.flatMap((window) => window.contentOrdinals.map((ordinal) => allBlocks[ordinal]!));
  if (windows.some((window) => !window.complete)
    || content.length === 0 || content.length > MAX_EVIDENCE_SEGMENTS
    || content.some((block) => !selected.has(block.promptId))
    || content.reduce((total, block) => total + block.text.length, 0) > MAX_FIELD_EVIDENCE_CHARS) {
    // Never truncate a request condition, negation, or repository URL merely
    // to fit the evidence contract. An availability section that cannot be
    // represented completely remains explicitly missing.
    return { status: 'unrepresentable' };
  }
  return {
    status: 'usable',
    proposal: {
      // Preserve the source wording and line boundaries. In particular, do not
      // silently repair printed hyphens or URLs in a scientific source.
      summary: content.map(({ text }) => text).join('\n'),
      sourceQuote: '',
      sourceBlockIds: content.map(({ promptId }) => promptId),
      needsMoreInformation: false,
    },
  };
}

function canonicalMissingCause(
  field: (typeof SDF_CORE_FIELDS)[number],
  sourceMap: DocumentSourceMap,
  promptBlocks: PromptCanonicalBlock[],
  validationRejectedFields: ReadonlySet<string>,
): ExtractionMissingCause {
  if (validationRejectedFields.has(field)) return 'validation_rejected';
  const cuePatterns: Record<(typeof SDF_CORE_FIELDS)[number], RegExp> = {
    problem: /\b(?:problem|challenge|need|gap)\b|问题|挑战/iu,
    insight: /\b(?:insight|demonstrat|reveal|show(?:s|n)?|find(?:s|ing)?)\b|洞见|发现/iu,
    method: /\b(?:methods?|experimental setup|procedure|protocol)\b|方法|实验装置/iu,
    results: /\b(?:results?|we (?:find|show|demonstrate|observe|measure))\b|结果|我们(?:发现|观察|测量)/iu,
    limitations: LIMITATION_EVIDENCE,
    reproducibility: /\b(?:data|code) availability\b|\breproduc|数据可用|代码可用|复现/iu,
  };
  const pattern = cuePatterns[field];
  const selectedIds = new Set(promptBlocks.map(({ id }) => id));
  let cueSelected = false;
  let cueOutsideSelection = false;
  for (const block of promptCanonicalBlocks(sourceMap)) {
    pattern.lastIndex = 0;
    if (!pattern.test(normalizedSelectionText(block.text))) continue;
    if (selectedIds.has(block.id)) cueSelected = true;
    else cueOutsideSelection = true;
  }
  if (cueOutsideSelection && !cueSelected) return 'not_selected';
  return cueSelected ? 'model_no_supported_summary' : 'undetermined';
}

function materializeCanonicalProposal(
  proposal: ExtractedProposal,
  sourceMap: DocumentSourceMap,
  promptBlocks: PromptCanonicalBlock[],
  validationRejectedFields: ReadonlySet<string> = new Set(),
): ExtractionResult {
  const byPromptId = new Map(promptBlocks.map((block) => [block.promptId, block]));
  const core = { schemaVersion: SDF_CORE_VERSION } as ExtractedCore;
  const evidence = {} as ExtractionResult['evidence'];
  const evidenceLocation = {} as NonNullable<ExtractionResult['evidenceLocation']>;
  const evidenceSegments = {} as NonNullable<ExtractionResult['evidenceSegments']>;
  const needsMoreInformation: ExtractionResult['needsMoreInformation'] = [];
  const missingDetails: NonNullable<ExtractionResult['missingDetails']> = {};
  const availability = deterministicAvailabilityProposal(sourceMap, promptBlocks);
  for (const field of SDF_CORE_FIELDS) {
    const availabilityUnavailable = field === 'reproducibility' && availability.status === 'unrepresentable';
    const candidate = field === 'reproducibility' && availability.status === 'usable'
      ? availability.proposal
      : availabilityUnavailable
        ? { summary: '', sourceQuote: '', sourceBlockIds: [], needsMoreInformation: true }
        : proposal.fields[field];
    const ids = candidate.sourceBlockIds ?? [];
    if (candidate.needsMoreInformation) {
      core[field] = '';
      evidence[field] = { quote: '', locator: '' };
      evidenceSegments[field] = [];
      evidenceLocation[field] = { status: 'missing', origin: 'model_quote', reason: 'empty-quote' };
      needsMoreInformation.push(field);
      missingDetails[field] = {
        cause: availabilityUnavailable
          ? 'validation_rejected'
          : canonicalMissingCause(field, sourceMap, promptBlocks, validationRejectedFields),
      };
      continue;
    }
    const segments = ids.map((id) => {
      const block = byPromptId.get(id)!;
      const sourceLocator = validateSourceLocator({
        artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash,
        blockId: block.id, page: block.page, boundingBox: block.boundingBox,
        charRange: { start: block.originalStart, end: block.originalStart + block.text.length },
      });
      return { quote: block.text, sourceLocator };
    });
    // Compatibility projection only: evidenceSegments retain the independent exact quotes and locators;
    // this newline-joined string never represents a contiguous source passage or a source locator.
    const quote = segments.map((segment) => segment.quote).join('\n');
    core[field] = candidate.summary.trim();
    evidence[field] = { quote, locator: `blocks:${ids.join(',')}` };
    evidenceSegments[field] = segments;
    evidenceLocation[field] = segments.length === 1
      ? { status: 'located', sourceLocator: segments[0]!.sourceLocator, origin: 'model_quote', matching: 'exact' }
      : { status: 'cross_block', origin: 'model_quote', matching: 'exact', reason: 'match-spans-blocks' };
  }
  return { core, evidence, needsMoreInformation, missingDetails, evidenceLocation, evidenceSegments };
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
  const missingDetails: NonNullable<ExtractionResult['missingDetails']> = {};
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
        missingDetails[field] = { cause: 'undetermined' };
        if (sourceMap && evidenceLocation && blocks) {
          evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, explicit.quote, 'explicit_field_label', manuscriptText, explicitMatches);
        }
      }
    } else {
      core[field] = '';
      evidence[field] = { quote: '', locator: '' };
      needsMoreInformation.push(field);
      missingDetails[field] = { cause: 'undetermined' };
      if (sourceMap && evidenceLocation && blocks) {
        evidenceLocation[field] = locateCanonicalEvidence(sourceMap, blocks, candidate.sourceQuote, 'model_quote', manuscriptText, matches);
      }
    }
  }
  return { core, evidence, needsMoreInformation, missingDetails, ...(evidenceLocation ? { evidenceLocation } : {}) };
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
  const prompt = [
    { role: 'system' as const, content: [
      '你是科研结构化提取器。从给定 SOURCE 片段提取 SDF 六字段 problem/insight/method/results/limitations/reproducibility。',
      '保持证据类型与认识边界：明确区分实验实测、理论估计、数值仿真、作者归因或解释、以及讨论中的能力或上限；不得把其中一种改写成另一种，也不得把讨论上限写成已验证性能。',
      '保持物理量身份：明确区分入射量与局域量、场振幅与强度、脉冲能量与功率，并保留数值、单位、比例的对象和适用条件；除非原文明确给出关系，不得自行换算或混用。',
      'summary 中的每个分句、数字、比较、因果或能力限定都必须由所选原文直接支持；可跳过无关页眉或噪声块，但不得跨越缺失的中间论证拼接新结论。作者提出的原因必须写成作者归因，不能写成已证因果。',
      '方法或配置披露不等于独立复现完成；reproducibility 只能概括原文明示的材料、参数、步骤、数据或代码可用性及其缺口。若某个条款缺少直接证据，从 summary 删除该条款；若字段已无可支持内容，则按缺失字段返回 needsMoreInformation=true。',
      ...(promptBlocks ? [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须且只能是 {"summary": string, "sourceBlockIds": string[], "needsMoreInformation": boolean}，不得把字段写成字符串、数组或增加其他键。',
        `sourceBlockIds 必须选择 1-${MAX_EVIDENCE_SEGMENTS} 个最少充分 SOURCE_BLOCK id，按原文顺序严格递增，合计不超过 ${MAX_FIELD_EVIDENCE_CHARS} 字符；可跳过无关块，选择的完整块不得改写、倒序或重复。`,
        '逐字段独立判断：所选块共同充分支持 summary；单块可能只是断行、符号或单位，无需独立成句或独立证明整句。可跨行或跨段综合，但必须保留否定、适用条件和数值单位，不借未选文本补足论证。',
        '每字段先用一句话概括一个核心要点及其必要条件，再选共同支持这句话的最少块。若需超过32块，应先缩小陈述范围，不能任意截断必要证据。不要因一个字段缺失而清空其他字段，不穷举细节或所有相关段落。',
        '跨行示例（仅说明结构，不是 SOURCE，严禁引用示例 ID）：EXAMPLE_1="方法甲测量"、EXAMPLE_2="量乙。"共同支持"方法甲测量量乙。"；正式输出只能使用用户输入的 SOURCE_BLOCK id。',
        '严格区分理论预测、仿真与实测，不能把缺少主语或限定词的片段扩写成实验结论；results 中的理论或仿真结果必须明确注明其性质。',
        '若材料不足，summary 置空、sourceBlockIds=[]、needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
      ] : [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须含 summary、sourceQuote、needsMoreInformation。',
        'sourceQuote 必须逐字复制 SOURCE 中支持 summary 的最短充分原文；不得概括、改写或虚构引文。',
        '若材料不足，summary 与 sourceQuote 置空，needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
      ]),
    ].join(' ') },
    { role: 'user' as const, content: promptBlocks ? canonicalBlockPrompt(promptBlocks) : selectManuscriptEvidence(manuscriptText) },
  ];
  if (canonicalSourceMap && promptBlocks) {
    const validation = canonicalProposalValidation(promptBlocks);
    try {
      await gateway.completeStructured(validation.guard, prompt, {
        temperature: 0.2,
        validationFeedback: validation.validationFeedback,
        validationDiagnostic: validation.validationDiagnostic,
      });
    } catch (error) {
      if (validation.allFieldsMissingExhausted()) {
        throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_all_fields_missing', error);
      }
      throw error;
    }
    const extraction = materializeCanonicalProposal(
      validation.mergeRetained(),
      canonicalSourceMap,
      promptBlocks,
      validation.validationRejectedFields(),
    );
    return { ...extraction, sourceIdentity: sourceIdentityFromFirstPage(canonicalSourceMap) };
  }
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText);
}
