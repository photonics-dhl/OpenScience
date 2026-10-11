'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import type { ResearchObjectSummary } from '@/lib/api';
import { lookupWorkspacePaper, paperDoiPath, setResearchObjectDoi, type WorkspacePaperLookup } from '@/lib/paper-identity';
import styles from './files.module.css';

export function PaperDoiAssociation({ object, onSaved }: { object: ResearchObjectSummary; onSaved: (doi: string | null, version: number) => void }) {
  const t = useTranslations('productSurfaces.files.doi');
  const [input, setInput] = useState(object.originalDoi ?? '');
  const [lookup, setLookup] = useState<WorkspacePaperLookup | null>(null);
  const [checkedInput, setCheckedInput] = useState('');
  const [busy, setBusy] = useState<'lookup' | 'save' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setInput(object.originalDoi ?? ''); setLookup(null); setCheckedInput(''); }, [object.id, object.originalDoi]);
  const trimmed = input.trim();
  const checked = lookup !== null && checkedInput === trimmed;
  const otherExisting = checked && lookup.existing?.id !== object.id ? lookup.existing : null;
  const alreadySaved = checked && lookup.doi === object.originalDoi;

  async function check() {
    if (!trimmed || busy) return;
    setBusy('lookup'); setError(''); setFeedback(''); setLookup(null);
    try {
      const result = await lookupWorkspacePaper(object.workspaceId, trimmed);
      setLookup(result); setCheckedInput(trimmed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('lookupError')); }
    finally { setBusy(null); }
  }

  async function save(doi: string | null) {
    if (busy) return;
    setBusy('save'); setError(''); setFeedback('');
    try {
      const result = await setResearchObjectDoi(object.id, object.version, doi);
      onSaved(result.doi, result.version);
      setFeedback(result.doi ? t('saved') : t('cleared'));
      setLookup(null); setCheckedInput('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('saveError')); }
    finally { setBusy(null); }
  }

  return <details className={styles.doiSection} aria-busy={busy !== null}>
    <summary>{t('title')}</summary>
    <p className={styles.doiHelp}>{t('body')}</p>
    <label className={styles.doiLabel} htmlFor="paper-doi-input">{t('label')}</label>
    <div className={styles.doiControls}>
      <input id="paper-doi-input" className={styles.commitInput} value={input} maxLength={300} placeholder="10.xxxx/example"
        onChange={(event) => { setInput(event.target.value); setLookup(null); setCheckedInput(''); setFeedback(''); setError(''); }} />
      <button type="button" className={styles.textAction} disabled={!trimmed || busy !== null} onClick={() => void check()}>{busy === 'lookup' ? t('checking') : t('check')}</button>
    </div>
    {checked ? <div className={styles.doiResult} role="status">
      {otherExisting ? <p>{t('existing')} <Link href={otherExisting.url}>{t('continue')}</Link></p>
        : <p>{lookup.publicPaper ? t('publicMatch') : t('noPublicMatch')}</p>}
      {lookup.publicPaper ? <p><Link href={paperDoiPath(lookup.doi)}>{lookup.publicPaper.metadata.title} · {t('publicPage')}</Link></p> : null}
      {!otherExisting && !alreadySaved ? <button type="button" className={styles.saveAction} disabled={busy !== null} onClick={() => void save(lookup.doi)}>{busy === 'save' ? t('saving') : t('associate')}</button> : null}
      {alreadySaved ? <p>{t('alreadySaved')}</p> : null}
    </div> : null}
    {object.originalDoi ? <button type="button" className={styles.textAction} disabled={busy !== null} onClick={() => void save(null)}>{t('clear')}</button> : null}
    {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <p className={styles.doiPrivacy}>{t('privacy')}</p>
  </details>;
}
