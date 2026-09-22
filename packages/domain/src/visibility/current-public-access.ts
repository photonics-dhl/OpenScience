import type { WorkspaceDeps } from '../workspace/types';
import { evaluateArticleProcessingCapability, journalSourceMaterials } from '../journal/enhancements';

type PublicAccessDeps = Pick<WorkspaceDeps, 'prisma' | 'now'>;

function releaseScope(snapshot: unknown): 'abstract' | 'fulltext' | null {
  const draft = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as { draft?: unknown }).draft
    : null;
  const scope = draft && typeof draft === 'object' && !Array.isArray(draft)
    ? (draft as { scope?: unknown }).scope
    : null;
  return scope === 'abstract' || scope === 'fulltext' ? scope : null;
}

/**
 * Public journal releases remain governed by the article's current source matrix.
 * Ordinary Research Objects have no JournalArticle row and retain the existing
 * visibility/status behavior. The journal delegate is required so a stale schema
 * client cannot silently fail open on protected journal content.
 */
export async function canReadCurrentPublicResearch(
  deps: PublicAccessDeps,
  input: { researchObjectId: string; versionId?: string; exposure?: 'release' | 'source' },
): Promise<boolean> {
  const article = await deps.prisma.journalArticle.findUnique({
    where: { researchObjectId: input.researchObjectId },
    select: {
      id: true,
      source: true,
      rights: true,
      contentState: true,
      releases: {
        ...(input.versionId ? { where: { versionId: input.versionId } } : {}),
        select: { versionId: true, snapshot: true },
      },
    },
  });
  if (!article) return true;
  if (!article.releases.length) return false;

  const capability = evaluateArticleProcessingCapability(article, deps.now?.() ?? new Date());
  const releaseAllowed = article.releases.every((release) => {
    const scope = releaseScope(release.snapshot);
    return scope === 'abstract'
      ? capability.canPublishPublicSummary
      : scope === 'fulltext'
        ? capability.canPublishFullInterpretation
        : false;
  });
  if (!releaseAllowed || input.exposure !== 'source') return releaseAllowed;

  const rights = article.rights && typeof article.rights === 'object' && !Array.isArray(article.rights)
    ? article.rights as { publicSource?: unknown }
    : {};
  if (capability.mode === 'legacy') {
    return capability.canExposeViaApi && rights.publicSource === true;
  }
  const active = journalSourceMaterials(article.source).find((item) => item.id === capability.activeSourceId);
  return capability.canPublishFullInterpretation
    && active?.rightsStatus === 'full_public_processing_allowed'
    && active.permissions.publicSource;
}
