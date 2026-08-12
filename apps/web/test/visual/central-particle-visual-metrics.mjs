function assertMask(mask, width, height, name) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError(`${name} must be a Uint8Array matching width * height.`);
  }
}

export function measureContinuousTitle({ candidateMask, idealMask, seamMaxX, seamMinX, width, height }) {
  assertMask(candidateMask, width, height, 'candidateMask');
  assertMask(idealMask, width, height, 'idealMask');
  let candidateInterior = 0;
  let idealInterior = 0;
  let idealColumns = 0;
  let occupiedColumns = 0;
  for (let x = 0; x < width; x += 1) {
    if (x >= seamMinX && x <= seamMaxX) continue;
    let idealColumn = false;
    let occupiedColumn = false;
    for (let y = 1; y < height - 1; y += 1) {
      const index = y * width + x;
      if (!idealMask[index]) continue;
      idealColumn = true;
      if (candidateMask[index]) occupiedColumn = true;
      const interior = idealMask[index - 1] && idealMask[index + 1]
        && idealMask[index - width] && idealMask[index + width];
      if (!interior) continue;
      idealInterior += 1;
      if (candidateMask[index]) candidateInterior += 1;
    }
    if (idealColumn) idealColumns += 1;
    if (idealColumn && occupiedColumn) occupiedColumns += 1;
  }
  const interiorCoverage = candidateInterior / Math.max(1, idealInterior);
  return {
    interiorCoverage,
    interiorHoleRatio: 1 - interiorCoverage,
    occupiedColumnContinuity: occupiedColumns / Math.max(1, idealColumns),
  };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function spread(points) {
  if (points.length === 0) return 0;
  return Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
}

export function measureOpticalFieldTopology({ center, curtainPoints, fieldSamples, viewport }) {
  const waist = curtainPoints.filter(({ y }) => Math.abs(y - center.y) <= viewport.height * 0.05);
  const outer = curtainPoints.filter(({ y }) => Math.abs(y - center.y) >= viewport.height * 0.35);
  const waistWeight = waist.reduce((sum, { opacity }) => sum + opacity, 0);
  const waistCenter = waist.reduce((sum, { opacity, x }) => sum + x * opacity, 0)
    / Math.max(0.0001, waistWeight);
  const centerError = Math.abs(waistCenter - center.x) / viewport.width;
  const bins = 20;
  const occupiedBins = new Set(curtainPoints.map(({ y }) => Math.min(
    bins - 1,
    Math.max(0, Math.floor(y / viewport.height * bins)),
  ))).size;
  const outerSpread = spread(outer);
  const waistSpread = spread(waist);
  const opacities = curtainPoints.map(({ opacity }) => opacity);
  const opacityMean = mean(opacities);
  const opacityVariance = mean(opacities.map((opacity) => (opacity - opacityMean) ** 2));
  const rowGroups = new Map();
  for (const point of curtainPoints) {
    const row = rowGroups.get(point.row) ?? [];
    row.push(point.y);
    rowGroups.set(point.row, row);
  }
  const rowCoherence = Array.from(rowGroups.values()).map((values) => {
    const rowMean = mean(values);
    const deviation = Math.sqrt(mean(values.map((value) => (value - rowMean) ** 2)));
    return 1 - Math.min(1, deviation / (viewport.height * 0.015));
  });
  let positiveEnergy = 0;
  let negativeEnergy = 0;
  let signedCross = 0;
  let absoluteCross = 0;
  for (const sample of fieldSamples) {
    const displacement = {
      x: sample.position.x - sample.home.x,
      y: sample.position.y - sample.home.y,
    };
    if (displacement.x >= 0) positiveEnergy += displacement.x * sample.energy;
    else negativeEnergy += -displacement.x * sample.energy;
    const radial = { x: sample.home.x - center.x, y: sample.home.y - center.y };
    const cross = radial.x * displacement.y - radial.y * displacement.x;
    signedCross += cross;
    absoluteCross += Math.abs(cross);
  }
  const radii = curtainPoints.map(({ x, y }) => Math.hypot(x - center.x, y - center.y));
  const radiusMean = mean(radii);
  const radiusDeviation = Math.sqrt(mean(radii.map((radius) => (radius - radiusMean) ** 2)));
  return {
    centerError,
    curtainCoverage: occupiedBins / bins,
    gridCoherence: mean(rowCoherence),
    opacityVariance,
    outerSpreadRatio: outerSpread / viewport.width,
    rightwardEnergyRatio: positiveEnergy / Math.max(0.0001, negativeEnergy),
    ringScore: 1 - Math.min(1, radiusDeviation / Math.max(0.0001, radiusMean * 0.35)),
    tangentialDirectionality: Math.abs(signedCross) / Math.max(0.0001, absoluteCross),
    waistRatio: waistSpread / Math.max(0.0001, outerSpread),
  };
}

export function measureRenderedCurtain({ centerX, height, mask, titleMaxY, titleMinY, width }) {
  assertMask(mask, width, height, 'mask');
  const bandMinX = Math.max(0, Math.floor(centerX - width * 0.16));
  const bandMaxX = Math.min(width - 1, Math.ceil(centerX + width * 0.16));
  const bins = 32;
  const occupiedBins = new Set();
  const occupiedColumns = new Set();
  let centralPixels = 0;
  let totalPixels = 0;
  for (let y = 0; y < height; y += 1) {
    if (y >= titleMinY && y <= titleMaxY) continue;
    for (let x = bandMinX; x <= bandMaxX; x += 1) {
      if (!mask[y * width + x]) continue;
      totalPixels += 1;
      if (Math.abs(x - centerX) <= 3) centralPixels += 1;
      occupiedColumns.add(x);
      occupiedBins.add(Math.min(bins - 1, Math.floor(y / height * bins)));
    }
  }
  const excludedBins = Math.ceil((titleMaxY - titleMinY) / height * bins);
  return {
    coverage: occupiedBins.size / Math.max(1, bins - excludedBins),
    mechanicalLineScore: centralPixels / Math.max(1, totalPixels),
    spread: occupiedColumns.size / width,
  };
}

export function measureRenderedField({ candidateMask, centerX, height, idealMask, titleMaxY, titleMinY, width }) {
  assertMask(candidateMask, width, height, 'candidateMask');
  assertMask(idealMask, width, height, 'idealMask');
  const minX = Math.max(0, Math.floor(centerX - width * 0.14));
  const maxX = Math.min(width - 1, Math.ceil(centerX + width * 0.14));
  let left = 0;
  let right = 0;
  for (let y = titleMinY; y <= titleMaxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (!candidateMask[index] || idealMask[index] || Math.abs(x - centerX) <= 3) continue;
      if (x > centerX) right += 1;
      else left += 1;
    }
  }
  return {
    extraPixels: left + right,
    leftPixels: left,
    rightPixels: right,
    rightwardEnergyRatio: right / Math.max(1, left),
  };
}
