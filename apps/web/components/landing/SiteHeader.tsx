'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSession } from '@/components/auth/SessionProvider';
import { AccountLink } from '@/components/navigation/AccountLink';
import { JournalAdminLink } from '@/components/journals/JournalAdminLink';
import { cn } from '@/lib/utils';
import { LANDING_PRODUCT_ROUTES, PUBLIC_PRODUCT_ROUTES } from '@/lib/product-navigation';
import styles from '@/components/navigation/navigation.module.css';
interface SiteHeaderProps { active?: 'explore' | 'developers' | 'journals' | 'guide'; context?: 'landing' | 'public-product'; tone?: 'dark' | 'paper'; }
export default function SiteHeader({ active, context = 'landing', tone = 'dark' }: SiteHeaderProps) {
  return context === 'landing' ? <LandingHeader active={active} tone={tone} /> : <PublicProductHeader active={active} tone={tone} />;
}
function PublicProductHeader({ active, tone = 'paper' }: Omit<SiteHeaderProps, 'context'>) {
  const routeT = useTranslations('productNavigation');
  return <div className={styles.publicNavigation} data-navigation-tone={tone} data-mobile-navigation-grid="true">
    <ul className={styles.publicLinks}>{PUBLIC_PRODUCT_ROUTES.map(({ href, id }) => <li key={id}><Link href={href} aria-current={active === id ? 'page' : undefined} className={styles.publicLink}>{routeT(id)}</Link></li>)}</ul>
  </div>;
}

export function PublicProductAccess({ tone = 'paper' }: { tone?: 'dark' | 'paper' }) {
  const t = useTranslations('landing'); const { status, user } = useSession();
  return <div className={styles.access} data-navigation-tone={tone}><Link href="/dashboard" className={styles.deskLink}>{t('nav.desk')}</Link>{status === 'authenticated' && user ? <AccountLink user={user} tone={tone} /> : status === 'anonymous' ? <Link href="/auth/login" className={styles.publicLink}>{t('nav.login')}</Link> : null}</div>;
}

function LandingHeader({ active, tone = 'dark' }: Omit<SiteHeaderProps, 'context'>) {
  const t = useTranslations('landing'); const routeT = useTranslations('productNavigation'); const { status, user } = useSession();
  const authenticated = status === 'authenticated' && user;
  const accountHref = authenticated ? '/dashboard' : status === 'anonymous' ? '/auth/login' : '/dashboard';
  const accountLabel = authenticated ? t('nav.desk') : status === 'anonymous' ? t('nav.login') : t('nav.desk');
  const linkClassName = cn('inline-flex items-center px-2 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-3', 'min-h-10', tone === 'dark' ? 'text-os-muted-dark hover:text-os-paper' : 'text-os-muted-paper hover:text-os-ink');
  return <div className="items-center gap-1 sm:gap-3 flex flex-wrap" data-navigation-tone={tone}>
    {LANDING_PRODUCT_ROUTES.map(({href,id}) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined} data-reading-role="control" className={linkClassName}>{routeT(id)}</Link>)}
    <Link href="/developers" aria-current={active === 'developers' ? 'page' : undefined} aria-label={t('nav.developersLabel')} data-reading-role="control" className={cn(linkClassName, 'max-[359px]:inline-flex')}>{t('nav.developers')}</Link>
    <JournalAdminLink className={cn(linkClassName, 'max-[359px]:inline-flex font-semibold')} />
    <Link data-reading-role="control" href={accountHref} className={cn('inline-flex items-center rounded-panel border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-4', 'min-h-10', tone === 'dark' ? 'border-os-rule-dark text-os-paper hover:border-os-paper' : 'border-os-rule-paper text-os-ink hover:border-os-ink')}>{accountLabel}</Link>
  </div>;
}
