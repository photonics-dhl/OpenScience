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
};

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

  it('ships deterministic licensed atlases for the accepted words', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(fontRoot, 'manifest.json'), 'utf8'),
    ) as OpticalAtlasManifest;
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
});
