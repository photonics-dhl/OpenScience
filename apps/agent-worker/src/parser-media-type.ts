import { basename, extname } from 'node:path';

interface ParserMediaTypeDefinition {
  canonical: string;
  allowedStoredMimeTypes: ReadonlySet<string>;
}

const OCTET_STREAM = 'application/octet-stream';

function definition(canonical: string, ...allowedStoredMimeTypes: string[]): ParserMediaTypeDefinition {
  return { canonical, allowedStoredMimeTypes: new Set(allowedStoredMimeTypes) };
}

const PARSER_MEDIA_TYPES: Readonly<Record<string, ParserMediaTypeDefinition>> = Object.freeze({
  md: definition('text/markdown', 'text/markdown', 'text/x-markdown', 'application/markdown', 'text/plain'),
  markdown: definition('text/markdown', 'text/markdown', 'text/x-markdown', 'application/markdown', 'text/plain'),
  tex: definition('text/x-tex', 'text/x-tex', 'application/x-tex', 'text/plain'),
  csv: definition('text/csv', 'text/csv', 'text/plain', 'application/vnd.ms-excel'),
  xlsx: definition('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  pdf: definition('application/pdf', 'application/pdf'),
  docx: definition('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  png: definition('image/png', 'image/png'),
  jpg: definition('image/jpeg', 'image/jpeg'),
  jpeg: definition('image/jpeg', 'image/jpeg'),
  webp: definition('image/webp', 'image/webp'),
  tif: definition('image/tiff', 'image/tiff'),
  tiff: definition('image/tiff', 'image/tiff'),
  py: definition('text/x-python', 'text/x-python', 'application/x-python', 'text/plain'),
  ipynb: definition('application/x-ipynb+json', 'application/x-ipynb+json', 'application/json'),
});

function normalizedStoredMimeType(storedMimeType: string | null | undefined): string | undefined {
  const normalized = storedMimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

/**
 * Chooses a parser media type only when the artifact extension and stored MIME
 * identity agree. Generic or absent stored MIME types defer to the extension.
 */
export function canonicalParserMediaType(logicalPath: string, storedMimeType?: string | null): string {
  const extension = extname(basename(logicalPath)).slice(1).toLowerCase();
  const definitionForExtension = PARSER_MEDIA_TYPES[extension];
  if (!definitionForExtension) return OCTET_STREAM;

  const normalizedStoredMime = normalizedStoredMimeType(storedMimeType);
  if (!normalizedStoredMime || normalizedStoredMime === OCTET_STREAM) {
    return definitionForExtension.canonical;
  }
  return definitionForExtension.allowedStoredMimeTypes.has(normalizedStoredMime)
    ? definitionForExtension.canonical
    : OCTET_STREAM;
}
