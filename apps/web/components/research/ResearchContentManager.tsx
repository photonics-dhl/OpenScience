'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiRequest } from '@/lib/api';
import { TrashActionButton, type TrashResourceKind } from './TrashActionButton';
import { useContentLabels } from './useContentLabels';
import styles from './content-management.module.css';

interface ContentItem { kind: TrashResourceKind; resourceId: string; title: string; createdAt: string; adopted: boolean; canDelete: boolean; reason?: string }

export function ResearchContentManager({ researchObjectId, onChanged }: { researchObjectId?: string; onChanged?(item: { kind: string; resourceId: string }): void }) {
  const t = useTranslations('trash');
  const locale = useLocale();
  const labels = useContentLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const path = researchObjectId ? `/api/research-objects/${encodeURIComponent(researchObjectId)}/content-items` : '/api/content-items';
      const loaded = (await apiRequest<{ items: ContentItem[] }>(path)).items;
      setItems([...loaded].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)));
    } catch { setError(t('loadFailed')); }
    finally { setLoading(false); }
  }
  return <>
    <button className={styles.action} type="button" onClick={() => { dialog.current?.showModal(); void load(); }}>{t('manageContent')}</button>
    <dialog className={`${styles.dialog} ${styles.wide}`} ref={dialog} aria-label={t('manageContent')}>
      <header className={styles.heading}><h2>{t('manageContent')}</h2><button className={styles.action} type="button" onClick={() => dialog.current?.close()}>{t('close')}</button></header>
      <p>{t('manageBody')}</p>
      <Link className={styles.link} href="/trash">{t('title')} →</Link>
      {loading ? <p role="status">{t('loading')}</p> : error ? <p role="alert">{error} <button className={styles.action} type="button" onClick={() => void load()}>{t('retry')}</button></p> : items.length === 0 ? <p>{t('contentEmpty')}</p> : <ul className={styles.list}>
        {items.map((item) => {
          const title = labels.title(item);
          return <li className={styles.row} key={`${item.kind}:${item.resourceId}`}>
            <div><strong className={styles.itemTitle} title={title}>{title}</strong><small>{t(`kind.${item.kind}`)} · {new Date(item.createdAt).toLocaleString(locale)}</small>{item.adopted && <small>{t('adopted')}</small>}</div>
            {item.canDelete ? <TrashActionButton kind={item.kind} resourceId={item.resourceId} title={title} onDone={() => { onChanged?.(item); void load(); }} /> : <small>{t('retained')}</small>}
          </li>;
        })}
      </ul>}
    </dialog>
  </>;
}
