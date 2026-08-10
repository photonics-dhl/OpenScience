import { PublicReadingSurface } from '../../../components/public/PublicVersionPage';
import { getLatestPublicResearchVersion, PublicServerApiError } from '../../../lib/public-server-api';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/** P1D-9：RO 概览（最新版本，§6.1 稳定 URL）。 */

export async function generateMetadata({ params }: { params: { publicId: string } }): Promise<Metadata> {
  try {
    const res = await getLatestPublicResearchVersion(params.publicId);
    const r = res.research;
    const authors = r.authors.map((a) => a.displayName).join(', ');
    return {
      title: `${r.title} | OpenScience`,
      description: `${r.version.core.problem?.substring(0, 160) ?? ''}`,
      openGraph: {
        title: r.title,
        description: r.version.core.problem?.substring(0, 160) ?? '',
        type: 'article',
        authors: authors ? [authors] : [],
      },
      robots: r.visibility === 'public' ? 'index, follow' : 'noindex, nofollow',
    };
  } catch {
    return {
      title: '未找到 | OpenScience',
      robots: 'noindex',
    };
  }
}

export default async function Page({ params }: { params: { publicId: string } }) {
  try {
    const res = await getLatestPublicResearchVersion(params.publicId);
    const r = res.research;
    return <main className="pub-page-tabbed"><PublicReadingSurface research={r} /></main>;
  } catch (err) {
    if (err instanceof PublicServerApiError && err.status === 404) notFound();
    const t = await getTranslations('public');
    const limited = err instanceof PublicServerApiError && err.status === 429;
    return <main className="pub-page"><h1>{t(limited ? 'rateLimited.title' : 'unavailable.title')}</h1><p>{t(limited ? 'rateLimited.body' : 'unavailable.body')}</p></main>;
  }
}
