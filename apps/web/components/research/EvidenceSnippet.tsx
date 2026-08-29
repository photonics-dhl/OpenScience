import type { ReactNode } from 'react';

interface EvidenceSnippetProps {
  children: ReactNode;
  label: string;
  source: string;
}

function EvidenceSnippet({ children, label, source }: EvidenceSnippetProps) {
  return (
    <details className="group border-y border-os-rule-dark py-3" data-evidence-snippet="true">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-sm text-os-paper">
        <span>{label}</span>
        <span data-reading-role="caption" className="font-data uppercase tracking-[0.08em] text-os-muted-dark">{source}</span>
      </summary>
      <div className="border-l border-os-rule-dark py-3 pl-4 text-sm leading-6 text-os-muted-dark">{children}</div>
    </details>
  );
}

export { EvidenceSnippet };
