'use client';

import * as React from 'react';

import type { HermesActionId } from '@/lib/hermes/action-catalog';

interface HermesSpeechBalloonProps {
  action: HermesActionId;
  children: React.ReactNode;
  compact: boolean;
}

export function HermesSpeechBalloon({ action, children, compact }: HermesSpeechBalloonProps) {
  return (
    <p
      aria-live="polite"
      className="hermes-menu-feedback"
      data-compact={compact ? 'true' : 'false'}
      data-hermes-bubble-material="warm-paper"
      data-hermes-feedback-action={action}
      data-hermes-menu-feedback="true"
      data-hermes-speech-copy="single"
      data-hermes-speech-origin="mouth"
    >
      <svg
        aria-hidden="true"
        className="hermes-menu-feedback-silhouette"
        data-hermes-speech-silhouette="true"
        preserveAspectRatio="none"
        viewBox="0 0 224 136"
      >
        <path
          d="M18 5 C61 -2 145 0 195 13 C213 18 222 32 221 49 C220 67 206 82 181 88 C174 90 166 91 157 92 C160 106 168 123 180 134 C161 129 145 113 135 95 C94 98 54 94 28 83 C8 75 0 59 3 42 C5 25 9 13 18 5 Z"
          data-hermes-speech-contour="single"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="hermes-menu-feedback-copy">{children}</span>
      <span aria-hidden="true" className="hermes-menu-feedback-tip" data-hermes-speech-tip="true" />
    </p>
  );
}
