'use client';

import type { ReactNode } from 'react';

interface SDFNodeProps {
  active: boolean;
  children: ReactNode;
  hint?: string;
  label: string;
  number: number;
  onActivate: () => void;
}

function SDFNode({ active, children, hint, label, number, onActivate }: SDFNodeProps) {
  return (
    <section className="border-b border-os-rule-dark py-5" data-sdf-node={number}>
      <button
        aria-expanded={active}
        className="flex min-h-11 w-full items-center gap-4 border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={onActivate}
        type="button"
      >
        <span className="font-data text-xs text-os-muted-dark">{String(number).padStart(2, '0')}</span>
        <span className="font-editorial text-2xl tracking-[-0.025em] text-os-paper">{label}</span>
        {hint && <span className="ml-auto hidden max-w-xs truncate text-xs text-os-muted-dark sm:block">{hint}</span>}
        <span
          aria-hidden="true"
          className={active ? 'h-2 w-2 bg-os-vermilion' : 'h-2 w-2 border border-os-rule-dark'}
          data-active-vermilion={active ? 'true' : undefined}
        />
      </button>
      {active && <div className="pt-4">{children}</div>}
    </section>
  );
}

export { SDFNode };
