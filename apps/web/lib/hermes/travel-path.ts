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
  const variants: NormalizedFootprintVariant[] = input.footprintVariants?.slice(0, 4)
    ?? [{ footprint: input.footprint, parts: [input.footprint], placement: undefined }];
  const boundsFor = (footprint: HermesFootprintInsets): Bounds => ({
    left: input.viewport.left + footprint.left,
    right: input.viewport.right - footprint.right,
    top: input.viewport.top + footprint.top,
    bottom: input.viewport.bottom - (input.bottomInsetPx ?? 0) - footprint.bottom,
  });
  const fallbackVariant = variants[0] ?? { footprint: input.footprint, parts: [input.footprint], placement: undefined };
  const fallbackSafe = boundsFor(fallbackVariant.footprint);
  const fallbackStart = clampPoint(center(input.from), fallbackSafe);
  if (!input.target || !input.editable) return { dock: fallbackStart, mode: 'missing', points: [fallbackStart], safe: true };
  const editable = input.editable;
  const target = input.target;
  const obstacles = input.obstacles ?? [];
  const candidateIsSafe = (candidate: Point, variant: NormalizedFootprintVariant) => (
    !rectsOverlap(rectForFootprint(candidate, variant.footprint), editable)
    && obstacles.every((obstacle) => variant.parts.every((part) => !rectsOverlap(rectForFootprint(candidate, part), obstacle)))
  );
  const safeEdge = () => {
    for (const variant of variants) {
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
    const dock = edge?.dock ?? clampPoint(center(target), fallbackSafe);
    const start = edge ? clampPoint(center(input.from), boundsFor(edge.variant.footprint)) : fallbackStart;
    return {
      dock,
      mode: 'edge-stop',
      placement: edge?.placement,
      points: start.x === dock.x && start.y === dock.y ? [start] : [start, dock],
      safe: Boolean(edge),
    };
  }

  const clearance = input.clearancePx ?? 16;
  const targetCenter = center(target);
  const sides = [...input.preferredSides, 'right', 'left', 'top', 'bottom'] as HermesDockSide[];
  const uniqueSides = sides.filter((side, index) => sides.indexOf(side) === index);
  let selected: { dock: Point; placement?: HermesTravelPlacement; safe: Bounds; variant: NormalizedFootprintVariant } | null = null;
  for (const side of uniqueSides) {
    for (const variant of variants) {
      const footprint = variant.footprint;
      const safe = boundsFor(footprint);
      if (safe.left > safe.right || safe.top > safe.bottom) continue;
      const bySide: Record<HermesDockSide, Point> = {
        top: { x: targetCenter.x, y: target.top - clearance - footprint.bottom },
        right: { x: target.right + clearance + footprint.left, y: targetCenter.y },
        bottom: { x: targetCenter.x, y: target.bottom + clearance + footprint.top },
        left: { x: target.left - clearance - footprint.right, y: targetCenter.y },
      };
      const dock = clampPoint(bySide[side], safe);
      if (candidateIsSafe(dock, variant)) {
        selected = { dock, placement: variant.placement, safe, variant };
        break;
      }
    }
    if (selected) break;
  }
  if (!selected) {
    const edge = safeEdge();
    const edgeDock = edge?.dock ?? fallbackStart;
    const start = edge ? clampPoint(center(input.from), boundsFor(edge.variant.footprint)) : fallbackStart;
    return {
      dock: edgeDock,
      mode: 'edge-stop',
      placement: edge?.placement,
      points: start.x === edgeDock.x && start.y === edgeDock.y ? [start] : [start, edgeDock],
      safe: Boolean(edge),
    };
  }
  const { dock, placement, safe, variant } = selected;
  const footprint = variant.footprint;
  const start = clampPoint(center(input.from), safe);
  const pathSafetyPx = 1;
  const expanded: Bounds = {
    left: editable.left - footprint.right - pathSafetyPx,
    right: editable.right + footprint.left + pathSafetyPx,
    top: editable.top - footprint.bottom - pathSafetyPx,
    bottom: editable.bottom + footprint.top + pathSafetyPx,
  };
  const points = shortestVisiblePath(start, dock, safe, expanded);
  return { dock, mode: 'travel', placement, points, safe: true };
}
