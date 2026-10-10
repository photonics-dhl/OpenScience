import type { Metadata } from 'next';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { AcademicProfileView } from '@/components/profile/AcademicProfileView';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: 'Academic profile | OpenScience' };
export default async function Page({ params }: { params: { userId: string } }) {
  const shell = await getTranslations('shell');
  return <PublicShell tone="paper" includeHermesDock={false} wrapHeaderActionsOnMobile
    headerActions={<SiteHeader context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}
    navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
    <AcademicProfileView userId={params.userId} />
  </PublicShell>;
}
