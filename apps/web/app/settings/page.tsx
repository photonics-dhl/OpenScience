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
  ApiClientError,
  getCurrentUser,
  logout,
  type CurrentUser,
} from '@/lib/api';
import { SurfaceState } from '@/components/research/ResearchSurfaceShell';

export default function SettingsPage() {
  const t = useTranslations('productSurfaces');
  const meT = useTranslations('myAccount');
  const locale = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('identity') || query.has('identityError') || ['#identity', '#academic-identity', '#research-profile'].includes(window.location.hash)) {
      router.replace(query.has('identityError') ? '/me?identityError=retry#identity' : !query.has('identity') && window.location.hash === '#research-profile' ? '/me#research-profile' : '/me#identity');
      return;
    }
    void getCurrentUser()
      .then(setUser)
      .catch((cause) => {
        if (cause instanceof ApiClientError && cause.status === 401) router.replace('/auth/login?returnTo=%2Fsettings');
        else setError(cause);
      });
  }, [router]);
  async function signOut() { setBusy(true); try { await logout(); router.replace('/auth/login'); } catch (cause) { setError(cause as Error); setBusy(false); } }
  if (error) return <DashboardShell activeRoute="settings" headerActions={<AccountLink user={user} />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} /></DashboardShell>;
  if (!user) return <DashboardShell activeRoute="settings" headerActions={<AccountLink user={user} />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={t('state.loadingBody')} kind="loading" title={meT('settingsTitle')} /></DashboardShell>;
  return (
    <DashboardShell className="account-workspace" activeRoute="settings" headerActions={<AccountLink user={user} />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}>
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
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.level')}</dt><dd className="mt-1 text-os-ink">{user.level}</dd></div>
          </dl>
          <Link href="/me#identity" className="mt-4 inline-flex min-h-11 items-center text-os-vermilion-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring">{meT('continueIdentity')}</Link>
        </section>
        <section className="surface-folio-sheet px-5 py-6">
          <h2 className="text-lg font-semibold text-os-ink">{t('settings.preferences')}</h2>
          <div className="mt-5 flex items-center justify-between border-y border-os-rule-paper py-4 text-base"><span className="text-os-muted-paper">{t('settings.language')}</span><LocaleSwitcher locale={locale as 'zh' | 'en'} /></div>
          <MotionPreferenceControl />
          <button data-reading-role="control" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper px-4 text-sm text-os-ink disabled:opacity-40" disabled={busy} onClick={signOut}><LogOut className="h-4 w-4" />{t('settings.signOut')}</button>
        </section>
      </div>
    </DashboardShell>
  );
}
