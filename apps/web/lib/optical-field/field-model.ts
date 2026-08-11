export interface OpticalPoint {
  x: number;
  y: number;
}

export interface OpticalInteraction extends OpticalPoint {
  lastActiveAt: number;
  pressed: boolean;
}

export interface OpticalViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface OpticalSample {
  aperture: OpticalPoint;
  evidence: number;
  origin: OpticalPoint;
  phase: number;
  radius: number;
  verticalBias: number;
}

/** Time constant for the pointer's optical tracking spring. */
export const OPTICAL_POINTER_RESPONSE_MS = 58;

export function smoothOpticalPoint(current: OpticalPoint, target: OpticalPoint, deltaMs: number): OpticalPoint {
  const blend = 1 - Math.exp(-Math.max(0, deltaMs) / OPTICAL_POINTER_RESPONSE_MS);
  return {
    x: current.x + (target.x - current.x) * blend,
    y: current.y + (target.y - current.y) * blend,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function releaseOpticalInteraction(
  pointer: OpticalInteraction | null,
  now: number,
  reducedMotion: boolean,
): OpticalInteraction | null {
  if (!pointer || reducedMotion) return null;
  return { ...pointer, lastActiveAt: now, pressed: false };
}

export function sampleOpticalField(
  pointer: OpticalInteraction | null,
  viewport: OpticalViewport,
  now: number,
): OpticalSample {
  const mobile = viewport.width < 640;
  const basePhase = (now % 6_283) / 1_000;
  const restingOrigin = { x: viewport.width * 0.5, y: viewport.height * 0.5 };
  const recovery = pointer ? clamp((now - pointer.lastActiveAt) / 650, 0, 1) : 1;
  const evidence = pointer?.pressed ? 1 : Math.max(0, 1 - recovery) * 0.9;
  const pointerPhase = pointer ? clamp((pointer.x - restingOrigin.x) / viewport.width, -0.5, 0.5) * evidence * 0.7 : 0;
  const verticalBias = pointer ? clamp(pointer.y - restingOrigin.y, -18, 18) * evidence : 0;
  const phase = basePhase + pointerPhase;

  return {
    aperture: restingOrigin,
    evidence,
    origin: restingOrigin,
    phase,
    radius: mobile ? clamp(viewport.width * 0.27, 90, 115) : clamp(viewport.width * 0.145, 180, 220),
    verticalBias,
  };
}
