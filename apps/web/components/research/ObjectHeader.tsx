import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface ObjectHeaderProps {
  objectId: string;
  title: string;
  version: number;
  visibility: string;
  saveState: 'dirty' | 'saving' | 'saved' | 'error';
  actions?: ReactNode;
  metadata?: ReactNode;
}

function ObjectHeader({ title, visibility, saveState, actions, metadata }: ObjectHeaderProps) {
  const t = useTranslations('editor');
  const historyT = useTranslations('editHistory');
  const visibilityLabel = t(`visibility.${visibility}`);
  const saveStateLabel = t(`saveState.${saveState}`);

  return (
    <div
      className="flex w-full min-w-0 flex-col items-stretch justify-between gap-3 text-sm text-os-muted-paper sm:flex-row sm:items-center"
      data-object-header="true"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="min-w-0 break-words text-sm font-semibold leading-6 text-os-ink [overflow-wrap:anywhere] sm:text-base">{title}</strong>
          <span className="shrink-0 text-xs">{historyT('privateDraft')}</span>
        </div>
        {metadata && <p className="my-1 text-sm leading-6" data-object-authors="true">{metadata}</p>}
        <div data-reading-role="caption" className="mt-1 flex min-w-0 items-center gap-2 font-data">
          {visibility === 'invite_only' && <span className="hidden md:inline">{visibilityLabel}</span>}
          <span data-save-state={saveState} role="status">{saveStateLabel}</span>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 normal-case tracking-normal">{actions}</div>}
    </div>
  );
}

export { ObjectHeader };
