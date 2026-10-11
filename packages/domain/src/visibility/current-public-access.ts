import type { WorkspaceDeps } from '../workspace/types';
import { journalReleaseExpired } from '../journal/release-authorization';

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
 * A journal release uses its reviewed, frozen authorization and publication state.
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
      contentState: true,
      source: true,
      releases: {
        ...(input.versionId ? { where: { versionId: input.versionId } } : {}),
        select: { versionId: true, snapshot: true, version: { select: { status: true, researchObject: { select: { visibility: true, deletedAt: true } } } } },
      },
    },
  });
  if (!article) return true;
  if (!article.releases.length) return false;

  const now = deps.now?.() ?? new Date();
  const eligible = article.releases.filter((release) => {
    if (journalReleaseExpired(release.snapshot, article.source, now)) return false;
    if (article.contentState !== 'active' || release.version.status !== 'published'
      || release.version.researchObject.visibility !== 'public' || release.version.researchObject.deletedAt) return false;
    const scope = releaseScope(release.snapshot);
    return scope === 'abstract' || scope === 'fulltext';
  });
  if (input.exposure !== 'source') return eligible.length > 0;
  return eligible.some((release) => typeof (release.snapshot as { source?: { text?: unknown } }).source?.text === 'string');
}
