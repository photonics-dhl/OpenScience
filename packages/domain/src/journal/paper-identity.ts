import type { WorkspaceDeps } from '../workspace/types';
import { canReadCurrentPublicResearch } from '../visibility/current-public-access';
import { publicVersionNumber, readPublicationMetadata } from '../publish/publication-metadata';
import { JournalError } from './contracts';
import { normalizeJournalDoi, type JournalMetadata } from './content';
import { journalScope, JOURNAL_EDIT_ROLES, txReleases } from './articles';
import { ResearchObjectError } from '../research-object/errors';
import { recordAudit } from '../workspace/audit';

type PaperDeps = Pick<WorkspaceDeps, 'prisma' | 'now'>;
export interface PublicPaperInterpretation {
  kind: 'journal_editor' | 'contributor';
  label: string;
  url: string;
  publicId: string;
  versionNo: number;
  publishedAt: string;
  title: string;
  journal?: { name: string; slug: string };
}
export interface PublicPaperIdentity {
  doi: string;
  metadata: Pick<JournalMetadata, 'title' | 'authors' | 'publishedDate' | 'journalTitle' | 'originalUrl'>;
  interpretations: PublicPaperInterpretation[];
  hasMoreInterpretations: boolean;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function frozenOriginalDoi(record: unknown): string | null {
  const identity = object(object(object(record).dto).identity);
  const original = object(identity.originalDoi);
  if (original.state !== 'recorded' || typeof original.value !== 'string') return null;
  try { return normalizeJournalDoi(original.value); } catch { return null; }
}

/** An exact DOI is a bibliography key, never a grant to another workspace's draft or rights. */
export async function getPublicPaperByDoi(deps: PaperDeps, doiInput: string): Promise<PublicPaperIdentity | null> {
  const doi = normalizeJournalDoi(doiInput);
  const journalRows = await deps.prisma.journalArticle.findMany({
    where: { work: { doi }, directoryVisible: true, journal: { homepagePublished: true } },
    include: { journal: true },
    orderBy: { id: 'asc' },
  });
  const interpretations: PublicPaperInterpretation[] = [];
  let metadata: PublicPaperIdentity['metadata'] | null = null;
  let releasedMetadata = false;
  for (const row of journalRows) {
    const releases = await txReleases(deps.prisma, row.id, true, deps.now?.() ?? new Date());
    if (!releases.length) {
      // A directory listing is already public even when source rights block an interpretation.
      const listed = object(row.metadata);
      if (listed.doi === doi && typeof listed.title === 'string' && Array.isArray(listed.authors)) {
        metadata ??= { title: listed.title, authors: listed.authors.filter((name): name is string => typeof name === 'string'),
          publishedDate: typeof listed.publishedDate === 'string' ? listed.publishedDate : undefined,
          journalTitle: typeof listed.journalTitle === 'string' ? listed.journalTitle : undefined,
          originalUrl: `https://doi.org/${doi}` };
      }
      continue;
    }
    // The published snapshot, not editable private metadata, supplies the public bibliography.
    const latest = await deps.prisma.journalRelease.findFirst({ where: { id: releases[0]!.id }, select: { snapshot: true } });
    const frozen = object(object(latest?.snapshot).metadata);
    if (frozen.doi !== doi || typeof frozen.title !== 'string' || !Array.isArray(frozen.authors)) continue;
    if (!releasedMetadata) {
      metadata = {
        title: frozen.title,
        authors: frozen.authors.filter((name): name is string => typeof name === 'string'),
        publishedDate: typeof frozen.publishedDate === 'string' ? frozen.publishedDate : undefined,
        journalTitle: typeof frozen.journalTitle === 'string' ? frozen.journalTitle : undefined,
        originalUrl: `https://doi.org/${doi}`,
      };
      releasedMetadata = true;
    }
    interpretations.push({ kind: 'journal_editor', label: '期刊编辑解读', url: releases[0]!.url,
      publicId: releases[0]!.publicId!, versionNo: releases[0]!.versionNo,
      publishedAt: releases[0]!.publishedAt.toISOString(), title: frozen.title,
      journal: { name: row.journal.nameZh || row.journal.nameEn || row.journal.slug, slug: row.journal.slug } });
  }

  // Ordinary RO records are eligible only with an explicit DOI in their issued record.
  // Citation text and platform authors identify the interpretation, not the original paper.
  const ordinary = await deps.prisma.version.findMany({ where: {
    AND: [
      { researchRecord: { path: ['dto', 'identity', 'originalDoi', 'value'], equals: doi } },
      { researchRecord: { path: ['dto', 'identity', 'originalDoi', 'state'], equals: 'recorded' } },
    ],
    publications: { some: {} }, status: { in: ['published', 'revised'] },
    researchObject: { visibility: 'public' }, journalRelease: { is: null },
  }, include: { researchObject: true, publications: { orderBy: { publishedAt: 'desc' }, take: 1 } },
    distinct: ['researchObjectId'], orderBy: { publicationNo: 'desc' }, take: 101 });
  const seen = new Set<string>();
  for (const version of ordinary.slice(0, 100)) {
    if (seen.has(version.researchObjectId) || frozenOriginalDoi(version.researchRecord) !== doi) continue;
    if (!await canReadCurrentPublicResearch(deps, { researchObjectId: version.researchObjectId, versionId: version.id })) continue;
    const versionNo = publicVersionNumber(version);
    const publicId = version.researchObject.publicId;
    const publication = version.publications[0];
    if (versionNo === null || !publicId || !publication) continue;
    seen.add(version.researchObjectId);
    const issued = readPublicationMetadata(version.researchRecord);
    const title = issued.title || version.researchObject.title;
    metadata ??= { title: `DOI ${doi}`, authors: [], originalUrl: `https://doi.org/${doi}` };
    interpretations.push({ kind: 'contributor', label: '贡献者解读',
      url: `/research/${encodeURIComponent(publicId)}/v/${versionNo}`, publicId, versionNo,
      publishedAt: publication.publishedAt.toISOString(), title });
  }
  if (!metadata) return null;
  interpretations.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.publicId.localeCompare(b.publicId));
  return { doi, metadata, interpretations, hasMoreInterpretations: ordinary.length > 100 };
}

export async function lookupPaperInWorkspace(deps: PaperDeps, userId: string, workspaceId: string, doiInput: string) {
  const doi = normalizeJournalDoi(doiInput);
  const existing = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
    const membership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true, user: true } });
    if (!membership || membership.workspace.status !== 'active' || ['suspended', 'deleted', 'invited'].includes(membership.user.status)) throw new JournalError('JOURNAL_NOT_FOUND', '工作区不存在或无访问权限');
    const journal = await tx.journal.findUnique({ where: { workspaceId } });
    if (journal) {
      await journalScope(tx, journal.id, userId, JOURNAL_EDIT_ROLES);
      const article = await tx.journalArticle.findFirst({ where: { journalId: journal.id, work: { doi } }, select: { id: true } });
      return article ? { type: 'journal_article' as const, id: article.id, url: `/journals/manage/${journal.id}/articles/${article.id}` } : null;
    }
    const ro = await tx.researchObject.findFirst({ where: { workspaceId, originalDoi: doi, deletedAt: null }, select: { id: true } });
    return ro ? { type: 'research_object' as const, id: ro.id, url: `/research-objects/${ro.id}/overview` } : null;
  }, { isolationLevel: 'Serializable' });
  const publicPaper = await getPublicPaperByDoi(deps, doi);
  return { doi, existing, publicPaper };
}

/** Workspace-owned bibliographic declaration. This does not change any issued version or grant source rights. */
export async function setResearchObjectOriginalDoi(deps: WorkspaceDeps, userId: string, researchObjectId: string, expectedVersion: number, doiInput: string | null) {
  const doi = doiInput === null ? null : normalizeJournalDoi(doiInput);
  const target = await deps.prisma.researchObject.findUnique({ where: { id: researchObjectId }, select: { workspaceId: true } });
  if (!target) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  return deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${target.workspaceId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE workspace_id = ${target.workspaceId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
    const [ro, membership, journalArticle] = await Promise.all([
      tx.researchObject.findUnique({ where: { id: researchObjectId }, select: { id: true, workspaceId: true, deletedAt: true } }),
      tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: target.workspaceId, userId } }, include: { workspace: true, user: true } }),
      tx.journalArticle.findUnique({ where: { researchObjectId }, select: { id: true } }),
    ]);
    if (!ro || ro.deletedAt || ro.workspaceId !== target.workspaceId || !membership || membership.workspace.status !== 'active'
      || !['owner', 'maintainer', 'author'].includes(membership.role) || ['suspended', 'deleted', 'invited'].includes(membership.user.status)) {
      throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    }
    if (journalArticle) throw new ResearchObjectError('FORBIDDEN', '期刊论文 DOI 请在期刊流程中管理');
    if (doi && await tx.researchObject.findFirst({ where: { workspaceId: ro.workspaceId, originalDoi: doi, deletedAt: null, id: { not: researchObjectId } }, select: { id: true } })) {
      throw new ResearchObjectError('VALIDATION_ERROR', '此 DOI 已在当前工作区关联研究，请前往已有研究继续添加材料');
    }
    const updated = await tx.researchObject.updateMany({ where: { id: researchObjectId, version: expectedVersion, deletedAt: null }, data: { originalDoi: doi, version: { increment: 1 } } });
    if (!updated.count) throw new ResearchObjectError('CONCURRENT_UPDATE', '研究对象已更新，请刷新后重试');
    await recordAudit(deps, tx, { actorId: userId, action: 'research_object.original_doi.set', workspaceId: ro.workspaceId,
      targetType: 'research_object', targetId: researchObjectId, metadata: { doi, expectedVersion } }, {});
    return { researchObjectId, doi, version: expectedVersion + 1 };
  }, { isolationLevel: 'Serializable' });
}
