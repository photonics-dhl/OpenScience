'use client';

import Link from 'next/link';
import { ArrowRight, CircleDot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, getResearchObject, listVersions, type ResearchObjectSummary, type SdfCore, type VersionSummary } from '@/lib/api';

export default function ResearchOverviewPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const [object, setObject] = useState<(ResearchObjectSummary & { sdf: { core: SdfCore } }) | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  useEffect(() => { void Promise.all([getResearchObject(params.id), listVersions(params.id)]).then(([ro, history]) => { setObject(ro.researchObject); setVersions(history.versions); }).catch(setError); }, [params.id]);
  if (error) return <ResearchSurfaceStateShell active="overview" detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} objectId={params.id} title={t(error instanceof ApiClientError && error.status === 403 ? 'state.forbiddenTitle' : 'state.errorTitle')} />;
  if (!object) return <ResearchSurfaceStateShell active="overview" detail={t('state.loadingBody')} kind="loading" objectId={params.id} title={t('overview.title')} />;
  const core = object.sdf.core;
  const entries = (['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const).filter((field) => core[field]?.trim());
  return <ResearchSurfaceShell active="overview" object={object} rail={<div><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('overview.status')}</p><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-os-muted-dark">{t('overview.visibility')}</dt><dd className="mt-1 text-os-paper">{object.visibility}</dd></div><div><dt className="text-os-muted-dark">{t('overview.history')}</dt><dd className="mt-1 text-os-paper">{versions.length}</dd></div></dl></div>}>
    <header className="max-w-3xl"><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">RO / {t('overview.kicker')}</p><h1 className="mt-4 font-editorial text-5xl font-normal leading-none text-os-paper sm:text-6xl">{object.title}</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-os-muted-dark">{t('overview.body')}</p></header>
    {entries.length === 0 ? <div className="mt-12 border-t border-os-rule-dark py-10" data-surface-state="empty"><h2 className="font-editorial text-3xl text-os-paper">{t('overview.emptyTitle')}</h2><p className="mt-3 text-sm text-os-muted-dark">{t('overview.emptyBody')}</p></div> : <ol className="mt-12 border-t border-os-rule-dark">{entries.map((field, index) => <li className="grid gap-3 border-b border-os-rule-dark py-6 sm:grid-cols-[4rem_10rem_1fr]" key={field}><span className="font-data text-[10px] text-os-vermilion">N{String(index + 1).padStart(2, '0')}</span><h2 className="text-sm font-semibold text-os-paper">{t(`fields.${field}`)}</h2><p className="line-clamp-3 text-sm leading-6 text-os-muted-dark">{core[field]}</p></li>)}</ol>}
    <div className="mt-10 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center gap-2 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0" href={`/research-objects/${object.id}/edit`}>{t('overview.continue')}<ArrowRight className="h-4 w-4" /></Link><Link className="inline-flex min-h-11 items-center gap-2 rounded-panel border border-os-rule-dark px-4 text-sm text-os-paper" href={`/research-objects/${object.id}/versions`}><CircleDot className="h-4 w-4" />{t('overview.inspect')}</Link></div>
  </ResearchSurfaceShell>;
}
