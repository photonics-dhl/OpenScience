'use client';

import { CheckCircle2, Circle, ExternalLink, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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

  async function refresh() {
    setStatus(await getAcademicIdentityStatus());
  }

  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : t('loadError'))); }, []);

  async function connectOrcid() {
    setBusy(true); setError(''); setMessage('');
    try {
      const { authorizationUrl } = await beginOrcidConnection();
      window.location.assign(authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('orcidError'));
      setBusy(false);
    }
  }

  async function sendInstitutionCode() {
    setBusy(true); setError(''); setMessage('');
    try {
      await requestInstitutionEmailCode(email);
      setCodeRequested(true);
      setMessage(t('codeSent'));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('institutionError'));
    } finally { setBusy(false); }
  }

  async function confirmInstitutionEmail() {
    setBusy(true); setError(''); setMessage('');
    try {
      await verifyInstitutionEmail(email, code);
      await refresh();
      setCode(''); setCodeRequested(false);
      setMessage(t('institutionVerified'));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('institutionError'));
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

  return (
    <section className="surface-folio-sheet px-5 py-6 md:col-span-2" data-academic-identity="true">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 text-os-vermilion-ink" />
        <div><h2 className="text-lg font-semibold text-os-ink">{t('title')}</h2><p className="mt-1 text-sm text-os-muted-paper">{t('description')}</p></div>
      </div>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([label, complete], index) => (
          <li key={label} className="flex min-h-11 items-center gap-2 border-b border-os-rule-paper pb-2 text-sm text-os-ink">
            {complete ? <CheckCircle2 className="h-4 w-4 text-os-vermilion-ink" /> : <Circle className="h-4 w-4 text-os-muted-paper" />}
            <span>{index + 1}. {label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div className="border-t border-os-rule-paper pt-4">
          <h3 className="font-semibold text-os-ink">ORCID</h3>
          <p className="mt-2 text-sm text-os-muted-paper">{orcid ? `${orcid.displayLabel} · ${orcid.externalId}` : t('orcidHint')}</p>
          <Button className="mt-4" disabled={busy || Boolean(orcid) || status?.capabilities.orcid === false} onClick={() => void connectOrcid()}>
            <ExternalLink className="mr-2 h-4 w-4" />{orcid ? t('connected') : status?.capabilities.orcid === false ? t('notConfigured') : t('connectOrcid')}
          </Button>
        </div>
        <div className="border-t border-os-rule-paper pt-4">
          <h3 className="font-semibold text-os-ink">{t('institutionTitle')}</h3>
          {institution ? <p className="mt-2 text-sm text-os-muted-paper">{institution.displayLabel}</p> : (
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm text-os-muted-paper">{t('institutionEmail')}<input className="min-h-11 rounded-control border border-os-rule-paper bg-transparent px-3 text-os-ink" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              {codeRequested ? <label className="grid gap-1 text-sm text-os-muted-paper">{t('verificationCode')}<input className="min-h-11 rounded-control border border-os-rule-paper bg-transparent px-3 text-os-ink" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label> : null}
              <Button disabled={busy || status?.capabilities.institutionEmail === false || !email || (codeRequested && code.length !== 6)} onClick={() => void (codeRequested ? confirmInstitutionEmail() : sendInstitutionCode())}>
                {status?.capabilities.institutionEmail === false ? t('domainsNotConfigured') : codeRequested ? t('verify') : t('sendCode')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <p aria-live="polite" className="mt-4 text-sm text-os-muted-paper">{message}</p>
      {error ? <p role="alert" className="mt-2 text-sm text-os-vermilion-ink">{error}</p> : null}
    </section>
  );
}
