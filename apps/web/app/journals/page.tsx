import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { JournalDirectory } from '@/components/journals/JournalDirectory';
import { JournalAdminLink } from '@/components/journals/JournalAdminLink';
import { HermesShellDockAnchor } from '@/components/hermes/HermesShellDockAnchor';
import { getServerPublicJournals } from '@/lib/public-server-api';
import type { JournalSummary } from '@/lib/journal-api';

export default async function JournalsPage() {
  const t = await getTranslations('journalDirectory');
  let initial: JournalSummary[] = [];
  let nextCursor: string | null = null;
  try { const page = await getServerPublicJournals(); initial = page.items; nextCursor = page.nextCursor; }
  catch { /* The directory handles a failed client refresh. */ }
  return <PublicShell includeHermesDock={false} mainClassName="craft-journal craft-journal-public" tone="paper" skipLabel={t('skip')} navigationLabel={t('navigation')} wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <section>
      <header className="journal-directory-heading">
        <div data-hermes-protected="true">
        <p className="text-sm text-os-muted-paper">OpenScience · {t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-os-muted-paper">{t('intro')}</p>
        </div>
        <div className="journal-directory-companion"><HermesShellDockAnchor inline /></div>
      </header>
      <JournalDirectory initial={initial} initialNextCursor={nextCursor} />
      <nav className="journal-account-tools" aria-label={t('accountTools')}>
        <Link href="/journals/apply">{t('apply')} →</Link>
        <JournalAdminLink />
      </nav>
    </section>
  </PublicShell>;
}
