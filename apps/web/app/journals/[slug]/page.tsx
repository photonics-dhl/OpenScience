import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { JournalShareButton } from '@/components/journals/JournalShareButton';
import { safePublicUrl } from '@/lib/journal-workbench-model';
import { getServerPublicJournal, getServerPublicJournalArticles, PublicServerApiError } from '@/lib/public-server-api';
export default async function JournalHome({ params, searchParams }: { params: { slug: string }; searchParams?: { cursor?: string } }) {
  let journal; let page;
  try { journal = (await getServerPublicJournal(params.slug)).journal; page = await getServerPublicJournalArticles(journal.id, searchParams?.cursor); }
  catch (error) { if (error instanceof PublicServerApiError && error.status === 404) notFound(); throw error; }
  const name = journal.nameEn || journal.nameZh; const official = safePublicUrl(journal.websiteUrl);
  return <PublicShell mainClassName="craft-journal craft-journal-public" tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <article className="mx-auto max-w-[78rem] break-words px-5 py-10 sm:px-8"><Link className="journal-back-link" href="/journals">← 期刊目录</Link>
      <header data-journal-masthead><div><h1 className="font-reading text-5xl font-normal tracking-[-.04em]">{name}</h1>{journal.nameZh && journal.nameEn ? <p className="text-xl text-os-muted-paper">{journal.nameZh}</p> : null}<p className="text-sm text-os-muted-paper">Topics：{journal.subjects.join(' · ') || '未分类'}</p><p className="mt-5 max-w-3xl leading-7 text-os-muted-paper">{journal.description}</p></div>
        <div data-journal-details><p className="mt-3 text-sm text-os-muted-paper">{journal.publisherName}</p><p className="text-sm text-os-muted-paper">ISSN（印刷版）：{journal.pIssn || '未提供'}</p><p className="text-sm text-os-muted-paper">ISSN（电子版）：{journal.eIssn || '未提供'}</p><p className="text-sm text-os-vermilion-ink">{journal.status === 'reverification' ? '编辑部身份复核中' : '编辑部身份已核验'}</p>{['paused', 'closed'].includes(journal.status) ? <p className="text-sm text-os-muted-paper">该期刊已暂停新增平台服务，既有公开内容按其授权状态保留。</p> : null}<div className="mt-4 flex flex-wrap items-center gap-4">{official ? <a className="text-sm text-os-ink" href={official} target="_blank" rel="noopener noreferrer">访问期刊官网</a> : null}<JournalShareButton path={`/journals/${encodeURIComponent(journal.slug)}`} title={name} /></div></div>
      </header>
      <section data-journal-papers className="mt-8"><h2 className="text-2xl font-normal">文章列表</h2>{!page.items.length ? <p className="py-8 text-os-muted-paper">当前页暂无公开论文。</p> : <div className="divide-y divide-os-rule-paper">{page.items.map((article) => {
        const original = safePublicUrl(article.metadata.originalUrl); const release = article.contentState === 'active' ? article.releases[0] : undefined;
        return <div data-journal-paper className="py-5" key={article.id}><p className="m-0 text-sm text-os-muted-paper">{article.metadata.publishedDate ?? '出版日期待补充'}</p><h3 className="my-2 text-xl font-normal">{release ? <Link href={release.url}>{article.metadata.title}</Link> : original ? <a href={original} target="_blank" rel="noopener noreferrer">{article.metadata.title}</a> : article.metadata.title}</h3><p className="text-sm text-os-muted-paper">{article.metadata.authors.join('，')}</p>{article.contentState !== 'active' ? <p className="text-sm text-os-vermilion-ink">平台解读{article.contentState === 'withdrawn' ? '已撤回' : '已限制公开'}</p> : null}<div className="flex flex-wrap gap-4">{release ? <Link className="text-sm text-os-ink" href={release.url}>解析版本 · v{release.versionNo} →</Link> : <span className="text-sm text-os-muted-paper">暂无公开解析版本</span>}{original ? <a className="text-sm text-os-ink" href={original} target="_blank" rel="noopener noreferrer">原文链接{article.metadata.doi ? ` · DOI ${article.metadata.doi}` : ''} →</a> : null}</div></div>;
      })}</div>}<nav aria-label="论文分页" className="mt-6 flex flex-wrap gap-5 text-sm">{searchParams?.cursor ? <Link href={`/journals/${journal.slug}`}>返回第一页</Link> : null}{page.nextCursor ? <Link href={`/journals/${journal.slug}?cursor=${encodeURIComponent(page.nextCursor)}`}>下一页论文 →</Link> : null}</nav></section>
    </article>
  </PublicShell>;
}
