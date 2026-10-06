import { describe, expect, it, vi } from 'vitest';
import { journalSourceDigest, requireJournalExternalOcrAuthority } from '../src/journal/processing';
import type { JournalTx } from '../src/journal/articles';

const jobId = '11111111-1111-4111-8111-111111111111';
const journalId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const artifactId = '55555555-5555-4555-8555-555555555555';
const context = { taskId: jobId, workspaceId, actorId };

function fixture() {
  const article = { id: 'article', journalId, revision: 4, contentState: 'active',
    source: { kind: 'fulltext', label: 'Private PDF', text: 'Synthetic paper text.', artifactId },
    rights: { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: false,
      externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Editor verified license.' } };
  const job = { id: jobId, journalId, articleId: article.id, requestedBy: actorId, kind: 'source_parse', state: 'running',
    leaseToken: 'lease', leaseExpiresAt: new Date(Date.now() + 60_000), revision: article.revision,
    sourceDigest: journalSourceDigest(article) };
  const journal = { id: journalId, workspaceId, operationalState: 'active', workspace: { status: 'active' }, identifiers: [] };
  const membership = { workspaceId, userId: actorId, role: 'maintainer' };
  const artifact = { id: artifactId, workspaceId, deletedAt: null as Date | null };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValueOnce([{ journalId, workspaceId }]).mockResolvedValue([]),
    journalJob: { findUnique: vi.fn(async () => job) }, journal: { findUnique: vi.fn(async () => journal) },
    membership: { findUnique: vi.fn(async () => membership) }, user: { findUnique: vi.fn(async () => ({ status: 'active' })) },
    journalArticle: { findFirst: vi.fn(async () => article) }, artifact: { findUnique: vi.fn(async () => artifact) },
  };
  return { article, job, journal, membership, artifact, tx: tx as unknown as JournalTx };
}

describe('journal external OCR live authority', () => {
  it('allows only the current leased parse of the editor-owned PDF', async () => {
    const f = fixture();
    expect(await requireJournalExternalOcrAuthority(f.tx, context)).toBe(true);
    expect(await requireJournalExternalOcrAuthority(fixture().tx, { ...context, actorId: 'other' })).toBe(false);
    expect(await requireJournalExternalOcrAuthority(fixture().tx, { ...context, workspaceId: 'other' })).toBe(false);
  });

  it.each(['cancelled', 'expired', 'revision', 'rights', 'source', 'artifact', 'deleted'] as const)('denies changed %s before external processing', async condition => {
    const f = fixture();
    if (condition === 'cancelled') f.job.state = 'cancelled';
    if (condition === 'expired') f.job.leaseExpiresAt = new Date(Date.now() - 60_000);
    if (condition === 'revision') f.article.revision++;
    if (condition === 'rights') f.article.rights.externalProcessing = false;
    if (condition === 'source') f.article.source.text = 'Changed paper text.';
    if (condition === 'artifact') f.artifact.workspaceId = 'other';
    if (condition === 'deleted') f.artifact.deletedAt = new Date();
    expect(await requireJournalExternalOcrAuthority(f.tx, context)).toBe(false);
  });
});
