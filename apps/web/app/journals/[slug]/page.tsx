import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader from '@/components/landing/SiteHeader';
import { getServerPublicJournal, getServerPublicJournalArticles, PublicServerApiError } from '@/lib/public-server-api';

export default async function JournalHome({ params, searchParams }: { params: { slug: string }; searchParams?: { cursor?: string } }) {
  let journal; let page;
  try {
    journal = (await getServerPublicJournal(params.slug)).journal;
    page = await getServerPublicJournalArticles(journal.id, searchParams?.cursor);
  } catch (error) {
    if (error instanceof PublicServerApiError && error.status === 404) notFound();
    throw error;
  }
  const name = journal.nameEn || journal.nameZh;
  return <PublicShell tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />}>
    <article className="mx-auto max-w-[78rem] break-words px-5 py-10 sm:px-8">
      <p className="text-sm text-os-muted-paper">{journal.subjects.join(' · ')}</p>
      <div className="mt-4 border-b border-os-rule-paper pb-8">
        <p className="text-sm text-os-vermilion-ink">{journal.status === 'reverification' ? '编辑部身份复核中' : '编辑部身份已核验'}</p>
        <h1 className="font-reading text-5xl font-normal tracking-[-.04em]">{name}</h1>
        {journal.nameZh && journal.nameEn ? <p className="text-xl text-os-muted-paper">{journal.nameZh}</p> : null}
        <p className="mt-3 text-sm text-os-muted-paper">{journal.publisherName} · ISSN：{[journal.pIssn, journal.eIssn].filter(Boolean).join(' / ') || '未提供'}</p>
        {['paused', 'closed'].includes(journal.status) ? <p className="text-sm text-os-muted-paper">该期刊已暂停新增平台服务，既有公开内容按其授权状态保留。</p> : null}
        <p className="mt-5 max-w-3xl leading-7 text-os-muted-paper">{journal.description}</p>
        {journal.websiteUrl ? <a className="mt-4 inline-block text-sm text-os-ink" href={journal.websiteUrl} rel="noreferrer">访问期刊官网</a> : null}
      </div>
      <section className="mt-8">
        <h2 className="text-2xl font-normal">论文</h2>
        {!page.items.length ? <p className="py-8 text-os-muted-paper">当前页暂无公开论文目录。</p> : <div className="divide-y divide-os-rule-paper">{page.items.map((article) => <div className="py-5" key={article.id}>
          <p className="m-0 text-sm text-os-muted-paper">{article.metadata.publishedDate ?? '出版日期待补充'}</p>
          <h3 className="my-2 text-xl font-normal">{article.metadata.title}</h3>
          <p className="text-sm text-os-muted-paper">{article.metadata.authors.join('，')}</p>
          {article.contentState !== 'active' ? <p className="text-sm text-os-vermilion-ink">平台解读{article.contentState === 'withdrawn' ? '已撤回' : '已限制公开'}</p> : null}
          <div className="flex flex-wrap gap-4"><a className="text-sm text-os-ink" href={article.metadata.originalUrl}>查看原文{article.metadata.doi ? ` · DOI ${article.metadata.doi}` : ''} →</a>
            {article.releases[0] ? <Link className="text-sm text-os-ink" href={article.releases[0].url}>阅读固定解读版本 →</Link> : null}</div>
        </div>)}</div>}
        <nav aria-label="论文分页" className="mt-6 flex gap-5 text-sm">
          {searchParams?.cursor ? <Link href={`/journals/${journal.slug}`}>返回第一页</Link> : null}
          {page.nextCursor ? <Link href={`/journals/${journal.slug}?cursor=${encodeURIComponent(page.nextCursor)}`}>下一页论文 →</Link> : null}
        </nav>
      </section>
    </article>
  </PublicShell>;
}
