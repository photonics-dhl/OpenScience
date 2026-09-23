import { getBlobStorageKey } from '@openscience/storage';
import { canReadCurrentPublicResearch } from '../visibility/current-public-access';
import type { ArtifactDeps } from '../artifact/artifacts';
import { ClaimEvidenceError } from './claim-evidence-errors';
import { resolveEvidenceSource } from './claim-evidence-service';
import { DocumentSourceMapUnavailableError, parseDocumentSourceMapReference } from './source-map-ref';
import { validateSourceLocator } from './validation';

export type PublicEvidenceSourceErrorCode = 'NOT_FOUND' | 'SOURCE_UNAVAILABLE';

export class PublicEvidenceSourceError extends Error {
  constructor(public readonly code: PublicEvidenceSourceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PublicEvidenceSourceError';
  }
}

const MAX_PUBLIC_SOURCE_TEXT = 20_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicLocator(value: unknown): Record<string, unknown> {
  const locator = validateSourceLocator(value);
  return {
    ...(locator.blockId === undefined ? {} : { blockId: locator.blockId }),
    ...(locator.page === undefined ? {} : { page: locator.page }),
    ...(locator.boundingBox === undefined ? {} : { boundingBox: locator.boundingBox }),
    ...(locator.charRange === undefined ? {} : { charRange: locator.charRange }),
    ...(locator.tableCell === undefined ? {} : { tableCell: locator.tableCell }),
    ...(locator.codeRange === undefined ? {} : { codeRange: locator.codeRange }),
  };
}

async function requireStoredObject(
  deps: ArtifactDeps,
  key: string,
  expectedSize: number,
  expectedHash?: string,
): Promise<void> {
  let head;
  try {
    head = await deps.storage.headObject(key);
  } catch (error) {
    throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable', { cause: error });
  }
  if (!head) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable');
  if (head.size !== expectedSize) throw new PublicEvidenceSourceError('NOT_FOUND', 'published source integrity check failed');
  if (expectedHash && head.sha256 && head.sha256.toLowerCase() !== expectedHash.toLowerCase()) throw new PublicEvidenceSourceError('NOT_FOUND', 'published source integrity check failed');
}

export async function getPublicEvidenceSource(
  deps: ArtifactDeps,
  input: { publicId: string; versionNo: number; evidenceId: string },
): Promise<{
  text: string;
  page: number | null;
  region: { x: number; y: number; width: number; height: number } | null;
  locator: Record<string, unknown>;
  artifact: { logicalPath: string; mediaType: string };
}> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { publicId: input.publicId } });
  if (!ro || ro.visibility !== 'public') throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  const version = await deps.prisma.version.findFirst({
    where: {
      researchObjectId: ro.id,
      publicationNo: input.versionNo,
      status: { in: ['published', 'revised'] },
      publications: { some: {} },
    },
    select: { id: true, researchRecord: true },
  });
  if (!version) throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  if (!await canReadCurrentPublicResearch(deps, {
    researchObjectId: ro.id, versionId: version.id, exposure: 'source',
  })) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  }
  const frozen = record(version.researchRecord);
  const dto = record(frozen.dto);
  const evidence = (Array.isArray(dto.evidence) ? dto.evidence.map(record) : []).find(item => item.id === input.evidenceId);
  const source = record(record(frozen.sources)[input.evidenceId]);
  if (!evidence || evidence.extractionStatus !== 'succeeded' || evidence.verified !== true
    || typeof evidence.artifactId !== 'string' || typeof evidence.contentHash !== 'string'
    || source.artifactId !== evidence.artifactId || source.publicReuse !== true) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  }
  const manifest = (Array.isArray(dto.manifest) ? dto.manifest.map(record) : []).find(entry => entry.artifactId === evidence.artifactId && entry.blobSha256 === evidence.contentHash);
  if (!manifest) throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  const frozenArtifact = record(evidence.artifact ?? source.artifact);
  // This live row only locates the retained content-addressed file. It supplies no public scientific/display metadata.
  const artifact = await deps.prisma.artifact.findUnique({ where: { id: evidence.artifactId }, select: { workspaceId: true, blobSha256: true, size: true, bytesPurgedAt: true } });
  if (!artifact || artifact.workspaceId !== ro.workspaceId || artifact.blobSha256 !== evidence.contentHash || artifact.bytesPurgedAt) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  }
  let sourceMapRef;
  let locator;
  try {
    sourceMapRef = parseDocumentSourceMapReference(source.sourceMapRef);
    locator = validateSourceLocator(source.locator);
    if (sourceMapRef.artifactId !== evidence.artifactId || sourceMapRef.contentHash !== evidence.contentHash
      || locator.artifactId !== evidence.artifactId || locator.contentHash !== evidence.contentHash) {
      throw new Error('Frozen source identity mismatch');
    }
  } catch (error) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found', { cause: error });
  }
  await requireStoredObject(deps, getBlobStorageKey(evidence.contentHash), Number(artifact.size), evidence.contentHash);
  await requireStoredObject(deps, sourceMapRef.objectKey, sourceMapRef.size);

  try {
    const resolved = await resolveEvidenceSource(deps, {
      researchObjectId: ro.id,
      versionId: version.id,
      artifactId: evidence.artifactId,
      locator,
      exactQuote: typeof source.exactQuote === 'string' ? source.exactQuote : undefined,
      sourceMapRef,
    });
    return {
      text: (resolved.text ?? '').slice(0, MAX_PUBLIC_SOURCE_TEXT),
      page: locator.page ?? null,
      region: resolved.region ?? null,
      locator: publicLocator(locator),
      artifact: {
        logicalPath: typeof frozenArtifact.logicalPath === 'string' ? frozenArtifact.logicalPath : typeof manifest.logicalPath === 'string' ? manifest.logicalPath : '',
        mediaType: typeof frozenArtifact.mediaType === 'string' ? frozenArtifact.mediaType : typeof frozenArtifact.mimeType === 'string' ? frozenArtifact.mimeType : 'application/octet-stream',
      },
    };
  } catch (error) {
    if (error instanceof PublicEvidenceSourceError) throw error;
    if (error instanceof ClaimEvidenceError) {
      if (error.cause instanceof DocumentSourceMapUnavailableError) {
        throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable', { cause: error });
      }
      throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found', { cause: error });
    }
    throw error;
  }
}
