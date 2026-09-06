'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { WorkspaceGuidePayload } from '@/lib/api';
import { researchObjectFromHermesPath, type HermesPresentationIntent } from '@/lib/hermes/presentation-intent';
import type { SubmissionIntent } from '@/lib/hermes/presentation-action';
import { HermesPresentationAction } from './HermesPresentationAction';

export function HermesPresentationReview({ intent, routeResearchObjectId, researchObjects, submissionRecords, onBack, onDone }: {
  intent: HermesPresentationIntent; routeResearchObjectId?: string; submissionRecords: Map<string, SubmissionIntent>;
  researchObjects: WorkspaceGuidePayload['context']['researchObjects']; onBack(): void; onDone(): void;
}) {
  const t = useTranslations('hermesPresentation');
  const pathname = usePathname(); const search = useSearchParams(); const router = useRouter();
  const pathRo = researchObjectFromHermesPath(pathname);
  const [selectedRo, setSelectedRo] = useState(''); const [locked, setLocked] = useState(false);
  const roId = pathRo ?? routeResearchObjectId ?? selectedRo;
  const version = pathRo === roId ? search.get('version') ?? undefined : undefined;
  const owner = `${roId}:${version ?? ''}`;
  const previousOwner = useRef(owner);
  useEffect(() => {
    if (previousOwner.current !== owner) {
      submissionRecords.clear(); setLocked(false);
      if (previousOwner.current !== ':') onBack();
      previousOwner.current = owner;
    }
  }, [owner, onBack, submissionRecords]);
  return <div className="mt-6 min-w-0 space-y-4" data-hermes-presentation-review="true">
    {!pathRo && !routeResearchObjectId ? <label className="grid gap-2 text-sm text-os-ink-paper">{t('chooseResearch')}
      <select className="min-h-11 w-full rounded border border-os-rule-paper bg-os-paper px-3 text-os-ink-paper" value={selectedRo} disabled={locked} onChange={event => setSelectedRo(event.target.value)}>
        <option value="">{t('chooseResearch')}</option>
        {researchObjects.map(ro => <option key={ro.id} value={ro.id}>{ro.title}</option>)}
      </select>
    </label> : null}
    {roId ? <HermesPresentationAction key={`${roId}:${version ?? ''}`} researchObjectId={roId} requestedVersionId={version} intent={intent} submissionRecords={submissionRecords} onBusyChange={setLocked} onBack={onBack} onSubmitted={url => { router.push(url); onDone(); }} /> : <>
      {!researchObjects.length ? <p className="text-sm text-os-ink-paper">{t('noResearch')}</p> : null}
      <button type="button" className="min-h-11 text-sm text-os-ink-paper underline" onClick={onBack}>{t('back')}</button>
    </>}
  </div>;
}
