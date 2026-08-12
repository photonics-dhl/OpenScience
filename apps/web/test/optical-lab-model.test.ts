import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const modelUrl = new URL('../lib/optical-lab/model.ts', import.meta.url);
const model = existsSync(fileURLToPath(modelUrl))
  ? await import('../lib/optical-lab/model')
  : null;
const runtimePolicyUrl = new URL('../lib/optical-lab/runtime-policy.ts', import.meta.url);
const runtimePolicy = existsSync(fileURLToPath(runtimePolicyUrl))
  ? await import('../lib/optical-lab/runtime-policy')
  : null;
const layoutUrl = new URL('../lib/optical-lab/layout.ts', import.meta.url);
const layout = existsSync(fileURLToPath(layoutUrl))
  ? await import('../lib/optical-lab/layout')
  : null;

describe('Optical Lab capability and field model', () => {
  it('selects only the WebGL2 full runtime for an animated capable canvas', () => {
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: true,
      initializationFailed: false,
      reducedMotion: false,
      lowPower: false,
      webgl2: true,
    })).toBe('webgl2-full');
  });

  it('retires WebGL1 and chooses an honest static fallback for non-full policies', () => {
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: true,
      initializationFailed: false,
      reducedMotion: false,
      lowPower: false,
      webgl2: false,
    })).toBe('static-fallback');
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: true,
      initializationFailed: false,
      reducedMotion: true,
      lowPower: false,
      webgl2: true,
    })).toBe('static-fallback');
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: true,
      initializationFailed: true,
      reducedMotion: false,
      lowPower: false,
      webgl2: true,
    })).toBe('static-fallback');
  });

  it('uses DOM only when canvas is unavailable and static fallback on low-power mobile', () => {
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: false,
      initializationFailed: false,
      lowPower: false,
      reducedMotion: false,
      webgl2: true,
    })).toBe('dom-only');
    expect(runtimePolicy?.chooseOpticalRuntime({
      canvas: true,
      initializationFailed: false,
      reducedMotion: false,
      lowPower: true,
      webgl2: true,
    })).toBe('static-fallback');
  });

  it('acquires the first WebGL2 context with the frozen OGL context contract', () => {
    const getContext = vi.fn(() => ({}));
    const canvas = { getContext } as unknown as HTMLCanvasElement;

    expect(runtimePolicy?.acquireOpticalWebGL2Context(canvas)).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2', {
      alpha: true,
      antialias: false,
      depth: true,
      powerPreference: 'default',
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    expect(Object.isFrozen(runtimePolicy?.OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES)).toBe(true);
  });

  it('measures CSS-pixel DOM geometry after fonts settle and fixes the aperture at 58%', async () => {
    let fontsResolved = false;
    const fontsReady = Promise.resolve().then(() => {
      fontsResolved = true;
    });
    vi.stubGlobal('document', { fonts: { ready: fontsReady } });
    const rectangle = (left: number, top: number, width: number, height: number) => ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
    const baseline = { getBoundingClientRect: () => rectangle(680, 375.2, 0, 0) };
    const evolvesInk = { getBoundingClientRect: () => rectangle(690, 250, 350, 172) };
    const stage = {
      getBoundingClientRect: () => rectangle(100, 50, 1_000, 600),
      querySelector: (selector: string) => (
        selector === '[data-optical-lab-evolves-ink="true"]' ? evolvesInk : baseline
      ),
    } as unknown as HTMLElement;
    const science = {
      getBoundingClientRect: () => rectangle(122, 264.8, 558, 145.2),
    } as unknown as HTMLElement;
    const evolves = {
      getBoundingClientRect: () => rectangle(680, 264.8, 377, 145.2),
    } as unknown as HTMLElement;

    const measured = await layout?.measureOpticalLayout(stage, science, evolves);

    expect(fontsResolved).toBe(true);
    expect(measured).toEqual({
      apertureX: 580,
      baseline: 325.2,
      evolves: { bottom: 360, height: 145.2, left: 580, right: 957, top: 214.8, width: 377 },
      evolvesInk: { bottom: 372, height: 172, left: 590, right: 940, top: 200, width: 350 },
      science: { bottom: 360, height: 145.2, left: 22, right: 580, top: 214.8, width: 558 },
      title: { bottom: 360, height: 145.2, left: 22, right: 957, top: 214.8, width: 935 },
      viewport: { height: 600, width: 1_000 },
    });
    vi.unstubAllGlobals();
  });

  it('rejects GPU publication when measured DOM bounds drift by more than one CSS pixel', () => {
    const accepted = {
      apertureX: 580,
      baseline: 325.2,
      evolves: { bottom: 360, height: 145.2, left: 580, right: 957, top: 214.8, width: 377 },
      evolvesInk: { bottom: 372, height: 172, left: 590, right: 940, top: 200, width: 350 },
      science: { bottom: 360, height: 145.2, left: 22, right: 580, top: 214.8, width: 558 },
      title: { bottom: 360, height: 145.2, left: 22, right: 957, top: 214.8, width: 935 },
      viewport: { height: 600, width: 1_000 },
    };
    expect(layout?.hasOpticalLayoutParity(accepted, {
      ...accepted,
      science: { ...accepted.science, right: 581 },
    })).toBe(true);
    expect(layout?.hasOpticalLayoutParity(accepted, {
      ...accepted,
      science: { ...accepted.science, right: 581.01 },
    })).toBe(false);
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
    expect(right?.refractionUv).not.toEqual(left?.refractionUv);
    expect(left?.pointer.x).toBe(180);
    expect(right?.pointer.x).toBe(1_020);
    expect((left?.refractionUv.y ?? 99) * viewport.height).toBeLessThan(0);
    expect((right?.refractionUv.y ?? 99) * viewport.height).toBeCloseTo(1.665, 5);
    expect(Math.hypot(
      (left?.refractionUv.x ?? 99) * viewport.width,
      (left?.refractionUv.y ?? 99) * viewport.height,
    )).toBeLessThanOrEqual(8);
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

  it('keeps the resting optical composition energized without pointer input', () => {
    const resting = model?.sampleOpticalLabField(null, { width: 1_200, height: 675 }, 5_000);
    expect(resting?.interactionStrength).toBe(0);
    expect(resting?.opticalStrength).toBeCloseTo(0.72, 5);
    expect(resting?.refractionUv).toEqual({ x: 0, y: 0 });
  });

  it('normalizes diagonal whole-line pointer refraction to a combined eight pixel budget', () => {
    const viewport = { width: 1_200, height: 675 };
    const active = model?.sampleOpticalLabField({
      x: 9_000,
      y: -4_000,
      lastActiveAt: 1_000,
      velocityX: 1,
      velocityY: -1,
    }, viewport, 1_000);
    const displacement = Math.hypot(
      (active?.refractionUv.x ?? 1) * viewport.width,
      (active?.refractionUv.y ?? 1) * viewport.height,
    );
    expect(displacement).toBeLessThanOrEqual(8);
    expect(active?.interactionStrength).toBe(1);
    expect(active?.opticalStrength).toBe(1);
    expect(active?.aperture).toEqual({ x: 696, y: 337.5 });
  });

  it('smooths rapid diagonal targets monotonically and reaches rest without bounce', () => {
    const viewport = { width: 1_200, height: 675 };
    const step = model?.stepOpticalLabRefraction;
    expect(step).toBeTypeOf('function');
    if (!step) return;

    const positiveTarget = model?.sampleOpticalLabField({
      x: 1_200,
      y: 675,
      lastActiveAt: 1_000,
      velocityX: 20,
      velocityY: 20,
    }, viewport, 1_000).refractionUv ?? { x: 0, y: 0 };
    let current = { x: 0, y: 0 };
    let previousDistance = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 8; frame += 1) {
      current = step(current, positiveTarget, viewport, 16);
      const distance = Math.hypot(
        (positiveTarget.x - current.x) * viewport.width,
        (positiveTarget.y - current.y) * viewport.height,
      );
      expect(current.x).toBeGreaterThanOrEqual(0);
      expect(current.x).toBeLessThanOrEqual(positiveTarget.x);
      expect(current.y).toBeGreaterThanOrEqual(0);
      expect(current.y).toBeLessThanOrEqual(positiveTarget.y);
      expect(distance).toBeLessThan(previousDistance);
      previousDistance = distance;
    }

    const negativeTarget = model?.sampleOpticalLabField({
      x: 0,
      y: 0,
      lastActiveAt: 1_128,
      velocityX: -20,
      velocityY: -20,
    }, viewport, 1_128).refractionUv ?? { x: 0, y: 0 };
    let previousX = current.x;
    let previousY = current.y;
    for (let frame = 0; frame < 12; frame += 1) {
      current = step(current, negativeTarget, viewport, 16);
      expect(current.x).toBeLessThan(previousX);
      expect(current.y).toBeLessThan(previousY);
      expect(current.x).toBeGreaterThanOrEqual(negativeTarget.x);
      expect(current.y).toBeGreaterThanOrEqual(negativeTarget.y);
      previousX = current.x;
      previousY = current.y;
    }

    const pointer = {
      x: 0,
      y: 0,
      lastActiveAt: 2_000,
      velocityX: -20,
      velocityY: -20,
    };
    current = model?.sampleOpticalLabField(pointer, viewport, 2_000).refractionUv ?? { x: 0, y: 0 };
    let previousNow = 2_000;
    for (const now of [2_100, 2_200, 2_300, 2_400, 2_500, 2_600, 2_650]) {
      const target = model?.sampleOpticalLabField(pointer, viewport, now).refractionUv ?? { x: 0, y: 0 };
      const next = step(current, target, viewport, now - previousNow);
      expect(Math.hypot(next.x * viewport.width, next.y * viewport.height))
        .toBeLessThanOrEqual(Math.hypot(current.x * viewport.width, current.y * viewport.height));
      current = next;
      previousNow = now;
    }
    expect(current).toEqual({ x: 0, y: 0 });
  });

  it('caps authored velocity and phase before flow injection', () => {
    const active = model?.sampleOpticalLabField({
      x: 1_000,
      y: 600,
      lastActiveAt: 1_000,
      velocityX: 500,
      velocityY: -500,
    }, { width: 1_000, height: 600 }, 1_000);
    expect(Math.hypot(active?.pointer.velocityX ?? 99, active?.pointer.velocityY ?? 99)).toBeLessThanOrEqual(1);
    expect(Math.abs(active?.phase ?? 99)).toBeLessThanOrEqual(1);
  });

  it('keeps authored active positions perceptible without exceeding the eight pixel cap', () => {
    const viewport = { width: 1_200, height: 675 };
    const active = model?.sampleOpticalLabField({
      x: viewport.width * .82,
      y: viewport.height * .52,
      lastActiveAt: 1_000,
      velocityX: .8,
      velocityY: 0,
    }, viewport, 1_000);
    const horizontalPixels = Math.abs((active?.refractionUv.x ?? 0) * viewport.width);

    expect(horizontalPixels).toBeGreaterThanOrEqual(5);
    expect(horizontalPixels).toBeLessThanOrEqual(8);
    expect(active?.aperture).toEqual({ x: 696, y: 337.5 });
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
