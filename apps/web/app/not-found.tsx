import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return <PublicShell tone="paper" headerActions={<SiteHeader context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />} navigationLabel={t('navigation')} skipLabel={t('skip')} wrapHeaderActionsOnMobile>
    <section data-product-recovery="not-found">
      <p data-recovery-code>404</p>
      <div>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
        <nav aria-label={t('navigation')}><Link href="/explore">{t('explore')}</Link><Link href="/">{t('home')}</Link><Link href="/guide">{t('guide')}</Link></nav>
      </div>
    </section>
  </PublicShell>;
}
