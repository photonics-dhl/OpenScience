'use client';

import { useTranslations } from 'next-intl';

export type MobileTab = 'outline' | 'edit' | 'panel';

export default function MobileTabs({ active, onSelect }: { active: MobileTab; onSelect: (tab: MobileTab) => void }) {
  const t = useTranslations('editor');
  const tabs: Array<{ key: MobileTab; label: string; number: string }> = [
    { key: 'outline', label: t('outline'), number: '01' },
    { key: 'edit', label: t('coreEdit'), number: '02' },
    { key: 'panel', label: t('suggestions'), number: '03' },
  ];
  return (
    <nav className="grid grid-cols-3 gap-px bg-os-rule-dark" aria-label={t('mobileWorkspaceNavigation')}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={active === tab.key
            ? 'min-h-12 border-0 bg-os-paper px-2 font-data text-[10px] uppercase tracking-[0.08em] text-os-ink'
            : 'min-h-12 border-0 bg-os-black-0 px-2 font-data text-[10px] uppercase tracking-[0.08em] text-os-muted-dark'}
          onClick={() => onSelect(tab.key)}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          <span className="mr-1" aria-hidden="true">{tab.number}</span>{tab.label}
        </button>
      ))}
    </nav>
  );
}
