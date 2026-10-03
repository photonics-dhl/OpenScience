'use client';
import Link from 'next/link';
import * as React from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { listJournals, type JournalSummary } from '@/lib/journal-api';
import styles from './JournalDirectory.module.css';

function JournalEntry({ journal }: { journal: JournalSummary }) {
  const t = useTranslations('journalDirectory');
  const description = Array.from(journal.description || '');
  const excerpt = description.slice(0, 220).join('') + (description.length > 220 ? '…' : '');
  return (
    <li>
      <Link
        data-journal-entry
        data-hermes-protected="true"
        href={`/journals/${journal.slug}`}
        className={styles.entry}
      >
        <div className={styles.body}>
          {journal.subjects.length ? <p className={styles.subjects}>{journal.subjects.join(' · ')}</p> : null}
          <h2 lang={journal.nameEn ? 'en' : 'zh'}>{journal.nameEn || journal.nameZh}</h2>
          {journal.nameZh && journal.nameEn ? <p className={styles.translation} lang="zh">{journal.nameZh}</p> : null}
          {excerpt ? <p className={styles.description}>{excerpt}</p> : null}
          <div className={styles.metadata}>
            {journal.pIssn ? <span>ISSN {journal.pIssn}</span> : null}
            {journal.eIssn ? <span>eISSN {journal.eIssn}</span> : null}
            <span data-journal-count>{t('articleCount', { count: journal.publicArticleCount })}</span>
          </div>
        </div>
        <ArrowRight className={styles.arrow} size={20} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function JournalDirectory({ initial = [], initialNextCursor = null }: { initial?: JournalSummary[]; initialNextCursor?: string | null }) {
  const t = useTranslations('journalDirectory');
  const [items, setItems] = React.useState(initial); const [loading, setLoading] = React.useState(!initial.length); const [error, setError] = React.useState(''); const [term, setTerm] = React.useState('');
  const [cursor, setCursor] = React.useState(initialNextCursor);
  const [appliedTerm, setAppliedTerm] = React.useState('');
  const inFlight = React.useRef(false);
  const lastRequest = React.useRef<{ query: string; cursor?: string }>({ query: '' });
  const load = React.useCallback(async (value = '', next?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastRequest.current = { query: value, cursor: next };
    setLoading(true); setError('');
    try {
      const page = await listJournals({ query: value, limit: 20, cursor: next });
      setItems((previous) => next ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setAppliedTerm(value);
    } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')); }
    finally { inFlight.current = false; setLoading(false); }
  }, [t]);
  React.useEffect(() => { if (!initial.length) void load(); }, [initial.length, load]);
  return (
    <section data-journal-directory className={styles.directory} aria-label={t('title')}>
      <form
        aria-busy={loading}
        data-hermes-protected="true"
        className={styles.search}
        onSubmit={(event) => { event.preventDefault(); void load(term); }}
      >
        <label className="sr-only" htmlFor="journal-search">{t('searchLabel')}</label>
        <input id="journal-search" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t('searchPlaceholder')} />
        <button disabled={loading} type="submit">{t('search')}</button>
      </form>
      {loading ? <p className={styles.loading} role="status" aria-live="polite">{t('loading')}</p> : null}
      {error ? (
        <div className={styles.feedback} role="alert">
          <p>{error}</p>
          <button type="button" disabled={loading} onClick={() => void load(lastRequest.current.query, lastRequest.current.cursor)}>{t('retry')}</button>
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <div className={styles.empty} role="status" data-hermes-protected="true">
          <BookOpen size={44} strokeWidth={1} aria-hidden="true" />
          <h2>{t(appliedTerm ? 'noMatches' : 'emptyTitle')}</h2>
          <p>{t(appliedTerm ? 'noMatchesBody' : 'emptyBody')}</p>
          {appliedTerm ? <button type="button" onClick={() => { setTerm(''); void load(''); }}>{t('clearSearch')}<ArrowRight size={16} aria-hidden="true" /></button>
            : <Link href="/explore">{t('explore')}<ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
      ) : null}
      <ul data-journal-entries className={styles.entries} aria-busy={loading}>
        {items.map((journal) => <JournalEntry journal={journal} key={journal.id} />)}
      </ul>
      {cursor ? <button type="button" disabled={loading} className={styles.more} onClick={() => void load(appliedTerm, cursor)}>{t('more')}</button> : null}
      <details className={styles.dataResources}><summary>{t('dataResources')}</summary>
        <p data-journal-resources className={styles.resources}>
          <a href="/journals-openapi.json">{t('openapi')}</a><a href="/journals/sitemap.xml">{t('sitemap')}</a>
        </p>
      </details>
    </section>
  );
}
