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
