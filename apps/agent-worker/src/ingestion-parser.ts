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

async function tesseractOcr(content: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.TESSERACT_BIN ?? 'tesseract', ['stdin', 'stdout', '-l', process.env.TESSERACT_LANGS ?? 'eng+chi_sim'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('OCR timeout')); }, 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { child.kill('SIGKILL'); reject(new Error('OCR output too large')); return; }
      chunks.push(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolve(Buffer.concat(chunks).toString('utf8')); else reject(new Error(`OCR exited ${code}`)); });
    child.stdin.end(content);
  });
}

export function createDefaultIngestionAdapters(): IngestionAdapters {
  return {
    pdf: (content) => parseBinaryIsolated('pdf', content),
    docx: (content) => parseBinaryIsolated('docx', content),
    image: tesseractOcr,
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
