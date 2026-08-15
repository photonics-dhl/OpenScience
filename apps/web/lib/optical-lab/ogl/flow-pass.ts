import { Mesh, Program, RenderTarget, Triangle, type OGLRenderingContext, type Texture } from 'ogl';

import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_FLOW_FRAGMENT_SHADER } from './shaders/flow';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';

export interface OpticalFlowSample {
  follow: number;
  pointer: [number, number];
  velocity: [number, number];
}

export interface OpticalFlowPass {
  dispose(): void;
  render(sample: OpticalFlowSample): boolean;
  resourceCounts(): OpticalOglResourceCounts;
  texture(): Texture;
}

export function createFlowPass(gl: OGLRenderingContext): OpticalFlowPass {
  const ledger = createOpticalOglResourceLedger(gl as WebGL2RenderingContext);
  let disposed = false;
  try {
    const options = {
      depth: false, format: gl.RGBA, height: 54, internalFormat: gl.RGBA8,
      magFilter: gl.LINEAR, minFilter: gl.LINEAR, stencil: false,
      type: gl.UNSIGNED_BYTE, width: 96,
    };
    const targets = [new RenderTarget(gl, options), new RenderTarget(gl, options)] as const;
    targets.forEach((target) => ledger.trackRenderTarget(target));
    const geometry = new Triangle(gl);
    ledger.trackGeometry(geometry);
    const program = new Program(gl, {
      cullFace: false, depthTest: false, depthWrite: false,
      fragment: OPTICAL_FLOW_FRAGMENT_SHADER,
      uniforms: {
        tPrevious: { value: targets[0].texture },
        uFollow: { value: 0 },
        uPointer: { value: [.58, .5] },
        uVelocity: { value: [0, 0] },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    ledger.trackProgram(program);
    const mesh = new Mesh(gl, { geometry, program });
    let read = 0;
    return {
      dispose() { if (!disposed) { disposed = true; ledger.dispose(); } },
      render(sample) {
        if (disposed) return false;
        const write = 1 - read;
        program.uniforms.tPrevious.value = targets[read].texture;
        program.uniforms.uFollow.value = sample.follow;
        program.uniforms.uPointer.value = sample.pointer;
        program.uniforms.uVelocity.value = sample.velocity;
        gl.renderer.render({ clear: false, frustumCull: false, scene: mesh, sort: false, target: targets[write] });
        read = write;
        return gl.getError() === gl.NO_ERROR;
      },
      resourceCounts: () => ledger.counts(),
      texture: () => targets[read].texture,
    };
  } catch (error) {
    ledger.dispose();
    throw error;
  }
}
