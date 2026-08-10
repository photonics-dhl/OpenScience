import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';

export interface WorkspaceShellProps extends React.HTMLAttributes<HTMLDivElement> {
  activeMobilePlane?: 'left' | 'main' | 'right';
  headerActions?: React.ReactNode;
  leftRail?: React.ReactNode;
  mainClassName?: string;
  mobileNavigation?: React.ReactNode;
  navigationLabel?: string;
  objectHeader?: React.ReactNode;
  rightRail?: React.ReactNode;
  skipLabel: string;
  workspaceModes?: React.ReactNode;
}

function WorkspaceShell({
  children,
  className,
  activeMobilePlane = 'main',
  headerActions,
  leftRail,
  mainClassName,
  mobileNavigation,
  navigationLabel,
  objectHeader,
  rightRail,
  skipLabel,
  workspaceModes,
  ...props
}: WorkspaceShellProps) {
  return (
    <div className={cn('surface-workbench min-h-dvh', className)} data-os-surface="workspace" {...props}>
      <SkipLink tone="dark">{skipLabel}</SkipLink>
      <ShellHeader actions={headerActions} actionsKind="group" compactBrandOnMobile navigationLabel={navigationLabel} tone="dark" />
      <div className="flex min-h-16 items-center border-b border-os-rule-dark px-4 sm:px-6 lg:px-8" data-object-context-bar="true">
        {objectHeader}
      </div>
      <div className="min-h-11 overflow-x-auto border-b border-os-rule-dark" data-workspace-mode-tabs="true">
        {workspaceModes}
      </div>
      <div className="grid min-h-[calc(100dvh-10.25rem)] min-w-0 lg:grid-cols-[19fr_56fr_25fr]">
        <section className={cn('min-w-0 border-b border-os-rule-dark p-4 lg:block lg:border-b-0 lg:border-r lg:p-5', activeMobilePlane === 'left' ? 'block' : 'hidden')} data-workspace-plane="19">
          {leftRail}
        </section>
        <main className={cn('min-w-0 p-5 lg:block lg:p-7', activeMobilePlane === 'main' ? 'block' : 'hidden', mainClassName)} data-workspace-plane="56" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <section className={cn('min-w-0 border-t border-os-rule-dark p-4 lg:block lg:border-l lg:border-t-0 lg:p-5', activeMobilePlane === 'right' ? 'block' : 'hidden')} data-workspace-plane="25">
          {rightRail}
        </section>
      </div>
      {mobileNavigation}
    </div>
  );
}

export { WorkspaceShell };
