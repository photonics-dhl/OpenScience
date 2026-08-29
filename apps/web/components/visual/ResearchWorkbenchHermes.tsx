'use client';

import { useEffect, useRef } from 'react';

import { HermesRiggedPortrait } from '@/components/hermes/HermesRiggedPortrait';
import type { HermesVisualState } from '@/components/hermes/hermes-state';
import type { HermesActionId } from '@/lib/hermes/action-catalog';
import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';

interface ResearchWorkbenchHermesProps {
  action: HermesActionId;
  reducedMotion: boolean;
  size: 200 | 360;
  state: HermesVisualState;
}

export function ResearchWorkbenchHermes({
  action,
  reducedMotion,
  size,
  state,
}: ResearchWorkbenchHermesProps) {
  const inputRef = useRef<HermesPetMeshInput>({
    action,
    actionStartedAtMs: 0,
    engaged: false,
    pointer: { x: 0, y: 0 },
    state,
  });

  useEffect(() => {
    inputRef.current.action = action;
    inputRef.current.actionStartedAtMs = performance.now();
    inputRef.current.state = state;
  }, [action, state]);

  return (
    <span
      aria-hidden="true"
      data-review-hermes-size={size}
      style={{ display: 'block', height: size, width: size }}
    >
      <HermesRiggedPortrait
        fallback={(
          <img
            alt=""
            data-review-hermes-fallback="true"
            draggable={false}
            height={360}
            src="/hermes/wanko-static.png"
            style={{ display: 'block', height: '100%', width: '100%' }}
            width={360}
          />
        )}
        inputRef={inputRef}
        reducedMotion={reducedMotion}
        state={state}
      />
    </span>
  );
}
