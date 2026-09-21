'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResearchSurfaceShell } from './ResearchSurfaceShell';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apiRequest, getLicenses, getPublicationReview, getResearchObject, listVersions, listPresentationAssets, presentationAssetContentUrl, publishVersion, runPublicationReview, setVersionLicenses, transitionVersionStatus, type LicenseSet, type PublicationReview, type ResearchObjectSummary, type VersionSummary, type SdfCore, type PresentationAsset } from '@/lib/api';
import { SDF_FIELDS } from '@/lib/suggestions';
import type { HermesConversationAction } from '@/lib/hermes/conversation-action';
import { ScientificText } from '@/components/content/ScientificText';
import { useVersionLabels } from './useVersionLabels';

const defaults: LicenseSet = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };
const control = 'min-h-11 rounded-panel border border-os-rule-paper bg-white px-3 text-sm text-os-ink disabled:opacity-50';

function publicationMedia(assets: PresentationAsset[]): PresentationAsset[] {
  return assets.filter((asset) => asset.status === 'approved' && !asset.storyboard
    && !asset.paperOriginal && asset.generator !== 'OpenScience paper-original figure');
}

export function ResearchPublication({ researchObjectId, selectedVersionId, embedded = false, conversation = false, onConfirmationChange, beforePublish, onPublished }: { researchObjectId: string; selectedVersionId?: string; embedded?: boolean; conversation?: boolean; onConfirmationChange?(action: HermesConversationAction | null): void; beforePublish?(): void; onPublished?(url: string): void }) {
  const t = useTranslations('productSurfaces');
  const tc = useTranslations('hermesConversation');
  const tw = useTranslations('workbench');
  const th = useTranslations('editHistory');
  const versionLabels = useVersionLabels();
  const mediaLabel = (asset: PresentationAsset) => asset.kind === 'video' ? tw('researchVideo') : asset.kind === 'interactive_html' ? tc('publicationInteractive') : tw('coreImage');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState(selectedVersionId ?? '');
  const selected = useMemo(() => versions.find((item) => item.versionId === selectedId), [selectedId, versions]);
  const [licenses, setLicenses] = useState<LicenseSet>(defaults);
  const [review, setReview] = useState<PublicationReview | null>(null);
  const [core, setCore] = useState<SdfCore | null>(null);
  const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
  const [materialNames, setMaterialNames] = useState<string[]>([]);
  const [allowArtifactDownloads, setAllowArtifactDownloads] = useState(false);
  const downloadConflict = allowArtifactDownloads && licenses.data === 'NO-DOWNLOAD';
  const [readyScope, setReadyScope] = useState('');
  const scope = `${researchObjectId}:${selectedId}`;
  const activeScope = useRef(scope); activeScope.current = scope;
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
    setReadyScope(''); setReview(null); setCore(null); setAssets([]); setSelectedAssetIds([]); setMaterialNames([]); setAllowArtifactDownloads(false); setConfirmOpen(false); setPublicUrl(''); setError('');
    if (!selectedId) return;
    void Promise.all([
      getLicenses(researchObjectId, selectedId), getPublicationReview(selectedId),
      apiRequest<{ record: { objectId: string; versionId: string; sdf: SdfCore; manifest?: Array<{ logicalPath: string; downloadAccess?: 'workspace_member' | 'public' }> } }>(`/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(selectedId)}/record`),
      listPresentationAssets(researchObjectId, selectedId),
    ]).then(([licenseResult, reviewResult, recordResult, media]) => {
      if (!active) return;
      if (recordResult.record.objectId !== researchObjectId || recordResult.record.versionId !== selectedId) throw new Error(tw('versionMismatch'));
      setLicenses(licenseResult.licenses ?? defaults); setReview(reviewResult.review); setCore(recordResult.record.sdf);
      const manifest = recordResult.record.manifest ?? [];
      setMaterialNames(manifest.map(item => item.logicalPath));
      setAllowArtifactDownloads(manifest.length > 0 && manifest.every(item => item.downloadAccess === 'public'));
      const approvedAssets = publicationMedia(media.assets);
      setAssets(approvedAssets); setSelectedAssetIds([]); setReadyScope(scope);
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [researchObjectId, selectedId, scope, tw]);

  async function publish() {
    if (!selected || !ready || working || selected.publicationNo != null || downloadConflict) return;
    const target = selected;
    const current = () => activeScope.current === scope;
    setWorking(true); setError('');
    try {
      beforePublish?.();
      await setVersionLicenses(researchObjectId, target.versionId, licenses);
      if (!current()) return;
      const result = await runPublicationReview(target.versionId);
      if (!current()) return;
      setReview(result.review);
      if (result.review.status !== 'passed') { setConfirmOpen(false); return; }
      let status = target.status;
      if (status === 'draft' || status === 'revised') {
        await transitionVersionStatus(target.versionId, 'under_review');
        if (!current()) return;
        status = 'under_review';
        setVersions((items) => items.map((item) => item.versionId === target.versionId ? { ...item, status: 'under_review' } : item));
      }
      if (status === 'under_review') {
        await transitionVersionStatus(target.versionId, 'approved');
        if (!current()) return;
        setVersions((items) => items.map((item) => item.versionId === target.versionId ? { ...item, status: 'approved' } : item));
      }
      // Approval is closed for this version after the status transitions above.
      // Reconcile the displayed media scope before the final irreversible write.
      const latest = await listPresentationAssets(researchObjectId, target.versionId);
      if (!current()) return;
      const reviewed = publicationMedia(latest.assets);
      if (reviewed.length !== assets.length || reviewed.some((asset) => !assets.some((shown) => shown.id === asset.id && shown.updatedAt === asset.updatedAt && shown.contentHash === asset.contentHash))) {
        setAssets(reviewed);
        setSelectedAssetIds((ids) => ids.filter((id) => reviewed.some((asset) => asset.id === id)));
        throw new Error(tc('publicMediaChanged'));
      }
      beforePublish?.();
      const publication = await publishVersion(target.versionId, { allowArtifactDownloads, presentationAssetIds: selectedAssets.map((asset) => asset.id) });
      if (!current()) return;
      const publicationNo = publication.published.publicationNo ?? Number(publication.published.publicVersionId.match(/-v([1-9]\d*)$/u)?.[1]);
      if (!Number.isSafeInteger(publicationNo) || publicationNo < 1) throw new Error(tw('versionMismatch'));
      const url = `/research/${encodeURIComponent(publication.published.publicId)}/v/${publicationNo}`;
      setPublicUrl(url); onPublished?.(url);
      setVersions((items) => items.map((item) => item.versionId === target.versionId ? { ...item, status: 'published', publicationNo, publishedAt: publication.published.publishedAt } : item)); setConfirmOpen(false);
      window.dispatchEvent(new CustomEvent('research-publication-updated', { detail: { researchObjectId } }));
    } catch (cause) {
      if (!current()) return;
      setError(cause instanceof Error ? cause.message : String(cause)); setConfirmOpen(false);
      // A transition may have completed before a later request failed.
      const history = await listVersions(researchObjectId).catch(() => null);
      if (current() && history) setVersions(history.versions);
    } finally { if (current()) setWorking(false); }
  }
  const latestPublish = useRef(publish); latestPublish.current = publish;
  async function resumeEditing() {
    if (!selected || !ready || working || selected.publicationNo != null) return;
    const target = selected;
    const current = () => activeScope.current === scope;
    setWorking(true); setError('');
    try {
      beforePublish?.();
      await transitionVersionStatus(target.versionId, 'draft');
      if (!current()) return;
      setVersions((items) => items.map((item) => item.versionId === target.versionId ? { ...item, status: 'draft' } : item));
      setReview(null);
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally { if (current()) setWorking(false); }
  }
  const latestResume = useRef(resumeEditing); latestResume.current = resumeEditing;
  useEffect(() => {
    if (!conversation || !onConfirmationChange) return;
    onConfirmationChange({ kind: 'publication', ready: ready && !working && !downloadConflict && Boolean(selected) && selected?.publicationNo == null, canDismiss: !working, confirm: () => latestPublish.current(),
      ...(['under_review', 'approved'].includes(selected?.status ?? '') ? { resumeEditing: () => latestResume.current() } : {}),
    });
    return () => onConfirmationChange(null);
  }, [conversation, onConfirmationChange, ready, working, downloadConflict, scope, selected?.status, selected?.publicationNo]);
  const mediaChoice = selected?.publicationNo == null && assets.length > 0 && <fieldset className="mt-4" disabled={working}>
    <legend className="text-sm font-semibold">{tc('publicationMediaChoice')}</legend>
    <p className="mt-2 text-sm leading-6 text-os-muted-paper">{tc('publicationMediaChoiceBody')}</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">{assets.map((asset, index) => {
      const name = tc('publicationMediaItem', { kind: mediaLabel(asset), number: index + 1 });
      const url = presentationAssetContentUrl(researchObjectId, selectedId, asset.id);
      return <div className="min-w-0 rounded-panel border border-os-rule-paper bg-white p-3" key={asset.id}>
        {asset.kind === 'video' ? <video className="h-32 w-full object-contain" controls preload="metadata" aria-label={name} src={url} /> : asset.kind === 'interactive_html' || asset.kind === 'svg' ? <a className="inline-flex min-h-11 items-center text-sm text-os-vermilion-ink underline" href={url} download>{tc('downloadPublicationMedia', { name })}</a> : <a className="block rounded-panel text-sm text-os-vermilion-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href={url} target="_blank" rel="noreferrer" aria-label={tc('viewPublicationMedia', { name })}><img className="h-32 w-full object-contain" src={url} alt={name} loading="lazy" /></a>}
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-os-vermilion-ink" checked={selectedAssetIds.includes(asset.id)} onChange={(event) => {
            const checked = event.target.checked;
            setSelectedAssetIds((ids) => checked ? [...ids, asset.id] : ids.filter((id) => id !== asset.id));
            setConfirmOpen(false);
          }} />
          <span>{tc('includePublicationMedia', { name })}</span>
        </label>
      </div>;
    })}</div>
    <p className="mt-3 text-sm leading-6" aria-live="polite">{tc('publicationMediaSelected', { count: selectedAssets.length })}</p>
  </fieldset>;
  const materialChoice = materialNames.length > 0 && <div className="mt-4 text-sm">
    <details><summary className="cursor-pointer">{tc('publicationMaterials', { count: materialNames.length })}</summary><ul className="mt-2 list-inside list-disc">{materialNames.map((name) => <li className="break-all" key={name}>{name}</li>)}</ul></details>
    {selected?.publicationNo == null && <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-os-vermilion-ink" checked={allowArtifactDownloads} disabled={working} onChange={event => setAllowArtifactDownloads(event.target.checked)} />
      <span>{tc('allowArtifactDownloads')}</span>
    </label>}
    <p className="mt-2 leading-6" aria-live="polite">{tc(allowArtifactDownloads ? 'artifactDownloadsEnabled' : 'artifactDownloadsDisabled')}</p>
    {downloadConflict && <p className="mt-2 text-state-danger" role="alert">{tc('artifactDownloadLicenseConflict')}</p>}
  </div>;
  if (conversation) return <section className="hermes-message hermes-message-assistant" data-conversation-publication="true">
    {error && <p role="alert" className="text-sm text-state-danger">{error}</p>}
    {!ready && !error && <p role="status">{t('state.loadingBody')}</p>}
    {ready && <>
      <p>{selected?.publicationNo != null ? th('alreadyPublic') : tc('publicationScope', { title: object?.title ?? '', count: selectedAssets.length })}</p>
      {selected?.publicationNo == null && <p className="mt-2 text-sm">{th('publicationNumberOnPublish')}</p>}
      <p className="mt-2 text-sm">{t('publish.permanenceBody')}</p>
      <p className="mt-2 text-sm">{tc('publicationLicense', { text: licenses.text, code: licenses.code, data: licenses.data })}</p>
      {mediaChoice}
      {materialChoice}
      {review?.hardBlocks.map((block, index) => <p className="mt-2 text-sm text-state-danger" key={index}>{block.reason}</p>)}
      {['under_review', 'approved'].includes(selected?.status ?? '') && <p className="mt-2 text-sm">{tc('resumePublicationEditing')}</p>}
      <p className="mt-3 text-sm" role="status">{working ? t('publish.checking') : selected?.publicationNo != null ? t('publish.published') : tc('confirmPublicationInChat')}</p>
      {selected?.publicationNo != null && object?.publicId && <Link className="hermes-conversation-link" href={publicUrl || `/research/${encodeURIComponent(object.publicId)}/v/${selected.publicationNo}`}>{tw('openPublic')}</Link>}
    </>}
  </section>;
  const content = <div className="mx-auto max-w-4xl text-os-ink" data-workbench-publication="true">
    <header className="mb-6"><h1 className="text-2xl font-semibold">{tw('publishPreview')}</h1><p className="mt-2 text-sm leading-6 text-os-muted-paper">{tw('publishPreviewBody')}</p></header>
    {!embedded && <label className="mb-5 flex items-center gap-3 text-sm">{t('publish.version')}<select className={`${control} min-w-0 max-w-full`} disabled={working} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{versions.map((item) => <option key={item.versionId} value={item.versionId}>{versionLabels.label(item)}</option>)}</select></label>}
    {error && <p role="alert" className="my-4 border-l-2 border-state-danger pl-4 text-sm">{error}</p>}
    {!selectedId && <p>{t('publish.emptyBody')}</p>}
    {selectedId && !ready && !error && <p role="status">{t('state.loadingBody')}</p>}
    {ready && selected?.publicationNo != null && <section className="my-6"><p className="text-sm leading-6">{th('alreadyPublic')}</p>{publicUrl || object?.publicId ? <Link className="mt-3 inline-flex min-h-11 items-center text-os-vermilion-ink underline" href={publicUrl || `/research/${encodeURIComponent(object!.publicId!)}/v/${selected.publicationNo}`}>{tw('openPublic')}</Link> : null}</section>}
    {ready && core && selected?.publicationNo == null && <>
      {mediaChoice}
      <article className="mt-6 rounded-panel bg-white px-5 py-8 shadow-sm sm:px-8" data-publication-preview="true">
        <p className="text-xs text-os-muted-paper">{tw('previewLabel')} · {selected ? versionLabels.label(selected) : th('privateDraft')}</p>
        {selected?.publicationNo == null && <p className="mt-2 text-xs text-os-muted-paper">{th('publicationNumberOnPublish')}</p>}
        <h2 className="mt-3 font-editorial text-3xl leading-tight">{object?.title}</h2>
        <ScientificText hideSourceMarkers as="p" className="mt-5 border-l-2 border-os-vermilion-ink pl-4 text-lg leading-8">{core.insight}</ScientificText>
        <div className="research-publication-media">{selectedAssets.filter((asset) => ['image', 'chart', 'video'].includes(asset.kind)).map((asset) => <figure className="my-7" key={asset.id}>{asset.kind === 'video' ? <video className="h-auto w-full" controls preload="metadata" aria-label={mediaLabel(asset)} src={presentationAssetContentUrl(researchObjectId, selectedId, asset.id)} /> : <img className="h-auto w-full object-contain" src={presentationAssetContentUrl(researchObjectId, selectedId, asset.id)} alt={mediaLabel(asset)} />}<figcaption className="mt-2 text-sm text-os-muted-paper">{mediaLabel(asset)}</figcaption></figure>)}</div>
        {selectedAssets.filter((asset) => ['interactive_html', 'svg'].includes(asset.kind)).map((asset) => <p className="my-4 text-sm" key={asset.id}><a className="text-os-vermilion-ink underline" href={presentationAssetContentUrl(researchObjectId, selectedId, asset.id)} download>{tc('downloadPublicationMedia', { name: tc('publicationMediaItem', { kind: mediaLabel(asset), number: assets.indexOf(asset) + 1 }) })}</a></p>)}
        {SDF_FIELDS.filter((field) => field !== 'insight').map((field) => <section className="mt-7" key={field}><h3 className="research-section-title">{t(`fields.${field}`)}</h3><ScientificText hideSourceMarkers as="p" className="mt-2 leading-8">{core[field]}</ScientificText></section>)}
      </article>
      {materialChoice}
      <details className="mt-6 rounded-panel bg-os-paper-strong p-4"><summary className="cursor-pointer text-sm font-semibold">{t('publish.licenses')}</summary><p className="mt-3 text-sm leading-6">{tw('rightsNotice')}</p><fieldset className="mt-4 grid gap-4 sm:grid-cols-3" disabled={working || selected?.publicationNo != null}>{(['text', 'code', 'data'] as const).map((type) => <label className="grid gap-2 text-sm" key={type}>{t(`publish.license.${type}`)}<select className={control} value={licenses[type]} onChange={(event) => { setLicenses((current) => ({ ...current, [type]: event.target.value })); setReview(null); }}>{(type === 'text' ? ['CC-BY-4.0', 'CC-BY-NC-4.0', 'ALL-RIGHTS-RESERVED'] : type === 'code' ? ['MIT', 'Apache-2.0', 'GPL-3.0', 'PROPRIETARY'] : ['CC0-1.0', 'CC-BY-4.0', 'NO-DOWNLOAD']).map((license) => <option key={license}>{license}</option>)}</select></label>)}</fieldset></details>
      <div className="mt-6" aria-live="polite">{review && <p className="text-sm">{t(`publish.reviewStatus.${review.status}`)}</p>}{review?.hardBlocks.map((block, index) => <p className="mt-3 text-sm text-state-danger" key={`${block.code}:${index}`}>{block.reason}</p>)}{review?.status === 'blocked' && <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(researchObjectId)}/edit?stage=content`}>{tw('resolveBeforePublish')}</Link>}</div>
      <p className="mt-6 text-xs leading-5 text-os-muted-paper">{t('publish.permanenceBody')}</p>
      <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-end gap-3 border-t border-os-rule-paper bg-os-paper-strong px-3 py-3">
        <button className="min-h-11 w-full rounded-panel bg-os-vermilion-ink px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto" disabled={working || !ready || downloadConflict} onClick={() => setConfirmOpen(true)}>{working ? t('publish.checking') : t('publish.action')}</button>
      </div>
    </>}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent className="max-w-xl rounded-panel bg-os-paper-strong p-6 text-os-ink"><DialogTitle className="text-2xl font-semibold">{t('publish.confirmTitle')}</DialogTitle><DialogDescription className="mt-4 text-base leading-7">{t('publish.confirmBody')}</DialogDescription><p className="mt-3 text-sm leading-6">{tc('publicationMediaSelected', { count: selectedAssets.length })}</p><p className="mt-3 text-sm leading-6">{tw('rightsNotice')}</p>{materialNames.length > 0 && <p className="mt-3 text-sm leading-6">{tc(allowArtifactDownloads ? 'artifactDownloadsEnabled' : 'artifactDownloadsDisabled')}</p>}<div className="mt-6 flex justify-end gap-3"><DialogClose className={control} disabled={working}>{t('publish.cancel')}</DialogClose><button disabled={working || downloadConflict} className="min-h-11 rounded-panel bg-os-vermilion-ink px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void publish()}>{working ? t('publish.checking') : t('publish.confirm')}</button></div></DialogContent></Dialog>
  </div>;
  return embedded || !object ? content : <ResearchSurfaceShell active="publish" object={object}>{content}</ResearchSurfaceShell>;
}
