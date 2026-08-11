function luminanceAt(image, x, y) {
  const index = (y * image.width + x) * 4;
  return (
    .2126 * image.pixels[index]
    + .7152 * image.pixels[index + 1]
    + .0722 * image.pixels[index + 2]
  ) / 255;
}

function normalizedBounds(image, xMin, xMax, yMin, yMax) {
  return {
    xStart: Math.max(0, Math.floor(xMin * image.width)),
    xEnd: Math.min(image.width, Math.ceil(xMax * image.width)),
    yStart: Math.max(0, Math.floor(yMin * image.height)),
    yEnd: Math.min(image.height, Math.ceil(yMax * image.height)),
  };
}

function meanEnergy(image, xMin, xMax, yMin, yMax) {
  const bounds = normalizedBounds(image, xMin, xMax, yMin, yMax);
  let energy = 0;
  let samples = 0;
  for (let y = bounds.yStart; y < bounds.yEnd; y += 1) {
    for (let x = bounds.xStart; x < bounds.xEnd; x += 1) {
      energy += luminanceAt(image, x, y);
      samples += 1;
    }
  }
  return energy / Math.max(1, samples);
}

function analyzeVerticalCurtain(image, apertureX) {
  const xStart = Math.max(0, Math.floor((apertureX - .12) * image.width));
  const xEnd = Math.min(image.width, Math.ceil((apertureX + .12) * image.width));
  const bands = [[.12, .32], [.68, .88]];
  let occupiedRows = 0;
  let sampledRows = 0;
  let totalSpread = 0;
  for (const [yMin, yMax] of bands) {
    const yStart = Math.max(0, Math.floor(yMin * image.height));
    const yEnd = Math.min(image.height, Math.ceil(yMax * image.height));
    for (let y = yStart; y < yEnd; y += 1) {
      let brightPixels = 0;
      let clusters = 0;
      let firstBright = -1;
      let lastBright = -1;
      let inCluster = false;
      for (let x = xStart; x < xEnd; x += 1) {
        const bright = luminanceAt(image, x, y) >= .1;
        if (bright) {
          brightPixels += 1;
          if (firstBright < 0) firstBright = x;
          lastBright = x;
          if (!inCluster) clusters += 1;
        }
        inCluster = bright;
      }
      sampledRows += 1;
      const spread = firstBright < 0 ? 0 : (lastBright - firstBright + 1) / Math.max(1, xEnd - xStart);
      if (clusters >= 3 && brightPixels >= 4 && spread >= .16) {
        occupiedRows += 1;
        totalSpread += spread;
      }
    }
  }
  return {
    verticalCurtainCoverage: occupiedRows / Math.max(1, sampledRows),
    verticalCurtainSpread: totalSpread / Math.max(1, occupiedRows),
  };
}

export function analyzeOpticalTopology(image, apertureX) {
  const upstream = meanEnergy(image, apertureX - .12, apertureX - .055, .24, .76);
  const waist = meanEnergy(image, apertureX - .018, apertureX + .018, .24, .76);
  const downstream = meanEnergy(image, apertureX + .035, apertureX + .24, .16, .84);
  const upstreamEnvelope = meanEnergy(image, apertureX - .24, apertureX - .04, .12, .32)
    + meanEnergy(image, apertureX - .24, apertureX - .04, .68, .88);
  const downstreamEnvelope = meanEnergy(image, apertureX + .04, apertureX + .24, .12, .32)
    + meanEnergy(image, apertureX + .04, apertureX + .24, .68, .88);
  const titleBand = normalizedBounds(image, apertureX - .24, apertureX + .24, .24, .76);
  let occupiedColumns = 0;
  for (let x = titleBand.xStart; x < titleBand.xEnd; x += 1) {
    let occupied = false;
    for (let y = titleBand.yStart; y < titleBand.yEnd; y += 1) {
      if (luminanceAt(image, x, y) >= .18) {
        occupied = true;
        break;
      }
    }
    if (occupied) occupiedColumns += 1;
  }
  const sampledColumns = Math.max(1, titleBand.xEnd - titleBand.xStart);
  const curtain = analyzeVerticalCurtain(image, apertureX);

  return {
    waistConcentration: waist / Math.max(.0001, upstream),
    downstreamSpread: downstream,
    continuity: occupiedColumns / sampledColumns,
    directionality: downstreamEnvelope / Math.max(.0001, upstreamEnvelope),
    ...curtain,
  };
}
