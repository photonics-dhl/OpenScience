import { extname } from 'node:path';
import { spawn } from 'node:child_process';
import type { DocumentParser, ParserInput } from './parsers/types';

export type ParsedIngestion =
  | { status: 'ready'; text: string; format: string }
  | { status: 'needs_review'; format: string; reason: string };

export interface IngestionAdapters {
  pdf?: (content: Buffer) => Promise<string>;
  docx?: (content: Buffer) => Promise<string>;
  image?: (content: Buffer) => Promise<string>;
  xlsx?: (content: Buffer) => Promise<string>;
}

const PARSER_TIMEOUT_MS = 60_000;
const MAX_PARSED_TEXT_CHARS = 5 * 1024 * 1024;
const ISOLATED_PARSER_SOURCE = `
(async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const content = Buffer.concat(chunks);
  const kind = process.argv[1];
  let text = '';
  if (kind === 'pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: content });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (kind === 'docx') {
    text = (await require('mammoth').extractRawText({ buffer: content })).value;
  } else {
    throw new Error('unsupported isolated parser');
  }
  if (text.length > ${MAX_PARSED_TEXT_CHARS}) throw new Error('parsed text too large');
  process.stdout.write(text);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
const ISOLATED_XLSX_SOURCE = `
(async () => {
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const content = Buffer.concat(chunks);
const yauzl = require('yauzl');
const MAX_ENTRIES = 256;
const MAX_ENTRY = 8 * 1024 * 1024;
const MAX_EXPANDED = 24 * 1024 * 1024;
const MAX_ENTITIES = 100000;
const entries = await new Promise((resolve, reject) => {
  yauzl.fromBuffer(content, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zip) => {
    if (error || !zip) return reject(error || new Error('ZIP unavailable'));
    if (zip.entryCount > MAX_ENTRIES) { zip.close(); return reject(new Error('entry limit')); }
    const result = [];
    let count = 0;
    let expanded = 0;
    let settled = false;
    const fail = (reason) => { if (settled) return; settled = true; zip.close(); reject(reason); };
    zip.on('error', fail);
    zip.on('entry', (entry) => {
      (async () => {
        count += 1;
        expanded += entry.uncompressedSize;
        if (count > MAX_ENTRIES || expanded > MAX_EXPANDED || entry.uncompressedSize > MAX_ENTRY
          || (entry.generalPurposeBitFlag & 1) !== 0
          || (entry.uncompressedSize > 0 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 100)) {
          throw new Error('ZIP limit');
        }
        if (!/^xl\\/(workbook|sharedStrings|worksheets\\/[^/]+)\\.xml$/.test(entry.fileName)) {
          zip.readEntry(); return;
        }
        const data = await new Promise((done, failed) => zip.openReadStream(entry, (openError, stream) => {
          if (openError || !stream) return failed(openError || new Error('stream unavailable'));
          const parts = []; let bytes = 0;
          stream.on('data', (part) => { bytes += part.length; if (bytes > entry.uncompressedSize || bytes > MAX_ENTRY) stream.destroy(new Error('entry limit')); else parts.push(part); });
          stream.once('error', failed);
          stream.once('end', () => bytes === entry.uncompressedSize ? done(Buffer.concat(parts, bytes)) : failed(new Error('entry size')));
        }));
        result.push(data);
        zip.readEntry();
      })().catch(fail);
    });
    zip.on('end', () => { if (!settled) { settled = true; resolve(result); } });
    zip.readEntry();
  });
});
const lines = [];
for (const bytes of entries) {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entity declaration');
  let entities = 0;
  for (let start = xml.indexOf('&'); start !== -1; start = xml.indexOf('&', start + 1)) {
    const end = xml.indexOf(';', start + 1);
    if (end === -1 || end - start > 41 || ++entities > MAX_ENTITIES
      || !/^&(amp|lt|gt|quot|apos|#\\d+|#x[\\da-f]+);$/i.test(xml.slice(start, end + 1))) throw new Error('XML entity limit');
    start = end;
  }
  for (const match of xml.matchAll(/<t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/t>/g)) {
    lines.push(match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, code) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code]));
    if (lines.length > 10000) throw new Error('cell limit');
  }
}
const text = lines.join('\\n');
if (!text.trim() || text.length > ${MAX_PARSED_TEXT_CHARS}) throw new Error('parsed text limit');
process.stdout.write(text);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;

function parseBinaryIsolated(kind: 'pdf' | 'docx', content: Buffer): Promise<string> {
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

function parseXlsxIsolated(content: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '-e', ISOLATED_XLSX_SOURCE], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure = '';
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (error) reject(error); else resolve(value ?? '');
    };
    const timer = setTimeout(() => finish(new Error('xlsx parser timeout')), PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PARSED_TEXT_CHARS * 4) finish(new Error('xlsx parser output too large'));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (failure.length < 1024) failure += chunk.toString('utf8', 0, 1024 - failure.length); });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => code === 0
      ? finish(undefined, Buffer.concat(chunks, size).toString('utf8'))
      : finish(new Error(failure || `xlsx parser exited ${code}`)));
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(content);
  });
}

export function createDefaultIngestionAdapters(): IngestionAdapters {
  return {
    pdf: (content) => parseBinaryIsolated('pdf', content),
    docx: (content) => parseBinaryIsolated('docx', content),
    image: runTesseractOcr,
    xlsx: parseXlsxIsolated,
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
  adapters: IngestionAdapters,
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
  let text: string;
  try {
    text = await adapter(content);
  } catch {
    return { status: 'needs_review', format: extension.slice(1), reason: 'parser-failed' };
  }
  const meaningfulText = text
    .replace(/-- \d+ of \d+ --/gu, '')
    .replace(/[\p{C}\p{Z}]/gu, '');
  if (!/[\p{L}\p{N}]/u.test(meaningfulText)) {
    return { status: 'needs_review', format: extension.slice(1), reason: 'empty-parsed-text' };
  }
  return { status: 'ready', text, format: extension.slice(1) };
}
