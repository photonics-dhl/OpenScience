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
  density: number;
  displacement: number;
  evidence: number;
  origin: OpticalPoint;
  phase: number;
  radius: number;
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
    density: mobile ? 0.32 : clamp(viewport.width / 1_440, 0.58, 1),
    displacement: 11 + Math.sin(phase) * 3,
    evidence: pointer?.pressed ? 1 : Math.max(0, 1 - recovery) * 0.82,
    origin,
    phase,
    radius: mobile ? clamp(viewport.width * 0.27, 105, 120) : clamp(viewport.width * 0.13, 160, 200),
  };
}
