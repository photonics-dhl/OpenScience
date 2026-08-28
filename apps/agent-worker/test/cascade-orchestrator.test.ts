import { createHash } from 'node:crypto';
import type {
  DocumentBlock,
  DocumentParserMetadata,
  DocumentSourceMap,
  ExtractionResult,
} from '@openscience/domain';
import type { AiGateway, OcrRequest, OcrResult } from '@openscience/ai-gateway';
import { describe, expect, it, vi } from 'vitest';

import {
  CASCADE_ORCHESTRATOR_METADATA,
  runParserCascade,
  type CascadeContext,
  type ParserCascadeFeatureFlags,
} from '../src/parsers/cascade-orchestrator';
import { runDocumentParser } from '../src/parsers/base-parser';
import type { GrobidEnrichmentResult } from '../src/parsers/grobid-parser';
import type { LocalOcrAdapter, OcrRasterPage } from '../src/parsers/ocr-parser';
import type { DocumentParser, ParserInput } from '../src/parsers/types';

const TSV_HEADER = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

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
  const content = Buffer.from('%PDF-1.7\ncascade fixture', 'utf8');
  return {
    artifactId: 'artifact-cascade-fixture',
    contentHash: createHash('sha256').update(content).digest('hex'),
    content,
    mediaType: 'application/pdf',
  };
}

function block(id: string, text: string, confidence: number, parser: DocumentParserMetadata): DocumentBlock {
  return {
    id,
    kind: 'paragraph',
    text,
    boundingBox: { x: 0, y: 0, width: 500, height: 50 },
    confidence,
    parser: { ...parser },
    transformations: [{ stage: parser.name === 'layout' ? 'detect_layout' : 'extract_text', processor: { ...parser } }],
  };
}

function map(
  parser: DocumentParserMetadata,
  pages: Array<{ page: number; blocks: DocumentBlock[] }> = [{ page: 1, blocks: [block('text-1', 'native text', 0.4, parser)] }],
): DocumentSourceMap {
  const parserInput = input();
  return {
    artifactId: parserInput.artifactId,
    contentHash: parserInput.contentHash,
    parser: { ...parser },
    pages: pages.map((page) => ({ page: page.page, width: 500, height: 700, blocks: page.blocks })),
  };
}

function parser(
  metadata: DocumentParserMetadata,
  onParse: () => ExtractionResult<DocumentSourceMap> | Promise<ExtractionResult<DocumentSourceMap>>,
): DocumentParser {
  return { metadata, supports: () => true, parse: onParse };
}

function raster(pageNumber: number): OcrRasterPage {
  const bytes = png(1000, 1400);
  return {
    pageNumber,
    mediaType: 'image/png',
    bytes,
    width: 1000,
    height: 1400,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}

function tsv(text: string, confidence = 98): string {
  return `${TSV_HEADER}\n5\t1\t1\t1\t1\t1\t0\t1300\t500\t100\t${confidence}\t${text}`;
}

function gatewayResult(request: OcrRequest): OcrResult {
  return {
    status: 'succeeded',
    source: { ...request.source },
    inputContentHash: 'a'.repeat(64),
    pages: request.pages.map((page) => ({
      status: 'succeeded' as const,
      pageNumber: page.pageNumber,
      candidate: {
        text: `llm-${page.pageNumber}`,
        source: 'llm_ocr_candidate' as const,
        provider: 'vision',
        model: 'test',
        pageNumber: page.pageNumber,
        bbox: { x: 0 as const, y: 0 as const, width: page.width, height: page.height },
        selectionReason: page.selectionReason,
        promptVersion: 'openscience-ocr-v1' as const,
        promptHash: 'b'.repeat(64),
        inputContentHash: 'c'.repeat(64),
        artifactId: request.source.artifactId,
        documentSha256: request.source.documentSha256,
      },
    })),
  };
}

const allFlags: ParserCascadeFeatureFlags = {
  detectLayout: true,
  grobid: true,
  localOcr: true,
  llmOcr: true,
};

function baseContext(extractText: DocumentParser): CascadeContext {
  return {
    adapters: { extractText },
    featureFlags: { ...allFlags },
    externalProcessingEligible: false,
  };
}

describe('runParserCascade', () => {
  it('uses isolated V2 page inventory and selected-page OCR for an image-only PDF', async () => {
    const textMetadata = { name: 'sidecar-text', version: '2.0.0' };
    const tesseract = { name: 'tesseract', version: '5.3.0' };
    const extractText = parser(textMetadata, () => ({
      status: 'needs_review', sourceMap: map(textMetadata, []), reasons: ['empty-parsed-text'],
    }));
    const inventoryPages = vi.fn().mockResolvedValue({
      schemaVersion: 2, parser: textMetadata,
      pages: [{ page: 1, width: 612, height: 792, blocks: [] }], warnings: [],
    });
    const ocrPages = vi.fn().mockResolvedValue({
      schemaVersion: 2, parser: tesseract,
      pages: [{ page: 1, width: 612, height: 792, blocks: [{
        kind: 'paragraph', text: 'Scanned evidence with enough deterministic text to satisfy local page quality', confidence: 0.97,
        boundingBox: { x: 72, y: 700, width: 220, height: 18 },
      }] }], warnings: ['ocr_applied'],
    });

    const result = await runParserCascade(input(), {
      adapters: { extractText, isolatedLocalOcr: { inventoryPages, ocrPages } },
      featureFlags: { detectLayout: false, grobid: false, localOcr: true, llmOcr: false },
      externalProcessingEligible: false,
    });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected scanned PDF success');
    expect(result.sourceMap.pages[0]?.blocks[0]).toMatchObject({
      text: 'Scanned evidence with enough deterministic text to satisfy local page quality', confidence: 0.97, parser: tesseract,
      boundingBox: { x: 72, y: 700, width: 220, height: 18 },
    });
    expect(inventoryPages).toHaveBeenCalledTimes(1);
    expect(ocrPages).toHaveBeenCalledWith(expect.anything(), [{
      page: 1, width: 612, height: 792, blocks: [], reason: 'low_confidence',
    }]);
  });
  it('executes the fixed stage order and stamps orchestrator metadata', async () => {
    const order: string[] = [];
    const textMetadata = { name: 'text', version: '1' };
    const layoutMetadata = { name: 'layout', version: '1' };
    const extractText = parser(textMetadata, () => {
      order.push('extract_text');
      return { status: 'succeeded', sourceMap: map(textMetadata), warnings: [] };
    });
    const detectLayout = parser(layoutMetadata, () => {
      order.push('detect_layout');
      return { status: 'succeeded', sourceMap: map(layoutMetadata), warnings: [] };
    });
    const localOcr: LocalOcrAdapter = {
      metadata: { name: 'local-ocr', version: '1' },
      renderPdfPages: async (_input, pages) => {
        order.push('local_ocr_render');
        return pages.map(raster);
      },
      recognizePage: async () => {
        order.push('local_ocr');
        return `${TSV_HEADER}\n`;
      },
    };
    const ocr = vi.fn(async (request: OcrRequest) => {
      order.push('llm_ocr');
      return gatewayResult(request);
    });
    const grobid = async (): Promise<GrobidEnrichmentResult> => {
      order.push('grobid');
      return { status: 'failed', errorCode: 'unavailable' };
    };

    const result = await runParserCascade(input(), {
      adapters: { extractText, detectLayout, grobid, localOcr },
      aiGateway: { ocr } as Pick<AiGateway, 'ocr'>,
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
      featureFlags: { ...allFlags },
    });

    expect(order).toEqual(['extract_text', 'detect_layout', 'grobid', 'local_ocr_render', 'local_ocr', 'local_ocr_render', 'llm_ocr']);
    expect(result.status).toBe('succeeded');
    if (result.status === 'succeeded' || result.status === 'needs_review') {
      expect(result.sourceMap.parser).toEqual(CASCADE_ORCHESTRATOR_METADATA);
    }
  });

  it('skips disabled optional stages', async () => {
    const order: string[] = [];
    const metadata = { name: 'text', version: '1' };
    const result = await runParserCascade(input(), {
      ...baseContext(parser(metadata, () => {
        order.push('extract_text');
        return { status: 'succeeded', sourceMap: map(metadata), warnings: [] };
      })),
      featureFlags: { detectLayout: false, grobid: false, localOcr: false, llmOcr: false },
    });

    expect(order).toEqual(['extract_text']);
    expect(result.status).toBe('needs_review');
  });

  it('never sends a locally successful page to the LLM fallback', async () => {
    const metadata = { name: 'text', version: '1' };
    const pages = [1, 2].map((page) => ({ page, blocks: [block(`text-${page}`, `x-${page}`, 0.1, metadata)] }));
    const renderCalls: number[][] = [];
    const localOcr: LocalOcrAdapter = {
      metadata: { name: 'local-ocr', version: '1' },
      renderPdfPages: async (_input, pageNumbers) => {
        renderCalls.push([...pageNumbers]);
        return pageNumbers.map(raster);
      },
      recognizePage: async (page) => page.pageNumber === 1 ? tsv('A'.repeat(200)) : `${TSV_HEADER}\n`,
    };
    const ocr = vi.fn(async (request: OcrRequest) => gatewayResult(request));

    await runParserCascade(input(), {
      adapters: {
        extractText: parser(metadata, () => ({ status: 'succeeded', sourceMap: map(metadata, pages), warnings: [] })),
        localOcr,
      },
      featureFlags: { detectLayout: false, grobid: false, localOcr: true, llmOcr: true },
      aiGateway: { ocr } as Pick<AiGateway, 'ocr'>,
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(renderCalls).toEqual([[1, 2], [2]]);
    expect(ocr.mock.calls[0]?.[0].pages.map(({ pageNumber }) => pageNumber)).toEqual([2]);
  });

  it('keeps non-empty local OCR below the LLM threshold unresolved', async () => {
    const metadata = { name: 'text', version: '1' };
    const renderCalls: number[][] = [];
    const localOcr: LocalOcrAdapter = {
      metadata: { name: 'local-ocr', version: '1' },
      renderPdfPages: async (_input, pageNumbers) => {
        renderCalls.push([...pageNumbers]);
        return pageNumbers.map(raster);
      },
      recognizePage: async () => tsv('blurred'.repeat(20), 10),
    };
    const ocr = vi.fn(async (request: OcrRequest) => gatewayResult(request));

    const result = await runParserCascade(input(), {
      adapters: {
        extractText: parser(metadata, () => ({ status: 'succeeded', sourceMap: map(metadata), warnings: [] })),
        localOcr,
      },
      featureFlags: { detectLayout: false, grobid: false, localOcr: true, llmOcr: true },
      aiGateway: { ocr } as Pick<AiGateway, 'ocr'>,
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(renderCalls).toEqual([[1], [1]]);
    expect(ocr.mock.calls[0]?.[0].pages.map(({ pageNumber }) => pageNumber)).toEqual([1]);
    expect(result.status).toBe('succeeded');
  });

  it('keeps a page unresolved when candidate rasterization returns only a partial batch', async () => {
    const metadata = { name: 'text', version: '1' };
    const pages = [1, 2].map((page) => ({ page, blocks: [block(`text-${page}`, `x-${page}`, 0.1, metadata)] }));
    const localOcr: LocalOcrAdapter = {
      metadata: { name: 'local-ocr', version: '1' },
      renderPdfPages: async () => [raster(1)],
      recognizePage: async () => `${TSV_HEADER}\n`,
    };

    const result = await runParserCascade(input(), {
      adapters: {
        extractText: parser(metadata, () => ({ status: 'succeeded', sourceMap: map(metadata, pages), warnings: [] })),
        localOcr,
      },
      featureFlags: { detectLayout: false, grobid: false, localOcr: false, llmOcr: true },
      aiGateway: { ocr: async (request) => gatewayResult(request) } as Pick<AiGateway, 'ocr'>,
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(result.status).toBe('needs_review');
    if (result.status === 'needs_review') {
      expect(result.reasons).toContain('unresolved pages remain');
      expect(result.sourceMap.pages[0]?.blocks.some(({ text }) => text === 'llm-1')).toBe(true);
      expect(result.sourceMap.pages[1]?.blocks.some(({ text }) => text === 'llm-2')).toBe(false);
    }
  });

  it('isolates every injected adapter from caller and sibling input mutation', async () => {
    const parserInput = input();
    const originalFirstByte = parserInput.content[0];
    const observedFirstBytes: number[] = [];
    const metadata = { name: 'text', version: '1' };
    const localOcr: LocalOcrAdapter = {
      metadata: { name: 'local-ocr', version: '1' },
      renderPdfPages: async (stageInput, pageNumbers) => {
        observedFirstBytes.push(stageInput.content[0]!);
        stageInput.content[0] = 0;
        return pageNumbers.map(raster);
      },
      recognizePage: async () => `${TSV_HEADER}\n`,
    };

    await runParserCascade(parserInput, {
      adapters: {
        extractText: parser(metadata, () => ({ status: 'succeeded', sourceMap: map(metadata), warnings: [] })),
        grobid: async (stageInput) => {
          observedFirstBytes.push(stageInput.content[0]!);
          stageInput.content[0] = 0;
          return { status: 'failed', errorCode: 'unavailable' };
        },
        localOcr,
      },
      featureFlags: { detectLayout: false, grobid: true, localOcr: true, llmOcr: true },
      aiGateway: { ocr: async (request) => gatewayResult(request) } as Pick<AiGateway, 'ocr'>,
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(observedFirstBytes).toEqual([originalFirstByte, originalFirstByte, originalFirstByte]);
    expect(parserInput.content[0]).toBe(originalFirstByte);
  });

  it('preserves successful deterministic output when a later stage fails', async () => {
    const metadata = { name: 'text', version: '1' };
    const original = map(metadata);
    const detectLayout = parser({ name: 'layout', version: '1' }, async () => {
      throw new Error('layout outage');
    });

    const result = await runParserCascade(input(), {
      ...baseContext(parser(metadata, () => ({ status: 'succeeded', sourceMap: original, warnings: [] }))),
      adapters: {
        extractText: parser(metadata, () => ({ status: 'succeeded', sourceMap: original, warnings: [] })),
        detectLayout,
      },
      featureFlags: { detectLayout: true, grobid: false, localOcr: false, llmOcr: false },
    });

    expect(result.status).toBe('needs_review');
    if (result.status === 'needs_review') {
      expect(result.sourceMap.pages[0]?.blocks[0]).toEqual(original.pages[0]?.blocks[0]);
      expect(result.reasons).toContain('detect_layout failed');
    }
  });

  it('preserves the higher-confidence original while recording every matching processor', async () => {
    const textMetadata = { name: 'text', version: '1' };
    const layoutMetadata = { name: 'layout', version: '1' };
    const original = map(textMetadata, [{ page: 1, blocks: [block('original-id', 'same text', 0.98, textMetadata)] }]);
    const layout = map(layoutMetadata, [{ page: 1, blocks: [block('layout-id', 'same text', 0.7, layoutMetadata)] }]);

    const result = await runParserCascade(input(), {
      adapters: {
        extractText: parser(textMetadata, () => ({ status: 'succeeded', sourceMap: original, warnings: [] })),
        detectLayout: parser(layoutMetadata, () => ({ status: 'succeeded', sourceMap: layout, warnings: [] })),
      },
      featureFlags: { detectLayout: true, grobid: false, localOcr: false, llmOcr: false },
      externalProcessingEligible: false,
    });

    expect(['succeeded', 'needs_review']).toContain(result.status);
    if (result.status === 'succeeded' || result.status === 'needs_review') {
      const merged = result.sourceMap.pages[0]?.blocks[0];
      expect(merged).toMatchObject({ id: 'original-id', text: 'same text', confidence: 0.98 });
      expect(merged?.transformations.map(({ processor }) => processor.name)).toEqual(['text', 'layout', 'openscience-parser-cascade']);
    }
  });

  it('keeps conflicting deterministic blocks instead of silently dropping either one', async () => {
    const textMetadata = { name: 'text', version: '1' };
    const layoutMetadata = { name: 'layout', version: '1' };
    const original = map(textMetadata, [{ page: 1, blocks: [block('original-id', 'native claim', 0.8, textMetadata)] }]);
    const layout = map(layoutMetadata, [{ page: 1, blocks: [block('layout-id', 'different claim', 0.9, layoutMetadata)] }]);

    const result = await runParserCascade(input(), {
      adapters: {
        extractText: parser(textMetadata, () => ({ status: 'succeeded', sourceMap: original, warnings: [] })),
        detectLayout: parser(layoutMetadata, () => ({ status: 'succeeded', sourceMap: layout, warnings: [] })),
      },
      featureFlags: { detectLayout: true, grobid: false, localOcr: false, llmOcr: false },
      externalProcessingEligible: false,
    });

    expect(['succeeded', 'needs_review']).toContain(result.status);
    if (result.status === 'succeeded' || result.status === 'needs_review') {
      expect(result.sourceMap.pages[0]?.blocks.map(({ text }) => text)).toEqual(['native claim', 'different claim']);
      expect(new Set(result.sourceMap.pages[0]?.blocks.map(({ id }) => id)).size).toBe(2);
    }
  });

  it('normalizes ASCII I deterministically even when the host locale behaves as Turkish', async () => {
    const originalLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const localeSpy = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function () {
      return originalLocaleLowerCase.call(this, 'tr-TR');
    });
    const textMetadata = { name: 'text', version: '1' };
    const layoutMetadata = { name: 'layout', version: '1' };
    const original = map(textMetadata, [{ page: 1, blocks: [block('original-id', 'I CLAIM', 0.98, textMetadata)] }]);
    const layout = map(layoutMetadata, [{ page: 1, blocks: [block('layout-id', 'i claim', 0.7, layoutMetadata)] }]);

    try {
      const result = await runParserCascade(input(), {
        adapters: {
          extractText: parser(textMetadata, () => ({ status: 'succeeded', sourceMap: original, warnings: [] })),
          detectLayout: parser(layoutMetadata, () => ({ status: 'succeeded', sourceMap: layout, warnings: [] })),
        },
        featureFlags: { detectLayout: true, grobid: false, localOcr: false, llmOcr: false },
        externalProcessingEligible: false,
      });

      if (result.status !== 'succeeded' && result.status !== 'needs_review') throw new Error('unexpected cascade result');
      expect(result.sourceMap.pages[0]?.blocks).toHaveLength(1);
      expect(result.sourceMap.pages[0]?.blocks[0]).toMatchObject({ id: 'original-id', text: 'I CLAIM' });
    } finally {
      localeSpy.mockRestore();
    }
  });

  it('returns needs_review rather than failed when all local stages and LLM fallback are unavailable', async () => {
    const metadata = { name: 'text', version: '1' };
    const empty = map(metadata, [{ page: 1, blocks: [] }]);

    const result = await runParserCascade(input(), {
      adapters: { extractText: parser(metadata, () => ({ status: 'needs_review', sourceMap: empty, reasons: ['empty'] })) },
      featureFlags: { detectLayout: true, grobid: true, localOcr: true, llmOcr: true },
      externalProcessingEligible: false,
    });

    expect(result.status).toBe('needs_review');
    if (result.status === 'needs_review') {
      expect(result.reasons).toEqual(expect.arrayContaining(['all local parser stages failed', 'unresolved pages remain']));
      expect(result.sourceMap.parser).toEqual(CASCADE_ORCHESTRATOR_METADATA);
    }
  });

  it.each(['reasons', 'warnings'] as const)('bounds aggregate child %s to the strict result contract', async (field) => {
    const textMetadata = { name: 'text', version: '1' };
    const layoutMetadata = { name: 'layout', version: '1' };
    const denseText = 'A'.repeat(200);
    const textMap = map(textMetadata, [{ page: 1, blocks: [block('text-dense', denseText, 1, textMetadata)] }]);
    const layoutMap = map(layoutMetadata, [{ page: 1, blocks: [block('layout-dense', denseText, 1, layoutMetadata)] }]);
    const textEntries = Array.from({ length: 100 }, (_, index) => `text-${field}-${index}`);
    const layoutEntries = Array.from({ length: 100 }, (_, index) => `layout-${field}-${index}`);
    const extractText = parser(textMetadata, () => field === 'reasons'
      ? { status: 'needs_review', sourceMap: textMap, reasons: textEntries }
      : { status: 'succeeded', sourceMap: textMap, warnings: textEntries });
    const detectLayout = parser(layoutMetadata, () => field === 'reasons'
      ? { status: 'needs_review', sourceMap: layoutMap, reasons: layoutEntries }
      : { status: 'succeeded', sourceMap: layoutMap, warnings: layoutEntries });
    const cascadeContext: CascadeContext = {
      adapters: { extractText, detectLayout },
      featureFlags: { detectLayout: true, grobid: false, localOcr: false, llmOcr: false },
      externalProcessingEligible: false,
    };
    const cascadeParser: DocumentParser = {
      metadata: CASCADE_ORCHESTRATOR_METADATA,
      supports: () => true,
      parse: (parserInput) => runParserCascade(parserInput, cascadeContext),
    };

    const result = await runDocumentParser(input(), cascadeParser);

    expect(result.status).toBe(field === 'reasons' ? 'needs_review' : 'succeeded');
    if (result.status === 'needs_review') expect(result.reasons).toEqual(textEntries);
    if (result.status === 'succeeded') expect(result.warnings).toEqual(textEntries);
  });
});
