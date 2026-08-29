import { createHash } from 'node:crypto';
import type { StorageAdapter } from '@openscience/storage';
import type { DocumentSourceMap } from './document-source-map';
import { parseDocumentSourceMap, serializeDocumentSourceMap } from './document-source-map';

const SOURCE_MAP_REFERENCE_VERSION = 1 as const;
const MAX_SOURCE_MAP_BYTES = 32 * 1024 * 1024;
const SOURCE_MAP_KEY = /^derived\/source-maps\/([a-f0-9]{64})\.json$/;

export class DocumentSourceMapUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocumentSourceMapUnavailableError';
  }
}

export interface DocumentSourceMapReference {
  schemaVersion: typeof SOURCE_MAP_REFERENCE_VERSION;
  parserStatus: 'succeeded' | 'needs_review';
  artifactId: string;
  contentHash: string;
  objectKey: string;
  serializedSha256: string;
  size: number;
}

function digest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseReference(value: unknown): DocumentSourceMapReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DocumentSourceMap reference must be an object');
  const reference = value as Record<string, unknown>;
  const allowed = ['schemaVersion', 'parserStatus', 'artifactId', 'contentHash', 'objectKey', 'serializedSha256', 'size'];
  const unknown = Object.keys(reference).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`DocumentSourceMap reference has unknown field "${unknown}"`);
  if (reference.schemaVersion !== SOURCE_MAP_REFERENCE_VERSION) throw new Error('DocumentSourceMap reference schemaVersion is invalid');
  if (reference.parserStatus !== 'succeeded' && reference.parserStatus !== 'needs_review') throw new Error('DocumentSourceMap reference parserStatus is invalid');
  if (typeof reference.artifactId !== 'string' || !reference.artifactId.trim() || reference.artifactId.length > 200) {
    throw new Error('DocumentSourceMap reference artifactId is invalid');
  }
  if (typeof reference.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(reference.contentHash)) {
    throw new Error('DocumentSourceMap reference contentHash is invalid');
  }
  if (typeof reference.serializedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(reference.serializedSha256)) {
    throw new Error('DocumentSourceMap reference serialized digest is invalid');
  }
  if (typeof reference.objectKey !== 'string') throw new Error('DocumentSourceMap reference objectKey is invalid');
  const keyDigest = SOURCE_MAP_KEY.exec(reference.objectKey)?.[1];
  if (!keyDigest || keyDigest !== reference.serializedSha256.toLowerCase()) {
    throw new Error('DocumentSourceMap reference objectKey does not match its serialized digest');
  }
  if (!Number.isSafeInteger(reference.size) || (reference.size as number) < 1 || (reference.size as number) > MAX_SOURCE_MAP_BYTES) {
    throw new Error('DocumentSourceMap reference size is invalid');
  }
  return {
    schemaVersion: SOURCE_MAP_REFERENCE_VERSION,
    parserStatus: reference.parserStatus,
    artifactId: reference.artifactId,
    contentHash: reference.contentHash.toLowerCase(),
    objectKey: reference.objectKey,
    serializedSha256: reference.serializedSha256.toLowerCase(),
    size: reference.size as number,
  };
}

export async function persistDocumentSourceMapReference(
  storage: StorageAdapter,
  value: unknown,
  parserStatus: DocumentSourceMapReference['parserStatus'],
): Promise<DocumentSourceMapReference> {
  const sourceMap = parseDocumentSourceMap(value);
  const serialized = Buffer.from(serializeDocumentSourceMap(sourceMap), 'utf8');
  if (serialized.length > MAX_SOURCE_MAP_BYTES) throw new Error('DocumentSourceMap serialized size exceeds limit');
  const serializedSha256 = digest(serialized);
  const objectKey = `derived/source-maps/${serializedSha256}.json`;
  const existing = await storage.headObject(objectKey);
  if (!existing) await storage.putObject(objectKey, serialized, { contentType: 'application/json', sha256: serializedSha256 });
  else if (existing.size !== serialized.length) throw new Error('DocumentSourceMap stored size conflict');
  return {
    schemaVersion: SOURCE_MAP_REFERENCE_VERSION,
    parserStatus,
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    objectKey,
    serializedSha256,
    size: serialized.length,
  };
}

export async function loadDocumentSourceMapReference(
  storage: StorageAdapter,
  value: unknown,
): Promise<DocumentSourceMap> {
  const reference = parseReference(value);
  let object;
  try {
    object = await storage.getObject(reference.objectKey);
  } catch (error) {
    throw new DocumentSourceMapUnavailableError('DocumentSourceMap object is unavailable', { cause: error });
  }
  if (object.size !== reference.size || object.size > MAX_SOURCE_MAP_BYTES) {
    throw new Error('DocumentSourceMap stored size does not match reference');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of object.body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > reference.size || size > MAX_SOURCE_MAP_BYTES) throw new Error('DocumentSourceMap stream size exceeds reference');
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof DocumentSourceMapUnavailableError) throw error;
    if (size > reference.size || size > MAX_SOURCE_MAP_BYTES) throw error;
    throw new DocumentSourceMapUnavailableError('DocumentSourceMap stream is unavailable', { cause: error });
  }
  if (size !== reference.size) throw new Error('DocumentSourceMap stream size does not match reference');
  const serialized = Buffer.concat(chunks);
  if (digest(serialized) !== reference.serializedSha256) throw new Error('DocumentSourceMap serialized digest mismatch');
  const sourceMap = parseDocumentSourceMap(JSON.parse(serialized.toString('utf8')) as unknown);
  if (sourceMap.artifactId !== reference.artifactId || sourceMap.contentHash !== reference.contentHash) {
    throw new Error('DocumentSourceMap source identity does not match reference');
  }
  return sourceMap;
}

export function parseDocumentSourceMapReference(value: unknown): DocumentSourceMapReference {
  return parseReference(value);
}
