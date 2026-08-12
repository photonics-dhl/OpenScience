import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  CENTRAL_PARTICLE_VERTEX_SHADER,
} from '../lib/optical-prototype/shaders/particle';
import { CONTINUOUS_TITLE_FRAGMENT_SHADER } from '../lib/optical-prototype/shaders/title';

const gridUrl = new URL('../lib/optical-prototype/particle-grid.ts', import.meta.url);
const continuousTitleUrl = new URL('../lib/optical-prototype/continuous-title.ts', import.meta.url);
const fieldModelUrl = new URL('../lib/optical-prototype/field-model.ts', import.meta.url);
const curtainGridUrl = new URL('../lib/optical-prototype/curtain-grid.ts', import.meta.url);
const touchUrl = new URL('../lib/optical-prototype/touch-texture.ts', import.meta.url);
const gridModule = existsSync(fileURLToPath(gridUrl))
  ? await import('../lib/optical-prototype/particle-grid')
  : null;
const continuousTitleModule = existsSync(fileURLToPath(continuousTitleUrl))
  ? await import('../lib/optical-prototype/continuous-title')
  : null;
const fieldModelModule = existsSync(fileURLToPath(fieldModelUrl))
  ? await import('../lib/optical-prototype/field-model')
  : null;
const curtainGridModule = existsSync(fileURLToPath(curtainGridUrl))
  ? await import('../lib/optical-prototype/curtain-grid')
  : null;
const touchModule = existsSync(fileURLToPath(touchUrl))
  ? await import('../lib/optical-prototype/touch-texture')
  : null;

const geometry = {
  points: [
    { column: 0, glyphIndex: 0, group: 'science', id: 0, row: 0, x: 10, y: 20 },
    { column: 1, glyphIndex: 0, group: 'science', id: 1, row: 0, x: 15, y: 20 },
    { column: 2, glyphIndex: 1, group: 'evolves', id: 2, row: 0, x: 20, y: 20 },
    { column: 0, glyphIndex: 2, group: 'period', id: 3, row: 1, x: 10, y: 25 },
    { column: 1, glyphIndex: 2, group: 'period', id: 4, row: 1, x: 15, y: 25 },
  ],
  viewport: { height: 100, width: 200 },
} as const;

function createTouchFixture(size = 16) {
  const writes: Uint8ClampedArray[] = [];
  const dispose = vi.fn();
  const texture = { dispose, needsUpdate: false };
  const context = {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      height,
      width,
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => writes.push(image.data.slice()),
  };
  const canvas = {
    getContext: (kind: string) => kind === '2d' ? context : null,
    height: 0,
    width: 0,
  };
  const touch = touchModule?.createTouchTexture({
    createCanvas: () => canvas,
    createTexture: () => texture,
    size,
  });
  return { dispose, touch, texture, writes };
}

describe('central particle regular grid', () => {
  it('preserves exact regular homes, stable IDs and the period group', () => {
    expect(gridModule, 'particle grid module must exist').not.toBeNull();
    if (!gridModule) return;
    const grid = gridModule.createParticleGrid(geometry, 'high', { mode: 'debug-grid' });
    expect(grid.count).toBe(5);
    expect(Array.from(grid.ids)).toEqual([0, 1, 2, 3, 4]);
    expect(Array.from(grid.homes)).toEqual([10, 20, 15, 20, 20, 20, 10, 25, 15, 25]);
    expect(Array.from(grid.groups)).toEqual([0, 0, 1, 2, 2]);
    expect(grid.viewport).toEqual({ height: 100, width: 200 });
  });

  it('selects deterministic density tiers without dropping the period', () => {
    expect(gridModule).not.toBeNull();
    if (!gridModule) return;
    const high = gridModule.createParticleGrid(geometry, 'high', { mode: 'debug-grid' });
    const mediumA = gridModule.createParticleGrid(geometry, 'medium', { mode: 'debug-grid' });
    const mediumB = gridModule.createParticleGrid(geometry, 'medium', { mode: 'debug-grid' });
    const low = gridModule.createParticleGrid(geometry, 'low', { mode: 'debug-grid' });
    expect(Array.from(mediumA.ids)).toEqual(Array.from(mediumB.ids));
    expect(high.count).toBeGreaterThan(mediumA.count);
    expect(mediumA.count).toBeGreaterThan(low.count);
    expect(Array.from(mediumA.groups)).toContain(2);
    expect(Array.from(low.groups)).toContain(2);
  });

  it('fits design coordinates with one scale and maps pointer input through the same transform', () => {
    expect(gridModule?.fitParticleViewport, 'viewport fit helper must exist').toBeTypeOf('function');
    expect(gridModule?.mapParticlePointer, 'pointer mapping helper must exist').toBeTypeOf('function');
    if (!gridModule?.fitParticleViewport || !gridModule.mapParticlePointer) return;
    const fit = gridModule.fitParticleViewport(
      { height: 935, width: 1672 },
      { height: 1000, width: 800 },
    );
    expect(fit.scale).toBeCloseTo(800 / 1672, 8);
    expect(fit.offsetX).toBeCloseTo(0, 8);
    expect(fit.offsetY).toBeCloseTo((1000 - 935 * fit.scale) / 2, 8);
    const center = gridModule.mapParticlePointer(
      { x: 400, y: 500 },
      fit,
      { height: 935, width: 1672 },
    );
    expect(center.x).toBeCloseTo(0.5, 8);
    expect(center.y).toBeCloseTo(0.5, 8);
    const topLetterbox = gridModule.mapParticlePointer(
      { x: 400, y: 0 },
      fit,
      { height: 935, width: 1672 },
    );
    expect(topLetterbox).toEqual({ x: 0.5, y: 0 });
  });

  it('keeps the full title grid debug-only and selects the aperture band by default', () => {
    expect(gridModule).not.toBeNull();
    if (!gridModule) return;
    const apertureGeometry = {
      center: { x: 100, y: 50 },
      points: [
        { column: 0, glyphIndex: 0, group: 'science', id: 0, row: 0, x: 20, y: 50 },
        { column: 1, glyphIndex: 0, group: 'science', id: 1, row: 0, x: 90, y: 50 },
        { column: 2, glyphIndex: 1, group: 'evolves', id: 2, row: 0, x: 100, y: 50 },
        { column: 3, glyphIndex: 1, group: 'evolves', id: 3, row: 0, x: 110, y: 50 },
        { column: 4, glyphIndex: 2, group: 'period', id: 4, row: 0, x: 180, y: 50 },
      ],
      viewport: { height: 100, width: 200 },
    } as const;
    const resting = gridModule.createParticleGrid(apertureGeometry, 'high');
    const debug = gridModule.createParticleGrid(apertureGeometry, 'high', { mode: 'debug-grid' });
    expect(Array.from(resting.ids)).toEqual([1, 2, 3]);
    expect(Array.from(debug.ids)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('central particle continuous title substrate', () => {
  it('owns a continuous GPU title with a four CSS pixel interaction cap', () => {
    expect(continuousTitleModule, 'continuous title module must exist').not.toBeNull();
    expect(continuousTitleModule?.createContinuousTitle).toBeTypeOf('function');
    expect(continuousTitleModule?.CONTINUOUS_TITLE_MAX_WARP_CSS_PX).toBe(4);
  });

  it('dissolves only the aperture band without replacing outside glyph ink', () => {
    expect(CONTINUOUS_TITLE_FRAGMENT_SHADER).toContain('uFieldCenter');
    expect(CONTINUOUS_TITLE_FRAGMENT_SHADER).toContain('seamEnergy');
    expect(CONTINUOUS_TITLE_FRAGMENT_SHADER).toMatch(/alpha\s\*=\s*1\.0\s*-\s*seamEnergy/);
  });

  it('rasterizes the authoritative outline once and releases every owned resource once', () => {
    expect(continuousTitleModule?.createContinuousTitle).toBeTypeOf('function');
    if (!continuousTitleModule?.createContinuousTitle) return;
    const fill = vi.fn();
    const clearRect = vi.fn();
    const setTransform = vi.fn();
    const context = { clearRect, fill, fillStyle: '', setTransform };
    const canvas = {
      getContext: vi.fn().mockReturnValue(context),
      height: 0,
      width: 0,
    };
    const path = { kind: 'authoritative-path' };
    const createPath2D = vi.fn().mockReturnValue(path);
    const title = continuousTitleModule.createContinuousTitle({
      center: { x: 100, y: 50 },
      glyphs: [{ bounds: { maxX: 190, maxY: 90, minX: 180, minY: 80 }, group: 'period' }],
      outlinePath: 'M10 10L190 90Z',
      viewport: { height: 100, width: 200 },
      words: [
        { text: 'Science', visibleBounds: { maxX: 100, maxY: 90, minX: 10, minY: 10 } },
        { text: 'evolves.', visibleBounds: { maxX: 190, maxY: 90, minX: 100, minY: 10 } },
      ],
    }, 1.5, {
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      createPath2D,
      touchTexture: {} as never,
    });
    expect(canvas).toMatchObject({ height: 150, width: 300 });
    expect(createPath2D).toHaveBeenCalledWith('M10 10L190 90Z');
    expect(setTransform).toHaveBeenCalledWith(1.5, 0, 0, 1.5, 0, 0);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(fill).toHaveBeenCalledWith(path, 'nonzero');
    expect(title.uniforms.uMaxWarpCssPx.value).toBe(4);
    title.setPointer({ x: 0.25, y: 0.75 });
    expect(title.uniforms.uPointer.value.toArray()).toEqual([0.25, 0.75]);
    title.setViewport({ offsetX: 12, offsetY: 34, scale: 0.5 });
    expect(title.uniforms.uDesignOffset.value.toArray()).toEqual([12, 34]);
    expect(title.uniforms.uDesignScale.value).toBe(0.5);
    const geometryDispose = vi.spyOn(title.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(title.mesh.material, 'dispose');
    const textureDispose = vi.spyOn(title.texture, 'dispose');
    title.dispose();
    title.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('rolls back partial texture and geometry ownership when title construction fails', () => {
    expect(continuousTitleModule?.createContinuousTitle).toBeTypeOf('function');
    if (!continuousTitleModule?.createContinuousTitle) return;
    const texture = { dispose: vi.fn() };
    const plane = { dispose: vi.fn() };
    const context = {
      clearRect: vi.fn(), fill: vi.fn(), fillStyle: '', setTransform: vi.fn(),
    };
    const titleGeometry = {
      center: { x: 100, y: 50 },
      glyphs: [{ bounds: { maxX: 190, maxY: 90, minX: 180, minY: 80 }, group: 'period' }],
      outlinePath: 'M10 10L190 90Z',
      viewport: { height: 100, width: 200 },
      words: [
        { text: 'Science', visibleBounds: { maxX: 100, maxY: 90, minX: 10, minY: 10 } },
        { text: 'evolves.', visibleBounds: { maxX: 190, maxY: 90, minX: 100, minY: 10 } },
      ],
    };
    expect(() => continuousTitleModule.createContinuousTitle(titleGeometry, 1, {
      createCanvas: () => ({ getContext: () => context, height: 0, width: 0 }) as unknown as HTMLCanvasElement,
      createGeometry: () => plane as never,
      createMaterial: () => { throw new Error('material failed'); },
      createPath2D: () => ({}) as Path2D,
      createTexture: () => texture as never,
      touchTexture: {},
    })).toThrow('material failed');
    expect(plane.dispose).toHaveBeenCalledTimes(1);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('central particle fixed optical field', () => {
  it('keeps the resting center fixed and bends trajectories with a signed tangent', () => {
    expect(fieldModelModule?.sampleOpticalField, 'field model must exist').toBeTypeOf('function');
    if (!fieldModelModule?.sampleOpticalField) return;
    expect(fieldModelModule.OPTICAL_FIELD_CENTER).toEqual({ x: 958.056, y: 467.5 });
    const above = fieldModelModule.sampleOpticalField({
      group: 'science', home: { x: 910, y: 420 }, id: 17, pointer: null, timeMs: 1500,
      viewport: { height: 935, width: 1672 },
    });
    const below = fieldModelModule.sampleOpticalField({
      group: 'science', home: { x: 910, y: 515 }, id: 17, pointer: null, timeMs: 1500,
      viewport: { height: 935, width: 1672 },
    });
    expect(above.energy).toBeGreaterThan(0);
    expect(above.tangentialDisplacement.x).toBeGreaterThan(0);
    expect(below.tangentialDisplacement.x).toBeLessThan(0);
    expect(above.emissionDisplacement.x).toBeGreaterThan(0);
    expect(below.emissionDisplacement.x).toBeGreaterThan(0);
  });

  it('is deterministic and keeps pointer enhancement below resting motion and four pixels', () => {
    expect(fieldModelModule?.sampleOpticalField).toBeTypeOf('function');
    if (!fieldModelModule?.sampleOpticalField) return;
    const input = {
      group: 'evolves' as const,
      home: { x: 990, y: 445 },
      id: 91,
      pointer: { strength: 1, x: 0.573, y: 0.5 },
      timeMs: 1500,
      viewport: { height: 935, width: 1672 },
    };
    const first = fieldModelModule.sampleOpticalField(input);
    const second = fieldModelModule.sampleOpticalField(input);
    expect(second).toEqual(first);
    expect(first.pointerMagnitude).toBeLessThanOrEqual(4);
    expect(first.pointerMagnitude).toBeLessThan(first.restingMagnitude);
    const far = fieldModelModule.sampleOpticalField({ ...input, home: { x: 200, y: 445 } });
    expect(far.energy).toBe(0);
    expect(far.restingMagnitude).toBe(0);
  });

  it('keeps the CPU oracle numerically aligned with the GLSL field contract', () => {
    expect(fieldModelModule?.sampleOpticalField).toBeTypeOf('function');
    if (!fieldModelModule?.sampleOpticalField) return;
    const id = 91;
    const home = { x: 990, y: 445 };
    const pointer = { strength: 0.7, x: 0.573, y: 0.5 };
    const actual = fieldModelModule.sampleOpticalField({
      group: 'period', home, id, pointer, timeMs: 1500,
      viewport: { height: 935, width: 1672 },
    });
    const stable = ((id + 1) * 0.61803398875) % 1;
    const center = { x: 958.056, y: 467.5 };
    const delta = { x: home.x - center.x, y: home.y - center.y };
    const distance = Math.hypot(delta.x, delta.y);
    const radialDirection = { x: delta.x / distance, y: delta.y / distance };
    const seam = Math.max(0, Math.min(1, 1 - Math.abs(delta.x) / (1672 * 0.055)));
    const energy = seam * seam;
    const radial = {
      x: -radialDirection.x * energy * 0.9 * (10 + stable * 8),
      y: -radialDirection.y * energy * 0.9 * (10 + stable * 8),
    };
    const tangent = { x: -radialDirection.y, y: radialDirection.x };
    const resting = {
      x: radial.x + tangent.x * energy * (5 + stable * 4) + energy * (20 + stable * 14),
      y: radial.y + tangent.y * energy * (5 + stable * 4)
        + energy * Math.sin(1500 * 0.0007 + stable * Math.PI * 2) * 2.5,
    };
    const homeUv = { x: home.x / 1672, y: home.y / 935 };
    const away = { x: homeUv.x - pointer.x, y: homeUv.y - pointer.y };
    const awayLength = Math.hypot(away.x, away.y);
    const pointerCap = Math.min(pointer.strength * 4, Math.hypot(resting.x, resting.y) * 0.35, 4);
    expect(actual.restingDisplacement.x).toBeCloseTo(resting.x, 6);
    expect(actual.restingDisplacement.y).toBeCloseTo(resting.y, 6);
    expect(actual.pointerDisplacement.x).toBeCloseTo(away.x / awayLength * pointerCap, 6);
    expect(actual.pointerDisplacement.y).toBeCloseTo(away.y / awayLength * pointerCap, 6);
    for (const expression of [
      'fract((aId + 1.0) * 0.61803398875)',
      'mix(1.0, 0.9, step(0.5, aGroup))',
      'min(min(touch * 4.0, length(restingField) * 0.35), 4.0)',
      '(away / awayLength) * pointerCap',
    ]) expect(CENTRAL_PARTICLE_VERTEX_SHADER).toContain(expression);
  });
});

describe('central particle independent curtain grid', () => {
  it('creates a deterministic full-height tapered grid with stable row and column IDs', () => {
    expect(curtainGridModule?.createCurtainGrid, 'curtain grid must exist').toBeTypeOf('function');
    if (!curtainGridModule?.createCurtainGrid) return;
    const first = curtainGridModule.createCurtainGrid({ height: 935, width: 1672 }, 'high');
    const second = curtainGridModule.createCurtainGrid({ height: 935, width: 1672 }, 'high');
    expect(second).toEqual(first);
    expect(new Set(first.points.map(({ id }) => id)).size).toBe(first.points.length);
    expect(Math.min(...first.points.map(({ y }) => y))).toBeLessThanOrEqual(935 * 0.06);
    expect(Math.max(...first.points.map(({ y }) => y))).toBeGreaterThanOrEqual(935 * 0.94);
    const waist = first.points.filter(({ y }) => Math.abs(y - 467.5) < 30);
    const outer = first.points.filter(({ y }) => Math.abs(y - 467.5) > 350);
    const spread = (points: typeof first.points) => Math.max(...points.map(({ x }) => x))
      - Math.min(...points.map(({ x }) => x));
    expect(spread(waist)).toBeLessThan(spread(outer) * 0.45);
    expect(new Set(first.points.map(({ opacity }) => opacity)).size).toBeGreaterThan(8);
    const low = curtainGridModule.createCurtainGrid({ height: 935, width: 1672 }, 'low');
    expect(low.points.length).toBeLessThan(first.points.length);
  });

  it('merges seam glyphs and curtain points with explicit deterministic roles', () => {
    expect(curtainGridModule?.createFieldParticleAttributes).toBeTypeOf('function');
    if (!curtainGridModule?.createFieldParticleAttributes || !gridModule) return;
    const glyphs = gridModule.createParticleGrid({
      center: { x: 20, y: 50 },
      points: geometry.points,
      viewport: geometry.viewport,
    }, 'high');
    const curtain = curtainGridModule.createCurtainGrid(geometry.viewport, 'low');
    const merged = curtainGridModule.createFieldParticleAttributes(glyphs, curtain);
    expect(merged.count).toBe(glyphs.count + curtain.points.length);
    expect(Array.from(merged.roles.slice(0, glyphs.count))).toEqual(Array(glyphs.count).fill(0));
    expect(Array.from(merged.roles.slice(glyphs.count))).toEqual(Array(curtain.points.length).fill(1));
    expect(Array.from(merged.opacities.slice(0, glyphs.count))).toEqual(Array(glyphs.count).fill(1));
    expect(Array.from(merged.opacities.slice(glyphs.count))).toEqual(curtain.points.map(({ opacity }) => opacity));
  });

  it('binds stable field roles and fixed-time motion in the particle vertex shader', () => {
    for (const token of ['aId', 'aOpacity', 'aPhase', 'aRole', 'uFieldCenter', 'uTimeMs']) {
      expect(CENTRAL_PARTICLE_VERTEX_SHADER).toContain(token);
    }
    expect(CENTRAL_PARTICLE_VERTEX_SHADER).toMatch(/min\([^;]*4\.0/);
    expect(CENTRAL_PARTICLE_VERTEX_SHADER).not.toMatch(/random|noise/i);
  });
});

describe('central particle TouchTexture', () => {
  it('responds to the first pointer stamp with bounded energy and one upload', () => {
    expect(touchModule, 'TouchTexture module must exist').not.toBeNull();
    const { touch, writes } = createTouchFixture();
    expect(touch).toBeDefined();
    if (!touch) return;
    touch.addPointer({ velocity: 0.5, x: 0.5, y: 0.5 });
    touch.update(16.6667);
    expect(touch.sample(0.5, 0.5)).toBeGreaterThan(0.45);
    expect(touch.sample(0.5, 0.5)).toBeLessThanOrEqual(1);
    expect(writes).toHaveLength(1);
  });

  it('decays by elapsed time rather than refresh rate', () => {
    expect(touchModule).not.toBeNull();
    const sixty = createTouchFixture().touch;
    const oneTwenty = createTouchFixture().touch;
    expect(sixty).toBeDefined();
    expect(oneTwenty).toBeDefined();
    if (!sixty || !oneTwenty) return;
    sixty.addPointer({ velocity: 1, x: 0.5, y: 0.5 });
    oneTwenty.addPointer({ velocity: 1, x: 0.5, y: 0.5 });
    for (let frame = 0; frame < 60; frame += 1) sixty.update(1000 / 60);
    for (let frame = 0; frame < 120; frame += 1) oneTwenty.update(1000 / 120);
    expect(sixty.sample(0.5, 0.5)).toBeCloseTo(oneTwenty.sample(0.5, 0.5), 5);
  });

  it('uploads a final zero texture when natural decay finishes', () => {
    expect(touchModule).not.toBeNull();
    const { touch, writes } = createTouchFixture();
    expect(touch).toBeDefined();
    if (!touch) return;
    touch.addPointer({ velocity: 1, x: 0.5, y: 0.5 });
    touch.update(16.6667);
    touch.update(10_000);
    expect(touch.sample(0.5, 0.5)).toBe(0);
    expect(writes.at(-1)?.every((byte) => byte === 0)).toBe(true);
  });

  it('clears pointer state and disposes the texture exactly once', () => {
    expect(touchModule).not.toBeNull();
    const { dispose, touch } = createTouchFixture();
    expect(touch).toBeDefined();
    if (!touch) return;
    touch.addPointer({ velocity: 1, x: 0.5, y: 0.5 });
    touch.clear();
    expect(touch.sample(0.5, 0.5)).toBe(0);
    touch.dispose();
    touch.dispose();
    touch.update(16.6667);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(touch.sample(0.5, 0.5)).toBe(0);
  });
});
