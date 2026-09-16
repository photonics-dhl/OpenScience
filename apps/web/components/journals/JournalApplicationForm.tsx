'use client';

import Link from 'next/link';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { JOURNAL_SERVICE_OPTIONS, JOURNAL_APPLICATION_REQUIRED_FIELDS, journalEnglishMetadataIssues, journalDisplayName } from '@openscience/domain/journal-form-contract';
import { ApiClientError } from '@/lib/api';
import { getJournalApplication, listApplications, saveApplication, submitApplication, type JournalApplication, type JournalApplicationInput } from '@/lib/journal-api';

const declaration = 'I confirm that I hold or have obtained the authorization needed to submit this information and process subsequent materials, and understand that public access must be confirmed for each article.';
const empty: JournalApplicationInput = { nameZh: '', nameEn: '', pIssn: '', eIssn: '', websiteUrl: '', publisherName: '', sponsorName: '', subjects: [], description: '', logoUrl: '', applicantName: '', applicantTitle: '', applicantEmail: '', representationEvidence: '', plannedArticleCount: 0, requestedServices: [], rightsDeclaration: '', rightsDeclarationVersion: 'v1.1' };
const inputClass = 'min-h-11 border border-os-rule-paper bg-transparent px-3 disabled:opacity-70';

function applicationForm(application: JournalApplication): JournalApplicationInput {
  const result = { ...empty };
  for (const key of Object.keys(empty) as Array<keyof JournalApplicationInput>) {
    const value = application[key];
    if (value !== null && value !== undefined) Object.assign(result, { [key]: value });
  }
  return result;
}

export function JournalApplicationForm() {
  const t = useTranslations('journalApplication');
  const router = useRouter();
  const [form, setForm] = React.useState<JournalApplicationInput>({ ...empty });
  const [subjectsText, setSubjectsText] = React.useState('');
  const [applications, setApplications] = React.useState<JournalApplication[]>([]);
  const [active, setActive] = React.useState<JournalApplication | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [anonymous, setAnonymous] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [errors, setErrors] = React.useState<string[]>([]);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const inFlight = React.useRef(false);
  React.useEffect(() => { if (errors.length) errorRef.current?.focus(); }, [errors]);
  const editable = !active || ['draft', 'needs_information'].includes(active.status);
  const select = (application: JournalApplication | null) => {
    setActive(application); setForm(application ? applicationForm(application) : { ...empty });
    setSubjectsText(application?.subjects?.join(', ') ?? '');
    setMessage(''); setErrors([]);
  };

  React.useEffect(() => {
    let mounted = true;
    listApplications().then(({ items }) => {
      if (!mounted) return;
      setApplications(items);
      const requestedId = new URLSearchParams(window.location.search).get('applicationId');
      const selected = requestedId ? items.find((item) => item.id === requestedId) : items[0];
      if (selected) { setActive(selected); setForm(applicationForm(selected)); setSubjectsText(selected.subjects?.join(', ') ?? ''); }
      else if (requestedId) setErrors([t('applicationUnavailable')]);
    }).catch((error) => {
      if (!mounted) return;
      if (error instanceof ApiClientError && error.status === 401) setAnonymous(true);
      else setErrors([error instanceof Error ? error.message : t('loadFailed')]);
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  const set = (key: keyof JournalApplicationInput, value: unknown) => setForm((old) => ({ ...old, [key]: value }));
  const remember = (application: JournalApplication) => {
    setActive(application);
    setApplications((old) => [application, ...old.filter((item) => item.id !== application.id)]);
  };

  async function persist(submit = false) {
    if (!editable || inFlight.current || loading) return;
    const normalizedForm = { ...form, subjects: subjectsText.split(/[,;，；]/).map((subject) => subject.trim()).filter(Boolean) };
    const issues = journalEnglishMetadataIssues(normalizedForm, submit ? JOURNAL_APPLICATION_REQUIRED_FIELDS : []);
    const problems = issues.map((issue) => t(issue.reason === 'required' ? 'requiredError' : 'englishError', { field: t('fields.' + issue.field) }));
    if (submit && !form.pIssn?.trim() && !form.eIssn?.trim()) problems.push(t('issnRequired'));
    if (problems.length) { setErrors(problems); setMessage(''); return; }
    inFlight.current = true; setSaving(true); setErrors([]); setMessage('');
    let submittedId: string | undefined;
    try {
      const input = { ...normalizedForm, requestedServices: form.requestedServices.filter((value) => JOURNAL_SERVICE_OPTIONS.some((option) => option.value === value)), ...(active ? { revision: active.revision } : {}) };
      const saved = await saveApplication(input, active?.id);
      remember(saved.application);
      if (submit) {
        submittedId = saved.application.id;
        const result = await submitApplication(saved.application.id, { revision: saved.application.revision, submissionKey: crypto.randomUUID() });
        remember(result.application);
        router.push('/journals/apply/' + result.application.id);
      }
      setMessage(t(submit ? 'submitted' : saved.application.status === 'needs_information' ? 'changesSaved' : 'saved'));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) { window.location.assign('/auth/login?returnTo=%2Fjournals%2Fapply'); return; }
      // A lost response must not turn a successful submission into a new one.
      if (submittedId) {
        try {
          const current = (await getJournalApplication(submittedId)).application;
          if (!['draft', 'needs_information'].includes(current.status)) {
            remember(current); router.push('/journals/apply/' + current.id); return;
          }
        } catch { /* Keep the saved ID visible so the applicant can reopen it. */ }
      }
      setErrors([error instanceof Error ? error.message : t('saveFailed')]);
    } finally { inFlight.current = false; setSaving(false); }
  }

  const field = (key: keyof JournalApplicationInput, required = false, type = 'text', maxLength = 200) => <label className="grid gap-2 text-sm"><span>{t('fields.' + key)}{required ? ' *' : ''}</span><input name={key} required={required} type={type} lang={key === 'nameZh' ? 'zh' : 'en'} maxLength={maxLength} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} value={String(form[key] ?? '')} onChange={(event) => set(key, type === 'number' ? Number(event.target.value) : event.target.value)} className={inputClass} /></label>;
  const legacyServices = form.requestedServices.some((value) => !JOURNAL_SERVICE_OPTIONS.some((option) => option.value === value));

  return <div className="mt-8">
    <p className="leading-7 text-os-muted-paper">{t('englishNotice')}</p>
    <p className="leading-7 text-os-muted-paper">{t('reviewProcess')}</p>
    {anonymous ? <p><Link href="/auth/login?returnTo=%2Fjournals%2Fapply">{t('login')}</Link></p> : null}
    {loading ? <p role="status">{t('loading')}</p> : null}
    {applications.length ? <section aria-label={t('myApplications')} className="my-7 border-y border-os-rule-paper py-5">
      <h2 className="text-lg font-normal">{t('myApplications')}</h2>
      <div className="flex flex-wrap gap-3">{applications.map((application) => <button type="button" key={application.id} disabled={saving} aria-pressed={active?.id === application.id} className="min-h-11 border border-os-rule-paper px-3 text-left text-sm" onClick={() => select(application)}>{journalDisplayName(application) || t('untitled')} · {t('status.' + application.status)}{application.status === 'needs_information' ? ' · ' + t('continueEditing') : ''}</button>)}<button type="button" disabled={saving} className="min-h-11 border border-os-rule-paper px-3 text-sm" onClick={() => select(null)}>{t('newApplication')}</button></div>
    </section> : null}
    {active ? <div className="mb-6" role="status"><p>{t('currentStatus', { status: t('status.' + active.status) })}</p><p className="break-all text-sm">{t('applicationNumber')} <code>{active.id}</code></p>{active.status !== 'draft' ? <Link href={'/journals/apply/' + active.id}>{t('viewReceipt')}</Link> : null}{active.status === 'submitted' ? <p>{t('awaitingReview')}</p> : null}{active.reviewReason ? <p className="whitespace-pre-wrap">{t('reviewReason', { reason: active.reviewReason })}</p> : null}{active.status === 'needs_information' ? <p>{t('revise')}</p> : null}{active.status === 'approved' && active.journalId ? <Link href={'/journals/manage/' + active.journalId}>{t('openJournal')}</Link> : null}</div> : null}
    {active?.status === 'needs_information' ? <p><a className="inline-flex min-h-11 items-center bg-accent-primary-strong px-5 font-semibold text-os-black-0" href="#journal-application-form">{t('continueEditing')}</a></p> : null}
    {active?.status === 'rejected' ? <p>{t('rejectedHelp')}</p> : null}
    <form id="journal-application-form" aria-busy={saving} onSubmit={(event) => { event.preventDefault(); void persist(true); }}>
      <fieldset disabled={!editable || saving || loading} className="grid gap-8 border-0 p-0">
        <fieldset className="grid gap-4 border-0 p-0"><legend className="mb-3 text-xl">{t('journalSection')}</legend><div className="grid gap-4 sm:grid-cols-2">
          {field('nameEn', true)}{field('nameZh')}{field('pIssn', false, 'text', 20)}{field('eIssn', false, 'text', 20)}{field('websiteUrl', true, 'url', 2000)}{field('publisherName', true)}{field('sponsorName')}{field('plannedArticleCount', false, 'number')}
        </div><label className="grid gap-2 text-sm">{t('fields.subjects')} *<input name="subjects" lang="en" required value={subjectsText} placeholder="Optics, Photonics" className={inputClass} onChange={(event) => setSubjectsText(event.target.value)} /></label><label className="grid gap-2 text-sm">{t('fields.description')} *<textarea name="description" lang="en" required maxLength={5000} rows={5} value={form.description} onChange={(event) => set('description', event.target.value)} className="border border-os-rule-paper bg-transparent p-3" /></label></fieldset>
        <fieldset className="grid gap-4 border-0 p-0"><legend className="mb-3 text-xl">{t('applicantSection')}</legend><div className="grid gap-4 sm:grid-cols-2">{field('applicantName', true, 'text', 100)}{field('applicantTitle', true, 'text', 100)}{field('applicantEmail', true, 'email', 300)}</div><p className="m-0 text-sm text-os-muted-paper">{t('emailNotice')}</p><label className="grid gap-2 text-sm">{t('fields.representationEvidence')} *<textarea name="representationEvidence" lang="en" required maxLength={10000} rows={4} value={form.representationEvidence} onChange={(event) => set('representationEvidence', event.target.value)} className="border border-os-rule-paper bg-transparent p-3" /></label></fieldset>
        <fieldset className="grid gap-4 border-0 p-0"><legend className="mb-2 text-xl">{t('servicesSection')}</legend>{JOURNAL_SERVICE_OPTIONS.map((service) => <label className="flex items-start gap-3" key={service.key}><input className="mt-1" type="checkbox" checked={form.requestedServices.includes(service.value)} onChange={(event) => set('requestedServices', event.target.checked ? [...form.requestedServices, service.value] : form.requestedServices.filter((value) => value !== service.value))} /><span><span>{t('services.' + service.key + '.title')}</span><span className="mt-1 block text-sm leading-6 text-os-muted-paper">{t('services.' + service.key + '.description')}</span></span></label>)}{legacyServices ? <p className="text-sm text-os-muted-paper">{t('legacyServices')}</p> : null}</fieldset>
        <label className="flex gap-3 border-t border-os-rule-paper pt-5 text-sm"><input required type="checkbox" checked={Boolean(form.rightsDeclaration)} onChange={(event) => { set('rightsDeclaration', event.target.checked ? declaration : ''); set('rightsDeclarationVersion', 'v1.1'); }} />{t('declaration')}</label>
        {errors.length ? <div ref={errorRef} tabIndex={-1} role="alert" className="text-os-vermilion-ink"><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
        {message ? <p role="status">{message}</p> : null}
        {saving ? <p role="status">{t('saving')}</p> : null}
        {editable ? <div className="flex flex-wrap gap-3"><button type="button" className="min-h-11 border border-os-rule-paper px-5 disabled:opacity-50" onClick={() => void persist(false)}>{t(active?.status === 'needs_information' ? 'saveChanges' : 'save')}</button><button className="min-h-11 bg-accent-primary-strong px-5 font-semibold text-os-black-0 disabled:opacity-50" type="submit">{t(active?.status === 'needs_information' ? 'resubmit' : 'submit')}</button></div> : null}
      </fieldset>
    </form>
  </div>;
}
