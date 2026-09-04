import * as React from 'react';

import { cn } from '@/lib/utils';
import { ProductRouteNavigation, type ProductRouteId } from '@/components/navigation/ProductRouteNavigation';
import { ShellHeader, SkipLink } from './ShellPrimitives';

interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> {
  headerActions?: React.ReactNode;
  mainClassName?: string;
  navigationLabel?: string;
  activeRoute?: ProductRouteId;
  rail?: React.ReactNode;
  skipLabel: string;
}

function DashboardShell({
  children,
  className,
  headerActions,
  mainClassName,
  navigationLabel,
  activeRoute,
  rail,
  skipLabel,
  ...props
}: DashboardShellProps) {
  return (
    <div className={cn('surface-folio min-h-dvh', className)} data-os-surface="dashboard" {...props}>
      <SkipLink tone="paper">{skipLabel}</SkipLink>
      <ShellHeader
        compactBrandOnMobile
        actions={<ProductRouteNavigation active={activeRoute} />}
        navigationLabel={navigationLabel}
        tone="paper"
        utilities={headerActions}
        wrapActionsOnMobile
      />
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
