import { getLocale, getTranslations } from 'next-intl/server';

import Hero from '@/components/landing/Hero';
import LatestResearch from '@/components/landing/LatestResearch';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function Page() {
  const locale = await getLocale();
  const shell = await getTranslations('shell');

  return (
    <PublicShell
      headerActions={<SiteHeader />}
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
      tone="dark"
    >
      <Hero locale={locale} />
      <LatestResearch />
    </PublicShell>
  );
}
