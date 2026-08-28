import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { DocumentParserMetadata } from '@openscience/domain';
import {
  parseParserStageResult,
  SafeParserWarningCode,
  type ParserStageResult,
  type StageBlock,
  type StagePage,
} from './job-protocol';
import type { ParserInput } from './types';

export const LOCAL_OCR_LIMITS = Object.freeze({
  maxPages: 4,
  maxPageBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
  maxPixels: 40_000_000,
  maxTotalPixels: 40_000_000,
  maxTsvBytes: 4 * 1024 * 1024,
  maxRenderOutputBytes: 12 * 1024 * 1024,
  maxBlocks: 10_000,
  maxBlockTextCharacters: 50_000,
  maxTotalTextCharacters: 5_000_000,
  renderWidth: 2048,
  timeoutMs: 30_000,
  maxStageTimeoutMs: 120_000,
});

export interface OcrRasterPage {
  pageNumber: number;
  mediaType: 'image/png';
  bytes: Uint8Array;
  width: number;
  height: number;
  contentHash: string;
}

export interface LocalOcrAdapter {
  readonly metadata: DocumentParserMetadata;
  readonly timeoutMs?: number;
  renderPdfPages(input: ParserInput, pageNumbers: readonly number[]): Promise<OcrRasterPage[]>;
  recognizePage(page: OcrRasterPage): Promise<string>;
}

export const TESSERACT_METADATA: DocumentParserMetadata = Object.freeze({
  name: 'tesseract',
  version: '5.3.0',
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TSV_COLUMNS = [
  'level', 'page_num', 'block_num', 'par_num', 'line_num', 'word_num',
  'left', 'top', 'width', 'height', 'conf', 'text',
] as const;
const LANGUAGE_LIST = /^[A-Za-z0-9_+.-]{1,64}$/;
const ISOLATED_RENDER_SOURCE = `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const content = Buffer.concat(chunks);
const pageNumbers = JSON.parse(process.argv[1]);
const { PDFParse } = await import('pdf-parse');
const parser = new PDFParse({ data: new Uint8Array(content) });
try {
  const result = await parser.getScreenshot({
    partial: pageNumbers,
    desiredWidth: ${LOCAL_OCR_LIMITS.renderWidth},
    imageBuffer: true,
    imageDataUrl: false,
  });
  let totalBytes = 0;
  const pages = result.pages.map((page) => {
    totalBytes += page.data.byteLength;
    if (page.data.byteLength > ${LOCAL_OCR_LIMITS.maxPageBytes}
      || totalBytes > ${LOCAL_OCR_LIMITS.maxTotalBytes}) throw new Error('render limit exceeded');
    return {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      bytes: Buffer.from(page.data).toString('base64'),
    };
  });
  process.stdout.write(JSON.stringify(pages));
} finally {
  await parser.destroy();
}
`;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24 || !PNG_MAGIC.every((value, index) => bytes[index] === value)) {
    throw new Error('invalid OCR raster');
  }
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.readUInt32BE(8) !== 13 || view.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('invalid OCR raster');
  }
  const width = view.readUInt32BE(16);
  const height = view.readUInt32BE(20);
  if (width < 1 || height < 1) throw new Error('invalid OCR raster');
  return { width, height };
}

function validateRaster(page: OcrRasterPage, selectedPage: number): OcrRasterPage {
  if (page.pageNumber !== selectedPage || page.mediaType !== 'image/png' || !(page.bytes instanceof Uint8Array)) {
    throw new Error('invalid OCR raster');
  }
  if (page.bytes.byteLength < 1 || page.bytes.byteLength > LOCAL_OCR_LIMITS.maxPageBytes) {
    throw new Error('invalid OCR raster');
  }
  const encoded = pngDimensions(page.bytes);
  if (!Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height)
    || page.width !== encoded.width || page.height !== encoded.height
    || page.width > LOCAL_OCR_LIMITS.maxDimension || page.height > LOCAL_OCR_LIMITS.maxDimension
    || page.width * page.height > LOCAL_OCR_LIMITS.maxPixels) {
    throw new Error('invalid OCR raster');
  }
  if (!/^[a-f0-9]{64}$/.test(page.contentHash) || sha256(page.bytes) !== page.contentHash) {
    throw new Error('invalid OCR raster');
  }
  return {
    pageNumber: page.pageNumber,
    mediaType: 'image/png',
    bytes: Uint8Array.from(page.bytes),
    width: page.width,
    height: page.height,
    contentHash: page.contentHash,
  };
}

function parseFinite(value: string): number {
  if (value.trim() === '') return Number.NaN;
  return Number(value);
}

export function parseTesseractTsv(tsv: string, raster: OcrRasterPage, page: StagePage): StageBlock[] {
  if (Buffer.byteLength(tsv, 'utf8') > LOCAL_OCR_LIMITS.maxTsvBytes) throw new Error('OCR TSV exceeds limit');
  const lines = tsv.split(/\r?\n/);
  const header = lines.shift()?.split('\t');
  if (!header || header.length !== TSV_COLUMNS.length || header.some((value, index) => value !== TSV_COLUMNS[index])) {
    throw new Error('invalid OCR TSV');
  }
  const blocks: StageBlock[] = [];
  let textCharacters = 0;
  for (const line of lines) {
    if (!line) continue;
    const columns = line.split('\t');
    if (columns.length < TSV_COLUMNS.length) throw new Error('invalid OCR TSV');
    if (parseFinite(columns[0]!) !== 5) continue;
    const text = columns.slice(11).join('\t').trim();
    if (!text) continue;
    textCharacters += text.length;
    if (text.length > LOCAL_OCR_LIMITS.maxBlockTextCharacters
      || textCharacters > LOCAL_OCR_LIMITS.maxTotalTextCharacters
      || blocks.length >= LOCAL_OCR_LIMITS.maxBlocks) {
      throw new Error('OCR TSV exceeds stage limits');
    }
    const left = parseFinite(columns[6]!);
    const top = parseFinite(columns[7]!);
    const width = parseFinite(columns[8]!);
    const height = parseFinite(columns[9]!);
    const confidence = parseFinite(columns[10]!);
    if (![left, top, width, height, confidence].every(Number.isFinite)
      || ![left, top, width, height].every(Number.isSafeInteger)
      || left < 0 || top < 0 || width <= 0 || height <= 0
      || left + width > raster.width || top + height > raster.height
      || confidence < 0 || confidence > 100) {
      throw new Error('invalid OCR bounding box');
    }
    const x = left / raster.width * page.width;
    const y = page.height - (top + height) / raster.height * page.height;
    const normalizedWidth = width / raster.width * page.width;
    const normalizedHeight = height / raster.height * page.height;
    const xTolerance = Number.EPSILON * Math.max(Math.abs(x), normalizedWidth, page.width) * 16;
    const yTolerance = Number.EPSILON * Math.max(Math.abs(y), normalizedHeight, page.height) * 16;
    if (![x, y, normalizedWidth, normalizedHeight].every(Number.isFinite)
      || x < 0 || y < 0 || normalizedWidth <= 0 || normalizedHeight <= 0
      || x + normalizedWidth - page.width > xTolerance
      || y + normalizedHeight - page.height > yTolerance) {
      throw new Error('invalid OCR bounding box');
    }
    blocks.push({
      kind: 'paragraph',
      text,
      boundingBox: { x, y, width: normalizedWidth, height: normalizedHeight },
      confidence: confidence / 100,
    });
  }
  if (blocks.length === 0) throw new Error('OCR returned no words');
  return blocks;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('local OCR timeout'));
    }, timeoutMs);
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function emptyOutputPages(pages: readonly StagePage[]): StagePage[] {
  return pages.map((page) => ({ page: page.page, width: page.width, height: page.height, blocks: [] }));
}

export async function ocrSelectedPages(
  input: ParserInput,
  pages: readonly StagePage[],
  adapter: LocalOcrAdapter,
): Promise<ParserStageResult> {
  if (input.mediaType !== 'application/pdf') throw new Error('local OCR requires a PDF input');
  if (pages.length < 1 || pages.length > LOCAL_OCR_LIMITS.maxPages) throw new Error('selected page limit exceeded');
  const pageNumbers = pages.map(({ page }) => page);
  if (pageNumbers.some((value) => !Number.isSafeInteger(value) || value < 1)
    || new Set(pageNumbers).size !== pageNumbers.length) {
    throw new Error('invalid selected pages');
  }
  const timeoutMs = adapter.timeoutMs ?? LOCAL_OCR_LIMITS.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LOCAL_OCR_LIMITS.timeoutMs) {
    throw new Error('invalid local OCR timeout');
  }
  const stageDeadline = Date.now() + Math.min(
    LOCAL_OCR_LIMITS.maxStageTimeoutMs,
    timeoutMs * (pages.length + 1),
  );

  const outputPages = emptyOutputPages(pages);
  let rendered: OcrRasterPage[];
  try {
    rendered = await withTimeout(adapter.renderPdfPages(input, pageNumbers), timeoutMs);
  } catch {
    return parseParserStageResult({
      schemaVersion: 2,
      parser: { ...adapter.metadata },
      pages: outputPages,
      warnings: [SafeParserWarningCode.PARTIAL_RESULT],
    });
  }

  const totalBytes = rendered.reduce((total, value) => (
    total + (value?.bytes instanceof Uint8Array ? value.bytes.byteLength : 0)
  ), 0);
  const totalPixels = rendered.reduce((total, value) => (
    total + (Number.isSafeInteger(value?.width) && Number.isSafeInteger(value?.height)
      ? value.width * value.height
      : LOCAL_OCR_LIMITS.maxTotalPixels + 1)
  ), 0);
  const renderedByPage = new Map(rendered.map((value) => [value.pageNumber, value]));
  const invalidSelection = rendered.length !== pages.length
    || renderedByPage.size !== rendered.length
    || rendered.some(({ pageNumber }) => !pageNumbers.includes(pageNumber));
  let succeeded = 0;
  let failed = invalidSelection
    || totalBytes > LOCAL_OCR_LIMITS.maxTotalBytes
    || totalPixels > LOCAL_OCR_LIMITS.maxTotalPixels
    ? pages.length
    : 0;

  if (failed === 0) {
    let stageBlocks = 0;
    let stageTextCharacters = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!;
      try {
        const raster = validateRaster(renderedByPage.get(page.page) as OcrRasterPage, page.page);
        const remainingMs = stageDeadline - Date.now();
        if (remainingMs < 1) throw new Error('local OCR stage timeout');
        const recognized = await withTimeout(adapter.recognizePage(raster), Math.min(timeoutMs, remainingMs));
        const blocks = parseTesseractTsv(recognized, raster, page);
        const textCharacters = blocks.reduce((total, block) => total + (block.text?.length ?? 0), 0);
        if (stageBlocks + blocks.length > LOCAL_OCR_LIMITS.maxBlocks
          || stageTextCharacters + textCharacters > LOCAL_OCR_LIMITS.maxTotalTextCharacters) {
          throw new Error('OCR stage exceeds aggregate limits');
        }
        outputPages[index] = { ...outputPages[index]!, blocks };
        stageBlocks += blocks.length;
        stageTextCharacters += textCharacters;
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
  }

  const warnings: SafeParserWarningCode[] = [];
  if (succeeded > 0) warnings.push(SafeParserWarningCode.OCR_APPLIED);
  if (failed > 0) warnings.push(SafeParserWarningCode.PARTIAL_RESULT);
  return parseParserStageResult({
    schemaVersion: 2,
    parser: { ...adapter.metadata },
    pages: outputPages,
    warnings,
  });
}

function runBoundedProcess(
  command: string,
  args: readonly string[],
  input: Uint8Array,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let closed = false;
    const terminate = (error: Error) => {
      if (!failure) failure = error;
      if (!closed && child.exitCode === null) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => terminate(new Error('local parser timeout')), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > maxOutputBytes) {
        terminate(new Error('local parser output exceeds limit'));
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => terminate(new Error('local parser unavailable')));
    child.once('close', (code) => {
      closed = true;
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure ?? new Error('local parser failed'));
      else resolve(Buffer.concat(chunks, size));
    });
    child.stdin.once('error', () => terminate(new Error('local parser input failed')));
    child.stdin.end(input);
  });
}

async function renderPdfPages(input: ParserInput, pageNumbers: readonly number[]): Promise<OcrRasterPage[]> {
  const output = await runBoundedProcess(
    process.execPath,
    ['--max-old-space-size=256', '--input-type=module', '-e', ISOLATED_RENDER_SOURCE, JSON.stringify(pageNumbers)],
    input.content,
    LOCAL_OCR_LIMITS.timeoutMs,
    LOCAL_OCR_LIMITS.maxRenderOutputBytes,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.toString('utf8'));
  } catch {
    throw new Error('invalid OCR render response');
  }
  if (!Array.isArray(parsed) || parsed.length !== pageNumbers.length) throw new Error('invalid OCR render response');
  return parsed.map((value): OcrRasterPage => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid OCR render response');
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['pageNumber', 'width', 'height', 'bytes'].includes(key))
      || typeof item.bytes !== 'string') throw new Error('invalid OCR render response');
    const bytes = Buffer.from(item.bytes, 'base64');
    const dimensions = pngDimensions(bytes);
    if (typeof item.width !== 'number' || typeof item.height !== 'number'
      || Math.abs(item.width - dimensions.width) > 1 || Math.abs(item.height - dimensions.height) > 1) {
      throw new Error('invalid OCR raster');
    }
    return {
      pageNumber: item.pageNumber as number,
      mediaType: 'image/png',
      bytes,
      width: dimensions.width,
      height: dimensions.height,
      contentHash: sha256(bytes),
    };
  });
}

async function recognizeWithTesseract(page: OcrRasterPage, timeoutMs: number): Promise<string> {
  const languageList = process.env.TESSERACT_LANGS ?? 'eng+chi_sim';
  if (!LANGUAGE_LIST.test(languageList)) throw new Error('invalid OCR language configuration');
  const output = await runBoundedProcess(
    process.env.TESSERACT_BIN ?? 'tesseract',
    ['stdin', 'stdout', '-l', languageList, 'tsv'],
    page.bytes,
    timeoutMs,
    LOCAL_OCR_LIMITS.maxTsvBytes,
  );
  return output.toString('utf8');
}

export function createTesseractOcrAdapter(): LocalOcrAdapter {
  return {
    metadata: { ...TESSERACT_METADATA },
    timeoutMs: LOCAL_OCR_LIMITS.timeoutMs,
    renderPdfPages,
    recognizePage: (page) => recognizeWithTesseract(page, LOCAL_OCR_LIMITS.timeoutMs),
  };
}
