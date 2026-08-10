'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import MobileTabs, { type MobileTab } from './MobileTabs';

export default function EditorLayout({
  header,
  objectId,
  outline,
  main,
  aside,
}: {
  header?: ReactNode;
  objectId: string;
  outline: ReactNode;
  main: ReactNode;
  aside: ReactNode;
}) {
  const t = useTranslations('editor');
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit');
  const [workspaceMode, setWorkspaceMode] = useState<'write' | 'data' | 'versions'>('write');
  function selectMode(mode: 'write' | 'data' | 'versions') {
    setWorkspaceMode(mode);
    setMobileTab(mode === 'versions' ? 'outline' : mode === 'data' ? 'edit' : 'edit');
    const targetId = mode === 'versions' ? 'versions' : mode === 'data' ? 'artifacts' : 'main-content';
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  }
  const modes = [
    { label: t('modeOverview'), available: false },
    { label: t('modeWrite'), action: 'write' as const, active: workspaceMode === 'write' },
    { label: t('modeData'), action: 'data' as const, active: workspaceMode === 'data' },
    { label: t('modeVersions'), action: 'versions' as const, active: workspaceMode === 'versions' },
    { label: t('modeCollaboration'), href: `/research-objects/${objectId}/collab` },
    { label: t('modePublish'), available: false },
  ];

  return (
    <WorkspaceShell
      activeMobilePlane={mobileTab === 'outline' ? 'left' : mobileTab === 'panel' ? 'right' : 'main'}
      leftRail={outline}
      mainClassName="p-0 lg:p-0"
      mobileNavigation={
        <div className="fixed inset-x-0 bottom-0 z-(--z-header) border-t border-os-rule-dark bg-os-black-0 p-2 lg:hidden" data-mobile-workspace-navigation="true">
          <MobileTabs active={mobileTab} onSelect={setMobileTab} />
        </div>
      }
      navigationLabel={t('workspaceNavigation')}
      objectHeader={header}
      rightRail={aside}
      skipLabel={t('skipToWorkspace')}
      workspaceModes={
        <nav aria-label={t('workspaceModes')} className="flex min-w-max items-stretch px-2 sm:px-4">
          {modes.map((mode) => mode.available === false ? (
            <span aria-disabled="true" className="flex min-h-11 cursor-not-allowed items-center border-b-2 border-transparent px-3 font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark opacity-55" key={mode.label} title={t('modeUnavailable')}>{mode.label}</span>
          ) : mode.action ? (
            <button aria-current={mode.active ? 'page' : undefined} className={mode.active ? 'flex min-h-11 items-center border-b-2 border-os-vermilion bg-transparent px-3 font-data text-[10px] uppercase tracking-[0.1em] text-os-paper' : 'flex min-h-11 items-center border-b-2 border-transparent bg-transparent px-3 font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark'} data-mode-target={mode.action} key={mode.label} onClick={() => selectMode(mode.action)} type="button">{mode.label}</button>
          ) : (
            <Link className="flex min-h-11 items-center border-b-2 border-transparent px-3 font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark" href={mode.href!} key={mode.label}>{mode.label}</Link>
          ))}
        </nav>
      }
    >
      <div className="min-h-[calc(100dvh-13.25rem)] px-4 pb-24 pt-5 lg:min-h-[calc(100dvh-10.25rem)] lg:p-8">{main}</div>
    </WorkspaceShell>
  );
}
