'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { VersionRecord } from '@/components/research/VersionRecord';
import { useVersionLabels } from '@/components/research/useVersionLabels';
import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, getResearchObject, getVersionDiff, listVersions, type ResearchObjectSummary, type VersionSummary } from '@/lib/api';

export default function VersionsPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const th = useTranslations('editHistory');
  const statusT = useTranslations('editor.versionStatus');
  const labels = useVersionLabels();
  const queryVersion = useSearchParams().get('version');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<unknown>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  useEffect(() => { void Promise.all([getResearchObject(params.id), listVersions(params.id)]).then(([ro, history]) => { setObject(ro.researchObject); setVersions(history.versions); }).catch(setError); }, [params.id]);
  const publishedVersions = versions.filter((version) => version.publicationNo != null).sort((left, right) => right.publicationNo! - left.publicationNo!);
  const activeVersion = queryVersion ? versions.find((version) => version.versionId === queryVersion) : publishedVersions[0];
  async function compare() { if (selected.length !== 2) return; setError(null); try { setDiff((await getVersionDiff(selected[1], selected[0])).diff); } catch (cause) { setError(cause as Error); } }
  if (error && !object) return <ResearchSurfaceStateShell active="versions" detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} objectId={params.id} title={t('state.errorTitle')} />;
  if (!object) return <ResearchSurfaceStateShell active="versions" detail={t('state.loadingBody')} kind="loading" objectId={params.id} title={t('versions.title')} />;
  return <ResearchSurfaceShell active="versions" object={object} actions={publishedVersions.length > 1 ? <button className="min-h-11 rounded-panel border border-os-rule-dark px-3 text-xs text-os-paper disabled:opacity-40" disabled={selected.length !== 2} onClick={compare}><GitCompareArrows className="mr-2 inline h-4 w-4" />{t('versions.compare')}</button> : undefined}>
    <header><h1 className="font-editorial text-4xl font-normal text-os-paper">{th('publicationHistory')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{th('publicationBody')}</p><Link className="mt-3 inline-flex min-h-11 items-center text-sm text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(params.id)}/edit?history=edit`}>{th('openEditorHistory')}</Link></header>
    {error && <p className="mt-6 border-l-2 border-os-vermilion pl-4 text-sm text-os-paper" role="alert">{error.message}</p>}
    {publishedVersions.length === 0 ? <p className="mt-8 text-sm text-os-muted-dark" data-surface-state="empty">{th('noPublications')}</p> : <div className="mt-8 border-t border-os-rule-dark">{publishedVersions.map((version) => { const checked = selected.includes(version.versionId); return <div className="grid gap-3 border-b border-os-rule-dark py-5 sm:grid-cols-[2rem_5rem_1fr_9rem] sm:items-center" key={version.versionId}><input aria-label={`${t('versions.compare')} ${labels.label(version)}`} checked={checked} className="accent-os-vermilion" onChange={() => setSelected((current) => checked ? current.filter((id) => id !== version.versionId) : [...current.slice(-1), version.versionId])} type="checkbox" /><Link className="font-editorial text-lg font-normal text-os-paper underline" href={`/research-objects/${encodeURIComponent(params.id)}/versions?version=${encodeURIComponent(version.versionId)}`}>{labels.label(version)}</Link><time className="text-sm text-os-muted-dark" dateTime={version.publishedAt ?? undefined}>{labels.date(version.publishedAt)}</time><span className="text-xs text-os-paper">{statusT(version.status)}</span></div>; })}</div>}
    {queryVersion && !versions.some((version) => version.versionId === queryVersion) && <p role="alert">{t('versions.notFound')}</p>}
    {activeVersion?.publicationNo == null && activeVersion && <p className="mt-8 text-sm text-os-muted-dark">{th('privateRecord')}</p>}
    {activeVersion && <VersionRecord key={activeVersion.versionId} researchObjectId={params.id} versionId={activeVersion.versionId} title={labels.label(activeVersion)} />}
    {diff !== null && <section className="mt-8 border border-os-rule-dark p-5" data-version-diff="true"><h2 className="text-sm font-semibold text-os-paper">{t('versions.diff')}</h2><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-os-muted-dark">{JSON.stringify(diff, null, 2)}</pre></section>}
  </ResearchSurfaceShell>;
}
