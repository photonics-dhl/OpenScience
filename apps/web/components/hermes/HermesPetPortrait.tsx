'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type { HermesVisualState } from './hermes-state';

const NODES = ['neck', 'shoulder', 'back', 'flank', 'tail', 'citation'] as const;
type PetFrame = 'blink' | 'idle' | 'working';

export interface HermesPetPortraitProps {
  fallback: ReactNode;
  state: HermesVisualState;
}

export function HermesPetPortrait({ fallback, state }: HermesPetPortraitProps) {
  const [ready, setReady] = useState<Record<PetFrame, boolean>>({ blink: false, idle: false, working: false });
  const activeFrame: PetFrame = state === 'scanning' ? 'working' : 'idle';
  const setFrameReady = (frame: PetFrame, value: boolean) => {
    setReady((current) => current[frame] === value ? current : { ...current, [frame]: value });
  };

  return (
    <span
      className="hermes-pet-stage"
      data-hermes-pet="true"
      data-pet-ready={ready[activeFrame] ? 'true' : 'false'}
    >
      <span aria-hidden="true" className="hermes-pet-aura" />
      <span aria-hidden="true" className="hermes-vector-fallback">{fallback}</span>
      {/* Native images keep the three transparent layers byte-for-byte aligned. */}
      <img
        alt=""
        aria-hidden="true"
        className="hermes-pet-frame hermes-pet-idle"
        data-hermes-frame="idle"
        draggable={false}
        height={824}
        decoding="async"
        onError={() => setFrameReady('idle', false)}
        onLoad={() => setFrameReady('idle', true)}
        src="/hermes/pet/hermes-pet-idle.png"
        width={824}
      />
      <img
        alt=""
        aria-hidden="true"
        className="hermes-pet-frame hermes-pet-blink"
        data-hermes-frame="blink"
        draggable={false}
        height={824}
        decoding="async"
        onError={() => setFrameReady('blink', false)}
        onLoad={() => setFrameReady('blink', true)}
        src="/hermes/pet/hermes-pet-blink.png"
        width={824}
      />
      <img
        alt=""
        aria-hidden="true"
        className="hermes-pet-frame hermes-pet-working"
        data-hermes-frame="working"
        draggable={false}
        height={824}
        decoding="async"
        onError={() => setFrameReady('working', false)}
        onLoad={() => setFrameReady('working', true)}
        src="/hermes/pet/hermes-pet-working.png"
        width={824}
      />
      <span aria-hidden="true" className="hermes-pet-node-field">
        {NODES.map((node, index) => (
          <span
            className={`hermes-pet-node hermes-pet-node-${node}`}
            data-hermes-node={node}
            key={node}
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      <span aria-hidden="true" className="hermes-pet-focus-line" data-working={state === 'scanning' ? 'true' : 'false'} />
    </span>
  );
}
