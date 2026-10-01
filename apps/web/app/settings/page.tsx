'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import Link from 'next/link';
import { AccountLink } from '@/components/navigation/AccountLink';
import { MotionPreferenceControl } from '@/components/settings/MotionPreferenceControl';
import { DashboardShell } from '@/components/shell/DashboardShell';
import {
  logout,
} from '@/lib/api';
import { useSession } from '@/components/auth/SessionProvider';
import { AccountLoadState } from '@/components/settings/AccountLoadState';
import { UsageBalance } from '@/components/settings/UsageBalance';

export default function SettingsPage() {
  const t = useTranslations('productSurfaces');
  const meT = useTranslations('myAccount');
  const actionT = useTranslations('trash');
  const locale = useLocale();
  const router = useRouter();
  const { user, status, refresh } = useSession();
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('identity') || query.has('identityError') || ['#identity', '#academic-identity', '#research-profile'].includes(window.location.hash)) {
      router.replace(query.has('identityError') ? '/me?identityError=retry#identity' : !query.has('identity') && window.location.hash === '#research-profile' ? '/me#research-profile' : '/me#identity');
      return;
    }
    if (status === 'anonymous') router.replace('/auth/login?returnTo=%2Fsettings');
  }, [router, status]);
  async function signOut() { if (busy) return; setBusy(true); setError(null); try { await logout(); router.replace('/auth/login'); } catch (cause) { setError(cause instanceof Error ? cause : new Error(t('state.errorTitle'))); setBusy(false); } }
  if (!user || status !== 'authenticated') return <DashboardShell mainClassName="craft-account" activeRoute="settings" headerActions={<AccountLink user={user} />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><h1 className="text-3xl text-os-ink">{meT('settingsTitle')}</h1><AccountLoadState loading={status === 'loading'} onRetry={() => void refresh(true)} /></DashboardShell>;
  return (
    <DashboardShell mainClassName="craft-account" className="account-workspace" activeRoute="settings" headerActions={<AccountLink user={user} />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}>
      <header className="account-heading">
        <p data-reading-role="caption" className="text-os-vermilion-ink">{t('settings.kicker')}</p>
        <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-normal text-os-ink">{meT('settingsTitle')}</h1>
        <p data-reading-role="body" className="mt-3 text-os-muted-paper">{meT('settingsBody')}</p>
      </header>
      <div className="settings-grid">
        <section className="surface-folio-sheet px-5 py-6">
          <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-os-vermilion-ink" /><h2 className="text-lg font-semibold text-os-ink">{meT('accountTitle')}</h2></div>
          <dl className="mt-6 divide-y divide-os-rule-paper text-base">
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.name')}</dt><dd className="mt-1 text-os-ink">{user.displayName}</dd></div>
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.email')}</dt><dd className="mt-1 text-os-ink">{user.email}</dd></div>
          </dl>
          <Link href="/me#identity" className="mt-4 inline-flex min-h-11 items-center text-os-vermilion-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring">{meT('continueIdentity')}</Link>
        </section>
        <UsageBalance />
        <section className="surface-folio-sheet px-5 py-6">
          <h2 className="text-lg font-semibold text-os-ink">{t('settings.preferences')}</h2>
          <div className="account-preference-row mt-5 border-y border-os-rule-paper py-4 text-base"><span className="text-os-muted-paper">{t('settings.language')}</span><LocaleSwitcher locale={locale as 'zh' | 'en'} /></div>
          <MotionPreferenceControl />
          <div className="account-form-actions mt-6" aria-busy={busy}>
            <button type="button" data-reading-role="control" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper px-4 text-sm text-os-ink disabled:opacity-40" disabled={busy} onClick={signOut}><LogOut className="h-4 w-4" />{busy ? actionT('working') : t('settings.signOut')}</button>
            {busy ? <span role="status">{actionT('working')}</span> : null}
          </div>
          {error ? <p role="alert" className="account-form-error mt-3">{error.message}</p> : null}
        </section>
      </div>
    </DashboardShell>
  );
}
