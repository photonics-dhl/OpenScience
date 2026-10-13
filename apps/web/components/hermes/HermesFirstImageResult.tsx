'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getCurrentUser, getFirstImageRun, getHermesResearchRun, listPresentationAssets,
  presentationAssetContentUrl, SESSION_CHANGED_EVENT, SESSION_INVALIDATED_EVENT,
  type HermesResearchRun, type PresentationAsset } from '@/lib/api';

/** Read the original operation only; recovery never submits or approves anything. */
export function HermesFirstImageResult({ actorId, researchObjectId, versionId, guideTaskId, runId, guidePending = false }: {
  actorId: string; researchObjectId: string; versionId: string; guideTaskId: string; runId?: string; guidePending?: boolean;
}) {
  const t = useTranslations('hermesConversation.firstImage');
  const scope = JSON.stringify([actorId, researchObjectId, versionId, guideTaskId, runId]);
  const [state, setState] = useState<{ scope: string; run?: HermesResearchRun; asset?: PresentationAsset; error?: boolean }>({ scope });
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
        if (!abort.signal.aborted) setState(previous => ({ ...(previous.scope === scope ? previous : {}), scope, error: true }));
      }
    };
    void load();
    return () => {
      abort.abort(); if (timer) clearTimeout(timer);
      window.removeEventListener(SESSION_CHANGED_EVENT, cancel);
      window.removeEventListener(SESSION_INVALIDATED_EVENT, cancel);
    };
  }, [actorId, researchObjectId, versionId, guideTaskId, runId, guidePending, scope, attempt]);
  const current = state.scope === scope ? state : undefined;
  if (!current?.run && !current?.error) return null;
  const stopped = current?.run && ['failed', 'stopped'].includes(current.run.status);
  return <div className="hermes-conversation-change" aria-live="polite">
    <p role="status">{t(current?.error ? 'readError' : stopped ? 'stopped' : current?.asset ? 'ready'
      : current?.run?.status.includes('scene_images') ? 'rendering' : 'planning')}</p>
    {current?.asset && <img src={presentationAssetContentUrl(researchObjectId, versionId, current.asset.id)}
      alt={current.asset.label} style={{ width: '100%', height: 'auto' }} />}
    {(current?.error || stopped) && <button type="button" onClick={() => setAttempt(n => n + 1)}>{t('refresh')}</button>}
    {current?.run && <Link className="hermes-conversation-link" href={`/research-objects/${encodeURIComponent(researchObjectId)}/presentation?version=${encodeURIComponent(versionId)}`}>{t('manage')}</Link>}
  </div>;
}
