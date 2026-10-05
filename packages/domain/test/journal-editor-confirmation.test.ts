import { describe, expect, it, vi } from 'vitest';
import { articleReviewDigest, reviewJournalArticle } from '../src/journal/articles';
import { publishJournalArticle } from '../src/journal/publishing';
import type { WorkspaceDeps } from '../src/workspace/types';

const text = 'The numerical model predicts a narrow pulse. This is not an experimental demonstration.';
function fixture(role = 'author') {
  const evidence = { quote: text, locator: 'Results' };
  const article = {
    id: 'article', journalId: 'journal', revision: 3, contentState: 'active',
    reviewState: 'draft', reviewedBy: null as string | null, reviewedRevision: null as number | null, reviewedDigest: null as string | null,
    metadata: { title: 'Synthetic paper' },
    source: { kind: 'fulltext', text, url: 'https://example.test/paper', label: 'Synthetic source' },
    rights: { internalProcessing: true, derivativeGeneration: true, externalProcessing: true, publicSource: false, publicDerivative: false, license: 'Synthetic permission', evidence: 'Synthetic rights statement' },
    draft: { summary: 'Model prediction.', scope: 'fulltext', language: 'en', core: { problem: 'p', insight: 'i', method: 'm', results: 'r', limitations: 'l', reproducibility: 'r' }, claims: [{ text: 'Prediction only.', kind: 'simulation', evidence }], figures: [], faq: [{ question: 'Experimental?', answer: 'No.', evidence }] },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    journal: { findUnique: vi.fn().mockResolvedValue({ id: 'journal', workspaceId: 'workspace', operationalState: 'active', workspace: { status: 'active' } }), findUniqueOrThrow: vi.fn().mockResolvedValue({ workspaceId: 'workspace' }) },
    membership: { findUnique: vi.fn().mockResolvedValue({ role }) }, user: { findUnique: vi.fn().mockResolvedValue({ status: 'active' }) },
    journalArticle: { findFirst: vi.fn().mockResolvedValue(article), update: vi.fn().mockImplementation(({ data }) => Object.assign(article, data)) },
    journalEvent: { create: vi.fn().mockResolvedValue({}) }, workspace: { findUnique: vi.fn().mockResolvedValue({ ownerId: 'owner' }) }, notification: { create: vi.fn().mockResolvedValue({}) },
  };
  const deps = { prisma: { $transaction: (fn: (client: unknown) => unknown) => fn(tx) } } as unknown as WorkspaceDeps;
  return { deps, tx, article };
}

describe('journal editor content confirmation (not peer review)', () => {
  it('lets an editor explicitly confirm a private draft without a separate reviewer or public rights', async () => {
    const { deps, tx, article } = fixture();
    const result = await reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: 'Checked source and summary.' });
    expect(result.reviewState).toBe('approved');
    expect(result.reviewedBy).toBe('editor');
    expect(result.reviewedRevision).toBe(3);
    expect(result.reviewedDigest).toBe(articleReviewDigest(article as never));
    expect(article.rights.publicDerivative).toBe(false);
    expect(tx.journalEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'journal.review.confirm' }) }));
    await reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: '' });
    expect(tx.journalArticle.update).toHaveBeenCalledTimes(1);
  });
  it('requires explicit confirmation and rejects stale revisions', async () => {
    const { deps, tx } = fixture();
    await expect(reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', note: '' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 2, decision: 'confirm', humanConfirmed: true, note: '' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(tx.journalArticle.update).not.toHaveBeenCalled();
  });
  it('does not turn a read-only collaborator into an editor', async () => {
    const { deps } = fixture('reviewer');
    await expect(reviewJournalArticle(deps, 'reader', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: '' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('still rejects invalid evidence and withdrawn content', async () => {
    const { deps, article } = fixture();
    article.draft.claims[0].evidence = { quote: 'A fabricated claim.', locator: 'Results' };
    await expect(reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: '' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    article.contentState = 'withdrawn';
    await expect(reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: '' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('does not grant an editor publication permission after confirmation', async () => {
    const { deps } = fixture();
    await reviewJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, decision: 'confirm', humanConfirmed: true, note: '' });
    await expect(publishJournalArticle(deps, 'editor', 'journal', 'article', { revision: 3, requestKey: 'test', humanConfirmed: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
