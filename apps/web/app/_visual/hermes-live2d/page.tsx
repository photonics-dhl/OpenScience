'use client';

import { useRef, useState } from 'react';

import { HermesPerformanceBubble } from '@/components/hermes/HermesPerformanceBubble';
import { HermesRiggedPortrait } from '@/components/hermes/HermesRiggedPortrait';
import type { HermesVisualState } from '@/components/hermes/hermes-state';
import { HERMES_ACTION_CATALOG, type HermesActionId } from '@/lib/hermes/action-catalog';
import type { HermesSpeechCue, HermesSpeechTone } from '@/lib/hermes/performance-beat';
import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';

const actions = Object.keys(HERMES_ACTION_CATALOG) as HermesActionId[];
const speechFixtures: Partial<Record<HermesActionId, { messageKey: string; tone: HermesSpeechTone }>> = {
  'cap-check': { messageKey: 'performance.capCheck.one', tone: 'focused' },
  'ear-perk': { messageKey: 'performance.earPerk.one', tone: 'curious' },
  'happy-wiggle': { messageKey: 'performance.happyWiggle.one', tone: 'friendly' },
  'lamp-listen': { messageKey: 'performance.lampListen.one', tone: 'reflective' },
  'observe-left': { messageKey: 'performance.observe.one', tone: 'curious' },
  'observe-right': { messageKey: 'performance.observe.two', tone: 'curious' },
  'thinking-pause': { messageKey: 'performance.thinkingPause.one', tone: 'reflective' },
};

export default function HermesLive2DVisualRoute() {
  const [action, setAction] = useState<HermesActionId>('observe-left');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [state, setState] = useState<HermesVisualState>('idle');
  const [fixtureSize, setFixtureSize] = useState<'desktop' | 'mobile'>('desktop');
  const [layerIsolation, setLayerIsolation] = useState<'all' | 'effects' | 'front' | 'rear' | 'wanko'>('all');
  const [speechDismissed, setSpeechDismissed] = useState(false);
  const inputRef = useRef<HermesPetMeshInput>({
    action,
    actionStartedAtMs: 0,
    engaged: false,
    pointer: { x: 0, y: 0 },
    state,
  });

  const selectAction = (next: HermesActionId) => {
    const approval = next === 'approval-still';
    const failed = next === 'failed-settle';
    const nextState: HermesVisualState = approval ? 'awaiting_approval' : failed ? 'failed' : 'idle';
    setAction(next);
    setState(nextState);
    setSpeechDismissed(false);
    inputRef.current = {
      ...inputRef.current,
      action: next,
      actionStartedAtMs: performance.now(),
      engaged: false,
      pointer: { x: 0, y: 0 },
      state: nextState,
    };
  };

  const speechFixture = speechFixtures[action];
  const speechCue: HermesSpeechCue | null = speechFixture ? {
    beatId: `${action}:visual-fixture`,
    messageKey: speechFixture.messageKey,
    tone: speechFixture.tone,
    visibleUntilMs: Number.POSITIVE_INFINITY,
  } : null;

  const setPointer = (engaged: boolean) => {
    inputRef.current = {
      ...inputRef.current,
      engaged,
      pointer: engaged ? { x: .82, y: -.62 } : { x: 0, y: 0 },
    };
  };

  const selectPosterFixture = (next: 'approval' | 'normal' | 'reduced') => {
    const nextAction: HermesActionId = next === 'approval' ? 'approval-still' : 'observe-left';
    const nextState: HermesVisualState = next === 'approval' ? 'awaiting_approval' : 'idle';
    setReducedMotion(next === 'reduced');
    setAction(nextAction);
    setState(nextState);
    setSpeechDismissed(true);
    inputRef.current = {
      ...inputRef.current,
      action: nextAction,
      actionStartedAtMs: performance.now(),
      engaged: false,
      pointer: { x: 0, y: 0 },
      state: nextState,
    };
  };

  const selectApprovalCapture = () => {
    const nextAction: HermesActionId = 'approval-still';
    setReducedMotion(false);
    setAction(nextAction);
    setState('idle');
    setSpeechDismissed(true);
    inputRef.current = {
      ...inputRef.current,
      action: nextAction,
      actionStartedAtMs: performance.now(),
      engaged: false,
      pointer: { x: 0, y: 0 },
      state: 'idle',
    };
  };

  return (
    <main className="min-h-screen bg-[#050706] p-6 text-os-paper" data-hermes-live2d-harness="true">
      <header className="mx-auto mb-5 max-w-[1180px] border-b border-os-rule-dark pb-4">
        <p className="font-mono text-xs uppercase tracking-[.12em] text-os-vermilion">Hermes / Wanko Live2D motion laboratory</p>
        <h1 className="mt-2 font-serif text-3xl">One companion, thirty-two production actions</h1>
      </header>
      <section className="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[minmax(0,1fr)_560px]">
        <div className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3">
          {actions.map((candidate) => (
            <button
              className="border border-os-rule-dark px-3 py-2 text-left font-mono text-xs hover:border-os-vermilion"
              data-hermes-action-control={candidate}
              key={candidate}
              onClick={() => selectAction(candidate)}
              type="button"
            >
              {candidate}
            </button>
          ))}
          <button data-hermes-pointer-control="engage" onClick={() => setPointer(true)} type="button">Pointer engage</button>
          <button data-hermes-pointer-control="reset" onClick={() => setPointer(false)} type="button">Pointer reset</button>
          <button data-hermes-reduced-control onClick={() => setReducedMotion((value) => !value)} type="button">Toggle reduced</button>
          {(['normal', 'reduced', 'approval'] as const).map((posterState) => (
            <button data-hermes-poster-control={posterState} key={posterState} onClick={() => selectPosterFixture(posterState)} type="button">
              Poster {posterState}
            </button>
          ))}
          <button data-hermes-poster-capture="approval" onClick={selectApprovalCapture} type="button">Capture approval pose</button>
          {(['desktop', 'mobile'] as const).map((size) => (
            <button data-hermes-poster-size={size} key={size} onClick={() => setFixtureSize(size)} type="button">
              Fixture {size}
            </button>
          ))}
          {(['all', 'wanko', 'rear', 'front', 'effects'] as const).map((layer) => (
            <button data-hermes-layer-control={layer} key={layer} onClick={() => setLayerIsolation(layer)} type="button">
              Layer {layer}
            </button>
          ))}
        </div>
        <div
          className="hermes-workspace-stage relative mt-16 max-w-full justify-self-end border border-os-rule-dark bg-[#090d0a]"
          data-hermes-live2d-fixture={action}
          data-hermes-layer-isolation={layerIsolation}
          data-hermes-motion-preference={reducedMotion ? 'reduced' : 'full'}
          data-hermes-poster-size-active={fixtureSize}
          data-hermes-stage-size={fixtureSize === 'desktop' ? '336' : '176'}
          style={{ height: fixtureSize === 'desktop' ? 336 : 176, position: 'relative', width: fixtureSize === 'desktop' ? 336 : 176 }}
        >
          <div className="hermes-companion-actor absolute inset-0">
            <HermesRiggedPortrait
              fallback={<span aria-hidden="true" />}
              inputRef={inputRef}
              reducedMotion={reducedMotion}
              state={state}
            />
          </div>
          {speechCue ? (
            <HermesPerformanceBubble
              cue={speechCue}
              onDismiss={() => setSpeechDismissed(true)}
              visible={!speechDismissed}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
