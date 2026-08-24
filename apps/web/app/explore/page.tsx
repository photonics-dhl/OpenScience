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
      <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14" data-explore-index="true">
        <div className="mx-auto max-w-[88rem]">
          <p data-reading-role="caption" className="m-0 border-b border-os-rule-paper pb-3 text-os-muted-paper">
            {t('eyebrow')}
          </p>
          <div className="grid gap-5 border-b border-os-rule-paper py-7 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <h1 className="m-0 max-w-3xl font-reading text-[clamp(2.25rem,5vw,4rem)] font-normal leading-[1.02] tracking-[-0.04em] text-os-ink">
              {t('title')}
            </h1>
            <p className="m-0 max-w-xl text-base leading-7 text-os-muted-paper lg:justify-self-end">{t('description')}</p>
          </div>
          <ResearchIndex />
        </div>
      </section>
    </PublicShell>
  );
}
