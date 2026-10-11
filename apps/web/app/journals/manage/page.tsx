'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { ApiClientError } from '@/lib/api';
import { listMyJournals, type JournalSummary } from '@/lib/journal-api';
import { DashboardShell } from '@/components/shell/DashboardShell';

export default function MyJournalsPage() {
  const router = useRouter();
  const t = useTranslations('journalDirectory.management');
  const [items, setItems] = React.useState<JournalSummary[]>([]);
  const [redirecting, setRedirecting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { const journals = (await listMyJournals()).items; setItems(journals); if (journals.length === 1) { setRedirecting(true); router.replace(`/journals/manage/${encodeURIComponent(journals[0]!.id)}`); } }
    catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) router.replace('/auth/login?returnTo=%2Fjournals%2Fmanage');
      else setError(cause instanceof Error ? cause.message : t('loadFailed'));
    } finally { setLoading(false); }
  }, [router, t]);
  React.useEffect(() => { void load(); }, [load]);

  return <DashboardShell mainClassName="craft-journal craft-journal-manage" activeRoute="journals" skipLabel={t('skip')} navigationLabel={t('title')}>
    <header className="journal-work-heading">
      <h1>{t('title')}</h1>
      <p className="text-os-muted-paper">{t('intro')}</p>
    </header>
    {loading || redirecting ? <p className="mt-8" role="status">{t('loading')}</p> : null}
    {error ? <div className="mt-6" role="alert"><p>{error}</p><button type="button" className="border border-os-rule-paper px-4" disabled={loading} onClick={() => void load()}>{t('retry')}</button></div> : null}
    {!loading && !error && !items.length ? <section className="journal-managed-empty" aria-labelledby="journal-empty-title">
      <div>
        <h2 id="journal-empty-title">{t('emptyTitle')}</h2>
        <p>{t('emptyBody')}</p>
        <div className="journal-empty-actions"><Link className="journal-primary-link" href="/journals/apply">{t('apply')}</Link><Link className="journal-back-link" href="/journals">{t('browse')} →</Link></div>
      </div>
      <svg aria-hidden="true" focusable="false" className="journal-empty-art" viewBox="0 0 300 240" fill="none">
        <path d="M45 54 153 70v153L45 207V54Z" fill="var(--craft-tint, #edf4f3)" stroke="currentColor" />
        <path d="m153 70 110-17v153l-110 17V70Z" fill="var(--craft-surface, #fff)" stroke="currentColor" />
        <path d="m45 54 18-21 90 16 90-16 20 20M63 33v153l90 17 90-17V33M153 49v154" stroke="currentColor" />
        <path d="m84 77 49 9m-49 12 49 9m-49 12 49 9m42-42 48-9m-48 30 48-9m-48 30 48-9" stroke="currentColor" opacity=".5" />
        <circle cx="154" cy="28" r="3" fill="currentColor" />
        <path d="M154 10V1m-17 12-6-6m40 6 6-6" stroke="currentColor" />
      </svg>
    </section> : null}
    {items.length > 1 && !redirecting ? <ul className="journal-managed-list" aria-busy={loading}>{items.map((item) => <li key={item.id}>
      <Link href={'/journals/manage/' + item.id}>
        <div><h2>{item.nameEn || item.nameZh}</h2><p className="text-os-muted-paper">{item.subjects.join(' · ')}</p></div>
        <span className="journal-list-action">{t('open')} →</span>
      </Link>
    </li>)}</ul> : null}
  </DashboardShell>;
}
