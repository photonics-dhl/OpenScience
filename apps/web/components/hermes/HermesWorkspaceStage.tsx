'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createInitialHermesBehavior, stepHermesBehavior, type HermesBehaviorFrame, type HermesBehaviorInput } from '@/lib/hermes/behavior-director';
import { createHermesAnchorRegistry, type HermesAnchorAction, type HermesAnchorId, type HermesAnchorRegistration, type HermesAnchorRegistry } from '@/lib/hermes/anchor-registry';
import type { WorkspaceGuidePayload } from '@/lib/api';
import {
  hasStoredHermesDockPreferences,
  loadHermesDockPreferences,
  resolveHermesDock,
  saveHermesDockPreferences,
  type HermesViewportClass,
} from '@/lib/hermes/dock-preferences';
import { createHermesTravelTimeline, planHermesTravel } from '@/lib/hermes/travel-path';
import { loadHermesMotionPreference, resolveHermesReducedMotion, saveHermesMotionPreference } from '@/lib/hermes/motion-preference';

import { HermesAssistantDrawer } from './HermesAssistantDrawer';
import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { HermesVisualAdapter } from './HermesVisualAdapter';
import { HermesGuideBubble } from './HermesGuideBubble';

interface HermesStagePresentation {
  anchor: HTMLElement;
  assistantOpen: boolean;
  onInvoke: () => void;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId: string;
}

interface HermesWorkspaceStageContextValue {
  register(presentation: HermesStagePresentation): () => void;
  registerAnchor(registration: HermesAnchorRegistration): () => void;
  requestGuide(target: HermesAnchorId | null): void;
  setWriting(writing: boolean): void;
}

const HermesWorkspaceStageContext = React.createContext<HermesWorkspaceStageContextValue | null>(null);
const neutralSuggestion: HermesGuideSuggestion = { bodyKey: 'guide.neutral.body', kind: 'neutral', titleKey: 'guide.neutral.title' };
const supportedPath = (pathname: string) => pathname === '/dashboard' || pathname.startsWith('/research-objects/');
const viewportClass = (): HermesViewportClass => window.innerWidth <= 640 ? 'mobile' : 'desktop';
const TRAVEL_SEGMENT_MS = 360;

const behaviorInput = (
  state: HermesVisualState,
  pointer: HermesBehaviorInput['pointer'],
  dragging: boolean,
  reducedMotion: boolean,
  nowMs = Date.now(),
): HermesBehaviorInput => ({
  activity: 'balanced', dragging, guide: 'idle', nowMs, pointer, reducedMotion,
  seed: 0x4845524d, state,
  task: state === 'failed' ? 'failed' : state === 'scanning' ? 'working' : 'idle',
  writing: false,
});

export function HermesWorkspaceStageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale() as 'zh' | 'en';
  const [presentation, setPresentation] = useState<HermesStagePresentation | null>(null);
  const [routeAssistantOpen, setRouteAssistantOpen] = useState(false);
  const [guideTarget, setGuideTarget] = useState<HermesAnchorId | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [writing, setWriting] = useState(false);
  const registryRef = useRef<HermesAnchorRegistry>(createHermesAnchorRegistry());
  const tokenRef = useRef<symbol | null>(null);
  const register = useCallback((next: HermesStagePresentation) => {
    const token = Symbol('HermesDockAnchor');
    tokenRef.current = token;
    setPresentation(next);
    return () => {
      if (tokenRef.current !== token) return;
      tokenRef.current = null;
      setPresentation(null);
    };
  }, []);
  const registerAnchor = useCallback((registration: HermesAnchorRegistration) => {
    const release = registryRef.current.register(registration);
    setRegistryVersion((version) => version + 1);
    return () => { release(); setRegistryVersion((version) => version + 1); };
  }, []);
  useEffect(() => {
    if (pathname === '/research-objects/new') setGuideTarget('ro-title');
    else if (/^\/research-objects\/[^/]+\/edit$/.test(pathname)) setGuideTarget('sdf-problem');
    else setGuideTarget(null);
  }, [pathname]);
  useEffect(() => setRouteAssistantOpen(false), [pathname]);
  const context = useMemo(() => ({ register, registerAnchor, requestGuide: setGuideTarget, setWriting }), [register, registerAnchor]);
  const route = pathname === '/research-objects/new' ? 'research-object-new' : 'research-object-edit';
  const researchObjectId = /^\/research-objects\/([^/]+)\/edit$/.exec(pathname)?.[1];
  const routeContext: WorkspaceGuidePayload['context'] = researchObjectId
    ? { tasks: [], researchObjects: [{ id: researchObjectId, title: 'Current research object', status: 'draft' }] }
    : { tasks: [], researchObjects: [] };
  return (
    <HermesWorkspaceStageContext.Provider value={context}>
      {children}
      {supportedPath(pathname) ? (
        <HermesWorkspaceStage
          guideTarget={guideTarget}
          fallbackAssistantOpen={routeAssistantOpen}
          fallbackOnInvoke={() => setRouteAssistantOpen(true)}
          onDismissGuide={() => setGuideTarget(null)}
          presentation={presentation}
          registry={registryRef.current}
          registryVersion={registryVersion}
          writing={writing}
        />
      ) : null}
      {pathname !== '/dashboard' && supportedPath(pathname) && !presentation ? (
        <HermesAssistantDrawer
          dashboardContext={routeContext}
          locale={locale}
          onOpenChange={setRouteAssistantOpen}
          open={routeAssistantOpen}
          route={route}
          suggestion={neutralSuggestion}
          target={guideTarget}
        />
      ) : null}
    </HermesWorkspaceStageContext.Provider>
  );
}

export function useHermesWorkspaceStage() {
  const context = React.useContext(HermesWorkspaceStageContext);
  if (!context) throw new Error('HermesDockAnchor must be rendered within HermesWorkspaceStageProvider');
  return context;
}

export function useOptionalHermesWorkspaceStage() {
  return React.useContext(HermesWorkspaceStageContext);
}

function HermesWorkspaceStage({ fallbackAssistantOpen, fallbackOnInvoke, guideTarget, onDismissGuide, presentation, registry, registryVersion, writing }: {
  fallbackAssistantOpen: boolean;
  fallbackOnInvoke: () => void;
  guideTarget: HermesAnchorId | null;
  onDismissGuide: () => void;
  presentation: HermesStagePresentation | null;
  registry: HermesAnchorRegistry;
  registryVersion: number;
  writing: boolean;
}) {
  const state = presentation?.state ?? 'idle';
  const t = useTranslations('hermesCompanion');
  const workspaceId = presentation?.workspaceId ?? 'workspace-current';
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const pointerRef = useRef({ present: false, speed: 0, x: 0, y: 0 });
  const pointerSampleRef = useRef({ at: 0, x: 0, y: 0 });
  const leaveTimerRef = useRef(0);
  const suppressClickRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRectReadOnly | null>(null);
  const [customDock, setCustomDock] = useState(false);
  const [dockReady, setDockReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(true);
  const [behavior, setBehavior] = useState<HermesBehaviorFrame>(() => createInitialHermesBehavior(behaviorInput('idle', pointerRef.current, false, true, 0)));
  const [guideActions, setGuideActions] = useState<HermesAnchorAction[]>([]);
  const [guideReady, setGuideReady] = useState(false);
  const [guideMode, setGuideMode] = useState<'travel' | 'edge-stop' | 'static' | null>(null);
  const [travelRequested, setTravelRequested] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const queryPreference = new URLSearchParams(window.location.search).get('hermes-motion');
    if (queryPreference === 'full' || queryPreference === 'reduced') saveHermesMotionPreference(window.localStorage, queryPreference);
    const sync = () => setReducedMotion(resolveHermesReducedMotion(
      media.matches,
      window.location.search,
      loadHermesMotionPreference(window.localStorage),
    ));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!presentation?.anchor) { setAnchorRect(null); return; }
    const anchor = presentation.anchor;
    const sync = () => setAnchorRect(anchor.isConnected ? anchor.getBoundingClientRect() : null);
    const observer = new ResizeObserver(sync);
    observer.observe(anchor);
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [presentation?.anchor]);

  useEffect(() => {
    setDockReady(false);
    const kind = viewportClass();
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, kind);
    const stored = hasStoredHermesDockPreferences(window.localStorage, workspaceId, kind);
    setCustomDock(stored);
    if (stored || !presentation?.anchor) {
      setPosition(resolveHermesDock(preferences, { height: window.innerHeight, width: window.innerWidth }, { height: 288, width: 288 }, true));
    }
    setDockReady(true);
  }, [presentation?.anchor, workspaceId]);

  useEffect(() => setTravelRequested(false), [guideTarget]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const input = behaviorInput(state, pointerRef.current, dragging, reducedMotion);
      input.guide = guideTarget ? (guideReady ? 'arrived' : 'travel') : 'idle';
      input.writing = writing;
      setBehavior((previous) => stepHermesBehavior(previous, input));
    }, 250);
    return () => window.clearInterval(timer);
  }, [dragging, guideReady, guideTarget, reducedMotion, state, writing]);

  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  useEffect(() => {
    setGuideReady(false);
    if (!guideTarget) { setGuideActions([]); setGuideMode(null); return; }
    if (!dockReady) return;
    const snapshot = registry.snapshot(guideTarget);
    const stage = stageRef.current;
    if (!snapshot || !stage) { setGuideActions([]); return; }
    setGuideActions(snapshot.actions);
    const stageBounds = stage.getBoundingClientRect();
    const from = new DOMRect(stageBounds.x, stageBounds.y, Math.max(1, stageBounds.width), Math.max(1, stageBounds.height));
    const target = new DOMRect(snapshot.rect.x, snapshot.rect.y, snapshot.rect.width, snapshot.rect.height);
    if (reducedMotion) {
      setGuideMode('static');
      setGuideReady(true);
      return;
    }
    if (customDock && !travelRequested) {
      setGuideMode('edge-stop');
      setGuideReady(true);
      return;
    }
    const plan = planHermesTravel({
      bottomInsetPx: window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0,
      editable: target,
      from,
      preferredSides: snapshot.sides,
      target,
      viewport: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    });
    setGuideMode(plan.mode === 'edge-stop' ? 'edge-stop' : 'travel');
    const timeline = createHermesTravelTimeline(plan.points, TRAVEL_SEGMENT_MS);
    const timers = timeline.map((step) => window.setTimeout(() => setPosition(step.point), step.atMs));
    const arrivalMs = timeline.length === 0 ? 0 : timeline.at(-1)!.atMs + TRAVEL_SEGMENT_MS;
    timers.push(window.setTimeout(() => setGuideReady(true), arrivalMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [customDock, dockReady, guideTarget, reducedMotion, registry, registryVersion, travelRequested]);

  useEffect(() => {
    if (!guideTarget) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismissGuide(); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [guideTarget, onDismissGuide]);

  const advanceBehavior = (nextPointer = pointerRef.current, nextDragging = dragging) => {
    pointerRef.current = nextPointer;
    setBehavior((previous) => stepHermesBehavior(previous, behaviorInput(state, nextPointer, nextDragging, reducedMotion)));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bounds.left + bounds.width / 2, originY: bounds.top + bounds.height / 2, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    advanceBehavior(pointerRef.current, true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    window.clearTimeout(leaveTimerRef.current);
    const now = performance.now();
    const previous = pointerSampleRef.current;
    const deltaMs = Math.max(1, now - previous.at);
    const speed = previous.at === 0 ? 0 : Math.hypot(event.clientX - previous.x, event.clientY - previous.y) / deltaMs;
    pointerSampleRef.current = { at: now, x: event.clientX, y: event.clientY };
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextPointer = {
      present: true,
      speed,
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / Math.max(1, bounds.width) - .5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / Math.max(1, bounds.height) - .5) * 2)),
    };
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      setCustomDock(true);
      setPosition({ x: drag.originX + dx, y: drag.originY + dy });
    }
    advanceBehavior(nextPointer, Boolean(drag));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
    advanceBehavior(pointerRef.current, false);
    if (!drag.moved) {
      suppressClickRef.current = true;
      (presentation?.onInvoke ?? fallbackOnInvoke)();
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    suppressClickRef.current = true;
    const kind = viewportClass();
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, kind);
    const bounds = event.currentTarget.getBoundingClientRect();
    saveHermesDockPreferences(window.localStorage, workspaceId, kind, {
      ...preferences,
      xRatio: (bounds.left + bounds.width / 2) / window.innerWidth,
      yRatio: (bounds.top + bounds.height / 2) / window.innerHeight,
    });
  };

  const onPointerLeave = () => {
    pointerSampleRef.current.at = 0;
    if (dragRef.current) return;
    const settleMs = pointerRef.current.speed > .75 ? 700 : 0;
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => advanceBehavior({ present: false, speed: 0, x: 0, y: 0 }, false), settleMs);
  };

  const anchored = anchorRect && !customDock;
  const style: React.CSSProperties = anchored ? { height: anchorRect.height, left: anchorRect.left, top: anchorRect.top, width: anchorRect.width } : {
    height: 288, left: position.x - 144, top: position.y - 144, width: 288,
  };
  const ageMs = Math.max(0, Date.now() - behavior.startedAtMs);
  const actionStartedAtMs = behavior.startedAtMs === 0 || typeof performance === 'undefined' ? undefined : performance.now() - ageMs;

  return (
    <div
      className="hermes-workspace-stage"
      data-hermes-action={behavior.primary}
      data-hermes-action-kind={behavior.kind}
      data-hermes-action-started-at={behavior.startedAtMs}
      data-hermes-dragging={dragging ? 'true' : 'false'}
      data-hermes-guide-motion={guideMode ?? 'idle'}
      data-hermes-guide-target={guideTarget ?? undefined}
      data-hermes-motion-preference={reducedMotion ? 'reduced' : 'full'}
      data-hermes-workspace-stage="true"
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={stageRef}
      style={style}
    >
      <HermesVisualAdapter
        action={behavior.primary}
        actionStartedAtMs={actionStartedAtMs}
        assistantOpen={presentation?.assistantOpen ?? fallbackAssistantOpen}
        onInvoke={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          (presentation?.onInvoke ?? fallbackOnInvoke)();
        }}
        reducedMotion={reducedMotion}
        state={state}
        suggestion={presentation?.suggestion ?? neutralSuggestion}
      />
      {reducedMotion ? (
        <button
          className="hermes-motion-enable"
          onClick={(event) => {
            event.stopPropagation();
            saveHermesMotionPreference(window.localStorage, 'full');
            setReducedMotion(false);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >{t('enableMotion')}</button>
      ) : null}
      {guideReady && guideTarget ? (
        <HermesGuideBubble
          actions={guideActions}
          edgeStop={guideMode === 'edge-stop'}
          onDismiss={onDismissGuide}
          onTakeMeThere={() => {
            document.querySelector(`[data-hermes-anchor="${guideTarget}"]`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
            setTravelRequested(true);
          }}
          target={guideTarget}
        />
      ) : null}
    </div>
  );
}
