'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createComment,
  createIssue,
  getIssue,
  listIssues,
  updateIssueStatus,
  type Comment,
  type IssueSummary,
} from '../../lib/api';

const ISSUE_KINDS = ['question', 'method_repro', 'failure', 'bug_report', 'suggestion'] as const;

/** P1C-10 Issue 列表 + 创建（§8 概念表 + §18.2 协作区域）。 */
export default function IssueList({
  roId,
  onSelect,
}: {
  roId: string;
  onSelect: (issueId: string) => void;
}) {
  const t = useTranslations('collab');
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<string>('question');

  async function load() {
    try {
      const res = await listIssues(roId);
      setIssues(res.issues ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, [roId]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createIssue(roId, { title: newTitle, kind: newKind });
      setNewTitle('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="collab-panel">
      <div className="collab-create">
        <input
          aria-label={t('issue.newTitle')}
          placeholder={t('issue.newTitle')}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <select aria-label={t('issue.kindLabel')} value={newKind} onChange={(e) => setNewKind(e.target.value)}>
          {ISSUE_KINDS.map((k) => (
            <option key={k} value={k}>{t(`issue.kind.${k}`)}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newTitle.trim()}>
          {t('issue.create')}
        </button>
      </div>
      {error && <div className="error-panel" role="alert">{error}</div>}
      <ul className="collab-list">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button className="collab-row" onClick={() => onSelect(issue.id)}>
              <span className="collab-row-title">{issue.title}</span>
              <span className="collab-row-meta">
                <span className={`issue-badge issue-${issue.status}`}>{t(`issue.status.${issue.status}`)}</span>
                <span>{t('issue.kind.' + issue.kind)}</span>
                <span>{issue.commentCount} 💬</span>
              </span>
            </button>
          </li>
        ))}
        {issues.length === 0 && <li className="collab-empty">{t('issue.empty')}</li>}
      </ul>
    </div>
  );
}

/** P1C-10 Issue 详情 + 评论 + 状态流转（Q2 详情抽屉）。 */
export function IssueDetail({
  roId,
  issueId,
  onBack,
}: {
  roId: string;
  issueId: string;
  onBack: () => void;
}) {
  const t = useTranslations('collab');
  const [issue, setIssue] = useState<(IssueSummary & { comments: Comment[] }) | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setIssue((await getIssue(roId, issueId)).issue);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId, issueId]);

  async function handleComment() {
    if (!comment.trim()) return;
    try {
      await createComment(roId, issueId, comment);
      setComment('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleToggleStatus() {
    if (!issue) return;
    const next = issue.status === 'open' ? 'closed' : 'open';
    try {
      await updateIssueStatus(roId, issueId, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="collab-panel">
      <button className="btn" onClick={onBack}>{t('common.back')}</button>
      {error && <div className="error-panel" role="alert">{error}</div>}
      {issue && (
        <>
          <h3 className="collab-detail-title">{issue.title}</h3>
          <div className="collab-meta">
            <span className={`issue-badge issue-${issue.status}`}>{t(`issue.status.${issue.status}`)}</span>
            <span>{t('issue.kind.' + issue.kind)}</span>
          </div>
          <p className="collab-body">{issue.body || t('issue.noBody')}</p>
          <button className="btn" onClick={handleToggleStatus}>
            {issue.status === 'open' ? t('issue.close') : t('issue.reopen')}
          </button>
          <div className="collab-comments">
            <h4>{t('issue.comments')}</h4>
            {issue.comments.map((c) => (
              <div key={c.id} className="collab-comment">
                <span className="collab-comment-author">{c.authorId}</span>
                <p>{c.body}</p>
              </div>
            ))}
            <div className="collab-create">
              <input
                aria-label={t('issue.addComment')}
                placeholder={t('issue.addComment')}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleComment} disabled={!comment.trim()}>{t('issue.comment')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
