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
