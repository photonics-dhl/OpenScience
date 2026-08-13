import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssetInteractionInput } from '../lib/optical-lab/asset-interaction-model';

// @ts-expect-error pointerX is mandatory for every full-surface local injection.
const missingPointerX: AssetInteractionInput = {
  pointerY: .5,
  velocityX: 0,
  velocityY: 0,
};
void missingPointerX;

const modelUrl = new URL('../lib/optical-lab/asset-interaction-model.ts', import.meta.url);
const model = existsSync(fileURLToPath(modelUrl))
  ? await import('../lib/optical-lab/asset-interaction-model')
  : null;
const rendererUrl = new URL('../lib/optical-lab/ogl/asset-interaction-renderer.ts', import.meta.url);
const interactionRenderer = existsSync(fileURLToPath(rendererUrl))
  ? await import('../lib/optical-lab/ogl/asset-interaction-renderer')
  : null;
const flowShaderUrl = new URL('../lib/optical-lab/ogl/shaders/asset-flow.ts', import.meta.url);
const flowShader = existsSync(fileURLToPath(flowShaderUrl))
  ? await import('../lib/optical-lab/ogl/shaders/asset-flow')
  : null;
const compositeShaderUrl = new URL('../lib/optical-lab/ogl/shaders/asset-composite.ts', import.meta.url);
const compositeShader = existsSync(fileURLToPath(compositeShaderUrl))
  ? await import('../lib/optical-lab/ogl/shaders/asset-composite')
  : null;

describe('Optical Lab accepted asset interaction envelope', () => {
  it('maps a perceptible bounded pointer velocity from a 24ms pointer delta', () => {
    const mapVelocity = model?.mapAssetPointerVelocity;

    expect(mapVelocity).toBeTypeOf('function');
    if (!mapVelocity) return;

    const velocity = mapVelocity(18, 0, 24);

    expect(velocity.velocityX).toBeCloseTo(.5625, 5);
    expect(velocity.velocityY).toBe(0);
    expect(Math.hypot(velocity.velocityX, velocity.velocityY)).toBeGreaterThanOrEqual(.5);
  });

  it('normalizes diagonal velocity while preserving the local pointer coordinates', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;

    expect(createState).toBeTypeOf('function');
    expect(inject).toBeTypeOf('function');
    expect(step).toBeTypeOf('function');
    if (!createState || !inject || !step) return;

    const state = inject(createState(1_000), {
      pointerX: .25,
      pointerY: .25,
      velocityX: 3,
      velocityY: 4,
    }, 1_000);
    const sample = step(state, 1_120);

    expect(sample.pointerX).toBe(.25);
    expect(sample.pointerY).toBe(.25);
    expect(Math.hypot(sample.refractionPx.x, sample.refractionPx.y)).toBeCloseTo(4, 5);
    expect(sample.refractionPx.x).toBeCloseTo(2.4, 5);
    expect(sample.refractionPx.y).toBeCloseTo(3.2, 5);
  });

  it('approaches the latest velocity monotonically through the 120ms response window', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;
    expect(createState && inject && step).toBeTruthy();
    if (!createState || !inject || !step) return;

    const state = inject(createState(2_000), {
      pointerX: .5,
      pointerY: .5,
      velocityX: 1,
      velocityY: 0,
    }, 2_000);
    const follow = [0, 40, 80, 120].map((elapsed) => step(state, 2_000 + elapsed).follow);

    expect(follow[0]).toBe(0);
    expect(follow).toEqual([...follow].sort((left, right) => left - right));
    expect(follow[3]).toBe(1);
  });

  it('preserves leftward pointer velocity in the optical field', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;
    expect(createState && inject && step).toBeTruthy();
    if (!createState || !inject || !step) return;

    const positive = inject(createState(3_000), {
      pointerX: .5,
      pointerY: .5,
      velocityX: 1,
      velocityY: 0,
    }, 3_000);
    const replaced = inject(positive, {
      pointerX: .5,
      pointerY: .6,
      velocityX: -1,
      velocityY: 0,
    }, 3_060);
    const values = [0, 30, 60, 90, 120]
      .map((elapsed) => step(replaced, 3_060 + elapsed).refractionPx.x);

    expect(values.every((value) => value >= -4 && value <= 4)).toBe(true);
    expect(values.at(-1)).toBe(-4);
  });

  it('never exceeds the authored follow, refraction and caustic caps', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;
    expect(createState && inject && step).toBeTruthy();
    if (!createState || !inject || !step) return;

    const state = inject(createState(4_000), {
      pointerX: -1,
      pointerY: 2,
      velocityX: 500,
      velocityY: -500,
    }, 4_000);
    const sample = step(state, 4_120);

    expect(Math.abs(sample.patchFollowPx)).toBeLessThanOrEqual(2);
    expect(Math.hypot(sample.refractionPx.x, sample.refractionPx.y)).toBeLessThanOrEqual(4);
    expect(sample.causticGain).toBeLessThanOrEqual(.08);
    expect(sample.pointerX).toBe(0);
    expect(sample.pointerY).toBe(1);
  });

  it('responds at literal full-surface pointer locations and decays to zero at 900ms', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;
    expect(createState && inject && step).toBeTruthy();
    if (!createState || !inject || !step) return;

    const leftState = inject(createState(1_000), {
      pointerX: .12,
      pointerY: .2,
      velocityX: .4,
      velocityY: .1,
    }, 1_000);
    const rightState = inject(createState(2_000), {
      pointerX: .88,
      pointerY: .8,
      velocityX: .4,
      velocityY: .1,
    }, 2_000);
    const left = step(leftState, 1_120);
    const right = step(rightState, 2_120);
    const recovering = [120, 300, 500, 700, 900]
      .map((elapsed) => step(leftState, 1_000 + elapsed));
    const follow = recovering.map((sample) => sample.follow);

    expect(left.pointerX).toBe(.12);
    expect(right.pointerX).toBe(.88);
    expect(left.localRadiusUv).toBeGreaterThanOrEqual(.12);
    expect(left.localRadiusUv).toBeLessThanOrEqual(.16);
    expect(step(leftState, 1_899).active).toBe(true);
    expect(step(leftState, 1_900).active).toBe(false);
    expect(follow.slice(0, -1).every((value) => value > 0)).toBe(true);
    expect(follow[0]).toBeGreaterThan(follow[1]);
    expect(follow[1]).toBeGreaterThan(follow[2]);
    expect(follow[2]).toBeGreaterThan(follow[3]);
    expect(follow[3]).toBeGreaterThan(follow[4]);
    expect(follow[4]).toBe(0);
    expect(recovering.slice(0, -1).every((sample) => sample.active)).toBe(true);
    expect(recovering.at(-1)).toMatchObject({
      active: false,
      causticGain: 0,
      follow: 0,
      localRadiusUv: 0,
      patchFollowPx: 0,
      refractionPx: { x: 0, y: 0 },
    });
  });
});

describe('Optical Lab accepted asset OGL boundary', () => {
  it('exposes a renderer that is separate from the rejected procedural runtime', () => {
    expect(interactionRenderer?.createAssetInteractionRenderer).toBeTypeOf('function');
  });

  it('advects persistent ambient flow and injects around a two-dimensional pointer', () => {
    const shader = flowShader?.OPTICAL_ASSET_FLOW_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('uniform vec2 uPointer');
    expect(shader).toContain('uniform float uAmbientPhase');
    expect(shader).toContain('uniform float uRadius');
    expect(shader).toContain('uniform float uLocalStrength');
    expect(shader).toContain('normalize(uVelocity');
    expect(shader).toContain('length(wakeDistance)');
    expect(shader).toContain('previous * 0.985');
    expect(shader).toContain('backtraceUv');
    expect(shader).toContain('texture(tPrevious, backtraceUv)');
    expect(shader).toContain('min(uLocalStrength');
    expect(shader).toContain('0.035');
    expect(shader).not.toContain('APERTURE_X');
    expect(shader).not.toContain('uPointerY');
    expect(shader).toContain('tPrevious');
  });

  it('composites a smooth full-surface response with authored layer weights and caps', () => {
    const shader = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('emptyWeight');
    expect(shader).toContain('typeWeight');
    expect(shader).toContain('energyWeight');
    expect(shader).toContain('0.22');
    expect(shader).toContain('0.62');
    expect(shader).toContain('1.0');
    expect(shader).toContain('min(4.0');
    expect(shader).toContain('min(0.08');
    expect(shader).toContain('0.7');
    expect(shader).toContain('smoothstep');
    expect(shader).not.toContain('abs(vUv.x - 0.58)');
  });
});
