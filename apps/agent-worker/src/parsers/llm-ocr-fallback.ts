import { createHash } from 'node:crypto';
import {
  DEFAULT_OCR_LIMITS,
  type AiGateway,
  type OcrAuthorizationContext,
  type OcrCandidate,
  type OcrRequest,
  type OcrSelectionReason,
} from '@openscience/ai-gateway';
import {
  parseDocumentSourceMap,
  type DocumentBlock,
  type DocumentParserMetadata,
  type DocumentSourceMap,
} from '@openscience/domain';
import type { OcrRasterPage } from './ocr-parser';
import type { ParserInput } from './types';

export interface LlmOcrCandidatePage extends OcrRasterPage {
  selectionReason: OcrSelectionReason;
}

export interface LlmOcrFallbackContext {
  aiGateway?: Pick<AiGateway, 'ocr'>;
  enabled: boolean;
  externalProcessingEligible: boolean;
  trustedAuthorizationContext?: Readonly<OcrAuthorizationContext>;
}

export interface LlmOcrFallbackResult {
  sourceMap: DocumentSourceMap;
  unresolvedPageNumbers: number[];
  warnings: string[];
}

export const PARSER_CASCADE_METADATA: DocumentParserMetadata = Object.freeze({
  name: 'openscience-parser-cascade',
  version: '1.0.0',
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SHA256 = /^[a-f0-9]{64}$/;

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.byteLength < 24 || !PNG_MAGIC.every((value, index) => bytes[index] === value)) return undefined;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.readUInt32BE(8) !== 13 || view.toString('ascii', 12, 16) !== 'IHDR') return undefined;
  const width = view.readUInt32BE(16);
  const height = view.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function validRaster(page: LlmOcrCandidatePage): boolean {
  if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1
    || page.mediaType !== 'image/png' || !(page.bytes instanceof Uint8Array)
    || page.bytes.byteLength < 1 || page.bytes.byteLength > DEFAULT_OCR_LIMITS.maxPageBytes
    || !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height)
    || page.width < 1 || page.height < 1
    || page.width > DEFAULT_OCR_LIMITS.maxDimension || page.height > DEFAULT_OCR_LIMITS.maxDimension
    || page.width * page.height > DEFAULT_OCR_LIMITS.maxPixels
    || !SHA256.test(page.contentHash)) return false;
  const dimensions = pngDimensions(page.bytes);
  return dimensions?.width === page.width
    && dimensions.height === page.height
    && createHash('sha256').update(page.bytes).digest('hex') === page.contentHash;
}

function candidateProcessor(candidate: OcrCandidate): DocumentParserMetadata {
  return { name: 'llm_ocr_candidate', version: `${candidate.provider}:${candidate.model}` };
}

function candidateId(contentHash: string, candidate: OcrCandidate): string {
  const digest = createHash('sha256')
    .update(contentHash)
    .update('\0')
    .update(String(candidate.pageNumber))
    .update('\0')
    .update(candidate.provider)
    .update('\0')
    .update(candidate.model)
    .update('\0')
    .update(candidate.inputContentHash)
    .update('\0')
    .update(candidate.text)
    .digest('hex');
  return `block:llm-ocr-candidate:${digest}`;
}

function validCandidate(candidate: OcrCandidate, request: OcrRequest, selectedPages: Set<number>): boolean {
  return candidate.source === 'llm_ocr_candidate'
    && candidate.artifactId === request.source.artifactId
    && candidate.documentSha256 === request.source.documentSha256
    && selectedPages.has(candidate.pageNumber)
    && candidate.text.trim().length > 0;
}

function appendCandidates(
  sourceMap: DocumentSourceMap,
  candidates: readonly OcrCandidate[],
): DocumentSourceMap | undefined {
  const pages = sourceMap.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      boundingBox: { ...block.boundingBox },
      parser: { ...block.parser },
      transformations: block.transformations.map((entry) => ({
        stage: entry.stage,
        processor: { ...entry.processor },
      })),
    })),
  }));
  const ids = new Set(pages.flatMap((page) => page.blocks.map(({ id }) => id)));
  for (const candidate of candidates) {
    const page = pages.find(({ page: number }) => number === candidate.pageNumber);
    if (!page) continue;
    let id = candidateId(sourceMap.contentHash, candidate);
    let suffix = 1;
    while (ids.has(id)) id = `${candidateId(sourceMap.contentHash, candidate)}:${suffix++}`;
    ids.add(id);
    const processor = candidateProcessor(candidate);
    const block: DocumentBlock = {
      id,
      kind: 'paragraph',
      text: candidate.text,
      boundingBox: { x: 0, y: 0, width: page.width, height: page.height },
      parser: { ...processor },
      transformations: [
        { stage: 'ocr', processor: { ...processor } },
        { stage: 'merge', processor: { ...PARSER_CASCADE_METADATA } },
      ],
    };
    page.blocks.push(block);
  }
  try {
    return parseDocumentSourceMap({ ...sourceMap, pages });
  } catch {
    return undefined;
  }
}

export async function runLlmOcrFallback(
  input: ParserInput,
  sourceMap: DocumentSourceMap,
  pages: readonly LlmOcrCandidatePage[],
  context: LlmOcrFallbackContext,
): Promise<LlmOcrFallbackResult> {
  const unique = new Map<number, LlmOcrCandidatePage>();
  for (const page of pages) if (!unique.has(page.pageNumber)) unique.set(page.pageNumber, page);
  const ordered = [...unique.values()].sort((left, right) => left.pageNumber - right.pageNumber);
  const unresolved = ordered.map(({ pageNumber }) => pageNumber);
  if (ordered.length === 0) return { sourceMap, unresolvedPageNumbers: [], warnings: [] };
  if (sourceMap.artifactId !== input.artifactId || sourceMap.contentHash !== input.contentHash) {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR source identity mismatch'] };
  }
  if (context.enabled !== true || context.externalProcessingEligible !== true
    || !context.trustedAuthorizationContext || !context.aiGateway) {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR disabled or unauthorized'] };
  }

  const selected = ordered.slice(0, DEFAULT_OCR_LIMITS.maxPages);
  const sourcePageNumbers = new Set(sourceMap.pages.map(({ page }) => page));
  if (selected.some((page) => !sourcePageNumbers.has(page.pageNumber) || !validRaster(page))) {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR raster validation failed'] };
  }
  const selectedNumbers = new Set(selected.map(({ pageNumber }) => pageNumber));
  const request: OcrRequest = {
    authorizationContext: { ...context.trustedAuthorizationContext },
    source: { artifactId: input.artifactId, documentSha256: input.contentHash },
    pages: selected.map((page) => ({
      pageNumber: page.pageNumber,
      mediaType: page.mediaType,
      bytes: Uint8Array.from(page.bytes),
      width: page.width,
      height: page.height,
      selectionReason: page.selectionReason,
    })),
  };

  let result;
  try {
    result = await context.aiGateway.ocr(request);
  } catch {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR unavailable'] };
  }
  if (result.source.artifactId !== input.artifactId || result.source.documentSha256 !== input.contentHash) {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR candidate identity mismatch'] };
  }
  const candidates = result.pages.flatMap((outcome) => (
    outcome.status === 'succeeded' && validCandidate(outcome.candidate, request, selectedNumbers)
      ? [outcome.candidate]
      : []
  ));
  const resolved = new Set(candidates.map(({ pageNumber }) => pageNumber));
  const merged = appendCandidates(sourceMap, candidates);
  if (!merged) {
    return { sourceMap, unresolvedPageNumbers: unresolved, warnings: ['llm OCR candidate locator failed'] };
  }
  return {
    sourceMap: merged,
    unresolvedPageNumbers: unresolved.filter((pageNumber) => !resolved.has(pageNumber)),
    warnings: result.status === 'succeeded' ? [] : ['llm OCR partial result'],
  };
}
