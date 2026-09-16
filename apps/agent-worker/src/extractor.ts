import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
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
  | 'source_text_limit_8000';

interface CanonicalRepairResponse {
  schemaVersion: string;
  fields: Record<string, unknown>;
}

function canonicalProposalValidation(blocks: PromptCanonicalBlock[]): {
  guard: SchemaGuard<CanonicalRepairResponse>;
  validationFeedback: (value: unknown) => string | undefined;
  mergeRetained: () => ExtractedProposal;
} {
  const allowed = new Map(blocks.map((block) => [block.promptId, block]));
  const retained = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();
  let invalidFields = new Map<string, CanonicalFieldValidationReason>();
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
      if (previous && !previous.needsMoreInformation) continue;
      const validation = validateField(fields[field]);
      if (validation.candidate) retained.set(field, validation.candidate);
      else if (!previous) invalidFields.set(field, validation.reason!);
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
        'Return schemaVersion and fields containing only the invalid fields listed above; already validated fields are retained locally and need not be repeated.',
        'For each repaired field, write one core statement with its necessary conditions, then select at most 32 blocks that jointly support it. If more are needed, narrow the statement before selecting evidence; never truncate necessary evidence.',
        'A missing field must have summary="", sourceBlockIds=[], needsMoreInformation=true. Do not include a nonempty explanation in a missing field.',
        'Use only the minimal sufficient SOURCE_BLOCK ids in strictly increasing source order; unrelated blocks may be skipped.',
        'Do not quote or repeat source text in this correction instruction; use the SOURCE_BLOCK ids already provided.',
      ].join(' ');
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
  const byPromptId = new Map(promptBlocks.map((block) => [block.promptId, block]));
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
  return { core, evidence, needsMoreInformation, evidenceLocation, evidenceSegments };
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
  const prompt = [
    { role: 'system' as const, content: [
      '你是科研结构化提取器。从给定 SOURCE 片段提取 SDF 六字段 problem/insight/method/results/limitations/reproducibility。',
      '保持证据类型与认识边界：明确区分实验实测、理论估计、数值仿真、作者归因或解释、以及讨论中的能力或上限；不得把其中一种改写成另一种，也不得把讨论上限写成已验证性能。',
      '保持物理量身份：明确区分入射量与局域量、场振幅与强度、脉冲能量与功率，并保留数值、单位、比例的对象和适用条件；除非原文明确给出关系，不得自行换算或混用。',
      'summary 中的每个分句、数字、比较、因果或能力限定都必须由所选原文直接支持；可跳过无关页眉或噪声块，但不得跨越缺失的中间论证拼接新结论。作者提出的原因必须写成作者归因，不能写成已证因果。',
      '方法或配置披露不等于独立复现完成；reproducibility 只能概括原文明示的材料、参数、步骤、数据或代码可用性及其缺口。若某个条款缺少直接证据，从 summary 删除该条款；若字段已无可支持内容，则按缺失字段返回 needsMoreInformation=true。',
      ...(promptBlocks ? [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须且只能含 summary、sourceBlockIds、needsMoreInformation。',
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
    await gateway.completeStructured(validation.guard, prompt, {
      temperature: 0.2, validationFeedback: validation.validationFeedback,
    });
    return materializeCanonicalProposal(validation.mergeRetained(), canonicalSourceMap, promptBlocks);
  }
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText);
}
