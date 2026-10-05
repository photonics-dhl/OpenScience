import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import Hero from '@/components/landing/Hero';
import LatestResearch from '@/components/landing/LatestResearch';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function Page() {
  const locale = await getLocale();
  const shell = await getTranslations('shell');

  return (
    <PublicShell
      headerActions={<SiteHeader context="public-product" tone="dark" />}
      headerUtilities={<PublicProductAccess tone="dark" />}
      includeHermesDock={false}
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
      tone="dark"
      wrapHeaderActionsOnMobile
    >
      <Hero locale={locale} />
      <Suspense fallback={<section className="min-h-72 bg-white" aria-busy="true" />}><LatestResearch /></Suspense>
    </PublicShell>
  );
}
