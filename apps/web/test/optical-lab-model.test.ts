import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modelUrl = new URL('../lib/optical-lab/model.ts', import.meta.url);
const model = existsSync(fileURLToPath(modelUrl))
  ? await import('../lib/optical-lab/model')
  : null;

describe('Optical Lab capability and field model', () => {
  it('selects WebGL2 first and WebGL1 half-float only when viable', () => {
    expect(model?.selectOpticalLabMode({
      reducedMotion: false,
      lowPower: false,
      webgl2: true,
      webgl1: true,
      halfFloat: true,
    })).toBe('webgl2');
    expect(model?.selectOpticalLabMode({
      reducedMotion: false,
      lowPower: false,
      webgl2: false,
      webgl1: true,
      halfFloat: true,
    })).toBe('webgl1');
    expect(model?.selectOpticalLabMode({
      reducedMotion: false,
      lowPower: false,
      webgl2: false,
      webgl1: true,
      halfFloat: false,
    })).toBe('dom-static');
  });

  it('uses the DOM/static path for reduced motion and low-power mobile', () => {
    expect(model?.selectOpticalLabMode({
      reducedMotion: true,
      lowPower: false,
      webgl2: true,
      webgl1: true,
      halfFloat: true,
    })).toBe('dom-static');
    expect(model?.selectOpticalLabMode({
      reducedMotion: false,
      lowPower: true,
      webgl2: true,
      webgl1: true,
      halfFloat: true,
    })).toBe('dom-static');
  });

  it('keeps aperture topology fixed while pointer energy changes independently', () => {
    const viewport = { width: 1_200, height: 675 };
    const left = model?.sampleOpticalLabField(
      { x: 180, y: 240, lastActiveAt: 1_000, velocityX: -0.8, velocityY: 0.2 },
      viewport,
      1_000,
    );
    const right = model?.sampleOpticalLabField(
      { x: 1_020, y: 430, lastActiveAt: 1_000, velocityX: 0.9, velocityY: -0.1 },
      viewport,
      1_000,
    );
    expect(left?.aperture).toEqual({ x: 696, y: 337.5 });
    expect(right?.aperture).toEqual(left?.aperture);
    expect(left?.pointer.x).toBe(180);
    expect(right?.pointer.x).toBe(1_020);
    expect(Math.abs(left?.verticalBias ?? 99)).toBeLessThanOrEqual(18);
    expect(Math.abs(right?.verticalBias ?? 99)).toBeLessThanOrEqual(18);
  });

  it('dissipates interaction energy over 650ms without moving the slit', () => {
    const viewport = { width: 1_000, height: 600 };
    const pointer = { x: 160, y: 120, lastActiveAt: 2_000, velocityX: 1, velocityY: 0 };
    const active = model?.sampleOpticalLabField(pointer, viewport, 2_000);
    const recovering = model?.sampleOpticalLabField(pointer, viewport, 2_325);
    const recovered = model?.sampleOpticalLabField(pointer, viewport, 2_650);
    expect(active?.energy).toBeGreaterThan(recovering?.energy ?? 1);
    expect(recovering?.energy).toBeGreaterThan(recovered?.energy ?? 1);
    expect(recovered?.energy).toBe(0);
    expect(active?.aperture).toEqual(recovered?.aperture);
  });

  it('reports frame, FPS and stable bounds as measurable diagnostics', () => {
    const metrics = model?.createFrameMetrics(4);
    metrics?.record(0, 0.8, null);
    metrics?.record(16, 1.2, 0.5);
    metrics?.record(32, 1.0, 0.6);
    const snapshot = metrics?.snapshot({ x: 20, y: 40, width: 800, height: 450 });
    expect(snapshot?.frameCount).toBe(3);
    expect(snapshot?.fps).toBeCloseTo(62.5, 1);
    expect(snapshot?.cpuFrameMs).toBeCloseTo(1, 2);
    expect(snapshot?.gpuFrameMs).toBeCloseTo(0.55, 2);
    expect(snapshot?.bounds).toEqual({ x: 20, y: 40, width: 800, height: 450 });
  });
});
