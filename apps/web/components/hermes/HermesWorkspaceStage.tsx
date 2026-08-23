'use client';

import { usePathname, useSearchParams } from 'next/navigation';
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
import {
  createHermesTravelFootprintVariants,
  createHermesTravelTimeline,
  planHermesTravel,
  type HermesFootprintInsets,
  type HermesTravelPlacement,
} from '@/lib/hermes/travel-path';
import { loadHermesMotionPreference, resolveHermesReducedMotion, saveHermesMotionPreference } from '@/lib/hermes/motion-preference';
import {
  createHermesRuntimeStatus,
  reduceHermesRuntimeStatus,
  resolveHermesMotionControl,
  type HermesRuntimeStatus,
} from '@/lib/hermes/hermes-runtime-status';
import { createHermesSpeechState, stepHermesSpeech, type HermesSpeechState } from '@/lib/hermes/performance-beat';
import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';
import { resolveHermesBubblePlacement, resolveHermesSettledDock, type HermesBubblePlacement } from '@/lib/hermes/companion-placement';

import { HermesAssistantDrawer } from './HermesAssistantDrawer';
import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { HermesVisualAdapter } from './HermesVisualAdapter';
import { HermesGuideBubble } from './HermesGuideBubble';
import { HermesPerformanceBubble } from './HermesPerformanceBubble';

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
  setRouteState(state: HermesVisualState): void;
  setWriting(writing: boolean): void;
}

const HermesWorkspaceStageContext = React.createContext<HermesWorkspaceStageContextValue | null>(null);
const neutralSuggestion: HermesGuideSuggestion = { bodyKey: 'guide.neutral.body', kind: 'neutral', titleKey: 'guide.neutral.title' };
const supportedPath = (pathname: string) => pathname === '/dashboard' || pathname.startsWith('/research-objects/');
const viewportClass = (): HermesViewportClass => window.innerWidth <= 640 ? 'mobile' : 'desktop';
const TRAVEL_SEGMENT_MS = 360;
const SETTLED_MOTION_CLEARANCE_PX = 2;
type MeasuredBubblePlacement = HermesBubblePlacement & { stageLeft: number; stageTop: number };
type GuidePlanState = {
  mode: 'travel' | 'edge-stop' | 'static' | null;
  placement: HermesTravelPlacement | null;
};

const footprintFromBounds = (bounds: DOMRectReadOnly, centerPoint: { x: number; y: number }): HermesFootprintInsets => ({
  bottom: bounds.bottom - centerPoint.y,
  left: centerPoint.x - bounds.left,
  right: bounds.right - centerPoint.x,
  top: centerPoint.y - bounds.top,
});

const behaviorInput = (
  state: HermesVisualState,
  pointer: HermesBehaviorInput['pointer'],
  dragging: boolean,
  reducedMotion: boolean,
  nowMs = Date.now(),
): HermesBehaviorInput => ({
  activity: 'active', dragging, guide: 'idle', nowMs, pointer, reducedMotion,
  seed: 0x4845524d, state,
  task: state === 'failed' ? 'failed' : state === 'scanning' ? 'working' : 'idle',
  writing: false,
});

export function HermesWorkspaceStageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale() as 'zh' | 'en';
  const [presentation, setPresentation] = useState<HermesStagePresentation | null>(null);
  const [routeAssistantOpen, setRouteAssistantOpen] = useState(false);
  const [routeState, setRouteState] = useState<HermesVisualState>('idle');
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
  const context = useMemo(() => ({ register, registerAnchor, requestGuide: setGuideTarget, setRouteState, setWriting }), [register, registerAnchor]);
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
          routeState={routeState}
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

function HermesWorkspaceStage({ fallbackAssistantOpen, fallbackOnInvoke, guideTarget, onDismissGuide, presentation, registry, registryVersion, routeState, writing }: {
  fallbackAssistantOpen: boolean;
  fallbackOnInvoke: () => void;
  guideTarget: HermesAnchorId | null;
  onDismissGuide: () => void;
  presentation: HermesStagePresentation | null;
  registry: HermesAnchorRegistry;
  registryVersion: number;
  routeState: HermesVisualState;
  writing: boolean;
}) {
  const searchParams = useSearchParams();
  const motionSearch = searchParams.toString();
  const state = presentation?.state ?? routeState;
  const t = useTranslations('hermesCompanion');
  const workspaceId = presentation?.workspaceId ?? 'workspace-current';
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; customDock: boolean; moved: boolean } | null>(null);
  const pointerRef = useRef({ present: false, speed: 0, x: 0, y: 0 });
  const pointerSampleRef = useRef({ at: 0, x: 0, y: 0 });
  const leaveTimerRef = useRef(0);
  const assistantWasOpenRef = useRef(false);
  const contextLossRecoveriesRef = useRef(0);
  const suppressClickRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRectReadOnly | null>(null);
  const [customDock, setCustomDock] = useState(false);
  const [compactGuide, setCompactGuide] = useState(false);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });
  const [dockReady, setDockReady] = useState(false);
  const [dockKind, setDockKind] = useState<HermesViewportClass | null>(null);
  const [dockStored, setDockStored] = useState<boolean | null>(null);
  const [settlingDockReady, setSettlingDockReady] = useState(false);
  const [settlingNewDock, setSettlingNewDock] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<HermesRuntimeStatus>(() => createHermesRuntimeStatus());
  const effectiveReducedMotion = reducedMotion ?? true;
  const [behavior, setBehavior] = useState<HermesBehaviorFrame>(() => createInitialHermesBehavior(behaviorInput('idle', pointerRef.current, false, true, 0)));
  const behaviorRef = useRef(behavior);
  const [speech, setSpeech] = useState<HermesSpeechState>(() => createHermesSpeechState(Date.now(), 0x4845524d));
  const [guideActions, setGuideActions] = useState<HermesAnchorAction[]>([]);
  const [guideReady, setGuideReady] = useState(false);
  const [guidePlanState, setGuidePlanState] = useState<GuidePlanState>({ mode: null, placement: null });
  const [guideSuppressed, setGuideSuppressed] = useState(false);
  const [protectedGeometryVersion, setProtectedGeometryVersion] = useState(0);
  const [travelRequested, setTravelRequested] = useState(false);
  const [bubblePlacement, setBubblePlacement] = useState<MeasuredBubblePlacement | null>(null);
  const [invokeCount, setInvokeCount] = useState(0);
  const [stageMotionVersion, setStageMotionVersion] = useState(0);
  const guideReplanVersion = guideSuppressed ? stageMotionVersion : 0;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const sync = () => {
      setCompactGuide(query.matches);
      setViewportSize({ height: window.innerHeight, width: window.innerWidth });
    };
    sync();
    query.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      query.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    const search = motionSearch ? `?${motionSearch}` : '';
    const queryPreference = new URLSearchParams(search).get('hermes-motion');
    if (queryPreference === 'full' || queryPreference === 'reduced') saveHermesMotionPreference(window.localStorage, queryPreference);
    const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(resolveHermesReducedMotion(
      search,
      loadHermesMotionPreference(window.localStorage),
      systemPreference.matches,
    ));
    sync();
    systemPreference.addEventListener('change', sync);
    return () => systemPreference.removeEventListener('change', sync);
  }, [motionSearch]);

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
    setDockStored(stored);
    setCustomDock(stored);
    if (stored || !presentation?.anchor) {
      const size = resolveHermesStageSize(false, kind === 'mobile');
      setPosition(resolveHermesDock(preferences, { height: window.innerHeight, width: window.innerWidth }, { height: size, width: size }, true));
    }
    setDockKind(kind);
    setDockReady(true);
  }, [compactGuide, presentation?.anchor, workspaceId]);

  useEffect(() => setTravelRequested(false), [guideTarget]);

  useEffect(() => { behaviorRef.current = behavior; }, [behavior]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const input = behaviorInput(state, pointerRef.current, dragging, effectiveReducedMotion);
      input.guide = guideTarget ? (guideReady ? 'arrived' : 'travel') : 'idle';
      input.writing = writing;
      setBehavior((previous) => stepHermesBehavior(previous, input));
      const activeBehavior = behaviorRef.current;
      const assistantOpen = presentation?.assistantOpen ?? fallbackAssistantOpen;
      const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      setSpeech((previous) => stepHermesSpeech(previous, {
        action: activeBehavior.primary,
        actionStartedAtMs: activeBehavior.startedAtMs,
        allowed: !effectiveReducedMotion && !writing && !guideTarget && state !== 'awaiting_approval'
          && !assistantOpen && !modalOpen && document.visibilityState === 'visible',
        nowMs: input.nowMs,
        seed: input.seed,
      }));
    }, 250);
    return () => window.clearInterval(timer);
  }, [dragging, effectiveReducedMotion, fallbackAssistantOpen, guideReady, guideTarget, presentation?.assistantOpen, state, writing]);

  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  useEffect(() => {
    if (!customDock && dockStored !== false && !guideTarget && !speech.cue) return;
    const selector = '[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]';
    let frame = 0;
    let previous = '';
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
        elements.forEach((element) => geometryObserver.observe(element));
        const next = elements
          .map((element) => element.getBoundingClientRect())
          .filter((bounds) => bounds.width > 0 && bounds.height > 0)
          .map((bounds) => [bounds.left, bounds.top, bounds.right, bounds.bottom].map((value) => Math.round(value)).join(':'))
          .join('|');
        if (next === previous) return;
        previous = next;
        setProtectedGeometryVersion((value) => value + 1);
      });
    };
    const geometryObserver = new ResizeObserver(refresh);
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { attributeFilter: ['class', 'hidden', 'style'], attributes: true, childList: true, subtree: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.cancelAnimationFrame(frame);
      geometryObserver.disconnect();
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [customDock, dockStored, guideTarget, speech.cue]);

  React.useLayoutEffect(() => {
    if (!speech.cue || guideTarget) {
      setBubblePlacement(null);
      return;
    }
    const stage = stageRef.current;
    const bubble = bubbleRef.current;
    const actor = stage?.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]');
    if (!stage || !bubble || !actor) return;
    const viewport = window.visualViewport;
    const placement = resolveHermesBubblePlacement({
      actor: actor.getBoundingClientRect(),
      bubble: { height: bubble.offsetHeight, width: bubble.offsetWidth },
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
          && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      viewport: {
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        left: viewport?.offsetLeft ?? 0,
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
        top: viewport?.offsetTop ?? 0,
      },
    });
    const stageBounds = stage.getBoundingClientRect();
    setBubblePlacement(placement ? {
      ...placement,
      stageLeft: placement.bounds.left - stageBounds.left,
      stageTop: placement.bounds.top - stageBounds.top,
    } : null);
  }, [anchorRect, guideTarget, position, protectedGeometryVersion, speech.cue, stageMotionVersion, viewportSize]);

  const assistantOpen = presentation?.assistantOpen ?? fallbackAssistantOpen;
  const setStageNode = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (node) node.inert = assistantOpen;
  }, [assistantOpen]);

  React.useLayoutEffect(() => {
    if (assistantWasOpenRef.current && !assistantOpen) {
      stageRef.current?.querySelector<HTMLElement>('[data-hermes-input-owner]')?.focus();
    }
    assistantWasOpenRef.current = assistantOpen;
  }, [assistantOpen]);

  useEffect(() => {
    setGuideReady(false);
    if (!guideTarget) {
      if (guideActions.length > 0) setGuideActions([]);
      setGuidePlanState({ mode: null, placement: null });
      setGuideSuppressed(false);
      return;
    }
    if (!dockReady) return;
    const snapshot = registry.snapshot(guideTarget);
    const stage = stageRef.current;
    if (!snapshot || !stage) { setGuideActions([]); return; }
    if (guideActions.join('|') !== snapshot.actions.join('|')) {
      setGuideActions(snapshot.actions);
      return;
    }
    const stageBounds = stage.getBoundingClientRect();
    const from = new DOMRect(stageBounds.x, stageBounds.y, Math.max(1, stageBounds.width), Math.max(1, stageBounds.height));
    const target = new DOMRect(snapshot.rect.x, snapshot.rect.y, snapshot.rect.width, snapshot.rect.height);
    if (customDock && !travelRequested) {
      setGuidePlanState({ mode: 'edge-stop', placement: null });
      setGuideSuppressed(false);
      setGuideReady(true);
      return;
    }
    const actorBounds = stage.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')?.getBoundingClientRect() ?? stageBounds;
    const travelHullBounds = stage.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect() ?? actorBounds;
    const bubbleBounds = bubbleRef.current?.getBoundingClientRect() ?? stageBounds;
    const stageCenter = { x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 };
    const measuredPlacement: HermesTravelPlacement = {
      horizontal: stage.dataset.hermesBubbleHorizontal === 'right' ? 'right' : 'left',
      vertical: stage.dataset.hermesBubbleVertical === 'below' ? 'below' : 'above',
    };
    const footprintVariants = createHermesTravelFootprintVariants(
      footprintFromBounds(travelHullBounds, stageCenter),
      footprintFromBounds(bubbleBounds, stageCenter),
      measuredPlacement,
    );
    const plan = planHermesTravel({
      bottomInsetPx: window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0,
      clearancePx: snapshot.clearancePx,
      editable: target,
      footprint: footprintVariants[0].footprint,
      footprintVariants,
      from,
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0 && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      preferredSides: snapshot.sides,
      target,
      viewport: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    });
    if (effectiveReducedMotion) {
      if (plan.safe) setPosition(plan.dock);
      setGuideSuppressed(!plan.safe);
      setGuidePlanState({ mode: 'static', placement: plan.placement ?? null });
      setGuideReady(true);
      return;
    }
    setGuideSuppressed(!plan.safe);
    setGuidePlanState({ mode: plan.mode === 'edge-stop' ? 'edge-stop' : 'travel', placement: plan.placement ?? null });
    const timeline = createHermesTravelTimeline(plan.points, TRAVEL_SEGMENT_MS);
    const timers = timeline.map((step) => window.setTimeout(() => setPosition(step.point), step.atMs));
    const arrivalMs = timeline.length === 0 ? 0 : timeline.at(-1)!.atMs + TRAVEL_SEGMENT_MS;
    timers.push(window.setTimeout(() => setGuideReady(true), arrivalMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [compactGuide, customDock, dockReady, effectiveReducedMotion, guideActions, guideReplanVersion, guideTarget, protectedGeometryVersion, registry,
    registryVersion, travelRequested, viewportSize]);

  useEffect(() => {
    if (!dockReady || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const size = resolveHermesStageSize(false, compactGuide);
    const half = size / 2;
    const visualViewport = guideTarget ? window.visualViewport : null;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (visualViewport?.width ?? viewportSize.width);
    const viewportBottom = viewportTop + (visualViewport?.height ?? viewportSize.height);
    setPosition((current) => ({
      x: Math.min(viewportRight - half, Math.max(viewportLeft + half, current.x)),
      y: Math.min(viewportBottom - half, Math.max(viewportTop + half, current.y)),
    }));
  }, [compactGuide, dockReady, guideTarget, viewportSize]);

  React.useLayoutEffect(() => {
    if (customDock || dockStored !== false || !dockReady || dockKind !== 'desktop' || dockKind !== viewportClass() || dragging || guideTarget || speech.cue
      || !anchorRect || reducedMotion === null || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const stage = stageRef.current;
    const travelHull = stage?.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]');
    if (!stage || !travelHull) return;
    const stageBounds = stage.getBoundingClientRect();
    const stageSize = resolveHermesStageSize(false, false);
    const anchorCenter = { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 };
    if (Math.abs(stageBounds.width - stageSize) >= 1 || Math.abs(stageBounds.height - stageSize) >= 1
      || Math.abs(stageBounds.left - (anchorCenter.x - stageSize / 2)) >= 1
      || Math.abs(stageBounds.top - (anchorCenter.y - stageSize / 2)) >= 1) return;
    const hullBounds = travelHull.getBoundingClientRect();
    const settled = resolveHermesSettledDock({
      desired: anchorCenter,
      footprint: {
        bottom: Math.max(1, hullBounds.bottom - anchorCenter.y),
        left: Math.max(1, anchorCenter.x - hullBounds.left),
        right: Math.max(1, hullBounds.right - anchorCenter.x),
        top: Math.max(1, anchorCenter.y - hullBounds.top),
      },
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
          && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    if (!settled.safe || Math.hypot(settled.point.x - anchorCenter.x, settled.point.y - anchorCenter.y) < .5) return;
    setSettlingDockReady(false);
    setSettlingNewDock(true);
    setCustomDock(true);
  }, [anchorRect, customDock, dockKind, dockReady, dockStored, dragging, guideTarget, protectedGeometryVersion,
    reducedMotion, speech.cue, stageMotionVersion, viewportSize, workspaceId]);

  React.useLayoutEffect(() => {
    if (settlingNewDock) setSettlingDockReady(false);
  }, [behavior.primary, settlingNewDock]);

  useEffect(() => {
    if (!settlingNewDock) return;
    setSettlingDockReady(true);
    setStageMotionVersion((version) => version + 1);
  }, [behavior.primary, settlingNewDock]);

  React.useLayoutEffect(() => {
    if (!customDock || !dockReady || dockKind !== viewportClass() || dragging || guideTarget
      || (settlingNewDock && !settlingDockReady) || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const stageBounds = stage.getBoundingClientRect();
    const settledStageSize = resolveHermesStageSize(false, dockKind === 'mobile');
    if (Math.abs(stageBounds.width - settledStageSize) >= 1 || Math.abs(stageBounds.height - settledStageSize) >= 1) return;
    if (Math.abs(stageBounds.left - (position.x - settledStageSize / 2)) >= 1
      || Math.abs(stageBounds.top - (position.y - settledStageSize / 2)) >= 1) return;
    const actorBounds = stage.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect()
      ?? stage.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')?.getBoundingClientRect()
      ?? stageBounds;
    const center = { x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 };
    const motionClearance = settlingNewDock ? SETTLED_MOTION_CLEARANCE_PX : 0;
    const settled = resolveHermesSettledDock({
      desired: center,
      footprint: {
        bottom: Math.max(1, actorBounds.bottom - center.y) + motionClearance,
        left: Math.max(1, center.x - actorBounds.left) + motionClearance,
        right: Math.max(1, actorBounds.right - center.x) + motionClearance,
        top: Math.max(1, center.y - actorBounds.top) + motionClearance,
      },
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
          && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    if (!settled.safe) return;
    const settledDistance = Math.hypot(settled.point.x - position.x, settled.point.y - position.y);
    if (settledDistance < (settlingNewDock ? .05 : .5)) {
      if (settlingNewDock) {
        const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, dockKind);
        saveHermesDockPreferences(window.localStorage, workspaceId, dockKind, {
          ...preferences,
          xRatio: settled.point.x / window.innerWidth,
          yRatio: settled.point.y / window.innerHeight,
        });
        setDockStored(true);
        setSettlingNewDock(false);
      }
      return;
    }
    setPosition(settled.point);
    if (settlingNewDock) return;
    const kind = viewportClass();
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, kind);
    saveHermesDockPreferences(window.localStorage, workspaceId, kind, {
      ...preferences,
      xRatio: settled.point.x / window.innerWidth,
      yRatio: settled.point.y / window.innerHeight,
    });
  }, [behavior.primary, customDock, dockKind, dockReady, dragging, guideTarget, position, protectedGeometryVersion,
    settlingDockReady, settlingNewDock, stageMotionVersion, viewportSize, workspaceId]);

  useEffect(() => {
    if (!guideTarget) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"], [aria-modal="true"]')) onDismissGuide();
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [guideTarget, onDismissGuide]);

  const advanceBehavior = (nextPointer = pointerRef.current, nextDragging = dragging) => {
    pointerRef.current = nextPointer;
    setBehavior((previous) => stepHermesBehavior(previous, behaviorInput(state, nextPointer, nextDragging, effectiveReducedMotion)));
  };

  const invokeHermes = () => {
    setInvokeCount((count) => count + 1);
    (presentation?.onInvoke ?? fallbackOnInvoke)();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)
      || !event.target.closest('[data-hermes-input-owner], [data-hermes-carrier-interaction-hull="true"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bounds.left + bounds.width / 2, originY: bounds.top + bounds.height / 2, customDock, moved: false };
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
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        if (guideTarget) onDismissGuide();
        setSpeech((current) => ({ ...current, cue: null }));
        setCustomDock(true);
      }
      if (!drag.moved) {
        advanceBehavior(nextPointer, true);
        return;
      }
      const halfWidth = bounds.width / 2;
      const halfHeight = bounds.height / 2;
      setPosition({
        x: Math.min(window.innerWidth - halfWidth, Math.max(halfWidth, drag.originX + dx)),
        y: Math.min(window.innerHeight - halfHeight, Math.max(halfHeight, drag.originY + dy)),
      });
    }
    advanceBehavior(nextPointer, Boolean(drag));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    advanceBehavior(pointerRef.current, false);
    if (!drag.moved) {
      suppressClickRef.current = true;
      invokeHermes();
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    suppressClickRef.current = true;
    const stageBounds = event.currentTarget.getBoundingClientRect();
    const actorBounds = event.currentTarget.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect()
      ?? event.currentTarget.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')?.getBoundingClientRect()
      ?? stageBounds;
    const center = { x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 };
    const settled = resolveHermesSettledDock({
      desired: center,
      footprint: {
        bottom: Math.max(1, actorBounds.bottom - center.y),
        left: Math.max(1, center.x - actorBounds.left),
        right: Math.max(1, actorBounds.right - center.x),
        top: Math.max(1, center.y - actorBounds.top),
      },
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
          && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    if (!settled.safe) {
      setPosition({ x: drag.originX, y: drag.originY });
      setCustomDock(drag.customDock);
      return;
    }
    setPosition(settled.point);
    const kind = viewportClass();
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, kind);
    saveHermesDockPreferences(window.localStorage, workspaceId, kind, {
      ...preferences,
      xRatio: settled.point.x / window.innerWidth,
      yRatio: settled.point.y / window.innerHeight,
    });
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    setCustomDock(drag.customDock);
    setPosition({ x: drag.originX, y: drag.originY });
    advanceBehavior(pointerRef.current, false);
  };

  const onStageTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    const stageTransition = event.currentTarget === event.target && ['height', 'left', 'top', 'width'].includes(event.propertyName);
    const target = event.target;
    const footprintTransition = target instanceof HTMLElement
      && (target.matches('.hermes-companion-actor') || target.matches('.hermes-wanko-carrier'))
      && ['rotate', 'transform', 'translate'].includes(event.propertyName);
    if (!stageTransition && !footprintTransition) return;
    setStageMotionVersion((version) => version + 1);
  };

  const onPointerLeave = () => {
    pointerSampleRef.current.at = 0;
    if (dragRef.current) return;
    const settleMs = pointerRef.current.speed > .75 ? 700 : 0;
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => advanceBehavior({ present: false, speed: 0, x: 0, y: 0 }, false), settleMs);
  };

  const onPointerOut = (event: React.PointerEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    onPointerLeave();
  };

  const anchored = anchorRect && !customDock && !guideTarget;
  const stageSize = resolveHermesStageSize(false, compactGuide);
  const stageCenterX = anchored ? anchorRect.left + anchorRect.width / 2 : position.x;
  const stageCenterY = anchored ? anchorRect.top + anchorRect.height / 2 : position.y;
  const fallbackBubbleHorizontal = viewportSize.width > 0 && stageCenterX < viewportSize.width / 2 ? 'right' : 'left';
  const fallbackBubbleVertical = viewportSize.height > 0 && stageCenterY < viewportSize.height / 2 ? 'below' : 'above';
  const bubbleHorizontal = guideTarget
    ? guidePlanState.placement?.horizontal ?? fallbackBubbleHorizontal
    : bubblePlacement?.horizontal ?? fallbackBubbleHorizontal;
  const bubbleVertical = guideTarget
    ? guidePlanState.placement?.vertical ?? fallbackBubbleVertical
    : bubblePlacement?.vertical ?? fallbackBubbleVertical;
  const style: React.CSSProperties = {
    height: stageSize, left: stageCenterX - stageSize / 2, top: stageCenterY - stageSize / 2,
    transition: settlingNewDock ? 'none' : undefined, width: stageSize,
  };
  const ageMs = Math.max(0, Date.now() - behavior.startedAtMs);
  const actionStartedAtMs = behavior.startedAtMs === 0 || typeof performance === 'undefined' ? undefined : performance.now() - ageMs;
  const motionControl = resolveHermesMotionControl(effectiveReducedMotion, runtimeStatus);

  return (
    <div
      className="hermes-workspace-stage"
      data-hermes-action={behavior.primary}
      data-hermes-action-kind={behavior.kind}
      data-hermes-action-started-at={behavior.startedAtMs}
      data-hermes-anchored={anchored ? 'true' : 'false'}
      data-hermes-bubble-horizontal={bubbleHorizontal}
      data-hermes-bubble-safe={speech.cue ? (bubblePlacement ? 'true' : 'false') : 'true'}
      data-hermes-bubble-vertical={bubbleVertical}
      data-hermes-dragging={dragging ? 'true' : 'false'}
      data-hermes-guide-motion={guidePlanState.mode ?? 'idle'}
      data-hermes-guide-suppressed={guideSuppressed ? 'true' : 'false'}
      data-hermes-guide-target={guideTarget ?? undefined}
      data-hermes-invoke-count={invokeCount}
      data-hermes-footprint-source="carrier-travel-hull"
      data-hermes-motion-preference={reducedMotion === null ? 'resolving' : reducedMotion ? 'reduced' : 'full'}
      data-hermes-presentation-state={state}
      data-hermes-speech-visible={speech.cue ? 'true' : 'false'}
      data-hermes-stage-size={stageSize}
      data-hermes-workspace-stage="true"
      data-hermes-assistant-open={assistantOpen ? 'true' : 'false'}
      aria-hidden={assistantOpen ? 'true' : undefined}
      onLostPointerCapture={onPointerCancel}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onPointerUp={onPointerUp}
      onTransitionEnd={onStageTransitionEnd}
      ref={setStageNode}
      style={style}
    >
      {reducedMotion !== null ? <HermesVisualAdapter
        action={behavior.primary}
        actionStartedAtMs={actionStartedAtMs}
        assistantOpen={presentation?.assistantOpen ?? fallbackAssistantOpen}
        onInvoke={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          invokeHermes();
        }}
        onRuntimeStatus={(status) => {
          if (status.phase === 'fallback' && status.reason === 'context-lost' && contextLossRecoveriesRef.current < 1) {
            contextLossRecoveriesRef.current += 1;
            setRuntimeStatus(reduceHermesRuntimeStatus(status, { type: 'retry' }));
            return;
          }
          setRuntimeStatus(status);
        }}
        promptSuppressed={Boolean(speech.cue) || Boolean(guideTarget)}
        reducedMotion={effectiveReducedMotion}
        rendererGeneration={runtimeStatus.generation}
        state={state}
        suggestion={presentation?.suggestion ?? neutralSuggestion}
      /> : null}
      {!guideTarget && speech.cue ? (
        <HermesPerformanceBubble
          cue={speech.cue}
          onDismiss={() => setSpeech((current) => ({ ...current, cue: null }))}
          ref={bubbleRef}
          style={bubblePlacement ? {
            bottom: 'auto',
            left: bubblePlacement.stageLeft,
            right: 'auto',
            top: bubblePlacement.stageTop,
          } : undefined}
          visible={Boolean(bubblePlacement)}
        />
      ) : null}
      {reducedMotion !== null ? <button
        className="hermes-motion-enable"
        data-hermes-motion-toggle
        data-motion-active={reducedMotion ? 'false' : 'true'}
        data-motion-runtime={runtimeStatus.phase}
        disabled={motionControl.action === 'none'}
        onClick={(event) => {
          event.stopPropagation();
          if (motionControl.action === 'retry') {
            contextLossRecoveriesRef.current = 0;
            setRuntimeStatus((current) => reduceHermesRuntimeStatus(current, { type: 'retry' }));
            return;
          }
          const preference = reducedMotion ? 'full' : 'reduced';
          saveHermesMotionPreference(window.localStorage, preference);
          setReducedMotion(preference === 'reduced');
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >{t(motionControl.label === 'enable' ? 'enableMotion'
        : motionControl.label === 'disable' ? 'disableMotion'
          : motionControl.label === 'retry' ? 'retryMotion'
            : 'startingMotion')}</button> : null}
      {guideTarget ? (
        <HermesGuideBubble
          actions={guideActions}
          edgeStop={guidePlanState.mode === 'edge-stop'}
          onDismiss={onDismissGuide}
          onTakeMeThere={() => {
            document.querySelector(`[data-hermes-anchor="${guideTarget}"]`)?.scrollIntoView({ behavior: effectiveReducedMotion ? 'auto' : 'smooth', block: 'center' });
            setGuideReady(false);
            setTravelRequested(true);
          }}
          ref={bubbleRef}
          target={guideTarget}
          visible={guideReady && !guideSuppressed}
        />
      ) : null}
    </div>
  );
}
