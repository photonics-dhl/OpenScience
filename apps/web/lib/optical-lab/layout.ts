import { OPTICAL_LAB_APERTURE_X } from './model';

export interface OpticalCssBounds {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface OpticalLayout {
  apertureX: number;
  baseline: number;
  evolves: OpticalCssBounds;
  evolvesInk: OpticalCssBounds;
  science: OpticalCssBounds;
  title: OpticalCssBounds;
  viewport: { height: number; width: number };
}

function toLocalBounds(rect: DOMRect, stage: DOMRect): OpticalCssBounds {
  return {
    bottom: rect.bottom - stage.top,
    height: rect.height,
    left: rect.left - stage.left,
    right: rect.right - stage.left,
    top: rect.top - stage.top,
    width: rect.width,
  };
}

function unionBounds(left: OpticalCssBounds, right: OpticalCssBounds): OpticalCssBounds {
  const bounds = {
    bottom: Math.max(left.bottom, right.bottom),
    left: Math.min(left.left, right.left),
    right: Math.max(left.right, right.right),
    top: Math.min(left.top, right.top),
  };
  return {
    ...bounds,
    height: bounds.bottom - bounds.top,
    width: bounds.right - bounds.left,
  };
}

function measureTextInkHorizontalBounds(
  node: HTMLElement,
  stageRect: DOMRect,
  fallback: OpticalCssBounds,
  baseline: number,
): OpticalCssBounds {
  const view = node.ownerDocument?.defaultView;
  const context = node.ownerDocument?.createElement('canvas').getContext('2d') as (
    CanvasRenderingContext2D & {
      fontKerning?: string;
      fontStretch?: string;
      letterSpacing?: string;
    }
  ) | null;
  if (!view || !context || !node.textContent) return fallback;

  const computed = view.getComputedStyle(node);
  context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  context.fontKerning = computed.fontKerning as typeof context.fontKerning;
  context.fontStretch = computed.fontStretch as typeof context.fontStretch;
  context.letterSpacing = computed.letterSpacing;

  const matrix = new view.DOMMatrix(computed.transform === 'none' ? undefined : computed.transform);
  const [originX = 0, originY = 0] = computed.transformOrigin.split(' ').map(Number.parseFloat);
  const transformPoint = (x: number, y: number) => ({
    x: matrix.a * (x - originX) + matrix.c * (y - originY) + originX,
    y: matrix.b * (x - originX) + matrix.d * (y - originY) + originY,
  });
  const borderCorners = [
    transformPoint(0, 0),
    transformPoint(node.offsetWidth, 0),
    transformPoint(0, node.offsetHeight),
    transformPoint(node.offsetWidth, node.offsetHeight),
  ];
  const borderOrigin = {
    x: fallback.left - Math.min(...borderCorners.map(({ x }) => x)),
    y: fallback.top - Math.min(...borderCorners.map(({ y }) => y)),
  };
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const baselineLocal = Math.abs(matrix.d) > .0001
    ? originY + (
      baseline - borderOrigin.y - originY - matrix.b * (paddingLeft - originX)
    ) / matrix.d
    : node.offsetHeight * .5;
  const inkPoints: Array<{ x: number; y: number }> = [];
  let prefix = '';

  for (const char of node.textContent) {
    const penX = prefix ? context.measureText(prefix).width : 0;
    const metrics = context.measureText(char);
    const left = paddingLeft + penX - metrics.actualBoundingBoxLeft;
    const right = paddingLeft + penX + metrics.actualBoundingBoxRight;
    const top = baselineLocal - metrics.actualBoundingBoxAscent;
    const bottom = baselineLocal + metrics.actualBoundingBoxDescent;
    for (const point of [
      transformPoint(left, top),
      transformPoint(right, top),
      transformPoint(left, bottom),
      transformPoint(right, bottom),
    ]) inkPoints.push({ x: borderOrigin.x + point.x, y: borderOrigin.y + point.y });
    prefix += char;
  }

  const left = Math.min(...inkPoints.map(({ x }) => x));
  const right = Math.max(...inkPoints.map(({ x }) => x));
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return fallback;
  return { ...fallback, left, right, width: right - left };
}

export async function measureOpticalLayout(
  stage: HTMLElement,
  science: HTMLElement,
  evolves: HTMLElement,
): Promise<OpticalLayout> {
  await document.fonts?.ready;

  const stageRect = stage.getBoundingClientRect();
  const scienceBounds = toLocalBounds(science.getBoundingClientRect(), stageRect);
  const evolvesBounds = toLocalBounds(evolves.getBoundingClientRect(), stageRect);
  const evolvesInkNode = stage.querySelector<HTMLElement>('[data-optical-lab-evolves-ink="true"]');
  if (!evolvesInkNode) throw new Error('Optical Lab evolves ink bounds are unavailable');
  const evolvesInkFallback = toLocalBounds(evolvesInkNode.getBoundingClientRect(), stageRect);
  const baselineProbe = stage.querySelector<HTMLElement>('[data-optical-lab-baseline-probe="true"]');
  const baseline = baselineProbe
    ? baselineProbe.getBoundingClientRect().top - stageRect.top
    : Math.max(scienceBounds.bottom, evolvesBounds.bottom);
  const evolvesInkBounds = measureTextInkHorizontalBounds(
    evolvesInkNode,
    stageRect,
    evolvesInkFallback,
    baseline,
  );

  return {
    apertureX: stageRect.width * OPTICAL_LAB_APERTURE_X,
    baseline,
    evolves: evolvesBounds,
    evolvesInk: evolvesInkBounds,
    science: scienceBounds,
    title: unionBounds(scienceBounds, evolvesBounds),
    viewport: { height: stageRect.height, width: stageRect.width },
  };
}

const boundsFields = ['bottom', 'height', 'left', 'right', 'top', 'width'] as const;

export function hasOpticalLayoutParity(
  accepted: OpticalLayout,
  candidate: OpticalLayout,
  tolerance = 1,
) {
  const withinTolerance = (left: number, right: number) => Math.abs(left - right) <= tolerance;
  return withinTolerance(accepted.apertureX, candidate.apertureX)
    && withinTolerance(accepted.baseline, candidate.baseline)
    && withinTolerance(accepted.viewport.width, candidate.viewport.width)
    && withinTolerance(accepted.viewport.height, candidate.viewport.height)
    && (['title', 'science', 'evolves', 'evolvesInk'] as const).every((word) => (
      boundsFields.every((field) => withinTolerance(accepted[word][field], candidate[word][field]))
    ));
}

export function serializeOpticalBounds(bounds: OpticalCssBounds) {
  return [bounds.left, bounds.top, bounds.width, bounds.height]
    .map((value) => value.toFixed(1))
    .join(',');
}
