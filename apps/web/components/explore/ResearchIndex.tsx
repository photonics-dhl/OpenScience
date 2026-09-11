'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { getExploreIndex, type ResearchIndexPageApi } from '@/lib/api';
import { ResearchCard } from './ResearchCard';
import styles from './research-discovery.module.css';

const FIELDS = ['', 'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
const ARTIFACT_TYPES = ['', 'document', 'image', 'data', 'code', 'video', 'other'];

export function ResearchIndex({ initialPage }: { initialPage?: ResearchIndexPageApi }) {
  const t = useTranslations('explore');
  const [page, setPage] = useState<ResearchIndexPageApi>(initialPage ?? { items: [], nextCursor: null });
  const [query, setQuery] = useState('');
  const [field, setField] = useState('');
  const [artifactType, setArtifactType] = useState('');
  const [loading, setLoading] = useState(initialPage === undefined);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const appliedFilters = useRef({ query: '', field: '', artifactType: '' });

  async function load(cursor?: string, append = false) {
    const id = ++requestId.current;
    const filters = append ? appliedFilters.current : { query: query.trim(), field, artifactType };
    setLoading(true);
    setError('');
    try {
      const result = await getExploreIndex({ query: filters.query || undefined, field: filters.field || undefined, artifactType: filters.artifactType || undefined, cursor, limit: 20 });
      if (id !== requestId.current) return;
      appliedFilters.current = filters;
      setPage(current => ({ items: append ? [...current.items, ...result.items.filter(item => !current.items.some(existing => existing.publicId === item.publicId))] : result.items, nextCursor: result.nextCursor }));
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPage === undefined) void load();
    return () => { requestId.current += 1; };
    // Search and pagination are explicit; keep the existing results while loading.
  }, []);

  return <section aria-label={t('indexLabel')} aria-busy={loading}>
    <form onSubmit={event => { event.preventDefault(); void load(); }}>
      <div className={styles.search}>
        <label className="sr-only" htmlFor="research-search">{t('search')}</label>
        <input id="research-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} />
        <button type="submit">{t('searchAction')}</button>
      </div>
      <details className={styles.filters}>
        <summary>{t('refineSearch')}</summary>
        <div className={styles.filterControls}>
          <label>{t('field')}<select value={field} onChange={event => setField(event.target.value)}>{FIELDS.map(value => <option key={value} value={value}>{value ? t(`fields.${value}`) : t('allFields')}</option>)}</select></label>
          <label>{t('artifactType')}<select value={artifactType} onChange={event => setArtifactType(event.target.value)}>{ARTIFACT_TYPES.map(value => <option key={value} value={value}>{value ? t(`artifacts.${value}`) : t('allArtifacts')}</option>)}</select></label>
        </div>
      </details>
    </form>
    <p className={styles.count}>{t('recentFirst')}</p>
    {error ? <p className={styles.feedback} role="alert">{error}</p> : null}
    {loading && !page.items.length ? <p className={styles.feedback} role="status">{t('loading')}</p> : null}
    {!loading && !page.items.length && !error ? <p className={styles.feedback}>{t('empty')}</p> : null}
    <ol className={styles.cards}>{page.items.map(item => <li key={item.publicId}><ResearchCard item={item} prominent={page.items.length === 1} /></li>)}</ol>
    {page.nextCursor ? <button className={styles.loadMore} disabled={loading} type="button" onClick={() => void load(page.nextCursor!, true)}>{loading ? t('loading') : t('loadMore')}</button> : null}
  </section>;
}
