import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OPTICAL_QUALITY_BUDGETS,
  createOpticalQualityState,
  sampleOpticalQuality,
} from '../lib/optical-lab/runtime-policy';

describe('Optical Lab runtime budgets', () => {
  it('reduces particles and then bloom after consecutive slow windows', () => {
    let state = createOpticalQualityState();
    state = sampleOpticalQuality(state, { durationMs: 2_000, fps: 44 });
    expect(state.tier).toBe('full');
    state = sampleOpticalQuality(state, { durationMs: 2_000, fps: 44 });
    expect(state.tier).toBe('reduced-particles');
    state = sampleOpticalQuality(state, { durationMs: 2_000, fps: 44 });
    expect(state.tier).toBe('reduced-bloom');
  });

  it('requires ten seconds above 55 FPS before restoring one tier', () => {
    let state = createOpticalQualityState('reduced-bloom');
    state = sampleOpticalQuality(state, { durationMs: 9_999, fps: 60 });
    expect(state.tier).toBe('reduced-bloom');
    state = sampleOpticalQuality(state, { durationMs: 1, fps: 60 });
    expect(state.tier).toBe('reduced-particles');
  });

  it('keeps bounded rendering constants', () => {
    expect(OPTICAL_QUALITY_BUDGETS.maxDpr).toBe(2);
    expect(OPTICAL_QUALITY_BUDGETS.reducedParticleRatio).toBeGreaterThanOrEqual(.55);
    expect(OPTICAL_QUALITY_BUDGETS.reducedBloomScale).toBe(.125);
  });

  it('keeps the accepted fallback and atlases within committed asset budgets', async () => {
    const publicRoot = path.resolve(process.cwd(), 'public/optical-lab');
    const fallback = await stat(path.join(publicRoot, 'accepted-resting.png'));
    const atlasRoot = path.join(publicRoot, 'atlas');
    const atlasFiles = await readdir(atlasRoot);
    const atlasStats = await Promise.all(atlasFiles.map((file) => stat(path.join(atlasRoot, file))));

    expect(fallback.size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(atlasStats.reduce((total, entry) => total + entry.size, 0)).toBeLessThanOrEqual(512 * 1024);
  });
});
