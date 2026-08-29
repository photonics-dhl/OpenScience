'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  active?: 'explore';
  context?: 'landing' | 'public-product';
  tone?: 'dark' | 'paper';
}

export default function SiteHeader({ active, context = 'landing', tone = 'dark' }: SiteHeaderProps) {
  const t = useTranslations('landing');
  const linkClassName = cn(
    'inline-flex items-center px-2 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-3',
    context === 'landing' ? 'min-h-10 max-[359px]:hidden' : 'min-h-11',
    tone === 'dark' ? 'text-os-muted-dark hover:text-os-paper' : 'text-os-muted-paper hover:text-os-ink',
  );

  return (
    <div
      className={cn(
        'items-center gap-1 sm:gap-3',
        context === 'public-product' ? 'grid w-full grid-cols-4 sm:flex sm:w-auto sm:min-w-max' : 'flex min-w-max',
      )}
      data-mobile-navigation-grid={context === 'public-product' ? 'true' : undefined}
      data-navigation-tone={tone}
    >
      {context === 'public-product' ? <Link data-reading-role="control" href="/dashboard" className={linkClassName}>{t('nav.desk')}</Link> : null}
      <Link href="/explore" aria-current={active === 'explore' ? 'page' : undefined} data-reading-role="control" className={linkClassName}>{t('nav.explore')}</Link>
      <Link data-reading-role="control" href="/research-objects/new" className={linkClassName}>{t('nav.create')}</Link>
      <Link
        data-reading-role="control"
        href="/auth/login"
        className={cn(
          'inline-flex items-center rounded-panel border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-4',
          context === 'landing' ? 'min-h-10' : 'min-h-11',
          tone === 'dark'
            ? 'border-os-rule-dark text-os-paper hover:border-os-paper'
            : 'border-os-rule-paper text-os-ink hover:border-os-ink',
        )}
      >
        {t('nav.login')}
      </Link>
    </div>
  );
}
