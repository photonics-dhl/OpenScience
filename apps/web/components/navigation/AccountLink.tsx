'use client';
import * as React from 'react';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/auth/SessionProvider';
import type { CurrentUser } from '@/lib/api';
import { ChevronDown } from 'lucide-react';
import { JournalAdminLink } from '@/components/journals/JournalAdminLink';
import styles from './navigation.module.css';

export function AccountLink({ user, active = false, tone = 'paper' }: { user: CurrentUser | null; active?: boolean; tone?: 'paper' | 'dark' }) {
  const t = useTranslations('myAccount');
  const navigation = useTranslations('productNavigation');
  const session = useSession();
  const visibleUser = !session.managed
    ? user
    : session.status === 'authenticated'
      ? session.user
      : session.status === 'anonymous'
        ? null
        : session.user ?? user;
  if (!visibleUser) return null;

  return <div className={styles.account} data-navigation-tone={tone}>
    <Link href="/me" aria-current={active ? 'page' : undefined} aria-label={t('accountLink', { name: visibleUser.displayName })} className={styles.accountLink} data-account-link="true">
      <span aria-hidden="true" className={styles.avatar}>{Array.from(visibleUser.displayName)[0] || '○'}</span><span className={styles.accountName}>{visibleUser.displayName}</span>
    </Link>
    <details className={styles.accountTools} onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
      <summary aria-label={navigation('accountTools')}><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.accountPanel}><p>{navigation('accountTools')}</p><Link href="/settings" prefetch={false}>{navigation('settings')}</Link><Link href="/journals/manage" prefetch={false}>{navigation('myJournals')}</Link><Link href="/developers">{navigation('developers')}</Link><JournalAdminLink /></div>
    </details>
  </div>;
}
