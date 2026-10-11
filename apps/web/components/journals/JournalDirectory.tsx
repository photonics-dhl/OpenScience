'use client';
import Link from 'next/link';
import * as React from 'react';
import { ArrowRight, BookOpen, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { listJournals, type JournalSummary } from '@/lib/journal-api';
import { collectAllPages, selectDirectory, type AccessFilter, type DirectoryRecord, type DirectorySort } from '@/lib/journal-workbench-model';
import styles from './JournalDirectory.module.css';

type Item = JournalSummary & DirectoryRecord;
type Filters = { query: string; subject: string; access: AccessFilter; sort: DirectorySort };
const defaults: Filters = { query: '', subject: '', access: 'all', sort: 'az' };
function JournalEntry({ journal }: { journal: Item }) {
  const english = useLocale() === 'en';
  return (
    <li>
      <Link
        data-journal-entry
        data-hermes-protected="true"
        href={`/journals/${journal.slug}`}
        className={styles.entry}
      >
        <div className={styles.body}>
          <div className={styles.identity}>
          {journal.subjects.length ? <p className={styles.subjects}>{journal.subjects.join(' · ')}</p> : null}
          <h2 lang={journal.nameEn ? 'en' : 'zh'}>{journal.nameEn || journal.nameZh}</h2>
          {journal.nameZh && journal.nameEn ? <p className={styles.translation} lang="zh">{journal.nameZh}</p> : null}
          </div>
          <div className={styles.details}>
          <div className={styles.metadata}>
            <span>{journal.publisherName || (english ? 'Publisher not provided' : '出版商未提供')}</span>
          </div>
          </div>
        </div>
        <ArrowRight className={styles.arrow} size={20} aria-hidden="true" />
      </Link>
    </li>
  );
}
export function JournalDirectory({ initial = [], initialNextCursor = null }: { initial?: JournalSummary[]; initialNextCursor?: string | null }) {
  const t = useTranslations('journalDirectory'); const english = useLocale() === 'en';
  const [items, setItems] = React.useState<Item[]>(initial);
  const [loading, setLoading] = React.useState(!!initialNextCursor || !initial.length);
  const [error, setError] = React.useState(''); const [filters, setFilters] = React.useState<Filters>(defaults);
  const [term, setTerm] = React.useState(''); const [page, setPage] = React.useState(1);
  const generation = React.useRef(0); const abort = React.useRef<AbortController | null>(null); const inFlight = React.useRef(false);
  const load = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++generation.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError('');
    try {
      const all = await collectAllPages((cursor) => listJournals({ limit: 100, cursor }), { signal: controller.signal });
      if (request === generation.current) setItems(all);
    } catch (cause) { if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Unable to load journals.'); }
    finally { if (request === generation.current) { setLoading(false); inFlight.current = false; } }
  }, []);
  React.useEffect(() => { if (initialNextCursor || !initial.length) void load(); return () => { generation.current += 1; abort.current?.abort(); inFlight.current = false; }; }, [initial.length, initialNextCursor, load]);
  React.useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const access = params.get('access') as AccessFilter; const sort = params.get('sort') as DirectorySort;
      const next: Filters = { query: params.get('q') || '', subject: params.get('subject') || '', access: ['all', 'open', 'closed', 'unknown'].includes(access) ? access : 'all', sort: ['az', 'paper_count', 'citation_count'].includes(sort) ? sort : 'az' };
      setFilters(next); setTerm(next.query); setPage(1);
    }
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, []);
  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch }; setFilters(next); setPage(1);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ q: next.query, subject: next.subject, access: next.access === 'all' ? '' : next.access, sort: next.sort === 'az' ? '' : next.sort })) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history.pushState(null, '', url);
  }
  const subjects = [...new Set(items.flatMap((item) => item.subjects))].sort((a, b) => a.localeCompare(b));
  const accessAvailable = items.some((item) => typeof item.openAccess === 'boolean');
  const accessUnavailable = !accessAvailable && ['open', 'closed'].includes(filters.access);
  const citationAvailable = items.some((item) => typeof item.citationCount === 'number');
  const effective = { ...filters, sort: !citationAvailable && filters.sort === 'citation_count' ? 'az' as const : filters.sort };
  const accessCopy = { all: 'accessAll', open: 'accessOpen', closed: 'accessClosed', unknown: 'accessUnknown' } as const;
  const activeFilters = [
    ...(filters.subject ? [filters.subject] : []),
    ...(filters.access !== 'all' ? [t(`filters.${accessCopy[filters.access]}`)] : []),
    ...(filters.sort === 'citation_count' && !citationAvailable ? [t('filters.citationFallback')]
      : effective.sort !== 'az' ? [t(`filters.${effective.sort === 'paper_count' ? 'sortPaperCount' : 'sortCitationCount'}`)] : []),
  ];
  const results = selectDirectory(items, effective); const pages = Math.max(1, Math.ceil(results.length / 20)); const current = Math.min(page, pages);
  const control = 'min-h-11 max-w-full border border-os-rule-paper bg-transparent px-3 text-sm disabled:opacity-50';
  return <section data-journal-directory className={styles.directory} aria-label={t('title')}>
    <form aria-busy={loading} data-hermes-protected="true" className={styles.search} onSubmit={(event) => { event.preventDefault(); if (!loading && !error) update({ query: term }); }}>
      <label className="sr-only" htmlFor="journal-search">{t('searchLabel')}</label><input id="journal-search" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t('searchPlaceholder')} /><button disabled={loading || !!error} type="submit">{t('search')}</button>
    </form>
    <details className={styles.refinement} data-journal-refinement>
      <summary className={styles.refinementSummary}>
        <span className={styles.refinementTitle}>{t('filters.label')}</span>
        <span className={styles.refinementValue}>{activeFilters.length ? activeFilters.join(' · ') : t('filters.defaults')}</span>
        <ChevronDown className={styles.refinementChevron} size={16} aria-hidden="true" />
      </summary>
      <fieldset disabled={loading || !!error} className={styles.refinementFields} aria-label={t('filters.label')} data-hermes-protected="true">
        <label>{t('filters.subjectLabel')}<select className={control} value={filters.subject} onChange={(event) => update({ subject: event.target.value })}><option value="">{t('filters.allSubjects')}</option>{filters.subject && !subjects.includes(filters.subject) ? <option value={filters.subject}>{filters.subject}</option> : null}{subjects.map((subject) => <option value={subject} key={subject}>{subject}</option>)}</select></label>
        <label>{t('filters.accessLabel')}<select className={control} value={filters.access} onChange={(event) => update({ access: event.target.value as AccessFilter })}><option value="all">{t('filters.accessAll')}</option><option value="open" disabled={!accessAvailable}>{t('filters.accessOpen')}</option><option value="closed" disabled={!accessAvailable}>{t('filters.accessClosed')}</option><option value="unknown">{t('filters.accessUnknown')}</option></select></label>
        <label>{t('filters.sortLabel')}<select className={control} value={effective.sort} onChange={(event) => update({ sort: event.target.value as DirectorySort })}><option value="az">A–Z</option><option value="paper_count">{t('filters.sortPaperCount')}</option><option value="citation_count" disabled={!citationAvailable}>{t('filters.sortCitationCount')}</option></select></label>
      </fieldset>
      <p className={styles.refinementHint}>{t('filters.availability')}</p>
    </details>
    {loading ? <p className={styles.loading} role="status">{t('loading')}</p> : null}
    {error ? <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => void load()}>{t('retry')}</button></div> : null}
    {!loading && !error ? <><p className="text-sm text-os-muted-paper">{results.length} {english ? 'journals' : '本期刊'}</p>{!results.length ? <div className={styles.empty} role="status" data-hermes-protected="true"><BookOpen size={44} strokeWidth={1} aria-hidden="true" /><h2>{t(accessUnavailable ? 'accessUnavailable' : 'noMatches')}</h2><button type="button" onClick={() => { if (accessUnavailable) update({access:'all'}); else {setTerm(''); update(defaults);} }}>{t(accessUnavailable ? 'showAllAccess' : 'clearSearch')}</button></div> : null}</> : items.length ? <p className="text-sm text-os-muted-paper">{english ? 'Showing loaded journals. Filters and totals are available after the full directory loads.' : '暂时显示已加载的期刊；完整目录加载后可筛选并查看总数。'}</p> : null}
    <ul data-journal-entries className={styles.entries}>{results.slice((current - 1) * 20, current * 20).map((journal) => <JournalEntry journal={journal} key={journal.id} />)}</ul>
    {!loading && !error && pages > 1 ? <nav aria-label={english ? 'Journal pages' : '期刊分页'} className="my-6 flex items-center gap-4"><button className={control} disabled={current === 1} onClick={() => setPage(current - 1)}>{english ? 'Previous' : '上一页'}</button><span>{current} / {pages}</span><button className={control} disabled={current === pages} onClick={() => setPage(current + 1)}>{english ? 'Next' : '下一页'}</button></nav> : null}
    <details className={styles.dataResources}><summary>{t('dataResources')}</summary><p data-journal-resources className={styles.resources}><a href="/journals-openapi.json">{t('openapi')}</a><a href="/journals/sitemap.xml">{t('sitemap')}</a></p></details>
  </section>;
}
