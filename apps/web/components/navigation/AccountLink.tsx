'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CurrentUser } from '@/lib/api';

export function AccountLink({ user, active = false }: { user: CurrentUser | null; active?: boolean }) {
  const t = useTranslations('myAccount');
  if (!user) return null;
  return (
    <Link href="/me" aria-current={active ? 'page' : undefined} aria-label={t('accountLink', { name: user.displayName })}
      className="no-underline inline-flex min-h-11 max-w-48 items-center gap-2 rounded-control px-2 text-sm text-os-ink transition-colors hover:bg-os-paper-2 hover:text-os-vermilion-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" data-account-link="true">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-os-rule-paper">{Array.from(user.displayName)[0] || '○'}</span>
      <span className="max-w-24 truncate sm:max-w-32">{user.displayName}</span>
    </Link>
  );
}
