import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';

export default async function GuidePage() {
  const t = await getTranslations('productGuide');
  return <PublicShell tone="paper" headerActions={<SiteHeader context="public-product" tone="paper" />} navigationLabel={t('navigation')} skipLabel={t('skip')} wrapHeaderActionsOnMobile>
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <h1 className="text-4xl font-normal text-os-ink">{t('title')}</h1>
      <p className="mt-4 leading-7 text-os-muted-paper">{t('intro')}</p>
      {(['research', 'fields', 'publicId', 'workflow'] as const).map(section => <section key={section} className="mt-8 border-t border-os-rule-paper pt-5"><h2 className="text-xl font-semibold text-os-ink">{t(`${section}.title`)}</h2><p className="mt-3 leading-7 text-os-muted-paper">{t(`${section}.body`)}</p></section>)}
      <div className="mt-8 flex flex-wrap gap-5"><Link href="/dashboard" className="inline-flex min-h-11 items-center text-os-vermilion-ink underline">{t('desk')}</Link></div>
    </article>
  </PublicShell>;
}
