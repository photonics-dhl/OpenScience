import type { ReactNode } from 'react';

export interface EvidenceSnippetProps {
  children: ReactNode;
  label: string;
  source: string;
}

function EvidenceSnippet({ children, label, source }: EvidenceSnippetProps) {
  return (
    <details className="group border-y border-os-rule-dark py-3" data-evidence-snippet="true">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-sm text-os-paper">
        <span>{label}</span>
        <span className="font-data text-[10px] uppercase tracking-[0.12em] text-os-muted-dark">{source}</span>
      </summary>
      <div className="border-l border-os-rule-dark py-3 pl-4 text-sm leading-6 text-os-muted-dark">{children}</div>
    </details>
  );
}

export { EvidenceSnippet };
