'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import RoWorkspaceShell from './RoWorkspaceShell';

export default function WorkspaceOverview({ roId }: { roId: string }) {
  const t = useTranslations('workspaceOverview');
  return (
    <RoWorkspaceShell context={{ roId, versionId: 'v0.4', workspaceId: 'pending', mode: 'overview', permission: 'read' }}>
      <main className="workspace-overview" data-workspace-overview>
        <section className="workspace-overview__hero">
          <span className="eyebrow">{t('identity')}</span>
          <h1>{t('title')}</h1>
          <p className="workspace-overview__status"><span className="status-dot" />{t('connectionPending')}</p>
          <p className="workspace-overview__hint">{t('connectionHint')}</p>
        </section>
        <section className="workspace-overview__grid" aria-label={t('title')}>
          <div className="workspace-overview__card"><span className="eyebrow">{t('identity')}</span><strong className="mono">{roId}</strong><small>{t('readOnly')}</small></div>
          <div className="workspace-overview__card"><span className="eyebrow">{t('version')}</span><strong>v0.4</strong><small>{t('readOnly')}</small></div>
          <div className="workspace-overview__card"><span className="eyebrow">{t('permission')}</span><strong>{t('readOnly')}</strong><small>{t('connectionPending')}</small></div>
        </section>
        <nav className="workspace-overview__actions" aria-label={t('title')}>
          <Link className="button-primary" href={`/research-objects/${roId}/edit`}>{t('openEditor')}</Link>
          <Link className="button-secondary" href={`/research-objects/${roId}/collab`}>{t('openCollab')}</Link>
          <Link className="button-secondary" href={`/research/${roId}`}>{t('openPublic')}</Link>
        </nav>
      </main>
    </RoWorkspaceShell>
  );
}
