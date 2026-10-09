'use client';
import * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/auth/SessionProvider';
import type { CurrentUser } from '@/lib/api';
import { ChevronDown } from 'lucide-react';
import { JournalAdminLink } from '@/components/journals/JournalAdminLink';
import styles from './navigation.module.css';

export function AccountLink({ user, active = false, tone = 'paper' }: { user: CurrentUser | null; active?: boolean; tone?: 'paper' | 'dark' }) {
  const navigation = useTranslations('productNavigation');
  const session = useSession();
  const pathname = usePathname();
  const tools = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (tools.current?.open && event.target instanceof Node && !tools.current.contains(event.target)) tools.current.open = false;
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, []);
  const visibleUser = !session.managed
    ? user
    : session.status === 'authenticated'
      ? session.user
      : null;
  if (!visibleUser) return null;

  return <div className={styles.account} data-navigation-tone={tone}>
    <Link href="/me" aria-current={active ? 'page' : undefined} aria-label={`${navigation('personalCenter')} · ${visibleUser.displayName}`} className={styles.accountLink} data-account-link="true">
      <span aria-hidden="true" className={styles.avatar}>{Array.from(visibleUser.displayName)[0] || '○'}</span><span className={styles.accountName}>{navigation('personalCenter')}</span>
    </Link>
    <details ref={tools} className={styles.accountTools} onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
      <summary aria-label={navigation('accountTools')}><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.accountPanel}><p>{navigation('accountTools')}</p><Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined}>{navigation('dashboard')}</Link><Link href="/settings" prefetch={false} aria-current={pathname === '/settings' ? 'page' : undefined}>{navigation('settings')}</Link><Link href="/journals/manage" prefetch={false} aria-current={pathname?.startsWith('/journals/manage') ? 'page' : undefined}>{navigation('myJournals')}</Link><Link href="/developers" aria-current={pathname === '/developers' ? 'page' : undefined}>{navigation('developers')}</Link><JournalAdminLink active={pathname?.startsWith('/admin/journals')} /></div>
    </details>
  </div>;
}
