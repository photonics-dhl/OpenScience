'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

export type TabId =
  | 'overview'
  | 'manuscript'
  | 'methods'
  | 'data'
  | 'figures'
  | 'versions'
  | 'issues'
  | 'pull-requests'
  | 'reviews'
  | 'citations';

const TABS: TabId[] = [
  'overview',
  'manuscript',
  'methods',
  'data',
  'figures',
  'versions',
  'issues',
  'pull-requests',
  'reviews',
  'citations',
];

export function TabNavigation({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  const t = useTranslations('public');
  return (
    <>
      {/* 桌面端：标签导航 */}
      <nav className="pub-tabs" aria-label={t('tabsAriaLabel')}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`pub-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            {t(`tab.${tab}`)}
          </button>
        ))}
      </nav>

      {/* 移动端：下拉选择 */}
      <select
        className="pub-tabs-mobile"
        value={activeTab}
        onChange={(e) => onTabChange(e.target.value as TabId)}
        aria-label={t('selectAriaLabel')}
      >
        {TABS.map((tab) => (
          <option key={tab} value={tab}>
            {t(`tab.${tab}`)}
          </option>
        ))}
      </select>
    </>
  );
}

export function ComingSoonTab({ tabName }: { tabName: string }) {
  const t = useTranslations('public');
  return (
    <div className="pub-coming-soon">
      <h2>{tabName}</h2>
      <p>{t('comingSoon')}</p>
    </div>
  );
}
