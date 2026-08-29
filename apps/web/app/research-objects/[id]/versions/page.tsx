'use client';

import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, getResearchObject, getVersionDiff, listVersions, type ResearchObjectSummary, type VersionSummary } from '@/lib/api';

export default function VersionsPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<unknown>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  useEffect(() => { void Promise.all([getResearchObject(params.id), listVersions(params.id)]).then(([ro, history]) => { setObject(ro.researchObject); setVersions(history.versions); }).catch(setError); }, [params.id]);
  async function compare() { if (selected.length !== 2) return; setError(null); try { setDiff((await getVersionDiff(selected[1], selected[0])).diff); } catch (cause) { setError(cause as Error); } }
  if (error && !object) return <ResearchSurfaceStateShell active="versions" detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} objectId={params.id} title={t('state.errorTitle')} />;
  if (!object) return <ResearchSurfaceStateShell active="versions" detail={t('state.loadingBody')} kind="loading" objectId={params.id} title={t('versions.title')} />;
  return <ResearchSurfaceShell active="versions" object={object} actions={<button className="min-h-9 rounded-panel border border-os-rule-dark px-3 text-xs text-os-paper disabled:opacity-40" disabled={selected.length !== 2} onClick={compare}><GitCompareArrows className="mr-2 inline h-4 w-4" />{t('versions.compare')}</button>}>
    <header><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">{t('versions.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('versions.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{t('versions.body')}</p></header>
    {error && <p className="mt-6 border-l-2 border-os-vermilion pl-4 text-sm text-os-paper" role="alert">{error.message}</p>}
    {versions.length === 0 ? <div className="mt-12" data-surface-state="empty"><h2 className="font-editorial text-3xl text-os-paper">{t('versions.emptyTitle')}</h2><p className="mt-3 text-sm text-os-muted-dark">{t('versions.emptyBody')}</p></div> : <div className="mt-10 border-t border-os-rule-dark">{versions.map((version) => { const checked = selected.includes(version.versionId); return <label className="grid cursor-pointer gap-3 border-b border-os-rule-dark py-5 sm:grid-cols-[2rem_5rem_1fr_9rem] sm:items-center" key={version.versionId}><input checked={checked} className="accent-os-vermilion" onChange={() => setSelected((current) => checked ? current.filter((id) => id !== version.versionId) : [...current.slice(-1), version.versionId])} type="checkbox" /><strong className="font-editorial text-2xl font-normal text-os-paper">v{version.versionNo}</strong><span className="text-sm text-os-muted-dark">{version.commitId}</span><span className="font-data text-[10px] uppercase text-os-paper">{version.status}</span></label>; })}</div>}
    {diff !== null && <section className="mt-8 border border-os-rule-dark p-5" data-version-diff="true"><h2 className="text-sm font-semibold text-os-paper">{t('versions.diff')}</h2><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-os-muted-dark">{JSON.stringify(diff, null, 2)}</pre></section>}
  </ResearchSurfaceShell>;
}
