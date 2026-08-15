'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  createEditorialSelectionApi,
  getAdminEditorialCollection,
  getEditorialCandidates,
  transitionEditorialSelectionApi,
  type EditorialCandidateApi,
  type EditorialCollectionApi,
} from '@/lib/api';

const SLUG = 'ultrafast-science';

export default function EditorialAdminPage() {
  const t = useTranslations('editorialAdmin');
  const [collection, setCollection] = React.useState<EditorialCollectionApi | null>(null);
  const [candidates, setCandidates] = React.useState<EditorialCandidateApi[]>([]);
  const [candidate, setCandidate] = React.useState('');
  const [note, setNote] = React.useState('');
  const [mediaType, setMediaType] = React.useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = React.useState('');
  const [mediaAlt, setMediaAlt] = React.useState('');
  const [mediaCredit, setMediaCredit] = React.useState('');
  const [mediaLicense, setMediaLicense] = React.useState('CC-BY-4.0');
  const [mediaSource, setMediaSource] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(true);

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
    event.preventDefault(); if (!candidate) return;
    setBusy(true); setError('');
    try {
      const media = mediaUrl ? [{ type: mediaType, url: mediaUrl, alt: mediaAlt, credit: mediaCredit, licenseId: mediaLicense, sourceUrl: mediaSource }] : undefined;
      await createEditorialSelectionApi(SLUG, { versionId: candidate, note, media });
      setNote(''); setMediaUrl(''); setMediaAlt(''); setMediaCredit(''); setMediaSource('');
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
    <main className="min-h-screen bg-os-night px-5 py-10 text-os-paper sm:px-10 lg:px-16" data-editorial-admin="true">
      <div className="mx-auto max-w-[100rem]">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/20 pb-6">
          <div><p className="font-data text-xs uppercase tracking-[0.2em] text-os-vermilion">{t('eyebrow')}</p><h1 className="mt-4 font-editorial text-6xl font-normal leading-none tracking-[-0.05em]">{collection?.title ?? 'Ultrafast Science'}</h1></div>
          <p className="max-w-md text-sm leading-6 text-os-muted-night">{t('description')}</p>
        </header>
        {error ? <p className="border-b border-os-vermilion py-4 text-sm text-os-paper" role="alert">{error}</p> : null}
        <div className="grid gap-12 py-10 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <form className="self-start border-t border-white/20 pt-5" onSubmit={addSelection}>
            <p className="font-data text-xs uppercase tracking-[0.18em] text-os-vermilion">{t('addEyebrow')}</p>
            <label className="mt-7 block text-sm text-os-muted-night"><span className="mb-2 block">{t('candidate')}</span><select className="w-full border-b border-white/30 bg-transparent py-3 text-os-paper outline-none focus:border-os-vermilion" value={candidate} onChange={(event) => setCandidate(event.target.value)} disabled={busy}><option className="bg-os-night" value="">{t('choose')}</option>{candidates.map((item) => <option className="bg-os-night" key={item.versionId} value={item.versionId}>{item.publicId} · v{item.versionNo} · {item.title}</option>)}</select></label>
            <label className="mt-7 block text-sm text-os-muted-night"><span className="mb-2 block">{t('note')}</span><textarea className="min-h-32 w-full resize-y border-b border-white/30 bg-transparent py-3 text-os-paper outline-none focus:border-os-vermilion" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('notePlaceholder')} /></label>
            <fieldset className="mt-8 border-t border-white/20 pt-5"><legend className="font-data text-xs uppercase tracking-[0.16em] text-os-muted-night">{t('media')}</legend><p className="mt-3 text-xs leading-5 text-os-muted-night">{t('mediaHint')}</p><div className="mt-4 grid gap-4"><select className="border-b border-white/30 bg-transparent py-2 text-sm text-os-paper" value={mediaType} onChange={(event) => setMediaType(event.target.value as 'image' | 'video')}><option className="bg-os-night" value="image">{t('image')}</option><option className="bg-os-night" value="video">{t('video')}</option></select>{[[t('mediaUrl'), mediaUrl, setMediaUrl], [t('mediaAlt'), mediaAlt, setMediaAlt], [t('mediaCredit'), mediaCredit, setMediaCredit], [t('mediaLicense'), mediaLicense, setMediaLicense], [t('mediaSource'), mediaSource, setMediaSource]].map(([label, value, setter]) => <label className="text-xs text-os-muted-night" key={label as string}><span className="mb-1 block">{label as string}</span><input className="w-full border-b border-white/30 bg-transparent py-2 text-sm text-os-paper outline-none focus:border-os-vermilion" value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} /></label>)}</div></fieldset>
            <button className="mt-7 min-h-11 rounded-panel bg-os-vermilion px-5 text-sm font-semibold text-os-ink transition-transform active:translate-y-px disabled:opacity-50" type="submit" disabled={busy || !candidate}>{busy ? t('working') : t('add')}</button>
          </form>
          <section className="border-t border-white/20 pt-5" aria-label={t('queueLabel')}>
            <div className="flex items-center justify-between gap-4"><p className="font-data text-xs uppercase tracking-[0.18em] text-os-vermilion">{t('queueEyebrow')}</p><span className="font-data text-xs text-os-muted-night">{collection?.selections.length ?? 0} entries</span></div>
            <ol className="mt-5 m-0 list-none p-0">{collection?.selections.map((selection, index) => <li className="grid gap-4 border-b border-white/15 py-6 md:grid-cols-[3rem_minmax(0,1fr)_12rem] md:items-start" key={selection.id}><span className="font-data text-xs text-os-vermilion">{String(index + 1).padStart(2, '0')}</span><div><h2 className="font-editorial text-3xl font-normal">{selection.title}</h2><p className="mt-2 font-data text-xs uppercase tracking-[0.12em] text-os-muted-night">{selection.publicId} · v{selection.versionNo} · {selection.state}</p>{selection.note ? <p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-night">{selection.note}</p> : null}</div><div className="flex flex-wrap gap-2 md:justify-end">{selection.state === 'draft' ? <button className="border-b border-os-vermilion pb-1 text-xs text-os-paper" onClick={() => void advance(selection.id, 'internal_review')}>{t('sendReview')}</button> : null}{selection.state === 'internal_review' ? <button className="border-b border-os-vermilion pb-1 text-xs text-os-paper" onClick={() => void advance(selection.id, 'scheduled')}>{t('schedule')}</button> : null}{selection.state === 'scheduled' ? <button className="border-b border-os-vermilion pb-1 text-xs text-os-paper" onClick={() => void advance(selection.id, 'published')}>{t('publish')}</button> : null}</div></li>)}</ol>
          </section>
        </div>
      </div>
    </main>
  );
}
