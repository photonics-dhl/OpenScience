import { getTranslations } from 'next-intl/server';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { JournalDirectory } from '@/components/journals/JournalDirectory';
import { JournalDirectoryActions } from '@/components/journals/JournalDirectoryActions';
import { getServerPublicJournals } from '@/lib/public-server-api';
import type { JournalSummary } from '@/lib/journal-api';
export default async function JournalsPage() {
  const t = await getTranslations('journalDirectory');
  let initial: JournalSummary[] = []; let nextCursor: string | null = null;
  try { const page = await getServerPublicJournals(); initial = page.items; nextCursor = page.nextCursor; }
  catch { /* The client directory offers a recoverable refresh. */ }
  return <PublicShell mainClassName="craft-journal craft-journal-public" tone="paper" skipLabel={t('skip')} navigationLabel={t('navigation')} wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <section><header className="journal-directory-heading"><h1>Browse all journals</h1><p className="text-os-muted-paper">{t('intro')}</p></header>
      <JournalDirectory initial={initial} initialNextCursor={nextCursor} /><JournalDirectoryActions />
    </section>
  </PublicShell>;
}
