'use client';

import { useTranslations } from 'next-intl';
import type { CollabTab } from '../../lib/collab-state';

/** P1C-10 协作区域 tab 导航（§18.2 GitHub 式；移动端横向滚动不裁剪功能 §2.5）。 */
export default function CollabTabs({
  tab,
  onChange,
}: {
  tab: CollabTab;
  onChange: (tab: CollabTab) => void;
}) {
  const t = useTranslations('collab');
  const tabs: Array<{ key: CollabTab; label: string }> = [
    { key: 'issues', label: t('tab.issues') },
    { key: 'prs', label: t('tab.prs') },
    { key: 'branches', label: t('tab.branches') },
    { key: 'fork', label: t('tab.fork') },
    { key: 'authors', label: t('tab.authors') },
    { key: 'notifications', label: t('tab.notifications') },
  ];
  return (
    <nav className="collab-tabs" aria-label={t('navLabel')} role="tablist">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          className={`collab-tab${tab === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
