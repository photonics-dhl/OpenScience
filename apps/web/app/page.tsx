import { getLocale, getTranslations } from 'next-intl/server';

import EvolutionPanel from '@/components/landing/EvolutionPanel';
import HermesBand from '@/components/landing/HermesBand';
import Hero from '@/components/landing/Hero';
import InView from '@/components/landing/in-view';
import LatestResearch from '@/components/landing/LatestResearch';
import SiteHeader from '@/components/landing/SiteHeader';
import TrustBand from '@/components/landing/TrustBand';
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
      <InView>
        <LatestResearch />
      </InView>
      <InView>
        <EvolutionPanel />
      </InView>
      <InView>
        <HermesBand />
      </InView>
      <InView>
        <TrustBand />
      </InView>
    </PublicShell>
  );
}
