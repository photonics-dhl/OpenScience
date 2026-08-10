import { useTranslations } from 'next-intl';

export default function LatestResearch() {
  const t = useTranslations('landing');
  const nodes = Array.from({ length: 6 }, (_, index) => t(`openRo.node${index + 1}`));

  return (
    <section className="surface-evidence min-h-[calc(100svh-3.5rem)] px-4 py-12 sm:px-6 lg:px-8 lg:py-16" data-landing-module="open-ro" id="open-ro">
      <div className="mx-auto grid max-w-[112rem] border-y border-os-rule-paper lg:min-h-[calc(100svh-10rem)] lg:grid-cols-[0.9fr_1.1fr]" data-open-ro-index="true">
        <div className="relative flex flex-col justify-between border-b border-os-rule-paper py-8 lg:border-b-0 lg:border-r lg:pr-12">
          <div>
            <p className="m-0 font-data text-[10px] uppercase tracking-[0.2em] text-os-vermilion sm:text-xs">{t('openRo.eyebrow')}</p>
            <h2 className="m-0 mt-6 font-display text-[clamp(5.5rem,13vw,13rem)] font-semibold leading-[0.68] tracking-[-0.085em] text-os-ink">
              OPEN
              <span className="ml-[14%] block font-editorial font-normal italic">RO<span className="text-os-vermilion">.</span></span>
            </h2>
          </div>
          <div className="mt-12 max-w-md border-l border-os-vermilion pl-5 lg:mt-6">
            <p className="m-0 font-editorial text-[clamp(1.8rem,3vw,3.3rem)] leading-[1.02] tracking-[-0.045em] text-os-ink">{t('openRo.title')}</p>
            <p className="mb-0 mt-5 max-w-sm text-sm leading-6 text-os-muted-paper sm:text-base sm:leading-7">{t('openRo.description')}</p>
          </div>
        </div>

        <div className="flex flex-col py-8 lg:pl-12">
          <div className="flex items-center justify-between border-b border-os-rule-paper pb-4 font-data text-[10px] uppercase tracking-[0.16em] text-os-muted-paper sm:text-xs">
            <span>SDF / 06</span>
            <span>{t('openRo.stableId')} · RO-ID</span>
          </div>
          <ol className="m-0 flex-1 list-none p-0">
            {nodes.map((node, index) => (
              <li className="group grid min-h-16 grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-os-rule-paper transition-colors duration-(--motion-focus) hover:bg-black/[0.035] sm:min-h-20 sm:grid-cols-[4.5rem_1fr_auto]" data-sdf-node={`N${index + 1}`} key={node}>
                <span className={`font-data text-sm ${index === 0 ? 'text-os-vermilion' : 'text-os-muted-paper'}`}>0{index + 1}</span>
                <span className="font-editorial text-[clamp(1.35rem,2.3vw,2.5rem)] tracking-[-0.035em] text-os-ink">{node}</span>
                <span aria-hidden="true" className="h-px w-5 origin-right bg-os-ink/35 transition-transform duration-(--motion-focus) group-hover:scale-x-150 sm:w-9" />
              </li>
            ))}
          </ol>
          <a className="mt-8 inline-flex min-h-12 items-center justify-between border-b border-os-ink pb-2 font-semibold text-os-ink no-underline transition-colors hover:border-os-vermilion hover:text-os-vermilion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" href="/explore">
            {t('openRo.action')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
