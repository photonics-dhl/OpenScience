'use client';
import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PRODUCT_PRIMARY_ROUTES, type PrimaryProductRouteId } from '@/lib/product-navigation';
import styles from './navigation.module.css';
import { ServiceAudienceMenu } from './ServiceAudienceMenu';
export type ProductRouteId = PrimaryProductRouteId | 'create' | 'settings' | 'profile' | 'journalAdmin';
export function ProductRouteNavigation({ active, variant = 'product' }: { active?: ProductRouteId; variant?: 'identity' | 'product' }) {
  const t = useTranslations('productNavigation');
  const routes = variant === 'identity' ? PRODUCT_PRIMARY_ROUTES.filter(({ id }) => id === 'explore' || id === 'dashboard') : PRODUCT_PRIMARY_ROUTES;
  return <ul className={styles.primary} data-product-route-navigation="true" data-navigation-variant={variant}>
    <li data-route-item="services"><ServiceAudienceMenu /></li>
    {routes.map(({ href, id }) => <li key={id} data-route-item={id}><Link href={href} className={styles.primaryLink} aria-current={active === id || (active === 'create' && id === 'dashboard') ? 'page' : undefined} data-reading-role="control">{t(id)}</Link></li>)}
  </ul>;
}
