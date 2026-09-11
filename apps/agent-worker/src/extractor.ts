import { AiGatewayError, SCIENCE_REVIEW_MAX_PROMPT_CHARS, type AiGateway, type OcrAuthorizationContext, type SchemaGuard, type ScienceReviewAttachment } from '@openscience/ai-gateway';
import { createHash } from 'node:crypto';
import {
  createBlockSourceLocator,
  MAX_CANONICAL_EVIDENCE_CHARS,
  MAX_CANONICAL_EVIDENCE_SEGMENTS,
  parseDocumentSourceMap,
  resolveSourceLocator,
  validateSourceLocator,
  type DocumentSourceMap,
  type SourceLocator,
} from '@openscience/domain';
import { SDF_CORE_FIELDS, SDF_CORE_VERSION } from '@openscience/sdf-schema';
import { RESEARCH_UNDERSTANDING_SKILL } from './skills/research-understanding.js';
import { PAPER_ANALYSIS_SKILL } from './skills/paper-analysis.js';
import type { ParserRasterResult } from './parsers/job-protocol';

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
  scientificReview?: {
    provider: 'chatgpt-web-science-review';
    model: 'chatgpt-web/6-pro';
    contractVersion: '4';
    status: 'review_received' | 'awaiting_review_evidence' | 'blocked_scientific_review';
    attemptId: string;
    promptHash?: string;
    responseHash?: string;
    reviewedCandidateHash: string;
    previousAttemptId?: string;
    evidenceManifestHash?: string;
    evidencePages?: Array<{ pageNumber: number; imageSha256: string }>;
    continuationStatus?: 'provider_unavailable' | 'invalid_response';
    continuationAttemptId?: string;
  };
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
const MAX_EVIDENCE_SEGMENTS = MAX_CANONICAL_EVIDENCE_SEGMENTS;
const MAX_FIELD_EVIDENCE_CHARS = MAX_CANONICAL_EVIDENCE_CHARS;
const MAX_CANONICAL_CORE_CHARS = 4_000;
const CHINESE_NARRATION = /[\u3400-\u9fff]/u;
const BROKEN_SCIENTIFIC_NOTATION = /[⁺⁻](?![⁰¹²³⁴⁵⁶⁷⁸⁹])|\b\d+(?:\.\d+)?e[+-](?!\d)|10\^\{\s*\}/iu;

function canonicalSummaryQualityReason(text: string): 'language_violation' | 'math_integrity_error' | undefined {
  if (!CHINESE_NARRATION.test(text)) return 'language_violation';
  if (BROKEN_SCIENTIFIC_NOTATION.test(text)) return 'math_integrity_error';
  return undefined;
}

function hasDirectQuantitativeResultCandidate(passages: readonly CanonicalPassage[]): boolean {
  const resultLanguage = /\b(?:calculated|measured|obtained|achieved|shows?|yielded|increased|decreased)\b|(?:计算|测得|得到|达到|显示|增加|降低)/iu;
  const quantity = /(?:\d+(?:\.\d+)?\s*(?:as|fs|ps|ns|Hz|kHz|MHz|GHz|THz|PHz|nm|μm|mm|cm|mJ|pC|MeV|W\/m²|%)|[ζτν]\s*[≈=<>])/iu;
  return passages.some((passage) => resultLanguage.test(passage.text) && quantity.test(passage.text));
}

function resultSummaryQualityReason(
  summary: string,
  passages: readonly CanonicalPassage[],
): 'results_not_outcome' | undefined {
  if (!hasDirectQuantitativeResultCandidate(passages)) return undefined;
  const evidenceClass = /(?:理论|数值|模拟|仿真|计算|预测|估计|实验|实测|测量|观测|观察)/u;
  return evidenceClass.test(summary) ? undefined : 'results_not_outcome';
}

function focusedQuantitativeResultPassages(passages: readonly CanonicalPassage[]): CanonicalPassage[] {
  const resultLanguage = /\b(?:calculated|measured|obtained|achieved|shows?|yielded|increased|decreased|predicted|estimated)\b|(?:计算|测得|得到|达到|显示|增加|降低|预测|估计)/giu;
  const quantities = /\d+(?:\.\d+)?\s*(?:as|fs|ps|ns|Hz|kHz|MHz|GHz|THz|PHz|nm|μm|mm|cm|mJ|pC|MeV|W\/m²|%)/giu;
  const ranked = passages.map((passage, index) => {
    const resultSignals = passage.text.match(resultLanguage)?.length ?? 0;
    const quantitySignals = passage.text.match(quantities)?.length ?? 0;
    const figureSignal = /\bFig(?:ure)?\.?\s*[A-Z]?\d+/iu.test(passage.text) ? 1 : 0;
    const comparisonSignal = /\b(?:agree|compared|versus|vs\.?|corresponding|same)\b|(?:一致|相比|对应)/iu.test(passage.text) ? 1 : 0;
    return { passage, index, score: resultSignals * 4 + Math.min(quantitySignals, 6) * 2 + figureSignal * 2 + comparisonSignal };
  }).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 12);
  const selected = new Set(ranked.map((candidate) => candidate.passage.id));
  return passages.filter((passage) => selected.has(passage.id));
}
const CANONICAL_EXTRACTION_CONTRACT = 'grounded-passages-v2';

interface ReadingMapResult {
  summary: string;
  sourcePassageIds: string[];
}

interface PaperReadingSynthesis {
  overview: string;
  fields: Record<(typeof SDF_CORE_FIELDS)[number], { summary: string; sourcePassageIds: string[] }>;
}

function readingMapGuard(allowedIds: ReadonlySet<string>): SchemaGuard<ReadingMapResult> {
  return (value: unknown): value is ReadingMapResult => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return typeof item.summary === 'string' && item.summary.trim().length > 0 && item.summary.length <= 6_000
      && Array.isArray(item.sourcePassageIds) && item.sourcePassageIds.length > 0 && item.sourcePassageIds.length <= 32
      && item.sourcePassageIds.every((id) => typeof id === 'string' && allowedIds.has(id));
  };
}

const paperSynthesisGuard: SchemaGuard<PaperReadingSynthesis> = (value): value is PaperReadingSynthesis => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.overview !== 'string' || !item.overview.trim() || item.overview.length > 8_000
    || !item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)) return false;
  const fields = item.fields as Record<string, unknown>;
  return SDF_CORE_FIELDS.every((field) => {
    const candidate = fields[field];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const record = candidate as Record<string, unknown>;
    return typeof record.summary === 'string' && record.summary.length <= 4_000
      && Array.isArray(record.sourcePassageIds) && record.sourcePassageIds.length <= 32
      && record.sourcePassageIds.every((id) => typeof id === 'string');
  });
};

async function buildPaperReadingSynthesis(gateway: AiGateway, passages: readonly CanonicalPassage[]): Promise<PaperReadingSynthesis | undefined> {
  const windows: CanonicalPassage[][] = [];
  let current: CanonicalPassage[] = [];
  let currentChars = 0;
  for (const passage of passages) {
    if (current.length && currentChars + passage.text.length > 18_000) {
      windows.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(passage);
    currentChars += passage.text.length;
  }
  if (current.length) windows.push(current);
  if (windows.length < 2) return undefined;
  const maps = new Array<ReadingMapResult>(windows.length);
  let nextWindow = 0;
  const worker = async () => {
    while (nextWindow < windows.length) {
      const index = nextWindow;
      nextWindow += 1;
      const window = windows[index]!;
      maps[index] = await gateway.completeStructured(readingMapGuard(new Set(window.map((passage) => passage.id))), [
        { role: 'system', content: `${PAPER_ANALYSIS_SKILL.instructions}\n你正在执行section-map。完整阅读本窗口，输出一个JSON对象：summary为中文阅读记录，sourcePassageIds为支撑这些观察的P编号。记录研究对象、条件、假设、方法、公式、结果、局限、图表关系及与其他章节的依赖；不能按六字段机械摘抄，不能猜测乱码。` },
        { role: 'user', content: canonicalPassagePrompt(window) },
      ], { temperature: 0.1, maxRetries: 1 });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(2, windows.length) }, () => worker()));
    const knownIds = new Set(passages.map((passage) => passage.id));
    const reduced = await gateway.completeStructured(paperSynthesisGuard, [
      { role: 'system', content: `${PAPER_ANALYSIS_SKILL.instructions}\n你正在执行global-reduce。综合全部section-map阅读记录，重建论文完整研究逻辑并按六个SDF维度给出候选综合。输出严格JSON：overview字符串；fields包含problem/insight/method/results/limitations/reproducibility，每项只有summary和sourcePassageIds。不同算例不能混合，明确理论、模拟和实验身份；ID只能来自输入。` },
      { role: 'user', content: JSON.stringify(maps) },
    ], { temperature: 0.1, maxRetries: 1 });
    for (const field of SDF_CORE_FIELDS) {
      reduced.fields[field].sourcePassageIds = reduced.fields[field].sourcePassageIds.filter((id) => knownIds.has(id));
    }
    return reduced;
  } catch (error) {
    console.error('paper-analysis map/reduce unavailable; preserving canonical single-pass fallback', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

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
  | 'core_text_limit_4000'
  | 'language_violation'
  | 'math_integrity_error'
  | 'results_not_outcome';

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

interface ScientificReviewContext {
  requestId: string;
  authorizationContext: Readonly<OcrAuthorizationContext>;
  persistedCandidateHash?: string;
  reusableAttempt?: { attemptId: string; reviewedCandidateHash: string; parentRequestId: string; contractVersion: string };
  coveragePassageIds?: readonly string[];
  renderPages?: (pageNumbers: readonly number[]) => Promise<ParserRasterResult>;
  sourceDocument?: { fileName: 'source.pdf'; mediaType: 'application/pdf'; sha256: string; bytes: Uint8Array };
}

type ScientificReviewField = {
  verdict: 'accepted' | 'revised' | 'blocked';
  summary: string;
  sourcePassageIds: string[];
  issues: Array<{ code: 'RELATION_MISMATCH' | 'EVIDENCE_TYPE_OVERCLAIM' | 'FIELD_MISPLACED' | 'QUALIFIER_LOSS' | 'PHYSICS_MISINTERPRETATION'; problem: string; sourcePassageIds: string[] }>;
};
type ScientificReviewResponse = {
  fields: Record<(typeof SDF_CORE_FIELDS)[number], ScientificReviewField>;
  needsMoreEvidence: Array<{
    affectedFields: Array<(typeof SDF_CORE_FIELDS)[number]>;
    question: string;
    requestedContext: string;
  }>;
};
export const SCIENCE_REVIEW_CONTRACT_VERSION = '4';
const SCIENCE_REVIEW_SUPPLEMENTAL_CONTRACT_VERSION = '3';

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reviewAttemptId(parentTaskId: string, sourceMapHash: string, candidateHash: string, evidenceManifestHash?: string): string {
  const seed = evidenceManifestHash
    ? `${parentTaskId}\0${sourceMapHash}\0${candidateHash}\0science-v${SCIENCE_REVIEW_CONTRACT_VERSION}\0${evidenceManifestHash}\0supplemental-v${SCIENCE_REVIEW_SUPPLEMENTAL_CONTRACT_VERSION}`
    : `${parentTaskId}\0${sourceMapHash}\0${candidateHash}\0science-v${SCIENCE_REVIEW_CONTRACT_VERSION}`;
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  const parse = (value: string) => {
    try { return JSON.parse(value); }
    catch {
      let normalized = '', inString = false, escaped = false;
      for (const character of value) {
        if (!inString) {
          normalized += character;
          if (character === '"') inString = true;
          continue;
        }
        if (escaped) {
          normalized += character;
          escaped = false;
          continue;
        }
        if (character === '\\') {
          normalized += character;
          escaped = true;
          continue;
        }
        if (character === '"') {
          normalized += character;
          inString = false;
          continue;
        }
        const code = character.charCodeAt(0);
        normalized += code < 0x20
          ? ({ '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[character]
            ?? `\\u${code.toString(16).padStart(4, '0')}`)
          : character;
      }
      return JSON.parse(normalized);
    }
  };
  try { return parse(cleaned); } catch { /* extract one bounded object below */ }
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('scientific review response is not JSON');
  return parse(cleaned.slice(start, end + 1));
}

function selectScienceReviewPassages(passages: readonly CanonicalPassage[], proposal: ExtractedProposal, coveragePassageIds: readonly string[] = []): CanonicalPassage[] {
  const selected = new Set(SDF_CORE_FIELDS.flatMap((field) => proposal.fields[field].sourcePassageIds ?? []));
  for (const id of coveragePassageIds) selected.add(id);
  for (const passage of focusedQuantitativeResultPassages(passages)) selected.add(passage.id);
  const conflictTerms = /(?:φ|ϕ|theta|θ|angle|collision|head-on|perpendicular|polar|unipolar|bipolar|side.?lobe|symmetr|far.?field|near.?field|bandwidth|limitation|approximately|≈|正碰|垂直|极性|旁瓣|对称|远场|近场|带宽|局限)/iu;
  passages.forEach((passage, index) => {
    if (!conflictTerms.test(passage.text)) return;
    selected.add(passage.id);
    if (index > 0) selected.add(passages[index - 1]!.id);
    if (index + 1 < passages.length) selected.add(passages[index + 1]!.id);
  });
  const boundaryPatterns = [
    /(?:condition|assuming|assumption|provided that|only when|valid for|where\s|denote|defined as|条件|假设|定义|适用)/iu,
    /(?:limitation|however|except|restricted|cannot|does not|局限|限制|然而|不能|不适用)/iu,
    /(?:compared with|relative to|baseline|reference|previous|prior|对比|相比|基准|已有工作)/iu,
    /(?:discussion|conclusion|we demonstrate|we show|we find|本文表明|结论|讨论)/iu,
  ];
  for (const pattern of boundaryPatterns) {
    for (const passage of passages.filter((candidate) => pattern.test(candidate.text)).slice(0, 2)) selected.add(passage.id);
  }
  const required = new Set([...SDF_CORE_FIELDS.flatMap((field) => proposal.fields[field].sourcePassageIds ?? []), ...coveragePassageIds]);
  const ordered = passages.filter((passage) => selected.has(passage.id));
  const result: CanonicalPassage[] = [];
  let characters = 0;
  for (const passage of ordered.sort((left, right) => Number(required.has(right.id)) - Number(required.has(left.id)) || left.pageStart - right.pageStart)) {
    if (!required.has(passage.id) && characters + passage.evidenceChars > 26_000) continue;
    result.push(passage); characters += passage.evidenceChars;
  }
  return result.sort((left, right) => left.pageStart - right.pageStart || left.id.localeCompare(right.id));
}

function scientificReviewGuard(value: unknown, allowedIds: ReadonlySet<string>): value is ScientificReviewResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (Object.keys(root).sort().join(',') !== 'fields,needsMoreEvidence' || !root.fields || typeof root.fields !== 'object' || Array.isArray(root.fields)
    || !Array.isArray(root.needsMoreEvidence) || root.needsMoreEvidence.length > 8) return false;
  for (const need of root.needsMoreEvidence) {
    if (!need || typeof need !== 'object' || Array.isArray(need)) return false;
    const item = need as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== 'affectedFields,question,requestedContext'
      || !Array.isArray(item.affectedFields) || item.affectedFields.length < 1 || item.affectedFields.length > SDF_CORE_FIELDS.length
      || new Set(item.affectedFields).size !== item.affectedFields.length
      || item.affectedFields.some((field) => !SDF_CORE_FIELDS.includes(field as (typeof SDF_CORE_FIELDS)[number]))
      || typeof item.question !== 'string' || !item.question.trim() || item.question.length > 500
      || typeof item.requestedContext !== 'string' || !item.requestedContext.trim() || item.requestedContext.length > 500) return false;
  }
  const fields = root.fields as Record<string, unknown>;
  if (Object.keys(fields).sort().join(',') !== [...SDF_CORE_FIELDS].sort().join(',')) return false;
  for (const field of SDF_CORE_FIELDS) {
    const candidate = fields[field];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== 'issues,sourcePassageIds,summary,verdict'
      || !['accepted', 'revised', 'blocked'].includes(String(item.verdict)) || typeof item.summary !== 'string' || item.summary.length > MAX_CANONICAL_CORE_CHARS
      || !Array.isArray(item.sourcePassageIds) || item.sourcePassageIds.length > MAX_SOURCE_PASSAGE_IDS
      || new Set(item.sourcePassageIds).size !== item.sourcePassageIds.length
      || item.sourcePassageIds.some((id) => typeof id !== 'string' || !allowedIds.has(id))
      || !Array.isArray(item.issues) || item.issues.length > 8) return false;
    if (item.verdict === 'blocked' ? item.summary !== '' || item.sourcePassageIds.length !== 0 : !item.summary.trim() || item.sourcePassageIds.length === 0) return false;
    for (const issue of item.issues) {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return false;
      const entry = issue as Record<string, unknown>;
      if (Object.keys(entry).sort().join(',') !== 'code,problem,sourcePassageIds'
        || !['RELATION_MISMATCH', 'EVIDENCE_TYPE_OVERCLAIM', 'FIELD_MISPLACED', 'QUALIFIER_LOSS', 'PHYSICS_MISINTERPRETATION'].includes(String(entry.code))
        || typeof entry.problem !== 'string' || !entry.problem.trim() || entry.problem.length > 500
        || !Array.isArray(entry.sourcePassageIds) || entry.sourcePassageIds.length < 1
        || entry.sourcePassageIds.some((id) => typeof id !== 'string' || !allowedIds.has(id))) return false;
    }
  }
  return true;
}

function fieldsAffectedByReviewEvidence(review: ScientificReviewResponse): Set<(typeof SDF_CORE_FIELDS)[number]> {
  const affected = new Set<(typeof SDF_CORE_FIELDS)[number]>();
  for (const need of review.needsMoreEvidence) {
    for (const field of need.affectedFields) affected.add(field);
  }
  return affected;
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
  const validateField = (field: (typeof SDF_CORE_FIELDS)[number], item: unknown): { candidate?: ExtractedFieldProposal; reason?: CanonicalFieldValidationReason; detail?: string } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { reason: 'malformed_item' };
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sourcePassageIds,summary'
      || typeof candidate.summary !== 'string' || typeof candidate.needsMoreInformation !== 'boolean'
      || !Array.isArray(candidate.sourcePassageIds)) return { reason: 'malformed_item' };
    if (candidate.needsMoreInformation) {
      if (candidate.summary.trim() || candidate.sourcePassageIds.length) return { reason: 'missing_requires_empty' };
      return { candidate: { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true } };
    }
    if (!candidate.summary.trim()) return { reason: 'summary_required' };
    if (candidate.summary.length > MAX_CANONICAL_CORE_CHARS) return { reason: 'core_text_limit_4000' };
    const qualityReason = canonicalSummaryQualityReason(candidate.summary);
    if (qualityReason) return { reason: qualityReason };
    const resultQualityReason = field === 'results' ? resultSummaryQualityReason(candidate.summary, passages) : undefined;
    if (resultQualityReason) return { reason: resultQualityReason };
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
      const validation = validateField(field, fields[field]);
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
      const compactFeedback = `Repair only the failed canonical fields. Failure=${failure}.${rejected} Return exactly one JSON object shaped ${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: shape })}; fields must have exactly these keys: ${nextExpectedFields.join(',')}. Other fields already passed server validation and are retained. For each nonempty summary use needsMoreInformation=false and valid P labels. For capacity errors, remove redundant wording and passages no retained claim needs; never truncate a scientific condition or leave a retained claim unsupported. Method may use dispersed key assumptions, steps and validation without every derivation. Reproducibility uses only directly disclosed parameters, materials, procedures, data/code availability and explicit access gaps. Expanded evidence must fit ${MAX_EVIDENCE_SEGMENTS} segments and ${MAX_FIELD_EVIDENCE_CHARS} chars. If one response cannot contain sufficient evidence, preserve the candidate as an unresolved capacity issue; never call it an author omission. Do not return quotes or commentary.`;
      const fallbackFeedback = `Repair only failed fields (${failure}). Return exactly schemaVersion and fields with these keys: ${nextExpectedFields.join(',')}; each field has exactly summary, sourcePassageIds, needsMoreInformation. Keep the smallest sufficient valid P-label set within ${MAX_EVIDENCE_SEGMENTS} segments/${MAX_FIELD_EVIDENCE_CHARS} chars, but never drop evidence for a retained claim or truncate a scientific condition. If one response cannot contain sufficient evidence, preserve the candidate as an unresolved capacity issue. Other fields are already retained. No quotes or commentary.`;
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

function previousCanonicalPartial(
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  value: unknown,
): CanonicalPartialResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const previous = value as Record<string, unknown>;
  if (previous.canonicalExtractionContract !== CANONICAL_EXTRACTION_CONTRACT
    || !previous.core || typeof previous.core !== 'object' || Array.isArray(previous.core)
    || !previous.evidence || typeof previous.evidence !== 'object' || Array.isArray(previous.evidence)
    || !Array.isArray(previous.needsMoreInformation)) return undefined;
  const core = previous.core as Record<string, unknown>;
  const evidence = previous.evidence as Record<string, unknown>;
  const needs = previous.needsMoreInformation;
  if (needs.some((field) => typeof field !== 'string' || !SDF_CORE_FIELDS.includes(field as (typeof SDF_CORE_FIELDS)[number]))
    || new Set(needs).size !== needs.length) return undefined;
  const needsSet = new Set(needs as Array<(typeof SDF_CORE_FIELDS)[number]>);
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const previousDrafts = previous.unverifiedSummaries && typeof previous.unverifiedSummaries === 'object'
    && !Array.isArray(previous.unverifiedSummaries) ? previous.unverifiedSummaries as Record<string, unknown> : {};
  const previousDraftIds = previous.unverifiedSourcePassageIds && typeof previous.unverifiedSourcePassageIds === 'object'
    && !Array.isArray(previous.unverifiedSourcePassageIds) ? previous.unverifiedSourcePassageIds as Record<string, unknown> : {};
  const previousDetails = previous.fieldDiagnosticsDetails && typeof previous.fieldDiagnosticsDetails === 'object'
    && !Array.isArray(previous.fieldDiagnosticsDetails) ? previous.fieldDiagnosticsDetails as Record<string, unknown> : {};
  const fields = {} as ExtractedProposal['fields'];
  const fieldDiagnostics: Record<string, CanonicalFieldValidationReason> = {};
  const fieldDiagnosticsDetails: Record<string, string> = {};
  const unverifiedSummaries: Record<string, string> = {};
  const unverifiedSourcePassageIds: Record<string, string[]> = {};
  for (const field of SDF_CORE_FIELDS) {
    const summary = core[field];
    const evidenceItem = evidence[field];
    if (typeof summary !== 'string' || !evidenceItem || typeof evidenceItem !== 'object' || Array.isArray(evidenceItem)) return undefined;
    const evidenceRecord = evidenceItem as Record<string, unknown>;
    if (typeof evidenceRecord.quote !== 'string' || typeof evidenceRecord.locator !== 'string') return undefined;
    const match = /^passages:(P\d{5}(?:,P\d{5})*)$/.exec(evidenceRecord.locator);
    const ids = match ? match[1]!.split(',') : [];
    const validIds = ids.length > 0 && new Set(ids).size === ids.length && ids.every((id) => passageById.has(id));
    const qualityReason = summary.trim()
      ? canonicalSummaryQualityReason(summary) ?? (field === 'results' ? resultSummaryQualityReason(summary, passages) : undefined)
      : undefined;
    if (needsSet.has(field) || qualityReason) {
      fields[field] = { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true };
      fieldDiagnostics[field] = qualityReason ?? 'malformed_item';
      const draft = typeof previousDrafts[field] === 'string' && previousDrafts[field] ? previousDrafts[field] as string : summary;
      if (draft) unverifiedSummaries[field] = draft;
      const draftIds = Array.isArray(previousDraftIds[field])
        ? (previousDraftIds[field] as unknown[]).filter((id): id is string => typeof id === 'string' && passageById.has(id))
        : validIds ? ids : [];
      if (draftIds.length && qualityReason !== 'results_not_outcome') unverifiedSourcePassageIds[field] = [...new Set(draftIds)];
      const detail = previousDetails[field];
      if (typeof detail === 'string' && detail) fieldDiagnosticsDetails[field] = detail;
      continue;
    }
    if (!summary.trim() || qualityReason || !validIds) return undefined;
    let verifiedSegments: Array<{ quote: string; sourceLocator: SourceLocator }>;
    try { verifiedSegments = segmentsForPassages(sourceMap, ids, passageById); }
    catch { return undefined; }
    const sourceQuote = verifiedSegments.map((segment) => segment.quote).join('\n');
    if (sourceQuote !== evidenceRecord.quote) return undefined;
    fields[field] = {
      summary,
      sourceQuote,
      sourcePassageIds: ids,
      sourceBlockIds: verifiedSegments.map((segment) => segment.sourceLocator.blockId!),
      verifiedSegments,
      needsMoreInformation: false,
    };
  }
  return { proposal: { schemaVersion: SDF_CORE_VERSION, fields }, fieldDiagnostics, fieldDiagnosticsDetails,
    unverifiedSummaries, unverifiedSourcePassageIds };
}

function persistedScientificReviewProposal(
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  partial: CanonicalPartialResult,
): ExtractedProposal | undefined {
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const fields = {} as ExtractedProposal['fields'];
  for (const field of SDF_CORE_FIELDS) {
    const current = partial.proposal.fields[field];
    if (!current.needsMoreInformation) {
      fields[field] = current;
      continue;
    }
    const summary = partial.unverifiedSummaries[field]?.trim();
    const ids = partial.unverifiedSourcePassageIds[field];
    if (!summary || !ids?.length) {
      fields[field] = current;
      continue;
    }
    if (new Set(ids).size !== ids.length || ids.some((id) => !passageById.has(id))) return undefined;
    let verifiedSegments: Array<{ quote: string; sourceLocator: SourceLocator }>;
    try { verifiedSegments = segmentsForPassages(sourceMap, ids, passageById); }
    catch { return undefined; }
    fields[field] = {
      summary,
      sourceQuote: verifiedSegments.map((segment) => segment.quote).join('\n'),
      sourcePassageIds: [...ids],
      sourceBlockIds: verifiedSegments.map((segment) => segment.sourceLocator.blockId!),
      verifiedSegments,
      needsMoreInformation: false,
    };
  }
  return { schemaVersion: SDF_CORE_VERSION, fields };
}

async function repairCanonicalPartial(
  gateway: AiGateway,
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  partial: CanonicalPartialResult,
): Promise<CanonicalPartialResult> {
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const repairFields = SDF_CORE_FIELDS.filter((field) => partial.proposal.fields[field].needsMoreInformation);
  if (!repairFields.length) return partial;
  const allPassageIds = passages.map((passage) => passage.id);
  const candidatesByField = new Map(repairFields.map((field) => {
    const prior = partial.fieldDiagnostics[field] === 'results_not_outcome'
      ? undefined
      : partial.unverifiedSourcePassageIds[field];
    return [field, new Set(prior?.length ? prior : allPassageIds)] as const;
  }));
  const repaired = new Map<(typeof SDF_CORE_FIELDS)[number], ExtractedFieldProposal>();
  const repairFailures = new Map<(typeof SDF_CORE_FIELDS)[number], string>();

  const supportedContext = Object.fromEntries(SDF_CORE_FIELDS.flatMap((field) => {
    const candidate = partial.proposal.fields[field];
    return candidate.needsMoreInformation ? [] : [[field, candidate.summary]];
  }));
  for (const field of repairFields) {
    const allowedIds = candidatesByField.get(field)!;
    const allCandidatePassages = passages.filter((passage) => allowedIds.has(passage.id));
    const focusedResults = field === 'results' ? focusedQuantitativeResultPassages(allCandidatePassages) : [];
    const candidatePassages = focusedResults.length ? focusedResults : allCandidatePassages;
    const hasGroundedDraft = Boolean(partial.unverifiedSummaries[field]?.trim()
      && partial.unverifiedSourcePassageIds[field]?.length);
    const evidenceLikelyPresent = hasGroundedDraft
      || (field === 'results' && hasDirectQuantitativeResultCandidate(candidatePassages));
    const readOnlyContext = field === 'results'
      ? Object.fromEntries(['method', 'limitations', 'reproducibility'].flatMap((name) => {
        const value = supportedContext[name];
        return typeof value === 'string' ? [[name, value]] : [];
      }))
      : supportedContext;
    let repairedField: ExtractedFieldProposal | undefined;
    let repairFailure = 'unresolved';
    const guard: SchemaGuard<Record<string, unknown>> = (value: unknown): value is Record<string, unknown> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { repairFailure = 'malformed_response'; return false; }
      const candidate = value as Record<string, unknown>;
      if (Object.keys(candidate).sort().join(',') !== 'needsMoreInformation,sourcePassageIds,summary'
        || typeof candidate.needsMoreInformation !== 'boolean' || typeof candidate.summary !== 'string'
        || !Array.isArray(candidate.sourcePassageIds)) {
        repairFailure = 'malformed_field_contract';
        return false;
      }
      if (candidate.needsMoreInformation) {
        if (evidenceLikelyPresent) { repairFailure = 'evidence_present_but_no_claim'; return false; }
        if (!candidate.summary.trim() && candidate.sourcePassageIds.length === 0) repairedField = {
          summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true,
        };
        else { repairFailure = 'missing_requires_empty'; return false; }
        return true;
      }
      const draftSummary = candidate.summary.trim();
      if (!draftSummary || draftSummary.length > MAX_CANONICAL_CORE_CHARS) { repairFailure = 'summary_required'; return false; }
      const qualityReason = canonicalSummaryQualityReason(draftSummary);
      if (qualityReason) { repairFailure = qualityReason; return false; }
      const resultQualityReason = field === 'results' ? resultSummaryQualityReason(draftSummary, candidatePassages) : undefined;
      if (resultQualityReason) { repairFailure = resultQualityReason; return false; }
      if (candidate.sourcePassageIds.length < 1 || candidate.sourcePassageIds.length > MAX_SOURCE_PASSAGE_IDS
        || candidate.sourcePassageIds.some((id) => typeof id !== 'string')
        || new Set(candidate.sourcePassageIds).size !== candidate.sourcePassageIds.length) {
        repairFailure = 'passage_ids_required'; return false;
      }
      const sourcePassageIds = candidate.sourcePassageIds as string[];
      if (sourcePassageIds.some((id) => !allowedIds.has(id))) { repairFailure = 'unknown_passage'; return false; }
      const budget = selectedPassageBudget(sourcePassageIds, passageById);
      if (budget.segmentCount > MAX_EVIDENCE_SEGMENTS || budget.evidenceChars > MAX_FIELD_EVIDENCE_CHARS) {
        repairFailure = 'evidence_budget'; return false;
      }
      let verifiedSegments: Array<{ quote: string; sourceLocator: SourceLocator }>;
      try { verifiedSegments = segmentsForPassages(sourceMap, sourcePassageIds, passageById); }
      catch { repairFailure = 'locator_roundtrip_failed'; return false; }
      repairedField = {
        summary: draftSummary,
        sourceQuote: verifiedSegments.map((segment) => segment.quote).join('\n'),
        sourcePassageIds,
        sourceBlockIds: verifiedSegments.map((segment) => segment.sourceLocator.blockId!),
        verifiedSegments,
        needsMoreInformation: false,
      };
      return true;
    };
    try {
      await gateway.completeStructured(guard, [{ role: 'system', content: [
        '你是Hermes科研证据修订器。每次只处理一个首轮留空或证据绑定失败的字段；候选原文来自同一已验证SourceMap。科学取舍由你完成，程序会回读P编号并核对来源身份与预算。',
        'summary必须使用中文；术语、单位和数学符号可保留。科学计数法指数、上下标和数学定界符必须完整；原文残缺时不要猜写。sourcePassageIds只选共同充分支持summary中全部主张的最小P编号集合。',
        ...(field === 'results' ? ['results必须报告论文在具体参数或条件下实际给出的结果，不得只复述方法、判据或研究目标。理论估计、数值计算、仿真与实验实测必须明确标注证据类型；同一主张只组合属于同一算例的数据，严禁把不同材料、结构或单电子/电子束条件混写。若候选有定量输出，优先保留一组参数完整且最能代表主要结论的数值、单位与比较。'] : []),
        '若候选不足、矛盾未解或任何核心主张没有充分来源，返回summary="",sourcePassageIds=[],needsMoreInformation=true。只有全文、图注及已提供附件均已覆盖时，才能把确实缺失的信息视为原文未报告；OCR缺失、附件未取得、容量或技术失败只能保持待核验。',
        '只输出一个JSON对象，且只能包含summary、sourcePassageIds、needsMoreInformation三个键。',
      ].join(' ') }, { role: 'user', content: [
        `已验证字段只读语境：${JSON.stringify(readOnlyContext)}`,
        `待修订诊断摘要（未验证；空字符串表示首轮未形成摘要）：${JSON.stringify({ [field]: partial.unverifiedSummaries[field] ?? '' })}`,
        `此前失败与实算预算：${JSON.stringify({ [field]: {
          reason: partial.fieldDiagnostics[field], detail: partial.fieldDiagnosticsDetails[field] ?? '',
        } })}`,
        canonicalPassagePrompt(candidatePassages),
      ].join('\n\n') }], {
        temperature: 0.1,
        maxRetries: 1,
        validationDiagnostic: () => `${field}:${repairFailure}`,
        validationFeedback: () => [
          `仅修复字段${field}，失败原因=${repairFailure}。`,
          `返回且只返回${JSON.stringify({ summary: '有充分原文支持且保留必要限定的中文摘要', sourcePassageIds: ['P00001'], needsMoreInformation: false })}形状的JSON。`,
          `若上一轮是内容或证据错误，收敛摘要并保留条件、数值、单位与比较对象；若是结构错误，只修结构。P编号必须来自本轮候选。${evidenceLikelyPresent ? '当前候选含直接证据信号，不得因格式修复困难声称缺失。' : '确无充分证据时才返回空summary、空sourcePassageIds且needsMoreInformation=true。'}`,
        ].join(' '),
      });
    } catch {
      if (!repairedField && repairFailure === 'unresolved') repairFailure = 'structured_response_failed';
    }
    if (repairedField) repaired.set(field, repairedField);
    else repairFailures.set(field, repairFailure);
  }
  for (const field of repairFields) {
    if (repaired.has(field)) continue;
    const existing = partial.fieldDiagnosticsDetails[field];
    partial.fieldDiagnosticsDetails[field] = [existing, `focusedRepair=${repairFailures.get(field) ?? 'unresolved'}`].filter(Boolean).join(';');
  }
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

function requestedEquationNumbers(review: ScientificReviewResponse): Set<number> {
  const text = JSON.stringify({ needsMoreEvidence: review.needsMoreEvidence,
    issues: Object.values(review.fields).flatMap((field) => field.issues) });
  const result = new Set<number>();
  for (const match of text.matchAll(/Eq(?:uation)?s?\.?\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/giu)) {
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 64) continue;
    for (let value = start; value <= end; value += 1) result.add(value);
  }
  return result;
}

function equationNumber(text: string | undefined): number | undefined {
  const match = /\(\s*(\d{1,3})\s*\)\s*$/u.exec(text?.trim() ?? '');
  const value = Number(match?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function supplementalPageNumbers(sourceMap: DocumentSourceMap, passages: readonly CanonicalPassage[], review: ScientificReviewResponse): number[] {
  const requested = requestedEquationNumbers(review);
  const formulaPages = new Set<number>();
  for (const page of sourceMap.pages) {
    if (page.blocks.some((block) => block.kind === 'equation' && requested.has(equationNumber(block.text) ?? -1))) formulaPages.add(page.page);
  }
  const contextPages = new Set<number>();
  const byId = new Map(passages.map((passage) => [passage.id, passage]));
  for (const id of Object.values(review.fields).flatMap((field) => field.issues.flatMap((issue) => issue.sourcePassageIds))) {
    const passage = byId.get(id);
    if (!passage) continue;
    for (let page = passage.pageStart; page <= passage.pageEnd; page += 1) contextPages.add(page);
  }
  return [...formulaPages].sort((left, right) => left - right)
    .concat([...contextPages].filter((page) => !formulaPages.has(page)).sort((left, right) => left - right)).slice(0, 8);
}

function supplementalEvidence(
  sourceMap: DocumentSourceMap,
  raster: ParserRasterResult,
  pageNumbers: readonly number[],
  review: ScientificReviewResponse,
): { manifest: Record<string, unknown>; manifestHash: string; attachments: ScienceReviewAttachment[] } {
  const requested = requestedEquationNumbers(review);
  const rendered = new Map(raster.pages.map((page) => [page.pageNumber, page]));
  const pages = pageNumbers.map((pageNumber) => {
    const sourcePage = sourceMap.pages.find((page) => page.page === pageNumber);
    const image = rendered.get(pageNumber);
    if (!sourcePage || !image) throw new Error('scientific review evidence page missing');
    const equations = sourcePage.blocks.filter((block) => block.kind === 'equation'
      && requested.has(equationNumber(block.text) ?? -1)).map((block) => ({
      blockId: block.id, boundingBox: block.boundingBox, unverifiedNativeText: block.text ?? '',
    }));
    const vision = sourcePage.blocks.filter((block) => block.parser.name === 'llm_ocr_candidate' && block.text?.trim()).map((block) => ({
      blockId: block.id,
      transcriptionHash: createHash('sha256').update(block.text!).digest('hex'),
      unverifiedTranscription: block.text!.slice(0, 4_000),
      provider: block.parser.version,
    }));
    const evidenceId = `IMG-${createHash('sha256').update(JSON.stringify({ artifactId: sourceMap.artifactId,
      contentHash: sourceMap.contentHash, pageNumber, equations: equations.map(({ blockId, boundingBox }) => ({ blockId, boundingBox })) }))
      .digest('hex').slice(0, 20)}`;
    return { evidenceId, pageNumber, pageWidth: sourcePage.width, pageHeight: sourcePage.height,
      imageSha256: image.contentHash, renderWidth: image.width, renderHeight: image.height, equations, vision };
  });
  const manifest = { schemaVersion: 1, source: { artifactId: sourceMap.artifactId, documentSha256: sourceMap.contentHash },
    requestedQuestions: review.needsMoreEvidence, pages };
  const manifestHash = sha256Json(manifest);
  const attachments = pageNumbers.map((pageNumber) => {
    const image = rendered.get(pageNumber)!;
    return { fileName: `page-${pageNumber}.png`, mediaType: 'image/png' as const, pageNumber,
      width: image.width, height: image.height, sha256: image.contentHash,
      bytes: Uint8Array.from(Buffer.from(image.bytesBase64, 'base64')) };
  });
  return { manifest, manifestHash, attachments };
}

function supplementalDocumentEvidence(
  sourceMap: DocumentSourceMap,
  pageNumbers: readonly number[],
  review: ScientificReviewResponse,
  sourceDocument: NonNullable<ScientificReviewContext['sourceDocument']>,
): { manifest: Record<string, unknown>; manifestHash: string; attachments: ScienceReviewAttachment[] } {
  if (sourceDocument.sha256 !== sourceMap.contentHash) throw new Error('scientific review source document identity mismatch');
  const manifest = {
    schemaVersion: 1,
    source: { artifactId: sourceMap.artifactId, documentSha256: sourceMap.contentHash },
    requestedQuestions: review.needsMoreEvidence,
    requestedPages: [...pageNumbers],
    attachment: { fileName: sourceDocument.fileName, mediaType: sourceDocument.mediaType, sha256: sourceDocument.sha256 },
  };
  return { manifest, manifestHash: sha256Json(manifest), attachments: [{ ...sourceDocument, bytes: Uint8Array.from(sourceDocument.bytes) }] };
}

async function webScientificReviewCanonicalProposal(
  gateway: AiGateway,
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  proposal: ExtractedProposal,
  context: ScientificReviewContext | undefined,
): Promise<{ partial: CanonicalPartialResult; review: ExtractionResult['scientificReview'] }> {
  const candidateHash = sha256Json({ schemaVersion: SDF_CORE_VERSION, fields: proposal.fields });
  const sourceMapHash = sha256Json(sourceMap);
  const attemptId = context?.reusableAttempt?.reviewedCandidateHash === candidateHash
      && context.reusableAttempt.contractVersion === SCIENCE_REVIEW_CONTRACT_VERSION
    ? context.reusableAttempt.attemptId
    : reviewAttemptId(context?.requestId ?? 'missing', sourceMapHash, candidateHash);
  const blockAll = (status: 'awaiting_review_evidence' | 'blocked_scientific_review', detail: string, metadata: {
    attemptId?: string; promptHash?: string; responseHash?: string; previousAttemptId?: string;
    evidenceManifestHash?: string; evidencePages?: Array<{ pageNumber: number; imageSha256: string }>;
  } = {}) => {
    const affected = SDF_CORE_FIELDS.filter((field) => !proposal.fields[field].needsMoreInformation);
    return {
      partial: {
        proposal: { schemaVersion: SDF_CORE_VERSION, fields: Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, affected.includes(field)
          ? { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true }
          : proposal.fields[field]])) as ExtractedProposal['fields'] },
        fieldDiagnostics: Object.fromEntries(affected.map((field) => [field, 'malformed_item' as const])),
        fieldDiagnosticsDetails: Object.fromEntries(affected.map((field) => [field, detail])),
        unverifiedSummaries: Object.fromEntries(affected.map((field) => [field, proposal.fields[field].summary])),
        unverifiedSourcePassageIds: Object.fromEntries(affected.map((field) => [field, proposal.fields[field].sourcePassageIds ?? []])),
      },
      review: { provider: 'chatgpt-web-science-review' as const, model: 'chatgpt-web/6-pro' as const,
        contractVersion: '4' as const,
        status, attemptId: metadata.attemptId ?? attemptId, reviewedCandidateHash: candidateHash,
        ...(metadata.promptHash ? { promptHash: metadata.promptHash } : {}),
        ...(metadata.responseHash ? { responseHash: metadata.responseHash } : {}),
        ...(metadata.previousAttemptId ? { previousAttemptId: metadata.previousAttemptId } : {}),
        ...(metadata.evidenceManifestHash ? { evidenceManifestHash: metadata.evidenceManifestHash } : {}),
        ...(metadata.evidencePages ? { evidencePages: metadata.evidencePages } : {}),
      },
    };
  };
  if (!context) return blockAll('blocked_scientific_review', 'scientificReview=trusted_context_unavailable');
  let reviewPassages = selectScienceReviewPassages(passages, proposal, context.coveragePassageIds);
  if (!reviewPassages.length) return blockAll('awaiting_review_evidence', 'scientificReview=no_review_evidence');
  let allowedIds = new Set(reviewPassages.map((passage) => passage.id));
  const current = Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, {
    summary: proposal.fields[field].summary,
    sourcePassageIds: proposal.fields[field].sourcePassageIds ?? [],
    needsMoreInformation: proposal.fields[field].needsMoreInformation,
  }]));
  try {
    const prompt = [
      '对一篇论文的六字段中文候选做独立科学复核。六字段是对整篇论文的六种用户视角，不是同名章节抽取；先理解附件原文及下方P编号段落的完整研究逻辑，再检查候选。候选不是证据，最终实质断言必须由P编号原文支撑。六字段必须同包审阅。',
      'problem凝练研究缺口与具体问题；insight凝练核心新认识或贡献；method跨引言、模型、推导、实验设置、结果分析、图注和附录，概括作者实际如何得到结果；results凝练有条件的关键输出；limitations凝练假设、适用边界与未解决问题；reproducibility给出依据全文可重建的最小研究配方，并明确作者未披露、因此不能独立复现的细节。缺少同名章节、作者未把步骤集中书写或未披露全部实现细节，都不等于Method或Reproducibility没有可概括内容。',
      '允许受约束的跨段综合：可以连接原文分别给出的研究对象、关系式、步骤和条件，但必须用“综合全文”“文中给出/由所列关系可得”等表述区分作者明示与Hermes综合；不得补造论文未给出的数值、步骤、实验或因果。未披露细节写成限定或复现缺口，不得把它改写成已完成步骤。',
      '六项summary直接展示给用户，采用凝练连贯的自然语言。软目标：problem 70–120字，insight 90–150字，method 140–220字，results 140–220字，limitations 80–150字，reproducibility 140–220字；必要限定优先于长度。不要照抄公式、枚举所有参数或写成审计报告。保留决定科学身份的理论/数值/实验性质、关键条件、代表性定量结果及会改变结论的限定。生图或视频所需的镜头、构图、视觉元素、动画和完整参数另由内部brief生成，禁止写入六项summary。',
      '逐字段检查物理对象、角度/坐标定义、关系符、主峰与异号旁瓣、近远场、适用条件、背景比较范围、理论/模拟/实验身份、字段归属和限定词。不要因文字流畅而放行。',
      'accepted表示候选已是有证据的凝练综合；revised表示用证据纠正、补足限定或压缩摘要；blocked仅用于现有全文无法形成任何科学上负责的字段摘要，或未解冲突会使所有可写摘要都误导。只要能写成准确的受限摘要，就必须accepted或revised，不能因局部未披露而清空整栏。',
      'needsMoreEvidence仅用于附件或当前P段中本应存在但不可读、缺页，或核验摘要核心主张所必需的特定公式/图注/相邻段尚未进入复核上下文；它不是“作者没有报告实现细节”的标记。作者未报告的事项应在reproducibility或limitations摘要中明确限定。提出needsMoreEvidence前先查阅随附原PDF；affectedFields必须结构化列出所有受影响字段，不能把范围藏在question文本里。',
      `只返回JSON对象，完整空结构如下：${JSON.stringify({
        fields: Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, {
          verdict: 'blocked', summary: '', sourcePassageIds: [], issues: [],
        }])),
        needsMoreEvidence: [],
      })}。每个verdict只能是accepted、revised或blocked；issues元素必须且只能含code、problem、sourcePassageIds，code只能是RELATION_MISMATCH、EVIDENCE_TYPE_OVERCLAIM、FIELD_MISPLACED、QUALIFIER_LOSS、PHYSICS_MISINTERPRETATION。六字段都必须出现。blocked字段summary为空、sourcePassageIds为空；其他字段必须给出可直接面向用户的完整中文凝练摘要。需要补证时needsMoreEvidence元素必须且只能含affectedFields、question、requestedContext；affectedFields是非空、无重复的六字段英文名数组。`,
      `固定候选（hash=${candidateHash}）：${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: current })}`,
      `直接证据与冲突上下文（sourceMapHash=${sourceMapHash}）：\n${canonicalPassagePrompt(reviewPassages)}`,
    ].join('\n\n');
    if (prompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS) {
      return blockAll('awaiting_review_evidence', 'scientificReview=review_packet_too_large');
    }
    let response = await gateway.reviewScientific({
      requestId: attemptId,
      authorizationContext: context.authorizationContext,
      source: { artifactId: sourceMap.artifactId, documentSha256: sourceMap.contentHash,
        candidateHash, sourceMapHash },
      prompt,
      ...(context.sourceDocument ? { attachments: [{
        ...context.sourceDocument,
        bytes: Uint8Array.from(context.sourceDocument.bytes),
      }] } : {}),
    });
    const parsedResponse = parseJsonObject(response.text);
    if (!scientificReviewGuard(parsedResponse, allowedIds)) return blockAll('blocked_scientific_review', 'scientificReview=invalid_response', {
      promptHash: response.promptHash, responseHash: response.responseHash,
    });
    const initialResponse = response;
    const initialReview = parsedResponse;
    let parsed: ScientificReviewResponse = parsedResponse;
    let finalAttemptId = attemptId;
    let evidenceManifestHash: string | undefined;
    let evidencePages: Array<{ pageNumber: number; imageSha256: string }> | undefined;
    let continuationStatus: 'provider_unavailable' | 'invalid_response' | undefined;
    let continuationAttemptId: string | undefined;
    let supplementalBlockedFields = new Set<(typeof SDF_CORE_FIELDS)[number]>();
    if (parsed.needsMoreEvidence.length > 0) {
      if (!context.sourceDocument && !context.renderPages) return blockAll('awaiting_review_evidence', 'scientificReview=evidence_renderer_unavailable', {
        promptHash: response.promptHash, responseHash: response.responseHash,
      });
      const pageNumbers = supplementalPageNumbers(sourceMap, reviewPassages, parsed);
      if (!pageNumbers.length) return blockAll('awaiting_review_evidence', 'scientificReview=requested_evidence_not_located', {
        promptHash: response.promptHash, responseHash: response.responseHash,
      });
      let evidence;
      try {
        evidence = context.sourceDocument
          ? supplementalDocumentEvidence(sourceMap, pageNumbers, parsed, context.sourceDocument)
          : supplementalEvidence(sourceMap, await context.renderPages!(pageNumbers), pageNumbers, parsed);
      } catch {
        return blockAll('awaiting_review_evidence', 'scientificReview=evidence_render_failed', {
          promptHash: response.promptHash, responseHash: response.responseHash,
        });
      }
      evidenceManifestHash = evidence.manifestHash;
      const imageAttachments = evidence.attachments.filter((attachment) => attachment.mediaType === 'image/png');
      evidencePages = imageAttachments.length
        ? imageAttachments.map(({ pageNumber, sha256 }) => ({ pageNumber, imageSha256: sha256 }))
        : undefined;
      finalAttemptId = reviewAttemptId(
        context.reusableAttempt?.parentRequestId ?? context.requestId,
        sourceMapHash,
        candidateHash,
        evidence.manifestHash,
      );
      const supplementalPassages = passages.filter((passage) => pageNumbers.some(
        (pageNumber) => passage.pageStart <= pageNumber && passage.pageEnd >= pageNumber,
      ));
      reviewPassages = [...new Map([...reviewPassages, ...supplementalPassages]
        .map((passage) => [passage.id, passage] as const)).values()]
        .sort((left, right) => left.pageStart - right.pageStart || left.id.localeCompare(right.id));
      allowedIds = new Set(reviewPassages.map((passage) => passage.id));
      const supplementalPrompt = [
        '这是同一论文候选的定点原始材料补证续审。上一轮审稿保持不可变；本轮是新的review attempt。附件是原始 PDF 或原始页图，可作为公式符号与版面的直接证据；OCR与视觉转录均是未验证辅助，不得替代附件原件。',
        `上一轮attempt=${attemptId}；本轮evidenceManifestHash=${evidence.manifestHash}。逐项解决上一轮needsMoreEvidence；重新按science-v${SCIENCE_REVIEW_CONTRACT_VERSION}语义判断：字段是跨全文凝练，作者未披露细节应写为限定或缺口，不能据此清空整栏。若关键原文仍不可读或缺页则继续填写needsMoreEvidence，不猜测；只在无法形成任何负责摘要或未解冲突使摘要必然误导时blocked。其他字段必须独立accepted或revised。`,
        `输出结构和裁定规则与上一轮相同，只返回JSON：${JSON.stringify({
          fields: Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, {
            verdict: 'blocked', summary: '', sourcePassageIds: [], issues: [],
          }])), needsMoreEvidence: [],
        })}。sourcePassageIds可以引用下方新增页段中的P编号；附件用于核对这些P编号内公式和定义的准确性。`,
        `固定候选（hash=${candidateHash}）：${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: current })}`,
        `上一轮科学复核：${JSON.stringify(parsed)}`,
        `冻结图像证据清单：${JSON.stringify(evidence.manifest)}`,
        `补证页对应的可引用原文段：\n${canonicalPassagePrompt(supplementalPassages)}`,
      ].join('\n\n');
      if (supplementalPrompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS) return blockAll('awaiting_review_evidence', 'scientificReview=supplemental_packet_too_large', {
        promptHash: response.promptHash, responseHash: response.responseHash, evidenceManifestHash, evidencePages,
      });
      try {
        response = await gateway.reviewScientific({
          requestId: finalAttemptId,
          authorizationContext: context.authorizationContext,
          source: { artifactId: sourceMap.artifactId, documentSha256: sourceMap.contentHash, candidateHash, sourceMapHash },
          prompt: supplementalPrompt,
          attachments: evidence.attachments,
        });
        const supplementalParsed = parseJsonObject(response.text);
        if (scientificReviewGuard(supplementalParsed, allowedIds)) parsed = supplementalParsed;
        else {
          continuationStatus = 'invalid_response';
          continuationAttemptId = finalAttemptId;
          finalAttemptId = attemptId;
          response = initialResponse;
          parsed = initialReview;
          const explicitlyAffected = fieldsAffectedByReviewEvidence(parsed);
          supplementalBlockedFields = explicitlyAffected.size ? explicitlyAffected : new Set(SDF_CORE_FIELDS);
        }
      } catch {
        continuationStatus = 'provider_unavailable';
        continuationAttemptId = finalAttemptId;
        finalAttemptId = attemptId;
        response = initialResponse;
        parsed = initialReview;
        const explicitlyAffected = fieldsAffectedByReviewEvidence(parsed);
        supplementalBlockedFields = explicitlyAffected.size ? explicitlyAffected : new Set(SDF_CORE_FIELDS);
      }
    }
    const reviewedFields = Object.fromEntries(SDF_CORE_FIELDS.map((field) => {
      const reviewed = parsed.fields[field];
      if (reviewed.verdict === 'blocked' || supplementalBlockedFields.has(field)) return [field, { summary: '', sourceQuote: '', sourcePassageIds: [], needsMoreInformation: true }];
      const segments = segmentsForPassages(sourceMap, reviewed.sourcePassageIds, new Map(reviewPassages.map((passage) => [passage.id, passage])));
      return [field, { summary: reviewed.summary.trim(), sourceQuote: segments.map((segment) => segment.quote).join('\n'),
        sourcePassageIds: reviewed.sourcePassageIds, verifiedSegments: segments, needsMoreInformation: false }];
    })) as ExtractedProposal['fields'];
    const blockedFields = SDF_CORE_FIELDS.filter((field) => parsed.fields[field].verdict === 'blocked' || supplementalBlockedFields.has(field));
    const reviewStatus = parsed.needsMoreEvidence.length
      ? 'awaiting_review_evidence'
      : blockedFields.length ? 'blocked_scientific_review' : 'review_received';
    return {
      partial: {
        proposal: { schemaVersion: SDF_CORE_VERSION, fields: reviewedFields },
        fieldDiagnostics: Object.fromEntries(blockedFields.map((field) => [field, 'malformed_item' as const])),
        fieldDiagnosticsDetails: Object.fromEntries(blockedFields.map((field) => [field, `scientificReview=${parsed.fields[field].issues.map((issue) => `${issue.code}:${issue.problem}`).join('|') || 'blocked'}${continuationStatus ? `|supplementalReview=${continuationStatus}` : ''}`])),
        unverifiedSummaries: Object.fromEntries(blockedFields.map((field) => [field, parsed.fields[field].summary || proposal.fields[field].summary])),
        unverifiedSourcePassageIds: Object.fromEntries(blockedFields.map((field) => [field, parsed.fields[field].sourcePassageIds.length ? parsed.fields[field].sourcePassageIds : proposal.fields[field].sourcePassageIds ?? []])),
      },
      review: { provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
        contractVersion: '4' as const,
        status: reviewStatus,
        attemptId: finalAttemptId, ...(finalAttemptId === attemptId ? {} : { previousAttemptId: attemptId }),
        promptHash: response.promptHash, responseHash: response.responseHash, reviewedCandidateHash: candidateHash,
        ...(evidenceManifestHash ? { evidenceManifestHash } : {}), ...(evidencePages ? { evidencePages } : {}),
        ...(continuationStatus && continuationAttemptId ? { continuationStatus, continuationAttemptId } : {}) },
    };
  } catch (error) {
    console.error('paper-analysis web scientific review unavailable; preserving proposals as unverified', error instanceof Error ? error.message : String(error));
    return blockAll('blocked_scientific_review', 'scientificReview=unavailable');
  }
}

async function reviewAndMaterializeCanonicalProposal(
  gateway: AiGateway,
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  proposal: ExtractedProposal,
  context?: ScientificReviewContext,
): Promise<ExtractionResult> {
  const reviewed = await webScientificReviewCanonicalProposal(gateway, sourceMap, passages, proposal, context);
  const result = { ...materializeCanonicalProposal(reviewed.partial.proposal), scientificReview: reviewed.review };
  if (Object.keys(reviewed.partial.fieldDiagnostics).length === 0) return result;
  return {
    ...result,
    reason: 'canonical_partial_validation_exhausted',
    fieldDiagnostics: reviewed.partial.fieldDiagnostics,
    fieldDiagnosticsDetails: reviewed.partial.fieldDiagnosticsDetails,
    unverifiedSummaries: reviewed.partial.unverifiedSummaries,
    unverifiedSourcePassageIds: reviewed.partial.unverifiedSourcePassageIds,
  };
}

async function reviewAndMaterializeCanonicalPartial(
  gateway: AiGateway,
  sourceMap: DocumentSourceMap,
  passages: readonly CanonicalPassage[],
  partial: CanonicalPartialResult,
  context?: ScientificReviewContext,
): Promise<ExtractionResult> {
  const reviewed = await reviewAndMaterializeCanonicalProposal(gateway, sourceMap, passages, partial.proposal, context);
  const unresolved = SDF_CORE_FIELDS.filter((field) => partial.fieldDiagnostics[field] && !reviewed.core[field]?.trim());
  if (!unresolved.length) return reviewed;
  const fieldDiagnostics = { ...(reviewed.fieldDiagnostics ?? {}) };
  const fieldDiagnosticsDetails = { ...(reviewed.fieldDiagnosticsDetails ?? {}) };
  const unverifiedSummaries = { ...(reviewed.unverifiedSummaries ?? {}) };
  const unverifiedSourcePassageIds = { ...(reviewed.unverifiedSourcePassageIds ?? {}) };
  for (const field of unresolved) {
    fieldDiagnostics[field] ??= partial.fieldDiagnostics[field]!;
    const details = [...new Set([
      fieldDiagnosticsDetails[field],
      partial.fieldDiagnosticsDetails[field],
    ].filter((value): value is string => Boolean(value)))];
    if (details.length) fieldDiagnosticsDetails[field] = details.join(';');
    if (!unverifiedSummaries[field] && partial.unverifiedSummaries[field]) {
      unverifiedSummaries[field] = partial.unverifiedSummaries[field]!;
    }
    if (!unverifiedSourcePassageIds[field]?.length && partial.unverifiedSourcePassageIds[field]?.length) {
      unverifiedSourcePassageIds[field] = [...partial.unverifiedSourcePassageIds[field]!];
    }
  }
  return {
    ...reviewed,
    reason: 'canonical_partial_validation_exhausted',
    fieldDiagnostics,
    fieldDiagnosticsDetails,
    unverifiedSummaries,
    unverifiedSourcePassageIds,
  };
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
    understandingSkill: { id: PAPER_ANALYSIS_SKILL.id, version: PAPER_ANALYSIS_SKILL.version },
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
  trustedContext: { sourceMap?: DocumentSourceMap; previousResult?: unknown; scientificReview?: ScientificReviewContext } = {},
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
  if (canonicalSourceMap && passages && trustedContext.previousResult) {
    const previousPartial = previousCanonicalPartial(canonicalSourceMap, passages, trustedContext.previousResult);
    if (previousPartial) {
      const reusableAttempt = trustedContext.scientificReview?.reusableAttempt;
      const persistedCandidateHash = trustedContext.scientificReview?.persistedCandidateHash
        ?? reusableAttempt?.reviewedCandidateHash;
      const persistedProposal = persistedCandidateHash
        ? persistedScientificReviewProposal(canonicalSourceMap, passages, previousPartial)
        : undefined;
      // Candidate reuse and review-response reuse are separate decisions. The
      // server has already rebound every retained/unverified field to this exact
      // SourceMap above, so it can be reviewed directly even when prior review
      // revisions changed the old candidate hash. webScientificReviewCanonicalProposal
      // still reuses a paid response only for an exact candidate hash + contract.
      if (persistedProposal) {
        return reviewAndMaterializeCanonicalProposal(
          gateway, canonicalSourceMap, passages, persistedProposal, trustedContext.scientificReview,
        );
      }
      const partial = await repairCanonicalPartial(gateway, canonicalSourceMap, passages, previousPartial);
      return Object.keys(partial.fieldDiagnostics).length === 0
        ? reviewAndMaterializeCanonicalProposal(gateway, canonicalSourceMap, passages, partial.proposal, trustedContext.scientificReview)
        : reviewAndMaterializeCanonicalPartial(gateway, canonicalSourceMap, passages, partial, trustedContext.scientificReview);
    }
  }
  const synthesis = canonicalSourceMap && passages ? await buildPaperReadingSynthesis(gateway, passages) : undefined;
  const scientificReview = trustedContext.scientificReview && synthesis
    ? { ...trustedContext.scientificReview,
        coveragePassageIds: [...new Set(SDF_CORE_FIELDS.flatMap((field) => synthesis.fields[field].sourcePassageIds))] }
    : trustedContext.scientificReview;
  const reducedPassages = synthesis && passages
    ? passages.filter((passage) => SDF_CORE_FIELDS.some((field) => synthesis.fields[field].sourcePassageIds.includes(passage.id)))
    : undefined;
  const analysisPassages = reducedPassages?.length ? reducedPassages : passages;
  const prompt = [
    { role: 'system' as const, content: [
      '你是Hermes科研阅读助手。综合给定全文理解论文，再用SDF六个展示维度 problem/insight/method/results/limitations/reproducibility 组织凝练内容；字段不对应固定章节或固定原文段落。',
      '保持证据类型与认识边界：明确区分实验实测、理论估计、数值仿真、作者归因或解释、以及讨论中的能力或上限；不得把其中一种改写成另一种，也不得把讨论上限写成已验证性能。',
      '保持物理量身份：明确区分入射量与局域量、场振幅与强度、脉冲能量与功率，并保留数值、单位、比例的对象和适用条件；除非原文明确给出关系，不得自行换算或混用。',
      'results必须写论文在具体条件下得到的研究输出，不得只复述方法、成立判据或研究目标；若原文有定量结果，优先给出同一算例中参数完整的代表性数值。明确标注理论估计、数值计算、仿真或实验实测，禁止把不同材料、结构或单电子/电子束算例拼接为一个结果。',
      '先理解全文研究逻辑并形成有依据的综合概括，再关联支持各项断言的来源。可以跨章节整合分散的建模、推导和研究步骤，不要求存在同名章节或单段总结；不得补造原文不存在的中间论证。来源须支撑数字、比较、因果、能力限定与必要条件；作者归因不能改写成已证因果。',
      '方法或配置披露不等于独立复现完成。reproducibility应跨全文凝练可据文重建的最小研究配方：研究对象与输入、关键关系或步骤、决定性参数与验证方式，并明确作者未披露、因此不能独立复现的细节。可以综合分散但相互支持的原文关系，不得发明参数或步骤；未披露细节是摘要中的限定或缺口，不是清空整个字段的理由。只有全文无法支持任何负责的复现概括时才返回needsMoreInformation=true。',
      ...(passages ? [
        RESEARCH_UNDERSTANDING_SKILL.instructions,
        PAPER_ANALYSIS_SKILL.instructions,
        ...(synthesis ? [`section-map与global-reduce已完成。下面的综合记录用于保持全文逻辑，最终主张仍只能引用随附的原始P段：${JSON.stringify(synthesis)}`] : []),
        '只输出JSON：schemaVersion="0.1.0"，fields下六个字段必须且只能是 {"summary":string,"sourcePassageIds":string[],"needsMoreInformation":boolean}。不得返回引文、窗口ID或来源正文。',
        `完整输出结构如下（这是空结构，不是论文结论；必须用原文支持的摘要与实际P编号填充）：${JSON.stringify({ schemaVersion: SDF_CORE_VERSION, fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: '', sourcePassageIds: [], needsMoreInformation: true }])) })}`,
        'sourcePassageIds必须是字符串数组，例如["P00001"]，不能填页码、对象或区间字符串。JSON字符串中的反斜杠必须转义；摘要优先使用普通文字与Unicode数学符号，避免输出不合法的LaTeX转义。',
        `每字段凝练成面向用户的中文精华，使用连贯自然语言；软目标为problem 70–120字、insight 90–150字、method 140–220字、results 140–220字、limitations 80–150字、reproducibility 140–220字，必要限定优先于长度。优先解释研究逻辑，不逐式重抄推导、不堆参数、不写审计过程。problem写缺口，insight写认识，method写研究路径，results写有条件输出，limitations写边界，reproducibility写可重建配方及披露缺口。同一来源可以支撑不同展示维度，但各维度语义不得重复。先完成全文综合，再为每个非空摘要选择通常1–${USUAL_SOURCE_PASSAGE_IDS}个关键sourcePassageIds作为最小充分集合；确有必要时可增加，容量不足应保留待续读状态，不能把容量失败改写成论文缺失。ID只能来自下方标签，服务端回读原始SourceMap，模型不要复制或改写证据。`,
        `摘要最多${MAX_CANONICAL_CORE_CHARS}字符；来源展开后合计最多${MAX_FIELD_EVIDENCE_CHARS}字符、${MAX_EVIDENCE_SEGMENTS}个精确来源段。每个passage最多5个原始块、1200字符，标签给出实际blocks和chars预算。方法用分布于全文的关键passage证明主要假设、研究步骤和验证，不需要引用每段中间推导；reproducibility选择能共同支持研究对象、输入、关键关系或步骤、决定性参数、验证方式及明确披露缺口的最少passage，不要附上整条方法链。允许由这些段落受约束地综合复现路径，但每项内容都必须可回溯。同一原始块内重叠或相邻的选段会合并，彼此分隔的选段保留为独立来源段并分别计入限额。`,
        '选择能完整支持主语、条件、否定、数字和单位的最少passage。不要为了符合限额扩大或改写结论。若无充分证据，summary="",sourcePassageIds=[],needsMoreInformation=true；缺失字段里的解释会被服务端丢弃，不影响其他有证据字段。无法辨认的公式不要猜写。',
      ] : [
        '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须含 summary、sourceQuote、needsMoreInformation。',
        'sourceQuote 必须逐字复制 SOURCE 中支持 summary 的最短充分原文；不得概括、改写或虚构引文。',
        '若材料不足，summary 与 sourceQuote 置空，needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
      ]),
    ].join(' ') },
    { role: 'user' as const, content: analysisPassages ? canonicalPassagePrompt(analysisPassages) : selectManuscriptEvidence(manuscriptText) },
  ];
  if (canonicalSourceMap && passages) {
    const validation = canonicalProposalValidation(canonicalSourceMap, passages);
    try {
      await gateway.completeStructured(validation.guard, prompt, {
        temperature: 0.2,
        validationFeedback: validation.validationFeedback,
        validationDiagnostic: validation.validationDiagnostic,
        maxRetries: 1,
      });
    } catch (error) {
      if (!(error instanceof AiGatewayError) || !['SCHEMA_VALIDATION', 'STRUCTURED_JSON_INVALID'].includes(error.code)) throw error;
      if (!(error.cause instanceof AiGatewayError) || !['SCHEMA_VALIDATION', 'STRUCTURED_JSON_INVALID'].includes(error.cause.code)) throw error;
      const initialPartial = validation.partialResult();
      if (!initialPartial) throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_validation_exhausted', error);
      const partial = await repairCanonicalPartial(gateway, canonicalSourceMap, passages, initialPartial);
      return Object.keys(partial.fieldDiagnostics).length === 0
        ? reviewAndMaterializeCanonicalProposal(gateway, canonicalSourceMap, passages, partial.proposal, scientificReview)
        : reviewAndMaterializeCanonicalPartial(gateway, canonicalSourceMap, passages, partial, scientificReview);
    }
    let proposal = validation.mergeRetained();
    if (SDF_CORE_FIELDS.some((field) => proposal.fields[field].needsMoreInformation)) {
      const focused = await repairCanonicalPartial(gateway, canonicalSourceMap, passages, {
        proposal,
        fieldDiagnostics: {},
        fieldDiagnosticsDetails: {},
        unverifiedSummaries: {},
        unverifiedSourcePassageIds: {},
      });
      proposal = focused.proposal;
    }
    if (SDF_CORE_FIELDS.every((field) => proposal.fields[field].needsMoreInformation)) {
      throw new AiGatewayError('SCHEMA_VALIDATION', 'canonical_all_fields_missing');
    }
    return reviewAndMaterializeCanonicalProposal(gateway, canonicalSourceMap, passages, proposal, scientificReview);
  }
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText);
}
