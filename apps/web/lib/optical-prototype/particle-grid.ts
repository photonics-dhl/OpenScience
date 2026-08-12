export type ParticleTier = 'high' | 'medium' | 'low';

export type OpticalParticleGroup = 'science' | 'evolves' | 'period';

export type OpticalParticleGeometry = {
  points: ReadonlyArray<{
    column: number;
    glyphIndex: number;
    group: OpticalParticleGroup;
    id: number;
    row: number;
    x: number;
    y: number;
  }>;
  viewport: { height: number; width: number };
};

export type ParticleViewportFit = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

type ParticleSize = { height: number; width: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function fitParticleViewport(
  design: ParticleSize,
  viewport: ParticleSize,
): ParticleViewportFit {
  const designWidth = Math.max(1, design.width);
  const designHeight = Math.max(1, design.height);
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const scale = Math.min(viewportWidth / designWidth, viewportHeight / designHeight);
  return {
    offsetX: (viewportWidth - designWidth * scale) / 2,
    offsetY: (viewportHeight - designHeight * scale) / 2,
    scale,
  };
}

export function mapParticlePointer(
  point: { x: number; y: number },
  fit: ParticleViewportFit,
  design: ParticleSize,
) {
  return {
    x: clamp01((point.x - fit.offsetX) / (Math.max(1, design.width) * fit.scale)),
    y: clamp01((point.y - fit.offsetY) / (Math.max(1, design.height) * fit.scale)),
  };
}

const GROUP_CODES: Record<OpticalParticleGroup, number> = {
  evolves: 1,
  period: 2,
  science: 0,
};

const TIER_STRIDES: Record<ParticleTier, number> = {
  high: 1,
  low: 4,
  medium: 2,
};

export function createParticleGrid(geometry: OpticalParticleGeometry, tier: ParticleTier) {
  const stride = TIER_STRIDES[tier];
  const points = geometry.points.filter((point) => point.group === 'period' || point.id % stride === 0);
  const homes = new Float32Array(points.length * 2);
  const ids = new Uint32Array(points.length);
  const groups = new Uint8Array(points.length);
  points.forEach((point, index) => {
    homes[index * 2] = point.x;
    homes[index * 2 + 1] = point.y;
    ids[index] = point.id;
    groups[index] = GROUP_CODES[point.group];
  });
  return {
    count: points.length,
    groups,
    homes,
    ids,
    viewport: { ...geometry.viewport },
  };
}
