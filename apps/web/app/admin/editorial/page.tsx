'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { getEditorialMediaStatus } from '@/lib/editorial-media-draft';
import {
  createEditorialSelectionApi,
  getAdminEditorialCollection,
  getEditorialCandidates,
  transitionEditorialSelectionApi,
  type EditorialCandidateApi,
  type EditorialCollectionApi,
} from '@/lib/api';

const SLUG = 'ultrafast-science';
const DEFAULT_MEDIA_LICENSE = 'CC-BY-4.0';

export default function EditorialAdminPage() {
  const t = useTranslations('editorialAdmin');
  const shell = useTranslations('shell');
  const [collection, setCollection] = React.useState<EditorialCollectionApi | null>(null);
  const [candidates, setCandidates] = React.useState<EditorialCandidateApi[]>([]);
  const [candidate, setCandidate] = React.useState('');
  const [note, setNote] = React.useState('');
  const [mediaType, setMediaType] = React.useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = React.useState('');
  const [mediaAlt, setMediaAlt] = React.useState('');
  const [mediaCredit, setMediaCredit] = React.useState('');
  const [mediaLicense, setMediaLicense] = React.useState(DEFAULT_MEDIA_LICENSE);
  const [mediaSource, setMediaSource] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(true);
  const mediaDraft = { type: mediaType, url: mediaUrl, alt: mediaAlt, credit: mediaCredit, licenseId: mediaLicense, sourceUrl: mediaSource };
  const mediaStatus = getEditorialMediaStatus(mediaDraft);

  async function refresh() {
    setBusy(true); setError('');
    try {
      const [nextCollection, nextCandidates] = await Promise.all([getAdminEditorialCollection(SLUG), getEditorialCandidates()]);
      setCollection(nextCollection); setCandidates(nextCandidates);
      if (!candidate && nextCandidates[0]) setCandidate(nextCandidates[0].versionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setBusy(false); }
  }

  React.useEffect(() => { void refresh(); }, []);

  async function addSelection(event: React.FormEvent) {
    event.preventDefault(); if (busy || !candidate) return;
    if (mediaStatus === 'incomplete') { setError(t('mediaIncomplete')); return; }
    setBusy(true); setError('');
    try {
      const media = mediaStatus === 'ready' ? [mediaDraft] : undefined;
      await createEditorialSelectionApi(SLUG, { versionId: candidate, note, media });
      setNote(''); setMediaUrl(''); setMediaAlt(''); setMediaCredit(''); setMediaSource('');
      setMediaType('image'); setMediaLicense(DEFAULT_MEDIA_LICENSE);
      await refresh();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); setBusy(false); }
  }

  async function advance(id: string, state: 'internal_review' | 'scheduled' | 'published') {
    setBusy(true); setError('');
    try {
      const scheduledAt = state === 'scheduled' ? new Date().toISOString() : undefined;
      await transitionEditorialSelectionApi(id, state, scheduledAt); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); setBusy(false); }
  }

  return (
    <DashboardShell
      data-editorial-admin="true"
      mainClassName="craft-editorial px-5 py-10 sm:px-10 lg:px-16"
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
    >
      <div className="mx-auto max-w-[100rem]" aria-busy={busy}>
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-os-rule-paper pb-6">
          <div><p data-reading-role="caption" className="text-os-vermilion-ink">{t('eyebrow')}</p><h1 className="mt-3 text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.03em] text-os-ink">{collection?.title ?? 'Ultrafast Science'}</h1></div>
          <p className="max-w-md text-sm leading-6 text-os-muted-paper">{t('description')}</p>
        </header>
        {error ? <p className="border-b border-os-vermilion py-4 text-sm text-os-ink" role="alert">{error}</p> : null}
        <div className="editorial-layout">
          <form className="self-start border-t border-os-rule-paper pt-5" onSubmit={addSelection}>
            <fieldset className="editorial-fields" disabled={busy}>
            <legend className="editorial-section-title">{t('addEyebrow')}</legend>
            <label className="mt-7 block text-sm text-os-muted-paper"><span className="mb-2 block">{t('candidate')}</span><select required className="w-full" value={candidate} onChange={(event) => setCandidate(event.target.value)} disabled={busy}><option className="bg-white" value="">{t('choose')}</option>{candidates.map((item) => <option className="bg-white" key={item.versionId} value={item.versionId}>{item.publicId} · v{item.versionNo} · {item.title}</option>)}</select></label>
            <label className="mt-7 block text-sm text-os-muted-paper"><span className="mb-2 block">{t('note')}</span><textarea className="min-h-32 w-full resize-y" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('notePlaceholder')} /></label>
            <fieldset className="mt-8 border-t border-os-rule-paper pt-5"><legend className="text-sm font-semibold text-os-ink">{t('media')}</legend><p className="mt-3 text-sm leading-5 text-os-muted-paper">{t('mediaHint')}</p><div className="mt-4 grid gap-4"><select aria-label={t('media')} className="w-full" value={mediaType} onChange={(event) => setMediaType(event.target.value as 'image' | 'video')}><option className="bg-white" value="image">{t('image')}</option><option className="bg-white" value="video">{t('video')}</option></select>{[[t('mediaUrl'), mediaUrl, setMediaUrl], [t('mediaAlt'), mediaAlt, setMediaAlt], [t('mediaCredit'), mediaCredit, setMediaCredit], [t('mediaLicense'), mediaLicense, setMediaLicense], [t('mediaSource'), mediaSource, setMediaSource]].map(([label, value, setter]) => <label className="text-sm text-os-muted-paper" key={label as string}><span className="mb-1 block">{label as string}</span><input className="w-full" required={mediaStatus !== 'empty'} type={label === t('mediaUrl') || label === t('mediaSource') ? 'url' : 'text'} value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} /></label>)}</div></fieldset>
            <button className="editorial-submit mt-7 min-h-11 px-5 text-sm font-semibold disabled:opacity-50" type="submit" disabled={busy || !candidate}>{busy ? t('working') : t('add')}</button>
            </fieldset>
          </form>
          <section className="border-t border-os-rule-paper pt-5" aria-label={t('queueLabel')}>
            <div className="flex items-center justify-between gap-4"><p className="editorial-section-title">{t('queueEyebrow')}</p><span className="font-data text-sm text-os-muted-paper">{collection ? collection.selections.length : '—'}</span></div>
            {busy ? <p role="status" className="mt-4 text-sm text-os-muted-paper">{t('working')}</p> : null}
            <ol className="mt-5 m-0 list-none p-0">{collection?.selections.map((selection, index) => <li className="editorial-queue-entry" key={selection.id}><span className="font-data text-sm text-os-vermilion">{String(index + 1).padStart(2, '0')}</span><div><h2 className="font-editorial text-3xl font-normal">{selection.title}</h2><p className="mt-2 text-sm text-os-muted-paper">{selection.publicId} · v{selection.versionNo} · {selection.state}</p>{selection.note ? <p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-paper">{selection.note}</p> : null}</div><div className="flex flex-wrap gap-2 md:justify-end">{selection.state === 'draft' ? <button type="button" disabled={busy} className="text-sm text-os-ink" onClick={() => void advance(selection.id, 'internal_review')}>{t('sendReview')}</button> : null}{selection.state === 'internal_review' ? <button type="button" disabled={busy} className="text-sm text-os-ink" onClick={() => void advance(selection.id, 'scheduled')}>{t('schedule')}</button> : null}{selection.state === 'scheduled' ? <button type="button" disabled={busy} className="text-sm text-os-ink" onClick={() => void advance(selection.id, 'published')}>{t('publish')}</button> : null}</div></li>)}</ol>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
