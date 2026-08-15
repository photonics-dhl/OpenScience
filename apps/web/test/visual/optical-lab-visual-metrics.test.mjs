import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as referenceMetrics from './optical-lab-reference-metrics.mjs';
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

function createFiveRegionFixture() {
  return createImage((x, y) => {
    const glyph = x >= .025 && x < .545 && Math.abs(y - .515) <= .115;
    const glyphCounter = glyph
      && ((x > .105 && x < .145) || (x > .275 && x < .315))
      && Math.abs(y - .515) < .045;
    const upstream = x >= .48 && x < APERTURE_X;
    const particleHash = (Math.floor(x * 240) * 31 + Math.floor(y * 135) * 17) % 43;
    const dissolution = upstream && Math.abs(y - .515) <= .22 && particleHash <= 7;
    const curtainEnvelope = Math.abs(x - APERTURE_X) <= .095 && y >= .035 && y <= .965;
    const curtainDensity = .16 + .24 * (1 - Math.min(1, Math.abs(y - .515) / .515));
    const curtain = curtainEnvelope && particleHash / 43 < curtainDensity;
    const caustic = Math.abs(x - APERTURE_X) <= .025 && Math.abs(y - .515) <= .34;
    const downstream = x > APERTURE_X && x <= .94;
    const raySlope = Math.abs(y - .515) / Math.max(.001, x - APERTURE_X);
    const ray = downstream && (raySlope < .24 || (raySlope > .58 && raySlope < .68) || (raySlope > 1.05 && raySlope < 1.16));
    if (caustic) return 1;
    if (ray) return .62 * (1 - (x - APERTURE_X) / .5);
    if (curtain) return .38 + .38 * (1 - Math.abs(y - .515) / .515);
    if (dissolution) return .7;
    if (glyph && !glyphCounter) return upstream ? .48 : .88;
    return 0;
  });
}

function createMsdfOnlyFixture() {
  return createImage((x, y) => (
    x >= .025 && x <= .957 && Math.abs(y - .515) <= .115 ? .88 : 0
  ));
}

function createRingFixture() {
  return createImage((x, y) => {
    const radius = Math.hypot(x - APERTURE_X, y - .515);
    return Math.abs(radius - .19) <= .015 ? .9 : 0;
  });
}

function createSymmetricFanFixture() {
  return createImage((x, y) => {
    const dx = x - APERTURE_X;
    const dy = y - .515;
    const fan = Math.abs(dy - dx * 1.15) <= .014 || Math.abs(dy + dx * 1.15) <= .014;
    return fan ? .82 : 0;
  });
}

function createMechanicalLineFixture() {
  return createImage((x) => (Math.abs(x - APERTURE_X) <= .004 ? .92 : 0));
}

function createStaircaseCausticFixture() {
  return createImage((x, y) => {
    const causticBand = Math.abs(x - APERTURE_X) <= .025;
    const horizontalStep = Math.floor(y * 135) % 8 <= 2;
    return causticBand && horizontalStep ? .96 : 0;
  });
}

function createCurvedFilamentFixture() {
  return createImage((x, y) => {
    const vertical = y - .515;
    const filamentCenter = APERTURE_X + Math.sign(vertical) * vertical * vertical * .055;
    const sparse = Math.floor((y + .03) * 135) % 17 > 3;
    return sparse && Math.abs(x - filamentCenter) <= .003 ? .96 : 0;
  });
}

function createUniformDotCurtainFixture() {
  return createImage((x, y) => {
    const column = Math.round(x * 240);
    const row = Math.round(y * 135);
    const inCurtain = Math.abs(x - APERTURE_X) <= .09;
    return inCurtain && column % 8 <= 1 && row % 8 <= 1 ? .7 : 0;
  });
}

function createDuplicateTitleFixture() {
  return createImage((x, y) => {
    const title = x >= .025 && x <= .957;
    return title && (Math.abs(y - .42) <= .055 || Math.abs(y - .64) <= .055) ? .82 : 0;
  });
}

function createLensEnergyFixture() {
  return createImage((x, y) => {
    const vertical = y - .515;
    const coreHalfWidth = .006 + Math.abs(vertical) * .018;
    const core = Math.abs(x - APERTURE_X) <= coreHalfWidth
      && Math.abs(vertical) <= .42;
    const curtainProgress = Math.max(0, Math.min(1, (Math.abs(vertical) - .16) / .3));
    const curtainDistance = .024 + Math.pow(curtainProgress, 1.35) * .085;
    const curtainCenter = APERTURE_X + Math.sign(vertical) * curtainDistance;
    const curtain = Math.abs(x - curtainCenter) <= .004
      && Math.abs(vertical) >= .16
      && Math.abs(vertical) <= .46;
    const downstream = x - APERTURE_X;
    const filament = downstream > .015 && downstream < .36
      && [-1.2, -1.1, -.9, .9, 1.1, 1.2].some((slope) => (
        Math.abs(vertical - downstream * slope) <= .003
      ));
    if (core) return 1;
    if (curtain) return .72;
    return filament ? .58 : 0;
  });
}

function createBarsAndHazeFixture() {
  return createImage((x, y) => {
    const vertical = y - .515;
    const bars = [-.026, -.013, 0, .013, .026].some((offset) => (
      Math.abs(x - (APERTURE_X + offset)) <= .004
    )) && Math.abs(vertical) <= .38;
    const downstream = x - APERTURE_X;
    const haze = downstream > .02 && downstream < .38 && Math.abs(vertical) < .42;
    if (bars) return .94;
    return haze ? .18 * (1 - downstream / .42) : 0;
  });
}

function createBrightTitleOnlyFixture() {
  return createImage((x, y) => (
    x >= .62 && x <= .92 && y >= .39 && y <= .61 ? .95 : 0
  ));
}

function createVerticalBlindsFixture() {
  return createImage((x, y) => (
    x > APERTURE_X + .12
      && x < APERTURE_X + .37
      && y > .08
      && y < .92
      && Math.abs((x * 80) % 1 - .5) < .12
      ? .82
      : 0
  ));
}

function createDenseVerticalBlindsFixture() {
  return createImage((x, y) => (
    x > APERTURE_X + .12
      && x < APERTURE_X + .37
      && y > .08
      && y < .92
      && Math.floor(x * 240) % 3 !== 0
      ? .82
      : 0
  ));
}

function createFloatingRadialSegmentsFixture() {
  return createImage((x, y) => {
    const downstream = x - APERTURE_X;
    const vertical = y - .515;
    return downstream >= .12
      && downstream < .37
      && [-1.2, -.96, -.72, .72, .96, 1.2].some((slope) => (
        Math.abs(vertical - downstream * slope) <= .003
      ))
      ? .82
      : 0;
  });
}

function createDottedBridgeRadialSegmentsFixture() {
  return createImage((x, y) => {
    const downstream = x - APERTURE_X;
    const vertical = y - .515;
    const onRay = [-1.2, -.96, -.72, .72, .96, 1.2].some((slope) => (
      Math.abs(vertical - downstream * slope) <= .003
    ));
    const farSegment = downstream >= .12 && downstream < .37;
    const isolatedBridge = Math.abs(downstream - .05) <= .003
      || Math.abs(downstream - .1) <= .003;
    return onRay && (farSegment || isolatedBridge) ? .82 : 0;
  });
}

function createSinglePixelBridgeSegmentsFixture() {
  const width = 1672;
  const height = 941;
  const pixels = new Uint8Array(width * height * 4);
  const slopes = [-1.2, -.96, -.72, .72, .96, 1.2];
  const setPixel = (x, y) => {
    const pixelX = Math.round(x * (width - 1));
    const pixelY = Math.round(y * (height - 1));
    if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) return;
    const index = (pixelY * width + pixelX) * 4;
    pixels[index] = 209;
    pixels[index + 1] = 209;
    pixels[index + 2] = 209;
    pixels[index + 3] = 255;
  };

  for (const slope of slopes) {
    for (let pixelX = Math.round((APERTURE_X + .12) * width); pixelX < (APERTURE_X + .37) * width; pixelX += 1) {
      const x = pixelX / (width - 1);
      setPixel(x, .515 + (x - APERTURE_X) * slope);
    }
    for (let sample = 0; sample < 10; sample += 1) {
      const downstream = .05 + sample * .005;
      setPixel(APERTURE_X + downstream, .515 + downstream * slope);
    }
  }
  return { height, pixels, width };
}

function createSparseDotFieldFixture() {
  return createImage((x, y) => {
    if (x <= APERTURE_X + .12 || x >= APERTURE_X + .37 || y <= .08 || y >= .92) return 0;
    const column = Math.floor(x * 92);
    const row = Math.floor(y * 92);
    return (column * 7 + row * 11) % 13 === 0 ? .82 : 0;
  });
}

describe('Optical Lab energy-composition morphology', () => {
  it('distinguishes coherent outer-band filaments from broad haze without counting title ink', () => {
    assert.equal(
      typeof referenceMetrics.measureEnergyComposition,
      'function',
      'the iteration requires a dedicated energy-composition metric path',
    );
    const lens = referenceMetrics.measureEnergyComposition(createLensEnergyFixture(), APERTURE_X);
    const bars = referenceMetrics.measureEnergyComposition(createBarsAndHazeFixture(), APERTURE_X);
    const titleOnly = referenceMetrics.measureEnergyComposition(createBrightTitleOnlyFixture(), APERTURE_X);
    const titleOnlyMaterial = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createBrightTitleOnlyFixture(),
      target: createBrightTitleOnlyFixture(),
    });

    assert(lens.filamentEnergyRatio > .52, JSON.stringify(lens));
    assert(lens.broadHazeRatio < .32, JSON.stringify(lens));
    assert(
      bars.filamentEnergyRatio <= .52
        && bars.broadHazeRatio >= .32,
      JSON.stringify(bars),
    );
    assert.deepEqual(titleOnly, { broadHazeRatio: 0, filamentEnergyRatio: 0 });
    assert.equal(titleOnlyMaterial.leftwardEmissionRatio, 0);
    assert.equal(titleOnlyMaterial.rightwardEnergyRatio, 0);
  });

  it('accepts aperture-origin rays and rejects directionless blinds and sparse points', () => {
    assert.equal(typeof referenceMetrics.measureRadialCoherence, 'function');
    const radial = referenceMetrics.measureRadialCoherence(createLensEnergyFixture(), APERTURE_X);
    const blinds = referenceMetrics.measureRadialCoherence(createVerticalBlindsFixture(), APERTURE_X);
    const denseBlinds = referenceMetrics.measureRadialCoherence(
      createDenseVerticalBlindsFixture(),
      APERTURE_X,
    );
    const dots = referenceMetrics.measureRadialCoherence(createSparseDotFieldFixture(), APERTURE_X);
    const floatingSegments = referenceMetrics.measureRadialCoherence(
      createFloatingRadialSegmentsFixture(),
      APERTURE_X,
    );
    const dottedBridgeSegments = referenceMetrics.measureRadialCoherence(
      createDottedBridgeRadialSegmentsFixture(),
      APERTURE_X,
    );
    const singlePixelBridgeSegments = referenceMetrics.measureRadialCoherence(
      createSinglePixelBridgeSegmentsFixture(),
      APERTURE_X,
    );
    const titleOnly = referenceMetrics.measureRadialCoherence(createBrightTitleOnlyFixture(), APERTURE_X);

    assert(radial.radialCoherence >= .035, JSON.stringify(radial));
    assert(radial.coherentRadialEnergy >= .009, JSON.stringify(radial));
    assert(blinds.radialCoherence < .05, JSON.stringify(blinds));
    assert(denseBlinds.radialCoherence < .05, JSON.stringify(denseBlinds));
    assert(dots.radialCoherence < .05, JSON.stringify(dots));
    assert(floatingSegments.radialCoherence < .035, JSON.stringify(floatingSegments));
    assert(dottedBridgeSegments.radialCoherence < .035, JSON.stringify(dottedBridgeSegments));
    assert(singlePixelBridgeSegments.radialCoherence < .035, JSON.stringify(singlePixelBridgeSegments));
    assert.deepEqual(titleOnly, {
      absoluteRadialEnergy: 0,
      coherentRadialEnergy: 0,
      radialCoherence: 0,
    });
  });
});

describe('Optical Lab five-region resting-material metrics', () => {
  it('accepts a complete reference-like field at the literal Task 5 thresholds', () => {
    assert.equal(
      typeof referenceMetrics.measureRestingMaterial,
      'function',
      'Task 5 requires a dedicated five-region native-frame metric path',
    );
    const target = createFiveRegionFixture();
    const candidate = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: target,
      target,
    });

    assert(candidate.intactGlyphContinuity >= .88);
    assert(candidate.dissolutionTransfer >= .55);
    assert(candidate.curtainCoverage >= candidate.targetCurtainCoverage * .75);
    assert(
      candidate.causticWidth >= .04 && candidate.causticWidth <= .06,
      `reference-like caustic width drifted: ${JSON.stringify(candidate)}`,
    );
    assert(candidate.causticCenterError <= .005);
    assert(candidate.rightwardEnergyRatio >= 1.25);
    assert(candidate.leftwardEmissionRatio <= .12);
    assert(candidate.maskedStructuralSimilarity >= .62);
  });

  it('keeps the current MSDF-only frame RED for missing resting material', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const target = createFiveRegionFixture();
    const candidate = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createMsdfOnlyFixture(),
      target,
    });

    assert(
      candidate.dissolutionTransfer < .55
        || candidate.curtainCoverage < candidate.targetCurtainCoverage * .75
        || candidate.causticWidth < .04
        || candidate.rightwardEnergyRatio < 1.25
        || candidate.maskedStructuralSimilarity < .62,
      'MSDF-only ink must not satisfy the complete resting-material contract',
    );
  });

  it('rejects a radial ring independently of directional energy', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const measured = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createRingFixture(),
      target: createFiveRegionFixture(),
    });
    assert(measured.forbiddenRingScore >= .72);
  });

  it('rejects a symmetric fan independently of a bright seam', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const measured = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createSymmetricFanFixture(),
      target: createFiveRegionFixture(),
    });
    assert(measured.forbiddenSymmetricFanScore >= .42);
  });

  it('rejects a mechanical full-height divider', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const measured = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createMechanicalLineFixture(),
      target: createFiveRegionFixture(),
    });
    assert(measured.forbiddenMechanicalLineScore >= .42);
  });

  it('rejects a staircase caustic while accepting sparse curved filaments', () => {
    const staircase = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createStaircaseCausticFixture(),
      target: createFiveRegionFixture(),
    });
    const filaments = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createCurvedFilamentFixture(),
      target: createFiveRegionFixture(),
    });

    assert(staircase.forbiddenStaircaseCausticScore >= .12);
    assert(filaments.forbiddenStaircaseCausticScore < .12);
  });

  it('rejects a uniform-dot curtain without luminance or spacing hierarchy', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const measured = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createUniformDotCurtainFixture(),
      target: createFiveRegionFixture(),
    });
    assert(measured.forbiddenUniformDotScore >= .42);
  });

  it('rejects duplicate title ink even when both silhouettes are continuous', () => {
    assert.equal(typeof referenceMetrics.measureRestingMaterial, 'function');
    const measured = referenceMetrics.measureRestingMaterial({
      apertureX: APERTURE_X,
      candidate: createDuplicateTitleFixture(),
      target: createFiveRegionFixture(),
    });
    assert(measured.forbiddenDuplicateTitleScore >= .42);
  });
});

function createTypographyMask({ bottom, left, right, top }, width = 100, height = 50) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if ((x + y) % 7 !== 0) mask[y * width + x] = 1;
    }
  }
  return { height, mask, width };
}

const FONT_LIKE_GLYPHS = Object.freeze({
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '....#'],
  S: ['#####', '#....', '#....', '#####', '....#', '....#', '#####'],
  c: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  e: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  n: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  o: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  s: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  v: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
});

function paintFontLikeWord(mask, text, bounds) {
  const advances = [...text].map((glyph, index) => {
    if (index === text.length - 1) return 5;
    const pair = glyph.charCodeAt(0) + text.charCodeAt(index + 1);
    return 6 + (pair % 2);
  });
  const totalAdvance = advances.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  for (let glyphIndex = 0; glyphIndex < text.length; glyphIndex += 1) {
    const glyph = FONT_LIKE_GLYPHS[text[glyphIndex]];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '#') continue;
        const left = Math.floor(bounds.left + ((cursor + column) / totalAdvance) * (bounds.right - bounds.left));
        const right = Math.ceil(bounds.left + ((cursor + column + 1) / totalAdvance) * (bounds.right - bounds.left));
        const top = Math.floor(bounds.top + (row / 7) * (bounds.bottom - bounds.top));
        const bottom = Math.ceil(bounds.top + ((row + 1) / 7) * (bounds.bottom - bounds.top));
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) mask.mask[y * mask.width + x] = 1;
        }
      }
    }
    cursor += advances[glyphIndex];
  }
}

function createFontLikeTitle(scienceText, evolvesText) {
  const mask = { height: 180, mask: new Uint8Array(600 * 180), width: 600 };
  paintFontLikeWord(mask, scienceText, { bottom: 150, left: 20, right: 365, top: 30 });
  paintFontLikeWord(mask, evolvesText, { bottom: 150, left: 365, right: 580, top: 30 });
  return mask;
}

describe('Optical Lab MSDF typography metrics', () => {
  it('measures reference-relative bounds, continuity, and DOM edge overlap', () => {
    assert.equal(
      typeof referenceMetrics.measureMsdfTypography,
      'function',
      'Task 4 requires a dedicated MSDF typography metric path',
    );
    const domMask = createTypographyMask({ bottom: 30, left: 2, right: 96, top: 18 });
    const msdfMask = createTypographyMask({ bottom: 30, left: 2, right: 96, top: 18 });

    const measured = referenceMetrics.measureMsdfTypography({
      baselineY: 27.1,
      domMask,
      evolves: { bottom: 30, left: 58, right: 96, top: 18 },
      msdfMask,
      science: { bottom: 30, left: 2, right: 58, top: 18 },
      seamX: 58,
      title: { bottom: 30, left: 2, right: 96, top: 18 },
      viewport: { height: 50, width: 100 },
    });

    assert.equal(measured.oneLine, true);
    assert.equal(measured.title.left, .02);
    assert.equal(measured.title.right, .96);
    assert.equal(measured.baseline, .542);
    assert.equal(measured.seamX, .58);
    assert(measured.occupiedColumnContinuity >= .98);
    assert(measured.edgeOverlapWithDom >= .9);
  });

  it('rejects a discontinuous mask that only shares the DOM bounding box', () => {
    assert.equal(typeof referenceMetrics.measureMsdfTypography, 'function');
    const domMask = createTypographyMask({ bottom: 30, left: 2, right: 96, top: 18 });
    const msdfMask = createTypographyMask({ bottom: 30, left: 2, right: 96, top: 18 });
    for (let y = 0; y < msdfMask.height; y += 1) {
      for (let x = 42; x < 58; x += 1) msdfMask.mask[y * msdfMask.width + x] = 0;
    }

    const measured = referenceMetrics.measureMsdfTypography({
      baselineY: 27.1,
      domMask,
      evolves: { bottom: 30, left: 58, right: 96, top: 18 },
      msdfMask,
      science: { bottom: 30, left: 2, right: 58, top: 18 },
      seamX: 58,
      title: { bottom: 30, left: 2, right: 96, top: 18 },
      viewport: { height: 50, width: 100 },
    });

    assert(measured.occupiedColumnContinuity < .9);
    assert(measured.edgeOverlapWithDom < 1, 'internal holes must reduce tolerant shape overlap');
    assert.equal(measured.edgeBoundsOverlapWithDom, 1, 'matching outer edges are measured independently from internal holes');
  });

  it('rejects realistic reordered glyphs with the same bounds and comparable stroke density', () => {
    assert.equal(typeof referenceMetrics.measureMsdfTypography, 'function');
    const domMask = createFontLikeTitle('Science', 'evolves.');
    const msdfMask = createFontLikeTitle('Secnice', 'nnclisc.');
    const measured = referenceMetrics.measureMsdfTypography({
      baselineY: 140,
      domMask,
      evolves: { bottom: 150, left: 365, right: 580, top: 30 },
      msdfMask,
      science: { bottom: 150, left: 20, right: 365, top: 30 },
      seamX: 365,
      title: { bottom: 150, left: 20, right: 580, top: 30 },
      viewport: { height: 180, width: 600 },
    });

    assert.equal(measured.edgeBoundsOverlapWithDom, 1);
    assert(measured.occupiedColumnContinuity >= .7);
    assert(measured.inkDensityRatio >= .85 && measured.inkDensityRatio <= 1.15);
    assert(measured.scienceInkDensityRatio >= .85 && measured.scienceInkDensityRatio <= 1.15);
    assert(measured.evolvesInkDensityRatio >= .85 && measured.evolvesInkDensityRatio <= 1.15);
    assert(measured.edgeOverlapWithDom < .9);
    assert(measured.scienceEdgeOverlapWithDom < .9);
    assert(measured.evolvesEdgeOverlapWithDom < .9);
  });
});
