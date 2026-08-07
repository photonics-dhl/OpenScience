import EvolutionPanel from '../components/landing/EvolutionPanel';
import HermesBand from '../components/landing/HermesBand';
import Hero from '../components/landing/Hero';
import LatestResearch from '../components/landing/LatestResearch';
import SiteHeader from '../components/landing/SiteHeader';
import TrustBand from '../components/landing/TrustBand';

type PageProps = {
  searchParams?: { symbol?: string };
};

export default function Page({ searchParams }: PageProps) {
  const symbolVariant = searchParams?.symbol === 'b' ? 'interface' : 'sculptural';

  return (
    <>
      <SiteHeader />
      <main>
        <Hero symbolVariant={symbolVariant} />
        <LatestResearch />
        <EvolutionPanel />
        <HermesBand />
        <TrustBand />
      </main>
    </>
  );
}
