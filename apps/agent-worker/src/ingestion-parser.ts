import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  parseParserStageResult,
  type ParserStageResult,
  type StagePage,
} from './parsers/job-protocol';
import type { DocumentParser, ParserInput } from './parsers/types';

export type ParsedIngestion =
  | { status: 'ready'; text: string; format: string }
  | { status: 'needs_review'; format: string; reason: string };

export interface IngestionAdapters {
  pdf?: (content: Buffer) => Promise<ParserStageResult>;
  docx?: (content: Buffer) => Promise<string>;
  image?: (content: Buffer) => Promise<string>;
  xlsx?: (content: Buffer) => Promise<ParserStageResult>;
}

export type LegacyIngestionAdapters = Omit<IngestionAdapters, 'pdf'> & {
  pdf?: (content: Buffer) => Promise<string | ParserStageResult>;
};

const PARSER_TIMEOUT_MS = 60_000;
const MAX_PARSED_TEXT_CHARS = 5 * 1024 * 1024;
const ISOLATED_PARSER_SOURCE = `
(async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const content = Buffer.concat(chunks);
  const kind = process.argv[1];
  if (kind !== 'docx') throw new Error('unsupported isolated parser');
  const text = (await require('mammoth').extractRawText({ buffer: content })).value;
  if (text.length > ${MAX_PARSED_TEXT_CHARS}) throw new Error('parsed text too large');
  process.stdout.write(text);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
const ISOLATED_TYPESCRIPT_STAGE_SOURCE = `
(async () => {
  const { readFileSync } = require('node:fs');
  const ts = require('typescript');
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText, filename);
  };
  const modulePath = process.argv[1];
  const stage = process.argv[2];
  const maxInput = Number(process.argv[3]);
  const maxOutput = Number(process.argv[4]);
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxInput) throw new Error('xlsx parser input too large');
    chunks.push(chunk);
  }
  const parser = require(modulePath);
  const parse = stage === 'pdf' ? parser.parseStructuredPdfResult
    : stage === 'xlsx' ? parser.parseStructuredXlsxResult : undefined;
  if (typeof parse !== 'function') throw new Error('unsupported structured parser stage');
  const serialized = JSON.stringify(await parse(Buffer.concat(chunks, size)));
  if (Buffer.byteLength(serialized) > maxOutput) throw new Error('xlsx parser output too large');
  process.stdout.write(serialized);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_EXPANDED_BYTES = 24 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_SHARED_STRINGS = 100_000;
const MAX_XLSX_CELLS = 9_900;
const MAX_XLSX_BLOCKS = 10_000;
const MAX_XML_ENTITIES = 100_000;
const MAX_XLSX_COLUMN = 16_384;
const MAX_XLSX_ROW = 1_048_576;
const VIRTUAL_PAGE_WIDTH = 1000;
const VIRTUAL_LINE_HEIGHT = 24;
const XLSX_TRANSITION_PARSER_METADATA = Object.freeze({ name: 'v1-text-transition', version: '2.0.0' });
const XLSX_FORMULA_START_TAG = /<(?:[^\s/>:]+:)?f(?=[\s/>])/iu;
const XLSX_MERGE_START_TAG = /<(?:[^\s/>:]+:)?mergeCells?(?=[\s/>])/iu;

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

export class XlsxParsingLimitError extends Error {}

const loadRuntimeModule = createRequire(__filename);
const yauzl = loadRuntimeModule('yauzl') as YauzlModule;

function decodeUtf8(content: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
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
          stream.destroy(new XlsxParsingLimitError());
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
        fail(new XlsxParsingLimitError());
        return;
      }
      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        void (async () => {
          entryCount += 1;
          if (entryCount > MAX_ZIP_ENTRIES || (entry.generalPurposeBitFlag & 0x1) !== 0) {
            throw new XlsxParsingLimitError();
          }
          if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new XlsxParsingLimitError();
          expandedBytes += entry.uncompressedSize;
          if (expandedBytes > MAX_ZIP_EXPANDED_BYTES) throw new XlsxParsingLimitError();
          if (entry.uncompressedSize > 0
            && entry.uncompressedSize / Math.max(1, entry.compressedSize) > MAX_ZIP_COMPRESSION_RATIO) {
            throw new XlsxParsingLimitError();
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
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new XlsxParsingLimitError();
  let entityCount = 0;
  for (let start = xml.indexOf('&'); start !== -1; start = xml.indexOf('&', start + 1)) {
    const end = xml.indexOf(';', start + 1);
    if (end === -1 || end - start > 41) throw new XlsxParsingLimitError();
    const entity = xml.slice(start, end + 1);
    entityCount += 1;
    if (entityCount > MAX_XML_ENTITIES
      || !/^&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);$/iu.test(entity)) {
      throw new XlsxParsingLimitError();
    }
    start = end;
  }
  return xml;
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^$()|[\]\\{}]/gu, '\\$&');
  const match = new RegExp("(?:^|\\s)" + escaped + "=(?:\"([^\"]*)\"|'([^']*)')", 'u').exec(attributes);
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
    if (strings.length > MAX_SHARED_STRINGS) throw new XlsxParsingLimitError();
  }
  return strings;
}

function workbookSheets(workbookXml: string, relationshipsXml: string): Array<{ name: string; path: string }> {
  const relationships = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gu)) {
    const id = attribute(match[1]!, 'Id');
    const target = attribute(match[1]!, 'Target');
    if (!id || !target || target.includes('..') || target.includes('\\')) continue;
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//u, '');
    if (/^xl\/worksheets\/[^/]+\.xml$/u.test(path)) relationships.set(id, path);
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gu)) {
    const name = attribute(match[1]!, 'name');
    const relationshipId = attribute(match[1]!, 'r:id');
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!name || !path) throw new Error('malformed workbook relationship');
    sheets.push({ name, path });
    if (sheets.length > 10_000) throw new XlsxParsingLimitError();
  }
  return sheets;
}

function parseCellReference(reference: string): { row: number; column: number } {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/u.exec(reference);
  if (!match) throw new Error('malformed cell reference');
  let column = 0;
  for (const letter of match[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number.parseInt(match[2]!, 10);
  if (!Number.isSafeInteger(column) || column < 1 || column > MAX_XLSX_COLUMN
    || !Number.isSafeInteger(row) || row < 1 || row > MAX_XLSX_ROW) {
    throw new Error('cell reference outside XLSX bounds');
  }
  return { row, column };
}

function worksheetCells(xml: string, strings: readonly string[]): Array<{ row: number; column: number; text: string }> {
  if (XLSX_FORMULA_START_TAG.test(xml)) throw new Error('XLSX formulas are unsupported');
  if (XLSX_MERGE_START_TAG.test(xml)) throw new Error('merged XLSX cells are unsupported');
  const cells: Array<{ row: number; column: number; text: string }> = [];
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    const reference = attribute(match[1]!, 'r');
    if (!reference) throw new Error('cell reference missing');
    const coordinates = parseCellReference(reference);
    const type = attribute(match[1]!, 't');
    const body = match[2]!;
    if (type !== undefined && type !== 'inlineStr' && type !== 's') {
      throw new Error('XLSX cell type is unsupported');
    }
    const rawValue = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/u.exec(body)?.[1];
    let text = '';
    if (type === 'inlineStr') text = textElements(body);
    else if (type === 's') {
      const index = rawValue === undefined ? -1 : Number.parseInt(rawValue, 10);
      if (!Number.isSafeInteger(index) || index < 0 || index >= strings.length) {
        throw new Error('shared string index invalid');
      }
      text = strings[index]!;
    } else if (rawValue !== undefined) {
      text = decodeXmlText(rawValue);
    }
    if (text.trim()) cells.push({ ...coordinates, text });
    if (cells.length > MAX_XLSX_CELLS) throw new XlsxParsingLimitError();
  }
  return cells;
}

export async function parseStructuredXlsxPages(content: Buffer): Promise<StagePage[]> {
  const entries = await readBoundedXlsxEntries(content);
  const workbook = entries.get('xl/workbook.xml');
  const relationships = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('workbook manifest missing');
  const sharedStringsEntry = entries.get('xl/sharedStrings.xml');
  const strings = sharedStrings(sharedStringsEntry ? boundedXml(sharedStringsEntry) : undefined);
  const sheets = workbookSheets(boundedXml(workbook), boundedXml(relationships));
  if (sheets.length === 0) throw new Error('workbook has no sheets');
  let totalCells = 0;
  return sheets.map((sheet, pageIndex): StagePage => {
    const worksheet = entries.get(sheet.path);
    if (!worksheet) throw new Error('worksheet missing');
    const cells = worksheetCells(boundedXml(worksheet), strings);
    totalCells += cells.length;
    if (totalCells > MAX_XLSX_CELLS || totalCells + sheets.length > MAX_XLSX_BLOCKS) {
      throw new XlsxParsingLimitError();
    }
    const columnCount = Math.max(1, ...cells.map((cell) => cell.column));
    const maxRow = Math.max(0, ...cells.map((cell) => cell.row));
    const cellWidth = VIRTUAL_PAGE_WIDTH / columnCount;
    return {
      page: pageIndex + 1,
      width: VIRTUAL_PAGE_WIDTH,
      height: Math.max(VIRTUAL_LINE_HEIGHT, (maxRow + 1) * VIRTUAL_LINE_HEIGHT),
      blocks: [
        {
          kind: 'heading',
          text: sheet.name,
          boundingBox: { x: 0, y: 0, width: VIRTUAL_PAGE_WIDTH, height: VIRTUAL_LINE_HEIGHT },
        },
        ...cells.map((cell) => ({
          kind: 'table' as const,
          text: cell.text,
          boundingBox: {
            x: (cell.column - 1) * cellWidth,
            y: cell.row * VIRTUAL_LINE_HEIGHT,
            width: cellWidth,
            height: VIRTUAL_LINE_HEIGHT,
          },
        })),
      ],
    };
  });
}

export async function parseStructuredXlsxResult(content: Buffer): Promise<ParserStageResult> {
  return parseParserStageResult({
    schemaVersion: 2,
    parser: XLSX_TRANSITION_PARSER_METADATA,
    pages: await parseStructuredXlsxPages(content),
    warnings: [],
  });
}

function parseBinaryIsolated(kind: 'docx', content: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '-e', ISOLATED_PARSER_SOURCE, kind], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let outputSize = 0;
    let errorText = '';
    let settled = false;
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const timer = setTimeout(() => finish(new Error(`${kind} parser timeout`)), PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > MAX_PARSED_TEXT_CHARS * 4) {
        finish(new Error(`${kind} parser output too large`));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorText.length < 4096) errorText += chunk.toString('utf8', 0, 4096 - errorText.length);
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(undefined, Buffer.concat(chunks).toString('utf8'));
      else finish(new Error(errorText || `${kind} parser exited ${code ?? 'unknown'}`));
    });
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(content);
  });
}

export async function runTesseractOcr(
  content: Buffer,
  spawnProcess: typeof spawn = spawn,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.env.TESSERACT_BIN ?? 'tesseract', ['stdin', 'stdout', '-l', process.env.TESSERACT_LANGS ?? 'eng+chi_sim'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let settled = false;
    const settle = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const terminate = (error: Error) => {
      if (!failure) failure = error;
      if (child.exitCode === null) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => terminate(new Error('OCR timeout')), 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { terminate(new Error('OCR output too large')); return; }
      chunks.push(chunk);
    });
    child.once('error', (error) => settle(error));
    child.once('close', (code) => {
      if (failure || code !== 0) settle(failure ?? new Error(`OCR exited ${code}`));
      else settle(undefined, Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.once('error', (error) => terminate(new Error(
      `OCR input failed: ${(error as NodeJS.ErrnoException).code ?? 'write_failed'}`,
    )));
    child.stdin.end(content);
  });
}

function parseStructuredStageIsolated(kind: 'pdf' | 'xlsx', content: Buffer): Promise<ParserStageResult> {
  return new Promise((resolve, reject) => {
    const modulePath = kind === 'pdf'
      ? join(__dirname, 'parsers', `native-pdf-text-items${extname(__filename)}`)
      : __filename;
    const childArguments = extname(modulePath) === '.ts'
      ? [
        '--max-old-space-size=256',
        '-e',
        ISOLATED_TYPESCRIPT_STAGE_SOURCE,
        modulePath,
        kind,
        String(MAX_PARSER_INPUT),
        String(PARSER_JOB_RESPONSE_MAX_BYTES),
      ]
      : ['--max-old-space-size=256', modulePath, `--${kind}-stage-child`];
    const child = spawn(process.execPath, childArguments, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure = '';
    let settled = false;
    const finish = (error?: Error, value?: ParserStageResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (error) reject(error);
      else if (value) resolve(value);
      else reject(new Error(`${kind} parser result missing`));
    };
    const timer = setTimeout(() => finish(new Error(`${kind} parser timeout`)), PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > PARSER_JOB_RESPONSE_MAX_BYTES) finish(new Error(`${kind} parser output too large`));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (failure.length < 1024) failure += chunk.toString('utf8', 0, 1024 - failure.length); });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code !== 0) {
        finish(new Error(failure || `${kind} parser exited ${code}`));
        return;
      }
      try {
        finish(undefined, parseParserStageResult(JSON.parse(Buffer.concat(chunks, size).toString('utf8'))));
      } catch {
        finish(new Error(`${kind} parser returned an invalid V2 stage result`));
      }
    });
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(content);
  });
}

async function runStructuredXlsxStageChild(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_PARSER_INPUT) throw new XlsxParsingLimitError();
    chunks.push(Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks, size);
  const serialized = JSON.stringify(await parseStructuredXlsxResult(content));
  if (Buffer.byteLength(serialized) > PARSER_JOB_RESPONSE_MAX_BYTES) throw new XlsxParsingLimitError();
  process.stdout.write(serialized);
}

export function createDefaultIngestionAdapters(): IngestionAdapters {
  return {
    pdf: (content) => parseStructuredStageIsolated('pdf', content),
    docx: (content) => parseBinaryIsolated('docx', content),
    image: runTesseractOcr,
    xlsx: (content) => parseStructuredStageIsolated('xlsx', content),
  };
}

export const MAX_PARSER_INPUT = 50 * 1024 * 1024;

/** Canonical execution path for provider-neutral DocumentParser implementations. */
export async function executeDocumentParser(parser: DocumentParser, input: ParserInput) {
  // Keep the legacy sidecar's ingestion-parser module graph loadable without
  // packaging the worker-only DocumentParser contract into that image.
  const { runDocumentParser } = await import('./parsers/base-parser.js');
  return runDocumentParser(input, parser);
}

/**
 * 将已通过上传内容门禁的 Blob 转成 Hermes 可消费的正文。
 * 文本格式在 worker 内完成确定性解码；PDF/DOC/DOCX/图片先保留为
 * needs_review，等待部署环境挂载受控解析器（不得把二进制当正文送给模型）。
 */
export function parseIngestion(filename: string, content: Buffer): ParsedIngestion {
  const extension = extname(filename).toLowerCase();
  if (extension === '.md' || extension === '.markdown' || extension === '.tex') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content).trim();
    if (!text) return { status: 'needs_review', format: extension.slice(1), reason: 'empty-text' };
    return { status: 'ready', text, format: extension === '.tex' ? 'tex' : 'md' };
  }
  return {
    status: 'needs_review',
    format: extension.slice(1) || 'unknown',
    reason: 'binary-parser-not-mounted',
  };
}

/** Controlled binary parser seam. Adapters are injected by the worker composition root. */
export async function parseIngestionWithAdapters(
  filename: string,
  content: Buffer,
  adapters: LegacyIngestionAdapters,
): Promise<ParsedIngestion> {
  if (content.byteLength > MAX_PARSER_INPUT) {
    return { status: 'needs_review', format: extname(filename).slice(1).toLowerCase() || 'unknown', reason: 'parser-input-too-large' };
  }
  const extension = extname(filename).toLowerCase();
  const adapter = extension === '.pdf'
    ? adapters.pdf
    : extension === '.docx'
      ? adapters.docx
      : ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(extension)
        ? adapters.image
        : undefined;
  if (!adapter) return parseIngestion(filename, content);
  let parsed: string | ParserStageResult;
  try {
    parsed = await adapter(content);
  } catch {
    return { status: 'needs_review', format: extension.slice(1), reason: 'parser-failed' };
  }
  const text = typeof parsed === 'string'
    ? parsed
    : parseParserStageResult(parsed).pages
      .flatMap(({ blocks }) => blocks.flatMap(({ text: blockText }) => blockText === undefined ? [] : [blockText]))
      .join('\n');
  const meaningfulText = text
    .replace(/-- \d+ of \d+ --/gu, '')
    .replace(/[\p{C}\p{Z}]/gu, '');
  if (!/[\p{L}\p{N}]/u.test(meaningfulText)) {
    return { status: 'needs_review', format: extension.slice(1), reason: 'empty-parsed-text' };
  }
  return { status: 'ready', text, format: extension.slice(1) };
}

if (require.main === module && process.argv[2] === '--xlsx-stage-child') {
  void runStructuredXlsxStageChild().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : 'xlsx parser failed');
    process.exitCode = 1;
  });
}
