'use client';

import { useTranslations } from 'next-intl';

export type MobileTab = 'outline' | 'edit' | 'panel';

/** 移动端顶栏 tab（§5.4 三栏功能不删，分步呈现）。 */
export default function MobileTabs({
  active,
  onSelect,
}: {
  active: MobileTab;
  onSelect: (tab: MobileTab) => void;
}) {
  const t = useTranslations('editor');
  const tabs: Array<{ key: MobileTab; label: string }> = [
    { key: 'outline', label: t('outline') },
    { key: 'edit', label: t('coreEdit') },
    { key: 'panel', label: t('suggestions') },
  ];
  return (
    <nav className="mobile-tabs" aria-label="编辑器视图切换">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`mobile-tab ${active === tab.key ? 'active' : ''}`}
          onClick={() => onSelect(tab.key)}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
