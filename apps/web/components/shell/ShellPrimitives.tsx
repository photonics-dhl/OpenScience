import * as React from 'react';

import { cn } from '@/lib/utils';
import { OpenScienceWordmark } from '@/components/brand/OpenScienceWordmark';

interface SkipLinkProps {
  children: string;
  tone: 'dark' | 'paper';
}

function SkipLink({ children, tone }: SkipLinkProps) {
  return (
    <a
      className={cn(
        'fixed left-3 top-3 z-(--z-modal) -translate-y-20 rounded-control px-4 py-2 text-sm font-semibold transition-transform duration-(--motion-focus) focus:translate-y-0 motion-reduce:transition-none',
        tone === 'dark' ? 'bg-os-paper text-os-ink' : 'bg-os-black-0 text-os-paper',
      )}
      href="#main-content"
    >
      {children}
    </a>
  );
}

interface ShellHeaderProps {
  actionsKind?: 'group' | 'navigation';
  actions?: React.ReactNode;
  compactBrandOnMobile?: boolean;
  navigationLabel?: string;
  tone: 'dark' | 'paper';
  utilities?: React.ReactNode;
  wrapActionsOnMobile?: boolean;
}

function ShellHeader({ actions, actionsKind = 'navigation', compactBrandOnMobile = false, navigationLabel, tone, utilities, wrapActionsOnMobile = false }: ShellHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-h-14 min-w-0 items-center justify-between gap-3 border-b px-4 sm:gap-6 sm:px-6 lg:px-8',
        wrapActionsOnMobile && 'flex-wrap py-1 sm:flex-nowrap sm:py-0',
        tone === 'dark' ? 'border-os-rule-dark' : 'border-os-rule-paper',
      )}
    >
      {compactBrandOnMobile ? (
        <>
          <span className="hidden sm:inline-flex"><OpenScienceWordmark tone={tone} /></span>
          <span className="inline-flex sm:hidden"><OpenScienceWordmark compact tone={tone} /></span>
        </>
      ) : <OpenScienceWordmark tone={tone} />}
      {actions ? actionsKind === 'navigation' ? (
        <nav aria-label={navigationLabel}
          className={cn(
            'ml-auto min-w-0 max-w-full overflow-x-auto overscroll-x-contain [&_a]:rounded-panel [&_button]:rounded-panel [&_a]:active:translate-y-px [&_button]:active:translate-y-px motion-reduce:[&_a]:transform-none motion-reduce:[&_button]:transform-none',
            wrapActionsOnMobile && 'order-3 basis-full sm:order-none sm:basis-auto',
          )}
          data-mobile-navigation-layout={wrapActionsOnMobile ? 'wrapped' : undefined}
          data-hermes-primary-navigation="true"
          data-hermes-protected="true"
        >
          {actions}
        </nav>
      ) : (
        <div aria-label={navigationLabel} className="min-w-0 flex-1" role="group">
          {actions}
        </div>
      ) : null}
      {utilities ? <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0" data-shell-utility="true">{utilities}</div> : null}
    </header>
  );
}

export { ShellHeader, SkipLink };
