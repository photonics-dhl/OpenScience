import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const gridUrl = new URL('../lib/optical-prototype/particle-grid.ts', import.meta.url);
const touchUrl = new URL('../lib/optical-prototype/touch-texture.ts', import.meta.url);
const gridModule = existsSync(fileURLToPath(gridUrl))
  ? await import('../lib/optical-prototype/particle-grid')
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
    const grid = gridModule.createParticleGrid(geometry, 'high');
    expect(grid.count).toBe(5);
    expect(Array.from(grid.ids)).toEqual([0, 1, 2, 3, 4]);
    expect(Array.from(grid.homes)).toEqual([10, 20, 15, 20, 20, 20, 10, 25, 15, 25]);
    expect(Array.from(grid.groups)).toEqual([0, 0, 1, 2, 2]);
    expect(grid.viewport).toEqual({ height: 100, width: 200 });
  });

  it('selects deterministic density tiers without dropping the period', () => {
    expect(gridModule).not.toBeNull();
    if (!gridModule) return;
    const high = gridModule.createParticleGrid(geometry, 'high');
    const mediumA = gridModule.createParticleGrid(geometry, 'medium');
    const mediumB = gridModule.createParticleGrid(geometry, 'medium');
    const low = gridModule.createParticleGrid(geometry, 'low');
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
