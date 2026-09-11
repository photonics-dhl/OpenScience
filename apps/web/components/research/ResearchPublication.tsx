'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResearchSurfaceShell } from './ResearchSurfaceShell';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apiRequest, getLicenses, getPublicationReview, getResearchObject, listVersions, listPresentationAssets, presentationAssetContentUrl, publishVersion, runPublicationReview, setVersionLicenses, transitionVersionStatus, type LicenseSet, type PublicationReview, type ResearchObjectSummary, type VersionSummary, type SdfCore, type PresentationAsset } from '@/lib/api';
import { SDF_FIELDS } from '@/lib/suggestions';

const defaults: LicenseSet = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };
const control = 'min-h-11 rounded-panel border border-os-rule-paper bg-white px-3 text-sm text-os-ink disabled:opacity-50';

export function ResearchPublication({ researchObjectId, selectedVersionId, embedded = false }: { researchObjectId: string; selectedVersionId?: string; embedded?: boolean }) {
  const t = useTranslations('productSurfaces');
  const tw = useTranslations('workbench');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState(selectedVersionId ?? '');
  const selected = useMemo(() => versions.find((item) => item.versionId === selectedId), [selectedId, versions]);
  const [licenses, setLicenses] = useState<LicenseSet>(defaults);
  const [review, setReview] = useState<PublicationReview | null>(null);
  const [core, setCore] = useState<SdfCore | null>(null);
  const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [readyScope, setReadyScope] = useState('');
  const scope = `${researchObjectId}:${selectedId}`;
  const ready = readyScope === scope;
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([getResearchObject(researchObjectId), listVersions(researchObjectId)]).then(([ro, history]) => {
      if (!active) return;
      setObject(ro.researchObject); setVersions(history.versions);
      setSelectedId(selectedVersionId ?? history.versions[0]?.versionId ?? '');
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [researchObjectId, selectedVersionId]);

  useEffect(() => {
    let active = true;
    setReadyScope(''); setReview(null); setCore(null); setAssets([]); setConfirmOpen(false); setPublicUrl(''); setError('');
    if (!selectedId) return;
    void Promise.all([
      getLicenses(researchObjectId, selectedId), getPublicationReview(selectedId),
      apiRequest<{ record: { objectId: string; versionId: string; sdf: SdfCore } }>(`/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(selectedId)}/record`),
      listPresentationAssets(researchObjectId, selectedId),
    ]).then(([licenseResult, reviewResult, recordResult, media]) => {
      if (!active) return;
      if (recordResult.record.objectId !== researchObjectId || recordResult.record.versionId !== selectedId) throw new Error(tw('versionMismatch'));
      setLicenses(licenseResult.licenses ?? defaults); setReview(reviewResult.review); setCore(recordResult.record.sdf);
      setAssets(media.assets.filter((asset) => asset.status === 'approved' && !asset.storyboard)); setReadyScope(scope);
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [researchObjectId, selectedId, scope, tw]);

  async function prepare() {
    if (!selected || !ready || working) return;
    setWorking(true); setError('');
    try { await setVersionLicenses(researchObjectId, selected.versionId, licenses); const result = await runPublicationReview(selected.versionId); setReview(result.review); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }
  async function publish() {
    if (!selected || !ready || review?.status !== 'passed' || working) return;
    setWorking(true); setError('');
    try {
      if (selected.status === 'draft') await transitionVersionStatus(selected.versionId, 'under_review');
      if (selected.status === 'draft' || selected.status === 'under_review') await transitionVersionStatus(selected.versionId, 'approved');
      const result = await publishVersion(selected.versionId);
      setPublicUrl(`/research/${encodeURIComponent(result.published.publicId)}/v/${selected.versionNo}`);
      setVersions((current) => current.map((item) => item.versionId === selected.versionId ? { ...item, status: 'published' } : item)); setConfirmOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }
  const content = <div className="mx-auto max-w-4xl text-os-ink" data-workbench-publication="true">
    <header className="mb-6"><h1 className="text-2xl font-semibold">{tw('publishPreview')}</h1><p className="mt-2 text-sm leading-6 text-os-muted-paper">{tw('publishPreviewBody')}</p></header>
    {!embedded && <label className="mb-5 flex items-center gap-3 text-sm">{t('publish.version')}<select className={control} disabled={working} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{versions.map((item) => <option key={item.versionId} value={item.versionId}>v{item.versionNo} · {item.status}</option>)}</select></label>}
    {error && <p role="alert" className="my-4 border-l-2 border-state-danger pl-4 text-sm">{error}</p>}
    {!selectedId && <p>{t('publish.emptyBody')}</p>}
    {selectedId && !ready && !error && <p role="status">{t('state.loadingBody')}</p>}
    {ready && core && <>
      <article className="rounded-panel bg-white px-5 py-8 shadow-sm sm:px-8" data-publication-preview="true">
        <p className="text-xs text-os-muted-paper">{tw('previewLabel')} · v{selected?.versionNo}</p>
        <h2 className="mt-3 font-editorial text-3xl leading-tight">{object?.title}</h2>
        <p className="mt-5 border-l-2 border-os-vermilion-ink pl-4 text-lg leading-8">{core.insight}</p>
        {assets.filter((asset) => asset.kind === 'image' || asset.kind === 'chart').map((asset) => <figure className="my-7" key={asset.id}><img className="h-auto w-full object-contain" src={presentationAssetContentUrl(researchObjectId, selectedId, asset.id)} alt={asset.label} /><figcaption className="mt-2 text-sm text-os-muted-paper">{asset.label}</figcaption></figure>)}
        {SDF_FIELDS.filter((field) => field !== 'insight').map((field) => <section className="mt-7" key={field}><h3 className="text-base font-semibold">{t(`fields.${field}`)}</h3><p className="mt-2 whitespace-pre-wrap leading-8">{core[field]}</p></section>)}
      </article>
      <details className="mt-6 rounded-panel bg-os-paper-strong p-4"><summary className="cursor-pointer text-sm font-semibold">{t('publish.licenses')}</summary><p className="mt-3 text-sm leading-6">{tw('rightsNotice')}</p><fieldset className="mt-4 grid gap-4 sm:grid-cols-3" disabled={working || selected?.status === 'published'}>{(['text', 'code', 'data'] as const).map((type) => <label className="grid gap-2 text-sm" key={type}>{t(`publish.license.${type}`)}<select className={control} value={licenses[type]} onChange={(event) => { setLicenses((current) => ({ ...current, [type]: event.target.value })); setReview(null); }}>{(type === 'text' ? ['CC-BY-4.0', 'CC-BY-NC-4.0', 'ALL-RIGHTS-RESERVED'] : type === 'code' ? ['MIT', 'Apache-2.0', 'GPL-3.0', 'PROPRIETARY'] : ['CC0-1.0', 'CC-BY-4.0', 'NO-DOWNLOAD']).map((license) => <option key={license}>{license}</option>)}</select></label>)}</fieldset></details>
      <div className="mt-6" aria-live="polite">{review && <p className="text-sm">{t(`publish.reviewStatus.${review.status}`)}</p>}{review?.hardBlocks.map((block) => <p className="mt-3 text-sm text-state-danger" key={block.code}>{block.reason}</p>)}</div>
      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-os-rule-paper bg-os-paper-strong px-4 py-4">
        <p className="max-w-lg text-xs leading-5 text-os-muted-paper">{t('publish.permanenceBody')}</p>
        {selected?.status === 'published' ? <span>{publicUrl ? <Link className="min-h-11 text-os-vermilion-ink underline" href={publicUrl}>{tw('openPublic')}</Link> : t('publish.published')}</span> : <button className="min-h-11 rounded-panel bg-os-vermilion-ink px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !ready} onClick={() => review?.status === 'passed' ? setConfirmOpen(true) : void prepare()}>{working ? t('publish.checking') : review?.status === 'passed' ? t('publish.action') : tw('reviewForPublication')}</button>}
      </div>
    </>}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent className="max-w-xl rounded-panel bg-os-paper-strong p-6 text-os-ink"><DialogTitle className="text-2xl font-semibold">{t('publish.confirmTitle')}</DialogTitle><DialogDescription className="mt-4 text-base leading-7">{t('publish.confirmBody')}</DialogDescription><p className="mt-3 text-sm leading-6">{tw('rightsNotice')}</p><div className="mt-6 flex justify-end gap-3"><DialogClose className={control}>{t('publish.cancel')}</DialogClose><button disabled={working} className="min-h-11 rounded-panel bg-os-vermilion-ink px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void publish()}>{t('publish.confirm')}</button></div></DialogContent></Dialog>
  </div>;
  return embedded || !object ? content : <ResearchSurfaceShell active="publish" object={object}>{content}</ResearchSurfaceShell>;
}
