'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  addContribution,
  getAuthors,
  getContributions,
  setAuthors,
  type Author,
} from '../../lib/api';

const CREDIT_ROLES = [
  'conceptualization', 'methodology', 'software', 'validation', 'data_curation',
  'visualization', 'writing', 'supervision', 'investigation', 'resources',
  'project_administration', 'funding_acquisition',
] as const;

/** P1C-10 作者与 CRediT 面板（§3.4 + §18.2）：作者名单展示 + 作者组编辑。 */
export default function AuthorsPanel({
  roId,
  canEdit,
}: {
  roId: string;
  /** 作者组判定（后端 getAuthorChangeInfo 语义，前端简化：加载后比对当前用户——由父组件传）。 */
  canEdit: boolean;
}) {
  const t = useTranslations('collab');
  const [authors, setAuthorsList] = useState<Author[]>([]);
  const [contributions, setContributions] = useState<Array<{ id: string; userId: string; creditRole: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>('software');
  const [editing, setEditing] = useState(false);
  const [draftAuthors, setDraftAuthors] = useState<Array<{ userId: string; isCorresponding?: boolean }>>([]);

  async function load() {
    try {
      const [a, c] = await Promise.all([getAuthors(roId), getContributions(roId)]);
      setAuthorsList(a.authors ?? []);
      setContributions(c.contributions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId]);

  function startEdit() {
    setDraftAuthors(authors.map((a) => ({ userId: a.userId, isCorresponding: a.isCorresponding })));
    setEditing(true);
  }

  async function handleSaveAuthors() {
    try {
      const res = await setAuthors(roId, draftAuthors);
      setAuthorsList(res.authors ?? []);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddContribution() {
    try {
      await addContribution(roId, newRole);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="collab-panel">
      {error && <div className="error-panel" role="alert">{error}</div>}
      <section aria-label={t('authors.title')}>
        <h3>{t('authors.title')}</h3>
        <ol className="collab-authors">
          {authors.map((a) => (
            <li key={a.userId}>
              <span>{a.sortOrder + 1}. {a.displayName || a.userId}</span>
              {a.isCorresponding && <span className="issue-badge pr-open">{t('authors.corresponding')}</span>}
            </li>
          ))}
        </ol>
        {authors.length === 0 && <p className="collab-note">{t('authors.empty')}</p>}
        {canEdit && !editing && <button className="btn" onClick={startEdit}>{t('authors.edit')}</button>}
        {canEdit && editing && (
          <div className="collab-create">
            {draftAuthors.map((a, i) => (
              <div key={i} className="collab-author-row">
                <input value={a.userId} disabled aria-label={t('authors.userId')} />
                <label className="collab-check">
                  <input type="checkbox" checked={a.isCorresponding ?? false} onChange={(e) => {
                    const next = [...draftAuthors];
                    next[i] = { ...next[i], isCorresponding: e.target.checked };
                    setDraftAuthors(next);
                  }} /> {t('authors.corresponding')}
                </label>
              </div>
            ))}
            <button className="btn btn-primary" onClick={handleSaveAuthors}>{t('common.save')}</button>
            <button className="btn" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
          </div>
        )}
      </section>
      <section aria-label={t('contributions.title')}>
        <h3>{t('contributions.title')}</h3>
        <ul className="collab-list">
          {contributions.map((c) => (
            <li key={c.id} className="collab-row-meta">
              {c.userId} — {t(`credit.${c.creditRole}`)}
            </li>
          ))}
        </ul>
        <div className="collab-create">
          <select aria-label={t('contributions.role')} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {CREDIT_ROLES.map((r) => (
              <option key={r} value={r}>{t(`credit.${r}`)}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleAddContribution}>{t('contributions.add')}</button>
        </div>
      </section>
    </div>
  );
}
