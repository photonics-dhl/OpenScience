'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/auth/SessionProvider';

export function JournalAdminLink({ className, active = false }: { className?: string; active?: boolean }) {
  const { status, user } = useSession();
  const t = useTranslations('journalAdmin');
  if (status !== 'authenticated' || user?.platformRole !== 'platform_admin') return null;
  return <Link href="/admin/journals" prefetch={false} aria-current={active ? 'page' : undefined} className={className}>{t('navigation')}</Link>;
}
