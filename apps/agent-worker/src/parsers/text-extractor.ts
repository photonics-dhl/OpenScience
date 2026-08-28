import { createRequire } from 'node:module';
import { parseParserStageResult, type ParserJobRequestV2, type ParserStageResult } from './job-protocol';
import {
  buildPhysicalPages,
  buildVirtualPage,
  TEXT_EXTRACTOR_METADATA,
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
  'text/csv',
  XLSX_MEDIA_TYPE,
  DOCX_MEDIA_TYPE,
  'application/pdf',
]);

const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_EXPANDED_BYTES = 24 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_SHARED_STRINGS = 100_000;
const MAX_CELLS = 9_900;
const MAX_XML_ENTITIES = 100_000;
const MAX_BLOCK_TEXT_CHARACTERS = 50_000;
const MAX_TOTAL_TEXT_CHARACTERS = 5_000_000;

interface ZipEntry {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  generalPurposeBitFlag: number;
}

interface ZipFile {
  entryCount: number;
  readEntry(): void;
  close(): void;
  on(event: 'entry', listener: (entry: ZipEntry) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  openReadStream(
    entry: ZipEntry,
    callback: (error: Error | null, stream?: NodeJS.ReadableStream & { destroy(error?: Error): void }) => void,
  ): void;
}

interface YauzlModule {
  fromBuffer(
    content: Buffer,
    options: { lazyEntries: boolean; decodeStrings: boolean; validateEntrySizes: boolean },
    callback: (error: Error | null, zipFile?: ZipFile) => void,
  ): void;
}

// yauzl is the single pinned XLSX dependency. Its lazy entry API lets this module
// reject expansion metadata before opening a decompression stream.
const loadRuntimeModule = createRequire(__filename);
const yauzl = loadRuntimeModule('yauzl') as YauzlModule;

export type TextStageAdapter = (request: ParserJobRequestV2, content: Buffer) => Promise<ParserStageResult>;

export interface TextExtractionAdapters {
  pdf?: TextStageAdapter;
  docx?: TextStageAdapter;
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

function meaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text.replace(/[\p{C}\p{Z}]/gu, ''));
}

function decodeUtf8(content: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}

function classifyLine(text: string, kind: 'markdown' | 'tex') {
  const heading = kind === 'markdown'
    ? /^\s{0,3}#{1,6}(?:\s|$)/u.test(text)
    : /^\s*\\(?:part|chapter|section|subsection|subsubsection)(?:\*?\{|\b)/u.test(text);
  return heading ? 'heading' as const : 'paragraph' as const;
}

function parsePlainLines(content: Buffer, kind: 'markdown' | 'tex'): SourceMapPageDraft[] {
  const lines = decodeUtf8(content).replace(/\r\n?/gu, '\n').split('\n');
  const cells: VirtualTextCell[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    if (!text.trim()) continue;
    cells.push({ line: index + 1, kind: classifyLine(text, kind), text });
  }
  return [buildVirtualPage(1, cells, lines.length)];
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (closedQuote) {
      if (character === ',') {
        row.push(cell);
        cell = '';
        closedQuote = false;
      } else if (character === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        closedQuote = false;
      } else if (character !== '\r') {
        throw new Error('malformed CSV');
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character;
    }
  }
  if (quoted) throw new Error('malformed CSV');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseCsv(content: Buffer): SourceMapPageDraft[] {
  const rows = parseCsvRows(decodeUtf8(content));
  if (rows.length > 10_000) throw new ParsingLimitError();
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const cells: VirtualTextCell[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const text = row[columnIndex]!;
      if (!text.trim()) continue;
      cells.push({
        line: rowIndex + 1,
        column: columnIndex + 1,
        columnCount,
        kind: 'paragraph',
        text,
      });
      if (cells.length > MAX_CELLS) throw new ParsingLimitError();
    }
  }
  return [buildVirtualPage(1, cells, rows.length)];
}

function readZipEntry(zipFile: ZipFile, entry: ZipEntry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('ZIP entry stream unavailable'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > entry.uncompressedSize || size > MAX_ZIP_ENTRY_BYTES) {
          stream.destroy(new ParsingLimitError());
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once('error', reject);
      stream.once('end', () => {
        if (size !== entry.uncompressedSize) reject(new Error('ZIP entry size mismatch'));
        else resolve(Buffer.concat(chunks, size));
      });
    });
  });
}

function isRelevantXlsxEntry(fileName: string): boolean {
  return fileName === 'xl/workbook.xml'
    || fileName === 'xl/_rels/workbook.xml.rels'
    || fileName === 'xl/sharedStrings.xml'
    || /^xl\/worksheets\/[^/]+\.xml$/u.test(fileName);
}

function readBoundedXlsxEntries(content: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(content, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
    }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('ZIP unavailable'));
        return;
      }
      let settled = false;
      let entryCount = 0;
      let expandedBytes = 0;
      const entries = new Map<string, Buffer>();
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };
      if (zipFile.entryCount > MAX_ZIP_ENTRIES) {
        fail(new ParsingLimitError());
        return;
      }
      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        void (async () => {
          entryCount += 1;
          if (entryCount > MAX_ZIP_ENTRIES || (entry.generalPurposeBitFlag & 0x1) !== 0) throw new ParsingLimitError();
          if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new ParsingLimitError();
          expandedBytes += entry.uncompressedSize;
          if (expandedBytes > MAX_ZIP_EXPANDED_BYTES) throw new ParsingLimitError();
          if (entry.uncompressedSize > 0
            && entry.uncompressedSize / Math.max(1, entry.compressedSize) > MAX_ZIP_COMPRESSION_RATIO) {
            throw new ParsingLimitError();
          }
          if (!entry.fileName.endsWith('/') && isRelevantXlsxEntry(entry.fileName)) {
            entries.set(entry.fileName, await readZipEntry(zipFile, entry));
          }
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.readEntry();
    });
  });
}

function decodeXmlText(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (entity, code: string) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const value = code[1]?.toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

function boundedXml(content: Buffer): string {
  const xml = decodeUtf8(content);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new ParsingLimitError();
  const entities = xml.match(/&[^;\s]{1,40};/gu) ?? [];
  if (entities.length > MAX_XML_ENTITIES
    || entities.some((entity) => !/^&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);$/iu.test(entity))) {
    throw new ParsingLimitError();
  }
  return xml;
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)')`, 'u').exec(attributes);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decodeXmlText(value);
}

function textElements(xml: string): string {
  let result = '';
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)) result += decodeXmlText(match[1]!);
  return result;
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gu)) {
    strings.push(textElements(match[1]!));
    if (strings.length > MAX_SHARED_STRINGS) throw new ParsingLimitError();
  }
  return strings;
}

function workbookSheets(workbookXml: string, relationshipsXml: string): Array<{ name: string; path: string }> {
  const relationships = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gu)) {
    const id = attribute(match[1]!, 'Id');
    const target = attribute(match[1]!, 'Target');
    if (!id || !target || target.includes('..') || target.includes('\\')) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//u, '')}`;
    if (/^xl\/worksheets\/[^/]+\.xml$/u.test(path)) relationships.set(id, path);
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gu)) {
    const name = attribute(match[1]!, 'name');
    const relationshipId = attribute(match[1]!, 'r:id');
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!name || !path) throw new Error('malformed workbook relationship');
    sheets.push({ name, path });
    if (sheets.length > 10_000) throw new ParsingLimitError();
  }
  return sheets;
}

function columnNumber(reference: string): number {
  const letters = /^([A-Z]+)[1-9]\d*$/u.exec(reference)?.[1];
  if (!letters) throw new Error('malformed cell reference');
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function rowNumber(reference: string): number {
  const value = /^[A-Z]+([1-9]\d*)$/u.exec(reference)?.[1];
  const parsed = value ? Number.parseInt(value, 10) : 0;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 9_999) throw new ParsingLimitError();
  return parsed;
}

function worksheetCells(xml: string, strings: readonly string[]): Array<{ row: number; column: number; text: string }> {
  const cells: Array<{ row: number; column: number; text: string }> = [];
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    const reference = attribute(match[1]!, 'r');
    if (!reference) throw new Error('cell reference missing');
    const type = attribute(match[1]!, 't');
    const body = match[2]!;
    const rawValue = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/u.exec(body)?.[1];
    let text = '';
    if (type === 'inlineStr') text = textElements(body);
    else if (type === 's') {
      const index = rawValue === undefined ? -1 : Number.parseInt(rawValue, 10);
      if (!Number.isSafeInteger(index) || index < 0 || index >= strings.length) throw new Error('shared string index invalid');
      text = strings[index]!;
    } else if (rawValue !== undefined) {
      text = decodeXmlText(rawValue);
    }
    if (text.trim()) cells.push({ row: rowNumber(reference), column: columnNumber(reference), text });
    if (cells.length > MAX_CELLS) throw new ParsingLimitError();
  }
  return cells;
}

async function parseXlsx(content: Buffer): Promise<SourceMapPageDraft[]> {
  const entries = await readBoundedXlsxEntries(content);
  const workbook = entries.get('xl/workbook.xml');
  const relationships = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('workbook manifest missing');
  const strings = sharedStrings(entries.get('xl/sharedStrings.xml') ? boundedXml(entries.get('xl/sharedStrings.xml')!) : undefined);
  const sheets = workbookSheets(boundedXml(workbook), boundedXml(relationships));
  if (sheets.length === 0) throw new Error('workbook has no sheets');
  let totalCells = 0;
  return sheets.map((sheet, pageIndex) => {
    const worksheet = entries.get(sheet.path);
    if (!worksheet) throw new Error('worksheet missing');
    const cells = worksheetCells(boundedXml(worksheet), strings);
    totalCells += cells.length;
    if (totalCells > MAX_CELLS) throw new ParsingLimitError();
    const columnCount = Math.max(1, ...cells.map((cell) => cell.column));
    const maxRow = Math.max(0, ...cells.map((cell) => cell.row));
    const virtualCells: VirtualTextCell[] = [
      { line: 1, kind: 'heading', text: sheet.name },
      ...cells.map((cell) => ({
        line: cell.row + 1,
        column: cell.column,
        columnCount,
        kind: 'paragraph' as const,
        text: cell.text,
      })),
    ];
    return buildVirtualPage(pageIndex + 1, virtualCells, maxRow + 1);
  });
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

async function parseBinary(input: ParserInput, adapter: TextStageAdapter | undefined, kind: 'pdf' | 'docx') {
  if (!adapter) return needsReview(input, 'parser-unavailable');
  const result = parseParserStageResult(await adapter(stageRequest(input), Buffer.from(input.content)));
  if (kind === 'pdf') {
    const pages = buildPhysicalPages(result.pages, result.parser);
    if (!pages.some((page) => page.blocks.some((block) => block.text && meaningful(block.text)))) {
      return needsReview(input, 'empty-parsed-text');
    }
    return {
      status: 'succeeded' as const,
      sourceMap: mergeSourceMapPages(input, TEXT_EXTRACTOR_METADATA, pages),
      warnings: [...result.warnings],
    };
  }

  const paragraphs = result.pages
    .slice()
    .sort((left, right) => left.page - right.page)
    .flatMap((page) => page.blocks)
    .flatMap((block) => block.text?.replace(/\r\n?/gu, '\n').split(/\n+/gu) ?? [])
    .filter((paragraph) => paragraph.trim());
  const page = buildVirtualPage(1, paragraphs.map((text, index) => ({
    line: index + 1,
    kind: 'paragraph',
    text,
    parser: result.parser,
  })), paragraphs.length);
  if (!paragraphs.some(meaningful)) return needsReview(input, 'empty-parsed-text');
  return {
    status: 'succeeded' as const,
    sourceMap: mergeSourceMapPages(input, TEXT_EXTRACTOR_METADATA, [page]),
    warnings: [...result.warnings],
  };
}

function assertSourceMapBudgets(pages: readonly SourceMapPageDraft[]): void {
  let blocks = 0;
  let textCharacters = 0;
  for (const page of pages) {
    blocks += page.blocks.length;
    if (blocks > 10_000) throw new ParsingLimitError();
    for (const block of page.blocks) {
      if (block.text === undefined) continue;
      if (block.text.length > MAX_BLOCK_TEXT_CHARACTERS) throw new ParsingLimitError();
      textCharacters += block.text.length;
      if (textCharacters > MAX_TOTAL_TEXT_CHARACTERS) throw new ParsingLimitError();
    }
  }
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
        const pages = type === 'text/csv'
          ? parseCsv(input.content)
          : type === XLSX_MEDIA_TYPE
            ? await parseXlsx(input.content)
            : parsePlainLines(input.content, type === 'application/x-tex' || type === 'text/x-tex' ? 'tex' : 'markdown');
        assertSourceMapBudgets(pages);
        const sourceMap = mergeSourceMapPages(input, TEXT_EXTRACTOR_METADATA, pages);
        if (!sourceMap.pages.some((page) => page.blocks.some((block) => block.text && meaningful(block.text)))) {
          return needsReview(input, 'empty-parsed-text');
        }
        return { status: 'succeeded', sourceMap, warnings: [] };
      } catch (error) {
        if (error instanceof ParsingLimitError) {
          return { status: 'blocked', code: 'limit_exceeded', message: 'document parsing safety limit exceeded' };
        }
        return needsReview(input, 'parser-failed');
      }
    },
  };
}
