'use client';

import { useLocale, useTranslations } from 'next-intl';
import { forwardRef, useLayoutEffect, useRef, useState } from 'react';

import type { HermesAnchorAction, HermesAnchorId } from '@/lib/hermes/anchor-registry';
import { dispatchHermesGuideAction } from './HermesDraftDiff';

export const HermesGuideBubble = forwardRef<HTMLElement, {
  actions: HermesAnchorAction[];
  edgeStop: boolean;
  measuring: boolean;
  onDismiss: () => void;
  onLayoutWillChange: () => void;
  onTakeMeThere: () => void;
  target: HermesAnchorId;
  visible: boolean;
}>(function HermesGuideBubble({ actions, edgeStop, measuring, onDismiss, onLayoutWillChange, onTakeMeThere, target, visible }, ref) {
  const t = useTranslations('hermesCompanion');
  const locale = useLocale();
  const [explaining, setExplaining] = useState(false);
  const previousLayoutSignatureRef = useRef<string | null>(null);
  const previousLocaleRef = useRef(locale);
  const previousTargetRef = useRef(target);
  useLayoutEffect(() => {
    if (previousTargetRef.current === target) return;
    previousTargetRef.current = target;
    if (!explaining) return;
    onLayoutWillChange();
    setExplaining(false);
  }, [explaining, onLayoutWillChange, target]);
  useLayoutEffect(() => {
    const signature = `${edgeStop}:${actions.join('|')}`;
    if (previousLayoutSignatureRef.current !== null && previousLayoutSignatureRef.current !== signature) onLayoutWillChange();
    previousLayoutSignatureRef.current = signature;
  }, [actions, edgeStop, onLayoutWillChange]);
  useLayoutEffect(() => {
    if (previousLocaleRef.current !== locale) onLayoutWillChange();
    previousLocaleRef.current = locale;
  }, [locale, onLayoutWillChange]);
  return (
    <aside aria-hidden={!visible} aria-live="polite" className="hermes-companion-bubble hermes-functional-bubble" data-hermes-guide-bubble="true" data-hermes-guide-edge-stop={edgeStop ? 'true' : 'false'} data-hermes-guide-measuring={measuring ? 'true' : 'false'} data-hermes-guide-visible={visible ? 'true' : 'false'} onPointerDown={(event) => event.stopPropagation()} ref={ref}>
      <span className="hermes-companion-kicker">{t('guideLabel')}</span>
      <button aria-label={t('dismiss')} className="hermes-companion-dismiss" onClick={onDismiss} tabIndex={visible ? 0 : -1} type="button">×</button>
      <p>{t(`targets.${target}`)}</p>
      <div className="hermes-companion-actions">
        {actions.includes('explain') ? <button onClick={() => {
          onLayoutWillChange();
          setExplaining((value) => !value);
        }} tabIndex={visible ? 0 : -1} type="button">{t('explain')}</button> : null}
        {actions.includes('draft') ? <button onClick={() => dispatchHermesGuideAction('draft', target)} tabIndex={visible ? 0 : -1} type="button">{t('draft')}</button> : null}
        {actions.includes('check') ? <button onClick={() => dispatchHermesGuideAction('check', target)} tabIndex={visible ? 0 : -1} type="button">{t('check')}</button> : null}
      </div>
      {explaining ? <p className="hermes-companion-explanation" data-hermes-guide-explanation="true">{t(`details.${target}`)}</p> : null}
      {edgeStop ? <button className="hermes-companion-take-me" onClick={onTakeMeThere} tabIndex={visible ? 0 : -1} type="button">{t('takeMeThere')}</button> : null}
    </aside>
  );
});
