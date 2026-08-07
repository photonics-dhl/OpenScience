import { useTranslations } from 'next-intl';

// P2 will replace the skeletons with real cards from GET /explore.
// Until then: no fabricated titles, versions, or counts — pure skeleton.
const skeletonCount = 3;

export default function LatestResearch() {
  const t = useTranslations('landing');

  return (
    <section
      id="latest"
      data-landing-module="latest"
      className="relative z-10 -mt-24 bg-hero-bg px-5 pb-16 pt-0 text-hero-text sm:px-6 lg:-mt-28 lg:pb-20"
    >
      <div className="mx-auto w-full max-w-7xl border-t border-white/8 pt-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold leading-tight text-hero-text sm:text-4xl">
            {t('latest.title')}
          </h2>
          <p className="max-w-sm text-sm leading-6 text-hero-muted sm:text-right">
            {t('latest.empty')}
          </p>
        </div>

        <div
          aria-hidden="true"
          className="grid gap-4 lg:grid-cols-3"
          data-latest-skeleton="true"
        >
          {Array.from({ length: skeletonCount }, (_, index) => (
            <div
              key={index}
              className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="h-3 w-24 rounded-full bg-white/12" />
                <div className="h-5 w-10 rounded-full bg-white/8" />
              </div>
              <div className="mb-4 h-28 rounded-[18px] border border-white/6 bg-white/[0.04]" />
              <div className="space-y-2.5">
                <div className="h-3.5 w-3/4 rounded-full bg-white/12" />
                <div className="h-3 w-1/2 rounded-full bg-white/8" />
                <div className="flex gap-2 pt-1">
                  <div className="h-2.5 w-16 rounded-full bg-white/8" />
                  <div className="h-2.5 w-20 rounded-full bg-white/6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
