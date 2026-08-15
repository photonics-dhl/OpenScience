import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(import.meta.dirname, '..');
const inspectorPath = path.join(webRoot, 'scripts', 'hermes', 'inspect-pet-assets.mjs');

interface PetAssetReport {
  frames: Array<{
    alphaCoverage: number;
    alphaDigest: string;
    bytes: number;
    colorType: number;
    height: number;
    name: string;
    width: number;
  }>;
  readmeExists: boolean;
  totalBytes: number;
}

function inspectAssets(): PetAssetReport {
  const result = spawnSync(process.execPath, [inspectorPath, webRoot], { encoding: 'utf8' });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as PetAssetReport;
}

describe('Hermes 2.5D pet assets', () => {
  it('ships three transparent, bounded, consistently sized original frames', () => {
    const report = inspectAssets();

    expect(report.readmeExists).toBe(true);
    expect(report.frames.map(({ name }) => name)).toEqual([
      'hermes-pet-idle.png',
      'hermes-pet-blink.png',
      'hermes-pet-working.png',
    ]);
    expect(report.totalBytes).toBeLessThanOrEqual(1_500_000);
    expect(new Set(report.frames.map(({ alphaDigest }) => alphaDigest)).size).toBe(1);

    for (const frame of report.frames) {
      // The dashboard portrait renders at 256 CSS px. 824 px keeps more than
      // 3x source density while leaving room for three responsive states in
      // the 1.5 MB first-load budget.
      expect(frame.width).toBe(824);
      expect(frame.height).toBe(824);
      expect(frame.colorType).toBe(6);
      expect(frame.alphaCoverage).toBeGreaterThanOrEqual(0.12);
      expect(frame.alphaCoverage).toBeLessThanOrEqual(0.72);
      expect(frame.bytes).toBeGreaterThan(40_000);
    }
  });
});
