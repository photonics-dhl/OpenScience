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
