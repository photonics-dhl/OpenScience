import { describe, expect, it } from 'vitest';

import * as rendererModule from '@/lib/hermes/pet-mesh-renderer';
import type { HermesPetMeshInput, HermesPetMeshRenderer } from '@/lib/hermes/pet-mesh-renderer';
import type { WankoPerformance } from '@/lib/hermes/wanko-action-director';

interface RuntimePort {
  destroy(): void;
  render(input: HermesPetMeshInput, performance: WankoPerformance, deltaMs: number): boolean;
  resize(width: number, height: number): void;
}

interface Scheduler {
  cancel(id: number): void;
  now(): number;
  request(callback: (now: number) => void): number;
}

type CreateController = (
  runtime: RuntimePort,
  stage: Pick<HTMLElement, 'getBoundingClientRect'>,
  getInput: () => HermesPetMeshInput,
  onSnapshot: (snapshot: { action?: string; drawnAt: number; status: 'disposed' | 'ready' }) => void,
  scheduler?: Scheduler,
) => HermesPetMeshRenderer;

function getControllerFactory(): CreateController | undefined {
  return (rendererModule as unknown as { createWankoRendererController?: CreateController }).createWankoRendererController;
}

function getLiveFactory(): unknown {
  return (rendererModule as unknown as { createWankoLive2DRenderer?: unknown }).createWankoLive2DRenderer;
}

type SetNativePresentation = (parts: {
  getPartCount(): number;
  getPartId(index: number): unknown;
  setPartOpacityByIndex(index: number, opacity: number): void;
}) => number;

function getNativePresentationSetter(): SetNativePresentation | undefined {
  return (rendererModule as unknown as { setWankoNativePresentation?: SetNativePresentation })
    .setWankoNativePresentation;
}

type GetWankoPlacement = (
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  variant?: 'desktop' | 'mobile',
) => { positionX: number; positionY: number; scale: number };

function getWankoPlacementFactory(): GetWankoPlacement | undefined {
  return (rendererModule as unknown as { getWankoModelPlacement?: GetWankoPlacement })
    .getWankoModelPlacement;
}

function createScheduler() {
  let nextId = 1;
  let time = 1_000;
  const callbacks = new Map<number, (now: number) => void>();
  const scheduler: Scheduler = {
    cancel(id) { callbacks.delete(id); },
    now() { return time; },
    request(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
  };
  return {
    callbacks,
    flush(delta = 16) {
      time += delta;
      const queued = [...callbacks.entries()];
      callbacks.clear();
      queued.forEach(([, callback]) => callback(time));
    },
    scheduler,
  };
}

const baseInput = (): HermesPetMeshInput => ({
  action: 'observe-left',
  actionStartedAtMs: 900,
  engaged: false,
  pointer: { x: 0, y: 0 },
  state: 'idle',
});

describe('Wanko renderer controller', () => {
  it('exposes the real lazy Live2D factory through the production renderer boundary', () => {
    expect(getLiveFactory()).toBeTypeOf('function');
  });

  it('keeps the complete puppy while suppressing the inseparable bowl lid and blob effects', () => {
    const setNativePresentation = getNativePresentationSetter();
    expect(setNativePresentation).toBeTypeOf('function');
    if (!setNativePresentation) return;

    const ids = ['PARTS_01_BACKGROUND', 'PARTS_01_BOWL', 'PARTS_01_EFFECT', 'PARTS_01_BODY'];
    const opacities = new Float32Array([1, 1, 1, 1]);
    const model = {
      getPartCount: () => ids.length,
      getPartId: (index: number) => ids[index],
      setPartOpacityByIndex(index: number, opacity: number) { opacities[index] = opacity; },
    };
    expect(setNativePresentation(model)).toBe(3);
    expect(Array.from(opacities)).toEqual([0, 0, 0, 1]);
  });

  it('accepts the v09 runtime where Cubism omits the hidden background part', () => {
    const setNativePresentation = getNativePresentationSetter();
    expect(setNativePresentation).toBeTypeOf('function');
    if (!setNativePresentation) return;

    const ids = ['PARTS_01_BOWL', 'PARTS_01_EFFECT', 'PARTS_01_CORE', 'PARTS_01_BODY'];
    const opacities = new Float32Array([1, 1, 1, 1]);
    const model = {
      getPartCount: () => ids.length,
      getPartId: (index: number) => ids[index],
      setPartOpacityByIndex(index: number, opacity: number) { opacities[index] = opacity; },
    };
    expect(setNativePresentation(model)).toBe(3);
    expect(Array.from(opacities)).toEqual([0, 0, 0, 1]);
  });

  it('uses a character-forward genie composition without carrier-specific cropping', () => {
    const getWankoModelPlacement = getWankoPlacementFactory();
    expect(getWankoModelPlacement).toBeTypeOf('function');
    if (!getWankoModelPlacement) return;

    const desktop = getWankoModelPlacement(426, 288, 824, 824, 'desktop');
    expect(desktop.positionX).toBe(213);
    expect(desktop.positionY).toBeCloseTo(86.4, 5);
    expect(desktop.scale).toBeCloseTo((288 / 824) * 1.5, 5);

    const mobile = getWankoModelPlacement(426, 288, 824, 824, 'mobile');
    expect(mobile.positionX).toBe(213);
    expect(mobile.positionY).toBeCloseTo(92.16, 5);
    expect(mobile.scale).toBeCloseTo((288 / 824) * 1.35, 5);
  });

  it('does not expose the rejected procedural navigator beside the native Cubism model', () => {
    expect((rendererModule as unknown as { getWankoNavigatorGeometry?: unknown }).getWankoNavigatorGeometry)
      .toBeUndefined();
  });

  it('selects mobile placement without importing rejected carrier assets', () => {
    const resolveVariant = (rendererModule as unknown as {
      resolveWankoPresentationVariant?: (viewportWidth: number) => 'desktop' | 'mobile';
    }).resolveWankoPresentationVariant;
    expect(resolveVariant).toBeTypeOf('function');
    expect(resolveVariant?.(640)).toBe('mobile');
    expect(resolveVariant?.(641)).toBe('desktop');
  });

  it('owns one interruptible render loop and applies only live input', () => {
    const createController = getControllerFactory();
    expect(createController).toBeTypeOf('function');
    if (!createController) return;

    const timeline = createScheduler();
    const renders: Array<{ action: string | undefined; deltaMs: number; motion: string | null }> = [];
    let destroyed = 0;
    const runtime: RuntimePort = {
      destroy() { destroyed += 1; },
      render(input, performance, deltaMs) {
        renders.push({ action: input.action, deltaMs, motion: performance.motion?.group ?? null });
        return true;
      },
      resize() {},
    };
    let input = baseInput();
    const snapshots: Array<{ action?: string; drawnAt: number; status: 'disposed' | 'ready' }> = [];
    const owner = createController(
      runtime,
      { getBoundingClientRect: () => ({ height: 240, width: 260 } as DOMRect) },
      () => input,
      (snapshot) => snapshots.push(snapshot),
      timeline.scheduler,
    );

    expect(timeline.callbacks.size).toBe(1);
    timeline.flush();
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ action: 'observe-left', motion: null });
    expect(snapshots.at(-1)).toMatchObject({ action: 'observe-left', status: 'ready' });

    input = { ...input, action: 'milestone-dance' };
    timeline.flush();
    expect(renders.at(-1)).toMatchObject({ action: 'milestone-dance', motion: 'Shake' });

    owner.dispose();
    owner.dispose();
    expect(destroyed).toBe(1);
    expect(timeline.callbacks.size).toBe(0);
    expect(snapshots.at(-1)?.status).toBe('disposed');
  });

  it('cancels while suspended, resumes on wake and resizes from the real stage', () => {
    const createController = getControllerFactory();
    expect(createController).toBeTypeOf('function');
    if (!createController) return;

    const timeline = createScheduler();
    const sizes: Array<[number, number]> = [];
    let renders = 0;
    const runtime: RuntimePort = {
      destroy() {},
      render() { renders += 1; return true; },
      resize(width, height) { sizes.push([width, height]); },
    };
    const owner = createController(
      runtime,
      { getBoundingClientRect: () => ({ height: 241.6, width: 259.5 } as DOMRect) },
      baseInput,
      () => {},
      timeline.scheduler,
    );

    expect(sizes).toEqual([[260, 242]]);
    owner.setSuspended(true);
    expect(timeline.callbacks.size).toBe(0);
    timeline.flush();
    expect(renders).toBe(0);

    owner.setSuspended(false);
    expect(timeline.callbacks.size).toBe(1);
    timeline.flush();
    expect(renders).toBe(1);
    owner.wake();
    expect(timeline.callbacks.size).toBe(1);
    owner.resize();
    expect(sizes).toEqual([[260, 242], [260, 242]]);
    owner.dispose();
  });

  it('publishes a bounded heartbeat instead of causing React work on every draw', () => {
    const createController = getControllerFactory();
    expect(createController).toBeTypeOf('function');
    if (!createController) return;

    const timeline = createScheduler();
    let renders = 0;
    const snapshots: Array<{ drawnAt: number }> = [];
    const owner = createController(
      {
        destroy() {},
        render() { renders += 1; return true; },
        resize() {},
      },
      { getBoundingClientRect: () => ({ height: 240, width: 260 } as DOMRect) },
      baseInput,
      (snapshot) => snapshots.push(snapshot),
      timeline.scheduler,
    );

    timeline.flush(16);
    for (let index = 0; index < 10; index += 1) timeline.flush(16);
    expect(renders).toBe(11);
    expect(snapshots).toHaveLength(1);
    timeline.flush(500);
    expect(snapshots).toHaveLength(2);
    owner.dispose();
  });
});
