export const OPTICAL_LAB_APERTURE_X = 0.58;
export const OPTICAL_LAB_RECOVERY_MS = 650;
export const OPTICAL_LAB_REST_STRENGTH = 0.72;
export const OPTICAL_LAB_MAX_REFRACTION_PX = 8;

export type OpticalLabRenderMode = 'webgl2' | 'webgl1' | 'dom-static';

export interface OpticalLabPointer {
  x: number;
  y: number;
  lastActiveAt: number;
  velocityX: number;
  velocityY: number;
}

export interface OpticalLabViewport {
  width: number;
  height: number;
}

export interface OpticalLabRefractionUv {
  x: number;
  y: number;
}

export interface OpticalLabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampVector(x: number, y: number, maximum: number) {
  const magnitude = Math.hypot(x, y);
  const scale = magnitude > maximum ? (maximum - 1e-9) / magnitude : 1;
  return { x: x * scale, y: y * scale };
}

function exponentialRecovery(remaining: number) {
  if (remaining <= 0) return 0;
  return (Math.exp(4 * remaining) - 1) / (Math.exp(4) - 1);
}

export function clampOpticalLabRefraction(
  refractionUv: OpticalLabRefractionUv,
  viewport: OpticalLabViewport,
) {
  const pixels = clampVector(
    refractionUv.x * viewport.width,
    refractionUv.y * viewport.height,
    OPTICAL_LAB_MAX_REFRACTION_PX,
  );
  return {
    x: pixels.x / viewport.width,
    y: pixels.y / viewport.height,
  };
}

export function stepOpticalLabRefraction(
  current: OpticalLabRefractionUv,
  target: OpticalLabRefractionUv,
  viewport: OpticalLabViewport,
  deltaMs: number,
) {
  const boundedTarget = clampOpticalLabRefraction(target, viewport);
  if (boundedTarget.x === 0 && boundedTarget.y === 0) return { x: 0, y: 0 };
  const boundedCurrent = clampOpticalLabRefraction(current, viewport);
  const follow = 1 - Math.exp(-Math.max(0, deltaMs) / 45);
  return clampOpticalLabRefraction({
    x: boundedCurrent.x + (boundedTarget.x - boundedCurrent.x) * follow,
    y: boundedCurrent.y + (boundedTarget.y - boundedCurrent.y) * follow,
  }, viewport);
}

export function sampleOpticalLabField(
  pointer: OpticalLabPointer | null,
  viewport: OpticalLabViewport,
  now: number,
) {
  const aperture = {
    x: viewport.width * OPTICAL_LAB_APERTURE_X,
    y: viewport.height * 0.5,
  };
  const elapsed = pointer ? Math.max(0, now - pointer.lastActiveAt) : OPTICAL_LAB_RECOVERY_MS;
  const remaining = clamp(1 - elapsed / OPTICAL_LAB_RECOVERY_MS, 0, 1);
  const interactionStrength = pointer ? exponentialRecovery(remaining) : 0;
  const opticalStrength = OPTICAL_LAB_REST_STRENGTH
    + (1 - OPTICAL_LAB_REST_STRENGTH) * interactionStrength;
  const pointerX = pointer?.x ?? aperture.x;
  const pointerY = pointer?.y ?? aperture.y;
  const velocity = pointer ? clampVector(pointer.velocityX, pointer.velocityY, 1) : { x: 0, y: 0 };
  const normalizedPointer = pointer ? {
    ...pointer,
    velocityX: velocity.x,
    velocityY: velocity.y,
  } : { x: aperture.x, y: aperture.y, velocityX: 0, velocityY: 0 };
  const refractionUv = pointer ? clampOpticalLabRefraction({
    x: ((pointerX - aperture.x) / viewport.width) * 0.018 * interactionStrength,
    y: ((pointerY - aperture.y) / viewport.height) * 0.018 * interactionStrength,
  }, viewport) : { x: 0, y: 0 };

  return {
    aperture,
    energy: interactionStrength,
    interactionStrength,
    opticalStrength,
    phase: clamp(normalizedPointer.velocityX * interactionStrength, -1, 1),
    pointer: normalizedPointer,
    refractionUv,
  };
}

export function createFrameMetrics(sampleSize = 60) {
  const timestamps: number[] = [];
  const cpuSamples: number[] = [];
  const gpuSamples: number[] = [];
  let frameCount = 0;

  const push = (samples: number[], value: number) => {
    samples.push(value);
    if (samples.length > sampleSize) samples.shift();
  };
  const average = (samples: number[]) => (
    samples.length ? samples.reduce((total, value) => total + value, 0) / samples.length : 0
  );

  return {
    record(timestamp: number, cpuFrameMs: number, gpuFrameMs: number | null) {
      frameCount += 1;
      push(timestamps, timestamp);
      push(cpuSamples, cpuFrameMs);
      if (gpuFrameMs !== null) push(gpuSamples, gpuFrameMs);
    },
    snapshot(bounds: OpticalLabBounds) {
      const duration = timestamps.length > 1
        ? timestamps[timestamps.length - 1]! - timestamps[0]!
        : 0;
      const fps = duration > 0 ? ((timestamps.length - 1) * 1_000) / duration : 0;
      return {
        bounds,
        cpuFrameMs: average(cpuSamples),
        fps,
        frameCount,
        gpuFrameMs: gpuSamples.length ? average(gpuSamples) : null,
      };
    },
  };
}
