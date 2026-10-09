'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PRODUCT_ABOUT_ROUTES, PRODUCT_FEATURE_ROUTES, type PrimaryProductRouteId } from '@/lib/product-navigation';
import styles from './navigation.module.css';
import { NavigationMenu } from './NavigationMenu';
import { ServiceAudienceMenu } from './ServiceAudienceMenu';

export type ProductRouteId = PrimaryProductRouteId | 'dashboard' | 'journals' | 'guide' | 'developers' | 'create' | 'settings' | 'profile' | 'journalAdmin';

export function ProductRouteNavigation({ active, tone = 'paper' }: {
  active?: ProductRouteId; variant?: 'identity' | 'product'; tone?: 'paper' | 'dark';
}) {
  const t = useTranslations('productNavigation');
  const pathname = usePathname();
  return <ul className={styles.primary} data-product-route-navigation="true" data-navigation-tone={tone}>
    <li data-route-item="services"><ServiceAudienceMenu tone={tone} /></li>
    <li data-route-item="features"><NavigationMenu label={t('features')} tone={tone}
      active={pathname === '/me' || pathname.startsWith('/research-objects/new')}
      items={PRODUCT_FEATURE_ROUTES.map(({ href, id }) => ({ href, label: t(id) }))} /></li>
    <li data-route-item="explore"><Link href="/explore" className={styles.primaryLink}
      aria-current={active === 'explore' || pathname.startsWith('/explore') ? 'page' : undefined}
      data-reading-role="control">{t('explore')}</Link></li>
    <li data-route-item="about"><NavigationMenu label={t('about')} tone={tone}
      active={pathname === '/contact' || pathname === '/developers'}
      items={PRODUCT_ABOUT_ROUTES.map(({ href, id }) => ({ href, label: t(id) }))} /></li>
  </ul>;
}
