import { extname } from 'node:path';
import { IngestionError } from './errors';

export const INGESTION_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.tex', '.zip', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.webp', '.svg',
]);

export function assertSupportedIngestionFile(filename: string): void {
  const extension = extname(filename).toLowerCase();
  if (!INGESTION_EXTENSIONS.has(extension)) {
    throw new IngestionError('UNSUPPORTED_INGESTION_FORMAT', `Unsupported ingestion format: ${extension || 'none'}`);
  }
}
