import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  JournalError, assertArticleRevision,
  getManagedJournalArticle, journalArticleEvent, journalArticleInScope,
  journalScope, journalTransaction, txReleases,
} from '@openscience/domain';
import { requireCurrentUser } from './session-guard';
import type { registerJournalRoutes } from './journal-core-routes';
import { archivedAtRevision, draftDeletionBlock } from './journal-draft-policy';

type Deps = Parameters<typeof registerJournalRoutes>[1];
const paramsSchema = z.object({ id: z.string().uuid(), articleId: z.string().uuid() });
const bodySchema = z.object({ revision: z.number().int().positive() }).strict();
const activeStates = ['staging', 'pending', 'running'];

export function registerJournalWorkbenchRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/journals/access', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const row = await deps.prisma.user.findUnique({ where: { id: user.userId }, select: { platformRole: true } });
    return { canReviewJournals: row?.platformRole === 'platform_admin' };
  });
  app.get('/journals/:id/workbench-articles', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(50) }).strict().parse(req.query);
    const access = await journalScope(deps.prisma, id, user.userId);
    const rows = await deps.prisma.journalArticle.findMany({
      where: { journalId: id, ...(access.membership.role === 'reviewer' ? { assignedReviewerId: user.userId } : {}) },
      orderBy: { id: 'asc' }, take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), select: { id: true },
    });
    const page = rows.slice(0, q.limit);
    const articleIds = page.map((row) => row.id);
    const [events, statusJobs] = await Promise.all([
      deps.prisma.journalEvent.findMany({
        where: { journalId: id, targetType: 'article', targetId: { in: articleIds }, action: 'journal.draft.archive' },
        orderBy: { createdAt: 'desc' }, select: { targetId: true, after: true },
      }),
      deps.prisma.journalJob.findMany({
        where: { journalId: id, articleId: { in: articleIds }, state: { in: ['staging', 'pending', 'running', 'succeeded'] } },
        select: { id: true, articleId: true, state: true, kind: true, createdAt: true },
      }),
    ]);
    const items = await Promise.all(page.map(async (row) => {
      const article = await getManagedJournalArticle(deps, user.userId, id, row.id);
      const archive = events.find((event) => event.targetId === row.id);
      const extraActive = statusJobs.filter((job) => job.articleId === row.id && activeStates.includes(job.state) && !article.jobs.some((existing) => existing.id === job.id));
      const publicReleases = article.contentState === 'active' ? await txReleases(deps.prisma, row.id, true) : [];
      return {
        ...article, jobs: [...article.jobs, ...extraActive],
        draftArchived: archivedAtRevision(archive?.after, article.revision),
        processingCompleted: !!(await deps.prisma.journalSharedBinding.findUnique({ where: { articleId: row.id }, select: { confirmedVersionId: true } }))?.confirmedVersionId
          || statusJobs.some((job) => job.articleId === row.id && job.kind === 'generate' && job.state === 'succeeded'),
        publicInterpretation: publicReleases.length > 0,
      };
    }));
    return { items, nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  });
  app.delete('/journals/:id/articles/:articleId/draft', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const p = paramsSchema.parse(req.params);
    const input = bodySchema.parse(req.body);
    return journalTransaction(deps, p.id, async (tx) => {
      await journalScope(tx, p.id, user.userId, ['owner', 'maintainer', 'author'], true);
      const article = await journalArticleInScope(tx, p.id, p.articleId);
      assertArticleRevision(article, input.revision);
      const [releaseCount, activeJobCount] = await Promise.all([
        tx.journalRelease.count({ where: { articleId: p.articleId, revision: article.revision } }),
        tx.journalJob.count({ where: { journalId: p.id, articleId: p.articleId, state: { in: activeStates } } }),
      ]);
      const block = draftDeletionBlock({ ...article, releaseCount, activeJobCount });
      if (block) throw new JournalError('INVALID_STATE', block);
      // Reversible archive: never remove the RO, files, source or public releases.
      const updated = await tx.journalArticle.update({ where: { id: p.articleId }, data: {
        revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null,
      } });
      await journalArticleEvent(tx, p.id, user.userId, 'journal.draft.archive', p.articleId, { revision: updated.revision });
      return { articleId: p.articleId, revision: updated.revision, archived: true };
    });
  });
  app.post('/journals/:id/articles/:articleId/draft/restore', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const p = paramsSchema.parse(req.params);
    const input = bodySchema.parse(req.body);
    return journalTransaction(deps, p.id, async (tx) => {
      await journalScope(tx, p.id, user.userId, ['owner', 'maintainer', 'author'], true);
      const article = await journalArticleInScope(tx, p.id, p.articleId);
      assertArticleRevision(article, input.revision);
      if (article.contentState !== 'active') throw new JournalError('INVALID_STATE', '受限或撤回论文不可恢复草稿。');
      const archive = await tx.journalEvent.findFirst({ where: {
        journalId: p.id, targetType: 'article', targetId: p.articleId, action: 'journal.draft.archive',
      }, orderBy: { createdAt: 'desc' } });
      if (!archivedAtRevision(archive?.after, article.revision)) throw new JournalError('REVISION_CONFLICT', '草稿已被更新，请刷新列表。');
      const updated = await tx.journalArticle.update({ where: { id: p.articleId }, data: {
        revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null,
      } });
      await journalArticleEvent(tx, p.id, user.userId, 'journal.draft.restore', p.articleId, { revision: updated.revision });
      return { articleId: p.articleId, revision: updated.revision, archived: false };
    });
  });
}
