import { ShieldCheck, BadgeCheck, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const icons = [BadgeCheck, ShieldCheck, Waypoints] as const;

export default function TrustBand() {
  const t = useTranslations('landing');

  return (
    <section
      id="trust"
      data-landing-module="trust"
      className="border-t border-white/6 bg-hero-bg px-5 py-16 text-hero-text sm:px-6 lg:py-24"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="max-w-xl">
          <h2 className="font-display text-4xl font-semibold leading-tight text-hero-text sm:text-5xl">
            {t('trust.title')}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-8 text-hero-muted">
            {t('trust.subtitle')}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {['one', 'two', 'three'].map((key, index) => {
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
                    {t(`trust.pillars.${key}`)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-0 text-sm leading-7 text-hero-muted">
                  {t(`trust.descriptions.${key}`)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
