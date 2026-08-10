import { useTranslations } from 'next-intl';

import { OpticalHeadline } from '@/components/brand/OpticalHeadline';

interface HeroProps {
  locale: string;
}

export default function Hero({ locale }: HeroProps) {
  const t = useTranslations('landing');

  return (
    <section
      className="relative min-h-[calc(100svh-3.5rem)] overflow-hidden border-b border-os-rule-dark px-4 pb-8 pt-10 sm:px-6 lg:px-8 lg:pb-10 lg:pt-12"
      data-landing-art-direction="optical-editorial-v3"
      data-landing-module="hero"
    >
      <div className="mx-auto flex min-h-[calc(100svh-7.5rem)] max-w-[112rem] flex-col">
        <div className="flex items-center justify-between gap-6 border-b border-os-rule-dark pb-3 font-data text-[10px] uppercase tracking-[0.18em] text-os-muted-dark sm:text-xs">
          <span>{t('hero.kicker')}</span>
          <span>{t('hero.context')}</span>
        </div>

        <div className="flex flex-1 items-center py-10 sm:py-12">
          <div className="w-full"><OpticalHeadline locale={locale} /></div>
        </div>

        <div className="relative z-10 grid gap-7 border-t border-os-rule-dark pt-5 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(26rem,1.28fr)] lg:items-end">
          <p className="m-0 max-w-xl text-sm leading-6 text-os-muted-dark sm:text-base sm:leading-7">
            {t('hero.subtitle')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-8">
            <a className="group inline-flex min-h-12 items-center justify-between gap-8 border-b border-os-vermilion pb-1 font-semibold text-os-paper no-underline transition-colors hover:text-os-vermilion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:col-start-2" data-hero-action="primary" href="/explore">
              {t('hero.ctaExplore')} <span aria-hidden="true">→</span>
            </a>
            <a className="group inline-flex min-h-12 items-center justify-between gap-8 border-b border-os-rule-dark pb-1 font-semibold text-os-muted-dark no-underline transition-colors hover:border-os-paper hover:text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:col-start-1 sm:row-start-1" data-hero-action="secondary" href="/research-objects/new">
              {t('hero.ctaCreate')} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <a className="mx-auto mt-5 inline-flex min-h-10 items-center font-data text-[10px] uppercase tracking-[0.18em] text-os-muted-dark no-underline hover:text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" href="#open-ro">
          Open RO <span aria-hidden="true" className="ml-3">↓</span>
        </a>
      </div>
    </section>
  );
}
