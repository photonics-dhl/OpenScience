import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { journalSourceDigest, requireJournalNativeAuthority, submitJournalJob } from '../src/journal/processing';
import * as articles from '../src/journal/articles';

vi.mock('../src/journal/articles', async load => ({ ...await load<typeof import('../src/journal/articles')>(),
  journalScope: vi.fn(), journalArticleInScope: vi.fn(), journalTransaction: vi.fn() }));

const text = 'Numerical simulations predict 14.7 TW peak power; full-system experiments have not been performed.';
const article = { id: 'article', revision: 3, contentState: 'active', source: { kind: 'fulltext', text, url: 'https://example.test/source', label: 'Results' },
  rights: { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true,
    externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Publisher authorization' } };
const sourceDigest = journalSourceDigest(article);
const input = { taskId: 'task', executionAttempt: 1, jobId: 'job', leaseToken: 'lease', sourceDigest, revision: 3 };
const task = { id: 'task', deletedAt: null, kind: 'journal.generate', status: 'running', executionAttempt: 1,
  idempotencyKey: 'journal-native-task:job', session: { deletedAt: null, status: 'active', kind: 'journal-editor', userId: 'editor' },
  payload: { journalJobId: 'job', leaseToken: 'lease', sourceDigest, revision: 3 } };
const job = { id: 'job', journalId: 'journal', articleId: 'article', requestedBy: 'editor', kind: 'generate', state: 'running',
  leaseToken: 'lease', leaseExpiresAt: new Date(Date.now() + 600_000), revision: 3, sourceDigest };
const tx = { $queryRaw: vi.fn(), agentTask: { findUnique: vi.fn() }, journalJob: { findUnique: vi.fn() } } as unknown as Prisma.TransactionClient;

describe('journal native authority fence', () => {
  beforeEach(() => {
    vi.mocked(tx.$queryRaw).mockReset().mockResolvedValue([{ workspaceId: 'workspace', requestedBy: 'editor' }] as never);
    vi.mocked(tx.agentTask.findUnique).mockReset().mockResolvedValue(task as never);
    vi.mocked(tx.journalJob.findUnique).mockReset().mockResolvedValue(job as never);
    vi.mocked(articles.journalScope).mockReset().mockResolvedValue({} as never);
    vi.mocked(articles.journalArticleInScope).mockReset().mockResolvedValue(article as never);
    vi.mocked(articles.journalTransaction).mockReset().mockImplementation((_, __, fn) => fn(tx));
  });
  it('accepts only the currently leased authorized source', async () => {
    expect((await requireJournalNativeAuthority(tx, input)).source.text).toBe(text);
  });
  it.each([
    ['cancelled', { state: 'cancelled' }], ['expired lease', { leaseExpiresAt: new Date(Date.now() - 1) }],
    ['changed lease', { leaseToken: 'other' }], ['changed revision', { revision: 4 }],
  ])('rejects %s before an Agent call', async (_label, changed) => {
    vi.mocked(tx.journalJob.findUnique).mockResolvedValue({ ...job, ...changed } as never);
    await expect(requireJournalNativeAuthority(tx, input)).rejects.toThrow();
    expect(articles.journalArticleInScope).not.toHaveBeenCalled();
  });
  it('rejects changed source or processing rights', async () => {
    vi.mocked(articles.journalArticleInScope).mockResolvedValue({ ...article, source: { ...article.source, text: text + ' Changed.' } } as never);
    await expect(requireJournalNativeAuthority(tx, input)).rejects.toThrow();
    vi.mocked(articles.journalArticleInScope).mockResolvedValue({ ...article, rights: { ...article.rights, externalProcessing: false } } as never);
    await expect(requireJournalNativeAuthority(tx, input)).rejects.toThrow();
  });
  it('rejects revoked editor role', async () => {
    vi.mocked(articles.journalScope).mockRejectedValue(new Error('revoked'));
    await expect(requireJournalNativeAuthority(tx, input)).rejects.toThrow('revoked');
  });
  it('does not reserve a grant when the native runtime is unavailable', async () => {
    vi.mocked(tx.journalJob.findUnique).mockResolvedValue(null);
    await expect(submitJournalJob({ prisma: tx } as never, 'editor', 'journal', 'article',
      { revision: 3, language: 'en', requestKey: 'new' })).rejects.toThrow('原生 Hermes 当前不可用');
    expect(articles.journalTransaction).toHaveBeenCalledTimes(1);
    expect((tx as unknown as { journalGrant?: unknown }).journalGrant).toBeUndefined();
  });
});
