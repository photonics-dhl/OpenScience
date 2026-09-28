import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { createTableCellSourceLocator, resolveSourceLocator } from '@openscience/domain';
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

// Docling Serve TableData shape; all test text is self-authored.
function doclingCell(row: number, column: number, text: unknown, overrides: Record<string, unknown> = {}) {
  return { text, start_row_offset_idx: row, end_row_offset_idx: row + 1,
    start_col_offset_idx: column, end_col_offset_idx: column + 1, row_span: 1, col_span: 1,
    column_header: row === 0, row_header: column === 0, ...overrides };
}

function doclingTable(page: number, cells: unknown[], overrides: Record<string, unknown> = {}) {
  return { label: 'table', self_ref: `#/tables/${page}`,
    prov: [{ page_no: page, bbox: { l: 50, t: 700, r: 550, b: 200, coord_origin: 'BOTTOMLEFT' }, charspan: [0, 0] }],
    data: { num_rows: 5, num_cols: 2, table_cells: cells }, ...overrides };
}

async function normalizeDoclingTables(tables: unknown[]) {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'saved-docling-result' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ task_status: 'success' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', document: { json_content: {
      pages: { 13: { size: { width: 600, height: 800 } }, 14: { size: { width: 610, height: 810 } } }, texts: [], tables,
    } } })));
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('DOCLING_SERVE_URL', 'http://docling-fixture.invalid');
  vi.stubEnv('DOCLING_FORMULA_ENRICHMENT', 'false');
  try {
    const result = await createDefaultIngestionAdapters().pdf!(Buffer.from('%PDF-Docling-result-fixture'));
    expect(fetcher).toHaveBeenCalledTimes(3);
    return result;
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
}

describe('Docling table normalization', () => {
  it('preserves source-shaped cells in row/column reading order and keeps their own page geometry', async () => {
    const result = await normalizeDoclingTables([
      doclingTable(14, [doclingCell(0, 1, 'Next page definition'), doclingCell(0, 0, 'θ')]),
      doclingTable(13, [doclingCell(2, 1, 'Second direction'), doclingCell(1, 0, 'x'), doclingCell(0, 1, 'Meaning'),
        doclingCell(2, 0, 'y'), doclingCell(0, 0, 'Symbol'), doclingCell(1, 1, 'First direction')]),
    ]);
    expect(result.pages.map((page) => page.page)).toEqual([13, 14]);
    expect(result.pages[0]?.blocks[0]).toMatchObject({ kind: 'table', boundingBox: { x: 50, y: 100, width: 500, height: 500 } });
    expect(result.pages[0]?.blocks[0]?.text).toBe('[row 1, column 1] Symbol\n[row 1, column 2] Meaning\n[row 2, column 1] x\n[row 2, column 2] First direction\n[row 3, column 1] y\n[row 3, column 2] Second direction');
    expect(result.pages[1]?.blocks[0]).toMatchObject({ text: '[row 1, column 1] θ\n[row 1, column 2] Next page definition', boundingBox: { y: 110 } });
    expect(result.pages[0]?.blocks[0]?.text).not.toContain('Next page');
  });

  it('keeps merged headers and row-spanning text once without filling missing cells', async () => {
    const result = await normalizeDoclingTables([doclingTable(13, [
      doclingCell(0, 0, 'Coordinate group', { end_col_offset_idx: 2, col_span: 2 }),
      doclingCell(1, 0, 'shared label', { end_row_offset_idx: 3, row_span: 2 }),
      doclingCell(2, 1, '0'), doclingCell(4, 1, 'Sparse value'),
    ])]);
    expect(result.pages[0]?.blocks[0]?.text).toBe('[row 1, columns 1–2] Coordinate group\n[rows 2–3, column 1] shared label\n[row 3, column 2] 0\n[row 5, column 2] Sparse value');
  });

  it.each([{ text: 'Raw text', orig: 'Original text', expected: 'Raw text' },
    { text: ' ', orig: 'Original text', expected: 'Original text' }])('keeps the existing item text/orig fallback: $expected', async ({ expected, ...item }) => {
    const result = await normalizeDoclingTables([doclingTable(13, [], item)]);
    expect(result.pages[0]?.blocks[0]?.text).toBe(expected);
  });

  it.each([{ condition: 'missing', data: {} }, { condition: 'empty', data: { table_cells: [] } },
    { condition: 'only blank', data: { table_cells: [doclingCell(0, 0, ' \n ')] } }])(
    'marks a textless table with $condition cells as ambiguous on its own', async ({ data }) => {
      const result = await normalizeDoclingTables([doclingTable(13, [], { data })]);
      expect(result.pages[0]?.blocks[0]?.text).toBeUndefined();
      expect(result.warnings).toEqual(['layout_ambiguous']);
    });

  it('uses original cell text when recognized cell text is blank', async () => {
    const result = await normalizeDoclingTables([doclingTable(13, [
      doclingCell(0, 0, ' \n\t ', { orig: ' Original   symbol ' }),
      doclingCell(0, 1, 'Recognized definition', { orig: 'Other definition' }),
    ])]);
    expect(result.pages[0]?.blocks[0]?.text).toBe('[row 1, column 1] Original symbol\n[row 1, column 2] Recognized definition');
    expect(result.warnings).toEqual([]);
  });

  it('does not stringify numbers or infer positions for invalid or absent cell data', async () => {
    const result = await normalizeDoclingTables([doclingTable(13, [
      doclingCell(1, 0, 'valid'), doclingCell(-1, 0, 'negative row'), doclingCell(1.5, 1, 'fractional row'),
      doclingCell(1, 1, 42), { text: 'missing position' }, null,
      doclingCell(2, 0, 'invalid span', { row_span: 2 }), doclingCell(2, 1, 'outside table', { end_col_offset_idx: 3, col_span: 2 }),
    ]), doclingTable(14, [], { data: {} })]);
    expect(result.pages[0]?.blocks[0]?.text).toBe('[row 2, column 1] valid');
    expect(result.pages[1]?.blocks[0]?.text).toBeUndefined();
    expect(result.warnings).toContain('layout_ambiguous');
  });

  it.each([13, 14])('does not duplicate cell text across multiple regions ending on page %i', async (secondPage) => {
    const result = await normalizeDoclingTables([doclingTable(13, [doclingCell(1, 0, 'Unlocated cell')], {
      prov: [...doclingTable(13, []).prov, { ...doclingTable(secondPage, []).prov[0],
        bbox: { l: 50, t: 180, r: 550, b: 100, coord_origin: 'BOTTOMLEFT' } }],
    })]);
    expect(result.pages.map((page) => page.page)).toEqual(secondPage === 13 ? [13] : [13, 14]);
    expect(result.pages.flatMap((page) => page.blocks)).toHaveLength(2);
    expect(result.pages.flatMap((page) => page.blocks).every((block) => block.text === undefined)).toBe(true);
    expect(result.warnings).toContain('layout_ambiguous');
  });

  it('uses explicit raw-text char spans for a table with provenance on different pages', async () => {
    const result = await normalizeDoclingTables([doclingTable(13, [], { text: ' first second ', prov: [
      { ...doclingTable(13, []).prov[0], charspan: [0, 7] }, { ...doclingTable(14, []).prov[0], charspan: [7, 14] },
    ] })]);
    expect(result.pages.map((page) => page.blocks[0]?.text)).toEqual(['first', 'second']);
  });
});

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

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.warnings).toEqual([]);
    expect(result.sourceMap.pages).toHaveLength(1);
    expect(result.sourceMap.pages[0]?.blocks.map(({ kind, text, boundingBox }) => ({ kind, text, boundingBox }))).toEqual([
      { kind: 'heading', text: 'Evidence', boundingBox: { x: 0, y: 0, width: 1000, height: 24 } },
      { kind: 'table', text: 'Claim', boundingBox: { x: 0, y: 24, width: 500, height: 24 } },
      { kind: 'table', text: 'Value', boundingBox: { x: 500, y: 24, width: 500, height: 24 } },
      { kind: 'table', text: 'pulse_width_fs', boundingBox: { x: 0, y: 48, width: 500, height: 24 } },
      { kind: 'table', text: '42', boundingBox: { x: 500, y: 48, width: 500, height: 24 } },
    ]);
    const identity = { artifactId, contentHash };
    expect(reproduceAcceptanceLocator(result.sourceMap, locator, identity)).toBe(true);
    const target = result.sourceMap.pages[0]?.blocks.find(({ text }) => text === '42');
    expect(target).toBeDefined();
    if (!target) return;
    const formalLocator = createTableCellSourceLocator(result.sourceMap, target.id, {
      sheet: 'Evidence', row: 2, column: 2,
    });
    expect(resolveSourceLocator(result.sourceMap, formalLocator).id).toBe(target.id);

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

      expect(result.status).toBe('succeeded');
      if (result.status !== 'succeeded') return;
      expect(result.warnings).toEqual([]);
      expect(result.sourceMap.pages[0]?.blocks.at(-1)?.boundingBox).toEqual({
        x: (columnCount - 1) * width,
        y: 24,
        width,
        height: 24,
      });
    },
  );

  it('returns canonical CSV as succeeded through the production cascade after formal table locator validation', async () => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'table-csv-mixed');
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const contentHash = createHash('sha256').update(fixture.content).digest('hex');
    const artifactId = 'artifact-table-csv-mixed';
    const stageAdapter = vi.fn(serializedSidecarAdapter());
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, stageAdapter);

    const result = await cascade({
      artifactId,
      contentHash,
      content: fixture.content,
      mediaType: 'text/csv',
    }, {
      trustedAuthorizationContext: { taskId: 'task-csv', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: false,
    });

    expect(result.status).toBe('succeeded');
    expect(stageAdapter).not.toHaveBeenCalled();
    if (result.status !== 'succeeded') return;
    expect(result.warnings).toEqual([]);
    const target = result.sourceMap.pages[0]?.blocks.find(({ text }) => text === '42');
    expect(target).toBeDefined();
    if (!target) return;
    const formalLocator = createTableCellSourceLocator(result.sourceMap, target.id, { row: 2, column: 2 });
    expect(resolveSourceLocator(result.sourceMap, formalLocator).id).toBe(target.id);
    expect(reproduceAcceptanceLocator(result.sourceMap, fixture.expectedLocators[0]!, {
      artifactId, contentHash,
    })).toBe(true);
  });

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
            pages: [{ page: 1, width: 612, height: 792, blocks: [] }], warnings: [] };
        }
        if (request.operation === 'ocr_page') {
          return { schemaVersion: 2 as const, parser: TESSERACT_METADATA, pages: [{
            page: 1, width: 612, height: 792, blocks: [
              {
                kind: 'paragraph' as const, text: 'PULSE',
                boundingBox: { x: 76, y: 603, width: 155, height: 38 }, confidence: 0.96,
              },
              {
                kind: 'paragraph' as const, text: '42',
                boundingBox: { x: 268, y: 602, width: 59, height: 38 }, confidence: 0.95,
              },
              {
                kind: 'paragraph' as const, text: 'FS',
                boundingBox: { x: 364, y: 604, width: 59, height: 38 }, confidence: 0.94,
              },
            ],
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
