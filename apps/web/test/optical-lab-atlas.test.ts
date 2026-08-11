import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(__dirname, '..');
const fontRoot = resolve(webRoot, 'assets/optical-lab/fonts');
const atlasRoot = resolve(webRoot, 'public/optical-lab/atlas');

type OpticalAtlasManifest = {
  charset: string;
  generator: { name: string; version: string };
  fonts: Array<{ file: string; sourceSha256: string }>;
  outputs: Array<{ file: string; sha256: string }>;
  settings: Record<string, unknown>;
};

const acceptedChars = [...new Set(' Sciencevolves.')].sort();

function manifestFixture() {
  return JSON.parse(readFileSync(resolve(fontRoot, 'manifest.json'), 'utf8')) as OpticalAtlasManifest;
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyManifestHashes(manifest: OpticalAtlasManifest) {
  return manifest.fonts.every(({ file, sourceSha256 }) => {
    const path = resolve(fontRoot, file);
    return existsSync(path) && sha256(path) === sourceSha256;
  }) && manifest.outputs.every(({ file, sha256: expectedSha256 }) => {
    const path = resolve(webRoot, file);
    return existsSync(path) && sha256(path) === expectedSha256;
  });
}

describe('optical Lab MSDF atlas assets', () => {
  it('rejects a charset other than the accepted title glyphs', async () => {
    const { assertAcceptedCharset } = await import('../scripts/generate-optical-atlas.mjs');

    expect(() => assertAcceptedCharset(' Scienceevolves.')).toThrow('only generates the accepted charset');
  });

  it('rejects a font entry whose basename is not an approved atlas source', async () => {
    const { validateOpticalAtlasContract } = await import('../scripts/generate-optical-atlas.mjs');
    const manifest = manifestFixture();
    manifest.fonts[0]!.file = 'unapproved.ttf';

    expect(() => validateOpticalAtlasContract(manifest)).toThrow('exact source files');
  });

  it('rejects duplicate, missing, or extra manifest output names before generation', async () => {
    const { validateOpticalAtlasContract } = await import('../scripts/generate-optical-atlas.mjs');
    const manifest = manifestFixture();
    manifest.outputs[1]!.file = manifest.outputs[0]!.file;

    expect(() => validateOpticalAtlasContract(manifest)).toThrow('exact unique output set');
  });

  it('rejects mutable atlas settings that diverge from the fixed contract', async () => {
    const { validateOpticalAtlasContract } = await import('../scripts/generate-optical-atlas.mjs');
    const manifest = manifestFixture();
    manifest.settings.fontSize = 97;

    expect(() => validateOpticalAtlasContract(manifest)).toThrow('fixed settings');
  });

  it('ships deterministic licensed atlases for the accepted words', () => {
    const manifest = manifestFixture();
    const science = JSON.parse(
      readFileSync(resolve(atlasRoot, 'science-display.json'), 'utf8'),
    ) as { chars: Record<string, unknown> };
    const evolves = JSON.parse(
      readFileSync(resolve(atlasRoot, 'evolves-editorial.json'), 'utf8'),
    ) as { chars: Record<string, unknown> };

    expect(manifest.charset).toBe(' Sciencevolves.');
    expect(manifest.generator).toEqual({ name: 'msdf-bmfont-xml', version: '2.8.0' });
    expect(Object.keys(science.chars).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(evolves.chars).length).toBeGreaterThanOrEqual(8);
    expect(verifyManifestHashes(manifest)).toBe(true);
  });

  it('ships only the fixed MSDF configuration and one power-of-two atlas page per approved glyph', () => {
    const manifest = manifestFixture();
    const atlases = ['science-display', 'evolves-editorial'].map((name) => ({
      atlas: JSON.parse(readFileSync(resolve(atlasRoot, `${name}.json`), 'utf8')) as {
        chars: Array<{ char: string }>;
        common: { pages: number; scaleH: number; scaleW: number };
        distanceField: { distanceRange: number; fieldType: string };
        info: { padding: number[]; size: number };
        pages: string[];
      },
      name,
    }));

    expect(manifest.settings).toEqual({
      distanceRange: 8,
      fieldType: 'msdf',
      fontSize: 96,
      maxTotalBytes: 524288,
      outputType: 'json',
      powerOfTwo: true,
      singlePage: true,
      smartSize: true,
      texturePadding: 4,
    });
    for (const { atlas, name } of atlases) {
      expect([...new Set(atlas.chars.map(({ char }) => char))].sort()).toEqual(acceptedChars);
      expect(atlas.chars).toHaveLength(acceptedChars.length);
      expect(atlas.pages).toEqual([`${name}.png`]);
      expect(atlas.common.pages).toBe(1);
      expect(atlas.common.scaleW & (atlas.common.scaleW - 1)).toBe(0);
      expect(atlas.common.scaleH & (atlas.common.scaleH - 1)).toBe(0);
      expect(atlas.distanceField).toEqual({ distanceRange: 8, fieldType: 'msdf' });
      expect(atlas.info.size).toBe(96);
      expect(atlas.info.padding).toEqual([4, 4, 4, 4]);
    }
    const totalBytes = atlases.flatMap(({ name }) => [
      resolve(atlasRoot, `${name}.json`),
      resolve(atlasRoot, `${name}.png`),
    ]).reduce((total, path) => total + readFileSync(path).byteLength, 0);
    expect(totalBytes).toBeLessThanOrEqual(524288);
  });
});
