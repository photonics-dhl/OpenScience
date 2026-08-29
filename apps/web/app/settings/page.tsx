'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { ResearchProfileFields } from '@/components/auth/ResearchProfileFields';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { EvidenceReadingPreferenceControl } from '@/components/settings/EvidenceReadingPreferenceControl';
import { Button } from '@/components/ui/button';
import {
  ApiClientError,
  correctResearchInterestSignal,
  getCurrentUser,
  getReadingPreference,
  getResearchIdentity,
  logout,
  updateReadingPreference,
  updateResearchIdentity,
  type CurrentUser,
  type ReadingPreference,
  type ResearchIdentityProfile,
} from '@/lib/api';
import { SurfaceState } from '@/components/research/ResearchSurfaceShell';
import { writeLocalEvidenceDefaultCollapsed } from '@/lib/evidence-reading-preference';

export default function SettingsPage() {
  const t = useTranslations('productSurfaces');
  const identityT = useTranslations('researchIdentity');
  const locale = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<ResearchIdentityProfile | null>(null);
  const [readingPreference, setReadingPreference] = useState<ReadingPreference | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeStatus, setWriteStatus] = useState<'idle' | 'saved' | 'conflict'>('idle');
  const [writeError, setWriteError] = useState('');
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceStatus, setPreferenceStatus] = useState<'idle' | 'saved' | 'conflict' | 'error'>('idle');
  useEffect(() => {
    void Promise.all([getCurrentUser(), getResearchIdentity(), getReadingPreference()])
      .then(([nextUser, nextProfile, nextReadingPreference]) => {
        setUser(nextUser);
        setProfile(nextProfile);
        setReadingPreference(nextReadingPreference);
        writeLocalEvidenceDefaultCollapsed(nextReadingPreference.evidenceDefaultCollapsed);
      })
      .catch(setError);
  }, []);
  async function signOut() { setBusy(true); try { await logout(); router.replace('/auth/login'); } catch (cause) { setError(cause as Error); setBusy(false); } }
  async function handleWriteFailure(cause: unknown) {
    if (cause instanceof ApiClientError && cause.code === 'PROFILE_VERSION_CONFLICT') {
      try {
        setProfile(await getResearchIdentity());
        setWriteStatus('conflict');
        return;
      } catch (reloadCause) {
        setError(reloadCause as Error);
        return;
      }
    }
    setWriteError(cause instanceof Error ? cause.message : identityT('writeError'));
  }
  async function saveProfile() {
    if (!profile) return;
    setBusy(true); setWriteStatus('idle'); setWriteError('');
    try {
      setProfile(await updateResearchIdentity({
        expectedProfileVersion: profile.profileVersion,
        identities: profile.identities,
        primaryIdentity: profile.primaryIdentity,
        disciplines: profile.disciplines,
        methods: profile.methods,
        topics: profile.topics,
        languages: profile.languages,
      }));
      setWriteStatus('saved');
    } catch (cause) { await handleWriteFailure(cause); } finally { setBusy(false); }
  }
  async function decideSignal(signal: string, decision: 'accept' | 'reject') {
    if (!profile) return;
    setBusy(true); setWriteStatus('idle'); setWriteError('');
    try {
      setProfile(await correctResearchInterestSignal({ expectedProfileVersion: profile.profileVersion, signal, decision }));
      setWriteStatus('saved');
    } catch (cause) { await handleWriteFailure(cause); } finally { setBusy(false); }
  }
  async function saveReadingPreference(evidenceDefaultCollapsed: boolean) {
    if (!readingPreference) return;
    setPreferenceBusy(true);
    setPreferenceStatus('idle');
    try {
      const next = await updateReadingPreference({ evidenceDefaultCollapsed, expectedVersion: readingPreference.version });
      setReadingPreference(next);
      writeLocalEvidenceDefaultCollapsed(next.evidenceDefaultCollapsed);
      setPreferenceStatus('saved');
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'PREFERENCE_VERSION_CONFLICT') {
        try {
          const current = await getReadingPreference();
          setReadingPreference(current);
          writeLocalEvidenceDefaultCollapsed(current.evidenceDefaultCollapsed);
          setPreferenceStatus('conflict');
        } catch (reloadCause) {
          setError(reloadCause as Error);
        }
      } else {
        setPreferenceStatus('error');
      }
    } finally {
      setPreferenceBusy(false);
    }
  }
  if (error) return <DashboardShell activeRoute="settings" navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} /></DashboardShell>;
  if (!user || !profile || !readingPreference) return <DashboardShell activeRoute="settings" navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={t('state.loadingBody')} kind="loading" title={t('settings.title')} /></DashboardShell>;
  return (
    <DashboardShell activeRoute="settings" navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}>
      <header className="max-w-3xl border-b border-os-rule-paper pb-6">
        <p data-reading-role="caption" className="text-os-vermilion-ink">{t('settings.kicker')}</p>
        <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-normal text-os-ink">{t('settings.title')}</h1>
        <p data-reading-role="body" className="mt-3 text-os-muted-paper">{t('settings.body')}</p>
      </header>
      <div data-reading-role="body" className="mt-8 grid max-w-4xl gap-8 md:grid-cols-2">
        <section className="surface-folio-sheet px-5 py-6">
          <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-os-vermilion-ink" /><h2 className="text-lg font-semibold text-os-ink">{t('settings.identity')}</h2></div>
          <dl className="mt-6 divide-y divide-os-rule-paper text-base">
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.name')}</dt><dd className="mt-1 text-os-ink">{user.displayName}</dd></div>
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.email')}</dt><dd className="mt-1 text-os-ink">{user.email}</dd></div>
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.level')}</dt><dd className="mt-1 text-os-ink">{user.level}</dd></div>
          </dl>
        </section>
        <section className="surface-folio-sheet px-5 py-6">
          <h2 className="text-lg font-semibold text-os-ink">{t('settings.preferences')}</h2>
          <div className="mt-5 flex items-center justify-between border-y border-os-rule-paper py-4 text-base"><span className="text-os-muted-paper">{t('settings.language')}</span><LocaleSwitcher locale={locale as 'zh' | 'en'} /></div>
          <EvidenceReadingPreferenceControl busy={preferenceBusy} checked={readingPreference.evidenceDefaultCollapsed} onChange={(checked) => void saveReadingPreference(checked)} status={preferenceStatus} />
          <button data-reading-role="control" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper px-4 text-sm text-os-ink disabled:opacity-40" disabled={busy} onClick={signOut}><LogOut className="h-4 w-4" />{t('settings.signOut')}</button>
        </section>
        <section className="surface-folio-sheet px-5 py-6 md:col-span-2" data-settings-research-identity="true">
          <ResearchProfileFields value={profile} onChange={(next) => setProfile({ ...profile, ...next })} />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {([
              ['acceptedSignals', identityT('accepted'), 'reject'],
              ['rejectedSignals', identityT('rejected'), 'accept'],
            ] as const).map(([field, label, decision]) => (
              <div key={field}>
                <h3 className="text-sm font-semibold text-os-ink">{label}</h3>
                <ul className="mt-2 grid gap-2 text-sm text-os-muted-paper">
                  {profile[field].map((signal) => (
                    <li key={signal} className="flex items-center justify-between gap-3 border-b border-os-rule-paper py-2">
                      <span>{signal}</span>
                      <button className="text-os-vermilion-ink hover:underline" disabled={busy} onClick={() => void decideSignal(signal, decision)}>
                        {identityT(decision)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4">
            <Button disabled={busy} onClick={() => void saveProfile()}>{busy ? identityT('saving') : identityT('save')}</Button>
            <span aria-live="polite" className="text-sm text-os-muted-paper">
              {writeStatus === 'saved' ? identityT('saved') : writeStatus === 'conflict' ? identityT('conflict') : ''}
            </span>
          </div>
          {writeError ? <p role="alert" className="mt-3 text-sm text-os-vermilion-ink">{writeError}</p> : null}
        </section>
      </div>
    </DashboardShell>
  );
}
