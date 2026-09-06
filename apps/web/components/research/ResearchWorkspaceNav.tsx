'use client';

import * as React from 'react';
import styles from './research-nav.module.css';
import { Boxes, FileClock, FileText, FlaskConical, Gauge, Image as ImageIcon, Send, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { researchSurfaceHref, type ProductSurfaceId } from '@/lib/product-surfaces';

type WorkspaceNavId = Exclude<ProductSurfaceId, 'settings'> | 'hermes' | 'presentation';
const items: Array<{ id: WorkspaceNavId; icon: typeof Gauge }> = [
  { id: 'overview', icon: Gauge },
  { id: 'hermes', icon: Sparkles },
  { id: 'presentation', icon: ImageIcon },
  { id: 'sdf', icon: FileText },
  { id: 'files', icon: Boxes },
  { id: 'versions', icon: FileClock },
  { id: 'collaboration', icon: Users },
  { id: 'publish', icon: Send },
  { id: 'sandbox', icon: FlaskConical },
];

export function ResearchWorkspaceNav({ active, objectId }: { active: WorkspaceNavId; objectId: string }) {
  const t = useTranslations('productSurfaces');
  const primaryIds = ['overview', 'sdf', 'presentation', 'files'];
  const renderItem = ({ id, icon: Icon }: typeof items[number]) => <Link
    aria-current={active === id ? 'page' : undefined}
    className={styles.link}
    data-reading-role="control"
    href={id === 'hermes' ? `/research-objects/${encodeURIComponent(objectId)}/hermes` : id === 'presentation' ? `/research-objects/${encodeURIComponent(objectId)}/presentation` : researchSurfaceHref(id, objectId)}
    key={id}
  ><Icon aria-hidden="true" width={16} height={16} strokeWidth={1.6} /><span>{t(`nav.${id}`)}</span></Link>;
  return <nav aria-label={t('navigation')} className={styles.nav} data-research-workspace-nav="true">
    <div className={styles.primary}>{primaryIds.map(id => renderItem(items.find(item => item.id === id)!))}</div>
    <details className={styles.more} key={active}>
      <summary data-active={!primaryIds.includes(active) ? 'true' : undefined}>{primaryIds.includes(active) ? t('nav.more') : t(`nav.${active}`)} <span aria-hidden="true">⌄</span></summary>
      <div className={styles.menu}>{items.filter(item => !primaryIds.includes(item.id)).map(renderItem)}</div>
    </details>
  </nav>;
}
