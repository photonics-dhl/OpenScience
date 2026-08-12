import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type WebPackage = {
  dependencies: Record<string, string | undefined>;
  devDependencies: Record<string, string | undefined>;
};

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as WebPackage;

const productionLandingModules = [
  '../app/page.tsx',
  '../components/landing/EvolutionPanel.tsx',
  '../components/landing/Hero.tsx',
  '../components/landing/HeroLoopMedia.tsx',
  '../components/landing/HermesBand.tsx',
  '../components/landing/LatestResearch.tsx',
  '../components/landing/SiteHeader.tsx',
  '../components/landing/TrustBand.tsx',
  '../components/landing/evolving-ro-symbol.tsx',
  '../components/landing/in-view.tsx',
  '../components/brand/OpticalField.tsx',
  '../components/brand/OpticalHeadline.tsx',
  '../lib/landing-motion.ts',
  '../lib/optical-field/canvas-renderer.ts',
  '../lib/optical-field/field-model.ts',
];

function importedModuleSpecifiers(source: string): string[] {
  const staticOrDynamicImport = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  return Array.from(source.matchAll(staticOrDynamicImport), (match) => match[1] ?? match[2]);
}

function isForbiddenPrototypeImport(specifier: string): boolean {
  return specifier === 'three'
    || specifier.startsWith('three/')
    || specifier === 'postprocessing'
    || specifier.startsWith('postprocessing/')
    || specifier.includes('central-particle')
    || specifier.includes('optical-native');
}

describe('central particle prototype dependency boundary', () => {
  it('pins the approved native runtime packages and excludes wrapper engines', () => {
    expect(packageJson.dependencies.three).toBe('0.185.1');
    expect(packageJson.dependencies.postprocessing).toBe('6.39.4');
    expect(packageJson.devDependencies['opentype.js']).toBe('2.0.0');

    for (const name of ['@react-three/fiber', '@react-three/postprocessing', 'tsparticles', 'particles-gl']) {
      expect(packageJson.dependencies[name]).toBeUndefined();
    }
  });

  it('keeps Three, postprocessing, and prototype imports out of the production landing graph', () => {
    for (const relativePath of productionLandingModules) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(
        importedModuleSpecifiers(source).filter(isForbiddenPrototypeImport),
        relativePath,
      ).toEqual([]);
    }
  });
});
