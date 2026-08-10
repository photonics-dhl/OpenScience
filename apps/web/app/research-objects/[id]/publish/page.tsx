'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { ResearchSurfaceShell, SurfaceState } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, getLicenses, getPublicationReview, getResearchObject, listVersions, publishVersion, runPublicationReview, setVersionLicenses, transitionVersionStatus, type LicenseSet, type PublicationReview, type ResearchObjectSummary, type VersionSummary } from '@/lib/api';

const defaults: LicenseSet = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };

export default function PublishPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [licenses, setLicenses] = useState<LicenseSet>(defaults);
  const [review, setReview] = useState<PublicationReview | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishedId, setPublishedId] = useState('');
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const selected = useMemo(() => versions.find((version) => version.versionId === selectedId) ?? versions[0], [selectedId, versions]);
  useEffect(() => { void Promise.all([getResearchObject(params.id), listVersions(params.id)]).then(async ([ro, history]) => { setObject(ro.researchObject); setVersions(history.versions); const latest = history.versions[0]; if (latest) { setSelectedId(latest.versionId); const [licenseResult, reviewResult] = await Promise.all([getLicenses(params.id, latest.versionId), getPublicationReview(latest.versionId)]); if (licenseResult.licenses) setLicenses(licenseResult.licenses); setReview(reviewResult.review); } }).catch(setError); }, [params.id]);
  async function prepare() { if (!selected) return; setWorking(true); setError(null); try { await setVersionLicenses(params.id, selected.versionId, licenses); const result = await runPublicationReview(selected.versionId); setReview(result.review); } catch (cause) { setError(cause as Error); } finally { setWorking(false); } }
  async function publish() { if (!selected) return; setWorking(true); setError(null); try { if (selected.status === 'draft') await transitionVersionStatus(selected.versionId, 'under_review'); if (selected.status === 'draft' || selected.status === 'under_review') await transitionVersionStatus(selected.versionId, 'approved'); const result = await publishVersion(selected.versionId); setPublishedId(result.published.publicVersionId); setVersions((current) => current.map((version) => version.versionId === selected.versionId ? { ...version, status: 'published' } : version)); setConfirmOpen(false); } catch (cause) { setError(cause as Error); } finally { setWorking(false); } }
  if (error && !object) return <SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} />;
  if (!object) return <SurfaceState detail={t('state.loadingBody')} kind="loading" title={t('publish.title')} />;
  return <ResearchSurfaceShell active="publish" object={object} rail={<div><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('publish.permanence')}</p><p className="mt-4 text-sm leading-6 text-os-muted-dark">{t('publish.permanenceBody')}</p></div>}>
    <header><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">{t('publish.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('publish.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{t('publish.body')}</p></header>
    {versions.length === 0 ? <div className="mt-12" data-surface-state="empty"><h2 className="font-editorial text-3xl text-os-paper">{t('publish.emptyTitle')}</h2><p className="mt-3 text-sm text-os-muted-dark">{t('publish.emptyBody')}</p></div> : <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_18rem]">
      <section className="border-t border-os-rule-dark pt-6"><label className="text-xs text-os-muted-dark">{t('publish.version')}<select className="mt-2 min-h-11 w-full border border-os-rule-dark bg-os-black-1 px-3 text-sm text-os-paper" onChange={(event) => setSelectedId(event.target.value)} value={selected?.versionId}>{versions.map((version) => <option key={version.versionId} value={version.versionId}>v{version.versionNo} · {version.status}</option>)}</select></label>
        <fieldset className="mt-8 grid gap-5 sm:grid-cols-3"><legend className="mb-4 text-sm font-semibold text-os-paper">{t('publish.licenses')}</legend>{(['text', 'code', 'data'] as const).map((type) => <label className="text-xs text-os-muted-dark" key={type}>{t(`publish.license.${type}`)}<select className="mt-2 min-h-11 w-full border border-os-rule-dark bg-os-black-1 px-3 text-sm text-os-paper" onChange={(event) => setLicenses((current) => ({ ...current, [type]: event.target.value }))} value={licenses[type]}>{type === 'text' && <><option>CC-BY-4.0</option><option>CC-BY-NC-4.0</option><option>ALL-RIGHTS-RESERVED</option></>}{type === 'code' && <><option>MIT</option><option>Apache-2.0</option><option>GPL-3.0</option><option>PROPRIETARY</option></>}{type === 'data' && <><option>CC0-1.0</option><option>CC-BY-4.0</option><option>NO-DOWNLOAD</option></>}</select></label>)}</fieldset>
        <div className="mt-8 flex flex-wrap gap-3"><button className="min-h-11 rounded-panel border border-os-rule-dark px-4 text-sm text-os-paper disabled:opacity-40" disabled={working || selected?.status === 'published'} onClick={prepare}>{working ? t('publish.checking') : t('publish.review')}</button><button className="min-h-11 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={working || review?.status !== 'passed' || selected?.status === 'published'} onClick={() => setConfirmOpen(true)}>{t('publish.action')}</button></div>
      </section>
      <aside className="border-l border-os-rule-dark pl-5"><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('publish.readiness')}</p><div className="mt-5 flex items-center gap-3 text-sm text-os-paper">{review?.status === 'passed' ? <Check className="h-4 w-4 text-os-vermilion" /> : <ShieldCheck className="h-4 w-4 text-os-muted-dark" />}{review ? t(`publish.reviewStatus.${review.status}`) : t('publish.notReviewed')}</div>{review?.hardBlocks.map((block) => <p className="mt-4 text-xs leading-5 text-os-vermilion" key={block.code}>{block.reason}</p>)}{(selected?.status === 'published' || publishedId) && <p className="mt-5 text-sm leading-6 text-os-paper">{t('publish.published')}<br /><span className="font-data text-xs text-os-muted-dark">{publishedId}</span></p>}</aside>
    </div>}
    {error && <p className="mt-6 border-l-2 border-os-vermilion pl-4 text-sm text-os-paper" role="alert">{error.message}</p>}
    <Dialog.Root onOpenChange={setConfirmOpen} open={confirmOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-os-black-0/80" /><Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-xl -translate-y-1/2 border border-os-rule-dark bg-os-black-1 p-6 text-os-paper sm:p-8" data-review-changes="true"><Dialog.Close className="absolute right-4 top-4 rounded-panel p-2" aria-label={t('publish.close')}><X className="h-4 w-4" /></Dialog.Close><Dialog.Title className="font-editorial text-4xl font-normal">{t('publish.confirmTitle')}</Dialog.Title><Dialog.Description className="mt-4 text-sm leading-6 text-os-muted-dark">{t('publish.confirmBody')}</Dialog.Description><div className="mt-7 flex justify-end gap-3"><Dialog.Close className="min-h-11 rounded-panel border border-os-rule-dark px-4 text-sm">{t('publish.cancel')}</Dialog.Close><button className="min-h-11 rounded-panel bg-os-vermilion px-4 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={working} onClick={publish}>{t('publish.confirm')}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </ResearchSurfaceShell>;
}
