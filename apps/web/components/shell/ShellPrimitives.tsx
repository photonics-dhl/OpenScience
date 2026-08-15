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
}

function ShellHeader({ actions, actionsKind = 'navigation', compactBrandOnMobile = false, navigationLabel, tone }: ShellHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-h-14 min-w-0 items-center justify-between gap-3 overflow-hidden border-b px-4 sm:gap-6 sm:px-6 lg:px-8',
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
          className="min-w-0 flex-1 [&_a]:rounded-panel [&_button]:rounded-panel [&_a]:active:translate-y-px [&_button]:active:translate-y-px motion-reduce:[&_a]:transform-none motion-reduce:[&_button]:transform-none"
        >
          {actions}
        </nav>
      ) : (
        <div aria-label={navigationLabel} className="min-w-0 flex-1" role="group">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { ShellHeader, SkipLink };
