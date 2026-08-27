import { Mesh, Program, RenderTarget, Triangle, type OGLRenderingContext, type Texture } from 'ogl';

import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_ASSET_FLOW_FRAGMENT_SHADER } from './shaders/asset-flow';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';

interface AssetFlowSample {
  ambientPhase: number;
  aspect: number;
  localStrength: number;
  pointer: [number, number];
  radius: number;
  velocity: [number, number];
}

export interface AssetFlowPass {
  dispose(): void;
  reset(): void;
  render(sample: AssetFlowSample): boolean;
  resourceCounts(): OpticalOglResourceCounts;
  texture(): Texture;
}

export function createAssetFlowPass(gl: OGLRenderingContext): AssetFlowPass {
  const ledger = createOpticalOglResourceLedger(gl as WebGL2RenderingContext);
  let disposed = false;
  try {
    const options = {
      depth: false,
      format: gl.RGBA,
      height: 54,
      internalFormat: gl.RGBA8,
      magFilter: gl.LINEAR,
      minFilter: gl.LINEAR,
      stencil: false,
      type: gl.UNSIGNED_BYTE,
      width: 96,
    };
    const targets = [new RenderTarget(gl, options), new RenderTarget(gl, options)] as const;
    targets.forEach((target) => ledger.trackRenderTarget(target));
    const geometry = new Triangle(gl);
    ledger.trackGeometry(geometry);
    const program = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_ASSET_FLOW_FRAGMENT_SHADER,
      uniforms: {
        tPrevious: { value: targets[0].texture },
        uAmbientPhase: { value: 0 },
        uAspect: { value: 1 },
        uFresh: { value: 1 },
        uLocalStrength: { value: 0 },
        uPointer: { value: [.5, .5] },
        uRadius: { value: .14 },
        uVelocity: { value: [0, 0] },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    ledger.trackProgram(program);
    const mesh = new Mesh(gl, { geometry, program });
    let fresh = true;
    let read = 0;

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        ledger.dispose();
      },
      render(sample) {
        if (disposed) return false;
        const write = 1 - read;
        program.uniforms.tPrevious.value = targets[read].texture;
        program.uniforms.uAmbientPhase.value = sample.ambientPhase;
        program.uniforms.uAspect.value = sample.aspect;
        program.uniforms.uFresh.value = fresh ? 1 : 0;
        program.uniforms.uLocalStrength.value = sample.localStrength;
        program.uniforms.uPointer.value = sample.pointer;
        program.uniforms.uRadius.value = sample.radius;
        program.uniforms.uVelocity.value = sample.velocity;
        gl.renderer.render({
          clear: false,
          frustumCull: false,
          scene: mesh,
          sort: false,
          target: targets[write],
        });
        fresh = false;
        read = write;
        return gl.getError() === gl.NO_ERROR;
      },
      resourceCounts: () => ledger.counts(),
      reset() {
        if (!disposed) fresh = true;
      },
      texture: () => targets[read].texture,
    };
  } catch (error) {
    ledger.dispose();
    throw error;
  }
}
