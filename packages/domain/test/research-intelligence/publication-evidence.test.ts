import { describe, expect, it, vi } from 'vitest';
import { evaluateEvidencePublicationBlocks } from '../../src/research-intelligence/publication-evidence';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function deps(overrides: { evidence?: Array<Record<string, unknown>>; claims?: Array<Record<string, unknown>> } = {}) {
  const claims = overrides.claims ?? [{ id: 'claim-1', assessment: 'supported', provenance: { source: 'human' }, extractionStatus: 'succeeded' }];
  const evidence = overrides.evidence ?? [];
  return {
    storage: { headObject: vi.fn(async () => ({ size: 100, etag: 'fixture', sha256: HASH })) },
    prisma: {
      version: { findUnique: vi.fn().mockResolvedValue({
        id: 'version-1', researchObjectId: 'ro-1', researchObject: { workspaceId: 'workspace-1' },
        manifest: { entries: [{ artifactId: 'artifact-1', blobSha256: HASH }] },
      }) },
      claimNode: { findMany: vi.fn().mockResolvedValue(claims) },
      evidenceRecord: { findMany: vi.fn().mockResolvedValue(evidence) },
      presentationAsset: { findMany: vi.fn().mockResolvedValue([{ contentHash: OTHER_HASH }]) },
      artifact: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === 'artifact-1'
        ? { id: 'artifact-1', workspaceId: 'workspace-1', blobSha256: HASH, size: 100n } : null) },
    },
  } as never;
}

function row(patch: Record<string, unknown> = {}) {
  return {
    id: 'evidence-1', claimId: 'claim-1', artifactId: 'artifact-1', contentHash: HASH,
    kind: 'passage', relation: 'supports', extractionStatus: 'succeeded', verifiedByUserId: 'user-1',
    locator: { artifactId: 'artifact-1', contentHash: HASH, page: 1 },
    exactQuote: undefined, provenance: { source: 'human' },
    ...patch,
  };
}

describe('Evidence publication blockers', () => {
  it('allows absent Evidence only when the Claim discloses it as missing', async () => {
    const blocks = await evaluateEvidencePublicationBlocks(deps({
      claims: [{ id: 'claim-1', assessment: 'missing', provenance: { source: 'human' }, extractionStatus: 'succeeded' }],
    }), { researchObjectId: 'ro-1', versionId: 'version-1' }, vi.fn());
    expect(blocks).toEqual([]);
  });

  it('blocks a supported Claim with no verified supporting Evidence', async () => {
    const blocks = await evaluateEvidencePublicationBlocks(deps(), { researchObjectId: 'ro-1', versionId: 'version-1' }, vi.fn());
    expect(blocks).toContainEqual(expect.objectContaining({ code: 'supported_claim_without_evidence' }));
  });

  it('queries presentation reuse by every reviewed Evidence hash instead of a truncatable asset prefix', async () => {
    const context = deps({ evidence: [row()] }) as never as {
      prisma: { presentationAsset: { findMany: ReturnType<typeof vi.fn> } };
    };
    await evaluateEvidencePublicationBlocks(context as never, {
      researchObjectId: 'ro-1', versionId: 'version-1',
    }, vi.fn());
    expect(context.prisma.presentationAsset.findMany).toHaveBeenCalledWith({
      where: { researchObjectId: 'ro-1', contentHash: { in: [HASH] } },
      select: { contentHash: true },
    });
  });

  it('does not treat a browser reuse attestation as trusted distribution authority', async () => {
    const blocks = await evaluateEvidencePublicationBlocks(deps({
      evidence: [row({ kind: 'external_source', provenance: { source: 'human', rights: { decision: 'reuse' } } })],
    }), { researchObjectId: 'ro-1', versionId: 'version-1' }, vi.fn());
    expect(blocks).toContainEqual(expect.objectContaining({ code: 'external_distribution_unauthorized' }));
  });

  it('reports hidden conflict, presentation reuse, missing original, rights and locator failures', async () => {
    const evidence = [
      row({ id: 'hidden', relation: 'contradicts' }),
      row({ id: 'presentation', contentHash: OTHER_HASH, locator: { artifactId: 'artifact-1', contentHash: OTHER_HASH, page: 1 } }),
      row({ id: 'missing', artifactId: 'artifact-missing' }),
      row({ id: 'rights', kind: 'external_source', provenance: { source: 'human', rights: { decision: 'link_only' } } }),
      row({ id: 'locator' }),
      row({ id: 'unverified', extractionStatus: 'needs_review', verifiedByUserId: null }),
    ];
    const verify = vi.fn(async (_deps, input: { artifactId: string; locator: { page?: number } }) => {
      if (input.locator.page === 1 && input.artifactId === 'artifact-1') throw new Error('locator mismatch');
    });
    const blocks = await evaluateEvidencePublicationBlocks(deps({ evidence }), { researchObjectId: 'ro-1', versionId: 'version-1' }, verify);
    const codes = new Set(blocks.map((block) => block.code));

    expect(codes).toEqual(new Set([
      'known_conflict_hidden',
      'presentation_used_as_evidence',
      'evidence_original_missing',
      'external_distribution_unauthorized',
      'evidence_locator_mismatch',
      'evidence_unverified',
    ]));
  });

  it('blocks an automatic overwrite of author-confirmed content without a reviewable diff', async () => {
    const blocks = await evaluateEvidencePublicationBlocks(deps({
      claims: [{
        id: 'claim-1', assessment: 'supported', extractionStatus: 'succeeded',
        provenance: { source: 'deterministic', overwroteAuthorConfirmed: true },
      }],
    }), { researchObjectId: 'ro-1', versionId: 'version-1' }, vi.fn());
    expect(blocks).toContainEqual(expect.objectContaining({ code: 'automatic_overwrite_without_diff' }));
  });
});
