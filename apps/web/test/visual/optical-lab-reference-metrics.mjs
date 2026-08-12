export function measureTypography({ baselineY, evolves, science, title, viewport }) {
  const normalizeX = (value) => value / viewport.width;
  const normalizeY = (value) => value / viewport.height;

  return {
    apertureX: normalizeX(science.right),
    baseline: normalizeY(baselineY),
    evolves: {
      left: normalizeX(evolves.left),
      right: normalizeX(evolves.right),
      width: normalizeX(evolves.right - evolves.left),
    },
    oneLine: Math.abs(science.right - evolves.left) <= 1,
    science: {
      left: normalizeX(science.left),
      right: normalizeX(science.right),
      width: normalizeX(science.right - science.left),
    },
    title: {
      bottom: normalizeY(title.bottom),
      left: normalizeX(title.left),
      right: normalizeX(title.right),
      top: normalizeY(title.top),
    },
  };
}

function normalizeBounds(bounds, viewport) {
  return {
    bottom: bounds.bottom / viewport.height,
    left: bounds.left / viewport.width,
    right: bounds.right / viewport.width,
    top: bounds.top / viewport.height,
  };
}

function maskBounds({ height, mask, width }) {
  let bottom = 0;
  let left = width;
  let right = 0;
  let top = height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      bottom = Math.max(bottom, y + 1);
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
    }
  }
  return right > left && bottom > top ? { bottom, left, right, top } : null;
}

function boundsOverlap(left, right) {
  if (left.width !== right.width || left.height !== right.height) return 0;
  const leftEdges = maskBounds(left);
  const rightEdges = maskBounds(right);
  if (!leftEdges || !rightEdges) return 0;
  const intersectionWidth = Math.max(0, Math.min(leftEdges.right, rightEdges.right) - Math.max(leftEdges.left, rightEdges.left));
  const intersectionHeight = Math.max(0, Math.min(leftEdges.bottom, rightEdges.bottom) - Math.max(leftEdges.top, rightEdges.top));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (leftEdges.right - leftEdges.left) * (leftEdges.bottom - leftEdges.top);
  const rightArea = (rightEdges.right - rightEdges.left) * (rightEdges.bottom - rightEdges.top);
  return intersection / Math.max(1, leftArea + rightArea - intersection);
}

function tolerantMaskOverlap(left, right, { maxX = left.width, minX = 0, radius = 5 } = {}) {
  if (left.width !== right.width || left.height !== right.height) return 0;
  const coverage = (source, target) => {
    let matched = 0;
    let sourceInk = 0;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        if (!source.mask[y * source.width + x]) continue;
        sourceInk += 1;
        let found = false;
        for (let offsetY = -radius; offsetY <= radius && !found; offsetY += 1) {
          const targetY = y + offsetY;
          if (targetY < 0 || targetY >= target.height) continue;
          const horizontalRadius = Math.floor(Math.sqrt(radius * radius - offsetY * offsetY));
          for (let offsetX = -horizontalRadius; offsetX <= horizontalRadius; offsetX += 1) {
            const targetX = x + offsetX;
            if (targetX < minX || targetX >= maxX) continue;
            if (target.mask[targetY * target.width + targetX]) {
              found = true;
              break;
            }
          }
        }
        if (found) matched += 1;
      }
    }
    return matched / Math.max(1, sourceInk);
  };
  return Math.min(coverage(left, right), coverage(right, left));
}

function occupiedColumnContinuity({ height, mask, width }) {
  const occupied = [];
  for (let x = 0; x < width; x += 1) {
    let hasInk = false;
    for (let y = 0; y < height; y += 1) {
      if (mask[y * width + x]) {
        hasInk = true;
        break;
      }
    }
    if (hasInk) occupied.push(x);
  }
  if (occupied.length === 0) return 0;
  const span = occupied.at(-1) - occupied[0] + 1;
  return occupied.length / span;
}

function maskInk(mask, { maxX = mask.width, minX = 0 } = {}) {
  let ink = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = minX; x < maxX; x += 1) ink += mask.mask[y * mask.width + x] ? 1 : 0;
  }
  return ink;
}

function inkDensityRatio(candidate, reference, range) {
  return maskInk(candidate, range) / Math.max(1, maskInk(reference, range));
}

export function measureMsdfTypography({
  baselineY,
  domMask,
  evolves,
  msdfMask,
  science,
  seamX,
  title,
  viewport,
}) {
  const seamColumn = Math.round(seamX);
  return {
    baseline: baselineY / viewport.height,
    edgeBoundsOverlapWithDom: boundsOverlap(msdfMask, domMask),
    edgeOverlapWithDom: tolerantMaskOverlap(msdfMask, domMask),
    evolvesInkDensityRatio: inkDensityRatio(msdfMask, domMask, {
      maxX: msdfMask.width,
      minX: seamColumn,
    }),
    evolves: normalizeBounds(evolves, viewport),
    evolvesEdgeOverlapWithDom: tolerantMaskOverlap(msdfMask, domMask, {
      maxX: msdfMask.width,
      minX: seamColumn,
    }),
    inkDensityRatio: inkDensityRatio(msdfMask, domMask),
    occupiedColumnContinuity: occupiedColumnContinuity(msdfMask),
    oneLine: Math.abs(science.right - evolves.left) <= 1
      && science.top < evolves.bottom
      && evolves.top < science.bottom,
    science: normalizeBounds(science, viewport),
    scienceInkDensityRatio: inkDensityRatio(msdfMask, domMask, {
      maxX: seamColumn,
      minX: 0,
    }),
    scienceEdgeOverlapWithDom: tolerantMaskOverlap(msdfMask, domMask, {
      maxX: seamColumn,
      minX: 0,
    }),
    seamX: seamX / viewport.width,
    title: normalizeBounds(title, viewport),
  };
}

function luminance(image, x, y) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return 0;
  const index = (y * image.width + x) * 4;
  return (
    image.pixels[index] * .2126
    + image.pixels[index + 1] * .7152
    + image.pixels[index + 2] * .0722
  ) / 255;
}

function pixelBounds(image, left, right, top, bottom) {
  return {
    bottom: Math.min(image.height, Math.ceil(bottom * image.height)),
    left: Math.max(0, Math.floor(left * image.width)),
    right: Math.min(image.width, Math.ceil(right * image.width)),
    top: Math.max(0, Math.floor(top * image.height)),
  };
}

function regionEnergy(image, left, right, top, bottom) {
  const bounds = pixelBounds(image, left, right, top, bottom);
  let energy = 0;
  let samples = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      energy += luminance(image, x, y);
      samples += 1;
    }
  }
  return energy / Math.max(1, samples);
}

function outerBandEnergy(image, left, right) {
  return (
    regionEnergy(image, left, right, .04, .34)
    + regionEnergy(image, left, right, .69, .96)
  ) * .5;
}

function occupiedColumnRatio(image, left, right, top, bottom, threshold) {
  const bounds = pixelBounds(image, left, right, top, bottom);
  let occupied = 0;
  for (let x = bounds.left; x < bounds.right; x += 1) {
    let found = false;
    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      if (luminance(image, x, y) >= threshold) {
        found = true;
        break;
      }
    }
    if (found) occupied += 1;
  }
  return occupied / Math.max(1, bounds.right - bounds.left);
}

function curtainCoverage(image, apertureX) {
  const bounds = pixelBounds(image, apertureX - .1, apertureX + .1, .035, .965);
  let occupied = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    let clusters = 0;
    let inCluster = false;
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const bright = luminance(image, x, y) >= .14;
      if (bright && !inCluster) clusters += 1;
      inCluster = bright;
    }
    if (clusters >= 2) occupied += 1;
  }
  return occupied / Math.max(1, bounds.bottom - bounds.top);
}

function causticGeometry(image, apertureX) {
  const bounds = pixelBounds(image, apertureX - .08, apertureX + .08, .18, .82);
  const energies = [];
  for (let x = bounds.left; x < bounds.right; x += 1) {
    let energy = 0;
    for (const [top, bottom] of [[.18, .34], [.69, .82]]) {
      const band = pixelBounds(image, 0, 1, top, bottom);
      for (let y = band.top; y < band.bottom; y += 1) energy = Math.max(energy, luminance(image, x, y));
    }
    energies.push({ energy, x });
  }
  const peak = Math.max(...energies.map(({ energy }) => energy), 0);
  const selected = energies.filter(({ energy }) => energy >= Math.max(.92, peak * .92));
  if (selected.length === 0) return { centerError: 1, width: 0 };
  const left = selected[0].x / image.width;
  const right = (selected.at(-1).x + 1) / image.width;
  return { centerError: Math.abs((left + right) * .5 - apertureX), width: right - left };
}

function cosineSimilarity(candidate, target) {
  const columns = 48;
  const rows = 27;
  let candidateNorm = 0;
  let dot = 0;
  let targetNorm = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidateValue = regionEnergy(
        candidate,
        column / columns,
        (column + 1) / columns,
        row / rows,
        (row + 1) / rows,
      );
      const targetValue = regionEnergy(
        target,
        column / columns,
        (column + 1) / columns,
        row / rows,
        (row + 1) / rows,
      );
      dot += candidateValue * targetValue;
      candidateNorm += candidateValue * candidateValue;
      targetNorm += targetValue * targetValue;
    }
  }
  return dot / Math.max(.000001, Math.sqrt(candidateNorm * targetNorm));
}

function ringScore(image, apertureX) {
  let best = 0;
  for (let radius = .07; radius <= .3; radius += .01) {
    let bright = 0;
    const samples = 72;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = sample / samples * Math.PI * 2;
      const x = Math.round((apertureX + Math.cos(angle) * radius) * image.width);
      const y = Math.round((.515 + Math.sin(angle) * radius) * image.height);
      if (luminance(image, x, y) >= .5) bright += 1;
    }
    best = Math.max(best, bright / samples);
  }
  return best;
}

function symmetricFanScore(image, apertureX) {
  const coverage = (xDirection, yDirection) => {
    let bright = 0;
    const samples = 44;
    for (let index = 1; index <= samples; index += 1) {
      const distance = index / samples * .34;
      const x = Math.round((apertureX + xDirection * distance) * image.width);
      const y = Math.round((.515 + yDirection * distance * 1.15) * image.height);
      if (luminance(image, x, y) >= .42) bright += 1;
    }
    return bright / samples;
  };
  return Math.min(coverage(-1, -1), coverage(-1, 1), coverage(1, -1), coverage(1, 1));
}

function mechanicalLineScore(image, apertureX) {
  const x = Math.round(apertureX * image.width);
  const bands = [[.01, .16], [.86, .99]];
  let bright = 0;
  let samples = 0;
  for (const [top, bottom] of bands) {
    const bounds = pixelBounds(image, 0, 1, top, bottom);
    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      samples += 1;
      if (luminance(image, x, y) >= .5) bright += 1;
    }
  }
  return bright / Math.max(1, samples);
}

function staircaseCausticScore(image, apertureX) {
  const bounds = pixelBounds(image, apertureX - .025, apertureX + .025, .15, .85);
  let wideBrightRows = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    let bright = 0;
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (luminance(image, x, y) >= .8) bright += 1;
    }
    if (bright / Math.max(1, bounds.right - bounds.left) >= .65) wideBrightRows += 1;
  }
  return wideBrightRows / Math.max(1, bounds.bottom - bounds.top);
}

function uniformDotScore(image, apertureX) {
  const bounds = pixelBounds(image, apertureX - .1, apertureX + .1, .035, .965);
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const start = y * image.width + x;
      if (visited[start] || luminance(image, x, y) < .2) continue;
      const queue = [[x, y]];
      visited[start] = 1;
      let area = 0;
      let energy = 0;
      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop();
        area += 1;
        energy += luminance(image, currentX, currentY);
        for (const [nextX, nextY] of [[currentX - 1, currentY], [currentX + 1, currentY], [currentX, currentY - 1], [currentX, currentY + 1]]) {
          if (nextX < bounds.left || nextX >= bounds.right || nextY < bounds.top || nextY >= bounds.bottom) continue;
          const next = nextY * image.width + nextX;
          if (visited[next] || luminance(image, nextX, nextY) < .2) continue;
          visited[next] = 1;
          queue.push([nextX, nextY]);
        }
      }
      if (area <= 16) components.push({ area, luminance: energy / area });
    }
  }
  if (components.length < 6) return 0;
  const coefficient = (values) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / Math.max(.0001, mean);
  };
  const variability = coefficient(components.map(({ area }) => area))
    + coefficient(components.map(({ luminance: value }) => value));
  return Math.max(0, 1 - variability * 2.4);
}

function duplicateTitleScore(image) {
  const bounds = pixelBounds(image, .025, .957, .22, .78);
  const rows = [];
  let peak = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    let energy = 0;
    for (let x = bounds.left; x < bounds.right; x += 1) energy += luminance(image, x, y);
    energy /= Math.max(1, bounds.right - bounds.left);
    rows.push(energy);
    peak = Math.max(peak, energy);
  }
  const bands = [];
  let currentPeak = 0;
  for (const energy of rows) {
    if (energy >= Math.max(.12, peak * .55)) currentPeak = Math.max(currentPeak, energy);
    else if (currentPeak > 0) {
      bands.push(currentPeak);
      currentPeak = 0;
    }
  }
  if (currentPeak > 0) bands.push(currentPeak);
  bands.sort((left, right) => right - left);
  return bands.length < 2 ? 0 : bands[1] / Math.max(.0001, bands[0]);
}

export function measureRestingMaterial({ apertureX, candidate, target }) {
  const caustic = causticGeometry(candidate, apertureX);
  const leftEmission = outerBandEnergy(candidate, apertureX - .38, apertureX - .12);
  const rightEmission = outerBandEnergy(candidate, apertureX + .08, Math.min(.98, apertureX + .38));
  const candidateCurtainCoverage = curtainCoverage(candidate, apertureX);
  return {
    causticCenterError: caustic.centerError,
    causticWidth: caustic.width,
    curtainCoverage: candidateCurtainCoverage,
    dissolutionTransfer: (
      occupiedColumnRatio(candidate, apertureX - .1, apertureX, .27, .39, .18)
      + occupiedColumnRatio(candidate, apertureX - .1, apertureX, .64, .73, .18)
    ) * .5,
    forbiddenDuplicateTitleScore: duplicateTitleScore(candidate),
    forbiddenMechanicalLineScore: mechanicalLineScore(candidate, apertureX),
    forbiddenStaircaseCausticScore: staircaseCausticScore(candidate, apertureX),
    forbiddenRingScore: ringScore(candidate, apertureX),
    forbiddenSymmetricFanScore: symmetricFanScore(candidate, apertureX),
    forbiddenUniformDotScore: uniformDotScore(candidate, apertureX),
    intactGlyphContinuity: occupiedColumnRatio(candidate, .025, apertureX - .075, .35, .66, .24),
    leftwardEmissionRatio: leftEmission / Math.max(.0001, leftEmission + rightEmission),
    maskedStructuralSimilarity: cosineSimilarity(candidate, target),
    rightwardEnergyRatio: rightEmission / Math.max(.0001, leftEmission),
    targetCurtainCoverage: curtainCoverage(target, apertureX),
  };
}

function connectedComponents(image, bounds, threshold) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const start = y * image.width + x;
      if (visited[start] || luminance(image, x, y) < threshold) continue;
      const queue = [[x, y]];
      const pixels = [];
      visited[start] = 1;
      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop();
        pixels.push([currentX, currentY]);
        for (const [nextX, nextY] of [
          [currentX - 1, currentY], [currentX + 1, currentY],
          [currentX, currentY - 1], [currentX, currentY + 1],
        ]) {
          if (nextX < bounds.left || nextX >= bounds.right || nextY < bounds.top || nextY >= bounds.bottom) continue;
          const next = nextY * image.width + nextX;
          if (visited[next] || luminance(image, nextX, nextY) < threshold) continue;
          visited[next] = 1;
          queue.push([nextX, nextY]);
        }
      }
      if (pixels.length >= 20) components.push(pixels);
    }
  }
  return components;
}

function componentBounds(pixels) {
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs) + 1;
  const top = Math.min(...ys);
  const bottom = Math.max(...ys) + 1;
  return { bottom, height: bottom - top, left, right, top, width: right - left };
}

function componentSlant(pixels, bounds) {
  const rows = [];
  const start = Math.ceil(bounds.top + bounds.height * .18);
  const end = Math.floor(bounds.top + bounds.height * .78);
  for (let y = start; y <= end; y += 1) {
    const xs = pixels.filter(([, pixelY]) => pixelY === y).map(([x]) => x).sort((left, right) => left - right);
    if (xs.length > 0) rows.push([y, xs[Math.floor(xs.length * .5)]]);
  }
  if (rows.length < 4) return 0;
  const count = rows.length;
  const sumY = rows.reduce((sum, [y]) => sum + y, 0);
  const sumX = rows.reduce((sum, [, x]) => sum + x, 0);
  const sumYY = rows.reduce((sum, [y]) => sum + y * y, 0);
  const sumYX = rows.reduce((sum, [y, x]) => sum + y * x, 0);
  const slope = (count * sumYX - sumY * sumX) / Math.max(.0001, count * sumYY - sumY * sumY);
  return Math.atan(Math.abs(slope)) * 180 / Math.PI;
}

export function measureEditorialSuffix(image) {
  const suffixBounds = pixelBounds(image, .638, .985, .32, .62);
  const suffixComponents = connectedComponents(image, suffixBounds, .62);
  const suffixPixels = suffixComponents.flat();
  const bounds = suffixPixels.length > 0
    ? componentBounds(suffixPixels)
    : { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
  const slantBounds = pixelBounds(image, .72, .84, .32, .62);
  const slantComponent = connectedComponents(image, slantBounds, .62)
    .map((pixels) => ({ bounds: componentBounds(pixels), pixels }))
    .sort((left, right) => right.bounds.height - left.bounds.height)[0];
  return {
    bounds: {
      bottom: bounds.bottom / image.height,
      height: bounds.height / image.height,
      left: bounds.left / image.width,
      right: bounds.right / image.width,
      top: bounds.top / image.height,
      width: bounds.width / image.width,
    },
    inkDensity: suffixPixels.length / Math.max(1, bounds.width * bounds.height),
    slantDegrees: slantComponent ? componentSlant(slantComponent.pixels, slantComponent.bounds) : 0,
  };
}
