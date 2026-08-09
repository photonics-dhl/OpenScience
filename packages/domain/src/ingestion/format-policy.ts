import { extname } from 'node:path';
import { IngestionError } from './errors';

export const INGESTION_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.tex', '.zip', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.webp', '.svg',
]);

const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  '.pdf': new Set(['application/pdf']),
  '.doc': new Set(['application/msword']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  '.tex': new Set(['application/x-tex', 'text/plain']),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed']),
  '.md': new Set(['text/markdown', 'text/plain']),
  '.markdown': new Set(['text/markdown', 'text/plain']),
  '.png': new Set(['image/png']),
  '.jpg': new Set(['image/jpeg']),
  '.jpeg': new Set(['image/jpeg']),
  '.webp': new Set(['image/webp']),
  '.svg': new Set(['image/svg+xml', 'text/xml', 'application/xml']),
};

export function assertSupportedIngestionFile(filename: string, mimeType?: string): void {
  const extension = extname(filename).toLowerCase();
  if (!INGESTION_EXTENSIONS.has(extension)) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', `Unsupported ingestion format: ${extension || 'none'}`);
  }
  const normalizedMime = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (normalizedMime && normalizedMime !== 'application/octet-stream' && !MIME_BY_EXTENSION[extension]?.has(normalizedMime)) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', `MIME type ${normalizedMime} does not match ${extension}`);
  }
}

export function assertIngestionContent(filename: string, content: Buffer): void {
  const extension = extname(filename).toLowerCase();
  if (content.subarray(0, 2).toString('ascii') === 'MZ') {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'Executable content is not accepted');
  }
  if (extension === '.pdf' && !content.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'PDF signature does not match filename');
  }
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension) && !matchesImageSignature(extension, content)) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'Image signature does not match filename');
  }
  if (['.doc', '.docx', '.zip'].includes(extension) && !isZipOrCompoundDocument(content, extension)) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'Document container signature does not match filename');
  }
  if (['.md', '.markdown', '.tex', '.svg'].includes(extension)) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); }
    catch { throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'Text content is not valid UTF-8'); }
    if (text.includes('\u0000') || /<script\b|on[a-z]+\s*=|<!DOCTYPE|\b(?:href|src)\s*=\s*["'](?:https?:|data:)/i.test(text)) {
      throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', 'Active or unsafe text content is not accepted');
    }
  }
}

function matchesImageSignature(extension: string, content: Buffer): boolean {
  if (extension === '.png') return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return content.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  return content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
}

function isZipOrCompoundDocument(content: Buffer, extension: string): boolean {
  if (extension === '.doc') return content.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}
