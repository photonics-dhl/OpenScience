import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { createWorkerParserCascade } from '../src/index';
import { sourceMapToManuscriptText } from '../src/extractor';
import { createDefaultIngestionAdapters, parseIngestion, parseIngestionWithAdapters, runTesseractOcr } from '../src/ingestion-parser';
import { reproduceAcceptanceLocator } from '../src/parser-acceptance-contract';
import { runParserCascadeSelfTest, runParserSelfTest } from '../src/parser-self-test';
import { createSidecarParserStageProcessor, TRANSITION_PARSER_METADATA } from '../src/parser-job-isolation';
import {
  deserializeParserJobResponseV2,
  parseParserJobRequestV2,
  serializeParserJobRequestV2,
  serializeParserJobResponseV2,
  type ParserJobRequestV2,
  type ParserStageResult,
} from '../src/parsers/job-protocol';
import { PDF_PAGE_INVENTORY_METADATA, TESSERACT_METADATA } from '../src/parsers/ocr-parser';
import { RESEARCH_INTELLIGENCE_CORPUS } from './support/research-intelligence-corpus';

const NATIVE_PDF_TEXT_ITEM_METADATA = Object.freeze({
  name: 'pdf-parse-pdfjs-text-items',
  version: '2.4.5+pdfjs-dist.5.4.296',
});

function serializedSidecarAdapter() {
  const sidecar = createSidecarParserStageProcessor(createDefaultIngestionAdapters());
  return async (requestValue: ParserJobRequestV2, content: Buffer): Promise<ParserStageResult> => {
    const request = parseParserJobRequestV2(JSON.parse(serializeParserJobRequestV2(requestValue)));
    const serialized = serializeParserJobResponseV2({
      schemaVersion: 2,
      ok: true,
      artifactId: request.artifactId,
      contentHash: request.contentHash,
      result: await sidecar(request, content),
    });
    const expectedParser = request.operation === 'extract_text' && request.mediaType === 'application/pdf'
      ? NATIVE_PDF_TEXT_ITEM_METADATA
      : TRANSITION_PARSER_METADATA;
    const response = deserializeParserJobResponseV2(serialized, request, expectedParser);
    if (!response.ok) throw new Error(response.errorCode);
    return response.result;
  };
}

describe('parseIngestion', () => {
  it('settles once and waits for close when Tesseract exits before reading stdin', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough; stdout: PassThrough; exitCode: number | null; kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.exitCode = null;
    child.kill = vi.fn(() => {
      child.exitCode = 1;
      queueMicrotask(() => child.emit('close', 1));
      return true;
    });
    const spawnProcess = vi.fn(() => child) as never;
    queueMicrotask(() => {
      const error = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
      child.stdin.emit('error', error);
    });

    await expect(runTesseractOcr(Buffer.alloc(128 * 1024), spawnProcess)).rejects.toThrow('OCR input failed: EPIPE');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['paper.pdf', 'application/pdf', '%PDF-1.7', 'Native PDF evidence'],
    ['paper.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK fixture', 'Native DOCX evidence'],
    ['scan.png', 'image/png', '\x89PNG fixture', 'Scanned OCR evidence'],
  ])('production cascade uses one V2 parser stage for %s and keeps candidate fallback disabled', async (
    filename, mediaType, raw, extractedText,
  ) => {
    const content = Buffer.from(raw, 'utf8');
    const stageAdapter = vi.fn().mockImplementation(async () => ({
      schemaVersion: 2,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph', text: extractedText,
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const ocr = vi.fn();
    const cascade = createWorkerParserCascade(
      { ocr } as unknown as AiGateway,
      stageAdapter,
    );

    const result = await cascade({
      artifactId: filename,
      contentHash: createHash('sha256').update(content).digest('hex'),
      content,
      mediaType,
    }, {
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(result.status).toBe('succeeded');
    expect(result.status === 'succeeded' && sourceMapToManuscriptText(result.sourceMap)).toContain(extractedText);
    expect(stageAdapter).toHaveBeenCalledTimes(1);
    expect(stageAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: 2, operation: 'extract_text', mediaType }),
      expect.any(Buffer),
    );
    expect(ocr).not.toHaveBeenCalled();
  });

  it('round-trips canonical XLSX sheet, row and column geometry through the production V2 composition', async () => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'table-xlsx-en');
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const contentHash = createHash('sha256').update(fixture.content).digest('hex');
    const artifactId = 'artifact-table-xlsx-en';
    const locator = { kind: 'table-cell', sheet: 'Evidence', row: 2, column: 2, quote: '42' } as const;
    expect(fixture.expectedLocators).toEqual([locator]);
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, serializedSidecarAdapter());

    const result = await cascade({
      artifactId,
      contentHash,
      content: fixture.content,
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }, {
      trustedAuthorizationContext: { taskId: 'task-xlsx', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: false,
    });

    expect(result.status).toBe('needs_review');
    if (result.status !== 'needs_review') return;
    expect(result.reasons).toEqual(['structured-xlsx-review-required']);
    expect(result.sourceMap.pages).toHaveLength(1);
    expect(result.sourceMap.pages[0]?.blocks.map(({ text, boundingBox }) => ({ text, boundingBox }))).toEqual([
      { text: 'Evidence', boundingBox: { x: 0, y: 0, width: 1000, height: 24 } },
      { text: 'Claim', boundingBox: { x: 0, y: 24, width: 500, height: 24 } },
      { text: 'Value', boundingBox: { x: 500, y: 24, width: 500, height: 24 } },
      { text: 'pulse_width_fs', boundingBox: { x: 0, y: 48, width: 500, height: 24 } },
      { text: '42', boundingBox: { x: 500, y: 48, width: 500, height: 24 } },
    ]);
    const identity = { artifactId, contentHash };
    expect(reproduceAcceptanceLocator(result.sourceMap, locator, identity)).toBe(true);

    const wrongSheet = structuredClone(result.sourceMap);
    wrongSheet.pages[0]!.blocks[0]!.text = 'Other';
    expect(reproduceAcceptanceLocator(wrongSheet, locator, identity)).toBe(false);
    const containingSheet = structuredClone(result.sourceMap);
    containingSheet.pages[0]!.blocks[0]!.text = 'Evidence Archive';
    expect(reproduceAcceptanceLocator(containingSheet, locator, identity)).toBe(false);
    const wrongRow = structuredClone(result.sourceMap);
    wrongRow.pages[0]!.blocks.at(-1)!.boundingBox.y = 72;
    expect(reproduceAcceptanceLocator(wrongRow, locator, identity)).toBe(false);
    const wrongColumn = structuredClone(result.sourceMap);
    wrongColumn.pages[0]!.blocks.at(-1)!.boundingBox.x = 0;
    expect(reproduceAcceptanceLocator(wrongColumn, locator, identity)).toBe(false);
  });

  it.each([15, 29, 30, 51, 63])(
    'round-trips XLSX V2 geometry without rejecting floating column width for %i columns',
    async (columnCount) => {
      const content = Buffer.from(`xlsx-v2-${columnCount}`);
      const contentHash = createHash('sha256').update(content).digest('hex');
      const width = 1000 / columnCount;
      const stageResult: ParserStageResult = {
        schemaVersion: 2,
        parser: TRANSITION_PARSER_METADATA,
        pages: [{
          page: 1,
          width: 1000,
          height: 48,
          blocks: [
            {
              kind: 'heading', text: 'Evidence',
              boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
            },
            {
              kind: 'table', text: 'last-column',
              boundingBox: { x: (columnCount - 1) * width, y: 24, width, height: 24 }, confidence: 1,
            },
          ],
        }],
        warnings: [],
      };
      const stageAdapter = async (requestValue: ParserJobRequestV2): Promise<ParserStageResult> => {
        const request = parseParserJobRequestV2(JSON.parse(serializeParserJobRequestV2(requestValue)));
        const response = deserializeParserJobResponseV2(serializeParserJobResponseV2({
          schemaVersion: 2,
          ok: true,
          artifactId: request.artifactId,
          contentHash: request.contentHash,
          result: stageResult,
        }), request, TRANSITION_PARSER_METADATA);
        if (!response.ok) throw new Error(response.errorCode);
        return response.result;
      };
      const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, stageAdapter);

      const result = await cascade({
        artifactId: `artifact-xlsx-${columnCount}`,
        contentHash,
        content,
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }, {
        trustedAuthorizationContext: { taskId: 'task-xlsx', workspaceId: 'workspace-1', actorId: 'actor-1' },
        externalProcessingEligible: false,
      });

      expect(result.status).toBe('needs_review');
      if (result.status !== 'needs_review') return;
      expect(result.reasons).toEqual(['structured-xlsx-review-required']);
      expect(result.sourceMap.pages[0]?.blocks.at(-1)?.boundingBox).toEqual({
        x: (columnCount - 1) * width,
        y: 24,
        width,
        height: 24,
      });
    },
  );

  it.each([
    'dual-column-pdf-en',
    'table-pdf-en',
    'formula-pdf-en',
    'references-pdf-en',
  ])('uses genuine canonical PDF text-item geometry in the production V2 composition for %s', async (caseId) => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === caseId);
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const artifactId = `artifact-${fixture.id}`;
    const contentHash = createHash('sha256').update(fixture.content).digest('hex');
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, serializedSidecarAdapter());

    const result = await cascade({
      artifactId,
      contentHash,
      content: fixture.content,
      mediaType: 'application/pdf',
    }, {
      trustedAuthorizationContext: { taskId: 'task-pdf', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: false,
    });

    expect(cascade.featureFlags).toEqual({
      detectLayout: false, grobid: false, localOcr: true, llmOcr: false,
    });
    expect(['succeeded', 'needs_review']).toContain(result.status);
    if (result.status === 'blocked' || result.status === 'failed') return;
    expect(result.sourceMap).toMatchObject({ artifactId, contentHash });
    expect(result.sourceMap.pages.map(({ page }) => page)).toEqual([1]);
    expect(result.sourceMap.pages[0]).toMatchObject({ width: 612, height: 792 });
    const blocks = result.sourceMap.pages.flatMap(({ blocks: pageBlocks }) => pageBlocks)
      .filter(({ parser }) => parser.name === NATIVE_PDF_TEXT_ITEM_METADATA.name);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const page = result.sourceMap.pages.find(({ page: pageNumber }) => pageNumber === 1)!;
      expect(block.parser).toEqual(NATIVE_PDF_TEXT_ITEM_METADATA);
      expect(block.transformations).toContainEqual({
        stage: 'extract_text', processor: NATIVE_PDF_TEXT_ITEM_METADATA,
      });
      expect(block.transformations.some(({ stage }) => stage === 'detect_layout')).toBe(false);
      expect([block.boundingBox.x, block.boundingBox.y, block.boundingBox.width, block.boundingBox.height]
        .every(Number.isFinite)).toBe(true);
      expect(block.boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(block.boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(block.boundingBox.width).toBeGreaterThan(0);
      expect(block.boundingBox.height).toBeGreaterThan(0);
      expect(block.boundingBox.x + block.boundingBox.width).toBeLessThanOrEqual(page.width);
      expect(block.boundingBox.y + block.boundingBox.height).toBeLessThanOrEqual(page.height);
    }
    const identity = { artifactId, contentHash };
    for (const locator of fixture.expectedLocators) {
      expect(reproduceAcceptanceLocator(result.sourceMap, locator, identity), JSON.stringify(locator)).toBe(true);
    }
  });

  it('rejects transition-parser physical locators for wrong-column and synthetic full-width blocks', async () => {
    const quote = 'Left claim: reproducible pulse.';
    const locator = { kind: 'page-region-text', page: 1, bbox: [0, 0, 306, 792], quote } as const;
    const parse = async (boundingBox: { x: number; y: number; width: number; height: number }) => {
      const content = Buffer.from('%PDF-1.7 transition geometry');
      const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, async () => ({
        schemaVersion: 2,
        parser: TRANSITION_PARSER_METADATA,
        pages: [{
          page: 1,
          width: 612,
          height: 792,
          blocks: [{
            kind: 'paragraph' as const,
            text: `${quote} Repeated native text keeps page quality high. `.repeat(4),
            boundingBox,
            confidence: 1,
          }],
        }],
        warnings: [],
      }));
      return cascade({
        artifactId: 'transition-pdf',
        contentHash: createHash('sha256').update(content).digest('hex'),
        content,
        mediaType: 'application/pdf',
      }, {
        trustedAuthorizationContext: { taskId: 'task-region', workspaceId: 'workspace-1', actorId: 'actor-1' },
        externalProcessingEligible: false,
      });
    };

    for (const boundingBox of [
      { x: 250, y: 100, width: 200, height: 40 },
      { x: 0, y: 100, width: 612, height: 40 },
    ]) {
      const result = await parse(boundingBox);
      expect(result.status).toBe('succeeded');
      if (result.status === 'succeeded') {
        expect(reproduceAcceptanceLocator(result.sourceMap, locator)).toBe(false);
      }
    }

    const docxContent = Buffer.from('PK\u0003\u0004paragraph order');
    const docxCascade = createWorkerParserCascade({ ocr: vi.fn() } as never, async () => ({
      schemaVersion: 2,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph' as const,
          text: `Introductory paragraph\n${quote}`,
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 },
        }],
      }],
      warnings: [],
    }));
    const docx = await docxCascade({
      artifactId: 'transition-docx',
      contentHash: createHash('sha256').update(docxContent).digest('hex'),
      content: docxContent,
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }, {
      trustedAuthorizationContext: { taskId: 'task-paragraph', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: false,
    });
    expect(docx.status).toBe('succeeded');
    if (docx.status === 'succeeded') {
      expect(reproduceAcceptanceLocator(docx.sourceMap, {
        kind: 'paragraph-text', paragraph: 1, quote,
      })).toBe(false);
    }
  });

  it('解码 markdown 与 tex', () => {
    expect(parseIngestion('paper.md', Buffer.from('# Title\n正文'))).toMatchObject({ status: 'ready', format: 'md' });
    expect(parseIngestion('paper.tex', Buffer.from('\\section{Title}'))).toMatchObject({ status: 'ready', format: 'tex' });
  });
  it('二进制格式不伪造正文，进入人工复核', () => {
    expect(parseIngestion('paper.pdf', Buffer.from('%PDF-1.7'))).toMatchObject({ status: 'needs_review', format: 'pdf' });
    expect(parseIngestion('figure.png', Buffer.from('\x89PNG\r\n\x1a\n'))).toMatchObject({ status: 'needs_review', format: 'png' });
  });

  it('未配置二进制解析器时保留 needs_review 合同', () => {
    expect(parseIngestion('paper.docx', Buffer.from('PK\\x03\\x04'))).toMatchObject({
      status: 'needs_review', format: 'docx', reason: 'binary-parser-not-mounted',
    });
  });

  it('使用受控 PDF adapter 接受真实论文大小，并拒绝超过 50 MB 的输入', async () => {
    const adapters = { pdf: async (content: Buffer) => `PDF:${content.length}` };
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'pdf', text: 'PDF:8' });
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.alloc(24_671_920), adapters)).resolves.toMatchObject({ status: 'ready', format: 'pdf', text: 'PDF:24671920' });
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.alloc(50 * 1024 * 1024 + 1), adapters)).resolves.toMatchObject({ status: 'needs_review', reason: 'parser-input-too-large' });
  });

  it('图片优先使用本地 OCR adapter', async () => {
    const adapters = { image: async () => 'Measured signal and fitted curve' };
    await expect(parseIngestionWithAdapters('figure.png', Buffer.from('\x89PNG\r\n\x1a\n'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'png', text: 'Measured signal and fitted curve' });
  });

  it('将仅含页面标记和控制字符的解析输出送入人工复核', async () => {
    const adapters = { pdf: async () => '\f\n-- 1 of 1 --\n' };
    await expect(parseIngestionWithAdapters('scan.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({
      status: 'needs_review', format: 'pdf', reason: 'empty-parsed-text',
    });
  });

  it('将不含 Unicode 字母或数字的解析输出送入人工复核', async () => {
    const adapters = { pdf: async () => '★—' };
    await expect(parseIngestionWithAdapters('scan.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({
      status: 'needs_review', format: 'pdf', reason: 'empty-parsed-text',
    });
  });

  it('默认 PDF adapter 对损坏文件返回 needs_review 而不是把 worker 打崩', async () => {
    const result = await parseIngestionWithAdapters('paper.pdf', Buffer.from('%PDF-1.7'), createDefaultIngestionAdapters());
    expect(result).toMatchObject({ status: 'needs_review', format: 'pdf', reason: 'parser-failed' });
  });

  it('默认 DOCX adapter 对损坏容器返回 needs_review', async () => {
    const result = await parseIngestionWithAdapters('paper.docx', Buffer.from('PK\\x03\\x04'), createDefaultIngestionAdapters());
    expect(result).toMatchObject({ status: 'needs_review', format: 'docx', reason: 'parser-failed' });
  });
});

describe('production parser self-test', () => {
  it('uses a valid image-only scanned PDF fixture with no native text layer', async () => {
    const { PDFParse } = await import('pdf-parse');
    const fixture = (await import('../src/parser-self-test')).createParserSelfTestFixtures().scanPdf;
    const parser = new PDFParse({ data: new Uint8Array(fixture) });
    try {
      const info = await parser.getInfo({ parsePageInfo: true });
      expect(info.total).toBe(1);
    } finally {
      await parser.destroy();
    }
    const textParser = new PDFParse({ data: new Uint8Array(fixture) });
    try {
      const nativeText = (await textParser.getText()).text.replace(/--\s*\d+\s+of\s+\d+\s*--/gu, '').trim();
      expect(nativeText).toBe('');
    } finally {
      await textParser.destroy();
    }
  });

  it('requires V2 native text plus deterministic scan OCR text/locator through the real cascade seam', async () => {
    const parserJobAdapter = vi.fn(async (request, content: Buffer) => {
      if (request.artifactId === 'self-test-scan') {
        expect(content.subarray(0, 8).toString('binary')).toContain('%PDF-1.4');
        if (request.operation === 'extract_text') {
          return { schemaVersion: 2 as const, parser: TRANSITION_PARSER_METADATA, pages: [], warnings: [] };
        }
        if (request.operation === 'inventory_pages') {
          return { schemaVersion: 2 as const, parser: PDF_PAGE_INVENTORY_METADATA,
            pages: [{ page: 1, width: 305, height: 55, blocks: [] }], warnings: [] };
        }
        if (request.operation === 'ocr_page') {
          return { schemaVersion: 2 as const, parser: TESSERACT_METADATA, pages: [{
            page: 1, width: 305, height: 55, blocks: [{
              kind: 'paragraph' as const, text: 'OCR 42 FS',
              boundingBox: { x: 8, y: 8, width: 180, height: 24 }, confidence: 0.96,
            }],
          }], warnings: [] };
        }
      }
      return ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph' as const,
          text: 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
      });
    });
    const ocr = vi.fn();
    const cascade = createWorkerParserCascade({ ocr } as never, parserJobAdapter);

    await expect(runParserCascadeSelfTest(cascade)).resolves.toEqual({
      schemaVersion: 2,
      pdf: { format: 'pdf', status: 'ready', textMatched: true },
      docx: { format: 'docx', status: 'ready', textMatched: true },
      scan: {
        format: 'pdf', status: 'ready', textMatched: true, locatorMatched: true,
        tesseractMatched: true, confidenceMatched: true, boundingBoxMatched: true,
      },
      candidateFallbackDisabled: true,
    });
    expect(parserJobAdapter).toHaveBeenCalledTimes(5);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('fails closed when the composed OCR stage returns no scan text', async () => {
    const parserJobAdapter = vi.fn(async (request) => {
      if (request.artifactId === 'self-test-scan' && request.operation === 'extract_text') {
        return { schemaVersion: 2 as const, parser: TRANSITION_PARSER_METADATA, pages: [], warnings: [] };
      }
      if (request.artifactId === 'self-test-scan' && request.operation === 'inventory_pages') {
        return { schemaVersion: 2 as const, parser: PDF_PAGE_INVENTORY_METADATA,
          pages: [{ page: 1, width: 305, height: 55, blocks: [] }], warnings: [] };
      }
      return {
        schemaVersion: 2 as const,
        parser: request.operation === 'ocr_page' ? TESSERACT_METADATA : TRANSITION_PARSER_METADATA,
        pages: [{
          page: 1, width: 1000, height: 24,
          blocks: request.operation === 'ocr_page' ? [] : [{
          kind: 'paragraph' as const, text: 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
        }],
        warnings: [],
      };
    });
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, parserJobAdapter);

    await expect(runParserCascadeSelfTest(cascade)).rejects.toThrow(/scan OCR text\/locator/);
  });

  it('fails closed when the observable production composition enables candidate fallback', async () => {
    const parserJobAdapter = vi.fn(async (request) => ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph' as const,
          text: request.mediaType === 'image/png' ? 'OCR 42 FS' : 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const productionCascade = createWorkerParserCascade({ ocr: vi.fn() } as never, parserJobAdapter);
    const candidateEnabledCascade = Object.assign(
      async (...args: Parameters<typeof productionCascade>) => productionCascade(...args),
      { featureFlags: { ...productionCascade.featureFlags, llmOcr: true } },
    );

    await expect(runParserCascadeSelfTest(candidateEnabledCascade)).rejects.toThrow(/candidate fallback enabled/);
    expect(parserJobAdapter).not.toHaveBeenCalled();
  });

  it('extracts deterministic text from realistic PDF and DOCX fixtures', async () => {
    await expect(runParserSelfTest()).resolves.toEqual({
      pdf: { format: 'pdf', status: 'ready', textMatched: true },
      docx: { format: 'docx', status: 'ready', textMatched: true },
    });
  });
});
