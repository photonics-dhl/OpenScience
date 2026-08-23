export type Point = { x: number; y: number };
export type RectLike = { bottom: number; left: number; right: number; top: number };
export type Footprint = { bottom: number; left: number; right: number; top: number };
export type HermesBubblePlacement = {
  horizontal: 'center' | 'left' | 'right';
  vertical: 'above' | 'below';
  bounds: RectLike;
};

const gap = 12;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const overlaps = (a: RectLike, b: RectLike) => (
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
);

const occupied = (point: Point, footprint: Footprint): RectLike => ({
  bottom: point.y + footprint.bottom,
  left: point.x - footprint.left,
  right: point.x + footprint.right,
  top: point.y - footprint.top,
});

export function resolveHermesSettledDock(input: {
  desired: Point;
  footprint: Footprint;
  obstacles: RectLike[];
  viewport: RectLike;
}): { point: Point; safe: boolean } {
  const safe = {
    bottom: input.viewport.bottom - input.footprint.bottom,
    left: input.viewport.left + input.footprint.left,
    right: input.viewport.right - input.footprint.right,
    top: input.viewport.top + input.footprint.top,
  };
  if (safe.left > safe.right || safe.top > safe.bottom) {
    return { point: input.desired, safe: false };
  }

  const desired = {
    x: clamp(input.desired.x, safe.left, safe.right),
    y: clamp(input.desired.y, safe.top, safe.bottom),
  };
  const xCandidates = [desired.x, safe.left, safe.right, (safe.left + safe.right) / 2,
    ...input.obstacles.flatMap((obstacle) => [
      clamp(obstacle.left - input.footprint.right - gap, safe.left, safe.right),
      clamp(obstacle.right + input.footprint.left + gap, safe.left, safe.right),
    ])];
  const yCandidates = [desired.y, safe.top, safe.bottom, (safe.top + safe.bottom) / 2,
    ...input.obstacles.flatMap((obstacle) => [
      clamp(obstacle.top - input.footprint.bottom - gap, safe.top, safe.bottom),
      clamp(obstacle.bottom + input.footprint.top + gap, safe.top, safe.bottom),
    ])];
  const candidates = xCandidates.flatMap((x) => yCandidates.map((y) => ({ x, y })))
    .sort((a, b) => Math.hypot(a.x - desired.x, a.y - desired.y)
    - Math.hypot(b.x - desired.x, b.y - desired.y));
  const point = candidates.find((candidate) => input.obstacles.every(
    (obstacle) => !overlaps(occupied(candidate, input.footprint), obstacle),
  ));

  return point ? { point, safe: true } : { point: desired, safe: false };
}

export function resolveHermesBubblePlacement(input: {
  actor: RectLike;
  bubble: { height: number; width: number };
  obstacles: RectLike[];
  viewport: RectLike;
}): HermesBubblePlacement | null {
  const actorX = (input.actor.left + input.actor.right) / 2;
  const actorY = (input.actor.top + input.actor.bottom) / 2;
  const horizontal = actorX < (input.viewport.left + input.viewport.right) / 2
    ? ['right', 'left'] as const : ['left', 'right'] as const;
  const vertical = actorY < (input.viewport.top + input.viewport.bottom) / 2
    ? ['below', 'above'] as const : ['above', 'below'] as const;

  for (const sideY of vertical) for (const sideX of horizontal) {
    const left = sideX === 'right'
      ? input.actor.right + gap : input.actor.left - gap - input.bubble.width;
    const top = sideY === 'below'
      ? input.actor.bottom + gap : input.actor.top - gap - input.bubble.height;
    const bounds = {
      bottom: top + input.bubble.height,
      left,
      right: left + input.bubble.width,
      top,
    };
    const inside = bounds.left >= input.viewport.left && bounds.right <= input.viewport.right
      && bounds.top >= input.viewport.top && bounds.bottom <= input.viewport.bottom;
    if (inside && input.obstacles.every((obstacle) => !overlaps(bounds, obstacle))) {
      return { bounds, horizontal: sideX, vertical: sideY };
    }
  }

  for (const sideY of vertical) {
    const left = actorX - input.bubble.width / 2;
    const top = sideY === 'below'
      ? input.actor.bottom + gap : input.actor.top - gap - input.bubble.height;
    const bounds = {
      bottom: top + input.bubble.height,
      left,
      right: left + input.bubble.width,
      top,
    };
    const inside = bounds.left >= input.viewport.left && bounds.right <= input.viewport.right
      && bounds.top >= input.viewport.top && bounds.bottom <= input.viewport.bottom;
    if (inside && input.obstacles.every((obstacle) => !overlaps(bounds, obstacle))) {
      return { bounds, horizontal: 'center', vertical: sideY };
    }
  }

  return null;
}
