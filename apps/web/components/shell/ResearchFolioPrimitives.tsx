import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function FolioContext({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 font-data text-xs leading-5 text-os-muted-paper', className)} data-folio-context="true">{children}</p>;
}

export function FolioTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('m-0 max-w-4xl font-normal text-[clamp(2rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.025em] text-os-ink', className)} data-reading-role="title">{children}</h1>;
}

export function FolioWorkflow({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return <nav aria-label={label} className={cn('border-y border-os-rule-paper py-3', className)} data-folio-workflow="true">{children}</nav>;
}

export function FolioDecision({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('border-l-2 border-os-vermilion-ink pl-4', className)} data-folio-decision="true">{children}</section>;
}
