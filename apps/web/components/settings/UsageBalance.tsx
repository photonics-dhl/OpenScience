'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getUsage, type UsageSnapshot } from '@/lib/api';
import { useSession } from '@/components/auth/SessionProvider';
import { AccountLoadState } from './AccountLoadState';

export function UsageBalance() {
  const t = useTranslations('usageBalance');
  const { user, status } = useSession();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ owner: string; snapshot?: UsageSnapshot; failed?: boolean }>();
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    let active = true;
    setResult(undefined);
    void getUsage({ fresh: retry > 0 }).then(snapshot => {
      if (active) setResult({ owner: user.userId, snapshot });
    }).catch(() => { if (active) setResult({ owner: user.userId, failed: true }); });
    return () => { active = false; };
  }, [user?.userId, status, retry]);
  const current = result?.owner === user?.userId ? result : undefined;
  return <section className="surface-folio-sheet px-5 py-6" data-usage-balance="true">
    <h2 className="text-lg font-semibold text-os-ink">{t('title')}</h2>
    {current?.snapshot ? <UsageBalanceDetails snapshot={current.snapshot} /> : <AccountLoadState key={retry} loading={!current?.failed} onRetry={() => setRetry(value => value + 1)} />}
  </section>;
}

export function UsageBalanceDetails({ snapshot }: { snapshot: UsageSnapshot }) {
  const t = useTranslations('usageBalance');
  const credit = Array.isArray(snapshot.user) ? snapshot.user.find(item => item.resource === 'ai_credit') : undefined;
  if (!credit || !Number.isFinite(credit.remaining) || (credit.limit !== null && !Number.isFinite(credit.limit))) return <p className="mt-3 text-sm text-os-muted-paper">{t('unavailable')}</p>;
  const low = credit.limit !== null && credit.limit > 0 && credit.remaining < credit.limit * .1;
  return <>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><dt className="text-sm text-os-muted-paper">{t('remaining')}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-os-ink">{credit.remaining.toLocaleString()} <span className="text-sm font-normal">AI credit</span></dd></div>
      {credit.limit !== null ? <div><dt className="text-sm text-os-muted-paper">{t('monthlyGrant')}</dt><dd className="mt-1 text-xl tabular-nums text-os-ink">{credit.limit.toLocaleString()} <span className="text-sm">AI credit</span></dd></div> : null}
    </dl>
    <p className="mt-4 text-sm leading-6 text-os-muted-paper">{t('explanation')}</p>
    {low ? <p role="status" className="mt-3 text-sm text-os-vermilion-ink" data-low-credit="true">{t('lowCredit')}</p> : null}
  </>;
}
