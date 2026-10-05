import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { getServerPublicPaperByDoi, PublicServerApiError } from '@/lib/public-server-api';
import { getTranslations } from 'next-intl/server';

function doiFrom(params: { doi: string[] }): string { return params.doi.join('/'); }

export async function generateMetadata({ params }: { params: { doi: string[] } }): Promise<Metadata> {
  const t = await getTranslations('paperIdentity');
  try {
    const { paper } = await getServerPublicPaperByDoi(doiFrom(params));
    return { title: `${paper.metadata.title} | OpenScience`, description: t('metaDescription', { doi: paper.doi }),
      alternates: { canonical: `/papers/doi/${paper.doi.split('/').map(encodeURIComponent).join('/')}` } };
  } catch { return { title: `${t('notFound')} | OpenScience`, robots: 'noindex' }; }
}

export default async function PaperPage({ params }: { params: { doi: string[] } }) {
  const t = await getTranslations('paperIdentity');
  let paper;
  try { paper = (await getServerPublicPaperByDoi(doiFrom(params))).paper; }
  catch (error) {
    if (error instanceof PublicServerApiError && error.status === 404) notFound();
    throw error;
  }
  return <PublicShell mainClassName="craft-journal craft-journal-public" tone="paper" skipLabel={t('skip')} navigationLabel={t('navigation')} wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <article className="mx-auto max-w-[78rem] break-words px-5 py-10 sm:px-8">
      <Link className="journal-back-link" href="/journals">← {t('journalDirectory')}</Link>
      <header className="mt-8 max-w-4xl">
        <p className="text-sm text-os-muted-paper">{t('originalPaper')} · DOI {paper.doi}</p>
        <h1 className="font-reading text-4xl font-normal tracking-[-.04em] sm:text-5xl">{paper.metadata.title}</h1>
        {paper.metadata.authors.length ? <p className="mt-4 text-os-muted-paper">{paper.metadata.authors.join('，')}</p> : null}
        <p className="mt-2 text-sm text-os-muted-paper">{[paper.metadata.journalTitle, paper.metadata.publishedDate].filter(Boolean).join(' · ')}</p>
        <a className="mt-4 inline-block text-sm text-os-ink" href={`https://doi.org/${encodeURI(paper.doi)}`} rel="noreferrer">{t('viewOriginal')} ↗</a>
      </header>
      <section className="mt-12 border-t border-os-rule-paper pt-8" aria-labelledby="interpretations-title">
        <h2 id="interpretations-title" className="text-2xl font-normal">{t('interpretations')}</h2>
        <p className="mt-2 text-sm text-os-muted-paper">{t('independent')}</p>
        {!paper.interpretations.length ? <p className="mt-5 text-sm text-os-muted-paper">{t('noInterpretations')}</p> : null}
        <div className="mt-5 divide-y divide-os-rule-paper">{paper.interpretations.map((item) =>
          <article key={`${item.publicId}-${item.versionNo}`} className="py-5">
            <p className="text-sm text-os-muted-paper">{t(item.kind === 'journal_editor' ? 'journalEditor' : 'contributor')}{item.journal ? ` · ${item.journal.name}` : ''} · {t('updated')} {item.publishedAt.slice(0, 10)} · {t('version')} {item.versionNo}</p>
            <h3 className="my-2 text-xl font-normal"><Link href={item.url}>{item.title}</Link></h3>
            <Link className="text-sm text-os-ink" href={item.url}>{t('readVersion')} →</Link>
          </article>)}</div>
        {paper.hasMoreInterpretations ? <p className="mt-4 text-sm text-os-muted-paper">{t('moreAvailable')}</p> : null}
      </section>
    </article>
  </PublicShell>;
}
