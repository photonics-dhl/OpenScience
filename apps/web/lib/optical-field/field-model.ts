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
  density: number;
  displacement: number;
  evidence: number;
  origin: OpticalPoint;
  phase: number;
  radius: number;
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

export function sampleDiffractionWavefront(
  aperture: OpticalPoint,
  step: number,
  side: -1 | 1,
  phase: number,
): OpticalPoint {
  const distance = 34 + step * 24;
  const spread = distance * (0.24 + step * 0.035);
  return {
    x: aperture.x + distance + Math.sin(phase + step * 0.7) * 2,
    y: aperture.y + side * spread,
  };
}

export function textDisplacementScale(sample: OpticalSample) {
  return sample.evidence * sample.displacement;
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
  const phase = (now % 6_283) / 1_000;
  const restingOrigin = { x: viewport.width * 0.5, y: viewport.height * 0.42 };
  const recovery = pointer ? clamp((now - pointer.lastActiveAt) / 500, 0, 1) : 1;
  const easedRecovery = recovery * recovery * (3 - 2 * recovery);
  const origin = pointer
    ? {
        x: pointer.x + (restingOrigin.x - pointer.x) * easedRecovery,
        y: pointer.y + (restingOrigin.y - pointer.y) * easedRecovery,
      }
    : restingOrigin;

  return {
    aperture: { x: viewport.width * 0.5, y: viewport.height * 0.42 },
    density: mobile ? 0.32 : clamp(viewport.width / 1_440, 0.58, 1),
    displacement: 11 + Math.sin(phase) * 3,
    evidence: pointer?.pressed ? 1 : Math.max(0, 1 - recovery) * 0.82,
    origin,
    phase,
    radius: mobile ? clamp(viewport.width * 0.27, 105, 120) : clamp(viewport.width * 0.13, 160, 200),
  };
}
