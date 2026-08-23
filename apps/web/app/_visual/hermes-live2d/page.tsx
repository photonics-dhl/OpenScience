'use client';

import { useRef, useState } from 'react';

import { HermesPerformanceBubble } from '@/components/hermes/HermesPerformanceBubble';
import { HermesRiggedPortrait } from '@/components/hermes/HermesRiggedPortrait';
import type { HermesVisualState } from '@/components/hermes/hermes-state';
import { HERMES_ACTION_CATALOG, type HermesActionId } from '@/lib/hermes/action-catalog';
import type { HermesSpeechCue, HermesSpeechTone } from '@/lib/hermes/performance-beat';
import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';
import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

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
  const [fixtureSize, setFixtureSize] = useState<'desktop' | 'mobile'>('mobile');
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
  const stageSize = resolveHermesStageSize(fixtureSize === 'desktop', fixtureSize === 'mobile');

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
    <main className="min-h-screen bg-[#0b0b0a] px-5 pb-16 pt-6 text-os-paper sm:px-8 lg:px-12" data-hermes-live2d-harness="true" data-hermes-ro-create-fixture="true">
      <header className="mx-auto flex max-w-[92rem] items-center justify-between border-b border-white/20 pb-5">
        <span className="text-sm text-white/70">← Research dashboard</span>
        <p className="font-mono text-xs uppercase tracking-[.12em] text-white/55">OpenScience / Research Object</p>
      </header>
      <section className="mx-auto grid max-w-[92rem] gap-12 pt-10 lg:grid-cols-[minmax(18rem,.55fr)_minmax(0,1.45fr)] lg:gap-20">
        <aside>
          <p className="font-mono text-xs uppercase tracking-[.12em] text-os-vermilion">01 / Research identity</p>
          <h1 className="mt-5 max-w-xl font-display text-4xl leading-[.98] sm:text-6xl lg:text-[4.7rem]">Create<br />Research Object</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/65">Start from a blank six-field SDF, or bring existing research material into an evidence-preserving draft.</p>
        </aside>
        <form className="min-w-0" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-6 border-b border-white/25 pb-10 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/70">Workspace<select className="min-h-12 border-0 border-b border-white/25 bg-transparent text-base text-white"><option className="bg-[#11100f]">Research workspace</option></select></label>
            <label className="grid gap-2 text-sm text-white/70">Research title<input className="min-h-12 border-0 border-b border-white/25 bg-transparent px-1 text-base text-white outline-none focus:border-os-vermilion" placeholder="A precise working title" /></label>
          </div>
          <section className="border-b border-white/20 py-12">
            <p className="font-display text-3xl">Build the structure first.</p>
            <p className="mt-3 max-w-xl text-base leading-7 text-white/65">Problem, Insight, Method, Results, Limitations and Reproducibility remain editable evidence fields.</p>
          </section>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-white/25 pt-6">
            <p className="max-w-xl text-xs leading-5 text-white/60">No source material is required for a blank draft.</p>
            <button className="min-h-12 bg-[#bd321d] px-7 text-sm font-semibold text-white" data-hermes-primary-create type="submit">Create Research Object</button>
          </footer>
        </form>
      </section>
      <details className="fixed bottom-4 left-4 z-[80] max-w-[calc(100vw-2rem)] bg-[#111411] text-os-paper shadow-xl" data-hermes-dev-tray="true">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-[.1em] text-white/65">Hermes diagnostics</summary>
        <div className="grid max-h-[60vh] w-[38rem] max-w-full grid-cols-2 gap-2 overflow-auto border-t border-white/10 p-3 sm:grid-cols-3">
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
      </details>
        <div
          className="hermes-workspace-stage"
          data-hermes-live2d-fixture={action}
          data-hermes-layer-isolation={layerIsolation}
          data-hermes-motion-preference={reducedMotion ? 'reduced' : 'full'}
          data-hermes-poster-size-active={fixtureSize}
          data-hermes-stage-size={stageSize}
          style={{ bottom: 24, height: stageSize, left: 'auto', position: 'fixed', right: 24, top: 'auto', width: stageSize }}
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
    </main>
  );
}
