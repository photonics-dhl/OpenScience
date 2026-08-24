'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { ResearchWorkspaceNav } from '@/components/research/ResearchWorkspaceNav';
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

  return (
    <WorkspaceShell
      activeMobilePlane={mobileTab === 'outline' ? 'left' : mobileTab === 'panel' ? 'right' : 'main'}
      leftRail={outline}
      mainClassName="p-0 lg:p-0"
      mobileNavigation={
        <div className="fixed inset-x-0 bottom-0 z-(--z-header) border-t border-os-rule-paper bg-os-paper pb-[max(.5rem,env(safe-area-inset-bottom))] pl-2 pr-2 pt-2 lg:hidden" data-mobile-workspace-navigation="true">
          <MobileTabs active={mobileTab} onSelect={setMobileTab} />
        </div>
      }
      navigationLabel={t('workspaceNavigation')}
      objectHeader={header}
      rightRail={aside}
      skipLabel={t('skipToWorkspace')}
      workspaceModes={
        <ResearchWorkspaceNav active="sdf" objectId={objectId} />
      }
    >
      <div className="min-h-[calc(100dvh-13.25rem)] px-4 pb-24 pt-5 lg:min-h-[calc(100dvh-10.25rem)] lg:p-8">{main}</div>
    </WorkspaceShell>
  );
}
