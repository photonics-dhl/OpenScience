import { getServerPublicJournals } from '@/lib/public-server-api';
import { journalSitemap } from '@/lib/journal-sitemap';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await getServerPublicJournals(cursor, 100);
      paths.push(...page.items.map((journal) => `/journals/${encodeURIComponent(journal.slug)}/sitemap.xml`));
      if (paths.length > 50_000 || (page.nextCursor && page.nextCursor === cursor)) throw new Error('Sitemap pagination limit');
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return journalSitemap(paths, true);
  } catch {
    return new Response('Journal sitemap temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
}
