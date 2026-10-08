'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSession } from '@/components/auth/SessionProvider';
import { AccountLink } from '@/components/navigation/AccountLink';
import { PUBLIC_PRODUCT_ROUTES } from '@/lib/product-navigation';
import styles from '@/components/navigation/navigation.module.css';
interface SiteHeaderProps { active?: 'explore' | 'developers' | 'journals' | 'guide'; context?: 'landing' | 'public-product'; tone?: 'dark' | 'paper'; }
export default function SiteHeader({ active, tone = 'dark' }: SiteHeaderProps) {
  const routeT = useTranslations('productNavigation');
  const routes = [...PUBLIC_PRODUCT_ROUTES.filter((route) => route.id !== 'journals'), ...PUBLIC_PRODUCT_ROUTES.filter((route) => route.id === 'journals')];
  return <div className={styles.publicNavigation} data-navigation-tone={tone} data-mobile-navigation-grid="true">
    <ul className={styles.publicLinks}>{routes.map(({ href, id }) => <li key={id}><Link href={href} aria-current={active === id ? 'page' : undefined} className={styles.publicLink}>{routeT(id)}</Link></li>)}</ul>
  </div>;
}
export function PublicProductAccess({ tone = 'paper' }: { tone?: 'dark' | 'paper' }) {
  const t = useTranslations('landing'); const { status, user } = useSession();
  return <div className={styles.access} data-navigation-tone={tone}><Link href="/dashboard" className={styles.deskLink}>{t('nav.desk')}</Link>{status === 'authenticated' && user ? <AccountLink user={user} tone={tone} /> : status === 'anonymous' ? <Link href="/auth/login" className={styles.publicLink}>{t('nav.login')}</Link> : null}</div>;
}
