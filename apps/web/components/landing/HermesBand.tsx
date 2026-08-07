import { Search, ShieldCheck, GitMerge } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const icons = [Search, ShieldCheck, GitMerge] as const;

export default function HermesBand() {
  const t = useTranslations('landing');

  return (
    <section
      data-landing-module="hermes"
      className="border-t border-white/6 bg-hero-bg px-5 py-16 text-hero-text sm:px-6 lg:py-24"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold leading-tight text-hero-text sm:text-4xl">
            {t('hermes.title')}
          </h2>
          <p className="mt-4 text-base leading-8 text-hero-muted">
            {t('hermes.subtitle')}
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(['context', 'evidence', 'approval'] as const).map((key, index) => {
            const Icon = icons[index];

            return (
              <Card
                key={key}
                className="rounded-[24px] border-white/8 bg-hero-surface/50 text-hero-text"
              >
                <CardHeader className="space-y-3 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg leading-7 text-hero-text">
                    {t(`hermes.items.${key}.name`)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-0 text-sm leading-7 text-hero-muted">
                  {t(`hermes.items.${key}.desc`)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
