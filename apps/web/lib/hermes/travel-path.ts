export type HermesDockSide = 'top' | 'right' | 'bottom' | 'left';

export interface HermesTravelInput {
  bottomInsetPx?: number;
  editable: DOMRectReadOnly | null;
  from: DOMRectReadOnly;
  preferredSides: HermesDockSide[];
  target: DOMRectReadOnly | null;
  viewport: DOMRectReadOnly;
}

export interface HermesTravelPlan {
  dock: { x: number; y: number };
  mode: 'travel' | 'edge-stop' | 'missing';
  points: Array<{ x: number; y: number }>;
}

export interface HermesTravelStep {
  atMs: number;
  point: { x: number; y: number };
}

type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const center = (rectangle: DOMRectReadOnly): Point => ({ x: rectangle.left + rectangle.width / 2, y: rectangle.top + rectangle.height / 2 });
const clampPoint = (point: Point, bounds: Bounds): Point => ({
  x: clamp(point.x, bounds.left, bounds.right),
  y: clamp(point.y, bounds.top, bounds.bottom),
});

export function createHermesTravelTimeline(points: Point[], segmentMs: number): HermesTravelStep[] {
  return points.slice(1).map((point, index) => ({ atMs: index * segmentMs, point }));
}

function rectsOverlap(a: Bounds, b: DOMRectReadOnly) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
  const candidates = [
    start,
    end,
    { x: obstacle.left, y: obstacle.top },
    { x: obstacle.right, y: obstacle.top },
    { x: obstacle.right, y: obstacle.bottom },
    { x: obstacle.left, y: obstacle.bottom },
    { x: safe.left, y: safe.top },
    { x: safe.right, y: safe.top },
    { x: safe.right, y: safe.bottom },
    { x: safe.left, y: safe.bottom },
  ].map((point) => clampPoint(point, safe));
  const distance = candidates.map(() => Number.POSITIVE_INFINITY);
  const previous = candidates.map(() => -1);
  const visited = candidates.map(() => false);
  distance[0] = 0;
  for (let count = 0; count < candidates.length; count += 1) {
    let current = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      if (!visited[index] && (current === -1 || distance[index] < distance[current])) current = index;
    }
    if (current === -1 || !Number.isFinite(distance[current])) break;
    visited[current] = true;
    for (let next = 0; next < candidates.length; next += 1) {
      if (visited[next] || next === current || segmentCrossesInterior(candidates[current], candidates[next], obstacle)) continue;
      const step = Math.hypot(candidates[next].x - candidates[current].x, candidates[next].y - candidates[current].y);
      if (distance[current] + step < distance[next]) {
        distance[next] = distance[current] + step;
        previous[next] = current;
      }
    }
  }
  if (!Number.isFinite(distance[1])) return [start, clampPoint({ x: safe.left, y: safe.top }, safe), end];
  const path: Point[] = [];
  for (let cursor = 1; cursor >= 0; cursor = previous[cursor]) {
    path.unshift(candidates[cursor]);
    if (cursor === 0) break;
  }
  return path;
}

export function planHermesTravel(input: HermesTravelInput): HermesTravelPlan {
  const halfWidth = input.from.width / 2;
  const halfHeight = input.from.height / 2;
  const safe: Bounds = {
    left: input.viewport.left + halfWidth,
    right: input.viewport.right - halfWidth,
    top: input.viewport.top + halfHeight,
    bottom: input.viewport.bottom - (input.bottomInsetPx ?? 0) - halfHeight,
  };
  const start = clampPoint(center(input.from), safe);
  if (!input.target || !input.editable) return { dock: start, mode: 'missing', points: [start] };
  const editable = input.editable;
  const target = input.target;

  const targetVisible = rectsOverlap(target, input.viewport);
  if (!targetVisible) {
    const dock = clampPoint(center(target), safe);
    return { dock, mode: 'edge-stop', points: start.x === dock.x && start.y === dock.y ? [start] : [start, dock] };
  }

  const clearance = 16;
  const targetCenter = center(target);
  const bySide: Record<HermesDockSide, Point> = {
    top: { x: targetCenter.x, y: target.top - clearance - halfHeight },
    right: { x: target.right + clearance + halfWidth, y: targetCenter.y },
    bottom: { x: targetCenter.x, y: target.bottom + clearance + halfHeight },
    left: { x: target.left - clearance - halfWidth, y: targetCenter.y },
  };
  const sides = [...input.preferredSides, 'right', 'left', 'top', 'bottom'] as HermesDockSide[];
  const uniqueSides = sides.filter((side, index) => sides.indexOf(side) === index);
  const dock = uniqueSides
    .map((side) => clampPoint(bySide[side], safe))
    .find((candidate) => !rectsOverlap({
      left: candidate.x - halfWidth,
      right: candidate.x + halfWidth,
      top: candidate.y - halfHeight,
      bottom: candidate.y + halfHeight,
    }, editable)) ?? clampPoint(bySide.top, safe);
  const expanded: Bounds = {
    left: editable.left - halfWidth - clearance,
    right: editable.right + halfWidth + clearance,
    top: editable.top - halfHeight - clearance,
    bottom: editable.bottom + halfHeight + clearance,
  };
  const points = shortestVisiblePath(start, dock, safe, expanded);
  return { dock, mode: 'travel', points };
}
