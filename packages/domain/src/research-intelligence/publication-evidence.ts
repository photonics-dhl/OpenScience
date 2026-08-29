import { getBlobStorageKey } from '@openscience/storage';
import type { ArtifactDeps } from '../artifact/artifacts';
import type { HardBlock } from '../review/blocking';
import type { SourceLocator } from './types';
import { resolveEvidenceSource } from './claim-evidence-service';

type Resolver = typeof resolveEvidenceSource;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pushOnce(blocks: HardBlock[], code: string, reason: string): void {
  if (!blocks.some((block) => block.code === code)) blocks.push({ code, reason });
}

function overwroteWithoutDiff(provenance: unknown): boolean {
  const value = record(provenance);
  return value.source !== 'human' && value.overwroteAuthorConfirmed === true
    && (typeof value.reviewableDiffId !== 'string' || !value.reviewableDiffId.trim());
}

function allowsExternalReuse(provenance: unknown): boolean {
  const rights = record(record(provenance).rights);
  // Browser-provided author attestations are retained for Task 10, but are not
  // distribution authority. Only a server-owned rights decision may unlock reuse.
  return rights.decision === 'reuse' && rights.authority === 'trusted_provider'
    && typeof rights.verifiedBy === 'string' && rights.verifiedBy.length > 0;
}

/**
 * Claim/Evidence publication safety evaluator. Evidence absence is intentionally
 * not a hard block; missing support remains visible through Claim.assessment.
 */
export async function evaluateEvidencePublicationBlocks(
  deps: ArtifactDeps,
  input: { researchObjectId: string; versionId: string },
  resolver: Resolver = resolveEvidenceSource,
): Promise<HardBlock[]> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: { include: { entries: true } } },
  });
  if (!version || version.researchObjectId !== input.researchObjectId) {
    return [{ code: 'evidence_original_missing', reason: 'Evidence version or original manifest is missing' }];
  }
  const [claims, evidence] = await Promise.all([
    deps.prisma.claimNode.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
      select: { id: true, assessment: true, provenance: true, extractionStatus: true },
      take: 501,
    }),
    deps.prisma.evidenceRecord.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
      take: 201,
    }),
  ]);
  const reviewedHashes = [...new Set(evidence.slice(0, 200).map((item) => item.contentHash))];
  const presentation = reviewedHashes.length === 0 ? [] : await deps.prisma.presentationAsset.findMany({
    where: { researchObjectId: input.researchObjectId, contentHash: { in: reviewedHashes } },
    select: { contentHash: true },
  });
  const blocks: HardBlock[] = [];
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const entries = new Map((version.manifest?.entries ?? []).map((entry) => [entry.artifactId, entry]));
  const presentationHashes = new Set(presentation.map((asset) => asset.contentHash));

  if (claims.length > 500) pushOnce(blocks, 'claim_review_limit_exceeded', 'Claim count exceeds the bounded publication review limit');
  if (evidence.length > 200) pushOnce(blocks, 'evidence_review_limit_exceeded', 'Evidence count exceeds the bounded publication review limit');

  const verifiedSupport = new Set(evidence
    .filter((item) => (item.relation === 'supports' || item.relation === 'qualifies')
      && item.extractionStatus === 'succeeded' && Boolean(item.verifiedByUserId))
    .map((item) => item.claimId));

  for (const claim of claims.slice(0, 500)) {
    if (claim.assessment === 'supported' && !verifiedSupport.has(claim.id)) {
      pushOnce(blocks, 'supported_claim_without_evidence', 'A supported Claim must have verified, locatable supporting Evidence; otherwise mark it missing');
    }
    if (overwroteWithoutDiff(claim.provenance)) {
      pushOnce(blocks, 'automatic_overwrite_without_diff', 'Automatic extraction overwrote author-confirmed Claim content without a reviewable diff');
    }
  }

  for (const item of evidence.slice(0, 200)) {
    const claim = claimsById.get(item.claimId);
    if (item.relation === 'contradicts' && claim?.assessment === 'supported') {
      pushOnce(blocks, 'known_conflict_hidden', 'Contradicting Evidence is hidden behind a supported Claim assessment');
    }
    if (presentationHashes.has(item.contentHash)) {
      pushOnce(blocks, 'presentation_used_as_evidence', 'Presentation media cannot be used as scientific Evidence');
    }
    if (item.kind === 'external_source' && !allowsExternalReuse(item.provenance)) {
      pushOnce(blocks, 'external_distribution_unauthorized', 'Stored external-source content lacks an affirmative reuse rights decision');
    }
    if (item.extractionStatus !== 'succeeded' || !item.verifiedByUserId) {
      pushOnce(blocks, 'evidence_unverified', 'Evidence must be locator-resolved and explicitly verified before publication');
    }
    if (overwroteWithoutDiff(item.provenance)) {
      pushOnce(blocks, 'automatic_overwrite_without_diff', 'Automatic extraction overwrote author-confirmed Evidence without a reviewable diff');
    }

    const entry = entries.get(item.artifactId);
    const artifact = await deps.prisma.artifact.findUnique({ where: { id: item.artifactId } });
    const originalValid = Boolean(entry && artifact
      && artifact.workspaceId === version.researchObject.workspaceId
      && entry.blobSha256 === artifact.blobSha256
      && item.contentHash === artifact.blobSha256
      && record(item.locator).contentHash === artifact.blobSha256
      && record(item.locator).artifactId === artifact.id);
    if (!originalValid || !artifact) {
      pushOnce(blocks, 'evidence_original_missing', 'Evidence contentHash or original VersionManifest artifact is missing');
      continue;
    }
    const stored = await deps.storage.headObject(getBlobStorageKey(artifact.blobSha256)).catch(() => null);
    if (!stored || stored.size !== Number(artifact.size) || stored.sha256?.toLowerCase() !== artifact.blobSha256.toLowerCase()) {
      pushOnce(blocks, 'evidence_original_missing', 'Evidence original object is unavailable from object storage');
      continue;
    }
    try {
      await resolver(deps, {
        researchObjectId: input.researchObjectId,
        versionId: input.versionId,
        artifactId: item.artifactId,
        locator: item.locator as unknown as SourceLocator,
        exactQuote: item.exactQuote ?? undefined,
        sourceMapRef: record(item.provenance).sourceMapRef,
      });
    } catch {
      pushOnce(blocks, 'evidence_locator_mismatch', 'Evidence locator no longer resolves against the immutable original');
    }
  }
  return blocks;
}
