import type { ReactNode } from 'react';

interface ArtifactRowProps {
  action?: ReactNode;
  meta?: string;
  name: ReactNode;
  status?: string;
}

function ArtifactRow({ action, meta, name, status }: ArtifactRowProps) {
  return (
    <div className="grid gap-2 border-b border-os-rule-dark py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-baseline" data-artifact-row="true">
      <span className="min-w-0 break-all text-os-paper">{name}</span>
      {meta && <span className="font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark">{meta}</span>}
      {status && <span className="font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark">{status}</span>}
      {action}
    </div>
  );
}

export { ArtifactRow };
