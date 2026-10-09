'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SERVICE_AUDIENCES } from '@/lib/service-audiences';
import { NavigationMenu } from './NavigationMenu';

export function ServiceAudienceMenu({ tone = 'paper' }: { tone?: 'paper' | 'dark' }) {
  const t = useTranslations('services');
  const pathname = usePathname();
  return <NavigationMenu label={t('navigation')} hint={t('navigationHint')} tone={tone}
    active={pathname.startsWith('/who-we-serve')}
    items={SERVICE_AUDIENCES.map(audience => ({
      href: `/who-we-serve/${audience}`,
      label: t(`audiences.${audience}.name`),
      detail: t(`audiences.${audience}.name`) !== t(`audiences.${audience}.english`) ? t(`audiences.${audience}.english`) : undefined,
    }))} />;
}
