'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { HermesSpeechCue } from '@/lib/hermes/performance-beat';

export function HermesPerformanceBubble({ cue, onDismiss, visible }: {
  cue: HermesSpeechCue;
  onDismiss: () => void;
  visible: boolean;
}) {
  const t = useTranslations('hermesCompanion');
  return (
    <aside
      aria-hidden={!visible}
      aria-live="polite"
      className="hermes-companion-bubble hermes-performance-bubble"
      data-hermes-bubble-material="ink-edge"
      data-hermes-performance-bubble="true"
      data-hermes-performance-beat={cue.beatId}
      data-hermes-speech-cue={cue.messageKey}
      data-hermes-speech-tone={cue.tone}
      data-hermes-speech-visible={visible ? 'true' : 'false'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="hermes-companion-kicker">{t(`performance.tones.${cue.tone}`)}</span>
      <p>{t(cue.messageKey)}</p>
      <button
        aria-label={t('dismissSpeech')}
        className="hermes-companion-dismiss"
        onClick={onDismiss}
        tabIndex={visible ? 0 : -1}
        type="button"
      >×</button>
    </aside>
  );
}
