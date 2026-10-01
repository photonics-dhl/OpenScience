'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Slow reads remain unknown; the user can retry or leave without losing a draft. */
export function AccountLoadState({ loading, onRetry }: { loading: boolean; onRetry(): void }) {
  const t = useTranslations('myAccount');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return <div className="py-4" aria-live="polite">
    <p role={loading ? 'status' : 'alert'} className="text-sm text-os-muted-paper">{t(loading ? slow ? 'slowLoad' : 'loading' : 'loadFailed')}</p>
    {!loading || slow ? <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="ghost" onClick={onRetry}>{t('reload')}</Button>
      <Link className="inline-flex min-h-11 items-center text-sm text-os-vermilion-ink underline" href="/dashboard">{t('backToDesk')}</Link>
    </div> : null}
  </div>;
}
