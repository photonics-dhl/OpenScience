'use client';
import Link from 'next/link';
import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { listJournals, type JournalSummary } from '@/lib/journal-api';
import styles from './JournalDirectory.module.css';

function JournalEntry({ journal }: { journal: JournalSummary }) {
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
          <p className={styles.subjects}>{journal.subjects.join(' · ') || '未分类'}</p>
          <h2 lang={journal.nameEn ? 'en' : 'zh'}>{journal.nameEn || journal.nameZh}</h2>
          {journal.nameZh && journal.nameEn ? <p className={styles.translation} lang="zh">{journal.nameZh}</p> : null}
          {excerpt ? <p className={styles.description}>{excerpt}</p> : null}
          <div className={styles.metadata}>
            {journal.pIssn ? <span>ISSN {journal.pIssn}</span> : null}
            {journal.eIssn ? <span>eISSN {journal.eIssn}</span> : null}
            <span data-journal-count>公开论文 {journal.publicArticleCount} 篇</span>
          </div>
        </div>
        <ArrowRight className={styles.arrow} size={20} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function JournalDirectory({ initial = [], initialNextCursor = null }: { initial?: JournalSummary[]; initialNextCursor?: string | null }) {
  const [items, setItems] = React.useState(initial); const [loading, setLoading] = React.useState(!initial.length); const [error, setError] = React.useState(''); const [term, setTerm] = React.useState('');
  const [cursor, setCursor] = React.useState(initialNextCursor);
  const [appliedTerm, setAppliedTerm] = React.useState('');
  const inFlight = React.useRef(false);
  const load = React.useCallback(async (value = '', next?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true); setError('');
    try {
      const page = await listJournals({ query: value, limit: 20, cursor: next });
      setItems((previous) => next ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setAppliedTerm(value);
    } catch (e) { setError(e instanceof Error ? e.message : '暂时无法加载期刊目录。'); }
    finally { inFlight.current = false; setLoading(false); }
  }, []);
  React.useEffect(() => { if (!initial.length) void load(); }, [initial.length, load]);
  return (
    <section data-journal-directory className={styles.directory} aria-label="期刊目录">
      <form
        aria-busy={loading}
        data-hermes-protected="true"
        className={styles.search}
        onSubmit={(event) => { event.preventDefault(); void load(term); }}
      >
        <label className="sr-only" htmlFor="journal-search">搜索期刊</label>
        <input id="journal-search" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="搜索期刊名称、ISSN 或学科" />
        <button disabled={loading} type="submit">搜索</button>
      </form>
      <p data-journal-resources className={styles.resources}>
        <a href="/journals-openapi.json">开放数据 API 规范</a>
        <a href="/journals/sitemap.xml">公开期刊站点地图</a>
      </p>
      <p className={styles.loading} role="status" aria-live="polite">{loading ? '正在加载期刊目录…' : ''}</p>
      {error ? (
        <div className={styles.feedback} role="alert">
          <p>{error}</p>
          <button type="button" disabled={loading} onClick={() => void load(term)}>重试</button>
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <div className={styles.empty} role="status">
          <p>暂未找到符合条件的期刊</p>
          <p>已核验并公开的期刊将显示在这里。</p>
        </div>
      ) : null}
      <ul data-journal-entries className={styles.entries} aria-busy={loading}>
        {items.map((journal) => <JournalEntry journal={journal} key={journal.id} />)}
      </ul>
      {cursor ? <button type="button" disabled={loading} className={styles.more} onClick={() => void load(appliedTerm, cursor)}>加载更多期刊</button> : null}
    </section>
  );
}
