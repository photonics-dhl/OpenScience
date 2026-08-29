import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface ObjectHeaderProps {
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
      className="flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden text-sm text-os-muted-paper"
      data-object-header="true"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="min-w-0 truncate text-sm font-semibold text-os-ink sm:text-base">{title}</strong>
          <span className="shrink-0 font-data text-xs">v{version}</span>
        </div>
        <div data-reading-role="caption" className="mt-1 flex min-w-0 items-center gap-2 font-data">
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
