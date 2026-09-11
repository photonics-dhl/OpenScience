'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiClientError, generatePresentationSceneImage, generatePresentationStoryboard, generatePresentationVideo, getResearchObject, listMyWorkspaces, listPresentationAssets, listVersionClaims, listVersions, type PresentationAsset, type PresentationClaim, type StoryboardRequest, type VersionSummary, type WorkspaceApi } from '@/lib/api';
import { hasCurrentPresentationSources, newestEligibleStoryboard, presentationSources, selectEligiblePresentationClaims, selectPresentationVersion, SubmissionIntent, type PresentationAction } from '@/lib/hermes/presentation-action';
import { getHermesDraftStorage, loadHermesPresentationDraft, saveHermesPresentationDraft, type HermesDraftScope } from '@/lib/hermes/draft-state';

interface Props { researchObjectId: string; requestedVersionId?: string; intent: { action: PresentationAction; instruction: string; sceneIndex?: number }; userId?: string; onBack(): void; onSubmitted(url: string): void; submissionRecords?: Map<string, SubmissionIntent>; onBusyChange?(locked: boolean): void }
const control = 'min-h-11 w-full rounded border border-os-rule-paper bg-os-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';

export function HermesPresentationAction({ researchObjectId: ro, requestedVersionId, intent, userId, onBack, onSubmitted, submissionRecords, onBusyChange }: Props) {
  const t = useTranslations('hermesPresentation'); const locale = useLocale();
  const [data, setData] = useState<{ title: string; versions: VersionSummary[]; workspace?: WorkspaceApi }>();
  const [versionId, setVersionId] = useState(''); const [action, setAction] = useState<PresentationAction>(intent.action);
  const [instruction, setInstruction] = useState(intent.instruction); const [style, setStyle] = useState<StoryboardRequest['style']>('technical');
  const [claims, setClaims] = useState<PresentationClaim[]>([]); const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [parentId, setParentId] = useState(''); const [scene, setScene] = useState(intent.sceneIndex ?? 0);
  const [updateBrief, setUpdateBrief] = useState(false);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState('');
  const localRecords = useRef(new Map<string, SubmissionIntent>()); const records = submissionRecords ?? localRecords.current;
  const submissionController = useRef<AbortController | null>(null);
  const draftScope: HermesDraftScope | null = userId && versionId ? { userId, researchObjectId: ro, versionId, purpose: 'presentation' } : null;

  useEffect(() => {
    let active = true; setReady(false); setError('');
    void Promise.all([getResearchObject(ro), listVersions(ro), listMyWorkspaces()]).then(([research, versions, workspaces]) => {
      if (!active) return;
      setData({ title: research.researchObject.title, versions: versions.versions, workspace: workspaces.find((workspace) => workspace.id === research.researchObject.workspaceId) });
      setVersionId(selectPresentationVersion(versions.versions, requestedVersionId)?.versionId ?? '');
    }).catch(() => active && setError('loadError'));
    return () => { active = false; };
  }, [ro, requestedVersionId]);
  useEffect(() => {
    if (!versionId) return;
    const abort = new AbortController(); setReady(false); setError('');
    void Promise.all([listVersionClaims(ro, versionId, abort.signal), listPresentationAssets(ro, versionId, abort.signal)]).then(([claimResult, assetResult]) => {
      if (abort.signal.aborted) return;
      setClaims(claimResult.claims.filter((claim) => claim.researchObjectId === ro && claim.versionId === versionId));
      setAssets(assetResult.assets.filter((asset) => asset.researchObjectId === ro && asset.versionId === versionId)); setReady(true);
    }).catch(() => !abort.signal.aborted && setError('loadError'));
    return () => abort.abort();
  }, [ro, versionId]);
  useEffect(() => {
    const stored = draftScope ? loadHermesPresentationDraft(getHermesDraftStorage(), draftScope) : null;
    if (stored) { setAction(stored.action); setInstruction(stored.instruction); setStyle(stored.style); setParentId(stored.parentId); setScene(stored.scene); setUpdateBrief(stored.action === 'storyboard.revise'); return; }
    setAction(intent.action); setInstruction(intent.instruction); setStyle('technical'); setParentId(''); setScene(intent.sceneIndex ?? 0); setUpdateBrief(false);
  }, [draftScope?.researchObjectId, draftScope?.userId, draftScope?.versionId, intent.action, intent.instruction, intent.sceneIndex]);

  const version = data?.versions.find((candidate) => candidate.versionId === versionId);
  const canWrite = version?.status === 'draft' && data?.workspace?.status === 'active' && ['owner', 'maintainer', 'author', 'contributor'].includes(data.workspace.role ?? '');
  const eligibleClaimIds = selectEligiblePresentationClaims(claims);
  const uncertainEntry = [...records.entries()].find(([key, record]) => key.startsWith(`${ro}:${versionId}:`) && record.isUncertain);
  const uncertainRecord = uncertainEntry?.[1];
  const replayRequest = uncertainRecord?.request;
  const uncertainDraft = uncertainRecord?.draft;
  const selectedClaimIds = uncertainDraft?.selected ?? eligibleClaimIds;
  const newestParent = newestEligibleStoryboard(assets, action);
  const selectedParent = assets.find((asset) => asset.id === parentId);
  const parent = selectedParent && newestEligibleStoryboard([selectedParent], action) ? selectedParent : newestParent;
  const effectiveAction = replayRequest?.action ?? ((action === 'scene.image' || action === 'video.create') && !parent ? 'storyboard.create'
    : (action === 'scene.image' || action === 'video.create') && updateBrief ? 'storyboard.revise' : action);
  const sourceIds = replayRequest?.sourceIds ?? presentationSources(effectiveAction, selectedClaimIds, parent, scene);
  const sourcesValid = hasCurrentPresentationSources(sourceIds, claims);
  const videoImageIds = parent?.storyboard?.document.scenes.map((_, index) => assets.find((asset) => asset.kind === 'image' && asset.status === 'approved' && asset.sceneImage?.storyboardAssetId === parent.id && asset.sceneImage.sceneIndex === index)?.id ?? '') ?? [];
  const videoReady = Boolean(replayRequest) || effectiveAction !== 'video.create' || Boolean(parent?.canGenerateVideo && videoImageIds.length >= 3 && videoImageIds.every(Boolean));
  const needsInstruction = effectiveAction === 'storyboard.create' || effectiveAction === 'storyboard.revise'; const locked = busy || uncertain || Boolean(uncertainRecord);
  const requestScope = uncertainEntry?.[0] ?? `${ro}:${versionId}:${effectiveAction}`; const scopeRef = useRef(requestScope); scopeRef.current = requestScope;
  const canReplay = Boolean(uncertainDraft && replayRequest && sourcesValid);
  useEffect(() => { if (!uncertainDraft && !parentId && newestParent) setParentId(newestParent.id); }, [newestParent, parentId, uncertainDraft]);
  useEffect(() => { onBusyChange?.(locked); }, [locked, onBusyChange]);
  useEffect(() => {
    const record = records.get(requestScope);
    if (!record?.isUncertain || !record.draft) return;
    setAction(record.draft.action); setInstruction(record.draft.instruction); setStyle(record.draft.style); setParentId(record.draft.parentId); setScene(record.draft.scene); setUpdateBrief(record.draft.updateBrief ?? record.draft.action === 'storyboard.revise'); setUncertain(true);
  }, [records, requestScope]);
  useEffect(() => () => {
    const record = records.get(requestScope);
    if (!record?.isBusy) return;
    submissionController.current?.abort();
    record.fail(true);
  }, [records, requestScope]);
  useEffect(() => { if (!uncertainDraft && draftScope) saveHermesPresentationDraft(getHermesDraftStorage(), draftScope, { action, instruction, style, language: locale === 'zh' ? 'zh' : 'en', selected: eligibleClaimIds, parentId, scene }); }, [action, draftScope, eligibleClaimIds, instruction, locale, parentId, scene, style, uncertainDraft]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canWrite || !ready || !sourcesValid || !videoReady || (needsInstruction && !instruction.trim()) || (uncertain && !canReplay)) return;
    const request = replayRequest?.payload ?? (effectiveAction === 'scene.image' ? { storyboardAssetId: parent!.id, sceneIndex: scene }
      : effectiveAction === 'video.create' ? { profile: 'content-driven-v1' as const, storyboardAssetId: parent!.id, sceneImageAssetIds: videoImageIds }
      : { locale: locale === 'zh' ? 'zh' as const : 'en' as const, style, output: effectiveAction === 'storyboard.revise' ? parent?.storyboard?.output ?? 'image' : action === 'video.create' ? 'video' as const : 'image' as const, instruction: instruction.trim(), ...(effectiveAction === 'storyboard.revise' && parent ? { baseAssetId: parent.id } : {}) });
    const record = records.get(requestScope) ?? new SubmissionIntent(); records.set(requestScope, record); const key = record.begin(JSON.stringify([ro, versionId, effectiveAction, sourceIds, request])); if (!key) return;
    if (!record.isUncertain) {
      record.draft = { action, instruction, style, language: locale === 'zh' ? 'zh' : 'en', selected: [...sourceIds], parentId: parent?.id ?? '', scene, updateBrief };
      record.request = { action: effectiveAction, sourceIds: [...sourceIds], payload: request };
    }
    const activeController = new AbortController(); submissionController.current = activeController;
    setBusy(true); setError('');
    try {
      const result = effectiveAction === 'scene.image' ? await generatePresentationSceneImage(ro, versionId, sourceIds, request as { storyboardAssetId: string; sceneIndex: number }, key, activeController?.signal)
        : effectiveAction === 'video.create' ? await generatePresentationVideo(ro, versionId, sourceIds, request as { profile: 'content-driven-v1'; storyboardAssetId: string; sceneImageAssetIds: string[] }, key, activeController?.signal)
          : await generatePresentationStoryboard(ro, versionId, sourceIds, request as StoryboardRequest, key, activeController?.signal);
      if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
      record.complete(); records.delete(requestScope); setBusy(false); onSubmitted(`/research-objects/${encodeURIComponent(ro)}/edit?${new URLSearchParams({ stage: 'media', version: versionId, task: result.task.id })}`);
    } catch (cause) {
      if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.status === 0 || cause.status === 408 || cause.status === 429 || cause.status >= 500;
      record.fail(ambiguous); setBusy(false); setUncertain(ambiguous); setError(ambiguous ? 'uncertain' : 'submitError');
    }
  }
  return <section className="min-w-0 rounded-xl bg-os-paper p-4 text-os-ink" data-hermes-presentation-action="true">
    <p className="m-0 text-sm font-semibold">{data?.title ?? t('loading')}</p><p className="mt-1 text-xs text-os-muted-paper">{version ? t('versionLabel', { number: version.versionNo, status: version.status }) : t('chooseVersion')}</p>
    <form className="mt-5 space-y-4" onSubmit={submit}><fieldset className="m-0 min-w-0 space-y-4 border-0 p-0" disabled={locked}>
      <div className="grid grid-cols-2 gap-2" aria-label={t('mediaIntent')}>{(['image', 'video'] as const).map((kind) => <button key={kind} className={`min-h-11 rounded border px-3 text-sm ${action === 'video.create' === (kind === 'video') ? 'border-os-ink font-semibold' : 'border-os-rule-paper'}`} type="button" onClick={() => setAction(kind === 'video' ? 'video.create' : parent ? 'scene.image' : 'storyboard.create')}>{t(kind)}</button>)}</div>
      <label className="grid gap-2 text-sm">{t('style')}<select className={control} value={style} onChange={(event) => { setStyle(event.target.value as StoryboardRequest['style']); if ((action === 'scene.image' || action === 'video.create') && parent) setUpdateBrief(true); }}>{(['technical', 'ink', 'watercolor'] as const).map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className="grid gap-2 text-sm">{t('instruction')}<textarea className={`${control} min-h-28`} maxLength={1000} required={needsInstruction} value={instruction} onChange={(event) => { setInstruction(event.target.value); if ((action === 'scene.image' || action === 'video.create') && parent) setUpdateBrief(true); }} /></label>
      {effectiveAction === 'scene.image' && parent?.storyboard ? <label className="grid gap-2 text-sm">{t('scene')}<select className={control} value={scene} onChange={(event) => setScene(Number(event.target.value))}>{parent.storyboard.document.scenes.map((item, index) => <option key={index} value={index}>{index + 1}. {item.title}</option>)}</select></label> : null}
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{t('advanced')}</summary>{parent ? <p className="mt-3 text-xs leading-5 text-os-muted-paper">{t('usingApprovedPlan')}</p> : null}<p className="mt-3 text-xs leading-5 text-os-muted-paper">{t('eligibleSources', { count: selectedClaimIds.length })}</p></details>
    </fieldset>{!canWrite && data ? <p role="status" className="text-sm">{t('readOnly')}</p> : null}{(action === 'scene.image' || action === 'video.create') && !parent ? <p className="text-sm leading-6 text-os-muted-paper">{t('planWillBePrepared')}</p> : null}{effectiveAction === 'storyboard.revise' ? <p className="text-sm leading-6 text-os-muted-paper">{t('briefWillUpdate')}</p> : null}{!selectedClaimIds.length ? <p role="status" className="text-sm leading-6 text-os-muted-paper">{t('needsEligibleSources')}</p> : null}{effectiveAction === 'video.create' && !videoReady ? <p role="status" className="text-sm leading-6 text-os-muted-paper">{t('needsApprovedScenes')}</p> : null}{error ? <p role="alert" className="text-sm text-os-vermilion">{t(error)}</p> : null}<p className="text-xs leading-5 text-os-muted-paper">{t('charge')}</p><button className="min-h-11 w-full rounded bg-os-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !canWrite || !ready || !sourcesValid || !videoReady || (needsInstruction && !instruction.trim()) || (uncertain && !canReplay)} type="submit">{t(busy ? 'submitting' : uncertain ? 'retry' : effectiveAction === 'storyboard.create' && action === 'video.create' ? 'prepareVideoPlan' : effectiveAction === 'storyboard.create' ? 'preparePlan' : effectiveAction === 'storyboard.revise' ? 'updateBrief' : 'confirm')}</button></form>
    <button className="mt-3 min-h-11 px-2 text-sm underline" disabled={locked} onClick={onBack} type="button">{t('back')}</button>
  </section>;
}
