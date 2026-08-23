'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HermesBehaviorInput } from '@/lib/hermes/behavior-director';
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
  resolveHermesGuideSourceCandidate,
  resolveHermesStationaryGuidePlacement,
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
import { createHermesPerformanceState, stepHermesPerformance } from '@/lib/hermes/performance-director';
import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';
import {
  expandHermesFootprintForMotion,
  expandHermesRectForMotion,
  HERMES_PATROL_MOTION_ENVELOPE,
  resolveHermesBubblePlacement,
  resolveHermesSettledDock,
  type HermesBubblePlacement,
} from '@/lib/hermes/companion-placement';

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
const GUIDE_PRECLAMP_MOTION_CLEARANCE_PX = 6;
type MeasuredBubblePlacement = HermesBubblePlacement & { stageLeft: number; stageTop: number };
type GuidePlanState = {
  mode: 'travel' | 'edge-stop' | 'static' | null;
  placement: HermesTravelPlacement | null;
};
type HermesViewportRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};
type GuideDockContext = {
  customDock: boolean;
  dockKind: HermesViewportClass;
  pathname: string;
  workspaceId: string;
};
type GuideDockOrigin = GuideDockContext & { point: { x: number; y: number } };
type GuideRestoreTransaction = GuideDockContext & { epoch: number; point: { x: number; y: number } };
type GuideSettledReplan = {
  contextKey: string;
  epoch: number;
  point: { x: number; y: number };
};
type GuideDiagnostics = {
  phase: 'idle' | 'source-settle' | 'route' | 'edge-stop';
  routeStart: { x: number; y: number } | null;
  settledSource: { x: number; y: number } | null;
  timelineCount: number;
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
  const pathname = usePathname();
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
  const guideBubbleLayoutSizeRef = useRef('');
  const guideBubbleLayoutPhaseRef = useRef<'idle' | 'awaiting-measure' | 'measured'>('idle');
  const [anchorRect, setAnchorRect] = useState<DOMRectReadOnly | null>(null);
  const [customDock, setCustomDock] = useState(false);
  const [compactGuide, setCompactGuide] = useState(false);
  const [viewportSize, setViewportSize] = useState<HermesViewportRect>({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });
  const [dockReady, setDockReady] = useState(false);
  const [dockKind, setDockKind] = useState<HermesViewportClass | null>(null);
  const [dockStored, setDockStored] = useState<boolean | null>(null);
  const [settlingDockReady, setSettlingDockReady] = useState(false);
  const [settlingNewDock, setSettlingNewDock] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef(position);
  const pendingSettledReplanRef = useRef<GuideSettledReplan | null>(null);
  const nextSettledReplanEpochRef = useRef(0);
  const guideOriginRef = useRef<GuideDockOrigin | null>(null);
  const restoringGuideDockRef = useRef<GuideRestoreTransaction | null>(null);
  const nextGuideRestoreEpochRef = useRef(0);
  const skipGuideRestorePersistenceRef = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<HermesRuntimeStatus>(() => createHermesRuntimeStatus());
  const effectiveReducedMotion = reducedMotion ?? true;
  const [performanceState, setPerformanceState] = useState(() => createHermesPerformanceState(
    behaviorInput('idle', pointerRef.current, false, true, 0),
    Date.now(),
  ));
  const { behavior, speech } = performanceState;
  const [guideActions, setGuideActions] = useState<HermesAnchorAction[]>([]);
  const [guideReady, setGuideReady] = useState(false);
  const [guidePlanState, setGuidePlanState] = useState<GuidePlanState>({ mode: null, placement: null });
  const [guideSuppressed, setGuideSuppressed] = useState(false);
  const [guideBubbleMeasuring, setGuideBubbleMeasuring] = useState(false);
  const [guideBubbleSizeVersion, setGuideBubbleSizeVersion] = useState(0);
  const [patrolEnvelopeSafe, setPatrolEnvelopeSafe] = useState(false);
  const [protectedGeometryVersion, setProtectedGeometryVersion] = useState(0);
  const [travelRequested, setTravelRequested] = useState(false);
  const [bubblePlacement, setBubblePlacement] = useState<MeasuredBubblePlacement | null>(null);
  const [invokeCount, setInvokeCount] = useState(0);
  const [stageMotionVersion, setStageMotionVersion] = useState(0);
  const [stationaryGeometryVersion, setStationaryGeometryVersion] = useState(0);
  const [settledReplan, setSettledReplan] = useState<GuideSettledReplan | null>(null);
  const [guideRestoreActive, setGuideRestoreActive] = useState(false);
  const [guideDiagnostics, setGuideDiagnostics] = useState<GuideDiagnostics>({
    phase: 'idle', routeStart: null, settledSource: null, timelineCount: 0,
  });
  const visualAction = behavior.primary === 'patrol' && !patrolEnvelopeSafe ? 'blink-single' : behavior.primary;
  const guidePlanCountRef = useRef(0);
  const guideSettledReplanCountRef = useRef(0);
  const lastPlannedSettledEpochRef = useRef(0);

  const advancePerformance = useCallback((nextPointer = pointerRef.current, nextDragging = dragging) => {
    pointerRef.current = nextPointer;
    const input = behaviorInput(state, nextPointer, nextDragging, effectiveReducedMotion);
    input.guide = guideTarget ? (guideReady ? 'arrived' : 'travel') : 'idle';
    input.writing = writing;
    const assistantOpen = presentation?.assistantOpen ?? fallbackAssistantOpen;
    const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
    const speechAllowed = !effectiveReducedMotion && !writing && !guideTarget && state !== 'awaiting_approval'
      && !assistantOpen && !modalOpen && document.visibilityState === 'visible';
    setPerformanceState((previous) => stepHermesPerformance(previous, { behaviorInput: input, speechAllowed }));
  }, [dragging, effectiveReducedMotion, fallbackAssistantOpen, guideReady, guideTarget, presentation?.assistantOpen, state, writing]);

  React.useLayoutEffect(() => { positionRef.current = position; }, [position]);

  const beginGuideBubbleLayoutChange = useCallback(() => {
    guideBubbleLayoutPhaseRef.current = 'awaiting-measure';
    setGuideBubbleMeasuring(true);
  }, []);

  const guideContextKey = guideTarget && dockKind ? `${workspaceId}:${dockKind}:${pathname}:${guideTarget}` : null;
  const guideContextKeyRef = useRef(guideContextKey);
  guideContextKeyRef.current = guideContextKey;

  const movePositionAwaitingSettledReplan = useCallback((point: { x: number; y: number }, contextKey: string) => {
    if (Math.hypot(point.x - positionRef.current.x, point.y - positionRef.current.y) < .05) return false;
    const epoch = nextSettledReplanEpochRef.current + 1;
    nextSettledReplanEpochRef.current = epoch;
    pendingSettledReplanRef.current = { contextKey, epoch, point };
    positionRef.current = point;
    setPosition(point);
    return true;
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const sync = () => {
      const visualViewport = window.visualViewport;
      const left = visualViewport?.offsetLeft ?? 0;
      const top = visualViewport?.offsetTop ?? 0;
      const width = visualViewport?.width ?? window.innerWidth;
      const height = visualViewport?.height ?? window.innerHeight;
      setCompactGuide(query.matches);
      setViewportSize({ bottom: top + height, height, left, right: left + width, top, width });
    };
    sync();
    query.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    return () => {
      query.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
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

  React.useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!guideTarget || !bubble) {
      guideBubbleLayoutSizeRef.current = '';
      guideBubbleLayoutPhaseRef.current = 'idle';
      setGuideBubbleMeasuring(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      const signature = `${bubble.offsetWidth}:${bubble.offsetHeight}`;
      if (!guideBubbleLayoutSizeRef.current) {
        guideBubbleLayoutSizeRef.current = signature;
        return;
      }
      if (guideBubbleLayoutPhaseRef.current === 'awaiting-measure') {
        guideBubbleLayoutPhaseRef.current = 'measured';
        guideBubbleLayoutSizeRef.current = signature;
        setGuideBubbleSizeVersion((version) => version + 1);
        return;
      }
      if (guideBubbleLayoutSizeRef.current === signature) return;
      guideBubbleLayoutSizeRef.current = signature;
    };
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(sync);
    observer.observe(bubble);
    sync();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [guideBubbleMeasuring, guideTarget]);

  useEffect(() => {
    setDockReady(false);
    const kind = viewportClass();
    const contextPrefix = `${workspaceId}:${kind}:`;
    if (pendingSettledReplanRef.current && !pendingSettledReplanRef.current.contextKey.startsWith(contextPrefix)) {
      pendingSettledReplanRef.current = null;
    }
    if (restoringGuideDockRef.current
      && (restoringGuideDockRef.current.workspaceId !== workspaceId || restoringGuideDockRef.current.dockKind !== kind)) {
      restoringGuideDockRef.current = null;
      skipGuideRestorePersistenceRef.current = null;
      setGuideRestoreActive(false);
    }
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, kind);
    const stored = hasStoredHermesDockPreferences(window.localStorage, workspaceId, kind);
    setDockStored(stored);
    setCustomDock(stored);
    if (stored || !presentation?.anchor) {
      const size = resolveHermesStageSize(false, kind === 'mobile');
      const resolved = resolveHermesDock(preferences, { height: window.innerHeight, width: window.innerWidth }, { height: size, width: size }, true);
      positionRef.current = resolved;
      setPosition(resolved);
    }
    setDockKind(kind);
    setDockReady(true);
  }, [compactGuide, presentation?.anchor, workspaceId]);

  React.useLayoutEffect(() => {
    const currentPathname = window.location.pathname;
    if (guideTarget && dockReady && dockKind) {
      if (!guideOriginRef.current) guideOriginRef.current = {
        customDock, dockKind, pathname: currentPathname, point: { ...positionRef.current }, workspaceId,
      };
      return;
    }
    const origin = guideOriginRef.current;
    if (!origin) return;
    guideOriginRef.current = null;
    pendingSettledReplanRef.current = null;
    if (dragging || dragRef.current?.moved) return;
    const currentKind = dockKind ?? viewportClass();
    const currentContextMatches = origin.workspaceId === workspaceId && origin.dockKind === currentKind
      && origin.customDock === customDock && origin.pathname === currentPathname;
    const half = resolveHermesStageSize(false, currentKind === 'mobile') / 2;
    const preferences = loadHermesDockPreferences(window.localStorage, workspaceId, currentKind);
    const stored = hasStoredHermesDockPreferences(window.localStorage, workspaceId, currentKind);
    const desired = currentContextMatches
      ? origin.point
      : resolveHermesDock(preferences, { height: window.innerHeight, width: window.innerWidth }, { height: half * 2, width: half * 2 }, true);
    if (!currentContextMatches) setCustomDock(stored);
    const restored = {
      x: Math.min(window.innerWidth - half, Math.max(half, desired.x)),
      y: Math.min(window.innerHeight - half, Math.max(half, desired.y)),
    };
    const stageBounds = stageRef.current?.getBoundingClientRect();
    const actualCenter = stageBounds ? {
      x: stageBounds.left + stageBounds.width / 2,
      y: stageBounds.top + stageBounds.height / 2,
    } : null;
    if (actualCenter && Math.hypot(actualCenter.x - restored.x, actualCenter.y - restored.y) < .5) {
      restoringGuideDockRef.current = null;
      skipGuideRestorePersistenceRef.current = null;
      setGuideRestoreActive(false);
      return;
    }
    const epoch = nextGuideRestoreEpochRef.current + 1;
    nextGuideRestoreEpochRef.current = epoch;
    restoringGuideDockRef.current = {
      customDock: currentContextMatches ? origin.customDock : stored,
      dockKind: currentKind,
      epoch,
      pathname: currentPathname,
      point: restored,
      workspaceId,
    };
    skipGuideRestorePersistenceRef.current = epoch;
    setGuideRestoreActive(true);
    positionRef.current = restored;
    setPosition(restored);
  }, [customDock, dockKind, dockReady, dragging, guideTarget, pathname, workspaceId]);

  const consumeSettledMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const centerPoint = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const pending = pendingSettledReplanRef.current;
    if (pending && pending.contextKey === guideContextKeyRef.current
      && Math.hypot(centerPoint.x - pending.point.x, centerPoint.y - pending.point.y) < .5) {
      pendingSettledReplanRef.current = null;
      setSettledReplan({ ...pending, point: centerPoint });
    }
    const restoring = restoringGuideDockRef.current;
    const restoreContextMatches = restoring && restoring.epoch === skipGuideRestorePersistenceRef.current
      && restoring.workspaceId === workspaceId && restoring.dockKind === dockKind && restoring.customDock === customDock
      && restoring.pathname === window.location.pathname;
    if (restoring && !restoreContextMatches) {
      restoringGuideDockRef.current = null;
      if (skipGuideRestorePersistenceRef.current === restoring.epoch) skipGuideRestorePersistenceRef.current = null;
      setGuideRestoreActive(false);
    } else if (restoring && Math.hypot(centerPoint.x - restoring.point.x, centerPoint.y - restoring.point.y) < .5) {
      restoringGuideDockRef.current = null;
      setGuideRestoreActive(false);
    }
  }, [customDock, dockKind, pathname, workspaceId]);

  React.useLayoutEffect(() => {
    const pending = pendingSettledReplanRef.current;
    const restoring = restoringGuideDockRef.current;
    if (!pending && !restoring) return;
    if (effectiveReducedMotion) {
      consumeSettledMove();
      return;
    }
    const pendingSignature = pending ? { contextKey: pending.contextKey, epoch: pending.epoch } : null;
    const restoreSignature = restoring ? {
      customDock: restoring.customDock, dockKind: restoring.dockKind, epoch: restoring.epoch,
      pathname: restoring.pathname, workspaceId: restoring.workspaceId,
    } : null;
    let frame = 0;
    let probes = 0;
    const signaturesMatch = () => {
      const currentPending = pendingSettledReplanRef.current;
      const currentRestore = restoringGuideDockRef.current;
      const pendingMatches = !pendingSignature || (currentPending?.contextKey === pendingSignature.contextKey
        && currentPending.epoch === pendingSignature.epoch);
      const restoreMatches = !restoreSignature || (currentRestore?.customDock === restoreSignature.customDock
        && currentRestore.dockKind === restoreSignature.dockKind
        && currentRestore.epoch === restoreSignature.epoch && currentRestore.pathname === restoreSignature.pathname
        && currentRestore.workspaceId === restoreSignature.workspaceId);
      return pendingMatches && restoreMatches;
    };
    const probe = () => {
      if (!signaturesMatch()) return;
      probes += 1;
      const stage = stageRef.current;
      if (stage) {
        const transition = window.getComputedStyle(stage);
        const properties = transition.transitionProperty.split(',').map((value) => value.trim());
        const durations = transition.transitionDuration.split(',').map((value) => value.trim());
        const delays = transition.transitionDelay.split(',').map((value) => value.trim());
        const milliseconds = (value: string) => Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
        const hasStageTransition = properties.some((property, index) => (
          ['all', 'left', 'top'].includes(property)
          && milliseconds(durations[index % durations.length] ?? '0s') + milliseconds(delays[index % delays.length] ?? '0s') > 0
        ));
        if (hasStageTransition) return;
      }
      consumeSettledMove();
      if (probes < 2 && signaturesMatch()) frame = window.requestAnimationFrame(probe);
    };
    frame = window.requestAnimationFrame(probe);
    return () => window.cancelAnimationFrame(frame);
  }, [consumeSettledMove, effectiveReducedMotion, position]);

  useEffect(() => setTravelRequested(false), [guideTarget]);

  useEffect(() => {
    advancePerformance();
    const timer = window.setInterval(advancePerformance, 250);
    return () => window.clearInterval(timer);
  }, [advancePerformance]);

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
    observer.observe(document.body, {
      attributeFilter: ['class', 'data-hermes-protected', 'hidden', 'style'], attributes: true, childList: true, subtree: true,
    });
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
      actor: expandHermesRectForMotion(actor.getBoundingClientRect(), visualAction),
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
  }, [anchorRect, guideTarget, position, protectedGeometryVersion, speech.cue, stageMotionVersion, viewportSize, visualAction]);

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
      setGuideBubbleMeasuring(false);
      pendingSettledReplanRef.current = null;
      setGuideDiagnostics((current) => current.phase === 'idle' ? current : { ...current, phase: 'idle' });
      return;
    }
    if (guideBubbleLayoutPhaseRef.current === 'awaiting-measure') return;
    if (!dockReady || !dockKind || !guideContextKey || viewportSize.width <= 0 || viewportSize.height <= 0) return;
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
    const actorBounds = stage.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')?.getBoundingClientRect() ?? stageBounds;
    const travelHullBounds = stage.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect() ?? actorBounds;
    const bubbleElement = bubbleRef.current;
    const bubbleBounds = bubbleElement
      ? new DOMRect(
        stageBounds.left + bubbleElement.offsetLeft,
        stageBounds.top + bubbleElement.offsetTop,
        bubbleElement.offsetWidth,
        bubbleElement.offsetHeight,
      )
      : stageBounds;
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
    const sourceCenter = { x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 };
    if (customDock && !travelRequested
      && Math.hypot(sourceCenter.x - positionRef.current.x, sourceCenter.y - positionRef.current.y) >= .5) return;
    const guidanceViewportChanged = viewportSize.left !== 0 || viewportSize.top !== 0
      || viewportSize.width !== window.innerWidth || viewportSize.height !== window.innerHeight;
    const sourceCandidate = (!customDock || travelRequested || guidanceViewportChanged)
      ? resolveHermesGuideSourceCandidate({
        current: sourceCenter,
        guardPx: GUIDE_PRECLAMP_MOTION_CLEARANCE_PX,
        variants: footprintVariants,
        viewport: new DOMRect(viewportSize.left, viewportSize.top, viewportSize.width, viewportSize.height),
      })
      : null;
    const pending = pendingSettledReplanRef.current;
    if (pending?.contextKey === guideContextKey) return;
    if (pending) pendingSettledReplanRef.current = null;
    if (sourceCandidate?.requiresMove) {
      setGuideSuppressed(false);
      setGuidePlanState((currentPlan) => ({ ...currentPlan, placement: sourceCandidate.placement }));
      setGuideDiagnostics((current) => ({ ...current, phase: 'source-settle', routeStart: null, settledSource: null }));
      movePositionAwaitingSettledReplan(sourceCandidate.point, guideContextKey);
      return;
    }
    const targetElement = document.querySelector<HTMLElement>(`[data-hermes-anchor="${guideTarget}"]`);
    const obstacles = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]',
    ))
      .filter((element) => !targetElement || (!targetElement.contains(element) && !element.contains(targetElement)))
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > viewportSize.left && bounds.bottom > viewportSize.top
        && bounds.left < viewportSize.right && bounds.top < viewportSize.bottom);
    if (customDock && !travelRequested && !guidanceViewportChanged) {
      const stationaryObstacles = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .filter((element) => !targetElement || (!targetElement.contains(element) && !element.contains(targetElement)))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > viewportSize.left && bounds.bottom > viewportSize.top
          && bounds.left < viewportSize.right && bounds.top < viewportSize.bottom);
      const stationary = resolveHermesStationaryGuidePlacement({
        at: sourceCenter,
        obstacles: [target, ...stationaryObstacles],
        variants: footprintVariants,
        viewport: new DOMRect(viewportSize.left, viewportSize.top, viewportSize.width, viewportSize.height),
      });
      setGuidePlanState({ mode: 'edge-stop', placement: stationary?.placement ?? null });
      setGuideSuppressed(!stationary);
      setGuideDiagnostics((current) => ({ ...current, phase: 'edge-stop', routeStart: null }));
      guideBubbleLayoutPhaseRef.current = 'idle';
      setGuideBubbleMeasuring(false);
      setGuideReady(true);
      return;
    }
    guidePlanCountRef.current += 1;
    if (settledReplan && settledReplan.contextKey === guideContextKey
      && settledReplan.epoch !== lastPlannedSettledEpochRef.current) {
      guideSettledReplanCountRef.current += 1;
      lastPlannedSettledEpochRef.current = settledReplan.epoch;
    }
    const plan = planHermesTravel({
      clearancePx: snapshot.clearancePx,
      editable: target,
      footprint: footprintVariants[0].footprint,
      footprintVariants,
      from,
      obstacles,
      preferredSides: snapshot.sides,
      target,
      viewport: new DOMRect(viewportSize.left, viewportSize.top, viewportSize.width, viewportSize.height),
    });
    if (effectiveReducedMotion) {
      setGuideSuppressed(!plan.safe);
      setGuidePlanState({ mode: 'static', placement: plan.placement ?? null });
      if (plan.safe) setPosition(plan.dock);
      setGuideDiagnostics((current) => ({
        ...current, phase: 'route', routeStart: plan.points[0] ?? sourceCenter,
        settledSource: settledReplan?.contextKey === guideContextKey ? settledReplan.point : sourceCenter,
      }));
      guideBubbleLayoutPhaseRef.current = 'idle';
      setGuideBubbleMeasuring(false);
      setGuideReady(true);
      return;
    }
    setGuideSuppressed(!plan.safe);
    setGuidePlanState({ mode: plan.mode === 'edge-stop' ? 'edge-stop' : 'travel', placement: plan.placement ?? null });
    const timeline = createHermesTravelTimeline(plan.points, TRAVEL_SEGMENT_MS);
    setGuideDiagnostics((current) => ({
      phase: plan.mode === 'edge-stop' ? 'edge-stop' : 'route',
      routeStart: plan.points[0] ?? sourceCenter,
      settledSource: settledReplan?.contextKey === guideContextKey ? settledReplan.point : sourceCenter,
      timelineCount: current.timelineCount + Number(plan.mode === 'travel'),
    }));
    guideBubbleLayoutPhaseRef.current = 'idle';
    setGuideBubbleMeasuring(false);
    const timers = timeline.map((step) => window.setTimeout(() => setPosition(step.point), step.atMs));
    const arrivalMs = timeline.length === 0 ? 0 : timeline.at(-1)!.atMs + TRAVEL_SEGMENT_MS;
    timers.push(window.setTimeout(() => setGuideReady(true), arrivalMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [customDock, dockKind, dockReady, effectiveReducedMotion, guideActions, guideBubbleSizeVersion, guideContextKey, guideTarget,
    movePositionAwaitingSettledReplan, protectedGeometryVersion, registry, registryVersion, settledReplan, stationaryGeometryVersion,
    travelRequested, viewportSize]);

  useEffect(() => {
    if (!dockReady || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    if (guideTarget) return;
    const size = resolveHermesStageSize(false, compactGuide);
    const half = size / 2;
    const viewportLeft = 0;
    const viewportTop = 0;
    const viewportRight = window.innerWidth;
    const viewportBottom = window.innerHeight;
    const current = positionRef.current;
    const next = {
      x: Math.min(viewportRight - half, Math.max(viewportLeft + half, current.x)),
      y: Math.min(viewportBottom - half, Math.max(viewportTop + half, current.y)),
    };
    if (Math.hypot(next.x - current.x, next.y - current.y) >= .05) setPosition(next);
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
      footprint: expandHermesFootprintForMotion({
        bottom: Math.max(1, hullBounds.bottom - anchorCenter.y),
        left: Math.max(1, anchorCenter.x - hullBounds.left),
        right: Math.max(1, hullBounds.right - anchorCenter.x),
        top: Math.max(1, anchorCenter.y - hullBounds.top),
      }, 'patrol'),
      obstacles: Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
          && bounds.left < window.innerWidth && bounds.top < window.innerHeight),
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    setPatrolEnvelopeSafe(settled.safe);
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
    if (!customDock || !dockReady || dockKind !== viewportClass() || dragging || guideTarget || restoringGuideDockRef.current
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
    const footprint = {
      bottom: Math.max(1, actorBounds.bottom - center.y) + motionClearance,
      left: Math.max(1, center.x - actorBounds.left) + motionClearance,
      right: Math.max(1, actorBounds.right - center.x) + motionClearance,
      top: Math.max(1, center.y - actorBounds.top) + motionClearance,
    };
    const obstacles = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < window.innerWidth && bounds.top < window.innerHeight);
    const settled = resolveHermesSettledDock({
      desired: center,
      footprint,
      obstacles,
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    if (!settled.safe) {
      setPatrolEnvelopeSafe(false);
      return;
    }
    const patrolSettled = resolveHermesSettledDock({
      desired: settled.point,
      footprint: expandHermesFootprintForMotion(footprint, 'patrol'),
      obstacles,
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    setPatrolEnvelopeSafe(patrolSettled.safe
      && Math.hypot(patrolSettled.point.x - settled.point.x, patrolSettled.point.y - settled.point.y) < .5);
    const settledDistance = Math.hypot(settled.point.x - position.x, settled.point.y - position.y);
    if (settledDistance < (settlingNewDock ? .05 : .5)) {
      if (skipGuideRestorePersistenceRef.current !== null) {
        skipGuideRestorePersistenceRef.current = null;
        return;
      }
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
    if (settlingNewDock || skipGuideRestorePersistenceRef.current !== null) return;
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

  const invokeHermes = () => {
    setInvokeCount((count) => count + 1);
    (presentation?.onInvoke ?? fallbackOnInvoke)();
  };

  const cancelGuideRestore = (actualPoint?: { x: number; y: number }) => {
    guideOriginRef.current = null;
    restoringGuideDockRef.current = null;
    skipGuideRestorePersistenceRef.current = null;
    setGuideRestoreActive(false);
    if (actualPoint) {
      positionRef.current = actualPoint;
      setPosition(actualPoint);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)
      || !event.target.closest('[data-hermes-input-owner], [data-hermes-carrier-interaction-hull="true"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const actualPoint = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    if (restoringGuideDockRef.current) cancelGuideRestore(actualPoint);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: actualPoint.x, originY: actualPoint.y, customDock, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    advancePerformance(pointerRef.current, true);
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
        if (guideTarget) {
          cancelGuideRestore();
          pendingSettledReplanRef.current = null;
          onDismissGuide();
        }
        setCustomDock(true);
      }
      if (!drag.moved) {
        advancePerformance(nextPointer, true);
        return;
      }
      const halfWidth = bounds.width / 2;
      const halfHeight = bounds.height / 2;
      setPosition({
        x: Math.min(window.innerWidth - halfWidth, Math.max(halfWidth, drag.originX + dx)),
        y: Math.min(window.innerHeight - halfHeight, Math.max(halfHeight, drag.originY + dy)),
      });
    }
    advancePerformance(nextPointer, Boolean(drag));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    advancePerformance(pointerRef.current, false);
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
    const actorFootprint = {
      bottom: Math.max(1, actorBounds.bottom - center.y),
      left: Math.max(1, center.x - actorBounds.left),
      right: Math.max(1, actorBounds.right - center.x),
      top: Math.max(1, center.y - actorBounds.top),
    };
    const visibleBubble = event.currentTarget.querySelector<HTMLElement>(
      '[data-hermes-guide-bubble][data-hermes-guide-visible="true"], [data-hermes-performance-bubble][data-hermes-speech-visible="true"]',
    );
    const bubbleFootprint = visibleBubble ? footprintFromBounds(visibleBubble.getBoundingClientRect(), center) : null;
    const footprint = bubbleFootprint ? {
      bottom: Math.max(actorFootprint.bottom, bubbleFootprint.bottom),
      left: Math.max(actorFootprint.left, bubbleFootprint.left),
      right: Math.max(actorFootprint.right, bubbleFootprint.right),
      top: Math.max(actorFootprint.top, bubbleFootprint.top),
    } : actorFootprint;
    const actorMotionFootprint = expandHermesFootprintForMotion(actorFootprint, 'patrol');
    const motionFootprint = bubbleFootprint ? {
      bottom: Math.max(actorMotionFootprint.bottom, bubbleFootprint.bottom),
      left: Math.max(actorMotionFootprint.left, bubbleFootprint.left),
      right: Math.max(actorMotionFootprint.right, bubbleFootprint.right),
      top: Math.max(actorMotionFootprint.top, bubbleFootprint.top),
    } : actorMotionFootprint;
    const obstacles = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < window.innerWidth && bounds.top < window.innerHeight);
    const instantSettled = resolveHermesSettledDock({
      desired: center,
      footprint,
      obstacles,
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    if (!instantSettled.safe) {
      setPatrolEnvelopeSafe(false);
      setPosition({ x: drag.originX, y: drag.originY });
      setCustomDock(drag.customDock);
      return;
    }
    const motionSettled = resolveHermesSettledDock({
      desired: instantSettled.point,
      footprint: motionFootprint,
      obstacles,
      viewport: { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 },
    });
    const maximumEnvelopeCorrection = Math.min(
      Math.max(...Object.values(HERMES_PATROL_MOTION_ENVELOPE)) + 12,
      stageBounds.width * .2 + 2,
    );
    const edgeAllowance = stageBounds.width * .2 + 2;
    const releasedEdges = [
      { final: motionSettled.point.x - actorFootprint.left, initial: stageBounds.left },
      { final: window.innerWidth - motionSettled.point.x - actorFootprint.right, initial: window.innerWidth - stageBounds.right },
      { final: motionSettled.point.y - actorFootprint.top, initial: stageBounds.top },
      { final: window.innerHeight - motionSettled.point.y - actorFootprint.bottom, initial: window.innerHeight - stageBounds.bottom },
    ];
    const nearestReleasedEdge = releasedEdges.reduce((nearest, candidate) => (
      candidate.initial < nearest.initial ? candidate : nearest
    ));
    const edgeIntentPreserved = nearestReleasedEdge.initial > 2 || nearestReleasedEdge.final <= edgeAllowance;
    const motionPreservesDragIntent = motionSettled.safe
      && Math.hypot(motionSettled.point.x - instantSettled.point.x, motionSettled.point.y - instantSettled.point.y)
      <= maximumEnvelopeCorrection && edgeIntentPreserved;
    const settled = motionPreservesDragIntent ? motionSettled : instantSettled;
    setPatrolEnvelopeSafe(motionPreservesDragIntent);
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
    advancePerformance(pointerRef.current, false);
  };

  const onStageTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    const stageTransition = event.currentTarget === event.target && ['height', 'left', 'top', 'width'].includes(event.propertyName);
    const target = event.target;
    const footprintTransition = target instanceof HTMLElement
      && (target.matches('.hermes-companion-actor') || target.matches('.hermes-wanko-carrier'))
      && ['rotate', 'transform', 'translate'].includes(event.propertyName);
    if (!stageTransition && !footprintTransition) return;
    if (stageTransition) consumeSettledMove();
    if (stageTransition && guideTarget && customDock && !travelRequested) {
      setStationaryGeometryVersion((version) => version + 1);
    }
    setStageMotionVersion((version) => version + 1);
  };

  const onPointerLeave = () => {
    pointerSampleRef.current.at = 0;
    if (dragRef.current) return;
    const settleMs = pointerRef.current.speed > .75 ? 700 : 0;
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => advancePerformance({ present: false, speed: 0, x: 0, y: 0 }, false), settleMs);
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
  const fallbackBubbleHorizontal = viewportSize.width > 0 && stageCenterX < (viewportSize.left + viewportSize.right) / 2 ? 'right' : 'left';
  const fallbackBubbleVertical = viewportSize.height > 0 && stageCenterY < (viewportSize.top + viewportSize.bottom) / 2 ? 'below' : 'above';
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
      data-hermes-action={visualAction}
      data-hermes-action-kind={behavior.kind}
      data-hermes-action-started-at={behavior.startedAtMs}
      data-hermes-anchored={anchored ? 'true' : 'false'}
      data-hermes-bubble-horizontal={bubbleHorizontal}
      data-hermes-bubble-safe={speech.cue ? (bubblePlacement ? 'true' : 'false') : 'true'}
      data-hermes-bubble-vertical={bubbleVertical}
      data-hermes-dragging={dragging ? 'true' : 'false'}
      data-hermes-guide-motion={guidePlanState.mode ?? 'idle'}
      data-hermes-guide-action-count={guideActions.length}
      data-hermes-guide-phase={guideDiagnostics.phase}
      data-hermes-guide-plan-count={guidePlanCountRef.current}
      data-hermes-guide-restore-active={guideRestoreActive ? 'true' : 'false'}
      data-hermes-guide-route-start-x={guideDiagnostics.routeStart?.x}
      data-hermes-guide-route-start-y={guideDiagnostics.routeStart?.y}
      data-hermes-guide-ready={guideReady ? 'true' : 'false'}
      data-hermes-guide-size-version={guideBubbleSizeVersion}
      data-hermes-guide-registry-version={registryVersion}
      data-hermes-guide-settled-source-x={guideDiagnostics.settledSource?.x}
      data-hermes-guide-settled-source-y={guideDiagnostics.settledSource?.y}
      data-hermes-guide-settled-replan-count={guideSettledReplanCountRef.current}
      data-hermes-guide-suppressed={guideSuppressed ? 'true' : 'false'}
      data-hermes-guide-target={guideTarget ?? undefined}
      data-hermes-guide-timeline-count={guideDiagnostics.timelineCount}
      data-hermes-invoke-count={invokeCount}
      data-hermes-footprint-source="carrier-travel-hull"
      data-hermes-motion-preference={reducedMotion === null ? 'resolving' : reducedMotion ? 'reduced' : 'full'}
      data-hermes-motion-envelope-safe={patrolEnvelopeSafe ? 'true' : 'false'}
      data-hermes-presentation-state={state}
      data-hermes-protected-geometry-version={protectedGeometryVersion}
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
        action={visualAction}
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
          onDismiss={() => setPerformanceState((current) => ({
            ...current,
            speech: { ...current.speech, cue: null },
          }))}
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
          measuring={guideBubbleMeasuring}
          onDismiss={onDismissGuide}
          onLayoutWillChange={beginGuideBubbleLayoutChange}
          onTakeMeThere={() => {
            document.querySelector(`[data-hermes-anchor="${guideTarget}"]`)?.scrollIntoView({ behavior: effectiveReducedMotion ? 'auto' : 'smooth', block: 'center' });
            setGuideReady(false);
            setTravelRequested(true);
          }}
          ref={bubbleRef}
          target={guideTarget}
          visible={guideReady && !guideSuppressed && !guideBubbleMeasuring}
        />
      ) : null}
    </div>
  );
}
