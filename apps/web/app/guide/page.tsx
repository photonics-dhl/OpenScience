import { getTranslations } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { ResearchGuide } from '@/components/guide/ResearchGuide';

export default async function GuidePage() {
  const t = await getTranslations('productGuide');
  return <PublicShell tone="paper" headerActions={<SiteHeader active="guide" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />} navigationLabel={t('navigation')} skipLabel={t('skip')} wrapHeaderActionsOnMobile>
    <ResearchGuide />
  </PublicShell>;
}
