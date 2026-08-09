'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useWorkspaceContext } from './WorkspaceContext';

export default function HermesRail() {
  const t = useTranslations('workspace');
  const context = useWorkspaceContext();
  return (
    <aside className="workspace-hermes-rail" data-hermes-approval="required" aria-label={t('hermes.title')}>
      <span className="status-dot" />
      <div><strong>{t('hermes.title')}</strong><small>{t('hermes.context')} · {context.mode}</small></div>
      <span className="workspace-approval-note">{t('hermes.approval')}</span>
    </aside>
  );
}
