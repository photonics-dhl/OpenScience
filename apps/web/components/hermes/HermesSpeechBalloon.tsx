'use client';

import * as React from 'react';

import type { HermesActionId } from '@/lib/hermes/action-catalog';

interface HermesSpeechBalloonProps {
  action: HermesActionId;
  children: React.ReactNode;
  compact: boolean;
  style?: React.CSSProperties;
  tailRatio?: number;
  visible?: boolean;
}

export function HermesSpeechContour({ tailRatio = .8 }: { tailRatio?: number }) {
  const tip = Math.min(200, Math.max(24, tailRatio * 224));
  return <>
    <svg aria-hidden="true" className="hermes-menu-feedback-silhouette"
      data-hermes-speech-silhouette="true" preserveAspectRatio="none" viewBox="0 0 224 114">
      <path d={`M112 3 C175 3 220 10 220 49 C220 80 196 96 ${tip + 8} 96 L${tip} 112 L${tip - 6} 96 C28 96 4 80 4 49 C4 10 49 3 112 3 Z`}
        data-hermes-speech-contour="single" data-hermes-speech-tail-profile="short" vectorEffect="non-scaling-stroke" />
    </svg>
    <span aria-hidden="true" className="hermes-menu-feedback-tip" data-hermes-speech-tip="true"
      style={{ left: `${tip / 224 * 100}%` }} />
  </>;
}

export function HermesSpeechBalloon({ action, children, compact, style, tailRatio, visible = true }: HermesSpeechBalloonProps) {
  return <>
    <p
      aria-live={visible ? 'polite' : undefined}
      aria-hidden={!visible}
      className="hermes-menu-feedback"
      data-compact={compact ? 'true' : 'false'}
      data-hermes-bubble-material="warm-paper"
      data-hermes-feedback-action={action}
      data-hermes-menu-feedback="true"
      data-hermes-speech-copy="single"
      data-hermes-speech-origin="hat-upper-left"
      data-hermes-speech-visible={visible ? 'true' : 'false'}
      style={style}
    >
      <HermesSpeechContour tailRatio={tailRatio} />
      <span className="hermes-menu-feedback-copy">{children}</span>
    </p>
    {!visible ? <span className="sr-only" role="status">{children}</span> : null}
  </>;
}
