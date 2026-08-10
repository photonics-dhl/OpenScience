import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { OpticalHeadline } from '@/components/brand/OpticalHeadline';

import HeroLoopMedia from './HeroLoopMedia';

interface HeroProps {
  locale: string;
}

export default function Hero({ locale }: HeroProps) {
  const t = useTranslations('landing');

  return (
    <section className="relative isolate min-h-[calc(100dvh-3.5rem)] overflow-hidden border-b border-os-rule-dark bg-os-black-0" data-landing-module="hero">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[url('/hero/hero-ambient.webp')] bg-cover bg-center opacity-90" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,6,11,.92)_0%,rgba(3,6,11,.76)_38%,rgba(3,6,11,.12)_72%),linear-gradient(180deg,rgba(3,6,11,0)_62%,#03060b_100%)]" />

      <div aria-hidden="true" className="landing-symbol-in pointer-events-none absolute right-[-12%] top-1/2 z-0 hidden -translate-y-1/2 lg:block">
        <div className="hero-symbol-breathe relative aspect-square h-[min(104vh,1120px)] mix-blend-screen [mask-image:radial-gradient(circle,black_58%,transparent_86%)]">
          <HeroLoopMedia />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[112rem] flex-col justify-center px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pb-16 lg:pt-20">
        <div className="mb-9 flex items-center justify-between gap-6 border-b border-os-rule-dark pb-3 font-data text-[10px] uppercase tracking-[0.22em] text-os-muted-dark sm:text-xs lg:max-w-[58rem]">
          <span>{t('hero.kicker')}</span>
          <span>{t('hero.context')}</span>
        </div>

        <div className="max-w-[58rem]">
          <OpticalHeadline locale={locale} variant="sculptural" />
        </div>

        <div aria-hidden="true" className="landing-symbol-in pointer-events-none relative mx-auto my-6 aspect-square w-64 mix-blend-screen [mask-image:radial-gradient(circle,black_58%,transparent_86%)] sm:w-80 lg:hidden">
          <Image src="/hero/ro-loop-poster.webp" alt="" fill sizes="80vw" className="object-contain" />
        </div>

        <div className="relative z-10 mt-8 grid gap-7 border-t border-os-rule-dark pt-6 lg:max-w-[58rem] lg:grid-cols-[minmax(18rem,0.82fr)_minmax(24rem,1.18fr)] lg:items-end">
          <p className="m-0 max-w-xl text-base leading-7 text-os-muted-dark sm:text-lg">
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

        <dl className="relative z-10 mt-8 grid border-t border-os-rule-dark font-data text-[10px] uppercase tracking-[0.16em] text-os-muted-dark sm:grid-cols-3 sm:text-xs lg:max-w-[58rem]">
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
