'use client';

import { useTranslations } from 'next-intl';
import { forwardRef, useEffect, useState } from 'react';

import type { HermesAnchorAction, HermesAnchorId } from '@/lib/hermes/anchor-registry';
import { dispatchHermesGuideAction } from './HermesDraftDiff';

export const HermesGuideBubble = forwardRef<HTMLElement, {
  actions: HermesAnchorAction[];
  edgeStop: boolean;
  onDismiss: () => void;
  onTakeMeThere: () => void;
  target: HermesAnchorId;
  visible: boolean;
}>(function HermesGuideBubble({ actions, edgeStop, onDismiss, onTakeMeThere, target, visible }, ref) {
  const t = useTranslations('hermesCompanion');
  const [explaining, setExplaining] = useState(false);
  useEffect(() => setExplaining(false), [target]);
  return (
    <aside aria-hidden={!visible} className="hermes-companion-bubble" data-hermes-guide-bubble="true" data-hermes-guide-edge-stop={edgeStop ? 'true' : 'false'} data-hermes-guide-visible={visible ? 'true' : 'false'} onPointerDown={(event) => event.stopPropagation()} ref={ref}>
      <button aria-label={t('dismiss')} className="hermes-companion-dismiss" onClick={onDismiss} tabIndex={visible ? 0 : -1} type="button">×</button>
      <p>{t(`targets.${target}`)}</p>
      <div className="hermes-companion-actions">
        {actions.includes('explain') ? <button onClick={() => setExplaining((value) => !value)} tabIndex={visible ? 0 : -1} type="button">{t('explain')}</button> : null}
        {actions.includes('draft') ? <button onClick={() => dispatchHermesGuideAction('draft', target)} tabIndex={visible ? 0 : -1} type="button">{t('draft')}</button> : null}
        {actions.includes('check') ? <button onClick={() => dispatchHermesGuideAction('check', target)} tabIndex={visible ? 0 : -1} type="button">{t('check')}</button> : null}
      </div>
      {explaining ? <p className="hermes-companion-explanation" data-hermes-guide-explanation="true">{t(`details.${target}`)}</p> : null}
      {edgeStop ? <button className="hermes-companion-take-me" onClick={onTakeMeThere} tabIndex={visible ? 0 : -1} type="button">{t('takeMeThere')}</button> : null}
    </aside>
  );
});
