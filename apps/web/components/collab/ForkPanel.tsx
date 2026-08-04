'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { forkResearchObject, getForkSource, type ForkSource } from '../../lib/api';

/** P1C-10 Fork 入口 + 来源关系展示（§8.1 + §18.2）。 */
export default function ForkPanel({ roId, workspaceId }: { roId: string; workspaceId: string }) {
  const t = useTranslations('collab');
  const [source, setSource] = useState<ForkSource | null>(null);
  const [forked, setForked] = useState<{ id: string; publicId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);

  async function load() {
    try {
      const res = await getForkSource(roId);
      setSource(res.forkSource);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, [roId]);

  async function handleFork() {
    setForking(true);
    setError(null);
    try {
      const res = await forkResearchObject(roId, workspaceId);
      setForked(res.researchObject);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setForking(false);
    }
  }

  return (
    <div className="collab-panel">
      {error && <div className="error-panel" role="alert">{error}</div>}
      {source ? (
        <section aria-label={t('fork.source')}>
          <h3>{t('fork.source')}</h3>
          <dl className="collab-dl">
            <dt>{t('fork.sourceRo')}</dt><dd>{source.sourceRoId}</dd>
            <dt>{t('fork.sourceVersion')}</dt><dd>{source.sourceVersionId}</dd>
            <dt>{t('fork.contentHash')}</dt><dd className="collab-hash">{source.sourceContentHash}</dd>
          </dl>
          <p className="collab-note">{t('fork.sourcePermanent')}</p>
        </section>
      ) : (
        <section aria-label={t('fork.title')}>
          <h3>{t('fork.title')}</h3>
          <p>{t('fork.description')}</p>
          {forked ? (
            <div className="collab-success" role="status">
              {t('fork.done')} {forked.publicId}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleFork} disabled={forking}>
              {forking ? t('common.loading') : t('fork.action')}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
