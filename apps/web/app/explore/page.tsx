import { getTranslations } from 'next-intl/server';

import SiteHeader from '@/components/landing/SiteHeader';
import { ResearchIndex } from '@/components/explore/ResearchIndex';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function ExplorePage() {
  const shell = await getTranslations('shell');
  const t = await getTranslations('explore');

  return (
    <PublicShell
      headerActions={<SiteHeader tone="paper" />}
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
      tone="paper"
    >
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24" data-explore-index="true">
        <div className="mx-auto max-w-[112rem]">
          <p className="m-0 border-b border-os-rule-paper pb-3 font-data text-xs uppercase tracking-[0.18em] text-os-muted-paper">
            {t('eyebrow')}
          </p>
          <div className="grid gap-10 border-b border-os-rule-paper py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <h1 className="m-0 max-w-5xl font-editorial text-[clamp(4rem,9vw,10rem)] font-normal leading-[0.84] tracking-[-0.07em] text-os-ink">
              {t('title')}
            </h1>
            <p className="m-0 max-w-xl text-lg leading-8 text-os-muted-paper lg:justify-self-end">{t('description')}</p>
          </div>
          <ResearchIndex />
        </div>
      </section>
    </PublicShell>
  );
}
