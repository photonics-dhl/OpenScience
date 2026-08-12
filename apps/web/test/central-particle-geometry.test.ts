import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';

const geometryUrl = new URL('../public/optical-prototype/title-geometry.json', import.meta.url);
const outlineUrl = new URL('../public/optical-prototype/title-outline.svg', import.meta.url);
const manifestUrl = new URL('../assets/optical-prototype/geometry-manifest.json', import.meta.url);

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Glyph = {
  advance: number;
  bounds: Bounds;
  char: string;
  index: number;
  kerningBefore: number;
  penX: number;
};
type Point = {
  column: number;
  glyphIndex: number;
  group: 'science' | 'evolves' | 'period';
  id: number;
  row: number;
  x: number;
  y: number;
};
type Geometry = {
  baseline: number;
  center: { normalizedX: number; normalizedY: number; x: number; y: number };
  glyphs: Glyph[];
  grid: { originX: number; originY: number; step: number };
  outlinePath: string;
  points: Point[];
  schemaVersion: 1;
  text: string;
  typography: { kerning: true };
  viewport: { height: number; width: number };
  visibleBounds: Bounds;
  words: Array<{ advance: number; baseline: number; endX: number; startX: number; text: string }>;
};

function readGeneratedContract() {
  for (const url of [geometryUrl, outlineUrl, manifestUrl]) {
    expect(existsSync(url), `${url.pathname} must be generated`).toBe(true);
  }
  return {
    geometry: JSON.parse(readFileSync(geometryUrl, 'utf8')) as Geometry,
    manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
      inputs: Array<{ file: string; licenseFile: string; sha256: string }>;
      outputs: Array<{ file: string; sha256: string }>;
      tools: { node: string; nodePolicy: string; opentypeJs: string };
    },
    svg: readFileSync(outlineUrl, 'utf8'),
  };
}

function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function expectFiniteNumbers(value: unknown, path = 'geometry'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => expectFiniteNumbers(child, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => expectFiniteNumbers(child, `${path}.${key}`));
  }
}

describe('central particle authoritative title geometry', () => {
  it('uses the accepted viewport, field center, text, and one baseline', () => {
    const { geometry } = readGeneratedContract();
    expect(geometry.schemaVersion).toBe(1);
    expect(geometry.text).toBe('Science evolves.');
    expect(geometry.viewport).toEqual({ width: 1672, height: 935 });
    expect(geometry.center).toEqual({
      normalizedX: 0.573,
      normalizedY: 0.5,
      x: 958.056,
      y: 467.5,
    });
    expect(Number.isFinite(geometry.baseline)).toBe(true);
    expect(geometry.words.every(({ baseline }) => baseline === geometry.baseline)).toBe(true);
  });

  it('records kerning-enabled monotonic glyph pen positions', () => {
    const { geometry } = readGeneratedContract();
    expect(geometry.glyphs.map(({ index }) => index)).toEqual(
      Array.from({ length: geometry.glyphs.length }, (_, index) => index),
    );
    expect(geometry.glyphs.map(({ char }) => char).join('')).toBe(geometry.text);
    expect(Array.isArray(geometry.words), 'word advances must be generated').toBe(true);
    if (!Array.isArray(geometry.words)) return;
    expect(geometry.words.map(({ text }) => text)).toEqual(['Science', 'evolves.']);
    expect(geometry.words.every(({ advance }) => advance > 0)).toBe(true);
    expect(geometry.words[1].startX).toBeGreaterThan(geometry.words[0].endX);
    for (let index = 1; index < geometry.glyphs.length; index += 1) {
      expect(geometry.glyphs[index].penX).toBeGreaterThan(geometry.glyphs[index - 1].penX);
    }
    expect(geometry.typography.kerning).toBe(true);
    expect(geometry.glyphs.every(({ kerningBefore }) => Number.isFinite(kerningBefore))).toBe(true);
  });

  it('emits a regular Cartesian grid with stable IDs and unique coordinates', () => {
    const { geometry } = readGeneratedContract();
    expect(geometry.points.length).toBeGreaterThan(1_000);
    expect(geometry.points.map(({ id }) => id)).toEqual(
      Array.from({ length: geometry.points.length }, (_, id) => id),
    );
    const coordinates = new Set<string>();
    for (const point of geometry.points) {
      expect(point.x).toBe(geometry.grid.originX + point.column * geometry.grid.step);
      expect(point.y).toBe(geometry.grid.originY + point.row * geometry.grid.step);
      expect(point.glyphIndex).toBeGreaterThanOrEqual(0);
      expect(point.glyphIndex).toBeLessThan(geometry.glyphs.length);
      coordinates.add(`${point.x},${point.y}`);
    }
    expect(coordinates.size).toBe(geometry.points.length);
    expect(new Set(geometry.points.map(({ group }) => group))).toEqual(
      new Set(['science', 'evolves', 'period']),
    );
  });

  it('serializes a finite SVG path whose parsed bounds match the JSON contract', () => {
    const { geometry, svg } = readGeneratedContract();
    expectFiniteNumbers(geometry);
    expect(geometry.outlinePath).not.toMatch(/(?:NaN|[+-]?Infinity)/);

    const pathMatch = svg.match(/<path\s+[^>]*d="([^"]+)"/);
    expect(pathMatch, 'generated SVG must contain a path').not.toBeNull();
    const parsedPath = opentype.Path.fromSVG(pathMatch![1], { flipY: false });
    const parsed = parsedPath.getBoundingBox();
    const parsedBounds = [parsed.x1, parsed.y1, parsed.x2, parsed.y2];
    const jsonBounds = [
      geometry.visibleBounds.minX,
      geometry.visibleBounds.minY,
      geometry.visibleBounds.maxX,
      geometry.visibleBounds.maxY,
    ];
    parsedBounds.forEach((value, index) => {
      expect(Number.isFinite(value), `parsed SVG bound ${index} must be finite`).toBe(true);
      expect(Math.abs(value - jsonBounds[index])).toBeLessThanOrEqual(1);
    });
  });

  it('keeps manifest hashes and exact controlled runtime provenance in parity', async () => {
    const { geometry, manifest, svg } = readGeneratedContract();
    const match = svg.match(/data-visible-bounds="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(svg).toContain(`d="${geometry.outlinePath}"`);
    const svgBounds = match![1].split(' ').map(Number);
    const jsonBounds = [
      geometry.visibleBounds.minX,
      geometry.visibleBounds.minY,
      geometry.visibleBounds.maxX,
      geometry.visibleBounds.maxY,
    ];
    expect(svgBounds).toHaveLength(4);
    svgBounds.forEach((value, index) => expect(Math.abs(value - jsonBounds[index])).toBeLessThanOrEqual(1));

    expect(manifest.tools.opentypeJs).toBe('2.0.0');
    expect(manifest.tools.node).toBe(process.versions.node);
    expect(manifest.tools.node).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.tools.nodePolicy).toBe('repository engines.node >=20; exact generator runtime recorded');
    const generator = await import('../scripts/generate-optical-title-geometry.mjs');
    expect(typeof generator.assertSupportedNodeRuntime).toBe('function');
    if (typeof generator.assertSupportedNodeRuntime === 'function') {
      expect(() => generator.assertSupportedNodeRuntime('19.9.0')).toThrow(/Node >=20/);
      expect(() => generator.assertSupportedNodeRuntime('not-semver')).toThrow(/exact Node semver/);
      expect(generator.assertSupportedNodeRuntime(process.versions.node)).toBe(process.versions.node);
    }
    expect(manifest.inputs).toHaveLength(2);
    for (const input of manifest.inputs) {
      const inputUrl = new URL(`../${input.file}`, import.meta.url);
      const licenseUrl = new URL(`../${input.licenseFile}`, import.meta.url);
      expect(existsSync(licenseUrl), input.licenseFile).toBe(true);
      expect(sha256(readFileSync(inputUrl))).toBe(input.sha256);
    }
    for (const output of manifest.outputs) {
      const outputUrl = new URL(`../${output.file}`, import.meta.url);
      expect(sha256(readFileSync(outputUrl))).toBe(output.sha256);
    }
  });
});
