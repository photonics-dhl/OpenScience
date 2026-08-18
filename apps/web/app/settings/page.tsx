'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, getCurrentUser, logout, type CurrentUser } from '@/lib/api';
import { SurfaceState } from '@/components/research/ResearchSurfaceShell';

export default function SettingsPage() {
  const t = useTranslations('productSurfaces');
  const locale = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getCurrentUser().then(setUser).catch(setError); }, []);
  async function signOut() { setBusy(true); try { await logout(); router.replace('/auth/login'); } catch (cause) { setError(cause as Error); setBusy(false); } }
  if (error) return <DashboardShell navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} /></DashboardShell>;
  if (!user) return <DashboardShell navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={t('state.loadingBody')} kind="loading" title={t('settings.title')} /></DashboardShell>;
  return <DashboardShell navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><header className="max-w-3xl"><p data-reading-role="caption" className="font-data uppercase tracking-[0.1em] text-os-vermilion">{t('settings.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('settings.title')}</h1><p data-reading-role="body" className="mt-4 text-base leading-[var(--leading-body)] text-os-muted-dark">{t('settings.body')}</p></header><div data-reading-role="body" className="mt-12 grid max-w-4xl gap-8 border-t border-os-rule-dark pt-8 md:grid-cols-2"><section><div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-os-vermilion" /><h2 className="text-base font-semibold text-os-paper">{t('settings.identity')}</h2></div><dl className="mt-6 space-y-4 text-base"><div><dt className="text-os-muted-dark">{t('settings.name')}</dt><dd className="mt-1 text-os-paper">{user.displayName}</dd></div><div><dt className="text-os-muted-dark">{t('settings.email')}</dt><dd className="mt-1 text-os-paper">{user.email}</dd></div><div><dt className="text-os-muted-dark">{t('settings.level')}</dt><dd className="mt-1 text-os-paper">{user.level}</dd></div></dl></section><section><h2 className="text-base font-semibold text-os-paper">{t('settings.preferences')}</h2><div className="mt-5 flex items-center justify-between border-y border-os-rule-dark py-4 text-base"><span className="text-os-muted-dark">{t('settings.language')}</span><LocaleSwitcher locale={locale as 'zh' | 'en'} /></div><button data-reading-role="control" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-panel border border-os-rule-dark px-4 text-sm text-os-paper disabled:opacity-40" disabled={busy} onClick={signOut}><LogOut className="h-4 w-4" />{t('settings.signOut')}</button></section></div></DashboardShell>;
}
