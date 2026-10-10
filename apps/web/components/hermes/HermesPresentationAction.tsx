'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiClientError, generatePresentationSceneImage, generatePresentationStoryboard, generatePresentationVideo, getCurrentUser, getHermesVideoCapability, getResearchObject, listMyWorkspaces, listPresentationAssets, listVersionClaims, listVersions, type HermesAudioAuditionPreset, type PresentationAsset, type PresentationClaim, type PresentationVideoRequest, type StoryboardRequest, type VersionSummary, type WorkspaceApi } from '@/lib/api';
import { hasCurrentPresentationSources, hasSingleReviewedPaperSource, isEligibleArtStoryboard, newestEligibleStoryboard, presentationAudioAuditionRequest, presentationSources, presentationVideoFrameIds, presentationStoryboardRequest, selectEligiblePresentationClaims, selectPresentationVersion, SubmissionIntent, type PresentationAction } from '@/lib/hermes/presentation-action';
import { getHermesDraftStorage, loadHermesPresentationDraft, saveHermesPresentationDraft, type HermesDraftScope } from '@/lib/hermes/draft-state';
import type { HermesConversationAction } from '@/lib/hermes/conversation-action';
import { useVersionLabels } from '@/components/research/useVersionLabels';

interface Props { researchObjectId: string; requestedVersionId?: string; intent: { action: PresentationAction; instruction: string; sceneIndex?: number; revisionSceneIndex?: number; style?: StoryboardRequest['style']; revisionMode?: 'art'; baseAssetId?: string; figurePlan?: StoryboardRequest['figurePlan'] }; userId?: string; onBack(): void; onSubmitted(url: string): void; submissionRecords?: Map<string, SubmissionIntent>; onBusyChange?(locked: boolean): void; onConfirmationChange?(action: HermesConversationAction | null): void }
const control = 'min-h-11 w-full rounded border border-os-rule-paper bg-os-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';

export function HermesPresentationAction({ researchObjectId: ro, requestedVersionId, intent, userId, onBack, onSubmitted, submissionRecords, onBusyChange, onConfirmationChange }: Props) {
  const t = useTranslations('hermesPresentation'); const locale = useLocale();
  const tc = useTranslations('hermesConversation');
  const versionLabels = useVersionLabels();
  const bootstrapScope = `${userId ?? ''}:${ro}:${requestedVersionId ?? ''}`;
  const [data, setData] = useState<{ scope: string; title: string; versions: VersionSummary[]; workspace?: WorkspaceApi }>();
  const [versionId, setVersionId] = useState(''); const [action, setAction] = useState<PresentationAction>(intent.action);
  const [instruction, setInstruction] = useState(intent.instruction); const [style, setStyle] = useState<StoryboardRequest['style']>(intent.style ?? 'auto');
  const [claims, setClaims] = useState<PresentationClaim[]>([]); const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [parentId, setParentId] = useState(''); const [scene, setScene] = useState(intent.sceneIndex ?? 0);
  const [updateBrief, setUpdateBrief] = useState(false);
  const [revisionMode, setRevisionMode] = useState<StoryboardRequest['revisionMode']>(intent.revisionMode);
  const [revisionSceneIndex, setRevisionSceneIndex] = useState<number | undefined>(intent.revisionSceneIndex);
  const [figurePlan, setFigurePlan] = useState(intent.figurePlan);
  const [audioMode, setAudioMode] = useState(false);
  const [auditionScene, setAuditionScene] = useState(intent.sceneIndex ?? 0);
  const [audioReadRevision, setAudioReadRevision] = useState(0);
  const [audioPreset, setAudioPreset] = useState<{ scope: string; audio: HermesAudioAuditionPreset | null; failed?: boolean }>();
  const intentFigurePlanJson = JSON.stringify(intent.figurePlan);
  const [readyScope, setReadyScope] = useState(''); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState('');
  const localRecords = useRef(new Map<string, SubmissionIntent>()); const records = submissionRecords ?? localRecords.current;
  const submissionController = useRef<AbortController | null>(null);
  const bootstrapReady = Boolean(userId && data?.scope === bootstrapScope);
  const sourceScope = userId && versionId ? `${userId}:${ro}:${versionId}` : '';
  const ready = bootstrapReady && Boolean(sourceScope) && readyScope === sourceScope;
  const draftScope: HermesDraftScope | null = userId && versionId && bootstrapReady ? { userId, researchObjectId: ro, versionId, purpose: 'presentation' } : null;

  useEffect(() => {
    let active = true; setData(undefined); setVersionId(''); setReadyScope(''); setError('');
    if (!userId) return;
    void Promise.all([getResearchObject(ro), listVersions(ro), listMyWorkspaces()]).then(([research, versions, workspaces]) => {
      if (!active) return;
      setData({ scope: bootstrapScope, title: research.researchObject.title, versions: versions.versions, workspace: workspaces.find((workspace) => workspace.id === research.researchObject.workspaceId) });
      setVersionId(selectPresentationVersion(versions.versions, requestedVersionId)?.versionId ?? '');
    }).catch(() => active && setError('loadError'));
    return () => { active = false; };
  }, [ro, requestedVersionId, userId, bootstrapScope]);
  useEffect(() => {
    setReadyScope('');
    if (!sourceScope || !bootstrapReady) return;
    const abort = new AbortController(); setError('');
    void Promise.all([listVersionClaims(ro, versionId, abort.signal), listPresentationAssets(ro, versionId, abort.signal)]).then(([claimResult, assetResult]) => {
      if (abort.signal.aborted) return;
      setClaims(claimResult.claims.filter((claim) => claim.researchObjectId === ro && claim.versionId === versionId));
      setAssets(assetResult.assets.filter((asset) => asset.researchObjectId === ro && asset.versionId === versionId)); setReadyScope(sourceScope);
    }).catch(() => !abort.signal.aborted && setError('loadError'));
    return () => abort.abort();
  }, [ro, versionId, sourceScope, bootstrapReady]);
  useEffect(() => {
    const stored = draftScope ? loadHermesPresentationDraft(getHermesDraftStorage(), draftScope) : null;
    if (stored && !intent.instruction.trim() && !onConfirmationChange) { setAction(stored.action); setInstruction(stored.instruction); setStyle(stored.style); setParentId(stored.parentId); setScene(stored.scene); setUpdateBrief(stored.action === 'storyboard.revise'); setRevisionMode(stored.revisionMode); setRevisionSceneIndex(stored.revisionSceneIndex); setFigurePlan(stored.figurePlan); return; }
    setAction(intent.action); setInstruction(intent.instruction); setStyle(intent.style ?? 'auto'); setParentId(intent.baseAssetId ?? ''); setScene(intent.sceneIndex ?? 0); setUpdateBrief(false); setRevisionMode(intent.revisionMode); setRevisionSceneIndex(intent.revisionSceneIndex); setFigurePlan(intentFigurePlanJson ? JSON.parse(intentFigurePlanJson) as StoryboardRequest['figurePlan'] : undefined);
  }, [draftScope?.researchObjectId, draftScope?.userId, draftScope?.versionId, intent.action, intent.instruction, intent.sceneIndex, intent.revisionSceneIndex, intent.style, intent.revisionMode, intent.baseAssetId, intentFigurePlanJson, onConfirmationChange]);

  const version = data?.versions.find((candidate) => candidate.versionId === versionId);
  const canWrite = bootstrapReady && version?.status === 'draft' && data?.workspace?.status === 'active' && ['owner', 'maintainer', 'author', 'contributor'].includes(data.workspace.role ?? '');
  const eligibleClaimIds = selectEligiblePresentationClaims(claims);
  const uncertainEntry = sourceScope ? [...records.entries()].find(([key, record]) => key.startsWith(`${sourceScope}:`) && record.isUncertain) : undefined;
  const uncertainRecord = uncertainEntry?.[1];
  const replayRequest = uncertainRecord?.request;
  const uncertainDraft = uncertainRecord?.draft;
  const selectedClaimIds = uncertainDraft?.selected ?? eligibleClaimIds;
  const replayVideo = replayRequest?.action === 'video.create' ? replayRequest.payload as PresentationVideoRequest : undefined;
  const selectingAudition = replayVideo ? replayVideo.purpose === 'audio-audition' : action === 'video.create' && audioMode;
  const newestParent = newestEligibleStoryboard(assets, action, selectingAudition);
  const requiredParentId = uncertainDraft?.parentId ?? intent.baseAssetId ?? parentId;
  const selectedParent = assets.find((asset) => asset.id === requiredParentId);
  // A bound art base must never fall back to whichever plan becomes newest before confirmation.
  const baseIsBound = Boolean(intent.baseAssetId || revisionMode === 'art' || uncertainDraft?.revisionMode === 'art'
    || (revisionSceneIndex !== undefined && (action === 'storyboard.revise' || action === 'video.create')));
  const parent = selectedParent && newestEligibleStoryboard([selectedParent], action, selectingAudition) ? selectedParent : baseIsBound ? undefined : newestParent;
  const effectiveAction = replayRequest?.action ?? ((action === 'scene.image' || action === 'video.create') && !parent ? 'storyboard.create'
    : (action === 'scene.image' || action === 'video.create') && (updateBrief || Boolean(instruction.trim())) ? 'storyboard.revise' : action);
  const medium = action === 'video.create' || (action === 'storyboard.revise' && parent?.storyboard?.output === 'video') ? 'video' : 'image';
  const sourceIds = replayRequest?.sourceIds ?? presentationSources(effectiveAction, selectedClaimIds, parent, scene);
  const singlePaperImage = replayRequest
    ? 'narrativeSceneLimit' in replayRequest.payload && replayRequest.payload.narrativeSceneLimit === 1 && 'output' in replayRequest.payload && replayRequest.payload.output === 'image'
    : effectiveAction === 'storyboard.create' && medium === 'image' && !figurePlan && hasSingleReviewedPaperSource(sourceIds, claims);
  const effectiveRevisionMode = replayRequest ? ('revisionMode' in replayRequest.payload ? replayRequest.payload.revisionMode : undefined) : revisionMode;
  const requestLocale = replayRequest && 'locale' in replayRequest.payload && (replayRequest.payload.locale === 'zh' || replayRequest.payload.locale === 'en') ? replayRequest.payload.locale : locale === 'zh' ? 'zh' : 'en';
  const sourceValidationError = !hasCurrentPresentationSources(sourceIds, claims) ? 'needsEligibleSources'
    : effectiveRevisionMode === 'art' && !(effectiveAction === 'storyboard.revise' && Boolean(requiredParentId) && isEligibleArtStoryboard(parent, requestLocale))
      ? parent?.storyboard?.document.scenes.some(item => item.paperOriginal) ? 'artOriginalNeedsRerender' : 'artRequiresCompatiblePlan'
      : null;
  const sourcesValid = sourceValidationError === null;
  const videoImageIds = presentationVideoFrameIds(parent, assets);
  const audition = replayVideo ? replayVideo.purpose === 'audio-audition' : effectiveAction === 'video.create' && audioMode;
  const currentAudioPreset = audioPreset?.scope === sourceScope ? audioPreset : undefined;
  const auditionRequest = presentationAudioAuditionRequest(parent, auditionScene, currentAudioPreset?.audio ?? null);
  const videoReady = Boolean(replayRequest) || effectiveAction !== 'video.create' || (audition ? Boolean(auditionRequest) : Boolean(parent?.canGenerateVideo && videoImageIds.length >= 3 && videoImageIds.every(Boolean)));
  const needsInstruction = effectiveAction === 'storyboard.create' || effectiveAction === 'storyboard.revise'; const locked = busy || uncertain || Boolean(uncertainRecord);
  const requestScope = uncertainEntry?.[0] ?? `${sourceScope}:${effectiveAction}`; const scopeRef = useRef(requestScope); scopeRef.current = requestScope;
  const canReplay = Boolean(uncertainDraft && replayRequest && sourcesValid);
  useEffect(() => { setAudioMode(false); setAudioPreset(undefined); setAuditionScene(intent.sceneIndex ?? 0); setAudioReadRevision(0); }, [sourceScope, intent.sceneIndex]);
  useEffect(() => {
    if (!audioMode || replayRequest || effectiveAction !== 'video.create' || !ready || !canWrite) return;
    const abort = new AbortController(); setAudioPreset(undefined);
    void getHermesVideoCapability(ro, abort.signal).then(capability => {
      if (!abort.signal.aborted) setAudioPreset({ scope: sourceScope, audio: capability.audioAudition?.audio ?? null });
    }).catch(() => !abort.signal.aborted && setAudioPreset({ scope: sourceScope, audio: null, failed: true }));
    return () => abort.abort();
  }, [audioMode, replayRequest, effectiveAction, ready, canWrite, ro, sourceScope, audioReadRevision]);
  useEffect(() => { if (!uncertainDraft && !parentId && !intent.baseAssetId && newestParent) setParentId(newestParent.id); }, [newestParent, parentId, intent.baseAssetId, uncertainDraft]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    const record = records.get(requestScope);
    setBusy(false); setUncertain(Boolean(record?.isUncertain));
    if (!record?.isUncertain || !record.draft) return;
    setAction(record.draft.action); setInstruction(record.draft.instruction); setStyle(record.draft.style); setParentId(record.draft.parentId); setScene(record.draft.scene); setUpdateBrief(record.draft.updateBrief ?? record.draft.action === 'storyboard.revise'); setRevisionMode(record.draft.revisionMode); setRevisionSceneIndex(record.draft.revisionSceneIndex); setFigurePlan(record.draft.figurePlan); setUncertain(true);
  }, [records, requestScope]);
  useEffect(() => () => {
    submissionController.current?.abort();
    submissionController.current = null;
    const record = records.get(requestScope);
    if (record?.isBusy) record.fail(true);
  }, [records, requestScope]);
  useEffect(() => { if (!uncertainDraft && draftScope) saveHermesPresentationDraft(getHermesDraftStorage(), draftScope, { action, instruction, style, language: locale === 'zh' ? 'zh' : 'en', selected: eligibleClaimIds, parentId, scene, ...(revisionMode ? { revisionMode } : {}), ...(effectiveAction === 'storyboard.revise' && parent?.storyboard?.output === 'video' && revisionSceneIndex !== undefined ? { revisionSceneIndex } : {}), ...(figurePlan ? { figurePlan } : {}) }); }, [action, effectiveAction, draftScope, eligibleClaimIds, instruction, locale, parentId, scene, style, revisionMode, revisionSceneIndex, parent?.storyboard?.output, figurePlan, uncertainDraft]);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || submissionController.current || !canWrite || !ready || !sourcesValid || !videoReady || (needsInstruction && !instruction.trim()) || (uncertain && !canReplay)) return;
    const request = replayRequest?.payload ?? (effectiveAction === 'scene.image' ? { storyboardAssetId: parent!.id, sceneIndex: scene }
      : effectiveAction === 'video.create' ? audition ? auditionRequest! : { profile: 'content-driven-v1' as const, storyboardAssetId: parent!.id, sceneImageAssetIds: videoImageIds }
      : presentationStoryboardRequest({ action: effectiveAction, locale: locale === 'zh' ? 'zh' : 'en', style,
        output: action === 'video.create' ? 'video' : 'image', instruction: instruction.trim(), parent,
        figurePlan, revisionMode: effectiveRevisionMode, revisionSceneIndex, singlePaperImage }));
    const activeController = new AbortController(); submissionController.current = activeController;
    setBusy(true); setError('');
    let record: SubmissionIntent | undefined;
    try {
      // An existing uncertain intent must replay its saved request and key,
      // even when new video work is no longer available.
      if (!replayRequest && (effectiveAction === 'video.create' || ('output' in request && request.output === 'video'))) {
        try {
          const capability = await getHermesVideoCapability(ro, activeController.signal);
          if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
          if (audition) {
            const fresh = capability.audioAudition?.audio;
            if (!fresh) { setAudioPreset({ scope: sourceScope, audio: null }); setError('audioAudition.unavailable'); return; }
            const confirmed = currentAudioPreset?.audio;
            if (!confirmed || fresh.provider !== confirmed.provider || fresh.voice !== confirmed.voice || fresh.speed !== confirmed.speed) {
              setAudioPreset({ scope: sourceScope, audio: fresh }); setError('audioAudition.settingsChanged'); return;
            }
          } else if (!capability.canGenerateVideo) { setError('videoUnavailable'); return; }
        } catch {
          if (!activeController.signal.aborted && scopeRef.current === requestScope) setError(audition ? 'audioAudition.availabilityError' : 'videoAvailabilityError');
          return;
        }
      }
      if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
      // Replays keep their paid request, but still belong to the current actor.
      try {
        const viewer = await getCurrentUser({ fresh: true });
        if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
        if (viewer.userId !== userId) { setReadyScope(''); setError('identityChanged'); return; }
      } catch {
        if (!activeController.signal.aborted && scopeRef.current === requestScope) { setReadyScope(''); setError('identityChanged'); }
        return;
      }
      record = records.get(requestScope) ?? new SubmissionIntent(); records.set(requestScope, record);
      const key = record.begin(JSON.stringify([ro, versionId, effectiveAction, sourceIds, request])); if (!key) return;
      if (!record.isUncertain) {
        record.draft = { action, instruction, style, language: locale === 'zh' ? 'zh' : 'en', selected: [...sourceIds], parentId: parent?.id ?? '', scene, updateBrief, ...(effectiveRevisionMode ? { revisionMode: effectiveRevisionMode } : {}), ...(parent?.storyboard?.output === 'video' && revisionSceneIndex !== undefined ? { revisionSceneIndex } : {}), ...(figurePlan ? { figurePlan } : {}) };
        record.request = { action: effectiveAction, sourceIds: [...sourceIds], payload: request };
      }
      const result = effectiveAction === 'scene.image' ? await generatePresentationSceneImage(ro, versionId, sourceIds, request as { storyboardAssetId: string; sceneIndex: number }, key, activeController?.signal)
        : effectiveAction === 'video.create' ? await generatePresentationVideo(ro, versionId, sourceIds, request as PresentationVideoRequest, key, activeController?.signal)
          : await generatePresentationStoryboard(ro, versionId, sourceIds, request as StoryboardRequest, key, activeController?.signal);
      if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
      record.complete(); records.delete(requestScope); setUncertain(false); onSubmitted(`/research-objects/${encodeURIComponent(ro)}/edit?${new URLSearchParams({ stage: 'media', version: versionId, task: result.task.id })}`);
    } catch (cause) {
      if (activeController.signal.aborted || scopeRef.current !== requestScope) return;
      const videoUnavailable = cause instanceof ApiClientError && cause.code === 'VIDEO_UNAVAILABLE';
      const ambiguous = videoUnavailable ? Boolean(replayRequest)
        : !(cause instanceof ApiClientError) || cause.status === 0 || cause.status === 408 || cause.status === 429 || cause.status >= 500;
      record?.fail(ambiguous); setUncertain(ambiguous); setError(ambiguous ? 'uncertain' : videoUnavailable ? 'videoUnavailable' : 'submitError');
    } finally {
      if (submissionController.current === activeController) submissionController.current = null;
      if (!activeController.signal.aborted && scopeRef.current === requestScope) setBusy(false);
    }
  }
  const confirmationReady = !busy && Boolean(canWrite) && ready && sourcesValid && videoReady && (!needsInstruction || Boolean(instruction.trim())) && (!uncertain || canReplay);
  const styleLabel = (value: string) => t.has(value) ? t(value) : value;
  const submittedStyle = replayRequest && 'style' in replayRequest.payload ? replayRequest.payload.style : style;
  const submittedFigurePlan = replayRequest
    ? ('figurePlan' in replayRequest.payload ? replayRequest.payload.figurePlan : undefined)
    : needsInstruction ? figurePlan : undefined;
  const submittedSceneIndex = replayRequest && 'sceneIndex' in replayRequest.payload && typeof replayRequest.payload.sceneIndex === 'number' ? replayRequest.payload.sceneIndex : audition ? auditionScene : scene;
  const auditionStatus = !currentAudioPreset ? 'audioAudition.loading' : currentAudioPreset.failed ? 'audioAudition.availabilityError'
    : !currentAudioPreset.audio ? 'audioAudition.unavailable' : !auditionRequest ? 'audioAudition.needsNarration' : null;
  const submittedAudio = replayVideo?.purpose === 'audio-audition' ? replayVideo.audio : currentAudioPreset?.audio;
  const canChooseAudition = action === 'video.create' && !instruction.trim() && !updateBrief
    && Boolean(newestEligibleStoryboard(assets, action, true));
  const audioControl = effectiveAction === 'video.create' || canChooseAudition ? <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('audioAudition.action')}>
      {([false, true] as const).map(value => <button key={String(value)} type="button" aria-pressed={audition === value} disabled={locked || value && !canChooseAudition}
        className={`min-h-11 rounded border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink ${audition === value ? 'border-os-ink bg-os-ink text-white' : 'border-os-rule-paper bg-os-paper'}`}
        onClick={() => { if (!locked && (!value || canChooseAudition)) { setAudioMode(value); setError(''); } }}>{t(value ? 'audioAudition.mode' : 'audioAudition.fullVideo')}</button>)}
    </div>
    {audition ? <div className="grid gap-3 rounded border border-os-rule-paper p-3">
      {parent?.storyboard ? <label className="grid gap-2 text-sm">{t('audioAudition.scene')}
        <select className={control} aria-label={t('audioAudition.scene')} value={submittedSceneIndex} disabled={locked} onChange={event => setAuditionScene(Number(event.target.value))}>
          {parent.storyboard.document.scenes.map((item, index) => <option key={index} value={index}>{index + 1}. {item.title}</option>)}
        </select>
      </label> : null}
      <div><p className="mb-2 text-xs font-semibold text-os-muted-paper">{t('audioAudition.narration')}</p>
        <blockquote className="m-0 border-l-2 border-os-rule-paper pl-3 text-sm leading-6" aria-label={t('audioAudition.narration')}>{parent?.storyboard?.document.scenes[submittedSceneIndex]?.narration}</blockquote>
      </div>
      {submittedAudio ? <p className="m-0 break-words text-xs leading-5 text-os-muted-paper">{t('audioAudition.preset', { voice: submittedAudio.voice, speed: submittedAudio.speed })}</p> : null}
      {!replayRequest && currentAudioPreset?.failed ? <button className="min-h-11 rounded border border-os-rule-paper px-3 py-2 text-sm" type="button" disabled={locked}
        onClick={() => { if (!locked) { setError(''); setAudioReadRevision(value => value + 1); } }}>{t('audioAudition.retryAvailability')}</button> : null}
    </div> : null}
  </div> : null;
  const parentFigures = parent?.storyboard?.figurePlan?.figures ?? [];
  // Match the stored planner order: reused originals precede generated figures.
  const parentSceneFigure = [...parentFigures.filter(figure => figure.decision === 'reuse'),
    ...parentFigures.filter(figure => figure.decision === 're-render' || figure.decision === 'abstract')][submittedSceneIndex];
  const summaryStyle = effectiveAction === 'scene.image' && parent?.storyboard
    ? parent.storyboard.document.scenes[submittedSceneIndex]?.paperOriginal ? t('reuseOriginal') : styleLabel(parentSceneFigure?.styleId ?? parent.storyboard.style)
    : styleLabel(!needsInstruction && parent?.storyboard ? parent.storyboard.style : submittedStyle);
  const figureSummary = submittedFigurePlan ? <ul className="mt-2 space-y-1 text-sm">
    {submittedFigurePlan.figures.map((figure, index) => <li key={`${index}:${figure.id}`}>
      {figure.id} · {figure.decision === 'reuse' ? t('reuseOriginal') : figure.decision === 'skip' ? t('skipFigure') : styleLabel(figure.styleId ?? submittedStyle)}
    </li>)}
  </ul> : null;
  const mediaControl = <div className="grid grid-cols-2 gap-2" aria-label={t('mediaIntent')}>{(['image', 'video'] as const).map((kind) => <button key={kind} className={`min-h-11 rounded border px-3 text-sm ${medium === kind ? 'border-os-ink font-semibold' : 'border-os-rule-paper'}`} type="button" disabled={locked} onClick={() => { setRevisionMode(undefined); setRevisionSceneIndex(undefined); if (kind === 'image' && parent?.storyboard?.output === 'video') { setParentId(''); setAction('storyboard.create'); } else setAction(kind === 'video' ? 'video.create' : parent ? 'scene.image' : 'storyboard.create'); }}>{t(kind)}</button>)}</div>;
  const videoRevisionControl = effectiveAction === 'storyboard.revise' && parent?.storyboard?.output === 'video' && !effectiveRevisionMode ? <label className="grid gap-2 text-sm">{t('videoRevision.label')}<select className={control} value={revisionSceneIndex ?? ''} disabled={locked} onChange={(event) => { setParentId(parent.id); setRevisionSceneIndex(event.target.value === '' ? undefined : Number(event.target.value)); }}><option value="">{t('videoRevision.all')}</option>{parent.storyboard.document.scenes.map((item, index) => <option key={index} value={index}>{index + 1}. {item.title}</option>)}</select></label> : null;
  const latestSubmit = useRef(submit); latestSubmit.current = submit;
  useEffect(() => {
    onConfirmationChange?.({ kind: 'production', ready: confirmationReady, canDismiss: !locked, confirm: () => latestSubmit.current() });
    return () => onConfirmationChange?.(null);
  }, [onConfirmationChange, confirmationReady, requestScope, locked]);
  if (onConfirmationChange) return <div className="hermes-message hermes-message-assistant" data-hermes-presentation-action="true">
    <p>{audition ? t('audioAudition.summary') : tc('productionScope', { kind: t(medium), style: summaryStyle })}</p>
    {audioControl}
    {audition ? <button className="mt-3 min-h-11 w-full rounded bg-os-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" type="button" disabled={!confirmationReady}
      onClick={() => void submit()}>{t(busy ? 'submitting' : uncertain ? 'retry' : 'audioAudition.submit')}</button> : null}
    {singlePaperImage ? <p className="mt-2 text-sm">{t('planOneImageHint')}</p> : null}
    {figureSummary}
    {revisionSceneIndex !== undefined && parent?.storyboard?.output === 'video' && <p className="mt-2 text-sm">{t('videoRevision.scene', { number: revisionSceneIndex + 1 })}</p>}
    {effectiveAction === 'scene.image' && parent?.storyboard && <p className="mt-2 text-sm">{parent.storyboard.document.title} · {t('scene')} {scene + 1}: {parent.storyboard.document.scenes[scene]?.title}</p>}
    <p className="mt-2 text-sm">{t(audition ? 'audioAudition.hint' : 'charge')}</p>
    <p className="mt-2 text-sm" role="status">{busy ? t('submitting') : !ready ? t('loading') : !canWrite ? t('readOnly') : sourceValidationError ? t(sourceValidationError) : audition && !replayRequest && auditionStatus ? t(auditionStatus) : !videoReady ? t('needsApprovedScenes') : needsInstruction && !instruction.trim() ? tc('needsProductionInstruction') : audition ? t(uncertain ? 'retry' : 'audioAudition.ready') : tc(uncertain ? 'retryProductionInChat' : 'confirmProductionInChat')}</p>
    {error && <p role="alert" className="mt-2 text-sm text-state-danger">{t(error)}</p>}
    {!audition ? <details className="hermes-production-settings mt-3"><summary>{tc('adjustProduction')}</summary>
      {mediaControl}
      <textarea aria-label={t('instruction')} className={`${control} mt-2 min-h-28`} value={instruction} maxLength={1000} disabled={locked} onChange={(event) => { setInstruction(event.target.value); setRevisionMode(undefined); if (parent) setUpdateBrief(true); }} />
      {videoRevisionControl}
    </details> : null}
  </div>;
  return <section className="min-w-0 rounded-xl bg-os-paper p-4 text-os-ink" data-hermes-presentation-action="true">
    <p className="m-0 text-sm font-semibold">{data?.title ?? t('loading')}</p><p className="mt-1 text-xs text-os-muted-paper">{version ? versionLabels.label(version) : t('chooseVersion')}</p>
    <p className="hermes-production-summary">{audition ? t('audioAudition.mode') : `${t(medium)} · ${summaryStyle}`}</p>
    {figureSummary}
    {audioControl}
    {effectiveAction === 'scene.image' && parent?.storyboard && <p className="mt-2 text-sm leading-6">{t('scene')}: {scene + 1}. {parent.storyboard.document.scenes[scene]?.title}</p>}
    <form className="mt-5 space-y-4" onSubmit={submit}><fieldset className="m-0 min-w-0 space-y-4 border-0 p-0" disabled={locked}>
      {!audition ? <details className="hermes-production-settings"><summary>{tc('adjustProduction')}</summary>
      {mediaControl}
      <label className="grid gap-2 text-sm">{t('style')}<select className={control} value={style} onChange={(event) => { const nextStyle = event.target.value; setStyle(nextStyle); setRevisionSceneIndex(undefined); setFigurePlan(plan => plan ? { figures: plan.figures.map(figure => figure.decision === 're-render' || figure.decision === 'abstract' ? { ...figure, styleId: nextStyle } : figure) } : undefined); if ((action === 'scene.image' || action === 'video.create') && parent) setUpdateBrief(true); }}>{[...new Set(['auto', 'technical', 'editorial', 'watercolor', 'ink', style])].map((value) => <option key={value} value={value}>{styleLabel(value)}</option>)}</select></label>
      <label className="grid gap-2 text-sm">{t('instruction')}<textarea className={`${control} min-h-28`} maxLength={1000} value={instruction} onChange={(event) => { setInstruction(event.target.value); setRevisionMode(undefined); if ((action === 'scene.image' || action === 'video.create') && parent) setUpdateBrief(true); }} /></label>
      {effectiveAction === 'scene.image' && parent?.storyboard ? <label className="grid gap-2 text-sm">{t('scene')}<select className={control} value={scene} onChange={(event) => setScene(Number(event.target.value))}>{parent.storyboard.document.scenes.map((item, index) => <option key={index} value={index}>{index + 1}. {item.title}</option>)}</select></label> : null}
      {videoRevisionControl}
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{t('advanced')}</summary>{parent ? <p className="mt-3 text-xs leading-5 text-os-muted-paper">{t('usingApprovedPlan')}</p> : null}<p className="mt-3 text-xs leading-5 text-os-muted-paper">{t('eligibleSources', { count: selectedClaimIds.length })}</p></details>
      </details> : null}
    </fieldset>
    {!canWrite && data ? <p role="status" className="text-sm">{t('readOnly')}</p> : null}
    {(action === 'scene.image' || action === 'video.create') && !parent ? <p className="text-sm leading-6 text-os-muted-paper">{t('planWillBePrepared')}</p> : null}
    {effectiveAction === 'storyboard.revise' ? <p className="text-sm leading-6 text-os-muted-paper">{t('briefWillUpdate')}</p> : null}
    {ready && sourceValidationError ? <p role="status" className="text-sm leading-6 text-os-muted-paper">{t(sourceValidationError)}</p> : null}
    {effectiveAction === 'video.create' && !videoReady ? <p role="status" className="text-sm leading-6 text-os-muted-paper">{t(audition && auditionStatus ? auditionStatus : 'needsApprovedScenes')}</p> : null}
    {error ? <p role="alert" className="text-sm text-os-vermilion">{t(error)}</p> : null}
    <p className="text-xs leading-5 text-os-muted-paper">{t(audition ? 'audioAudition.hint' : 'charge')}</p>
    <button className="min-h-11 w-full rounded bg-os-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!confirmationReady} type="submit">{t(busy ? 'submitting' : uncertain ? 'retry' : audition ? 'audioAudition.submit' : effectiveAction === 'storyboard.create' && action === 'video.create' ? 'prepareVideoPlan' : effectiveAction === 'storyboard.create' ? singlePaperImage ? 'planOneImage' : 'preparePlan' : effectiveAction === 'storyboard.revise' ? 'updateBrief' : 'confirm')}</button></form>
    <button className="mt-3 min-h-11 px-2 text-sm underline" disabled={locked} onClick={onBack} type="button">{t('back')}</button>
  </section>;
}
