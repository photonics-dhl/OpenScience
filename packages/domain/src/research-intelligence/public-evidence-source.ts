import { getBlobStorageKey } from '@openscience/storage';
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
): Promise<void> {
  let head;
  try {
    head = await deps.storage.headObject(key);
  } catch (error) {
    throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable', { cause: error });
  }
  if (!head) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'published source is temporarily unavailable');
  if (head.size !== expectedSize) throw new PublicEvidenceSourceError('NOT_FOUND', 'published source integrity check failed');
}

export async function getPublicEvidenceSource(
  deps: ArtifactDeps,
  input: { publicId: string; versionNo: number; evidenceId: string },
): Promise<{
  text: string;
  page: number | null;
  locator: Record<string, unknown>;
  artifact: { logicalPath: string; mediaType: string };
}> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { publicId: input.publicId } });
  if (!ro || ro.visibility !== 'public') throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  const version = await deps.prisma.version.findFirst({
    where: {
      researchObjectId: ro.id,
      versionNo: input.versionNo,
      status: 'published',
      publications: { some: {} },
    },
    select: { id: true },
  });
  if (!version) throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');
  const evidence = await deps.prisma.evidenceRecord.findFirst({
    where: {
      id: input.evidenceId,
      researchObjectId: ro.id,
      versionId: version.id,
      extractionStatus: 'succeeded',
      verifiedByUserId: { not: null },
    },
    include: { artifact: true },
  });
  if (!evidence) throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found');

  const provenance = record(evidence.provenance);
  let sourceMapRef;
  try {
    sourceMapRef = parseDocumentSourceMapReference(provenance.sourceMapRef);
  } catch (error) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'published Evidence source not found', { cause: error });
  }
  await requireStoredObject(deps, getBlobStorageKey(evidence.artifact.blobSha256), Number(evidence.artifact.size));
  await requireStoredObject(deps, sourceMapRef.objectKey, sourceMapRef.size);

  try {
    const resolved = await resolveEvidenceSource(deps, {
      researchObjectId: ro.id,
      versionId: version.id,
      artifactId: evidence.artifactId,
      locator: evidence.locator as never,
      exactQuote: evidence.exactQuote ?? undefined,
      sourceMapRef,
    });
    return {
      text: (resolved.text ?? '').slice(0, MAX_PUBLIC_SOURCE_TEXT),
      page: validateSourceLocator(evidence.locator).page ?? null,
      locator: publicLocator(evidence.locator),
      artifact: {
        logicalPath: evidence.artifact.logicalPath,
        mediaType: evidence.artifact.mimeType ?? 'application/octet-stream',
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
