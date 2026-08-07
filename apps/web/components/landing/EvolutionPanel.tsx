'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import EvolvingRoSymbol from './evolving-ro-symbol';

const stages = ['create', 'parse', 'diff', 'publish'] as const;
type Stage = (typeof stages)[number];

export default function EvolutionPanel() {
  const t = useTranslations('landing');
  const [active, setActive] = useState<Stage>('create');
  const [autoDone, setAutoDone] = useState(false);

  // One slow auto pass through the four stages, then stop (v2: no loops, no scroll-jacking).
  useEffect(() => {
    if (autoDone) return undefined;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= stages.length) {
        window.clearInterval(timer);
        setAutoDone(true);
        return;
      }
      setActive(stages[index]);
    }, 2600);

    return () => window.clearInterval(timer);
  }, [autoDone]);

  const select = (stage: Stage) => {
    setAutoDone(true);
    setActive(stage);
  };

  return (
    <section
      data-landing-module="evolution"
      aria-label={t('evolution.title')}
      className="border-t border-white/6 bg-hero-bg px-5 py-16 text-hero-text sm:px-6 lg:py-24"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-semibold leading-tight text-hero-text sm:text-4xl">
            {t('evolution.title')}
          </h2>
          <div
            role="group"
            aria-label={t('evolution.title')}
            className="mt-8 flex snap-x gap-3 overflow-x-auto pb-2 lg:snap-none lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {stages.map((stage, index) => {
              const isActive = stage === active;

              return (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => select(stage)}
                  className={`min-w-56 snap-start rounded-2xl border px-5 py-4 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary lg:min-w-0 ${
                    isActive
                      ? 'border-accent-primary/50 bg-hero-surface/80'
                      : 'border-white/8 bg-transparent hover:border-white/16 hover:bg-hero-surface/40'
                  }`}
                >
                  <span
                    className={`font-mono text-xs tracking-widest ${
                      isActive ? 'text-accent-primary' : 'text-hero-muted/60'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-1 block text-base font-semibold text-hero-text">
                    {t(`evolution.stages.${stage}.name`)}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-hero-muted">
                    {t(`evolution.stages.${stage}.desc`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-[520px]">
          <EvolvingRoSymbol variant="sculptural" stage={active} animated={false} />
        </div>
      </div>
    </section>
  );
}
