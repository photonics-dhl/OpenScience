import { useTranslations } from 'next-intl';

export default function LatestResearch() {
  const t = useTranslations('landing');
  const nodes = Array.from({ length: 6 }, (_, index) => t(`openRo.node${index + 1}`));

  return (
    <section className="surface-evidence min-h-[82svh] px-4 py-12 sm:px-6 lg:px-8 lg:py-16" data-landing-module="open-ro" id="open-ro">
      <div className="mx-auto grid max-w-[112rem] border-y border-os-rule-paper lg:grid-cols-[0.9fr_1.1fr]" data-open-ro-density="calm" data-open-ro-index="true">
        <div className="relative flex flex-col justify-between border-b border-os-rule-paper py-8 lg:border-b-0 lg:border-r lg:pr-12">
          <div>
            <p className="m-0 font-data text-[10px] uppercase tracking-[0.2em] text-os-vermilion sm:text-xs">{t('openRo.eyebrow')}</p>
            <h2 className="m-0 mt-6 font-display text-7xl font-semibold leading-[0.76] text-os-ink sm:text-8xl lg:text-[9rem]">
              OPEN
              <span className="font-editorial-latin ml-[14%] block font-normal italic">RO<span className="text-os-vermilion">.</span></span>
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
              <li className="group grid min-h-16 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-os-rule-paper transition-colors duration-(--motion-focus) hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:min-h-20 sm:grid-cols-[4.5rem_minmax(0,0.7fr)_minmax(12rem,1fr)_auto]" data-sdf-node={`N${index + 1}`} key={node} tabIndex={0}>
                <span className={`font-data text-sm ${index === 0 ? 'text-os-vermilion' : 'text-os-muted-paper'}`}>0{index + 1}</span>
                <span className="font-editorial text-2xl text-os-ink sm:text-3xl lg:text-4xl">{node}</span>
                <span className="hidden max-w-sm translate-x-2 text-sm leading-6 text-os-muted-paper opacity-0 transition-[transform,opacity] duration-(--motion-focus) group-hover:translate-x-0 group-hover:opacity-100 group-focus:translate-x-0 group-focus:opacity-100 sm:block" data-sdf-node-summary="true">
                  {t(`openRo.node${index + 1}Summary`)}
                </span>
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
