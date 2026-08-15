'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import { getExploreIndex, type ResearchIndexPageApi } from '@/lib/api';

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

  async function load(cursor?: string, append = false) {
    setLoading(true);
    setError('');
    try {
      const result = await getExploreIndex({ query: query.trim() || undefined, field: field || undefined, artifactType: artifactType || undefined, cursor, limit: 20 });
      setPage((current) => ({ items: append ? [...current.items, ...result.items] : result.items, nextCursor: result.nextCursor }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPage === undefined) void load();
    // Initial public fetch only; subsequent requests are explicit form actions.
  }, []);

  return (
    <section className="border-t border-os-rule-paper" aria-label={t('indexLabel')}>
      <form className="grid gap-3 border-b border-os-rule-paper py-5 lg:grid-cols-[minmax(18rem,1fr)_13rem_13rem_auto]" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label className="border-b border-os-rule-paper pb-2">
          <span className="sr-only">{t('search')}</span>
          <input className="w-full appearance-none border-0 bg-transparent p-0 text-sm text-os-ink shadow-none outline-none placeholder:text-os-muted-paper" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
        </label>
        <label className="border-b border-os-rule-paper pb-2">
          <span className="sr-only">{t('field')}</span>
          <span className="relative block">
            <select className="w-full appearance-none border-0 bg-transparent p-0 pr-7 text-sm text-os-ink shadow-none outline-none" value={field} onChange={(event) => setField(event.target.value)}>
              {FIELDS.map((value) => <option key={value} value={value}>{value ? t(`fields.${value}`) : t('allFields')}</option>)}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-data text-[0.65rem] text-os-vermilion">↓</span>
          </span>
        </label>
        <label className="border-b border-os-rule-paper pb-2">
          <span className="sr-only">{t('artifactType')}</span>
          <span className="relative block">
            <select className="w-full appearance-none border-0 bg-transparent p-0 pr-7 text-sm text-os-ink shadow-none outline-none" value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>
              {ARTIFACT_TYPES.map((value) => <option key={value} value={value}>{value ? t(`artifacts.${value}`) : t('allArtifacts')}</option>)}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-data text-[0.65rem] text-os-vermilion">↓</span>
          </span>
        </label>
        <button className="min-h-11 rounded-panel bg-os-ink px-5 text-sm font-semibold text-os-paper active:translate-y-px motion-reduce:transform-none" type="submit">{t('apply')}</button>
      </form>

      {error ? <p className="border-b border-os-rule-paper py-6 text-sm text-os-vermilion" role="alert">{error}</p> : null}
      {loading && page.items.length === 0 ? <p className="border-b border-os-rule-paper py-10 text-sm text-os-muted-paper" aria-live="polite">{t('loading')}</p> : null}
      {!loading && page.items.length === 0 && !error ? <p className="border-b border-os-rule-paper py-10 font-editorial text-2xl text-os-ink">{t('empty')}</p> : null}

      {page.items.length > 0 ? (
        <ol className="m-0 list-none p-0">
          {page.items.map((item, index) => (
            <li className="border-b border-os-rule-paper" key={item.publicId}>
              <Link className="group grid gap-4 py-7 no-underline outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion md:grid-cols-[3rem_minmax(0,1fr)_15rem] md:items-start" href={item.url}>
                <span className="font-data text-xs text-os-vermilion">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block font-editorial text-3xl leading-tight text-os-ink group-hover:text-os-vermilion sm:text-4xl">{item.title}</span>
                  {item.insight ? <span className="mt-3 block max-w-3xl text-sm leading-6 text-os-muted-paper">{item.insight}</span> : null}
                  <span className="mt-4 block font-data text-[0.68rem] uppercase tracking-[0.1em] text-os-muted-paper">{item.authors.join(' · ') || t('unknownAuthor')}</span>
                </span>
                <span className="grid gap-2 font-data text-[0.68rem] uppercase tracking-[0.1em] text-os-muted-paper md:text-right">
                  <span>{item.publicId} / v{item.latestVersion}</span>
                  <span>{item.fields.join(' · ')}</span>
                  <span>{item.artifactTypes.join(' · ') || t('noArtifacts')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      {page.nextCursor ? (
        <button className="my-7 border-b border-os-vermilion pb-1 text-sm font-semibold text-os-ink" disabled={loading} type="button" onClick={() => void load(page.nextCursor!, true)}>
          {loading ? t('loading') : t('loadMore')}
        </button>
      ) : null}
    </section>
  );
}
