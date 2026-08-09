import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';

export interface WorkspaceShellProps extends React.HTMLAttributes<HTMLDivElement> {
  headerActions?: React.ReactNode;
  leftRail?: React.ReactNode;
  mainClassName?: string;
  navigationLabel?: string;
  rightRail?: React.ReactNode;
  skipLabel: string;
}

function WorkspaceShell({
  children,
  className,
  headerActions,
  leftRail,
  mainClassName,
  navigationLabel,
  rightRail,
  skipLabel,
  ...props
}: WorkspaceShellProps) {
  return (
    <div className={cn('surface-workbench min-h-dvh', className)} data-os-surface="workspace" {...props}>
      <SkipLink tone="dark">{skipLabel}</SkipLink>
      <ShellHeader actions={headerActions} navigationLabel={navigationLabel} tone="dark" />
      <div className="grid min-h-[calc(100dvh-3.5rem)] min-w-0 lg:grid-cols-[19fr_56fr_25fr]">
        <section className="min-w-0 border-b border-os-rule-dark p-4 lg:border-b-0 lg:border-r lg:p-5" data-workspace-plane="19">
          {leftRail}
        </section>
        <main className={cn('min-w-0 p-5 lg:p-7', mainClassName)} data-workspace-plane="56" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <section className="min-w-0 border-t border-os-rule-dark p-4 lg:border-l lg:border-t-0 lg:p-5" data-workspace-plane="25">
          {rightRail}
        </section>
      </div>
    </div>
  );
}

export { WorkspaceShell };
