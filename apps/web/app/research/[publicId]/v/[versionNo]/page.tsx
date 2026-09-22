import { withoutInternalSourceMarkers } from '@/components/content/ScientificText';
import { PublicReadingSurface } from '../../../../../components/public/PublicVersionPage';
import { getServerPublicResearchVersion, PublicServerApiError } from '../../../../../lib/public-server-api';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { PublicJournalRelease, type PublicJournalPackageData } from '@/components/journals/PublicJournalRelease';

/** P1D-9：公开版本页（§6.1 /research/OSR-YYYY-NNNNNN/v/N，SSR 可索引 §4.3）。 */

export async function generateMetadata({ params }: { params: { publicId: string; versionNo: string } }): Promise<Metadata> {
  const versionNo = Number(params.versionNo);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return { title: '无效版本号 | OpenScience', robots: 'noindex' };
  }
  try {
    const res = await getServerPublicResearchVersion(params.publicId, versionNo);
    const r = res.research;
    const journalPackage = (r as typeof r & { journalPackage?: PublicJournalPackageData }).journalPackage;
    const authors = journalPackage?.metadata.authors.join(', ') || r.authors.map((a) => a.displayName).join(', ');
    const pageTitle = journalPackage ? `${journalPackage.metadata.title} · 期刊衍生解读 v${r.version.versionNo}` : `${r.title} v${r.version.versionNo}`;
    const description = withoutInternalSourceMarkers(journalPackage?.draft?.summary ?? r.version.core.problem ?? '').substring(0, 160);
    return {
      title: `${pageTitle} | OpenScience`,
      description,
      alternates: { canonical: r.url, types: { 'application/json': `/api/research/${encodeURIComponent(r.publicId)}/v/${r.version.versionNo}` } },
      openGraph: {
        title: pageTitle,
        description,
        type: 'article',
        authors: authors ? [authors] : [],
        publishedTime: r.version.publishedAt ?? undefined,
      },
      robots: r.visibility === 'public' ? 'index, follow' : 'noindex, nofollow',
    };
  } catch {
    return { title: '未找到 | OpenScience', robots: 'noindex' };
  }
}

export default async function Page({ params }: { params: { publicId: string; versionNo: string } }) {
  const versionNo = Number(params.versionNo);
  const t = await getTranslations('public');
  const shell = await getTranslations('shell');
  const publicShell = (children: React.ReactNode, mainClassName?: string) => (
    <PublicShell
      headerActions={<SiteHeader context="public-product" tone="paper" />}
      mainClassName={mainClassName}
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
      tone="paper"
      wrapHeaderActionsOnMobile
    >
      {children}
    </PublicShell>
  );
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return publicShell(<h1>{t('invalidVersion')}</h1>, 'pub-page');
  }
  let result;
  try {
    result = await getServerPublicResearchVersion(params.publicId, versionNo);
  } catch (err) {
    if (err instanceof PublicServerApiError && err.status === 404) notFound();
    const limited = err instanceof PublicServerApiError && err.status === 429;
    return publicShell(<><h1>{t(limited ? 'rateLimited.title' : 'unavailable.title')}</h1><p>{t(limited ? 'rateLimited.body' : 'unavailable.body')}</p></>, 'pub-page');
  }
  // Keep corrected legacy URLs temporary: a later real v10 must remain usable.
  if (result.research.version.versionNo !== versionNo) redirect(result.research.url);
  const journalPackage = (result.research as typeof result.research & { journalPackage?: PublicJournalPackageData }).journalPackage;
  return publicShell(<div className="pub-page-tabbed min-w-0 max-w-full">{journalPackage ? <PublicJournalRelease value={journalPackage} /> : <PublicReadingSurface research={result.research} />}</div>, 'min-w-0 max-w-full');
}
