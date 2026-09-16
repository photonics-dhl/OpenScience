import Link from 'next/link';
import * as React from 'react';
import type { JournalDraft } from '@/lib/journal-api';
import { JournalFeedback } from './JournalFeedback';

export interface PublicJournalPackageData {
  articleId?: string;
  metadata: { title: string; doi?: string | null; authors: string[]; publishedDate?: string | null; journalTitle?: string | null; originalUrl: string };
  draft?: JournalDraft | null;
  source?: { kind: string; label: string; url?: string } | null;
  license?: string | null;
  review?: { method?: string; revision?: number } | null;
  journal: { id: string; slug: string; name: string };
  publishedAt?: string | null;
  versionNo: number;
  url: string;
  identity?: string;
}

function Evidence({ value }: { value: { quote: string; locator: string } }) {
  return <p className="mt-2 border-l-2 border-os-rule-paper pl-3 text-sm text-os-muted-paper">证据：{value.quote} <span>（{value.locator}）</span></p>;
}

export function PublicJournalRelease({ value }: { value: PublicJournalPackageData }) {
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'CreativeWork',
    name: `${value.metadata.title} · 期刊衍生解读`,
    url: `https://OpenScience.428312321.xyz${value.url}`,
    datePublished: value.publishedAt,
    author: { '@type': 'Organization', name: value.journal.name },
    isBasedOn: {
      '@type': 'ScholarlyArticle', name: value.metadata.title,
      author: value.metadata.authors.map((name) => ({ '@type': 'Person', name })),
      datePublished: value.metadata.publishedDate,
      ...(value.metadata.doi ? { identifier: `https://doi.org/${value.metadata.doi}`, url: `https://doi.org/${value.metadata.doi}` } : { url: value.metadata.originalUrl }),
    },
  };
  return <section className="mt-8 border-y border-os-rule-paper py-6" aria-label="期刊衍生解读信息" data-journal-derivative="true">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <p className="text-sm text-os-muted-paper">期刊衍生解读 · <Link href={`/journals/${value.journal.slug}`} className="text-os-ink">{value.journal.name}</Link></p>
    <h2 className="mt-3 text-2xl font-normal">原论文与解读版本</h2>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
      <dt>原论文</dt><dd>{value.metadata.title}</dd>
      <dt>原作者</dt><dd>{value.metadata.authors.join('，')}</dd>
      <dt>原刊与日期</dt><dd>{value.metadata.journalTitle || value.journal.name} · {value.metadata.publishedDate || '未提供'}</dd>
      <dt>原文主标识</dt><dd>{value.metadata.doi ? <a href={`https://doi.org/${value.metadata.doi}`}>DOI {value.metadata.doi}</a> : <a href={value.metadata.originalUrl}>稳定原文地址</a>}</dd>
      <dt>衍生版本</dt><dd>OpenScience 固定解读版本 v{value.versionNo} · {value.publishedAt?.slice(0, 10) || '日期未提供'}</dd>
    </dl>
    {value.draft ? <>
      <section className="mt-7"><h2 className="text-xl font-normal">期刊解读摘要</h2><p className="leading-7">{value.draft.summary}</p><p className="text-sm text-os-muted-paper">{value.draft.scope === 'abstract' ? '基于摘要的解读' : '基于获准全文的解读'}</p></section>
      <section className="mt-7"><h2 className="text-xl font-normal">主张与证据</h2><div className="grid gap-4">{value.draft.claims.map((claim, index) => <article className="border border-os-rule-paper p-4" key={`${claim.text}-${index}`}><p className="m-0"><span className="text-sm text-os-muted-paper">{claim.kind} · </span>{claim.text}</p><Evidence value={claim.evidence} /></article>)}</div></section>
      {value.draft.figures.length ? <section className="mt-7"><h2 className="text-xl font-normal">图卡</h2><div className="grid gap-4 sm:grid-cols-2">{value.draft.figures.map((figure, index) => <article className="border border-os-rule-paper p-4" key={`${figure.label}-${index}`}><h3 className="m-0 text-lg font-normal">{figure.label}</h3><p>{figure.purpose}</p><p>{figure.finding}</p><Evidence value={figure.evidence} /></article>)}</div></section> : null}
      {value.draft.faq.length ? <section className="mt-7"><h2 className="text-xl font-normal">常见问题</h2><div className="grid gap-4">{value.draft.faq.map((item, index) => <article key={`${item.question}-${index}`}><h3 className="text-base">{item.question}</h3><p>{item.answer}</p><Evidence value={item.evidence} /></article>)}</div></section> : null}
    </> : null}
    {value.source?.url ? <a className="mt-5 inline-block text-sm text-os-ink" href={value.source.url}>查看原始来源：{value.source.label}</a> : null}
    {value.license ? <p className="mt-2 text-sm text-os-muted-paper">衍生解读许可：{value.license}</p> : null}
    {value.articleId ? <JournalFeedback journalId={value.journal.id} articleId={value.articleId} versionNo={value.versionNo} returnTo={value.url} /> : null}
  </section>;
}
