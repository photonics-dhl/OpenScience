'use client';
import Link from 'next/link';
import * as React from 'react';
import { listJournals, type JournalSummary } from '@/lib/journal-api';

export function JournalDirectory({ initial = [], initialNextCursor = null }: { initial?: JournalSummary[]; initialNextCursor?: string | null }) {
  const [items, setItems] = React.useState(initial); const [loading, setLoading] = React.useState(!initial.length); const [error, setError] = React.useState(''); const [term, setTerm] = React.useState('');
  const [cursor, setCursor] = React.useState(initialNextCursor);
  const [appliedTerm, setAppliedTerm] = React.useState('');
  const load = React.useCallback(async (value = '', next?: string) => {
    setLoading(true); setError('');
    try {
      const page = await listJournals({ query: value, limit: 20, cursor: next });
      setItems((previous) => next ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setAppliedTerm(value);
    } catch (e) { setError(e instanceof Error ? e.message : '暂时无法加载期刊目录。'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (!initial.length) void load(); }, [initial.length, load]);
  return <section className="mt-8" aria-label="期刊目录">
    <form className="flex flex-col gap-3 border-b border-os-rule-paper pb-6 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void load(term); }}><label className="sr-only" htmlFor="journal-search">搜索期刊</label><input id="journal-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="搜索期刊名称、ISSN 或学科" className="min-h-11 flex-1 border border-os-rule-paper bg-transparent px-3 text-os-ink" /><button className="min-h-11 bg-accent-primary-strong px-5 text-sm font-semibold text-os-black-0" type="submit">搜索</button></form>
    <p className="flex flex-wrap justify-end gap-4 text-sm"><a href="/journals-openapi.json">开放数据 API 规范</a><a href="/journals/sitemap.xml">公开期刊站点地图</a></p>
    {loading ? <p className="py-10 text-os-muted-paper" aria-live="polite">正在加载期刊目录…</p> : null}
    {error ? <div className="py-10" role="alert"><p>{error}</p><button className="border-b border-os-vermilion-ink" onClick={() => void load(term)}>重试</button></div> : null}
    {!loading && !error && !items.length ? <div className="py-12 text-os-muted-paper"><p className="text-lg text-os-ink">暂未找到符合条件的期刊</p><p>已核验并公开的期刊将显示在这里。</p></div> : null}
    <div className="grid gap-px bg-os-rule-paper sm:grid-cols-2 lg:grid-cols-3">{items.map((journal) => <Link href={`/journals/${journal.slug}`} className="min-h-56 break-words bg-paper-bg p-5 no-underline transition-colors hover:bg-canvas-bg" key={journal.id}><p className="m-0 text-xs text-os-muted-paper">{journal.subjects.join(' · ') || '未分类'}</p><h2 className="mt-5 text-xl font-normal text-os-ink">{journal.nameEn || journal.nameZh}</h2>{journal.nameZh && journal.nameEn ? <p className="text-sm text-os-muted-paper">{journal.nameZh}</p> : null}<p className="mt-6 text-sm text-os-muted-paper">公开论文 {journal.publicArticleCount} 篇</p></Link>)}</div>
    {cursor ? <button disabled={loading} className="mt-6 min-h-11 border border-os-rule-paper px-5 disabled:opacity-50" onClick={() => void load(appliedTerm, cursor)}>加载更多期刊</button> : null}
  </section>;
}
