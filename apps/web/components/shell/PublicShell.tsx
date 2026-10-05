import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';
import { HermesShellDockAnchor } from '@/components/hermes/HermesShellDockAnchor';

interface PublicShellProps extends React.HTMLAttributes<HTMLDivElement> {
  headerActions?: React.ReactNode;
  headerUtilities?: React.ReactNode;
  includeHermesDock?: boolean;
  mainClassName?: string;
  navigationLabel?: string;
  skipLabel: string;
  tone?: 'dark' | 'paper';
  wrapHeaderActionsOnMobile?: boolean;
}

function PublicShell({
  children,
  className,
  headerActions,
  headerUtilities,
  includeHermesDock = true,
  mainClassName,
  navigationLabel,
  skipLabel,
  tone = 'dark',
  wrapHeaderActionsOnMobile = false,
  ...props
}: PublicShellProps) {
  return (
    <div
      className={cn(
        'min-h-dvh',
        tone === 'dark' ? 'surface-workbench' : 'surface-evidence surface-product-app',
        className,
      )}
      data-os-surface="public"
      data-surface-role={tone === 'paper' ? 'public-reading' : 'public-workbench'}
      {...props}
    >
      <SkipLink tone={tone}>{skipLabel}</SkipLink>
      <ShellHeader actions={headerActions} utilities={headerUtilities} navigationLabel={navigationLabel} tone={tone} wrapActionsOnMobile={wrapHeaderActionsOnMobile} />
      <main className={cn('min-h-[calc(100dvh-3.5rem)]', mainClassName)} id="main-content" tabIndex={-1}>
        {includeHermesDock ? <HermesShellDockAnchor /> : null}
        {children}
      </main>
    </div>
  );
}

export { PublicShell };
