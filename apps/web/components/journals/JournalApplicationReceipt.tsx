'use client';

import Link from 'next/link';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { journalDisplayName } from '@openscience/domain/journal-form-contract';
import { ApiClientError } from '@/lib/api';
import { getJournalApplication, type JournalApplication } from '@/lib/journal-api';

export function JournalApplicationReceipt({ applicationId }: { applicationId: string }) {
  const t = useTranslations('journalApplication');
  const router = useRouter();
  const [application, setApplication] = React.useState<JournalApplication | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { setApplication((await getJournalApplication(applicationId)).application); }
    catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        router.replace('/auth/login?returnTo=' + encodeURIComponent('/journals/apply/' + applicationId)); return;
      }
      setApplication(null);
      setError(cause instanceof ApiClientError && cause.status === 404 ? t('applicationUnavailable') : t('loadFailed'));
    } finally { setLoading(false); }
  }, [applicationId, router, t]);
  React.useEffect(() => { void load(); }, [load]);

  if (!application) return <section className="py-8"><h1 className="text-3xl font-normal">{t('receiptTitle')}</h1>{error ? <p role="alert">{error}</p> : <p role="status">{t('loading')}</p>}{error ? <button className="min-h-11 border border-os-rule-paper px-4" onClick={() => void load()}>{t('refresh')}</button> : null}<p><Link href="/journals/apply">{t('myApplications')}</Link></p></section>;
  return <section className="py-8">
    <p className="text-sm text-os-muted-paper">{t('receiptTitle')}</p>
    <h1 className="mt-3 text-4xl font-normal">{t('receiptHeading.' + application.status)}</h1>
    <h2 className="mt-6 text-xl font-normal">{journalDisplayName(application)}</h2>
    <dl className="my-7 grid gap-5 border-y border-os-rule-paper py-6">
      <div><dt className="text-sm text-os-muted-paper">{t('applicationNumber')}</dt><dd className="ml-0 mt-2 break-all font-mono text-sm">{application.id}</dd></div>
      <div><dt className="text-sm text-os-muted-paper">{t('statusLabel')}</dt><dd className="ml-0 mt-2">{t('status.' + application.status)}</dd></div>
      {application.submittedAt ? <div><dt className="text-sm text-os-muted-paper">{t('submittedAt')}</dt><dd className="ml-0 mt-2"><time dateTime={application.submittedAt}>{new Date(application.submittedAt).toLocaleString()}</time></dd></div> : null}
    </dl>
    <p className="leading-7 text-os-muted-paper">{t('reviewProcess')}</p>
    {application.status === 'submitted' ? <p>{t('awaitingReview')}</p> : null}
    {application.reviewReason ? <p className="whitespace-pre-wrap">{t('reviewReason', { reason: application.reviewReason })}</p> : null}
    {application.status === 'needs_information' ? <p>{t('revise')}</p> : null}
    {application.status === 'rejected' ? <p>{t('rejectedHelp')}</p> : null}
    <p className="text-sm text-os-muted-paper">{t('receiptNotice')}</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3"><Link className={`min-h-11 border border-os-rule-paper px-4 py-3 ${application.status === 'needs_information' ? 'bg-accent-primary-strong font-semibold text-os-black-0' : ''}`} href={'/journals/apply?applicationId=' + application.id}>{t(application.status === 'needs_information' ? 'continueEditing' : application.status === 'draft' ? 'editApplication' : 'myApplications')}</Link><button disabled={loading} className="min-h-11 border border-os-rule-paper px-4" onClick={() => void load()}>{t('refresh')}</button>{application.status === 'approved' && application.journalId ? <Link className="min-h-11 border border-os-rule-paper px-4 py-3" href={'/journals/manage/' + application.journalId}>{t('openJournal')}</Link> : null}</div>
  </section>;
}
