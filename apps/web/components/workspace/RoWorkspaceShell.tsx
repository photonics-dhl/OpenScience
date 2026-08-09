'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import HermesRail from './HermesRail';
import WorkspaceModeNav from './WorkspaceModeNav';
import { WorkspaceContextProvider, type WorkspaceContextValue } from './WorkspaceContext';

export default function RoWorkspaceShell({ context, children }: { context: WorkspaceContextValue; children: ReactNode }) {
  const t = useTranslations('workspace');
  return (
    <WorkspaceContextProvider value={context}>
      <div
        className="workspace-cockpit"
        data-workspace-shell
        data-workspace-id={context.workspaceId}
        data-active-mode={context.mode}
        data-permission={context.permission}
      >
        <header className="workspace-shell-header">
          <div className="workspace-shell-identity">
            <span className="eyebrow">OPENSCIENCE / {t('title')}</span>
            <strong>{context.roId}</strong>
          </div>
          <div className="workspace-shell-meta">
            <span className="badge badge-blue">{context.versionId}</span>
            <span className="badge badge-muted">{t('privateDraft')}</span>
            <span className="workspace-permission">{t(context.permission === 'read' ? 'readOnly' : 'editable')}</span>
          </div>
        </header>
        <WorkspaceModeNav roId={context.roId} active={context.mode} />
        <HermesRail />
        <div className="workspace-shell-body">{children}</div>
        <WorkspaceModeNav roId={context.roId} active={context.mode} mobile />
      </div>
    </WorkspaceContextProvider>
  );
}
