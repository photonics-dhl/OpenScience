import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PRODUCT_RELEASE_CASES, PRODUCT_RELEASE_VIEWPORTS } from './visual/product-release-manifest.mjs';

const expectedSurfaces = ['auth', 'collection', 'dashboard', 'explore', 'intake', 'landing', 'public', 'workspace'];

describe('product visual release manifest', () => {
  it('covers every canonical product surface at all approved viewports', () => {
    expect(PRODUCT_RELEASE_VIEWPORTS).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'wide', width: 1920, height: 1080 },
      { name: 'mobile', width: 390, height: 844 },
    ]);
    expect([...new Set(PRODUCT_RELEASE_CASES.map(({ surface }) => surface))].sort()).toEqual(expectedSurfaces);
    for (const surface of expectedSurfaces) {
      expect(PRODUCT_RELEASE_CASES.filter((entry) => entry.surface === surface && !entry.reducedMotion)).toHaveLength(3);
    }
  });

  it('pins real routes, named states and reduced-motion coverage', () => {
    expect(PRODUCT_RELEASE_CASES.every(({ route, state }) => route.startsWith('/') && state.length > 0)).toBe(true);
    expect(PRODUCT_RELEASE_CASES.find(({ surface }) => surface === 'workspace')?.route).toContain('/research-objects/');
    expect(PRODUCT_RELEASE_CASES.find(({ surface }) => surface === 'public')?.route).toContain('/research/');
    expect(PRODUCT_RELEASE_CASES.find(({ surface }) => surface === 'collection')?.route).toBe('/collections/ultrafast-science');
    expect(PRODUCT_RELEASE_CASES.filter(({ reducedMotion }) => reducedMotion).map(({ surface }) => surface)).toEqual(['landing', 'landing', 'landing']);
  });

  it('requires a deterministic optical clock and CI artifact upload', () => {
    const opticalSource = readFileSync(new URL('../components/brand/OpticalField.tsx', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(opticalSource).toContain('__OPENSCIENCE_VISUAL_CLOCK__');
    expect(packageJson.scripts['test:release']).toContain('product-release.spec.ts');
    expect(workflow).toContain('playwright install --with-deps chromium');
    expect(workflow).toContain('actions/upload-artifact');
  });
});
