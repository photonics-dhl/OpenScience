import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config.mjs';

const assetCases = [
  {
    key: 'energyPlate',
    source: '/optical-lab/energy-plate-black-alpha-v1.png',
  },
  {
    key: 'targetReference',
    source: '/optical-lab/target-reference.png',
  },
] as const;

const expectedAsset = ({ source }: (typeof assetCases)[number]) => {
  const filePath = fileURLToPath(new URL(`../public${source}`, import.meta.url));
  const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return {
    sha256,
    source,
    versioned: source.replace(/\.png$/, `.${sha256.slice(0, 16)}.png`),
  };
};

describe('optical asset edge-cache contract', () => {
  it('publishes exact content-addressed rewrites with immutable cache headers', async () => {
    const rewrites = await nextConfig.rewrites?.();
    const headers = await nextConfig.headers?.();

    for (const assetCase of assetCases) {
      const expected = expectedAsset(assetCase);
      expect(rewrites).toContainEqual({
        destination: expected.source,
        source: expected.versioned,
      });
      expect(headers).toContainEqual({
        headers: [{
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        }],
        source: expected.versioned,
      });
    }
  });

  it('keeps one shared manifest synchronized with the real file bytes', async () => {
    const manifestPath = fileURLToPath(new URL('../lib/optical-lab/asset-manifest.mjs', import.meta.url));
    expect(existsSync(manifestPath)).toBe(true);
    if (!existsSync(manifestPath)) return;

    const { OPTICAL_ASSETS } = await import('../lib/optical-lab/asset-manifest.mjs');
    for (const assetCase of assetCases) {
      expect(OPTICAL_ASSETS[assetCase.key]).toEqual(expectedAsset(assetCase));
    }
  });

  it('does not apply immutable caching to HTML, API, or canonical asset paths', async () => {
    const headers = await nextConfig.headers?.() ?? [];
    const immutableSources = headers.map((entry) => entry.source);

    expect(immutableSources).not.toContain('/');
    expect(immutableSources).not.toContain('/api/:path*');
    for (const { source } of assetCases) expect(immutableSources).not.toContain(source);
  });

  it('makes both SSR plates and the WebGL loader consume the shared URLs', () => {
    const surfaceSource = readFileSync(
      fileURLToPath(new URL('../components/optical-lab/AcceptedOpticalSurface.tsx', import.meta.url)),
      'utf8',
    );
    const rendererSource = readFileSync(
      fileURLToPath(new URL('../lib/optical-lab/ogl/asset-interaction-renderer.ts', import.meta.url)),
      'utf8',
    );

    expect(surfaceSource).toContain("import { OPTICAL_ASSET_URLS } from '@/lib/optical-lab/asset-manifest.mjs'");
    expect(rendererSource).toContain("import { OPTICAL_ASSET_URLS } from '../asset-manifest.mjs'");
    expect(surfaceSource).not.toContain('src="/optical-lab/target-reference.png"');
    expect(rendererSource).not.toContain("loadImage('/optical-lab/target-reference.png')");
  });

  it('keeps the comparison route and delayed-loader gate on the versioned target URL', () => {
    const comparisonSource = readFileSync(
      fileURLToPath(new URL('../components/optical-lab/OpticalLabPage.tsx', import.meta.url)),
      'utf8',
    );
    const nativeGateSource = readFileSync(
      fileURLToPath(new URL('./visual/optical-lab-asset-interaction-gate.mjs', import.meta.url)),
      'utf8',
    );

    expect(comparisonSource).toContain("import { OPTICAL_ASSET_URLS } from '@/lib/optical-lab/asset-manifest.mjs'");
    expect(comparisonSource).not.toContain('src="/optical-lab/target-reference.png"');
    expect(nativeGateSource).toContain("import { OPTICAL_ASSET_URLS } from '../../lib/optical-lab/asset-manifest.mjs'");
    expect(nativeGateSource).toContain('this.src.includes(OPTICAL_ASSET_URLS.targetReference)');
  });
});
