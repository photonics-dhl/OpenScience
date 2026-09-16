import { recordValue } from '../commit/research-record-snapshot';

export interface PublicationMetadata {
  schemaVersion: 1;
  captureSource: 'publication' | 'legacy_captured_at_migration' | 'administrative_correction' | 'not_recorded';
  capturedAt: string | null;
  fieldSources?: Record<string, string>;
  title: string | null;
  authors: Array<{ displayName: string; identityStatus: string | null; isCorresponding: boolean; affiliation: string | null; sortOrder: number }>;
  contributions: Array<{ displayName: string; creditRole: string }>;
  licenses: Record<string, string>;
  citation: { publicId: string | null; publicVersionId: string | null; publicationNo: number | null; year: number | null; publishedAt: string | null; text: string | null };
}

/** Read the existing version record only. Missing history must never fall back to the live draft. */
export function readPublicationMetadata(researchRecord: unknown): PublicationMetadata {
  const metadata = recordValue(recordValue(researchRecord).publicationMetadata);
  if (metadata.schemaVersion === 1) return metadata as unknown as PublicationMetadata;
  return {
    schemaVersion: 1, captureSource: 'not_recorded', capturedAt: null, title: null,
    authors: [], contributions: [], licenses: {},
    citation: { publicId: null, publicVersionId: null, publicationNo: null, year: null, publishedAt: null, text: null },
  };
}

/** Legacy fallback reads an already issued identifier, never the internal versionNo. */
export function publicVersionNumber(version: { publicationNo: number | null; publicVersionId: string | null }): number | null {
  if (version.publicationNo !== null) return version.publicationNo;
  const suffix = version.publicVersionId?.match(/-v([1-9]\d*)$/)?.[1];
  const number = suffix ? Number(suffix) : NaN;
  return Number.isSafeInteger(number) ? number : null;
}
