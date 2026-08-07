import { useTranslations } from 'next-intl';

import { Button } from '../ui/button';
import EvolvingRoSymbol from './evolving-ro-symbol';

type HeroProps = {
  symbolVariant: 'sculptural' | 'interface';
};

export default function Hero({ symbolVariant }: HeroProps) {
  const t = useTranslations('landing');

  return (
    <section className="relative isolate h-screen min-h-[760px] overflow-hidden bg-hero-bg text-hero-text lg:min-h-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_38%,rgba(76,141,255,0.22),transparent_36%),linear-gradient(180deg,rgba(3,6,11,0)_0%,rgba(3,6,11,0.82)_78%,#03060b_100%)]"
      />
      <div className="relative mx-auto grid h-full w-full max-w-7xl items-center gap-7 px-5 pb-16 pt-44 sm:px-6 sm:pt-36 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:pb-32 lg:pt-24">
        <div className="max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-hero-surface/70 px-3 py-1 text-xs text-hero-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary motion-safe:animate-pulse" />
            {t('hero.hermesStatus')}
          </div>
          <h1 className="font-display text-5xl font-black leading-[1.06] text-hero-text sm:text-6xl lg:text-7xl">
            {t('hero.title')}
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-hero-muted sm:text-lg">
            {t('hero.subtitle')}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-w-36 rounded-sm">
              <a href="/#latest">{t('hero.ctaExplore')}</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-w-40 rounded-sm border-hero-muted/35 text-hero-text hover:bg-hero-surface"
            >
              <a href="/login?next=/research-objects/new">{t('hero.ctaCreate')}</a>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[330px] sm:max-w-[640px] lg:mr-[-5vw] lg:max-w-[760px]">
          <EvolvingRoSymbol variant={symbolVariant} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-7xl px-5 sm:px-6">
        <a
          id="latest"
          href="#latest"
          className="block w-fit rounded-sm pb-10 text-sm font-medium text-hero-muted transition-colors hover:text-hero-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-hero-bg"
        >
          {t('latest.title')}
        </a>
      </div>
    </section>
  );
}
