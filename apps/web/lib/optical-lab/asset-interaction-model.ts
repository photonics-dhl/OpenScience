export const ASSET_INTERACTION_LIMITS = Object.freeze({
  apertureX: .58 as const,
  causticGain: .14,
  localRefractionPx: 8,
  localRadiusUv: .20,
  patchFollowPx: 4,
  recoveryMs: 900,
  responseMs: 120,
});

const ASSET_POINTER_VELOCITY_SENSITIVITY = .75;

export interface AssetInteractionInput {
  pointerX: number;
  pointerY: number;
  velocityX: number;
  velocityY: number;
}

export interface AssetInteractionState {
  injectedAt: number | null;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
}

export interface AssetInteractionSample {
  active: boolean;
  causticGain: number;
  follow: number;
  localRadiusUv: number;
  patchFollowPx: number;
  pointerX: number;
  pointerY: number;
  refractionPx: { x: number; y: number };
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function mapAssetPointerVelocity(deltaX: number, deltaY: number, elapsedMs: number) {
  const sensitivity = ASSET_POINTER_VELOCITY_SENSITIVITY / Math.max(1, elapsedMs);
  return {
    velocityX: deltaX * sensitivity,
    velocityY: deltaY * sensitivity,
  };
}

function normalizeVelocity(x: number, y: number) {
  const magnitude = Math.hypot(x, y);
  if (magnitude === 0) return { x: 0, y: 0 };
  const scale = Math.min(1, magnitude) / magnitude;
  return { x: x * scale, y: y * scale };
}

function sampleVelocity(state: AssetInteractionState, now: number) {
  if (state.injectedAt === null) return { active: false, x: 0, y: 0 };
  const age = Math.max(0, now - state.injectedAt);
  if (age >= ASSET_INTERACTION_LIMITS.recoveryMs) {
    return { active: false, x: 0, y: 0 };
  }
  if (age <= ASSET_INTERACTION_LIMITS.responseMs) {
    const progress = smoothstep(age / ASSET_INTERACTION_LIMITS.responseMs);
    return {
      active: true,
      x: state.startX + (state.targetX - state.startX) * progress,
      y: state.startY + (state.targetY - state.startY) * progress,
    };
  }
  const decayDuration = ASSET_INTERACTION_LIMITS.recoveryMs - ASSET_INTERACTION_LIMITS.responseMs;
  const decay = 1 - smoothstep((age - ASSET_INTERACTION_LIMITS.responseMs) / decayDuration);
  return {
    active: true,
    x: state.targetX * decay,
    y: state.targetY * decay,
  };
}

export function createAssetInteractionState(_now = 0): AssetInteractionState {
  return {
    injectedAt: null,
    pointerX: .5,
    pointerY: .5,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,
  };
}

export function injectAssetInteraction(
  state: AssetInteractionState,
  input: AssetInteractionInput,
  now: number,
): AssetInteractionState {
  const current = sampleVelocity(state, now);
  const target = normalizeVelocity(input.velocityX, input.velocityY);
  return {
    injectedAt: now,
    pointerX: clamp(input.pointerX, 0, 1),
    pointerY: clamp(input.pointerY, 0, 1),
    startX: current.x,
    startY: current.y,
    targetX: target.x,
    targetY: target.y,
  };
}

export function stepAssetInteraction(
  state: AssetInteractionState,
  now: number,
): AssetInteractionSample {
  const velocity = sampleVelocity(state, now);
  const follow = velocity.active ? Math.min(1, Math.hypot(velocity.x, velocity.y)) : 0;
  return {
    active: velocity.active,
    causticGain: follow * ASSET_INTERACTION_LIMITS.causticGain,
    follow,
    localRadiusUv: velocity.active ? ASSET_INTERACTION_LIMITS.localRadiusUv : 0,
    patchFollowPx: velocity.active
      ? clamp(
          velocity.x * ASSET_INTERACTION_LIMITS.patchFollowPx,
          -ASSET_INTERACTION_LIMITS.patchFollowPx,
          ASSET_INTERACTION_LIMITS.patchFollowPx,
        )
      : 0,
    pointerY: state.pointerY,
    pointerX: state.pointerX,
    refractionPx: velocity.active
      ? {
          x: velocity.x * ASSET_INTERACTION_LIMITS.localRefractionPx,
          y: velocity.y * ASSET_INTERACTION_LIMITS.localRefractionPx,
        }
      : { x: 0, y: 0 },
  };
}
