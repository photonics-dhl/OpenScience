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

export async function measureOpticalLayout(
  stage: HTMLElement,
  science: HTMLElement,
  evolves: HTMLElement,
): Promise<OpticalLayout> {
  await document.fonts?.ready;

  const stageRect = stage.getBoundingClientRect();
  const scienceBounds = toLocalBounds(science.getBoundingClientRect(), stageRect);
  const evolvesBounds = toLocalBounds(evolves.getBoundingClientRect(), stageRect);
  const baselineProbe = stage.querySelector<HTMLElement>('[data-optical-lab-baseline-probe="true"]');
  const baseline = baselineProbe
    ? baselineProbe.getBoundingClientRect().top - stageRect.top
    : Math.max(scienceBounds.bottom, evolvesBounds.bottom);

  return {
    apertureX: stageRect.width * OPTICAL_LAB_APERTURE_X,
    baseline,
    evolves: evolvesBounds,
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
    && (['title', 'science', 'evolves'] as const).every((word) => (
      boundsFields.every((field) => withinTolerance(accepted[word][field], candidate[word][field]))
    ));
}

export function serializeOpticalBounds(bounds: OpticalCssBounds) {
  return [bounds.left, bounds.top, bounds.width, bounds.height]
    .map((value) => value.toFixed(1))
    .join(',');
}
