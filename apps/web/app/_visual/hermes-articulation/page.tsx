'use client';

import * as React from 'react';
import { useRef, useState } from 'react';

import { HermesRiggedPortrait } from '@/components/hermes/HermesRiggedPortrait';
import type { HermesVisualState } from '@/components/hermes/hermes-state';
import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';
import type { HermesActionId } from '@/lib/hermes/action-catalog';

export default function HermesArticulationVisualRoute() {
  const [state, setState] = useState<HermesVisualState>('idle');
  const inputRef = useRef<HermesPetMeshInput & { motionTimeMs?: number }>({
    engaged: false,
    motionTimeMs: 9_000,
    pointer: { x: 0, y: 0 },
    state,
  });
  const setProbe = (engaged: boolean) => {
    inputRef.current = {
      engaged,
      motionTimeMs: 9_000,
      pointer: engaged ? { x: .82, y: -.64 } : { x: 0, y: 0 },
      state,
    };
  };
  const setRestFrame = (motionTimeMs: number) => {
    inputRef.current = {
      engaged: false,
      motionTimeMs,
      pointer: { x: 0, y: 0 },
      state,
    };
  };
  const setAction = (action: HermesActionId) => {
    inputRef.current = {
      action,
      actionStartedAtMs: performance.now(),
      engaged: false,
      motionTimeMs: 9_000,
      pointer: { x: 0, y: 0 },
      state,
    };
  };

  return (
    <main className="min-h-screen bg-[#070907] p-8 text-os-paper">
      <div className="mb-6 flex gap-3">
        <button type="button" onClick={() => setState('idle')}>Idle</button>
        <button type="button" onClick={() => setState('awaiting_approval')}>Approval</button>
        <button type="button" onClick={() => setRestFrame(9_000)}>Freeze rest</button>
        <button type="button" onClick={() => setRestFrame(9_000)}>Breathing frame A</button>
        <button type="button" onClick={() => setRestFrame(9_520)}>Breathing frame B</button>
        <button type="button" onClick={() => setAction('observe-left')}>Observe action</button>
        <button type="button" onClick={() => setAction('citation-trace')}>Citation action</button>
        <button type="button" onClick={() => setAction('stretch')}>Stretch action</button>
        <button type="button" onClick={() => setAction('doze')}>Doze action</button>
        <button type="button" onClick={() => setAction('wake')}>Wake action</button>
        <button type="button" onClick={() => setAction('surprise-settle')}>Surprise action</button>
        <button type="button" onClick={() => setAction('patrol')}>Patrol action</button>
        <button type="button" onClick={() => setAction('return-dock')}>Return action</button>
        <button type="button" onClick={() => setAction('evidence-check')}>Evidence action</button>
        <button type="button" onClick={() => setAction('read')}>Read action</button>
        <button type="button" onClick={() => setAction('compare')}>Compare action</button>
        <button type="button" onClick={() => setAction('quiet-write')}>Writing action</button>
        <button type="button" onClick={() => setAction('possible-issue')}>Issue action</button>
        <button type="button" onClick={() => setAction('guide-arrive')}>Arrival action</button>
        <button type="button" onClick={() => setAction('success')}>Success action</button>
        <button type="button" onClick={() => setProbe(true)}>Fixed pointer</button>
      </div>
      <div className="h-[520px] w-[520px]" data-hermes-articulation-harness="true">
        <HermesRiggedPortrait
          fallback={<span aria-hidden="true" />}
          inputRef={inputRef}
          reducedMotion={false}
          state={state}
        />
      </div>
    </main>
  );
}
