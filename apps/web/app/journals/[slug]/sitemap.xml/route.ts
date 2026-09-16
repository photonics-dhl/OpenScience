import { getServerPublicJournal, getServerPublicJournalArticles, PublicServerApiError } from '@/lib/public-server-api';
import { journalSitemap } from '@/lib/journal-sitemap';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const { journal } = await getServerPublicJournal(params.slug);
    const paths = [`/journals/${encodeURIComponent(journal.slug)}`];
    let cursor: string | undefined;
    do {
      const page = await getServerPublicJournalArticles(journal.id, cursor, 100);
      paths.push(...page.items.flatMap((article) => article.contentState === 'active' ? article.releases.map((release) => release.url) : []));
      if (paths.length > 50_000 || (page.nextCursor && page.nextCursor === cursor)) throw new Error('Sitemap pagination limit');
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return journalSitemap(paths);
  } catch (error) {
    return new Response('Journal sitemap unavailable', { status: error instanceof PublicServerApiError && error.status === 404 ? 404 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
