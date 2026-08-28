import { createHash } from 'node:crypto';
import type { DocumentBlock, DocumentSourceMap } from '@openscience/domain';
import type { AiGateway, OcrRequest, OcrResult } from '@openscience/ai-gateway';
import { describe, expect, it, vi } from 'vitest';

import {
  runLlmOcrFallback,
  type LlmOcrCandidatePage,
  type LlmOcrFallbackContext,
} from '../src/parsers/llm-ocr-fallback';
import type { ParserInput } from '../src/parsers/types';

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function input(): ParserInput {
  const content = Buffer.from('%PDF-1.7\nLLM fallback fixture', 'utf8');
  return {
    artifactId: 'artifact-candidate-fixture',
    contentHash: createHash('sha256').update(content).digest('hex'),
    content,
    mediaType: 'application/pdf',
  };
}

function originalBlock(page: number): DocumentBlock {
  return {
    id: `original-${page}`,
    kind: 'paragraph',
    text: `deterministic-${page}`,
    boundingBox: { x: 0, y: 0, width: 500, height: 50 },
    confidence: 0.4,
    parser: { name: 'deterministic', version: '1.0.0' },
    transformations: [{ stage: 'extract_text', processor: { name: 'deterministic', version: '1.0.0' } }],
  };
}

function sourceMap(pageCount = 1): DocumentSourceMap {
  const parserInput = input();
  return {
    artifactId: parserInput.artifactId,
    contentHash: parserInput.contentHash,
    parser: { name: 'openscience-parser-cascade', version: '1.0.0' },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      page: index + 1,
      width: 500,
      height: 700,
      blocks: [originalBlock(index + 1)],
    })),
  };
}

function raster(pageNumber: number, width = 1000, height = 1400): LlmOcrCandidatePage {
  const bytes = png(width, height);
  return {
    pageNumber,
    mediaType: 'image/png',
    bytes,
    width,
    height,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    selectionReason: 'low_confidence',
  };
}

function succeeded(request: OcrRequest): OcrResult {
  return {
    status: 'succeeded',
    source: { ...request.source },
    inputContentHash: 'b'.repeat(64),
    pages: request.pages.map((page) => ({
      status: 'succeeded' as const,
      pageNumber: page.pageNumber,
      candidate: {
        text: `candidate-${page.pageNumber}`,
        source: 'llm_ocr_candidate' as const,
        provider: 'vision-fake',
        model: 'vision-test',
        pageNumber: page.pageNumber,
        bbox: { x: 0 as const, y: 0 as const, width: page.width, height: page.height },
        selectionReason: page.selectionReason,
        promptVersion: 'openscience-ocr-v1' as const,
        promptHash: 'c'.repeat(64),
        inputContentHash: 'd'.repeat(64),
        artifactId: request.source.artifactId,
        documentSha256: request.source.documentSha256,
      },
    })),
  };
}

function context(ocr: (request: OcrRequest) => Promise<OcrResult>): LlmOcrFallbackContext {
  return {
    aiGateway: { ocr } as Pick<AiGateway, 'ocr'>,
    enabled: true,
    externalProcessingEligible: true,
    trustedAuthorizationContext: {
      taskId: 'task-server-derived',
      workspaceId: 'workspace-1',
      actorId: 'actor-1',
    },
  };
}

describe('runLlmOcrFallback', () => {
  it('submits at most four unresolved pages in deterministic order', async () => {
    const ocr = vi.fn(async (request: OcrRequest) => succeeded(request));

    const result = await runLlmOcrFallback(
      input(),
      sourceMap(6),
      [raster(6), raster(2), raster(5), raster(1), raster(4), raster(3)],
      context(ocr),
    );

    expect(ocr).toHaveBeenCalledOnce();
    expect(ocr.mock.calls[0]?.[0].pages.map(({ pageNumber }) => pageNumber)).toEqual([1, 2, 3, 4]);
    expect(result.unresolvedPageNumbers).toEqual([5, 6]);
  });

  it('rejects invalid declared raster dimensions before the AI Gateway boundary', async () => {
    const ocr = vi.fn(async (request: OcrRequest) => succeeded(request));
    const invalid = { ...raster(1), width: 999 };

    const result = await runLlmOcrFallback(input(), sourceMap(), [invalid], context(ocr));

    expect(ocr).not.toHaveBeenCalled();
    expect(result.unresolvedPageNumbers).toEqual([1]);
    expect(result.warnings).toContain('llm OCR raster validation failed');
  });

  it.each([
    ['missing trusted authorization', { trustedAuthorizationContext: undefined }],
    ['external processing ineligible', { externalProcessingEligible: false }],
    ['runtime route disabled', { enabled: false }],
  ])('fails closed when %s', async (_label, override) => {
    const ocr = vi.fn(async (request: OcrRequest) => succeeded(request));
    const fallbackContext = { ...context(ocr), ...override };

    const result = await runLlmOcrFallback(input(), sourceMap(), [raster(1)], fallbackContext);

    expect(ocr).not.toHaveBeenCalled();
    expect(result.sourceMap).toEqual(sourceMap());
    expect(result.unresolvedPageNumbers).toEqual([1]);
  });

  it('appends candidate blocks with distinct IDs and never overwrites deterministic blocks', async () => {
    const before = sourceMap();

    const result = await runLlmOcrFallback(
      input(),
      before,
      [raster(1)],
      context(async (request) => succeeded(request)),
    );

    const blocks = result.sourceMap.pages[0]?.blocks ?? [];
    expect(blocks[0]).toEqual(before.pages[0]?.blocks[0]);
    expect(blocks[1]).toMatchObject({
      kind: 'paragraph',
      text: 'candidate-1',
      parser: { name: 'llm_ocr_candidate', version: 'vision-fake:vision-test' },
      transformations: [
        { stage: 'ocr', processor: { name: 'llm_ocr_candidate', version: 'vision-fake:vision-test' } },
        { stage: 'merge', processor: { name: 'openscience-parser-cascade', version: '1.0.0' } },
      ],
    });
    expect(new Set(blocks.map(({ id }) => id)).size).toBe(2);
    expect(result.unresolvedPageNumbers).toEqual([]);
  });

  it('preserves deterministic output and unresolved pages when the provider route is unavailable', async () => {
    const before = sourceMap();
    const result = await runLlmOcrFallback(input(), before, [raster(1)], context(async () => {
      throw new Error('provider outage');
    }));

    expect(result.sourceMap).toEqual(before);
    expect(result.unresolvedPageNumbers).toEqual([1]);
    expect(result.warnings).toContain('llm OCR unavailable');
  });
});
