export interface OpticalOglResourceCounts {
  buffers: number;
  framebuffers: number;
  programs: number;
  renderbuffers: number;
  shaders: number;
  textures: number;
  vertexArrays: number;
}

interface OglProgramResources {
  fragmentShader?: unknown;
  program?: unknown;
  vertexShader?: unknown;
}

interface OglGeometryResources {
  VAOs?: Record<string, unknown>;
  attributes?: Record<string, { buffer?: unknown }>;
}

interface OglTextureResource {
  texture?: unknown;
}

interface OglRenderTargetResources {
  buffer?: unknown;
  depthBuffer?: unknown;
  depthStencilBuffer?: unknown;
  depthTexture?: OglTextureResource | null;
  stencilBuffer?: unknown;
  textures?: OglTextureResource[];
}

export interface OpticalOglResourceLedger {
  counts(): OpticalOglResourceCounts;
  dispose(): void;
  trackGeometry(geometry: OglGeometryResources): void;
  trackProgram(program: OglProgramResources): void;
  trackRenderTarget(target: OglRenderTargetResources): void;
  trackTexture(texture: OglTextureResource): void;
}

export function createOpticalOglResourceLedger(gl: WebGL2RenderingContext): OpticalOglResourceLedger {
  const buffers = new Set<WebGLBuffer>();
  const framebuffers = new Set<WebGLFramebuffer>();
  const programs = new Set<WebGLProgram>();
  const programShaders = new Map<WebGLProgram, Set<WebGLShader>>();
  const renderbuffers = new Set<WebGLRenderbuffer>();
  const shaders = new Set<WebGLShader>();
  const textures = new Set<WebGLTexture>();
  const vertexArrays = new Set<WebGLVertexArrayObject>();
  const geometries = new Set<OglGeometryResources>();
  const targets = new Set<OglRenderTargetResources>();
  let disposed = false;

  const requireLive = () => {
    if (disposed) throw new Error('Cannot register an OGL resource after ledger disposal');
  };
  const add = <T>(set: Set<T>, value: unknown) => {
    if (value) set.add(value as T);
  };
  const trackTexture = (texture: OglTextureResource) => {
    requireLive();
    add(textures, texture.texture);
  };
  const synchronizeDynamicResources = () => {
    for (const geometry of geometries) {
      for (const vertexArray of Object.values(geometry.VAOs ?? {})) add(vertexArrays, vertexArray);
      for (const attribute of Object.values(geometry.attributes ?? {})) add(buffers, attribute.buffer);
    }
    for (const target of targets) {
      add(framebuffers, target.buffer);
      add(renderbuffers, target.depthBuffer);
      add(renderbuffers, target.depthStencilBuffer);
      add(renderbuffers, target.stencilBuffer);
      for (const texture of target.textures ?? []) add(textures, texture.texture);
      if (target.depthTexture) add(textures, target.depthTexture.texture);
    }
  };
  const counts = (): OpticalOglResourceCounts => {
    if (!disposed) synchronizeDynamicResources();
    return {
      buffers: buffers.size,
      framebuffers: framebuffers.size,
      programs: programs.size,
      renderbuffers: renderbuffers.size,
      shaders: shaders.size,
      textures: textures.size,
      vertexArrays: vertexArrays.size,
    };
  };
  const clear = () => {
    buffers.clear();
    framebuffers.clear();
    geometries.clear();
    programs.clear();
    programShaders.clear();
    renderbuffers.clear();
    shaders.clear();
    targets.clear();
    textures.clear();
    vertexArrays.clear();
  };

  return {
    counts,
    dispose() {
      if (disposed) return;
      synchronizeDynamicResources();
      disposed = true;

      for (const vertexArray of vertexArrays) gl.deleteVertexArray(vertexArray);
      for (const framebuffer of framebuffers) gl.deleteFramebuffer(framebuffer);
      for (const renderbuffer of renderbuffers) gl.deleteRenderbuffer(renderbuffer);
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      for (const texture of textures) gl.deleteTexture(texture);
      for (const program of programs) {
        for (const shader of programShaders.get(program) ?? []) gl.detachShader(program, shader);
        gl.deleteProgram(program);
      }
      for (const shader of shaders) gl.deleteShader(shader);
      clear();
    },
    trackGeometry(geometry) {
      requireLive();
      geometries.add(geometry);
      synchronizeDynamicResources();
    },
    trackProgram(program) {
      requireLive();
      const programHandle = program.program as WebGLProgram | undefined;
      const ownedShaders = [program.vertexShader, program.fragmentShader]
        .filter(Boolean) as WebGLShader[];
      if (programHandle) {
        programs.add(programHandle);
        const existing = programShaders.get(programHandle) ?? new Set<WebGLShader>();
        for (const shader of ownedShaders) existing.add(shader);
        programShaders.set(programHandle, existing);
      }
      for (const shader of ownedShaders) shaders.add(shader);
    },
    trackRenderTarget(target) {
      requireLive();
      targets.add(target);
      synchronizeDynamicResources();
    },
    trackTexture,
  };
}
