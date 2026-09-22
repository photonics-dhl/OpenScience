import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertJournalReviewCapability,
  evaluateArticleProcessingCapability,
  type JournalArticleSourceRecord,
  type JournalRightsStatus,
  type JournalSourcePermissions,
} from '../src/journal/enhancements';
import { canReadCurrentPublicResearch } from '../src/visibility/current-public-access';
import { canAccessRo } from '../src/visibility/access';
import { getPublicArtifactDownload } from '../src/artifact/public-artifact-download';
import { getResearchRecord } from '../src/commit/research-record';

const text = 'A synthetic full-text source with enough characters to exercise generation and publication capability checks safely.';
const contentSha256 = createHash('sha256').update(text, 'utf8').digest('hex');
const permissions = (overrides: Partial<JournalSourcePermissions> = {}): JournalSourcePermissions => ({
  internalProcessing: true,
  derivativeGeneration: true,
  publicSource: false,
  publicDerivative: true,
  externalProcessing: true,
  figureReuse: false,
  derivativeIllustration: false,
  ...overrides,
});

function material(
  rightsStatus: JournalRightsStatus,
  overrides: Partial<JournalArticleSourceRecord> = {},
): JournalArticleSourceRecord {
  return {
    id: 'source-a',
    sourceType: 'editor_uploaded_pdf',
    title: 'Synthetic licensed source',
    fileId: 'artifact-a',
    rightsStatus,
    sourceConfidence: 'verified',
    permissions: permissions(),
    evidence: { statement: 'Synthetic test authorization.', license: 'CC-BY-4.0' },
    activeForGeneration: true,
    contentSha256,
    ...overrides,
  };
}

function article(active: JournalArticleSourceRecord, extras: JournalArticleSourceRecord[] = []) {
  return {
    id: 'article-a',
    contentState: 'active',
    source: {
      kind: 'fulltext' as const,
      text,
      url: 'https://journal.example.invalid/article-a',
      label: 'Synthetic current source',
      artifactId: 'artifact-a',
      materials: [active, ...extras],
    },
    rights: {
      internalProcessing: true,
      derivativeGeneration: true,
      publicSource: false,
      publicDerivative: true,
      externalProcessing: true,
      license: 'CC-BY-4.0',
      evidence: 'Synthetic test authorization.',
    },
  };
}

describe('journal enhancement security boundaries', () => {
  it('keeps an ordinary public Research Object readable when it has no journal article', async () => {
    const prisma = { journalArticle: { findUnique: async () => null } };

    await expect(canReadCurrentPublicResearch({ prisma } as never, {
      researchObjectId: 'personal-ro', versionId: 'personal-v1',
    })).resolves.toBe(true);
  });

  it('stops a fixed journal release after its bound source authorization expires', async () => {
    const expired = material('full_public_processing_allowed', {
      evidence: {
        statement: 'Synthetic test authorization.', license: 'CC-BY-4.0',
        expiresAt: '2026-09-21T00:00:00.000Z',
      },
    });
    const prisma = {
      journalArticle: {
        findUnique: async () => ({
          ...article(expired),
          releases: [{ versionId: 'journal-v1', snapshot: { draft: { scope: 'fulltext' } } }],
        }),
      },
    };

    await expect(canReadCurrentPublicResearch({
      prisma, now: () => new Date('2026-09-22T00:00:00.000Z'),
    } as never, {
      researchObjectId: 'journal-ro', versionId: 'journal-v1',
    })).resolves.toBe(false);
  });

  it('denies public outsiders after expiry while preserving access for a journal workspace member', async () => {
    const expiredArticle = {
      ...article(material('full_public_processing_allowed', {
        sourceConfidence: 'expired',
      })),
      releases: [{ versionId: 'journal-v1', snapshot: { draft: { scope: 'fulltext' } } }],
    };
    const prisma = {
      researchObject: {
        findUnique: async () => ({ id: 'journal-ro', workspaceId: 'journal-ws', visibility: 'public' }),
      },
      journalArticle: { findUnique: async () => expiredArticle },
      membership: {
        findUnique: async ({ where }: { where: { workspaceId_userId: { userId: string } } }) =>
          where.workspaceId_userId.userId === 'journal-member' ? { role: 'maintainer' } : null,
      },
      visibilityGrant: { findUnique: async () => null },
    };

    await expect(canAccessRo({ prisma } as never, { researchObjectId: 'journal-ro' })).resolves.toBe('denied');
    await expect(canAccessRo({ prisma } as never, {
      researchObjectId: 'journal-ro', userId: 'public-outsider',
    })).resolves.toBe('denied');
    await expect(canAccessRo({ prisma } as never, {
      researchObjectId: 'journal-ro', userId: 'journal-member',
    })).resolves.toBe('granted');
  });

  it('fails closed when the Prisma client does not expose the required journal delegate', async () => {
    await expect(canReadCurrentPublicResearch({ prisma: {} } as never, {
      researchObjectId: 'unknown-ro',
    })).rejects.toThrow();
  });

  it('closes frozen record and attachment consumers after journal authorization expires', async () => {
    const expiredArticle = {
      ...article(material('full_public_processing_allowed', { sourceConfidence: 'expired' })),
      releases: [{ versionId: 'journal-v1', snapshot: { draft: { scope: 'fulltext' } } }],
    };
    const researchObject = {
      id: 'journal-ro', workspaceId: 'journal-ws', publicId: 'OSR-2026-000001',
      visibility: 'public', deletedAt: null,
    };
    const version = {
      id: 'journal-v1', researchObjectId: 'journal-ro', versionNo: 1, publicationNo: 1,
      publicVersionId: 'OSR-2026-000001-v1', status: 'published', researchRecord: {},
      createdAt: new Date('2026-09-20T00:00:00.000Z'), manifest: { entries: [] },
    };
    const prisma = {
      researchObject: { findUnique: async () => researchObject },
      version: { findFirst: async () => version, findUnique: async () => version },
      publication: { findFirst: async () => ({ id: 'publication-1', versionId: version.id }) },
      membership: { findUnique: async () => null },
      visibilityGrant: { findUnique: async () => null },
      journalArticle: { findUnique: async () => expiredArticle },
    };

    await expect(getResearchRecord({ prisma } as never, {
      researchObjectId: researchObject.id, versionId: version.id,
    })).rejects.toThrow();
    await expect(getPublicArtifactDownload({ prisma } as never, {
      publicId: researchObject.publicId, versionNo: 1,
      artifactId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toThrow();
  });

  it('does not expose journal evidence source bytes under derivative-only publication rights', async () => {
    const derivativeOnly = material('full_public_processing_allowed', {
      permissions: permissions({ publicSource: false }),
    });
    const prisma = {
      journalArticle: {
        findUnique: async () => ({
          ...article(derivativeOnly),
          releases: [{ versionId: 'journal-v1', snapshot: { draft: { scope: 'fulltext' } } }],
        }),
      },
    };

    await expect(canReadCurrentPublicResearch({ prisma } as never, {
      researchObjectId: 'journal-ro', versionId: 'journal-v1', exposure: 'source',
    })).resolves.toBe(false);
  });

  it('does not let rights for a different uploaded artifact authorize the current source text', () => {
    const capability = evaluateArticleProcessingCapability(article(material('full_public_processing_allowed', {
      fileId: 'artifact-b',
    })));

    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canPublishFullInterpretation).toBe(false);
    expect(capability.blockingReasons.length).toBeGreaterThan(0);
  });

  it('intersects permission booleans with the rights-status cap', () => {
    const capability = evaluateArticleProcessingCapability(article(material('derivative_illustration_allowed', {
      permissions: permissions({ derivativeIllustration: true }),
    })));

    expect(capability.canGenerateAbstractSummary).toBe(false);
    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canPublishPublicSummary).toBe(false);
    expect(capability.canPublishFullInterpretation).toBe(false);
    expect(capability.canGenerateDerivativeIllustration).toBe(false);
  });

  it('separates text-grounded figure explanation from reuse of an original figure asset', () => {
    const capability = evaluateArticleProcessingCapability(article(material('full_public_processing_allowed')));

    expect(capability.canGenerateFigureExplanation).toBe(true);
    expect(capability.canPublishFigures).toBe(false);
  });

  it('does not consume uncapped auxiliary permissions from malformed or legacy matrix data', () => {
    const figure = material('unknown', {
      id: 'figure-a',
      sourceType: 'figure_asset',
      activeForGeneration: false,
      permissions: permissions({ figureReuse: true }),
    });
    const supplement = material('metadata_only_allowed', {
      id: 'supplement-a',
      sourceType: 'supplementary',
      activeForGeneration: false,
      permissions: permissions({ internalProcessing: true }),
    });
    const capability = evaluateArticleProcessingCapability(article(material('full_public_processing_allowed'), [figure, supplement]));

    expect(capability.canPublishFigures).toBe(false);
    expect(capability.canGenerateReproducibilityField).toBe(false);
  });

  it('does not review a draft against an active source record bound to different content', () => {
    expect(() => assertJournalReviewCapability(article(material('full_public_processing_allowed', {
      contentSha256: '0'.repeat(64),
    })))).toThrow();
  });

  it.each(['conflict', 'expired', 'revoked'] as const)('blocks generation and publication when the active source is %s', (sourceConfidence) => {
    const capability = evaluateArticleProcessingCapability(article(material('full_public_processing_allowed', {
      sourceConfidence,
    })));

    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canPublishFullInterpretation).toBe(false);
  });
});
