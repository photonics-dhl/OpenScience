'use client';

import { UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import Link from 'next/link';
import { ResearchProfileFields } from '@/components/auth/ResearchProfileFields';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { AcademicIdentityControl } from '@/components/settings/AcademicIdentityControl';
import { Button } from '@/components/ui/button';
import {
  ApiClientError,
  correctResearchInterestSignal,
  getCurrentUser,
  getResearchIdentity,
  updateResearchIdentity,
  type CurrentUser,
  type ResearchIdentityProfile,
} from '@/lib/api';
import { SurfaceState } from '@/components/research/ResearchSurfaceShell';
import { AccountLink } from '@/components/navigation/AccountLink';
import { MyResearchProjects } from '@/components/profile/MyResearchProjects';

export default function MyProfilePage() {
  const t = useTranslations('productSurfaces');
  const meT = useTranslations('myAccount');
  const identityT = useTranslations('researchIdentity');
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<ResearchIdentityProfile | null>(null);
  const [savedProfile, setSavedProfile] = useState<ResearchIdentityProfile | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeStatus, setWriteStatus] = useState<'idle' | 'saved' | 'conflict' | 'draft-conflict'>('idle');
  const [writeError, setWriteError] = useState('');
  const [callbackFailed, setCallbackFailed] = useState(false);
  useEffect(() => {
    setCallbackFailed(new URLSearchParams(window.location.search).has('identityError'));
    void Promise.all([getCurrentUser(), getResearchIdentity()])
      .then(([nextUser, nextProfile]) => {
        setUser(nextUser);
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
      })
      .catch((cause) => {
        if (cause instanceof ApiClientError && cause.status === 401) router.replace('/auth/login?returnTo=%2Fme');
        else setError(cause);
      });
  }, [router]);
  const profileDirty = !!profile && !!savedProfile && (profile.primaryIdentity !== savedProfile.primaryIdentity
    || (['identities', 'disciplines', 'methods', 'topics', 'languages'] as const).some(field =>
      profile[field].length !== savedProfile[field].length || profile[field].some((value, index) => value !== savedProfile[field][index])));
  async function handleWriteFailure(cause: unknown, attemptedDraft?: ResearchIdentityProfile) {
    if (cause instanceof ApiClientError && cause.code === 'PROFILE_VERSION_CONFLICT') {
      try {
        const latestProfile = await getResearchIdentity();
        const changed = (field: 'identities' | 'disciplines' | 'methods' | 'topics' | 'languages') => !!attemptedDraft && !!savedProfile && (attemptedDraft[field].length !== savedProfile[field].length || attemptedDraft[field].some((value, index) => value !== savedProfile[field][index]));
        const identityChanged = changed('identities') || (!!attemptedDraft && attemptedDraft.primaryIdentity !== savedProfile?.primaryIdentity);
        setProfile(attemptedDraft ? {
          ...latestProfile,
          identities: identityChanged ? attemptedDraft.identities : latestProfile.identities,
          primaryIdentity: identityChanged ? attemptedDraft.primaryIdentity : latestProfile.primaryIdentity,
          disciplines: changed('disciplines') ? attemptedDraft.disciplines : latestProfile.disciplines,
          methods: changed('methods') ? attemptedDraft.methods : latestProfile.methods,
          topics: changed('topics') ? attemptedDraft.topics : latestProfile.topics,
          languages: changed('languages') ? attemptedDraft.languages : latestProfile.languages,
        } : latestProfile);
        setSavedProfile(latestProfile);
        setWriteStatus(attemptedDraft ? 'draft-conflict' : 'conflict');
        return;
      } catch (reloadCause) {
        setError(reloadCause as Error);
        return;
      }
    }
    setWriteError(cause instanceof Error ? cause.message : identityT('writeError'));
  }
  async function saveProfile() {
    if (!profile || busy || !profileDirty || writeStatus === 'draft-conflict') return;
    setBusy(true); setWriteStatus('idle'); setWriteError('');
    try {
      const nextProfile = await updateResearchIdentity({
        expectedProfileVersion: profile.profileVersion,
        identities: profile.identities,
        primaryIdentity: profile.primaryIdentity,
        disciplines: profile.disciplines,
        methods: profile.methods,
        topics: profile.topics,
        languages: profile.languages,
      });
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      setWriteStatus('saved');
    } catch (cause) { await handleWriteFailure(cause, profile); } finally { setBusy(false); }
  }
  async function decideSignal(signal: string, decision: 'accept' | 'reject') {
    if (!profile || busy || profileDirty || writeStatus === 'draft-conflict') return;
    setBusy(true); setWriteStatus('idle'); setWriteError('');
    try {
      const nextProfile = await correctResearchInterestSignal({ expectedProfileVersion: profile.profileVersion, signal, decision });
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      setWriteStatus('saved');
    } catch (cause) { await handleWriteFailure(cause); } finally { setBusy(false); }
  }
  if (error) return <DashboardShell activeRoute="profile" headerActions={<AccountLink user={user} active />} navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} /></DashboardShell>;
  if (!user || !profile) return <DashboardShell activeRoute="profile" navigationLabel={t('settings.navigation')} skipLabel={t('settings.skip')}><SurfaceState detail={t('state.loadingBody')} kind="loading" title={meT('profileTitle')} /></DashboardShell>;
  const completedProfileGroups = [profile.identities.length, profile.disciplines.length, profile.methods.length, profile.topics.length, profile.languages.length].filter(Boolean).length;
  return (
    <DashboardShell className="account-workspace" activeRoute="profile" headerActions={<AccountLink user={user} active />} navigationLabel={meT('profileTitle')} skipLabel={t('settings.skip')}>
      <header className="account-heading">
        <p data-reading-role="caption" className="text-os-vermilion-ink">{meT('privateLabel')}</p>
        <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-normal text-os-ink">{meT('profileTitle')}</h1>
        <p data-reading-role="body" className="mt-3 text-os-muted-paper">{meT('privateBody')}</p>
      </header>
      <div className="account-grid">
        <section className="surface-folio-sheet account-summary px-5 py-6">
          <div aria-hidden="true" className="account-monogram">{Array.from(user.displayName)[0] || "○"}</div>
          <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-os-vermilion-ink" /><h2 className="text-lg font-semibold text-os-ink">{t('settings.identity')}</h2></div>
          <dl className="mt-6 divide-y divide-os-rule-paper text-base">
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.name')}</dt><dd className="mt-1 text-os-ink">{user.displayName}</dd></div>
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{t('settings.level')}</dt><dd className="mt-1 text-os-ink">{user.level}</dd></div>
            <div className="py-3"><dt className="text-sm text-os-muted-paper">{meT('fields')}</dt><dd className="mt-1 break-words text-os-ink">{profile.disciplines.join(' · ') || meT('notProvided')}</dd></div>
          </dl>
          <div className="account-shortcuts"><Link href="#research-profile">{meT('editProfile')}</Link><Link href="#identity">{meT('verifyIdentity')}</Link></div>
          <Link href="/settings" className="mt-4 inline-flex min-h-11 items-center text-os-vermilion-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring">{meT('settingsTitle')}</Link>
        </section>
        <MyResearchProjects />
        <div id="identity" className="account-identity">
          {callbackFailed ? <p role="status" className="mb-4 text-sm text-os-vermilion-ink">{meT('callbackHelp')}</p> : null}
          <AcademicIdentityControl />
        </div>
        <section className="surface-folio-sheet account-research px-5 py-6" data-profile-research-identity="true" id="research-profile">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-os-rule-paper pb-4">
            <div><h2 className="text-lg font-semibold text-os-ink">{meT('researchProfileTitle')}</h2><p className="mt-1 text-sm text-os-muted-paper">{meT('researchProfileProgress', { completed: completedProfileGroups })}</p></div>
            <span aria-live="polite" className="text-sm text-os-muted-paper">{profileDirty ? meT('unsavedChanges') : meT('allChangesSaved')}</span>
          </div>
          <fieldset disabled={busy} aria-busy={busy}>
            <ResearchProfileFields value={profile} onChange={(next) => { if (busy) return; setProfile({ ...profile, ...next }); setWriteStatus(current => current === 'draft-conflict' ? current : 'idle'); setWriteError(''); }} />
          </fieldset>
          {profileDirty ? <p id="profile-signal-help" className="mt-4 text-sm text-os-muted-paper">{meT('saveBeforeSignals')}</p> : null}
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
                      <button className="text-os-vermilion-ink hover:underline" disabled={busy || profileDirty || writeStatus === 'draft-conflict'} aria-describedby={profileDirty ? "profile-signal-help" : undefined} onClick={() => void decideSignal(signal, decision)}>
                        {identityT(decision)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button disabled={busy || !profileDirty || writeStatus === 'draft-conflict'} onClick={() => void saveProfile()}>{busy ? identityT('saving') : identityT('save')}</Button>
            <Button variant="ghost" disabled={busy || (!profileDirty && writeStatus !== 'draft-conflict')} onClick={() => { if (savedProfile) setProfile(savedProfile); setWriteError(''); setWriteStatus('idle'); }}>{meT('discardChanges')}</Button>
            {writeStatus === 'draft-conflict' ? <Button variant="ghost" disabled={busy} onClick={() => setWriteStatus('idle')}>{meT('keepLocalChanges')}</Button> : null}
            <span aria-live="polite" className="text-sm text-os-muted-paper">
              {writeStatus === 'saved' ? identityT('saved') : writeStatus === 'draft-conflict' ? meT('profileConflict') : writeStatus === 'conflict' ? identityT('conflict') : ''}
            </span>
          </div>
          {writeError ? <p role="alert" className="mt-3 text-sm text-os-vermilion-ink">{writeError}</p> : null}
        </section>
      </div>
    </DashboardShell>
  );
}
