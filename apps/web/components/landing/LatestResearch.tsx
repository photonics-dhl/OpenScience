import { useTranslations } from 'next-intl';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

const skeletonCards = ['alpha', 'beta', 'gamma'];

export default function LatestResearch() {
  const t = useTranslations('landing');

  return (
    <section className="bg-canvas-bg px-5 py-16 text-ink sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold leading-tight text-ink">
            {t('latest.title')}
          </h2>
          <p className="max-w-sm text-right text-sm leading-6 text-ink/60">
            {t('latest.empty')}
          </p>
        </div>

        {/* P2: replace skeleton cards with GET /explore backed RO cards. */}
        <div className="grid gap-4 md:grid-cols-3">
          {skeletonCards.map((card) => (
            <Card key={card} className="rounded-sm bg-paper-bg">
              <CardHeader className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-28" />
                  <Badge variant="secondary">v--</Badge>
                </div>
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-4/5" />
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                <Skeleton className="h-4 w-3/5" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
