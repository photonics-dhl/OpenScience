'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiRequest } from '@/lib/api';
import styles from './content-management.module.css';

export type TrashResourceKind = 'research_object' | 'session' | 'task' | 'asset' | 'artifact';

export function TrashActionButton({ kind, resourceId, title, published = false, onDone }: {
  kind: TrashResourceKind; resourceId: string; title: string; published?: boolean; onDone?(): void;
}) {
  const t = useTranslations('trash');
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteUnadopted, setDeleteUnadopted] = useState(false);
  async function submit() {
    setBusy(true); setError('');
    try {
      await apiRequest('/api/trash', { method: 'POST', body: JSON.stringify({ kind, resourceId, ...(kind === 'session' ? { deleteUnadopted } : {}) }) });
      dialog.current?.close(); onDone?.();
    } catch { setError(t('operationFailed')); }
    finally { setBusy(false); }
  }
  return <>
    <button className={styles.action} type="button" onClick={() => { setError(''); setDeleteUnadopted(false); dialog.current?.showModal(); }}>{t(published ? 'archive' : 'delete')}</button>
    <dialog className={styles.dialog} ref={dialog} aria-label={t(published ? 'archive' : 'delete')} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2>{t(published ? 'archive' : 'delete')}</h2>
      <p className={styles.itemTitle}>{title}</p>
      <p>{t(published ? 'archiveBody' : kind === 'session' ? 'sessionBody' : 'deleteBody')}</p>
      {kind === 'session' && <label className={styles.checkbox}><input type="checkbox" checked={deleteUnadopted} disabled={busy} onChange={(event) => setDeleteUnadopted(event.target.checked)} />{t('deleteUnadopted')}</label>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button className={styles.action} disabled={busy} type="button" onClick={() => dialog.current?.close()}>{t('cancel')}</button>
        <button className={styles.primary} disabled={busy} type="button" onClick={() => void submit()}>{t(busy ? 'working' : published ? 'archive' : 'moveToTrash')}</button>
      </div>
    </dialog>
  </>;
}
