'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  tone?: 'dark' | 'paper';
}

export default function SiteHeader({ tone = 'dark' }: SiteHeaderProps) {
  const t = useTranslations('landing');
  const linkClassName = cn(
    'inline-flex min-h-10 items-center px-3 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-[359px]:hidden',
    tone === 'dark' ? 'text-os-muted-dark hover:text-os-paper' : 'text-os-muted-paper hover:text-os-ink',
  );

  return (
    <div className="flex items-center gap-1 sm:gap-3" data-navigation-tone={tone}>
      <a data-reading-role="control" href="/explore" className={linkClassName}>{t('nav.explore')}</a>
      <a data-reading-role="control" href="/research-objects/new" className={linkClassName}>{t('nav.create')}</a>
      <a
        data-reading-role="control"
        href="/auth/login"
        className={cn(
          'inline-flex min-h-10 items-center rounded-panel border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-4',
          tone === 'dark'
            ? 'border-os-rule-dark text-os-paper hover:border-os-paper'
            : 'border-os-rule-paper text-os-ink hover:border-os-ink',
        )}
      >
        {t('nav.login')}
      </a>
    </div>
  );
}
