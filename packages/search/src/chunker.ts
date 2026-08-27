import { createHash } from 'node:crypto';
import {
  parseDocumentSourceMap,
  validateSourceLocator,
  type DocumentBlock,
  type DocumentSourceMap,
  type SourceLocator,
} from '@openscience/domain';
import { tokenizeSearchText, tokenizeSearchTextWithOffsets, type SearchToken } from './tokenizer';
import { SEARCH_CHUNK_SCHEMA_VERSION, type ChunkDocumentInput, type SearchChunkDraft } from './types';

const MIN_CHUNK_TOKENS = 512;
const MAX_CHUNK_TOKENS = 1_024;
const MAX_CHUNK_CHARACTERS = 65_536;
const MAX_CLAIMS_PER_BLOCK = 32;
const MAX_CLAIMS_PER_DOCUMENT = 10_000;
const MAX_CLAIM_CHARACTERS = 1_000_000;
const INDIVISIBLE_KINDS = new Set<DocumentBlock['kind']>(['table', 'equation', 'reference']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ChunkUnit {
  blockId: string;
  text: string;
  tokenCount: number;
  locator: SourceLocator;
  claimIds: string[];
}

function validatedClaimIds(input: ChunkDocumentInput, blockIds: Set<string>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  let totalClaims = 0;
  let totalCharacters = 0;
  for (const [blockId, values] of Object.entries(input.claimIdsByBlockId ?? {})) {
    if (!blockIds.has(blockId)) throw new Error(`claim mapping references unknown block ${blockId}`);
    if (!Array.isArray(values)) throw new Error(`claim mapping for ${blockId} must be an array`);
    if (values.length > MAX_CLAIMS_PER_BLOCK) throw new Error(`claim limit exceeded for ${blockId}`);
    for (const id of values) {
      if (typeof id !== 'string' || !id.trim() || id.length > 200) {
        throw new Error(`claim mapping for ${blockId} contains an invalid claim ID`);
      }
      totalClaims += 1;
      totalCharacters += id.length;
      if (totalClaims > MAX_CLAIMS_PER_DOCUMENT || totalCharacters > MAX_CLAIM_CHARACTERS) {
        throw new Error('claim limit exceeded for document');
      }
    }
    const ids = [...new Set(values)].sort();
    result.set(blockId, ids);
  }
  return result;
}

function createValidatedLocator(
  sourceMap: DocumentSourceMap,
  page: number,
  block: DocumentBlock,
  charRange?: { start: number; end: number },
): SourceLocator {
  return validateSourceLocator({
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    blockId: block.id,
    page,
    boundingBox: { ...block.boundingBox },
    ...(charRange === undefined ? {} : { charRange }),
  });
}

function createUnit(
  sourceMap: DocumentSourceMap,
  page: number,
  block: DocumentBlock & { text: string },
  tokens: SearchToken[],
  startToken: number,
  endToken: number,
  claimIds: string[],
): ChunkUnit {
  const fullBlock = startToken === 0 && endToken === tokens.length;
  const start = fullBlock ? 0 : tokens[startToken]!.start;
  const end = fullBlock ? block.text.length : tokens[endToken - 1]!.end;
  return {
    blockId: block.id,
    text: block.text.slice(start, end),
    tokenCount: endToken - startToken,
    locator: createValidatedLocator(sourceMap, page, block, fullBlock ? undefined : { start, end }),
    claimIds,
  };
}

function maximumFittingEnd(
  block: DocumentBlock & { text: string },
  tokens: SearchToken[],
  startToken: number,
  maximumEnd: number,
  availableCharacters: number,
): number {
  let low = startToken;
  let high = maximumEnd;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const fullBlock = startToken === 0 && middle === tokens.length;
    const start = fullBlock ? 0 : tokens[startToken]!.start;
    const end = fullBlock ? block.text.length : tokens[middle - 1]!.end;
    if (end - start <= availableCharacters) low = middle;
    else high = middle - 1;
  }
  return low;
}

function languageOf(text: string): SearchChunkDraft['language'] {
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/\p{Letter}/u.test(text)) return 'en';
  return 'und';
}

function stableChunkId(sourceMap: DocumentSourceMap, ordinal: number, units: ChunkUnit[]): string {
  const identity = JSON.stringify({
    schemaVersion: SEARCH_CHUNK_SCHEMA_VERSION,
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    ordinal,
    segments: units.map((unit) => ({ blockId: unit.blockId, locator: unit.locator })),
  });
  return createHash('sha256').update(identity).digest('hex');
}

function materializeChunk(sourceMap: DocumentSourceMap, ordinal: number, units: ChunkUnit[]): SearchChunkDraft {
  const text = units.map((unit) => unit.text).join('\n\n');
  const terms = tokenizeSearchText(text);
  const termFrequencies = Object.create(null) as Record<string, number>;
  for (const term of terms) termFrequencies[term] = (termFrequencies[term] ?? 0) + 1;
  return {
    id: stableChunkId(sourceMap, ordinal, units),
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    ordinal,
    language: languageOf(text),
    text,
    tokenCount: terms.length,
    locators: units.map((unit) => unit.locator),
    claimIds: [...new Set(units.flatMap((unit) => unit.claimIds))].sort(),
    lexicalTerms: Object.keys(termFrequencies).sort(),
    termFrequencies,
  };
}

export function chunkDocument(input: ChunkDocumentInput): SearchChunkDraft[] {
  const parsedSourceMap = parseDocumentSourceMap(input.sourceMap);
  const sourceMap: DocumentSourceMap = {
    ...parsedSourceMap,
    contentHash: parsedSourceMap.contentHash.toLowerCase(),
  };
  if (!UUID_PATTERN.test(sourceMap.artifactId)) {
    throw new Error('search artifactId must be a canonical lowercase UUID');
  }
  const groups: ChunkUnit[][] = [];
  let current: ChunkUnit[] = [];
  let currentTokens = 0;
  let currentCharacters = 0;
  const flush = (): void => {
    if (current.length > 0) groups.push(current);
    current = [];
    currentTokens = 0;
    currentCharacters = 0;
  };
  const append = (unit: ChunkUnit): void => {
    currentCharacters += (current.length === 0 ? 0 : 2) + unit.text.length;
    currentTokens += unit.tokenCount;
    current.push(unit);
  };

  const orderedPages = [...sourceMap.pages].sort((left, right) => left.page - right.page);
  const orderedBlocks = orderedPages.flatMap((page) => page.blocks);
  const claims = validatedClaimIds(input, new Set(orderedBlocks.map((block) => block.id)));
  for (const page of orderedPages) {
    for (const candidate of page.blocks) {
      if (candidate.text === undefined) continue;
      const block = candidate as DocumentBlock & { text: string };
      const tokens = tokenizeSearchTextWithOffsets(block.text);
      if (tokens.length === 0) continue;
      const claimIds = claims.get(block.id) ?? [];
      if (INDIVISIBLE_KINDS.has(block.kind)) {
        if (tokens.length > MAX_CHUNK_TOKENS || block.text.length > MAX_CHUNK_CHARACTERS) {
          throw new Error(`indivisible block exceeds ${MAX_CHUNK_TOKENS} tokens or ${MAX_CHUNK_CHARACTERS} characters: ${block.id}`);
        }
        const unit = createUnit(sourceMap, page.page, block, tokens, 0, tokens.length, claimIds);
        const separator = current.length === 0 ? 0 : 2;
        if (current.length > 0 && (currentTokens + unit.tokenCount > MAX_CHUNK_TOKENS
          || currentCharacters + separator + unit.text.length > MAX_CHUNK_CHARACTERS)) {
          flush();
        }
        append(unit);
        continue;
      }

      let startToken = 0;
      while (startToken < tokens.length) {
        const separator = current.length === 0 ? 0 : 2;
        const availableTokens = MAX_CHUNK_TOKENS - currentTokens;
        const availableCharacters = MAX_CHUNK_CHARACTERS - currentCharacters - separator;
        if (availableTokens <= 0 || availableCharacters <= 0) {
          flush();
          continue;
        }
        const maximumEnd = Math.min(tokens.length, startToken + availableTokens);
        const endToken = maximumFittingEnd(block, tokens, startToken, maximumEnd, availableCharacters);
        if (endToken === startToken) {
          if (current.length > 0) {
            flush();
            continue;
          }
          throw new Error(`search token exceeds ${MAX_CHUNK_CHARACTERS} characters: ${block.id}`);
        }
        append(createUnit(sourceMap, page.page, block, tokens, startToken, endToken, claimIds));
        startToken = endToken;
        if (startToken < tokens.length) flush();
      }
    }
  }
  if (current.length > 0) flush();
  if (groups.length === 0) return [];

  const chunks = groups.map((group, ordinal) => materializeChunk(sourceMap, ordinal, group));
  const invalid = chunks.slice(0, -1).find((chunk) => chunk.tokenCount < MIN_CHUNK_TOKENS);
  if (invalid) {
    throw new Error(`cannot satisfy ${MIN_CHUNK_TOKENS}-${MAX_CHUNK_TOKENS} token bounds without splitting an indivisible block`);
  }
  if (chunks.some((chunk) => chunk.tokenCount > MAX_CHUNK_TOKENS || chunk.text.length > MAX_CHUNK_CHARACTERS)) {
    throw new Error('chunk exceeds persistence bounds');
  }
  return chunks;
}
