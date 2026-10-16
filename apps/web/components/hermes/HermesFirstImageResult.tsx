'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getCurrentUser, getFirstImageRun, getHermesResearchRun, listPresentationAssets,
  getAgentTask, getPresentationTask,
  presentationAssetContentUrl, SESSION_CHANGED_EVENT, SESSION_INVALIDATED_EVENT,
  type HermesResearchRun, type PresentationAsset, type HermesImageReady, type AgentTaskView } from '@/lib/api';
import { readWorkspaceSelectedImageReference, type WorkspaceSelectedImageDraft } from '@openscience/domain/workspace-guide-contract';

/** Existing source fields, compared by value rather than JSON object insertion order. */
export function selectedImageSourceIdentity(source: WorkspaceSelectedImageDraft['source']) {
  return JSON.stringify([source.researchObjectId, source.versionId, source.assetId, source.contentHash,
    source.storyboardAssetId, source.parentContentHash, source.sceneIndex, source.sourceClaimIds]);
}

export function selectedChildImageAsset(task: AgentTaskView, assets: PresentationAsset[], scope: { researchObjectId: string; versionId: string; guideTaskId: string }) {
  if (task.kind !== 'presentation.generate' || task.status !== 'succeeded' || task.researchObjectId !== scope.researchObjectId
    || task.result?.assetId !== task.id || typeof task.result.contentHash !== 'string') return undefined;
  return assets.find(asset => asset.id === task.id && asset.kind === 'image' && asset.status === 'draft'
    && asset.researchObjectId === scope.researchObjectId && asset.versionId === scope.versionId && asset.contentHash === task.result!.contentHash
    && asset.sceneImage?.storyboardAssetId === scope.guideTaskId && asset.sceneImage.sceneIndex === 0);
}

/** Read the original operation only; recovery never submits or approves anything. */
export function HermesFirstImageResult({ actorId, researchObjectId, versionId, guideTaskId, runId, guidePending = false, selectedChild, onImageReady }: {
  actorId: string; researchObjectId: string; versionId: string; guideTaskId: string; runId?: string; guidePending?: boolean;
  selectedChild?: { taskId: string; source: WorkspaceSelectedImageDraft['source'] };
  onImageReady?(image: HermesImageReady): void;
}) {
  const t = useTranslations('hermesConversation.firstImage');
  const childTaskId = selectedChild?.taskId, sourceAssetId = selectedChild?.source.assetId;
  const selectedSourceIdentity = selectedChild ? selectedImageSourceIdentity(selectedChild.source) : '';
  const scope = JSON.stringify([actorId, researchObjectId, versionId, guideTaskId, runId, childTaskId, selectedSourceIdentity]);
  const [state, setState] = useState<{ scope: string; run?: HermesResearchRun; child?: AgentTaskView; asset?: PresentationAsset; error?: boolean }>({ scope });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!actorId || !versionId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { abort.abort(); if (timer) clearTimeout(timer); setState({ scope }); };
    window.addEventListener(SESSION_CHANGED_EVENT, cancel);
    window.addEventListener(SESSION_INVALIDATED_EVENT, cancel);
    const load = async () => {
      try {
        const actor = await getCurrentUser({ fresh: true });
        if (abort.signal.aborted) return;
        if (actor.userId !== actorId) { cancel(); return; }
        if (childTaskId) {
          const { task: guide } = await getAgentTask(researchObjectId, guideTaskId, abort.signal);
          const steps = guide.result?.nextSteps;
          const reference = readWorkspaceSelectedImageReference(guide.result?.selectedImageReference);
          if (guide.id !== guideTaskId || guide.kind !== 'workspace.guide' || guide.researchObjectId !== researchObjectId
            || selectedImageSourceIdentity(reference) !== selectedSourceIdentity || !guide.result?.selectedImageDraft
            || !Array.isArray(steps) || steps.length !== 1 || steps[0]?.intent !== 'open-task' || steps[0]?.targetId !== childTaskId)
            throw new Error('Selected-image child binding changed');
          const { task: child } = await getPresentationTask(researchObjectId, versionId, childTaskId, abort.signal);
          if (child.id !== childTaskId || child.kind !== 'presentation.generate' || child.researchObjectId !== researchObjectId)
            throw new Error('Selected-image child scope changed');
          let asset: PresentationAsset | undefined;
          if (child.status === 'succeeded') {
            const { assets } = await listPresentationAssets(researchObjectId, versionId, abort.signal);
            asset = selectedChildImageAsset(child, assets, { researchObjectId, versionId, guideTaskId });
            if (!asset && assets.some(item => item.id === child.id)) throw new Error('Selected-image result content changed');
          }
          if (abort.signal.aborted) return;
          setState({ scope, child, asset });
          if (['pending', 'running'].includes(child.status) || child.status === 'succeeded' && !asset)
            timer = setTimeout(() => void load(), 2500);
          return;
        }
        const { run } = runId ? await getHermesResearchRun(researchObjectId, runId, abort.signal)
          : await getFirstImageRun(researchObjectId, guideTaskId, abort.signal);
        if (abort.signal.aborted) return;
        if (!run) { setState({ scope }); if (guidePending) timer = setTimeout(() => void load(), 2500); return; }
        if (run.actorId !== actorId || run.researchObjectId !== researchObjectId || run.versionId !== versionId) {
          setState({ scope }); return;
        }
        let asset: PresentationAsset | undefined;
        const image = run.steps.find(step => step.stage === 'scene_image' && step.ordinal === 0);
        if (run.status === 'succeeded' && image?.status === 'succeeded' && image.presentationAssetId && image.agentTaskId) {
          const { assets } = await listPresentationAssets(researchObjectId, versionId, abort.signal);
          asset = assets.find(item => item.id === image.presentationAssetId && item.id === image.agentTaskId
            && item.kind === 'image' && item.status === 'draft' && item.researchObjectId === researchObjectId && item.versionId === versionId);
          if (!asset) throw new Error('First-image draft is unavailable');
        }
        if (abort.signal.aborted) return;
        setState({ scope, run, asset });
        if (!['succeeded', 'failed', 'stopped'].includes(run.status)) timer = setTimeout(() => void load(), 2500);
      } catch {
        if (!abort.signal.aborted) {
          setState(previous => ({ ...(previous.scope === scope ? previous : {}), scope, error: true }));
          if (childTaskId) timer = setTimeout(() => void load(), 5000); // Read the same task after a disconnect; never resubmit.
        }
      }
    };
    void load();
    return () => {
      abort.abort(); if (timer) clearTimeout(timer);
      window.removeEventListener(SESSION_CHANGED_EVENT, cancel);
      window.removeEventListener(SESSION_INVALIDATED_EVENT, cancel);
    };
  }, [actorId, researchObjectId, versionId, guideTaskId, runId, guidePending, childTaskId, selectedSourceIdentity, scope, attempt]);
  const current = state.scope === scope ? state : undefined;
  const readyCallback = useRef(onImageReady); readyCallback.current = onImageReady;
  const announcedAsset = useRef('');
  useEffect(() => {
    if (!current?.asset) return;
    const identity = `${scope}:${current.asset.id}`;
    if (announcedAsset.current === identity) return;
    announcedAsset.current = identity;
    readyCallback.current?.({ actorId, researchObjectId, versionId, guideTaskId, assetId: current.asset.id, label: current.asset.label,
      ...(sourceAssetId ? { sourceAssetId } : {}) });
    window.dispatchEvent(new CustomEvent('hermes-media-updated', { detail: { researchObjectId, versionId } }));
  }, [current?.asset, scope, actorId, researchObjectId, versionId, guideTaskId, sourceAssetId]);
  if (!current?.run && !current?.child && !current?.error) return null;
  const stopped = current?.run && ['failed', 'stopped'].includes(current.run.status)
    || current?.child && ['failed', 'cancelled'].includes(current.child.status);
  return <div className="hermes-conversation-change" aria-live="polite" data-hermes-generated-image-task={current?.child?.id}>
    <p role="status">{t(current?.error ? 'readError' : stopped ? 'stopped' : current?.asset ? 'ready'
      : current?.child || current?.run?.status.includes('scene_images') ? 'rendering' : 'planning')}</p>
    {current?.asset && <img src={presentationAssetContentUrl(researchObjectId, versionId, current.asset.id)}
      alt={current.asset.label} style={{ width: '100%', height: 'auto' }} />}
    {(current?.error || stopped) && <button type="button" onClick={() => setAttempt(n => n + 1)}>{t('refresh')}</button>}
    {(current?.run || current?.child) && <Link className="hermes-conversation-link" href={`/research-objects/${encodeURIComponent(researchObjectId)}/edit?view=media&version=${encodeURIComponent(versionId)}`}>{t('manage')}</Link>}
  </div>;
}
