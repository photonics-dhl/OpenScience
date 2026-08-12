import {
  Geometry,
  GPGPU,
  Mesh,
  Program,
  RenderTarget,
  Triangle,
  type OGLRenderingContext,
  type Texture,
} from 'ogl';

import type { OpticalLayout } from '../layout';
import { OPTICAL_QUALITY_BUDGETS, type OpticalQualityTier } from '../runtime-policy';
import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';
import {
  OPTICAL_PARTICLE_FRAGMENT_SHADER,
  OPTICAL_PARTICLE_VERTEX_SHADER,
} from './shaders/particle-render';
import { OPTICAL_PARTICLE_UPDATE_FRAGMENT_SHADER } from './shaders/particle-update';

export interface OpticalParticlePass {
  dispose(): void;
  particleCount: number;
  precision: 'rgba16f' | 'rgba8';
  render(flowTexture?: Texture | null, follow?: number): boolean;
  resourceCounts(): OpticalOglResourceCounts;
  setQualityTier(tier: OpticalQualityTier): void;
  texture: Texture;
}

const PARTICLE_COUNT = 65_536;
const RESTING_SEED = 0x51c1e5;

function createSeedState() {
  let state = RESTING_SEED >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const data = new Float32Array(PARTICLE_COUNT * 4);
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const offset = index * 4;
    data[offset] = .36 + random() * .22;
    data[offset + 1] = .285 + random() * .43;
    data[offset + 2] = random();
    data[offset + 3] = random();
  }
  return data;
}

function supportsHalfFloatTarget(gl: OGLRenderingContext) {
  const webgl2 = gl as WebGL2RenderingContext;
  if (!gl.getExtension('EXT_color_buffer_float')) return false;
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    if (texture) gl.deleteTexture(texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    return false;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, webgl2.RGBA16F, 2, 2, 0, gl.RGBA, webgl2.HALF_FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(texture);
  return supported;
}

function assertCompleteTarget(gl: OGLRenderingContext, target: RenderTarget, label: string) {
  gl.bindFramebuffer(target.target, target.buffer);
  const status = gl.checkFramebufferStatus(target.target);
  gl.bindFramebuffer(target.target, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Optical Lab ${label} framebuffer is incomplete: ${status}`);
  }
}

export function createParticlePass(
  gl: OGLRenderingContext,
  layout: OpticalLayout,
  glyphMask: Texture,
): OpticalParticlePass {
  const webgl2 = gl as WebGL2RenderingContext;
  const ledger = createOpticalOglResourceLedger(gl as WebGL2RenderingContext);
  let disposed = false;
  let stateInitialized = false;
  let activeParticleCount = PARTICLE_COUNT;

  try {
    const simulationGeometry = new Triangle(gl);
    const simulation = new GPGPU(gl, {
      data: createSeedState(),
      geometry: simulationGeometry,
      type: webgl2.HALF_FLOAT,
    });
    ledger.trackGeometry(simulationGeometry);
    ledger.trackTexture(simulation.uniform.value);
    ledger.trackRenderTarget(simulation.fbo.read);
    ledger.trackRenderTarget(simulation.fbo.write);
    assertCompleteTarget(gl, simulation.fbo.read, 'particle-state-read');
    assertCompleteTarget(gl, simulation.fbo.write, 'particle-state-write');
    const updatePass = simulation.addPass({
      fragment: OPTICAL_PARTICLE_UPDATE_FRAGMENT_SHADER,
      uniforms: { tGlyphMask: { value: glyphMask } },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    ledger.trackProgram(updatePass.program);

    const particleGeometry = new Geometry(gl, {
      particleUv: { data: simulation.coords, size: 2 },
    });
    const particleProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        tState: simulation.uniform,
        tFlow: { value: simulation.uniform.value },
        uFollow: { value: 0 },
        uDpr: { value: Math.min(devicePixelRatio, 2) },
        uStateSize: { value: simulation.size },
      },
      vertex: OPTICAL_PARTICLE_VERTEX_SHADER,
    });
    particleProgram.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const particleMesh = new Mesh(gl, {
      geometry: particleGeometry,
      mode: gl.POINTS,
      program: particleProgram,
    });
    ledger.trackGeometry(particleGeometry);
    ledger.trackProgram(particleProgram);

    const highPrecision = supportsHalfFloatTarget(gl);
    const particleTarget = new RenderTarget(gl, {
      depth: false,
      format: gl.RGBA,
      height: Math.max(1, Math.round(layout.viewport.height * Math.min(devicePixelRatio, 2))),
      internalFormat: highPrecision ? webgl2.RGBA16F : gl.RGBA8,
      magFilter: gl.LINEAR,
      minFilter: gl.LINEAR,
      stencil: false,
      type: highPrecision ? webgl2.HALF_FLOAT : gl.UNSIGNED_BYTE,
      width: Math.max(1, Math.round(layout.viewport.width * Math.min(devicePixelRatio, 2))),
    });
    ledger.trackRenderTarget(particleTarget);
    assertCompleteTarget(gl, particleTarget, 'particle-color');

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        ledger.dispose();
      },
      get particleCount() { return activeParticleCount; },
      precision: highPrecision ? 'rgba16f' : 'rgba8',
      render(flowTexture = null, follow = 0) {
        if (disposed) return false;
        if (!stateInitialized) {
          simulation.render();
          stateInitialized = true;
        }
        gl.clearColor(0, 0, 0, 0);
        particleProgram.uniforms.tFlow.value = flowTexture ?? simulation.uniform.value;
        particleProgram.uniforms.uFollow.value = flowTexture ? follow : 0;
        gl.renderer.render({
          clear: true,
          frustumCull: false,
          scene: particleMesh,
          sort: false,
          target: particleTarget,
        });
        ledger.counts();
        return gl.getError() === gl.NO_ERROR;
      },
      resourceCounts: () => ledger.counts(),
      setQualityTier(tier) {
        const ratio = tier === 'full' ? 1 : OPTICAL_QUALITY_BUDGETS.reducedParticleRatio;
        activeParticleCount = Math.floor(PARTICLE_COUNT * ratio);
        particleGeometry.setDrawRange(0, activeParticleCount);
      },
      texture: particleTarget.texture,
    };
  } catch (error) {
    ledger.dispose();
    throw error;
  }
}
