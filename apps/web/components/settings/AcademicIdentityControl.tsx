'use client';

import { CheckCircle2, Circle, ExternalLink, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  ApiClientError,
  beginOrcidConnection,
  getAcademicIdentityStatus,
  requestInstitutionEmailCode,
  verifyInstitutionEmail,
  type AcademicIdentityStatus,
} from '@/lib/api';

export function AcademicIdentityControl() {
  const t = useTranslations('academicIdentity');
  const [status, setStatus] = useState<AcademicIdentityStatus | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setStatus(await getAcademicIdentityStatus());
    } catch {
      setLoadFailed(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function connectOrcid() {
    setBusy(true); setError(''); setMessage('');
    try {
      const { authorizationUrl } = await beginOrcidConnection();
      window.location.assign(authorizationUrl);
    } catch {
      setError(t('orcidError'));
      setBusy(false);
    }
  }

  async function sendInstitutionCode() {
    setBusy(true); setError(''); setMessage('');
    try {
      const targetEmail = email.trim();
      const result = await requestInstitutionEmailCode(targetEmail);
      setEmail(targetEmail);
      setCode('');
      setCodeRequested(true);
      setMessage(t('codeSentFor', { organization: result.organization.name }));
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 429 ? t('waitBeforeRetry') : t('institutionError'));
    } finally { setBusy(false); }
  }

  async function confirmInstitutionEmail() {
    setBusy(true); setError(''); setMessage('');
    try {
      await verifyInstitutionEmail(email, code);
      setCode(''); setCodeRequested(false);
      setMessage(t('institutionVerified'));
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 429 ? t('waitBeforeRetry') : t('verificationHelp'));
    } finally { setBusy(false); }
  }

  const steps = status ? [
    [t('registered'), status.steps.registered],
    [t('emailVerified'), status.steps.emailVerified],
    [t('orcidConnected'), status.steps.orcidConnected],
    [t('institutionEmailVerified'), status.steps.institutionEmailVerified],
  ] as const : [];
  const orcid = status?.credentials.find((credential) => credential.type === 'orcid');
  const institution = status?.credentials.find((credential) => credential.type === 'institution_email');
  const unavailable = busy || loading || loadFailed || !status;

  return (
    <section className="surface-folio-sheet px-5 py-6 md:col-span-2" data-academic-identity="true">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 text-os-vermilion-ink" />
        <div><h2 className="text-lg font-semibold text-os-ink">{t('title')}</h2><p className="mt-1 text-sm text-os-muted-paper">{t('description')}</p></div>
      </div>
      {loading ? <p role="status" className="mt-4 text-sm text-os-muted-paper">{t('loading')}</p> : null}
      {loadFailed ? <div className="mt-4"><p role="alert" className="text-sm text-os-vermilion-ink">{t('loadError')}</p><Button className="mt-2" disabled={loading || busy} onClick={() => void refresh()}>{t('retryStatus')}</Button></div> : null}
      <ol aria-label={t('progressLabel')} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([label, complete], index) => (
          <li key={label} className="flex min-h-11 items-center gap-2 border-b border-os-rule-paper pb-2 text-sm text-os-ink">
            {complete ? <CheckCircle2 className="h-4 w-4 text-os-vermilion-ink" /> : <Circle className="h-4 w-4 text-os-muted-paper" />}
            <span>{label} · {t(complete ? 'complete' : 'incomplete')}{index > 1 ? ` · ${t('optional')}` : ''}</span>
          </li>
        ))}
      </ol>
      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div className="border-t border-os-rule-paper pt-4">
          <h3 className="font-semibold text-os-ink">ORCID</h3>
          <p className="mt-2 text-sm text-os-muted-paper">{orcid ? `${orcid.displayLabel} · ${orcid.externalId}` : t('orcidHint')}</p>
          <Button className="mt-4" disabled={unavailable || Boolean(orcid) || status?.capabilities.orcid === false} onClick={() => void connectOrcid()}>
            <ExternalLink className="mr-2 h-4 w-4" />{orcid ? t('connected') : status?.capabilities.orcid === false ? t('notConfigured') : t('connectOrcid')}
          </Button>
          <p className="mt-3 text-sm text-os-muted-paper">{t('orcidPrivacy')}</p>
        </div>
        <div className="border-t border-os-rule-paper pt-4">
          <h3 className="font-semibold text-os-ink">{t('institutionTitle')}</h3>
          {institution ? <p className="mt-2 text-sm text-os-muted-paper">{institution.displayLabel}</p> : (
            <form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!unavailable && status?.capabilities.institutionEmail) void (codeRequested ? confirmInstitutionEmail() : sendInstitutionCode()); }}>
              <label className="grid gap-1 text-sm text-os-muted-paper">{t('institutionEmail')}<input className="min-h-11 min-w-0 rounded-control border border-os-rule-paper bg-transparent px-3 text-os-ink" type="email" autoComplete="email" required disabled={unavailable || codeRequested || !status?.capabilities.institutionEmail} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              {codeRequested ? <label className="grid gap-1 text-sm text-os-muted-paper">{t('verificationCode')}<input className="min-h-11 min-w-0 rounded-control border border-os-rule-paper bg-transparent px-3 text-os-ink" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required disabled={unavailable} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label> : null}
              <Button type="submit" disabled={unavailable || !status?.capabilities.institutionEmail || !email.trim() || (codeRequested && code.length !== 6)}>
                {codeRequested ? t('verify') : t('sendCode')}
              </Button>
              {codeRequested ? <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={unavailable || !status?.capabilities.institutionEmail} onClick={() => void sendInstitutionCode()}>{t('resend')}</Button>
                <Button type="button" disabled={unavailable} onClick={() => { setCodeRequested(false); setCode(''); setMessage(''); setError(''); }}>{t('changeEmail')}</Button>
              </div> : null}
              {status?.capabilities.institutionEmail === false ? <p className="text-sm text-os-muted-paper">{t('domainsNotConfigured')}</p> : null}
            </form>
          )}
          <p className="mt-3 text-sm text-os-muted-paper">{t('institutionPrivacy')}</p>
        </div>
      </div>
      <p aria-live="polite" className="mt-4 text-sm text-os-muted-paper">{message}</p>
      {error ? <p role="alert" className="mt-2 text-sm text-os-vermilion-ink">{error}</p> : null}
    </section>
  );
}
