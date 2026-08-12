import type { ParticleTier } from './particle-grid';

type GlyphParticleGrid = {
  count: number;
  groups: Uint8Array;
  homes: Float32Array;
  ids: Uint32Array;
  viewport: { height: number; width: number };
};

export type CurtainPoint = {
  column: number;
  id: number;
  opacity: number;
  phase: number;
  row: number;
  x: number;
  y: number;
};

const TIER_CONFIG = {
  high: { columns: 15, rowStep: 10 },
  low: { columns: 9, rowStep: 20 },
  medium: { columns: 11, rowStep: 14 },
} as const;

const rounded = (value: number) => Number(value.toFixed(6));

export function createCurtainGrid(
  viewport: { height: number; width: number },
  tier: ParticleTier,
) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const center = { x: width * 0.573, y: height * 0.5 };
  const { columns, rowStep } = TIER_CONFIG[tier];
  const startY = height * 0.04;
  const endY = height * 0.96;
  const rows = Math.floor((endY - startY) / rowStep) + 1;
  const points: CurtainPoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = rows === 1 ? center.y : startY + row / (rows - 1) * (endY - startY);
    const vertical = (y - center.y) / (height * 0.5);
    const envelope = 12 + Math.pow(Math.abs(vertical), 1.35) * width * 0.105;
    for (let column = 0; column < columns; column += 1) {
      const horizontal = column / (columns - 1) * 2 - 1;
      const phase = ((row * 17 + column * 13) % 97) / 97;
      const curve = Math.sign(vertical) * (1 - Math.abs(horizontal)) * width * 0.012;
      const taper = 0.55 + 0.45 * Math.abs(vertical);
      const modulation = 0.25 + 0.75 * ((row * 3 + column * 5) % 11) / 10;
      points.push({
        column,
        id: row * columns + column,
        opacity: rounded((0.24 + modulation * 0.62) * taper),
        phase: rounded(phase),
        row,
        x: rounded(center.x + horizontal * envelope + curve),
        y: rounded(y),
      });
    }
  }
  return { center, columns, points, rows, viewport: { height, width } };
}

export function createFieldParticleAttributes(
  glyphs: GlyphParticleGrid,
  curtain: ReturnType<typeof createCurtainGrid>,
) {
  const count = glyphs.count + curtain.points.length;
  const groups = new Uint8Array(count);
  const homes = new Float32Array(count * 2);
  const ids = new Float32Array(count);
  const opacities = Array<number>(count);
  const phases = new Float32Array(count);
  const roles = new Uint8Array(count);
  homes.set(glyphs.homes);
  groups.set(glyphs.groups);
  for (let index = 0; index < glyphs.count; index += 1) {
    ids[index] = glyphs.ids[index];
    opacities[index] = 1;
    phases[index] = (glyphs.ids[index] * 0.61803398875) % 1;
  }
  curtain.points.forEach((point, curtainIndex) => {
    const index = glyphs.count + curtainIndex;
    homes[index * 2] = point.x;
    homes[index * 2 + 1] = point.y;
    groups[index] = point.x < curtain.center.x ? 0 : 1;
    ids[index] = 1_000_000 + point.id;
    opacities[index] = point.opacity;
    phases[index] = point.phase;
    roles[index] = 1;
  });
  return {
    count,
    groups,
    homes,
    ids,
    opacities,
    phases,
    roles,
    viewport: { ...glyphs.viewport },
  };
}
