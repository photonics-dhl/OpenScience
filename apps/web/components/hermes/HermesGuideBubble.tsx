'use client';

import { useTranslations } from 'next-intl';

import type { HermesAnchorId } from '@/lib/hermes/anchor-registry';
import { dispatchHermesGuideAction } from './HermesDraftDiff';

export function HermesGuideBubble({ edgeStop, onDismiss, onTakeMeThere, target }: {
  edgeStop: boolean;
  onDismiss: () => void;
  onTakeMeThere: () => void;
  target: HermesAnchorId;
}) {
  const t = useTranslations('hermesCompanion');
  return (
    <aside className="hermes-companion-bubble" data-hermes-guide-bubble="true" onPointerDown={(event) => event.stopPropagation()}>
      <button aria-label={t('dismiss')} className="hermes-companion-dismiss" onClick={onDismiss} type="button">×</button>
      <p>{t(`targets.${target}`)}</p>
      <div className="hermes-companion-actions">
        <button onClick={() => dispatchHermesGuideAction('explain', target)} type="button">{t('explain')}</button>
        <button onClick={() => dispatchHermesGuideAction('draft', target)} type="button">{t('draft')}</button>
        <button onClick={() => dispatchHermesGuideAction('check', target)} type="button">{t('check')}</button>
      </div>
      {edgeStop ? <button className="hermes-companion-take-me" onClick={onTakeMeThere} type="button">{t('takeMeThere')}</button> : null}
    </aside>
  );
}
