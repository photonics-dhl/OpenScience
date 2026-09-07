import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import {
  createBlockSourceLocator,
  resolveSourceLocator,
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
  textStart: number;
  textEnd: number;
  originalStart: number;
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
      blocks.push({ id: block.id, textStart: cursor, textEnd: cursor + text.length, originalStart });
      cursor += text.length;
    }
  }
  return blocks;
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
  const manuscriptText = trustedContext.sourceMap
    ? sourceMapToManuscriptText(trustedContext.sourceMap)
    : typeof task.payload?.manuscriptText === 'string' ? task.payload.manuscriptText : '';
  if (!manuscriptText.trim()) {
    throw new Error('缺少正文（payload.manuscriptText）');
  }
  const prompt = [
    { role: 'system' as const, content: [
      '你是科研结构化提取器。从给定 SOURCE 片段提取 SDF 六字段 problem/insight/method/results/limitations/reproducibility。',
      '只输出 JSON：schemaVersion="0.1.0"，fields 下每个字段必须含 summary、sourceQuote、needsMoreInformation。',
      'sourceQuote 必须逐字复制 SOURCE 中支持 summary 的最短充分原文；不得概括、改写或虚构引文。',
      '若材料不足，summary 与 sourceQuote 置空，needsMoreInformation=true；尤其不得把作者未声明的局限或复现条件补写出来。',
    ].join(' ') },
    { role: 'user' as const, content: selectManuscriptEvidence(manuscriptText) },
  ];
  const proposal = await gateway.completeStructured(sdfProposalGuard, prompt, { temperature: 0.2 });
  return materializeProposal(proposal, manuscriptText, trustedContext.sourceMap);
}
