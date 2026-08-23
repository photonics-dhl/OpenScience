export type HermesDockSide = 'top' | 'right' | 'bottom' | 'left';

export interface HermesFootprintInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface HermesTravelInput {
  bottomInsetPx?: number;
  clearancePx?: number;
  editable: DOMRectReadOnly | null;
  footprint: HermesFootprintInsets;
  footprintVariants?: HermesTravelFootprintVariant[];
  from: DOMRectReadOnly;
  obstacles?: DOMRectReadOnly[];
  preferredSides: HermesDockSide[];
  target: DOMRectReadOnly | null;
  viewport: DOMRectReadOnly;
}

export interface HermesTravelPlan {
  dock: { x: number; y: number };
  mode: 'travel' | 'edge-stop' | 'missing';
  points: Array<{ x: number; y: number }>;
  placement?: HermesTravelPlacement;
  safe: boolean;
}

export interface HermesTravelPlacement {
  horizontal: 'left' | 'right';
  vertical: 'above' | 'below';
}

export interface HermesTravelFootprintVariant {
  footprint: HermesFootprintInsets;
  parts: HermesFootprintInsets[];
  placement: HermesTravelPlacement;
}

type NormalizedFootprintVariant = Omit<HermesTravelFootprintVariant, 'placement'> & {
  placement?: HermesTravelPlacement;
};

export function createHermesTravelFootprintVariants(
  actor: HermesFootprintInsets,
  measuredBubble: HermesFootprintInsets,
  measuredPlacement: HermesTravelPlacement,
): HermesTravelFootprintVariant[] {
  const placements: HermesTravelPlacement[] = [
    measuredPlacement,
    { ...measuredPlacement, vertical: measuredPlacement.vertical === 'above' ? 'below' : 'above' },
    { ...measuredPlacement, horizontal: measuredPlacement.horizontal === 'left' ? 'right' : 'left' },
    {
      horizontal: measuredPlacement.horizontal === 'left' ? 'right' : 'left',
      vertical: measuredPlacement.vertical === 'above' ? 'below' : 'above',
    },
  ];
  return placements.map((placement) => {
    const bubble = {
      bottom: placement.vertical === measuredPlacement.vertical ? measuredBubble.bottom : measuredBubble.top,
      left: placement.horizontal === measuredPlacement.horizontal ? measuredBubble.left : measuredBubble.right,
      right: placement.horizontal === measuredPlacement.horizontal ? measuredBubble.right : measuredBubble.left,
      top: placement.vertical === measuredPlacement.vertical ? measuredBubble.top : measuredBubble.bottom,
    };
    return {
      footprint: {
        bottom: Math.max(actor.bottom, bubble.bottom),
        left: Math.max(actor.left, bubble.left),
        right: Math.max(actor.right, bubble.right),
        top: Math.max(actor.top, bubble.top),
      },
      parts: [actor, bubble],
      placement,
    };
  });
}

export interface HermesTravelStep {
  atMs: number;
  point: { x: number; y: number };
}

export type Point = { x: number; y: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };

export interface HermesGuideSourceCandidate {
  placement: HermesTravelPlacement;
  point: Point;
  requiresMove: boolean;
}

export function resolveHermesGuideSourceCandidate(input: {
  current: Point;
  guardPx: number;
  variants: HermesTravelFootprintVariant[];
  viewport: DOMRectReadOnly;
}): HermesGuideSourceCandidate | null {
  const candidates = input.variants.slice(0, 4).flatMap(({ footprint, placement }) => {
    const bounds = {
      bottom: input.viewport.bottom - footprint.bottom - input.guardPx,
      left: input.viewport.left + footprint.left + input.guardPx,
      right: input.viewport.right - footprint.right - input.guardPx,
      top: input.viewport.top + footprint.top + input.guardPx,
    };
    if (bounds.left > bounds.right || bounds.top > bounds.bottom) return [];
    const point = clampPoint(input.current, bounds);
    return [{
      distance: Math.hypot(point.x - input.current.x, point.y - input.current.y),
      placement,
      point,
    }];
  });
  candidates.sort((a, b) => a.distance - b.distance);
  const selected = candidates[0];
  return selected ? {
    placement: selected.placement,
    point: selected.point,
    requiresMove: selected.distance >= .05,
  } : null;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const center = (rectangle: DOMRectReadOnly): Point => ({ x: rectangle.left + rectangle.width / 2, y: rectangle.top + rectangle.height / 2 });
const clampPoint = (point: Point, bounds: Bounds): Point => ({
  x: clamp(point.x, bounds.left, bounds.right),
  y: clamp(point.y, bounds.top, bounds.bottom),
});

export function rectForFootprint(point: Point, footprint: HermesFootprintInsets): Bounds {
  return {
    bottom: point.y + footprint.bottom,
    left: point.x - footprint.left,
    right: point.x + footprint.right,
    top: point.y - footprint.top,
  };
}

export function createHermesTravelTimeline(points: Point[], segmentMs: number): HermesTravelStep[] {
  return points.slice(1).map((point, index) => ({ atMs: index * segmentMs, point }));
}

function rectsOverlap(a: Bounds, b: DOMRectReadOnly) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function findSafeEdgeDock(safe: Bounds, isSafe: (candidate: Point) => boolean) {
  const candidates = [
    { x: safe.left, y: safe.top },
    { x: safe.right, y: safe.top },
    { x: safe.right, y: safe.bottom },
    { x: safe.left, y: safe.bottom },
    { x: (safe.left + safe.right) / 2, y: safe.top },
    { x: safe.right, y: (safe.top + safe.bottom) / 2 },
    { x: (safe.left + safe.right) / 2, y: safe.bottom },
    { x: safe.left, y: (safe.top + safe.bottom) / 2 },
  ];
  return candidates.find(isSafe);
}

function segmentCrossesInterior(from: Point, to: Point, obstacle: Bounds): boolean {
  const epsilon = .01;
  const box = {
    left: obstacle.left + epsilon,
    right: obstacle.right - epsilon,
    top: obstacle.top + epsilon,
    bottom: obstacle.bottom - epsilon,
  };
  let minimum = 0;
  let maximum = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const clips: Array<[number, number]> = [
    [-dx, from.x - box.left],
    [dx, box.right - from.x],
    [-dy, from.y - box.top],
    [dy, box.bottom - from.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0 && q < 0) return false;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
}

function shortestVisiblePath(start: Point, end: Point, safe: Bounds, obstacle: Bounds): Point[] {
  if (!segmentCrossesInterior(start, end, obstacle)) return [start, end];
  const vertical = [obstacle.left, obstacle.right, safe.left, safe.right].map((x) => [
    start,
    clampPoint({ x, y: start.y }, safe),
    clampPoint({ x, y: end.y }, safe),
    end,
  ]);
  const horizontal = [obstacle.top, obstacle.bottom, safe.top, safe.bottom].map((y) => [
    start,
    clampPoint({ x: start.x, y }, safe),
    clampPoint({ x: end.x, y }, safe),
    end,
  ]);
  const routes = [...vertical, ...horizontal]
    .map((route) => route.filter((point, index) => index === 0 || point.x !== route[index - 1].x || point.y !== route[index - 1].y))
    .filter((route) => route.slice(1).every((point, index) => !segmentCrossesInterior(route[index], point, obstacle)))
    .sort((a, b) => {
      const length = (route: Point[]) => route.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - route[index].x, point.y - route[index].y), 0);
      return length(a) - length(b);
    });
  return routes[0] ?? [start];
}

export function planHermesTravel(input: HermesTravelInput): HermesTravelPlan {
  const legacyVariant: NormalizedFootprintVariant = {
    footprint: input.footprint,
    parts: [input.footprint],
    placement: undefined,
  };
  const providedVariants = input.footprintVariants?.slice(0, 4) ?? [];
  const usesCompositeVariants = providedVariants.length > 0;
  const variants: NormalizedFootprintVariant[] = usesCompositeVariants
    ? providedVariants
    : [legacyVariant];
  const boundsFor = (footprint: HermesFootprintInsets): Bounds => ({
    left: input.viewport.left + footprint.left,
    right: input.viewport.right - footprint.right,
    top: input.viewport.top + footprint.top,
    bottom: input.viewport.bottom - (input.bottomInsetPx ?? 0) - footprint.bottom,
  });
  const start = center(input.from);
  const contains = (bounds: Bounds, point: Point) => point.x >= bounds.left && point.x <= bounds.right
    && point.y >= bounds.top && point.y <= bounds.bottom;
  const eligibleVariants = usesCompositeVariants
    ? variants.filter((variant) => contains(boundsFor(variant.footprint), start))
    : variants;
  const routeStartFor = (variant: NormalizedFootprintVariant) => usesCompositeVariants
    ? start
    : clampPoint(start, boundsFor(variant.footprint));
  const fallbackVariant = variants[0];
  const fallbackSafe = boundsFor(fallbackVariant.footprint);
  const fallbackStart = routeStartFor(fallbackVariant);
  if (!input.target || !input.editable) return { dock: fallbackStart, mode: 'missing', points: [fallbackStart], safe: true };
  const editable = input.editable;
  const target = input.target;
  const obstacles = input.obstacles ?? [];
  const candidateIsSafe = (candidate: Point, variant: NormalizedFootprintVariant) => (
    !rectsOverlap(rectForFootprint(candidate, variant.footprint), editable)
    && obstacles.every((obstacle) => variant.parts.every((part) => !rectsOverlap(rectForFootprint(candidate, part), obstacle)))
  );
  const safeEdge = () => {
    for (const variant of eligibleVariants) {
      const safe = boundsFor(variant.footprint);
      if (safe.left > safe.right || safe.top > safe.bottom) continue;
      const dock = findSafeEdgeDock(safe, (candidate) => candidateIsSafe(candidate, variant));
      if (dock) return { dock, placement: variant.placement, variant };
    }
    return null;
  };

  const targetVisible = rectsOverlap(target, input.viewport);
  if (!targetVisible) {
    const edge = safeEdge();
    const dock = edge?.dock ?? (usesCompositeVariants ? start : clampPoint(center(target), fallbackSafe));
    const routeStart = edge ? routeStartFor(edge.variant) : start;
    return {
      dock,
      mode: 'edge-stop',
      placement: edge?.placement,
      points: routeStart.x === dock.x && routeStart.y === dock.y ? [routeStart] : [routeStart, dock],
      safe: Boolean(edge),
    };
  }

  const clearance = input.clearancePx ?? 16;
  const targetCenter = center(target);
  const sides = [...input.preferredSides, 'right', 'left', 'top', 'bottom'] as HermesDockSide[];
  const uniqueSides = sides.filter((side, index) => sides.indexOf(side) === index);
  let selected: { dock: Point; placement?: HermesTravelPlacement; safe: Bounds; variant: NormalizedFootprintVariant } | null = null;
  for (const side of uniqueSides) {
    const safeCandidates = eligibleVariants.flatMap((variant) => {
      const footprint = variant.footprint;
      const safe = boundsFor(footprint);
      if (safe.left > safe.right || safe.top > safe.bottom) return [];
      const bySide: Record<HermesDockSide, Point> = {
        top: { x: targetCenter.x, y: target.top - clearance - footprint.bottom },
        right: { x: target.right + clearance + footprint.left, y: targetCenter.y },
        bottom: { x: targetCenter.x, y: target.bottom + clearance + footprint.top },
        left: { x: target.left - clearance - footprint.right, y: targetCenter.y },
      };
      const dock = clampPoint(bySide[side], safe);
      return candidateIsSafe(dock, variant) ? [{ dock, safe, variant }] : [];
    });
    const score = ({ dock, variant }: (typeof safeCandidates)[number]) => {
      if (!variant.placement) return 0;
      const desiredPlacement: HermesTravelPlacement = {
        horizontal: dock.x < (input.viewport.left + input.viewport.right) / 2 ? 'right' : 'left',
        vertical: dock.y < (input.viewport.top + input.viewport.bottom) / 2 ? 'below' : 'above',
      };
      return Number(variant.placement.horizontal !== desiredPlacement.horizontal) * 2
        + Number(variant.placement.vertical !== desiredPlacement.vertical);
    };
    safeCandidates.sort((a, b) => score(a) - score(b));
    const candidate = safeCandidates[0];
    if (candidate) selected = { ...candidate, placement: candidate.variant.placement };
    if (selected) break;
  }
  if (!selected) {
    const edge = safeEdge();
    const edgeDock = edge?.dock ?? (usesCompositeVariants ? start : fallbackStart);
    const routeStart = edge ? routeStartFor(edge.variant) : start;
    return {
      dock: edgeDock,
      mode: 'edge-stop',
      placement: edge?.placement,
      points: routeStart.x === edgeDock.x && routeStart.y === edgeDock.y ? [routeStart] : [routeStart, edgeDock],
      safe: Boolean(edge),
    };
  }
  const { dock, placement, safe, variant } = selected;
  const footprint = variant.footprint;
  const routeStart = routeStartFor(variant);
  const pathSafetyPx = 1;
  const expanded: Bounds = {
    left: editable.left - footprint.right - pathSafetyPx,
    right: editable.right + footprint.left + pathSafetyPx,
    top: editable.top - footprint.bottom - pathSafetyPx,
    bottom: editable.bottom + footprint.top + pathSafetyPx,
  };
  const points = shortestVisiblePath(routeStart, dock, safe, expanded);
  return { dock, mode: 'travel', placement, points, safe: true };
}
