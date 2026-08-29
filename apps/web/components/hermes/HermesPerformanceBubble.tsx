'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { HermesSpeechCue } from '@/lib/hermes/performance-beat';

interface HermesPerformanceBubbleProps {
  cue: HermesSpeechCue;
  style?: React.CSSProperties;
  visible: boolean;
}

export const HermesPerformanceBubble = React.forwardRef<HTMLElement, HermesPerformanceBubbleProps>(function HermesPerformanceBubble(
  { cue, style, visible },
  ref,
) {
  const t = useTranslations('hermesCompanion');
  return (
    <aside
      aria-hidden={!visible}
      aria-live="polite"
      className="hermes-companion-bubble hermes-performance-bubble"
      data-hermes-bubble-material="warm-paper"
      data-hermes-performance-bubble="true"
      data-hermes-performance-beat={cue.beatId}
      data-hermes-speech-copy="single"
      data-hermes-speech-cue={cue.messageKey}
      data-hermes-speech-origin="mouth"
      data-hermes-speech-tone={cue.tone}
      data-hermes-speech-visible={visible ? 'true' : 'false'}
      onPointerDown={(event) => event.stopPropagation()}
      ref={ref}
      style={style}
    >
      <p>{t(cue.messageKey)}</p>
    </aside>
  );
});
