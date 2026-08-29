import { parseDocumentSourceMap, type DocumentSourceMap } from '@openscience/domain';
import { parseStructuredXlsxResult, XlsxParsingLimitError } from '../ingestion-parser';
import { parseParserStageResult, type ParserJobRequestV2, type ParserStageResult } from './job-protocol';
import {
  buildPhysicalPages,
  buildVirtualPage,
  TEXT_EXTRACTOR_METADATA,
  VIRTUAL_LINE_HEIGHT,
  VIRTUAL_PAGE_WIDTH,
  type VirtualTextCell,
} from './source-map-builders';
import { mergeSourceMapPages, type SourceMapPageDraft } from './source-map-merge';
import type { DocumentParser, ParserInput } from './types';

const XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUPPORTED_MEDIA_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'application/markdown',
  'application/x-tex',
  'text/x-tex',
  'text/x-python',
  'application/x-ipynb+json',
  'text/csv',
  XLSX_MEDIA_TYPE,
  DOCX_MEDIA_TYPE,
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
]);

const MAX_BLOCK_TEXT_CHARACTERS = 50_000;
const MAX_TOTAL_TEXT_CHARACTERS = 5_000_000;
const MAX_SOURCE_MAP_BLOCKS = 10_000;
const MAX_LOGICAL_ROWS = 10_000;
const MAX_CSV_FIELDS = 10_000;
const MAX_SERIALIZED_RESULT_CHARACTERS = 8_000_000;
const MAX_NOTEBOOK_BYTES = 8 * 1024 * 1024;
const MAX_NOTEBOOK_JSON_DEPTH = 64;
const MAX_NOTEBOOK_JSON_VALUES = 100_000;
const MAX_NOTEBOOK_SOURCE_PARTS = 10_000;
const XLSX_REVIEW_REASON = 'structured-xlsx-review-required';
const CSV_REVIEW_REASON = 'structured-csv-review-required';

export type TextStageAdapter = (request: ParserJobRequestV2, content: Buffer) => Promise<ParserStageResult>;

export interface TextExtractionAdapters {
  pdf?: TextStageAdapter;
  docx?: TextStageAdapter;
  image?: TextStageAdapter;
  xlsx?: TextStageAdapter;
}

class ParsingLimitError extends Error {}

function mediaType(input: ParserInput): string {
  return input.mediaType.split(';', 1)[0]!.trim().toLowerCase();
}

function emptySourceMap(input: ParserInput) {
  return mergeSourceMapPages(input, TEXT_EXTRACTOR_METADATA, []);
}

function needsReview(input: ParserInput, reason: string) {
  return { status: 'needs_review' as const, sourceMap: emptySourceMap(input), reasons: [reason] };
}

function needsReviewSourceMap(sourceMap: DocumentSourceMap, reason: string) {
  return { status: 'needs_review' as const, sourceMap, reasons: [reason] };
}

function meaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text.replace(/[\p{C}\p{Z}]/gu, ''));
}

function decodeUtf8(content: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}

function classifyLine(text: string, kind: 'markdown' | 'tex' | 'python') {
  if (kind === 'python') return 'paragraph' as const;
  const heading = kind === 'markdown'
    ? /^\s{0,3}#{1,6}(?:\s|$)/u.test(text)
    : /^\s*\\(?:part|chapter|section|subsection|subsubsection)(?:\*?\{|\b)/u.test(text);
  return heading ? 'heading' as const : 'paragraph' as const;
}

function scanLogicalLines(text: string, maximum: number, visit: (line: string, lineNumber: number) => void): number {
  let start = 0;
  let lineNumber = 0;
  do {
    lineNumber += 1;
    if (lineNumber > maximum) throw new ParsingLimitError();
    let end = start;
    while (end < text.length && text[end] !== '\r' && text[end] !== '\n') {
      end += 1;
      if (end - start > MAX_BLOCK_TEXT_CHARACTERS) throw new ParsingLimitError();
    }
    visit(text.slice(start, end), lineNumber);
    if (end === text.length) break;
    start = end + (text[end] === '\r' && text[end + 1] === '\n' ? 2 : 1);
  } while (start <= text.length);
  return lineNumber;
}

function parsePlainLines(content: Buffer, kind: 'markdown' | 'tex' | 'python'): SourceMapPageDraft[] {
  const cells: VirtualTextCell[] = [];
  let textCharacters = 0;
  const lineCount = scanLogicalLines(decodeUtf8(content), MAX_LOGICAL_ROWS, (text, lineNumber) => {
    if (!text.trim()) return;
    textCharacters += text.length;
    if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
    cells.push({ line: lineNumber, kind: classifyLine(text, kind), text });
  });
  return [buildVirtualPage(1, cells, lineCount)];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function* plainObjectValues(value: Record<string, unknown>): Generator<unknown> {
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) yield value[key];
  }
}

export function assertNotebookJsonBudget(value: unknown): void {
  const pending: Array<{ values: Iterator<unknown>; depth: number }> = [{
    values: [value].values(), depth: 1,
  }];
  let discoveredValues = 0;
  while (pending.length > 0) {
    const current = pending[pending.length - 1]!;
    const entry = current.values.next();
    if (entry.done) {
      pending.pop();
      continue;
    }
    discoveredValues += 1;
    if (discoveredValues > MAX_NOTEBOOK_JSON_VALUES) {
      throw new ParsingLimitError('Notebook JSON value limit exceeded');
    }
    if (current.depth > MAX_NOTEBOOK_JSON_DEPTH) throw new Error('Notebook JSON is too deeply nested');
    if (Array.isArray(entry.value)) {
      pending.push({ values: entry.value.values(), depth: current.depth + 1 });
    } else if (isPlainObject(entry.value)) {
      pending.push({ values: plainObjectValues(entry.value), depth: current.depth + 1 });
    }
  }
}

function notebookSource(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('Notebook source is invalid');
  if (value.length > MAX_NOTEBOOK_SOURCE_PARTS) throw new ParsingLimitError();
  if (value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Notebook source is invalid');
  }
  return value.join('');
}

function hasOnlyEmptyAttachments(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function parseNotebook(content: Buffer): SourceMapPageDraft[] {
  if (content.byteLength > MAX_NOTEBOOK_BYTES) throw new ParsingLimitError();
  const parsed: unknown = JSON.parse(decodeUtf8(content));
  assertNotebookJsonBudget(parsed);
  if (!isPlainObject(parsed) || !Array.isArray(parsed.cells)) throw new Error('Notebook root is invalid');
  if (parsed.cells.length > MAX_SOURCE_MAP_BLOCKS) throw new ParsingLimitError();

  const cells: VirtualTextCell[] = [];
  let textCharacters = 0;
  for (const [index, value] of parsed.cells.entries()) {
    if (!isPlainObject(value)) throw new Error('Notebook cell is invalid');
    const cellType = value.cell_type;
    if (cellType !== 'markdown' && cellType !== 'code' && cellType !== 'raw') {
      throw new Error('Notebook cell type is unsupported');
    }
    if (value.outputs !== undefined && (!Array.isArray(value.outputs) || value.outputs.length > 0)) {
      throw new Error('Notebook outputs are unsupported');
    }
    if (value.attachments !== undefined && !hasOnlyEmptyAttachments(value.attachments)) {
      throw new Error('Notebook attachments are unsupported');
    }
    const text = notebookSource(value.source);
    if (text.length > MAX_BLOCK_TEXT_CHARACTERS) throw new ParsingLimitError();
    textCharacters += text.length;
    if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
    if (text.trim()) cells.push({ line: index + 1, kind: 'paragraph', text });
  }
  return [buildVirtualPage(1, cells, parsed.cells.length)];
}

function parseCsv(content: Buffer): SourceMapPageDraft[] {
  const text = decodeUtf8(content);
  const rawCells: Array<Omit<VirtualTextCell, 'columnCount'>> = [];
  let cell = '';
  let row = 1;
  let column = 1;
  let fieldCount = 0;
  let maximumColumn = 1;
  let quoted = false;
  let closedQuote = false;
  let endedWithRowBreak = false;
  let textCharacters = 0;
  const append = (character: string) => {
    cell += character;
    if (cell.length > MAX_BLOCK_TEXT_CHARACTERS) throw new ParsingLimitError();
  };
  const finishField = () => {
    fieldCount += 1;
    if (fieldCount > MAX_CSV_FIELDS) throw new ParsingLimitError();
    maximumColumn = Math.max(maximumColumn, column);
    if (cell.trim()) {
      textCharacters += cell.length;
      if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
      rawCells.push({ line: row, column, kind: 'table', text: cell });
    }
    cell = '';
    column += 1;
  };
  const finishRow = () => {
    finishField();
    if (row > MAX_LOGICAL_ROWS) throw new ParsingLimitError();
    row += 1;
    column = 1;
    endedWithRowBreak = true;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    endedWithRowBreak = false;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        append(character);
      }
      continue;
    }
    if (closedQuote) {
      if (character === ',') {
        finishField();
        closedQuote = false;
      } else if (character === '\n') {
        finishRow();
        closedQuote = false;
      } else if (character !== '\r') {
        throw new Error('malformed CSV');
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n') {
      finishRow();
    } else if (character !== '\r') {
      append(character);
    }
  }
  if (quoted) throw new Error('malformed CSV');
  if (text.length > 0 && !endedWithRowBreak) finishField();
  const rowCount = text.length === 0 ? 1 : Math.min(endedWithRowBreak ? row - 1 : row, MAX_LOGICAL_ROWS);
  const cells = rawCells.map((rawCell): VirtualTextCell => ({ ...rawCell, columnCount: maximumColumn }));
  return [buildVirtualPage(1, cells, rowCount)];
}

async function parseXlsx(content: Buffer): Promise<SourceMapPageDraft[]> {
  try {
    return buildStructuredXlsxPages(await parseStructuredXlsxResult(content));
  } catch (error) {
    if (error instanceof XlsxParsingLimitError) throw new ParsingLimitError();
    throw error;
  }
}

function stageRequest(input: ParserInput): ParserJobRequestV2 {
  return {
    schemaVersion: 2,
    operation: 'extract_text',
    artifactId: input.artifactId,
    contentHash: input.contentHash,
    mediaType: input.mediaType,
    options: {},
  };
}

function buildStructuredXlsxPages(result: ParserStageResult): SourceMapPageDraft[] {
  if (result.warnings.length > 0) throw new Error('XLSX parser returned warnings');
  const closeTo = (left: number, right: number) => Math.abs(left - right) <= 1e-6;
  return result.pages.map((page) => {
    const rawLineCount = page.height / VIRTUAL_LINE_HEIGHT;
    const lineCount = Math.round(rawLineCount);
    if (!closeTo(page.width, VIRTUAL_PAGE_WIDTH) || !closeTo(rawLineCount, lineCount)
      || !Number.isSafeInteger(lineCount) || lineCount < 1) {
      throw new ParsingLimitError();
    }
    let rowZeroHeadings = 0;
    const cells = page.blocks.map((block): VirtualTextCell => {
      const { x, y, width, height } = block.boundingBox;
      const rawLine = y / VIRTUAL_LINE_HEIGHT + 1;
      const rawColumnCount = VIRTUAL_PAGE_WIDTH / width;
      const rawColumn = x / width + 1;
      const line = Math.round(rawLine);
      const columnCount = Math.round(rawColumnCount);
      const column = Math.round(rawColumn);
      if (block.text === undefined || !closeTo(rawLine, line)
        || !Number.isSafeInteger(line) || line < 1 || line > lineCount
        || !closeTo(height, VIRTUAL_LINE_HEIGHT)
        || !closeTo(rawColumnCount, columnCount)
        || !Number.isSafeInteger(columnCount) || columnCount < 1
        || !closeTo(rawColumn, column)
        || !Number.isSafeInteger(column) || column < 1 || column > columnCount
        || !closeTo(x, (column - 1) * width)
        || !closeTo(width, VIRTUAL_PAGE_WIDTH / columnCount)) {
        throw new ParsingLimitError();
      }
      if (line === 1) {
        if (block.kind !== 'heading' || column !== 1 || columnCount !== 1) {
          throw new Error('XLSX sheet heading is invalid');
        }
        rowZeroHeadings += 1;
      } else if (block.kind !== 'table') {
        throw new Error('XLSX cells must be table blocks');
      }
      return { line, column, columnCount, kind: block.kind, text: block.text, parser: result.parser };
    });
    if (rowZeroHeadings !== 1) throw new Error('XLSX sheet heading must be unique');
    return buildVirtualPage(page.page, cells, lineCount);
  });
}

async function parseBinary(
  input: ParserInput,
  adapter: TextStageAdapter | undefined,
  kind: 'pdf' | 'docx' | 'image' | 'xlsx',
) {
  if (!adapter) return needsReview(input, 'parser-unavailable');
  const result = parseParserStageResult(await adapter(stageRequest(input), Buffer.from(input.content)));
  if (kind === 'xlsx') {
    const pages = buildStructuredXlsxPages(result);
    assertSourceMapBudgets(pages);
    if (!pages.some((page) => page.blocks.some((block) => block.text && meaningful(block.text)))) {
      return needsReview(input, 'empty-parsed-text');
    }
    return needsReviewSourceMap(validatedSourceMap(input, pages), XLSX_REVIEW_REASON);
  }
  if (kind === 'pdf' || kind === 'image') {
    const pages = buildPhysicalPages(result.pages, result.parser);
    assertSourceMapBudgets(pages);
    if (!pages.some((page) => page.blocks.some((block) => block.text && meaningful(block.text)))) {
      return needsReview(input, 'empty-parsed-text');
    }
    return succeeded(input, pages, result.warnings);
  }

  const paragraphCells: VirtualTextCell[] = [];
  let textCharacters = 0;
  for (const page of [...result.pages].sort((left, right) => left.page - right.page)) {
    for (const block of page.blocks) {
      if (block.text === undefined) continue;
      scanLogicalLines(block.text, MAX_BLOCK_TEXT_CHARACTERS + 1, (paragraph) => {
        if (!paragraph.trim()) return;
        if (paragraphCells.length >= MAX_SOURCE_MAP_BLOCKS) throw new ParsingLimitError();
        textCharacters += paragraph.length;
        if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
        paragraphCells.push({
          line: paragraphCells.length + 1,
          kind: 'paragraph',
          text: paragraph,
          parser: result.parser,
        });
      });
    }
  }
  const page = buildVirtualPage(1, paragraphCells, paragraphCells.length);
  assertSourceMapBudgets([page]);
  if (!paragraphCells.some((paragraph) => meaningful(paragraph.text))) return needsReview(input, 'empty-parsed-text');
  return succeeded(input, [page], result.warnings);
}

function assertSourceMapBudgets(pages: readonly SourceMapPageDraft[]): void {
  let blocks = 0;
  let textCharacters = 0;
  for (const page of pages) {
    blocks += page.blocks.length;
    if (blocks > MAX_SOURCE_MAP_BLOCKS) throw new ParsingLimitError();
    for (const block of page.blocks) {
      if (block.text === undefined) continue;
      if (block.text.length > MAX_BLOCK_TEXT_CHARACTERS) throw new ParsingLimitError();
      textCharacters += block.text.length;
      if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
    }
  }
}

function validatedSourceMap(input: ParserInput, pages: readonly SourceMapPageDraft[]) {
  assertSourceMapBudgets(pages);
  try {
    return parseDocumentSourceMap(mergeSourceMapPages(input, TEXT_EXTRACTOR_METADATA, pages));
  } catch {
    throw new ParsingLimitError();
  }
}

function succeeded(input: ParserInput, pages: readonly SourceMapPageDraft[], warnings: readonly string[]) {
  return succeededSourceMap(validatedSourceMap(input, pages), warnings);
}

function succeededSourceMap(sourceMap: DocumentSourceMap, warnings: readonly string[]) {
  const result = {
    status: 'succeeded' as const,
    sourceMap,
    warnings: [...warnings],
  };
  if (JSON.stringify(result).length > MAX_SERIALIZED_RESULT_CHARACTERS) throw new ParsingLimitError();
  return result;
}

export function createTextExtractor(adapters: TextExtractionAdapters): DocumentParser {
  return {
    metadata: TEXT_EXTRACTOR_METADATA,
    supports: (input) => SUPPORTED_MEDIA_TYPES.has(mediaType(input)),
    parse: async (input) => {
      try {
        const type = mediaType(input);
        if (type === 'application/pdf') return await parseBinary(input, adapters.pdf, 'pdf');
        if (type === DOCX_MEDIA_TYPE) return await parseBinary(input, adapters.docx, 'docx');
        if (type === XLSX_MEDIA_TYPE && adapters.xlsx) return await parseBinary(input, adapters.xlsx, 'xlsx');
        if (type.startsWith('image/')) return await parseBinary(input, adapters.image, 'image');
        const pages = type === 'text/csv'
          ? parseCsv(input.content)
          : type === XLSX_MEDIA_TYPE
            ? await parseXlsx(input.content)
            : type === 'application/x-ipynb+json'
              ? parseNotebook(input.content)
              : parsePlainLines(input.content, type === 'application/x-tex' || type === 'text/x-tex'
                ? 'tex'
                : type === 'text/x-python' ? 'python' : 'markdown');
        assertSourceMapBudgets(pages);
        const sourceMap = validatedSourceMap(input, pages);
        if (!sourceMap.pages.some((page) => page.blocks.some((block) => block.text && meaningful(block.text)))) {
          return needsReview(input, 'empty-parsed-text');
        }
        if (type === 'text/csv') return needsReviewSourceMap(sourceMap, CSV_REVIEW_REASON);
        if (type === XLSX_MEDIA_TYPE) return needsReviewSourceMap(sourceMap, XLSX_REVIEW_REASON);
        return succeededSourceMap(sourceMap, []);
      } catch (error) {
        if (error instanceof ParsingLimitError) {
          return { status: 'blocked', code: 'limit_exceeded', message: 'document parsing safety limit exceeded' };
        }
        return needsReview(input, 'parser-failed');
      }
    },
  };
}
