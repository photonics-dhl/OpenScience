'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createPullRequest,
  getPullRequest,
  listBranches,
  listPullRequests,
  mergePullRequest,
  type BranchSummary,
  type PrInput,
  type PullRequestDetail,
} from '../../lib/api';
import { mergeErrorToReasons } from '../../lib/collab-state';

const DEFAULT_PR_INPUT: PrInput = {
  sourceBranchId: '',
  targetBranchId: '',
  title: '',
  changedSdfFields: [],
  changedFiles: [],
  changesMethod: false,
  changesData: false,
  changesConclusion: false,
  newContributors: [],
  dataLicense: 'CC0-1.0',
  codeLicense: 'MIT',
  conflictOfInterest: '无',
  autoChecks: {},
  requestsRelease: false,
};

/** P1C-10 PR 列表 + 创建（§8.2 全声明表单 + §18.2）。 */
export default function PrList({
  roId,
  onSelect,
}: {
  roId: string;
  onSelect: (prId: string) => void;
}) {
  const t = useTranslations('collab');
  const [prs, setPrs] = useState<Array<Omit<PullRequestDetail, 'diff'>>>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PrInput>(DEFAULT_PR_INPUT);

  async function load() {
    try {
      const [prsRes, branchesRes] = await Promise.all([listPullRequests(roId), listBranches(roId)]);
      setPrs(prsRes.pullRequests ?? []);
      setBranches(branchesRes.branches ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId]);

  function update<K extends keyof PrInput>(key: K, value: PrInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate() {
    if (!form.sourceBranchId || !form.targetBranchId || !form.title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createPullRequest(roId, form);
      setForm(DEFAULT_PR_INPUT);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="collab-panel">
      <details className="collab-form">
        <summary className="btn">{t('pr.new')}</summary>
        <div className="collab-create">
          <input aria-label={t('pr.title')} placeholder={t('pr.title')} value={form.title} onChange={(e) => update('title', e.target.value)} />
          <select aria-label={t('pr.source')} value={form.sourceBranchId} onChange={(e) => update('sourceBranchId', e.target.value)}>
            <option value="">{t('pr.source')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select aria-label={t('pr.target')} value={form.targetBranchId} onChange={(e) => update('targetBranchId', e.target.value)}>
            <option value="">{t('pr.target')}</option>
            {branches.filter((b) => b.isDefault).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input aria-label={t('pr.changedFiles')} placeholder={t('pr.changedFiles')} value={form.changedFiles.join(', ')} onChange={(e) => update('changedFiles', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
          <input aria-label={t('pr.changedSdfFields')} placeholder={t('pr.changedSdfFields')} value={form.changedSdfFields.join(', ')} onChange={(e) => update('changedSdfFields', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
          <label className="collab-check">
            <input type="checkbox" checked={form.changesMethod} onChange={(e) => update('changesMethod', e.target.checked)} /> {t('pr.changesMethod')}
          </label>
          <label className="collab-check">
            <input type="checkbox" checked={form.changesData} onChange={(e) => update('changesData', e.target.checked)} /> {t('pr.changesData')}
          </label>
          <label className="collab-check">
            <input type="checkbox" checked={form.changesConclusion} onChange={(e) => update('changesConclusion', e.target.checked)} /> {t('pr.changesConclusion')}
          </label>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>{t('pr.create')}</button>
        </div>
      </details>
      {error && <div className="error-panel" role="alert">{error}</div>}
      <ul className="collab-list">
        {prs.map((pr) => (
          <li key={pr.id}>
            <button className="collab-row" onClick={() => onSelect(pr.id)}>
              <span className="collab-row-title">{pr.title}</span>
              <span className="collab-row-meta">
                <span className={`issue-badge pr-${pr.status}`}>{t(`pr.status.${pr.status}`)}</span>
              </span>
            </button>
          </li>
        ))}
        {prs.length === 0 && <li className="collab-empty">{t('pr.empty')}</li>}
      </ul>
    </div>
  );
}

/** P1C-10 PR 详情：声明 + diff + Review 界面 + Merge（高风险对话框，Q5）。 */
export function PrDetail({
  roId,
  prId,
  onBack,
  onHighRisk,
}: {
  roId: string;
  prId: string;
  onBack: () => void;
  onHighRisk: (reasons: string[]) => void;
}) {
  const t = useTranslations('collab');
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [reviewVerdict, setReviewVerdict] = useState('approve');
  const [reviewBody, setReviewBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setPr((await getPullRequest(roId, prId)).pullRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId, prId]);

  // 页面级 HighRiskDialog confirm → 本组件监听事件重试确认 merge（Q5）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prId: string }>).detail;
      if (detail?.prId === prId) void handleMergeConfirmed();
    };
    window.addEventListener('collab:merge-confirmed', handler);
    return () => window.removeEventListener('collab:merge-confirmed', handler);
  }, [prId]);

  async function handleReview() {
    try {
      const { createReview } = await import('../../lib/api');
      await createReview(roId, prId, { verdict: reviewVerdict, body: reviewBody });
      setReviewBody('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleMerge() {
    try {
      await mergePullRequest(roId, prId, false);
      await load();
    } catch (e) {
      // 高风险（§8.3）：409 reasons → 触发确认对话框（Q5）
      const reasons = mergeErrorToReasons(e);
      if (reasons.length > 0) {
        onHighRisk(reasons);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function handleMergeConfirmed() {
    try {
      await mergePullRequest(roId, prId, true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="collab-panel">
      <button className="btn" onClick={onBack}>{t('common.back')}</button>
      {error && <div className="error-panel" role="alert">{error}</div>}
      {pr && (
        <>
          <h3 className="collab-detail-title">{pr.title}</h3>
          <div className="collab-meta">
            <span className={`issue-badge pr-${pr.status}`}>{t(`pr.status.${pr.status}`)}</span>
            <span>data: {pr.dataLicense} · code: {pr.codeLicense}</span>
          </div>
          <p className="collab-body">{pr.body || t('pr.noBody')}</p>

          <section aria-label={t('pr.declaration')}>
            <h4>{t('pr.declaration')}</h4>
            <ul className="collab-decl">
              <li>{t('pr.changedFiles')}: {pr.changedFiles.join(', ')}</li>
              <li>{t('pr.changedSdfFields')}: {pr.changedSdfFields.join(', ')}</li>
              <li>{t('pr.changesMethod')}: {pr.changesMethod ? t('common.yes') : t('common.no')}</li>
              <li>{t('pr.changesData')}: {pr.changesData ? t('common.yes') : t('common.no')}</li>
              <li>{t('pr.changesConclusion')}: {pr.changesConclusion ? t('common.yes') : t('common.no')}</li>
              <li>{t('pr.requestsRelease')}: {pr.requestsRelease ? t('common.yes') : t('common.no')}</li>
            </ul>
          </section>

          <section aria-label={t('pr.diff')}>
            <h4>{t('pr.diff')}</h4>
            {pr.diff ? (
              <pre className="collab-diff">{JSON.stringify(pr.diff, null, 2).slice(0, 1200)}</pre>
            ) : (
              <p>{t('pr.noDiff')}</p>
            )}
          </section>

          {pr.status === 'open' && (
            <>
              <section aria-label={t('review.title')}>
                <h4>{t('review.title')}</h4>
                <div className="collab-create">
                  <select aria-label={t('review.verdict')} value={reviewVerdict} onChange={(e) => setReviewVerdict(e.target.value)}>
                    <option value="approve">{t('review.verdict.approve')}</option>
                    <option value="request_changes">{t('review.verdict.requestChanges')}</option>
                    <option value="comment">{t('review.verdict.comment')}</option>
                  </select>
                  <input aria-label={t('review.body')} placeholder={t('review.body')} value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} />
                  <button className="btn btn-primary" onClick={handleReview}>{t('review.submit')}</button>
                </div>
              </section>
              <div className="collab-actions">
                <button className="btn btn-primary" onClick={handleMerge}>{t('pr.merge')}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
