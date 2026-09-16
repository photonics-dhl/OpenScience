'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { listPresentationAssets, transitionPresentationAsset, type PresentationAsset } from '@/lib/api';
import type { HermesConversationAction } from '@/lib/hermes/conversation-action';

export function HermesMediaReview({ researchObjectId, versionId, onConfirmationChange, beforeReview, onReviewed }: {
  researchObjectId: string; versionId: string;
  onConfirmationChange(action: HermesConversationAction | null): void;
  beforeReview(): void;
  onReviewed(): void;
}) {
  const t = useTranslations('hermesConversation');
  const tp = useTranslations('presentation');
  const mediaTitle = (asset: PresentationAsset) => asset.storyboard?.document.title
    || (asset.label && asset.label !== 'presentation_not_evidence' ? asset.label : tp(asset.kind === 'video' ? 'researchVideoTitle' : 'coreImageTitle'));
  const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const owner = `${researchObjectId}:${versionId}`;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const writing = useRef(false);
  useEffect(() => {
    let active = true; setReady(false); setError('');
    void listPresentationAssets(researchObjectId, versionId).then(({ assets: items }) => {
      if (!active) return;
      setAssets(items.filter((asset) => asset.researchObjectId === researchObjectId && asset.versionId === versionId && asset.status === 'draft'));
      setReady(true);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [researchObjectId, versionId]);
  async function review(command = '') {
    if (!ready || writing.current) return;
    const match = /^(采用|拒绝|approve|reject)\s*(\d+)$/iu.exec(command);
    if (!match) throw new Error(t('mediaReviewInstruction'));
    const asset = assets[Number(match[2]) - 1];
    if (!asset || !asset.canTransition) throw new Error(t('mediaReviewUnavailable'));
    beforeReview(); writing.current = true; setBusy(true); setError('');
    const status = /^(采用|approve)$/iu.test(match[1]) ? 'approved' : 'rejected';
    try {
      const { asset: next } = await transitionPresentationAsset(researchObjectId, versionId, asset.id, status, asset.updatedAt);
      if (ownerRef.current !== owner) return;
      setAssets((items) => items.map((item) => item.id === asset.id ? { ...item, status: next.status, updatedAt: next.updatedAt, canTransition: false } : item));
      setMessage(t(status === 'approved' ? 'mediaApproved' : 'mediaRejected', { title: mediaTitle(asset) })); onReviewed();
    } catch (cause) {
      if (ownerRef.current === owner) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { writing.current = false; if (ownerRef.current === owner) setBusy(false); }
  }
  const reviewRef = useRef(review); reviewRef.current = review;
  useEffect(() => {
    onConfirmationChange({ kind: 'media-review', ready: ready && !busy, canDismiss: !busy, confirm: (command) => reviewRef.current(command) });
    return () => onConfirmationChange(null);
  }, [onConfirmationChange, ready, busy, owner]);
  return <section className="hermes-message hermes-message-assistant" data-hermes-media-review="true">
    {!ready && !error && <p role="status">{t('mediaReviewLoading')}</p>}
    {ready && <><p>{assets.length ? t('mediaReviewInstruction') : t('mediaReviewEmpty')}</p>
      {assets.map((asset, index) => <details className="mt-3" key={asset.id}><summary>{index + 1}. {mediaTitle(asset)} · {t(asset.status === 'approved' ? 'adopted' : asset.status === 'rejected' ? 'rejected' : 'awaitingReview')}</summary>
        {asset.storyboard ? <div className="mt-2 text-sm leading-6">{asset.storyboard.document.scenes.map((scene, sceneIndex) => <div className="mt-2" key={sceneIndex}><p>{sceneIndex + 1}. {scene.title}</p><p>{scene.narration}</p><p className="mt-2 whitespace-pre-wrap">{scene.visualAction}</p></div>)}</div> : <p className="mt-2 text-sm">{t('reviewOnLeft')}</p>}
      </details>)}
    </>}
    {message && <p className="mt-3" role="status">{message}</p>}
    {error && <p className="mt-3 text-sm text-state-danger" role="alert">{error}</p>}
  </section>;
}
