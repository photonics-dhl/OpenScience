import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { analyzeOpticalTopology } from './optical-lab-visual-metrics.mjs';

const APERTURE_X = .58;

function createImage(paint) {
  const width = 240;
  const height = 135;
  const pixels = new Array(width * height * 4).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const luminance = paint(x / width, y / height);
      const channel = Math.round(Math.max(0, Math.min(1, luminance)) * 255);
      const index = (y * width + x) * 4;
      pixels[index] = channel;
      pixels[index + 1] = channel;
      pixels[index + 2] = channel;
      pixels[index + 3] = 255;
    }
  }
  return { height, pixels, width };
}

function createReferenceLikeFixture() {
  return createImage((x, y) => {
    const glyphBand = x >= .12 && x <= .9 && Math.abs(y - .5) <= .052;
    const waist = Math.abs(x - APERTURE_X) <= .018 && Math.abs(y - .5) <= .26;
    const distance = x - APERTURE_X;
    const beamHalfWidth = .052 + Math.max(0, distance) * .7;
    const downstreamBeam = distance >= .035 && distance <= .24 && Math.abs(y - .5) <= beamHalfWidth;
    const downstreamRays = distance >= .04 && distance <= .24
      && Math.abs(Math.abs(y - .5) - (.2 + distance * .45)) <= .028;
    const curtainBand = Math.abs(x - APERTURE_X) <= .1
      && ((y >= .12 && y <= .32) || (y >= .68 && y <= .88));
    const curtainParticle = curtainBand
      && ((Math.floor(x * 240) * 17 + Math.floor(y * 135) * 11) % 29) <= 2;
    if (waist) return .92;
    if (curtainParticle) return .74;
    if (downstreamRays) return .58;
    if (downstreamBeam) return .46;
    return glyphBand ? .78 : 0;
  });
}

function createForbiddenFanFixture() {
  return createImage((x, y) => {
    const deltaX = x - APERTURE_X;
    const deltaY = y - .5;
    const radius = Math.hypot(deltaX, deltaY);
    const ring = Math.abs(radius - .19) <= .025;
    const symmetricFan = Math.abs(deltaY - deltaX) <= .024 || Math.abs(deltaY + deltaX) <= .024;
    const mechanicalLine = Math.abs(deltaX) <= .004;
    return ring || symmetricFan || mechanicalLine ? .72 : 0;
  });
}

describe('Optical Lab resting topology metrics', () => {
  it('recognizes a continuous glyph with a concentrated waist and right-opening beam', () => {
    const referenceLike = analyzeOpticalTopology(createReferenceLikeFixture(), APERTURE_X);

    assert(referenceLike.waistConcentration > 1.25);
    assert(referenceLike.downstreamSpread > .018);
    assert(referenceLike.continuity > .72);
    assert(referenceLike.directionality > 1.08);
    assert(referenceLike.verticalCurtainCoverage > .72);
    assert(referenceLike.verticalCurtainSpread > .18);
  });

  it('rejects a symmetric ring and fan as directional optical material', () => {
    const forbidden = analyzeOpticalTopology(createForbiddenFanFixture(), APERTURE_X);

    assert(forbidden.directionality < 1.04);
    assert(forbidden.verticalCurtainCoverage < .18);
    assert(forbidden.verticalCurtainSpread < .14);
  });
});
