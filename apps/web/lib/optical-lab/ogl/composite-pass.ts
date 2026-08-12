import {
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
import {
  OPTICAL_ENERGY_BLUR_FRAGMENT_SHADER,
  OPTICAL_HIGH_ENERGY_FRAGMENT_SHADER,
  OPTICAL_RESTING_COMPOSITE_FRAGMENT_SHADER,
} from './shaders/composite';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';

export const OPTICAL_RESTING_PASS_ENERGIES = Object.freeze({
  caustic: 1.18,
  curtain: .78,
  dissolution: .66,
  intactGlyph: 1,
  rightwardEmission: .7,
});

export interface OpticalCompositePass {
  bloomScale: number;
  causticTexture: Texture;
  dispose(): void;
  passEnergies: typeof OPTICAL_RESTING_PASS_ENERGIES;
  precision: 'rgba16f' | 'rgba8';
  render(causticGain?: number): boolean;
  resourceCounts(): OpticalOglResourceCounts;
}

interface OpticalCompositeTextures {
  glyphColor: Texture;
  glyphMask: Texture;
  particles: Texture;
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

export function createCompositePass(
  gl: OGLRenderingContext,
  layout: OpticalLayout,
  textures: OpticalCompositeTextures,
  qualityTier: OpticalQualityTier = 'full',
): OpticalCompositePass {
  const webgl2 = gl as WebGL2RenderingContext;
  const ledger = createOpticalOglResourceLedger(gl as WebGL2RenderingContext);
  let disposed = false;

  try {
    const highPrecision = supportsHalfFloatTarget(gl);
    const bloomScale = qualityTier === 'reduced-bloom' ? OPTICAL_QUALITY_BUDGETS.reducedBloomScale : .25;
    const quarterWidth = Math.max(1, Math.round(gl.canvas.width * bloomScale));
    const quarterHeight = Math.max(1, Math.round(gl.canvas.height * bloomScale));
    const targetOptions = {
      depth: false,
      format: gl.RGBA,
      height: quarterHeight,
      internalFormat: highPrecision ? webgl2.RGBA16F : gl.RGBA8,
      magFilter: gl.LINEAR,
      minFilter: gl.LINEAR,
      stencil: false,
      type: highPrecision ? webgl2.HALF_FLOAT : gl.UNSIGNED_BYTE,
      width: quarterWidth,
    };
    const energyTarget = new RenderTarget(gl, targetOptions);
    const blurHorizontalTarget = new RenderTarget(gl, targetOptions);
    const blurVerticalTarget = new RenderTarget(gl, targetOptions);
    for (const [target, label] of [
      [energyTarget, 'caustic-energy'],
      [blurHorizontalTarget, 'caustic-blur-horizontal'],
      [blurVerticalTarget, 'caustic-blur-vertical'],
    ] as const) {
      ledger.trackRenderTarget(target);
      assertCompleteTarget(gl, target, label);
    }

    const geometry = new Triangle(gl);
    ledger.trackGeometry(geometry);
    const energyProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_HIGH_ENERGY_FRAGMENT_SHADER,
      transparent: false,
      uniforms: { tParticles: { value: textures.particles } },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    const horizontalProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_ENERGY_BLUR_FRAGMENT_SHADER,
      transparent: false,
      uniforms: {
        tEnergy: { value: energyTarget.texture },
        uDirection: { value: [1, 0] },
        uTexelSize: { value: [1 / quarterWidth, 1 / quarterHeight] },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    const verticalProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_ENERGY_BLUR_FRAGMENT_SHADER,
      transparent: false,
      uniforms: {
        tEnergy: { value: blurHorizontalTarget.texture },
        uDirection: { value: [0, 1] },
        uTexelSize: { value: [1 / quarterWidth, 1 / quarterHeight] },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    const finalProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_RESTING_COMPOSITE_FRAGMENT_SHADER,
      transparent: false,
      uniforms: {
        tBlurredEnergy: { value: blurVerticalTarget.texture },
        tEnergy: { value: energyTarget.texture },
        tGlyphColor: { value: textures.glyphColor },
        tGlyphMask: { value: textures.glyphMask },
        tParticles: { value: textures.particles },
        uViewport: { value: [layout.viewport.width, layout.viewport.height] },
        uCausticGain: { value: 0 },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    for (const program of [energyProgram, horizontalProgram, verticalProgram, finalProgram]) {
      ledger.trackProgram(program);
    }
    const energyMesh = new Mesh(gl, { geometry, program: energyProgram });
    const horizontalMesh = new Mesh(gl, { geometry, program: horizontalProgram });
    const verticalMesh = new Mesh(gl, { geometry, program: verticalProgram });
    const finalMesh = new Mesh(gl, { geometry, program: finalProgram });

    return {
      bloomScale,
      causticTexture: energyTarget.texture,
      dispose() {
        if (disposed) return;
        disposed = true;
        ledger.dispose();
      },
      passEnergies: OPTICAL_RESTING_PASS_ENERGIES,
      precision: highPrecision ? 'rgba16f' : 'rgba8',
      render(causticGain = 0) {
        if (disposed) return false;
        finalProgram.uniforms.uCausticGain.value = Math.min(.08, Math.max(0, causticGain));
        gl.clearColor(0, 0, 0, 0);
        gl.renderer.render({ clear: true, frustumCull: false, scene: energyMesh, sort: false, target: energyTarget });
        gl.renderer.render({ clear: true, frustumCull: false, scene: horizontalMesh, sort: false, target: blurHorizontalTarget });
        gl.renderer.render({ clear: true, frustumCull: false, scene: verticalMesh, sort: false, target: blurVerticalTarget });
        gl.renderer.render({ clear: true, frustumCull: false, scene: finalMesh, sort: false });
        ledger.counts();
        return gl.getError() === gl.NO_ERROR;
      },
      resourceCounts: () => ledger.counts(),
    };
  } catch (error) {
    ledger.dispose();
    throw error;
  }
}
