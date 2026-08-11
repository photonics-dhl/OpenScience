export const OPTICAL_LAB_APERTURE_X = 0.58;
export const OPTICAL_LAB_RECOVERY_MS = 650;

export type OpticalLabRenderMode = 'webgl2' | 'webgl1' | 'dom-static';

export interface OpticalLabCapabilities {
  reducedMotion: boolean;
  lowPower: boolean;
  webgl2: boolean;
  webgl1: boolean;
  halfFloat: boolean;
}

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

export interface OpticalLabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function selectOpticalLabMode(capabilities: OpticalLabCapabilities): OpticalLabRenderMode {
  if (capabilities.reducedMotion || capabilities.lowPower) return 'dom-static';
  if (capabilities.webgl2) return 'webgl2';
  if (capabilities.webgl1 && capabilities.halfFloat) return 'webgl1';
  return 'dom-static';
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
  const energy = pointer ? Math.max(0, 1 - elapsed / OPTICAL_LAB_RECOVERY_MS) : 0;
  const verticalBias = pointer
    ? Math.max(-18, Math.min(18, (pointer.y - aperture.y) * 0.06 * energy))
    : 0;

  return {
    aperture,
    energy,
    phase: pointer ? pointer.velocityX * energy : 0,
    pointer: pointer ?? { x: aperture.x, y: aperture.y, velocityX: 0, velocityY: 0 },
    verticalBias,
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
