import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';

interface PublicShellProps extends React.HTMLAttributes<HTMLDivElement> {
  headerActions?: React.ReactNode;
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
        tone === 'dark' ? 'surface-workbench' : 'surface-evidence',
        className,
      )}
      data-os-surface="public"
      {...props}
    >
      <SkipLink tone={tone}>{skipLabel}</SkipLink>
      <ShellHeader actions={headerActions} navigationLabel={navigationLabel} tone={tone} wrapActionsOnMobile={wrapHeaderActionsOnMobile} />
      <main className={cn('min-h-[calc(100dvh-3.5rem)]', mainClassName)} id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export { PublicShell };
