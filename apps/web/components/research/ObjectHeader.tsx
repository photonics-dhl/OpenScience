import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export interface ObjectHeaderProps {
  objectId: string;
  title: string;
  version: number;
  visibility: string;
  saveState: 'dirty' | 'saving' | 'saved' | 'error';
  actions?: ReactNode;
}

function ObjectHeader({ objectId, title, version, visibility, saveState, actions }: ObjectHeaderProps) {
  const t = useTranslations('editor');
  const visibilityLabel = t(`visibility.${visibility}`);
  const saveStateLabel = t(`saveState.${saveState}`);

  return (
    <div
      className="flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden font-data text-[11px] uppercase tracking-[0.1em] text-os-muted-dark"
      data-object-header="true"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="min-w-0 truncate font-sans text-xs font-semibold normal-case tracking-normal text-os-paper sm:text-sm">{title}</strong>
          <span className="shrink-0">v{version}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[9px] sm:text-[10px]">
          <span className="hidden truncate sm:inline">{objectId}</span>
          <span className="hidden sm:inline" aria-hidden="true">/</span>
          <span className="hidden md:inline">{visibilityLabel}</span>
          <span data-save-state={saveState}>{saveStateLabel}</span>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 normal-case tracking-normal">{actions}</div>}
    </div>
  );
}

export { ObjectHeader };
