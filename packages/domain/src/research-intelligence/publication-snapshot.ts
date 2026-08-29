import { createHash } from 'node:crypto';
import type { ArtifactDeps } from '../artifact/artifacts';

const PUBLICATION_SNAPSHOT_WARNING = 'claim_evidence_snapshot';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

export function canonicalPublicationValue(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function loadPublicationNarrativeSnapshot(
  deps: ArtifactDeps,
  input: { researchObjectId: string; versionId: string },
) {
  const [claims, evidence] = await Promise.all([
    deps.prisma.claimNode.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
      select: {
        id: true, parentClaimId: true, kind: true, statement: true, assessment: true,
        conditions: true, limitations: true, extractionStatus: true, provenance: true,
      },
      orderBy: { id: 'asc' },
    }),
    deps.prisma.evidenceRecord.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
      select: {
        id: true, claimId: true, artifactId: true, kind: true, title: true,
        exactQuote: true, relation: true, locator: true, contentHash: true,
        extractionConfidence: true, extractionStatus: true, verifiedByUserId: true,
        provenance: true,
      },
      orderBy: { id: 'asc' },
    }),
  ]);
  const value = { schemaVersion: 1, claims, evidence };
  return {
    ...value,
    digest: createHash('sha256').update(canonicalPublicationValue(value)).digest('hex'),
  };
}

export function publicationNarrativeText(snapshot: {
  claims: Array<{ statement: string; conditions: string[]; limitations: string[] }>;
  evidence: Array<{ title: string; exactQuote: string | null }>;
}): string {
  return [
    ...snapshot.claims.flatMap((claim) => [claim.statement, ...claim.conditions, ...claim.limitations]),
    ...snapshot.evidence.flatMap((item) => [item.title, item.exactQuote ?? '']),
  ].join('\n');
}

export function publicationSnapshotWarning(digest: string): Record<string, unknown> {
  return { code: PUBLICATION_SNAPSHOT_WARNING, schemaVersion: 1, digest };
}

export function reviewSnapshotDigest(warnings: unknown): string | undefined {
  if (!Array.isArray(warnings)) return undefined;
  const marker = warnings.find((warning) => warning && typeof warning === 'object' && !Array.isArray(warning)
    && (warning as Record<string, unknown>).code === PUBLICATION_SNAPSHOT_WARNING) as Record<string, unknown> | undefined;
  return typeof marker?.digest === 'string' && /^[a-f0-9]{64}$/.test(marker.digest) ? marker.digest : undefined;
}
