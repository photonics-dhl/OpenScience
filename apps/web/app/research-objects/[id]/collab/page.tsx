'use client';

import { useEffect, useReducer, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getResearchObject } from '../../../../lib/api';
import { collabReducer, initialCollabState } from '../../../../lib/collab-state';
import CollabTabs from '../../../../components/collab/CollabTabs';
import IssueList, { IssueDetail } from '../../../../components/collab/IssueList';
import PrList, { PrDetail } from '../../../../components/collab/PrList';
import ForkPanel from '../../../../components/collab/ForkPanel';
import AuthorsPanel from '../../../../components/collab/AuthorsPanel';
import NotificationsPanel from '../../../../components/collab/NotificationsPanel';
import HighRiskDialog from '../../../../components/collab/HighRiskDialog';

/** P1C-10 协作区域单页（§2.5 决策 6 GitHub 式 + §18.2 + §18.3 WCAG AA）。 */
export default function CollabPage({ params }: { params: { id: string } }) {
  const t = useTranslations('collab');
  const roId = params.id;
  const [state, dispatch] = useReducer(collabReducer, initialCollabState);
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);

  // 加载 RO + 当前用户是否作者组（简化：先加载 RO，作者组判定后端校验为准）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ro = await getResearchObject(roId);
        if (cancelled) return;
        setWorkspaceId(ro.researchObject.workspaceId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [roId]);

  // 作者组编辑权限：尝试读 author-change-info（后端 403 即非作者组）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/research-objects/${roId}/author-change-info`, { credentials: 'include' });
        if (!cancelled) setIsAuthor(res.ok);
      } catch {
        if (!cancelled) setIsAuthor(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roId]);

  return (
    <div className="collab-page">
      <div className="toolbar">
        <span className="toolbar-title">{t('title')}</span>
      </div>
      {error && <div className="error-panel" role="alert">{error}</div>}
      <CollabTabs tab={state.tab} onChange={(tab) => dispatch({ type: 'set_tab', tab })} />

      <main className="collab-content" aria-label={t('contentLabel')}>
        {state.tab === 'issues' && (
          state.selectedId
            ? <IssueDetail roId={roId} issueId={state.selectedId} onBack={() => dispatch({ type: 'select', id: null })} />
            : <IssueList roId={roId} onSelect={(id) => dispatch({ type: 'select', id })} />
        )}
        {state.tab === 'prs' && (
          state.selectedId
            ? <PrDetail
                roId={roId}
                prId={state.selectedId}
                onBack={() => dispatch({ type: 'select', id: null })}
                onHighRisk={(reasons) => dispatch({ type: 'open_high_risk', prId: state.selectedId!, reasons })}
              />
            : <PrList roId={roId} onSelect={(id) => dispatch({ type: 'select', id })} />
        )}
        {state.tab === 'branches' && <BranchPanel roId={roId} />}
        {state.tab === 'fork' && <ForkPanel roId={roId} workspaceId={workspaceId} />}
        {state.tab === 'authors' && <AuthorsPanel roId={roId} canEdit={isAuthor} />}
        {state.tab === 'notifications' && <NotificationsPanel />}
      </main>

      <HighRiskDialog
        open={state.highRisk.open}
        reasons={state.highRisk.reasons}
        onCancel={() => dispatch({ type: 'close_high_risk' })}
        onConfirm={async () => {
          const prId = state.highRisk.prId;
          dispatch({ type: 'close_high_risk' });
          if (prId) {
            // 触发 PrDetail 的确认 merge——通过重新渲染：PrDetail 用 ref 暴露？简化：事件驱动由 PrDetail 内部处理。
            // 此处通过 storage 事件通知 PrDetail 重试确认 merge（避免跨组件 ref 复杂化）
            window.dispatchEvent(new CustomEvent('collab:merge-confirmed', { detail: { prId } }));
          }
        }}
      />
    </div>
  );
}

/** P1C-10 分支面板（§8 Branch 语义）：列表 + 创建。 */
function BranchPanel({ roId }: { roId: string }) {
  const t = useTranslations('collab');
  const [branches, setBranches] = useState<Array<{ id: string; name: string; isDefault: boolean; commitCount: number }>>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await import('../../../../lib/api').then((m) => m.listBranches(roId));
      setBranches(res.branches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId]);

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await import('../../../../lib/api').then((m) => m.createBranch(roId, name));
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="collab-panel">
      {error && <div className="error-panel" role="alert">{error}</div>}
      <div className="collab-create">
        <input aria-label={t('branches.new')} placeholder={t('branches.new')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim()}>{t('branches.create')}</button>
      </div>
      <ul className="collab-list">
        {branches.map((b) => (
          <li key={b.id} className="collab-row">
            <span className="collab-row-title">{b.name}{b.isDefault && ' ★'}</span>
            <span className="collab-row-meta">{b.commitCount} commits</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
