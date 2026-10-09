'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/auth/SessionProvider';
import { AccountLink } from './AccountLink';
import styles from './navigation.module.css';

export function ProductHeaderActions({ tone = 'paper', existingActions }: {
  tone?: 'paper' | 'dark'; existingActions?: ReactNode;
}) {
  const t = useTranslations('productNavigation');
  const { status, user } = useSession();
  return <div className={styles.access} data-navigation-tone={tone}>
    <Link href="/guide" className={styles.deskLink}>{t('uploadCreate')}</Link>
    {status === 'authenticated' && user
      ? existingActions ?? <AccountLink user={user} tone={tone} />
      : <><Link href="/auth/login" className={styles.publicLink}>{t('loginRegister')}</Link>{existingActions}</>}
  </div>;
}
