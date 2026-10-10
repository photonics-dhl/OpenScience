import { getLocale } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { ResearchGuide } from '@/components/guide/ResearchGuide';
import { guidePageCopy } from '@/lib/guide-page-copy';

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: `${guidePageCopy[locale === 'en' ? 'en' : 'zh'].pageName} | OpenScience` };
}

export default async function GuidePage() {
  const locale = await getLocale();
  const t = guidePageCopy[locale === 'en' ? 'en' : 'zh'];
  return <PublicShell tone="paper" includeHermesDock={false} headerActions={<SiteHeader active="guide" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />} navigationLabel={t.pageName} skipLabel={t.pageName} wrapHeaderActionsOnMobile>
    <ResearchGuide />
  </PublicShell>;
}
