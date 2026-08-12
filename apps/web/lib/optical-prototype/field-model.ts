import type { OpticalParticleGroup } from './particle-grid';

export const OPTICAL_FIELD_CENTER = Object.freeze({ x: 958.056, y: 467.5 });

type Vector = { x: number; y: number };

type OpticalFieldInput = {
  group: OpticalParticleGroup;
  home: Vector;
  id: number;
  pointer: null | { strength: number; x: number; y: number };
  timeMs: number;
  viewport: { height: number; width: number };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const magnitude = ({ x, y }: Vector) => Math.hypot(x, y);

function stableUnit(id: number) {
  return ((id + 1) * 0.61803398875) % 1;
}

export function sampleOpticalField(input: OpticalFieldInput) {
  const scaleX = input.viewport.width / 1672;
  const scaleY = input.viewport.height / 935;
  const center = { x: OPTICAL_FIELD_CENTER.x * scaleX, y: OPTICAL_FIELD_CENTER.y * scaleY };
  const delta = { x: input.home.x - center.x, y: input.home.y - center.y };
  const distance = Math.max(0.0001, magnitude(delta));
  const direction = { x: delta.x / distance, y: delta.y / distance };
  const transferHalfWidth = input.viewport.width * 0.055;
  const seam = clamp01(1 - Math.abs(delta.x) / transferHalfWidth);
  const energy = seam <= 0 ? 0 : seam * seam;
  const seed = stableUnit(input.id);
  const groupEnergy = input.group === 'science' ? 1 : 0.9;
  const radialMagnitude = energy * groupEnergy * (10 + seed * 8);
  const radialDisplacement = {
    x: -direction.x * radialMagnitude,
    y: -direction.y * radialMagnitude,
  };
  const tangent = { x: -direction.y, y: direction.x };
  const tangentMagnitude = energy * (5 + seed * 4);
  const tangentialDisplacement = {
    x: tangent.x * tangentMagnitude,
    y: tangent.y * tangentMagnitude,
  };
  const pulse = Math.sin(input.timeMs * 0.0007 + seed * Math.PI * 2);
  const emissionDisplacement = {
    x: energy * (20 + seed * 14),
    y: energy * pulse * 2.5,
  };
  const restingDisplacement = {
    x: radialDisplacement.x + tangentialDisplacement.x + emissionDisplacement.x,
    y: radialDisplacement.y + tangentialDisplacement.y + emissionDisplacement.y,
  };
  const restingMagnitude = magnitude(restingDisplacement);
  let pointerDisplacement = { x: 0, y: 0 };
  if (input.pointer && energy > 0) {
    const homeUv = {
      x: input.home.x / input.viewport.width,
      y: input.home.y / input.viewport.height,
    };
    const away = { x: homeUv.x - input.pointer.x, y: homeUv.y - input.pointer.y };
    const awayMagnitude = Math.max(0.0001, magnitude(away));
    const pointerMagnitude = Math.min(
      4,
      restingMagnitude * 0.35,
      clamp01(input.pointer.strength) * 4,
    );
    pointerDisplacement = {
      x: away.x / awayMagnitude * pointerMagnitude,
      y: away.y / awayMagnitude * pointerMagnitude,
    };
  }
  const pointerMagnitude = magnitude(pointerDisplacement);
  return {
    emissionDisplacement,
    energy,
    pointerDisplacement,
    pointerMagnitude,
    position: {
      x: input.home.x + restingDisplacement.x + pointerDisplacement.x,
      y: input.home.y + restingDisplacement.y + pointerDisplacement.y,
    },
    radialDisplacement,
    restingDisplacement,
    restingMagnitude,
    tangentialDisplacement,
  };
}
