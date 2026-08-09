'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getCurrentUser, type CurrentUser } from '../../lib/auth';
import {
  ApiClientError,
  listNotifications,
  listResearchObjects,
  listWorkspaces,
  type NotificationView,
  type ResearchObjectSummary,
  type WorkspaceSummary,
} from '../../lib/api';
import EvidenceField from '../landing/EvidenceField';

export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty'; user: CurrentUser; workspace: WorkspaceSummary }
  | { kind: 'ready'; user: CurrentUser; workspace: WorkspaceSummary; researchObjects: ResearchObjectSummary[]; notifications: NotificationView[] };

export function selectPrimaryWorkspace(workspaces: WorkspaceSummary[]): WorkspaceSummary | undefined {
  return workspaces.find((workspace) => workspace.status === 'active' && workspace.type === 'personal')
    ?? workspaces.find((workspace) => workspace.status === 'active');
}

export function DashboardView({ state, onRetry, onLogout }: { state: DashboardState; onRetry?: () => void; onLogout?: () => void }) {
  const t = useTranslations('dashboard');
  const context = state.kind === 'empty' || state.kind === 'ready' ? state : null;
  const primaryRo = state.kind === 'ready' ? state.researchObjects[0] : undefined;
  const unreadCount = state.kind === 'ready' ? state.notifications.length : 0;

  return (
    <main className="cockpit-shell" data-cockpit="dashboard" data-dashboard-state={state.kind}>
      <EvidenceField />
      <div className="cockpit-shell__inner">
        <header className="cockpit-header">
          <div>
            <span className="eyebrow">OpenScience / research cockpit</span>
            <h1>{context ? t('welcome', { name: context.user.displayName }) : t('title')}</h1>
          </div>
          <div className="cockpit-header__status"><span className="status-dot" />{t('hermesReady')}{onLogout && <button className="dashboard-logout" type="button" onClick={onLogout}>{t('logout')}</button>}</div>
        </header>

        {state.kind === 'loading' && (
          <section className="next-action-panel dashboard-state-panel" aria-live="polite">
            <span className="eyebrow">{t('loading.eyebrow')}</span><h2>{t('loading.title')}</h2><p>{t('loading.description')}</p>
          </section>
        )}

        {state.kind === 'error' && (
          <section className="next-action-panel dashboard-state-panel" role="alert">
            <span className="eyebrow">{t('error.eyebrow')}</span><h2>{t('error.title')}</h2><p>{t('error.description')}</p>
            <button className="button button-primary" type="button" onClick={onRetry}>{t('error.retry')}</button>
          </section>
        )}

        {state.kind === 'empty' && (
          <section className="cockpit-grid cockpit-grid--empty">
            <article className="next-action-panel" data-next-action>
              <span className="eyebrow">{t('empty.eyebrow')}</span><h2>{t('empty.title')}</h2><p>{t('empty.description')}</p>
              <Link className="button button-primary" href="/research-objects/new">{t('empty.cta')}</Link>
            </article>
            <aside className="task-rail" data-task-rail>
              <div className="task-rail__heading"><span className="eyebrow">{t('workspace.eyebrow')}</span><span className="badge badge-muted">{state.workspace.role}</span></div>
              <h2>{state.workspace.name}</h2><p>{t('workspace.ready')}</p>
            </aside>
          </section>
        )}

        {state.kind === 'ready' && primaryRo && (
          <section className="cockpit-grid">
            <article className="next-action-panel" data-next-action>
              <span className="eyebrow">{t('nextAction.eyebrow')}</span><h2>{t('nextAction.title')}</h2><p>{t('nextAction.description')}</p>
              <Link className="button button-primary" href={`/research-objects/${primaryRo.id}/workspace`}>{t('nextAction.cta')}</Link>
              <div className="action-progress"><span style={{ width: '68%' }} /></div><small>{t('nextAction.progress')}</small>
            </article>
            <article className="ro-focus-card">
              <div className="ro-focus-card__top"><span className="badge badge-blue">{primaryRo.visibility === 'private' ? t('ro.draft') : primaryRo.visibility}</span><span className="mono">v{primaryRo.version}</span></div>
              <p className="eyebrow">Research object</p><h2>{primaryRo.title}</h2><p className="ro-focus-card__id mono">{primaryRo.publicId ?? primaryRo.id}</p>
              <div className="evidence-ledger"><span>01 PAPER</span><span>02 DATA</span><span>03 CODE</span></div>
              <div className="ro-focus-card__footer"><span>{t('ro.updated')}</span><span className="mono">{t('ro.versioned')}</span></div>
            </article>
            <aside className="task-rail" data-task-rail>
              <div className="task-rail__heading"><span className="eyebrow">{t('tasks.eyebrow')}</span><span className="badge badge-muted">{unreadCount}</span></div>
              <div className="task-item task-item--active"><span className="task-index">01</span><div><strong>{t('tasks.extract')}</strong><small>{t('tasks.extractMeta')}</small></div><span className="task-state" /></div>
              <div className="task-item"><span className="task-index">02</span><div><strong>{t('tasks.review')}</strong><small>{t('tasks.reviewMeta', { count: unreadCount })}</small></div></div>
              <div className="task-item"><span className="task-index">03</span><div><strong>{t('tasks.publish')}</strong><small>{t('tasks.publishMeta')}</small></div></div>
              <Link className="dashboard-secondary-link" href="/research-objects/new">{t('empty.cta')}</Link>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}

export default function DashboardShell() {
  const router = useRouter();
  const [state, setState] = React.useState<DashboardState>({ kind: 'loading' });

  const load = React.useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const user = await getCurrentUser();
      const { workspaces } = await listWorkspaces();
      const workspace = selectPrimaryWorkspace(workspaces);
      if (!workspace) { setState({ kind: 'error' }); return; }
      const [{ researchObjects }, { notifications }] = await Promise.all([
        listResearchObjects(workspace.id),
        listNotifications(true),
      ]);
      setState(researchObjects.length > 0
        ? { kind: 'ready', user, workspace, researchObjects, notifications }
        : { kind: 'empty', user, workspace });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        router.replace('/login?next=/dashboard');
        return;
      }
      setState({ kind: 'error' });
    }
  }, [router]);

  React.useEffect(() => { void load(); }, [load]);
  return <DashboardView state={state} onRetry={() => void load()} onLogout={async () => { await (await import('../../lib/auth')).logoutAccount(); router.replace('/login?next=/dashboard'); }} />;
}
