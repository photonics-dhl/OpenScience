'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { VersionSummary } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ScientificText } from '@/components/content/ScientificText';
import { VersionRecord } from './VersionRecord';
import { useVersionLabels } from './useVersionLabels';
import styles from './EditHistory.module.css';

export function EditHistory({ researchObjectId, versions, open, onOpenChange, dirty, draftToken, restoreBlocked, onRestore, loading = false, loadError = '' }: {
  researchObjectId: string;
  versions: VersionSummary[];
  open: boolean;
  onOpenChange(open: boolean): void;
  dirty: boolean;
  draftToken: string;
  restoreBlocked: boolean;
  onRestore(versionId: string): Promise<void>;
  loading?: boolean;
  loadError?: string;
}) {
  const t = useTranslations('editHistory');
  const labels = useVersionLabels();
  const [selectedId, setSelectedId] = useState('');
  const selected = versions.find((version) => version.versionId === selectedId);
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replaceUnsaved, setReplaceUnsaved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setConfirming(false); setReplaceUnsaved(false); }, [draftToken, selectedId, open]);
  const close = () => { if (!working) onOpenChange(false); };
  async function restore() {
    if (!selected || !ready || working || loading || Boolean(loadError) || restoreBlocked || (dirty && !replaceUnsaved)) return;
    setWorking(true); setError('');
    try { await onRestore(selected.versionId); onOpenChange(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('restoreFailed')); setConfirming(false); }
    finally { setWorking(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!working) onOpenChange(next); }}>
    <DialogContent className={styles.dialog} onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} onPointerDownOutside={(event) => { if (working) event.preventDefault(); }}>
      <header className={styles.header}>
        <div><DialogTitle>{t('title')}</DialogTitle><DialogDescription className={styles.description}>{t('body')}</DialogDescription></div>
        <button type="button" className={styles.button} onClick={close} disabled={working}>{t('close')}</button>
      </header>
      <div className={styles.body}>
        {loading && <p role="status">{t('loading')}</p>}
        {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
        {versions.length === 0 ? <p>{t('empty')}</p> : <ol className={styles.list}>
          {versions.map((version) => <li key={version.versionId}>
            <button type="button" className={styles.entry} aria-pressed={selectedId === version.versionId} disabled={working} onClick={() => { if (selectedId === version.versionId) return; setSelectedId(version.versionId); setReady(false); setError(''); }}>
              <time dateTime={version.createdAt}>{labels.date(version.createdAt)}</time>
              <ScientificText hideSourceMarkers as="span">{labels.summary(version.commitMessage)}</ScientificText>
              <span className={styles.inspect}>{t('inspect')}</span>
            </button>
          </li>)}
        </ol>}
        {selected && <VersionRecord key={selected.versionId} researchObjectId={researchObjectId} versionId={selected.versionId} title={`${labels.date(selected.createdAt)} · ${labels.summary(selected.commitMessage)}`} onReadyChange={setReady} />}
      </div>
      <footer className={styles.footer}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {restoreBlocked && <p role="status">{t('busyDraft')}</p>}
        {selected && !loading && !loadError && (confirming ? <>
          <p>{t('replaceWarning')}</p>
          {dirty && <label className={styles.check}><input type="checkbox" checked={replaceUnsaved} disabled={working} onChange={(event) => setReplaceUnsaved(event.target.checked)} />{t('replaceUnsaved')}</label>}
          <div className={styles.actions}><button className={styles.button} type="button" disabled={working} onClick={() => setConfirming(false)}>{t('keepCurrent')}</button><button className={styles.primary} type="button" disabled={working || restoreBlocked || !ready || (dirty && !replaceUnsaved)} onClick={() => void restore()}>{t(working ? 'restoring' : 'confirmRestore')}</button></div>
        </> : <div className={styles.actions}><button className={styles.primary} type="button" disabled={!ready || restoreBlocked || working} onClick={() => setConfirming(true)}>{t('restore')}</button></div>)}
      </footer>
    </DialogContent>
  </Dialog>;
}
