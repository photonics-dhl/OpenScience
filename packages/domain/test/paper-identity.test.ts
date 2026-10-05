import { describe, expect, it, vi } from 'vitest';
import { getPublicPaperByDoi, lookupPaperInWorkspace, setResearchObjectOriginalDoi } from '../src/journal/paper-identity';

const doi = '10.1234/paper';
const date = new Date('2026-10-01T00:00:00.000Z');
const published = (originalDoi: unknown) => ({
  id: 'version', researchObjectId: 'ro', publicationNo: 2, publicVersionId: 'OSR-v2', status: 'published',
  researchObject: { id: 'ro', title: 'Contributor interpretation', publicId: 'OSR', visibility: 'public' },
  publications: [{ publishedAt: date }],
  researchRecord: { dto: { identity: { originalDoi } }, publicationMetadata: { schemaVersion: 1, title: 'Contributor interpretation', authors: [{ displayName: 'Uploader', identityStatus: 'active' }] } },
});

describe('paper DOI boundary', () => {
  it('shows only currently authorized journal releases under one public bibliography', async () => {
    const source = { kind: 'abstract', text: 'A synthetic abstract with sufficient length for a public interpretation and rights evaluation.', url: 'https://example.test/paper', label: 'Abstract' };
    const rights = { internalProcessing: true, derivativeGeneration: true, publicDerivative: true, publicSource: false, externalProcessing: true, license: 'CC BY', evidence: 'Published statement' };
    const snapshot = { metadata: { doi, title: 'Original publication', authors: ['Original Author'], publishedDate: '2025', journalTitle: 'Journal', originalUrl: `https://doi.org/${doi}` }, draft: { scope: 'abstract' } };
    const prisma = { journalArticle: { findMany: vi.fn().mockResolvedValue([{ id: 'article', metadata: snapshot.metadata, journal: { nameEn: 'Journal', nameZh: null, slug: 'journal' } }]),
        findUnique: vi.fn().mockResolvedValue({ id: 'article', source, rights, contentState: 'active' }) },
      journalRelease: { findMany: vi.fn().mockResolvedValue([{ id: 'release', snapshot,
        publishedAt: date, version: { publicationNo: 1, publicVersionId: 'J-v1', researchObject: { publicId: 'J' } } }]),
        findFirst: vi.fn().mockResolvedValue({ snapshot }) }, version: { findMany: vi.fn().mockResolvedValue([]) } };
    const paper = await getPublicPaperByDoi({ prisma } as never, doi);
    expect(paper?.metadata.title).toBe('Original publication');
    expect(paper?.interpretations).toEqual([expect.objectContaining({ kind: 'journal_editor', journal: { name: 'Journal', slug: 'journal' } })]);
    prisma.journalArticle.findUnique.mockResolvedValue({ id: 'article', source, rights: { ...rights, publicDerivative: false }, contentState: 'active' });
    expect((await getPublicPaperByDoi({ prisma } as never, doi))?.interpretations).toEqual([]);
  });

  it('aggregates only explicitly frozen public DOI records and never calls an uploader a verified paper author', async () => {
    const prisma = { journalArticle: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
      version: { findMany: vi.fn().mockResolvedValue([published({ state: 'recorded', value: doi })]) } };
    const paper = await getPublicPaperByDoi({ prisma } as never, 'https://doi.org/10.1234/PAPER');
    expect(paper?.interpretations).toEqual([expect.objectContaining({ kind: 'contributor', label: '贡献者解读', publicId: 'OSR', versionNo: 2 })]);
    expect(prisma.version.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      publications: { some: {} }, researchObject: { visibility: 'public' }, journalRelease: { is: null },
    }), distinct: ['researchObjectId'], take: 101 }));
    prisma.version.findMany.mockResolvedValue([published({ state: 'not_recorded', value: doi })]);
    expect(await getPublicPaperByDoi({ prisma } as never, doi)).toBeNull();
  });

  it('never queries a different workspace for a private match', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), membership: { findUnique: vi.fn().mockResolvedValue({ role: 'owner', workspace: { status: 'active' }, user: { status: 'active' } }) },
      journal: { findUnique: vi.fn().mockResolvedValue(null) }, researchObject: { findFirst: vi.fn().mockResolvedValue({ id: 'own-ro' }) },
      journalArticle: { findMany: vi.fn().mockResolvedValue([]) }, version: { findMany: vi.fn().mockResolvedValue([]) } };
    const prisma = { ...tx, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
    const result = await lookupPaperInWorkspace({ prisma } as never, 'user', 'own-workspace', doi);
    expect(result.existing).toEqual({ type: 'research_object', id: 'own-ro', url: '/research-objects/own-ro/overview' });
    expect(prisma.researchObject.findFirst).toHaveBeenCalledWith({ where: { workspaceId: 'own-workspace', originalDoi: doi, deletedAt: null }, select: { id: true } });
    tx.membership.findUnique.mockResolvedValue(null);
    await expect(lookupPaperInWorkspace({ prisma } as never, 'user', 'other-workspace', doi)).rejects.toThrow();
    expect(prisma.researchObject.findFirst).toHaveBeenCalledTimes(1);
  });

  it('requires workspace edit authority and CAS to set or clear a DOI, with no publication edits', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), researchObject: { findUnique: vi.fn().mockResolvedValue({ id: 'ro', workspaceId: 'ws', deletedAt: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue(null) },
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'owner', workspace: { status: 'active' }, user: { status: 'active' } }) },
      journalArticle: { findUnique: vi.fn().mockResolvedValue(null) } };
    const prisma = { researchObject: { findUnique: vi.fn().mockResolvedValue({ workspaceId: 'ws' }) },
      $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const deps = { prisma, audit } as never;
    await expect(setResearchObjectOriginalDoi(deps, 'user', 'ro', 4, null)).resolves.toEqual({ researchObjectId: 'ro', doi: null, version: 5 });
    expect(tx.researchObject.updateMany).toHaveBeenCalledWith({ where: { id: 'ro', version: 4, deletedAt: null }, data: { originalDoi: null, version: { increment: 1 } } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'research_object.original_doi.set', workspaceId: 'ws', targetId: 'ro' }), tx);
    tx.membership.findUnique.mockResolvedValue({ role: 'reviewer', workspace: { status: 'active' }, user: { status: 'active' } });
    await expect(setResearchObjectOriginalDoi(deps, 'user', 'ro', 5, doi)).rejects.toThrow();
    expect(tx.researchObject.updateMany).toHaveBeenCalledTimes(1);
  });
});
