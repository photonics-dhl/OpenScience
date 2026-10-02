'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { HermesSpeechCue } from '@/lib/hermes/performance-beat';
import { HermesSpeechContour } from './HermesSpeechBalloon';

interface HermesPerformanceBubbleProps {
  cue: HermesSpeechCue;
  style?: React.CSSProperties;
  visible: boolean;
  tailRatio?: number;
}

export const HermesPerformanceBubble = React.forwardRef<HTMLElement, HermesPerformanceBubbleProps>(function HermesPerformanceBubble(
  { cue, style, visible, tailRatio },
  ref,
) {
  const t = useTranslations('hermesCompanion');
  return <>
    <aside
      aria-hidden={!visible}
      aria-live={visible ? 'polite' : undefined}
      className="hermes-companion-bubble hermes-performance-bubble"
      data-hermes-bubble-material="warm-paper"
      data-hermes-performance-bubble="true"
      data-hermes-performance-beat={cue.beatId}
      data-hermes-speech-copy="single"
      data-hermes-speech-cue={cue.messageKey}
      data-hermes-speech-origin="hat-upper-left"
      data-hermes-speech-tone={cue.tone}
      data-hermes-speech-visible={visible ? 'true' : 'false'}
      onPointerDown={(event) => event.stopPropagation()}
      ref={ref}
      style={style}
    >
      <HermesSpeechContour tailRatio={tailRatio} />
      <p className="hermes-menu-feedback-copy">{t(cue.messageKey)}</p>
    </aside>
    {!visible ? <span className="sr-only" role="status">{t(cue.messageKey)}</span> : null}
  </>;
});
