import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return <PublicShell tone="paper" headerActions={<SiteHeader context="public-product" tone="paper" />} navigationLabel={t('navigation')} skipLabel={t('skip')} wrapHeaderActionsOnMobile>
    <div className="mx-auto max-w-3xl px-5 py-20">
      <p className="text-sm text-os-vermilion-ink">404</p>
      <h1 className="mt-4 text-4xl font-normal text-os-ink">{t('title')}</h1>
      <p className="mt-4 text-os-muted-paper">{t('description')}</p>
      <div className="mt-8 flex flex-wrap gap-5"><Link href="/" className="text-os-vermilion-ink underline">{t('home')}</Link><Link href="/explore" className="text-os-vermilion-ink underline">{t('explore')}</Link><Link href="/guide" className="text-os-vermilion-ink underline">{t('guide')}</Link></div>
    </div>
  </PublicShell>;
}
