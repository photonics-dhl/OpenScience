import type { ReactNode } from 'react';

interface ArtifactRowProps {
  action?: ReactNode;
  meta?: string;
  name: ReactNode;
  status?: string;
}

function ArtifactRow({ action, meta, name, status }: ArtifactRowProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-os-rule-paper py-4 text-sm" data-artifact-row="true">
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="break-words font-medium leading-6 text-os-ink [overflow-wrap:anywhere]">{name}</div>
        {meta || status ? <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-os-muted-paper">
          {status && <span>{status}</span>}
          {meta && <span>{meta}</span>}
        </div> : null}
      </div>
      {action ? <div className="flex min-w-0 flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  );
}

export { ArtifactRow };
