'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { WorkspaceMode } from './WorkspaceContext';

const MODES: WorkspaceMode[] = ['overview', 'sdf', 'artifacts', 'versions', 'collaboration', 'public'];

function modeHref(roId: string, mode: WorkspaceMode) {
  if (mode === 'overview') return `/research-objects/${roId}/workspace`;
  if (mode === 'collaboration') return `/research-objects/${roId}/collab`;
  if (mode === 'public') return `/research/${roId}`;
  return `/research-objects/${roId}/edit${mode === 'sdf' ? '' : `#${mode}`}`;
}

export default function WorkspaceModeNav({ roId, active, mobile = false }: { roId: string; active: WorkspaceMode; mobile?: boolean }) {
  const t = useTranslations('workspace');
  return (
    <nav className={mobile ? 'workspace-mobile-nav' : 'workspace-mode-nav'} aria-label={t('title')}>
      {MODES.map((mode, index) => (
        <Link
          href={modeHref(roId, mode)}
          key={mode}
          data-workspace-mode={mode}
          aria-current={active === mode ? 'page' : undefined}
          className={active === mode ? 'active' : undefined}
        >
          <span className="workspace-mode-index">{String(index + 1).padStart(2, '0')}</span>
          <span>{t(`mode.${mode}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
