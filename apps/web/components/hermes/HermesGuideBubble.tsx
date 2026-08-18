'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { HermesAnchorAction, HermesAnchorId } from '@/lib/hermes/anchor-registry';
import { dispatchHermesGuideAction } from './HermesDraftDiff';

export function HermesGuideBubble({ actions, edgeStop, onDismiss, onTakeMeThere, target }: {
  actions: HermesAnchorAction[];
  edgeStop: boolean;
  onDismiss: () => void;
  onTakeMeThere: () => void;
  target: HermesAnchorId;
}) {
  const t = useTranslations('hermesCompanion');
  const [explaining, setExplaining] = useState(false);
  useEffect(() => setExplaining(false), [target]);
  return (
    <aside className="hermes-companion-bubble" data-hermes-guide-bubble="true" onPointerDown={(event) => event.stopPropagation()}>
      <button aria-label={t('dismiss')} className="hermes-companion-dismiss" onClick={onDismiss} type="button">×</button>
      <p>{t(`targets.${target}`)}</p>
      <div className="hermes-companion-actions">
        {actions.includes('explain') ? <button onClick={() => setExplaining((value) => !value)} type="button">{t('explain')}</button> : null}
        {actions.includes('draft') ? <button onClick={() => dispatchHermesGuideAction('draft', target)} type="button">{t('draft')}</button> : null}
        {actions.includes('check') ? <button onClick={() => dispatchHermesGuideAction('check', target)} type="button">{t('check')}</button> : null}
      </div>
      {explaining ? <p className="hermes-companion-explanation" data-hermes-guide-explanation="true">{t(`details.${target}`)}</p> : null}
      {edgeStop ? <button className="hermes-companion-take-me" onClick={onTakeMeThere} type="button">{t('takeMeThere')}</button> : null}
    </aside>
  );
}
