import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';

export interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> {
  headerActions?: React.ReactNode;
  mainClassName?: string;
  navigationLabel?: string;
  rail?: React.ReactNode;
  skipLabel: string;
}

function DashboardShell({
  children,
  className,
  headerActions,
  mainClassName,
  navigationLabel,
  rail,
  skipLabel,
  ...props
}: DashboardShellProps) {
  return (
    <div className={cn('surface-folio min-h-dvh', className)} data-os-surface="dashboard" {...props}>
      <SkipLink tone="paper">{skipLabel}</SkipLink>
      <ShellHeader actions={headerActions} navigationLabel={navigationLabel} tone="paper" />
      <div className={cn('min-h-[calc(100dvh-3.5rem)]', rail && 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]')}>
        {rail ? <aside className="border-b border-os-rule-paper p-4 lg:border-b-0 lg:border-r lg:p-6">{rail}</aside> : null}
        <main className={cn('min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10', mainClassName)} id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { DashboardShell };
