import { existsSync, readFileSync } from 'node:fs';
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
const rendererSource = existsSync(fileURLToPath(rendererUrl))
  ? readFileSync(fileURLToPath(rendererUrl), 'utf8')
  : '';
const nativeGateUrl = new URL('./visual/optical-lab-asset-interaction-gate.mjs', import.meta.url);
const nativeGateSource = readFileSync(fileURLToPath(nativeGateUrl), 'utf8');
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
const overlayShaderUrl = new URL('../lib/optical-lab/ogl/shaders/asset-overlay.ts', import.meta.url);
const overlayShader = existsSync(fileURLToPath(overlayShaderUrl))
  ? await import('../lib/optical-lab/ogl/shaders/asset-overlay')
  : null;

describe('Optical Lab accepted asset interaction envelope', () => {
  it('maps a perceptible bounded pointer velocity from a 24ms pointer delta', () => {
    const mapVelocity = model?.mapAssetPointerVelocity;

    expect(mapVelocity).toBeTypeOf('function');
    if (!mapVelocity) return;

    const velocity = mapVelocity(18, 0, 24);

    expect(velocity.velocityX).toBeCloseTo(.75, 5);
    expect(velocity.velocityY).toBe(0);
    expect(Math.hypot(velocity.velocityX, velocity.velocityY)).toBeGreaterThanOrEqual(.5);
  });

  it('keeps an ordinary slow traverse visible while preserving stronger fast movement', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const mapVelocity = model?.mapAssetPointerVelocity;
    const step = model?.stepAssetInteraction;

    expect(createState && inject && mapVelocity && step).toBeTruthy();
    if (!createState || !inject || !mapVelocity || !step) return;

    const slowVelocity = mapVelocity(12, 0, 1_000);
    const fastVelocity = mapVelocity(120, 0, 100);
    const slow = step(inject(createState(), {
      pointerX: .42,
      pointerY: .48,
      ...slowVelocity,
    }, 1_000), 1_070);
    const fast = step(inject(createState(), {
      pointerX: .68,
      pointerY: .48,
      ...fastVelocity,
    }, 2_000), 2_070);

    expect(slow.follow).toBeGreaterThanOrEqual(.05);
    expect(fast.follow).toBeGreaterThan(slow.follow);
    expect(fast.follow).toBeLessThanOrEqual(1);
    expect(slow.pointerX).toBe(.42);
    expect(fast.pointerX).toBe(.68);
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
    const sample = step(state, 1_070);

    expect(sample.pointerX).toBe(.25);
    expect(sample.pointerY).toBe(.25);
    expect(Math.hypot(sample.refractionPx.x, sample.refractionPx.y)).toBeCloseTo(10, 5);
    expect(sample.refractionPx.x).toBeCloseTo(6, 5);
    expect(sample.refractionPx.y).toBeCloseTo(8, 5);
  });

  it('reaches the latest velocity monotonically at the exact 70ms response boundary', () => {
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
    const follow = [0, 23, 46, 69, 70].map((elapsed) => step(state, 2_000 + elapsed).follow);

    expect(follow[0]).toBe(0);
    expect(follow).toEqual([...follow].sort((left, right) => left - right));
    expect(follow[3]).toBeLessThan(1);
    expect(follow[4]).toBe(1);
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
    const values = [0, 18, 35, 52, 70]
      .map((elapsed) => step(replaced, 3_060 + elapsed).refractionPx.x);

    expect(values.every((value) => value >= -10 && value <= 10)).toBe(true);
    expect(values.at(-1)).toBeCloseTo(-10, 5);
  });

  it('emits the approved balanced active envelope without exceeding its caps', () => {
    const createState = model?.createAssetInteractionState;
    const inject = model?.injectAssetInteraction;
    const step = model?.stepAssetInteraction;
    expect(createState && inject && step).toBeTruthy();
    if (!createState || !inject || !step) return;

    const state = inject(createState(4_000), {
      pointerX: -1,
      pointerY: 2,
      velocityX: 500,
      velocityY: 0,
    }, 4_000);
    const sample = step(state, 4_070);

    expect(sample.patchFollowPx).toBe(5);
    expect(Math.hypot(sample.refractionPx.x, sample.refractionPx.y)).toBeCloseTo(10, 5);
    expect(sample.causticGain).toBeCloseTo(.18, 5);
    expect(sample.localRadiusUv).toBe(.20);
    expect(sample.pointerX).toBe(0);
    expect(sample.pointerY).toBe(1);
  });

  it('responds at literal full-surface pointer locations and reaches exact visual zero at 700ms', () => {
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
    const left = step(leftState, 1_070);
    const right = step(rightState, 2_070);
    const recovering = [70, 200, 400, 600, 700]
      .map((elapsed) => step(leftState, 1_000 + elapsed));
    const follow = recovering.map((sample) => sample.follow);

    expect(left.pointerX).toBe(.12);
    expect(right.pointerX).toBe(.88);
    expect(left.localRadiusUv).toBe(.20);
    expect(step(leftState, 1_699).active).toBe(true);
    expect(step(leftState, 1_700).active).toBe(false);
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
    expect(shader).toContain('localPersistence = step(0.0001, previousLocal)');
    expect(shader).toContain('previous * 0.985 * localPersistence');
    expect(shader).toContain('backtraceUv');
    expect(shader).toContain('texture(tPrevious, backtraceUv)');
    expect(shader).toContain('min(uLocalStrength');
    expect(shader).toContain('min(0.05, ambientMagnitude)');
    expect(shader).toContain('min(uRadius, 0.14)');
    expect(shader).not.toContain('APERTURE_X');
    expect(shader).not.toContain('uPointerY');
    expect(shader).toContain('tPrevious');
    expect(shader).toContain('previousSample.w * 2.0 - 1.0');
    expect(shader).toContain('carrier * 0.5 + 0.5');
    expect(shader).not.toContain('localMemory, 1.0');
  });

  it('composites a smooth full-surface response with authored layer weights and caps', () => {
    const shader = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('emptyWeight');
    expect(shader).toContain('typeWeight');
    expect(shader).toContain('energyWeight');
    expect(shader).toContain('0.22');
    expect(shader).toContain('0.62');
    expect(shader).toContain('1.0');
    expect(shader).toContain('min(10.0');
    expect(shader).toContain('min(0.18');
    expect(shader).toContain('float ambientBudget = 6.0');
    expect(shader).toContain('emptyWeight * 0.27');
    expect(shader).toContain('uniform float uPresentationAlpha');
    expect(shader).toContain('mix(0.34, 1.0, localAmount)');
    expect(shader).toContain('mix(interactionReplacement, 1.0, uPresentationAlpha)');
    expect(rendererSource).toContain('uPresentationAlpha: { value: isLandingPresentation ? 1 : 0 }');
    expect(rendererSource).toContain("stage.dataset.acceptedOpticalSurface === 'landing'");
    expect(shader).toContain('smoothstep');
    expect(shader).not.toContain('abs(vUv.x - 0.58)');
  });

  it('routes the approved patch follow into local rendered displacement under the total cap', () => {
    const shader = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(rendererSource).toContain('uPatchFollowPx: { value: 0 }');
    expect(rendererSource).toContain('program.uniforms.uPatchFollowPx.value');
    expect(shader).toContain('uniform float uPatchFollowPx');
    expect(shader).toContain('clamp(uPatchFollowPx, -5.0, 5.0)');
    expect(shader).toContain('localAmount * layerWeight');
    expect(shader).toContain('combinedLength > 10.0');
    expect(shader).toContain('combinedPx *= 10.0 / combinedLength');
    expect(nativeGateSource).toContain('combinedPx *= 14.0 / combinedLength');
    expect(nativeGateSource).toContain('capRegistration.best.shift');
  });

  it('keeps the stronger idle field separate from the accepted local envelope', () => {
    const shader = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(rendererSource).toContain('ambientPhase: lastAmbientPhase');
    expect(shader).toContain('float ambientBudget = 6.0');
    expect(flowShader?.OPTICAL_ASSET_FLOW_FRAGMENT_SHADER ?? '').toContain('min(0.05, ambientMagnitude)');
    expect(rendererSource).toContain('const visuallyActive = lastSample.active');
    expect(rendererSource).toContain('if (visuallyActive)');
  });

  it('builds idle water from multiple non-linear scales and flow-derived grazing light', () => {
    const flow = flowShader?.OPTICAL_ASSET_FLOW_FRAGMENT_SHADER ?? '';
    const composite = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(flow).toContain('ambientLarge');
    expect(flow).toContain('ambientMedium');
    expect(flow).toContain('ambientFine');
    expect(flow).toContain('phase * 0.37');
    expect(flow).toContain('phase * 0.83');
    expect(composite).toContain('dFdx(flow)');
    expect(composite).toContain('dFdy(flow)');
    expect(composite).toContain('grazingLight');
    expect(composite).toContain('(0.08 + 0.92 * causticCrest)');
    expect(composite).toContain('vec3(0.76, 0.86, 0.90)');
    expect(composite).toContain('vec3(0.92, 0.84, 0.76)');
    expect(composite).toContain('uniform float uAmbientPhase');
    expect(rendererSource).toContain('uAmbientPhase: { value: 0 }');
    expect(rendererSource).toContain('program.uniforms.uAmbientPhase.value = ambientClock.shaderTime');
  });

  it('adds Landing-only caustic breathing and sparse glyph-edge shimmer that yield to local input', () => {
    const composite = compositeShader?.OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(composite).toContain('float presentationIdle = uPresentationAlpha * (1.0 - localAmount)');
    expect(composite).toContain('float centreBreath');
    expect(composite).toContain('float glyphEdge');
    expect(composite).toContain('float glyphShimmer');
    expect(composite).toContain('curvatureCrest * centreField');
    expect(composite).toContain('glyphEdge * edgeCrest');
    expect(composite).toContain('* presentationIdle');
  });

  it('keeps the rendered ambient clock continuous across its readable seven-second presentation cycle', () => {
    const sampleAmbientClock = interactionRenderer?.sampleAssetAmbientClock;

    expect(sampleAmbientClock).toBeTypeOf('function');
    if (!sampleAmbientClock) return;

    const beforeBoundary = sampleAmbientClock(6_999);
    const afterBoundary = sampleAmbientClock(7_001);

    expect(beforeBoundary.cycle).toBeCloseTo(.999857, 5);
    expect(afterBoundary.cycle).toBeCloseTo(.000143, 5);
    expect(afterBoundary.shaderTime - beforeBoundary.shaderTime).toBeCloseTo(.000286, 5);
    expect(afterBoundary.shaderTime).toBeGreaterThan(1);
  });

  it('pauses only the ambient clock during local interaction and resumes it without a jump', () => {
    expect(rendererSource).toContain('let ambientPausedAt: number | null = null');
    expect(rendererSource).toContain('let ambientPausedMs = 0');
    expect(rendererSource).toContain('ambientPausedMs += now - ambientPausedAt');
    expect(rendererSource).toContain('const phaseClock = ambientPausedAt ?? now');
    expect(nativeGateSource).toContain('snapshot?.ambientPhase');
  });

  it('keeps the approved visible-centroid and locality contract mutation-resistant', () => {
    expect(nativeGateSource).toContain('const overlayCentroidLimit = .04');
    expect(nativeGateSource).toContain('const visibleCentroidLimit = .08');
    expect(nativeGateSource).toContain('const localityFloor = .80');
    expect(nativeGateSource).toContain('const spatialSamplePhases = [0, .25, .5, .75]');
    expect(nativeGateSource).toContain('OPTICAL_LAB_ASSET_FIXED_CENTER_MUTATION');
    expect(nativeGateSource).toContain('vec2 localDelta = vec2(vUv.x - 0.5, (vUv.y - 0.5)');
    expect(nativeGateSource).toContain('fixed-centre mutation must fail the visible response contract');
    expect(nativeGateSource).toContain('OPTICAL_LAB_ASSET_OVERLAY_MASK_PROOF');
    expect(nativeGateSource).toContain('OPTICAL_LAB_ASSET_OVERLAY_SKIP_DRAW_MUTATION');
    expect(nativeGateSource).toContain('measureAlphaSpatialResponse');
    expect(nativeGateSource).not.toContain('overlayAlpha / 0.16');
  });

  it('draws a bounded transparent overlay after the authored composite', () => {
    const shader = overlayShader?.OPTICAL_ASSET_OVERLAY_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('uniform sampler2D tFlow');
    expect(shader).toContain('flowSample.a * 2.0 - 1.0');
    expect(flowShader?.OPTICAL_ASSET_FLOW_FRAGMENT_SHADER ?? '').toContain('float shapedCarrierWave');
    expect(shader).toContain('abs(carrier) * 0.16');
    expect(shader).not.toContain('abs(carrier) * localAmount');
    expect(shader).toContain('min(0.16');
    expect(shader).toContain('coolTint');
    expect(shader).toContain('warmTint');
    expect(shader).toContain('vec3(0.08, 0.24, 0.32)');
    expect(shader).toContain('vec3(0.36, 0.16, 0.08)');
    expect(rendererSource).toContain('OPTICAL_ASSET_OVERLAY_FRAGMENT_SHADER');
    expect(rendererSource).toContain('overlayProgram');
    expect(rendererSource).toContain('scene: overlayMesh');
    expect(rendererSource).toContain('clear: false');
    expect(rendererSource).toContain('if (visuallyActive)');
    expect(rendererSource).toContain('const visuallyActive = lastSample.active');
    expect(rendererSource).not.toContain('ASSET_VISUAL_RECOVERY_FLOOR');
  });

});
