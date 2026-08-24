import * as React from 'react';

import { cn } from '@/lib/utils';
import { ShellHeader, SkipLink } from './ShellPrimitives';

export interface IdentityShellProps extends React.HTMLAttributes<HTMLDivElement> {
  context?: React.ReactNode;
  mainClassName?: string;
  skipLabel: string;
}

function IdentityShell({ children, className, context, mainClassName, skipLabel, ...props }: IdentityShellProps) {
  return (
    <div className={cn('surface-folio min-h-dvh', className)} data-os-surface="identity" {...props}>
      <SkipLink tone="paper">{skipLabel}</SkipLink>
      <ShellHeader tone="paper" />
      <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(18rem,0.8fr)_minmax(30rem,1.2fr)]">
        <aside className="hidden border-r border-os-rule-paper p-8 lg:flex lg:items-end xl:p-12" aria-hidden={!context}>
          {context}
        </aside>
        <main className={cn('flex min-w-0 items-center px-5 py-12 sm:px-10 lg:px-14', mainClassName)} id="main-content" tabIndex={-1}>
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

export { IdentityShell };
