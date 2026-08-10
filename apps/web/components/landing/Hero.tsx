import { useTranslations } from 'next-intl';

import { OpticalHeadline } from '@/components/brand/OpticalHeadline';

interface HeroProps {
  locale: string;
}

export default function Hero({ locale }: HeroProps) {
  const t = useTranslations('landing');

  return (
    <section
      className="relative overflow-hidden border-b border-os-rule-dark px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pb-12 lg:pt-20"
      data-landing-art-direction="optical-editorial-v3"
      data-landing-module="hero"
    >
      <div className="mx-auto max-w-[112rem]">
        <div className="mb-10 flex items-center justify-between gap-6 border-b border-os-rule-dark pb-3 font-data text-[10px] uppercase tracking-[0.22em] text-os-muted-dark sm:text-xs">
          <span>{t('hero.kicker')}</span>
          <span>{t('hero.context')}</span>
        </div>

        <OpticalHeadline locale={locale} />

        <div className="relative z-10 mt-12 grid gap-9 border-t border-os-rule-dark pt-7 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(26rem,1.28fr)] lg:items-end">
          <p className="m-0 max-w-xl text-base leading-7 text-os-muted-dark sm:text-lg sm:leading-8">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
            <a className="inline-flex min-h-12 items-center justify-between gap-8 rounded-panel bg-os-vermilion px-5 font-semibold text-os-black-0 transition-transform duration-(--motion-focus) active:translate-y-px motion-reduce:transform-none" href="/research-objects/new">
              {t('hero.ctaCreate')} <span aria-hidden="true">↗</span>
            </a>
            <a className="inline-flex min-h-12 items-center justify-between gap-8 rounded-panel border border-os-rule-dark px-5 font-semibold text-os-paper transition-colors hover:border-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" href="/explore">
              {t('hero.ctaExplore')} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <dl className="relative z-10 mt-9 grid border-t border-os-rule-dark font-data text-[10px] uppercase tracking-[0.16em] text-os-muted-dark sm:grid-cols-3 sm:text-xs">
          {[t('hero.metaObject'), t('hero.metaStructure'), t('hero.metaVersion')].map((label, index) => (
            <div className="flex items-center gap-4 border-b border-os-rule-dark py-3 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0" key={label}>
              <dt className="text-os-paper">0{index + 1}</dt>
              <dd className="m-0">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
