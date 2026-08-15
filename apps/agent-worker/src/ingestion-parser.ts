import { extname } from 'node:path';
import { spawn } from 'node:child_process';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export type ParsedIngestion =
  | { status: 'ready'; text: string; format: string }
  | { status: 'needs_review'; format: string; reason: string };

export interface IngestionAdapters {
  pdf?: (content: Buffer) => Promise<string>;
  docx?: (content: Buffer) => Promise<string>;
  image?: (content: Buffer) => Promise<string>;
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
    pdf: async (content) => {
      const parser = new PDFParse({ data: content });
      try {
        return (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    },
    docx: async (content) => (await mammoth.extractRawText({ buffer: content })).value,
    image: tesseractOcr,
  };
}

const MAX_PARSER_INPUT = 20 * 1024 * 1024;

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
    text = (await adapter(content)).trim();
  } catch {
    return { status: 'needs_review', format: extension.slice(1), reason: 'parser-failed' };
  }
  if (!text) return { status: 'needs_review', format: extension.slice(1), reason: 'empty-parsed-text' };
  return { status: 'ready', text, format: extension.slice(1) };
}
