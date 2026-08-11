import {
  createFrameMetrics,
  OPTICAL_LAB_APERTURE_X,
  sampleOpticalLabField,
  type OpticalLabPointer,
  type OpticalLabRenderMode,
} from './model';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export interface OpticalLabRendererSnapshot {
  activeRaf: boolean;
  bounds: string;
  contextStatus: 'ready' | 'disposed';
  cpuFrameMs: number;
  fps: number;
  frameCount: number;
  gpuFrameMs: number | null;
  gpuTiming: 'timer-query' | 'synchronized-fallback' | 'unavailable';
  mode: Exclude<OpticalLabRenderMode, 'dom-static'>;
  particleCount: number;
  renderer: string;
}

export interface OpticalLabWebGLRenderer {
  dispose(): void;
  mode: Exclude<OpticalLabRenderMode, 'dom-static'>;
}

interface RasterizedHeadline {
  canvas: HTMLCanvasElement;
  particles: Float32Array;
}

const FLOW_WIDTH = 96;
const FLOW_HEIGHT = 54;

function shaderSource(gl2: boolean) {
  const vertex = gl2
    ? `#version 300 es
      in vec2 aPosition;
      out vec2 vUv;
      void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }`
    : `attribute vec2 aPosition;
      varying vec2 vUv;
      void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }`;
  const flow = gl2
    ? `#version 300 es
      precision mediump float;
      uniform sampler2D uPrevious;
      uniform float uApertureX;
      uniform float uDissipation;
      uniform float uEnergy;
      uniform vec2 uPointer;
      uniform vec2 uVelocity;
      in vec2 vUv;
      out vec4 outputColor;
      void main() {
        vec2 flow = mix(vec2(.5), texture(uPrevious, vUv).rg, uDissipation);
        vec2 delta = vUv - vec2(uApertureX, uPointer.y);
        float stamp = exp(-(delta.x * delta.x * 260. + delta.y * delta.y * 34.));
        flow += clamp(uVelocity, vec2(-1.), vec2(1.)) * stamp * uEnergy * .055;
        outputColor = vec4(clamp(flow, 0., 1.), uEnergy, 1.);
      }`
    : `precision mediump float;
      uniform sampler2D uPrevious;
      uniform float uApertureX;
      uniform float uDissipation;
      uniform float uEnergy;
      uniform vec2 uPointer;
      uniform vec2 uVelocity;
      varying vec2 vUv;
      void main() {
        vec2 flow = mix(vec2(.5), texture2D(uPrevious, vUv).rg, uDissipation);
        vec2 delta = vUv - vec2(uApertureX, uPointer.y);
        float stamp = exp(-(delta.x * delta.x * 260. + delta.y * delta.y * 34.));
        flow += clamp(uVelocity, vec2(-1.), vec2(1.)) * stamp * uEnergy * .055;
        gl_FragColor = vec4(clamp(flow, 0., 1.), uEnergy, 1.);
      }`;
  const displayBody = `
      precision highp float;
      uniform sampler2D uGlyph;
      uniform sampler2D uFlow;
      uniform float uApertureX;
      uniform float uEnergy;
      uniform float uPhase;
      uniform float uTime;
      uniform float uVerticalBias;
      VARYING vec2 vUv;
      OUTPUT_DECL
      void main() {
        float signedDistance = vUv.x - uApertureX;
        float seam = exp(-abs(signedDistance) * 16.);
        float downstream = smoothstep(-.015, .16, signedDistance);
        vec2 flow = TEXTURE(uFlow, vUv).rg * 2. - 1.;
        float squeeze = -signedDistance * exp(-abs(signedDistance) * 9.5) * .38;
        float wave = sin(vUv.y * 51. + uTime * .00042 + uPhase * 2.4) * .0045 * downstream;
        vec2 displaced = vUv + vec2(squeeze + wave + flow.x * seam * .018 * uEnergy,
          uVerticalBias * seam + flow.y * seam * .014 * uEnergy);
        float chroma = downstream * seam * (.0012 + uEnergy * .0018);
        float red = TEXTURE(uGlyph, displaced + vec2(chroma, 0.)).a;
        float green = TEXTURE(uGlyph, displaced).a;
        float blue = TEXTURE(uGlyph, displaced - vec2(chroma, 0.)).a;
        vec3 glyph = vec3(red, green, blue);
        float directional = signedDistance - ((vUv.y - .5) * .042 + .008);
        float caustic = exp(-directional * directional * 5400.) * exp(-abs(vUv.y - .5) * 2.8) * .12;
        vec3 color = glyph * vec3(.96, .945, .91) + vec3(.92, .31, .13) * caustic * uEnergy;
        float alpha = max(max(red, green), blue) * .92 + caustic * uEnergy;
        OUTPUT_COLOR(vec4(color, clamp(alpha, 0., .98)));
      }`;
  const display = gl2
    ? `#version 300 es
      ${displayBody
        .replace('VARYING', 'in')
        .replace('OUTPUT_DECL', 'out vec4 outputColor;')
        .replaceAll('TEXTURE', 'texture')
        .replace('OUTPUT_COLOR', 'outputColor =')}`
    : displayBody
      .replace('VARYING', 'varying')
      .replace('OUTPUT_DECL', '')
      .replaceAll('TEXTURE', 'texture2D')
      .replace('OUTPUT_COLOR', 'gl_FragColor =');
  const particleVertex = gl2
    ? `#version 300 es
      precision highp float;
      in vec3 aParticle;
      uniform float uApertureX;
      uniform float uEnergy;
      uniform float uPhase;
      uniform float uTime;
      uniform float uVerticalBias;
      out float vParticleAlpha;
      void main() {
        float signedDistance = aParticle.x - uApertureX;
        float seam = exp(-abs(signedDistance) * 16.);
        float downstream = smoothstep(-.015, .16, signedDistance);
        float squeeze = -signedDistance * exp(-abs(signedDistance) * 9.5) * .38;
        float wave = sin(aParticle.y * 51. + uTime * .00042 + uPhase * 2.4 + aParticle.z * 6.28) * .0045 * downstream;
        vec2 position = vec2(aParticle.x + squeeze + wave, aParticle.y + uVerticalBias * seam);
        gl_Position = vec4(position * 2. - 1., 0., 1.);
        gl_PointSize = 1.6 + seam * (1.6 + uEnergy * 1.1);
        vParticleAlpha = seam * (.24 + uEnergy * .42) * (aParticle.z * .3 + .7);
      }`
    : `precision highp float;
      attribute vec3 aParticle;
      uniform float uApertureX;
      uniform float uEnergy;
      uniform float uPhase;
      uniform float uTime;
      uniform float uVerticalBias;
      varying float vParticleAlpha;
      void main() {
        float signedDistance = aParticle.x - uApertureX;
        float seam = exp(-abs(signedDistance) * 16.);
        float downstream = smoothstep(-.015, .16, signedDistance);
        float squeeze = -signedDistance * exp(-abs(signedDistance) * 9.5) * .38;
        float wave = sin(aParticle.y * 51. + uTime * .00042 + uPhase * 2.4 + aParticle.z * 6.28) * .0045 * downstream;
        vec2 position = vec2(aParticle.x + squeeze + wave, aParticle.y + uVerticalBias * seam);
        gl_Position = vec4(position * 2. - 1., 0., 1.);
        gl_PointSize = 1.6 + seam * (1.6 + uEnergy * 1.1);
        vParticleAlpha = seam * (.24 + uEnergy * .42) * (aParticle.z * .3 + .7);
      }`;
  const particleFragment = gl2
    ? `#version 300 es
      precision mediump float;
      in float vParticleAlpha;
      out vec4 outputColor;
      void main() {
        float square = 1. - smoothstep(.22, .5, max(abs(gl_PointCoord.x - .5), abs(gl_PointCoord.y - .5)));
        outputColor = vec4(.96, .94, .9, vParticleAlpha * square);
      }`
    : `precision mediump float;
      varying float vParticleAlpha;
      void main() {
        float square = 1. - smoothstep(.22, .5, max(abs(gl_PointCoord.x - .5), abs(gl_PointCoord.y - .5)));
        gl_FragColor = vec4(.96, .94, .9, vParticleAlpha * square);
      }`;
  return { display, flow, particleFragment, particleVertex, vertex };
}

function compileShader(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate Optical Lab shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: GL, vertex: string, fragment: string) {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate Optical Lab program.');
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown program link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createTexture(gl: GL, width: number, height: number, source: TexImageSource | null = null) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to allocate Optical Lab texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else {
    const neutral = new Uint8Array(width * height * 4);
    for (let index = 0; index < neutral.length; index += 4) {
      neutral[index] = 128;
      neutral[index + 1] = 128;
      neutral[index + 2] = 0;
      neutral[index + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, neutral);
  }
  return texture;
}

function createFramebuffer(gl: GL, texture: WebGLTexture) {
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Unable to allocate Optical Lab framebuffer.');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    throw new Error('Optical Lab flow framebuffer is incomplete.');
  }
  return framebuffer;
}

function rasterizeHeadline(stage: HTMLElement, width: number, height: number, dpr: number): RasterizedHeadline {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { canvas, particles: new Float32Array() };
  context.scale(dpr, dpr);
  context.fillStyle = '#fff';
  const stageBounds = stage.getBoundingClientRect();
  const sources = [
    stage.querySelector<HTMLElement>('[data-optical-lab-science="true"]'),
    stage.querySelector<HTMLElement>('[data-optical-lab-evolves="true"]'),
  ].filter((value): value is HTMLElement => Boolean(value));
  for (const element of sources) {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = 'alphabetic';
    const metrics = context.measureText(element.textContent ?? '');
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .78;
    const descent = metrics.actualBoundingBoxDescent || fontSize * .18;
    const baseline = bounds.top - stageBounds.top + (bounds.height - ascent - descent) / 2 + ascent;
    context.fillText(element.textContent ?? '', bounds.left - stageBounds.left, baseline);
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const positions: number[] = [];
  const spacing = Math.max(3, Math.round(5 * dpr));
  const alphaAt = (x: number, y: number) => image.data[(y * canvas.width + x) * 4 + 3] ?? 0;
  for (let y = spacing; y < canvas.height - spacing; y += spacing) {
    for (let x = spacing; x < canvas.width - spacing; x += spacing) {
      if (x / canvas.width < .35 || x / canvas.width > .84) continue;
      const alpha = alphaAt(x, y);
      if (alpha < 72) continue;
      const edge = alphaAt(x - spacing, y) < 42
        || alphaAt(x + spacing, y) < 42
        || alphaAt(x, y - spacing) < 42
        || alphaAt(x, y + spacing) < 42;
      if (!edge) continue;
      const seed = ((x * 17 + y * 31) % 997) / 997;
      if (seed < .28) continue;
      positions.push(x / canvas.width, 1 - y / canvas.height, seed);
      if (positions.length >= 4_800) break;
    }
    if (positions.length >= 4_800) break;
  }
  return { canvas, particles: new Float32Array(positions) };
}

function setUniform1f(gl: GL, program: WebGLProgram, name: string, value: number) {
  gl.uniform1f(gl.getUniformLocation(program, name), value);
}

function bindFullscreen(gl: GL, program: WebGLProgram, buffer: WebGLBuffer) {
  const location = gl.getAttribLocation(program, 'aPosition');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

export function createOpticalLabWebGLRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  onSnapshot: (snapshot: OpticalLabRendererSnapshot) => void,
): OpticalLabWebGLRenderer | null {
  const options: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'low-power',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  };
  const webgl2 = canvas.getContext('webgl2', options);
  const webgl1 = webgl2 ? null : canvas.getContext('webgl', options);
  const gl = webgl2 ?? webgl1;
  if (!gl) return null;
  const mode = webgl2 ? 'webgl2' : 'webgl1';
  if (mode === 'webgl1' && !gl.getExtension('OES_texture_half_float')) return null;

  const gl2 = mode === 'webgl2';
  const sources = shaderSource(gl2);
  const displayProgram = createProgram(gl, sources.vertex, sources.display);
  const flowProgram = createProgram(gl, sources.vertex, sources.flow);
  const particleProgram = createProgram(gl, sources.particleVertex, sources.particleFragment);
  const fullscreenBuffer = gl.createBuffer();
  const particleBuffer = gl.createBuffer();
  if (!fullscreenBuffer || !particleBuffer) throw new Error('Unable to allocate Optical Lab buffers.');
  gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const flowTextures = [
    createTexture(gl, FLOW_WIDTH, FLOW_HEIGHT),
    createTexture(gl, FLOW_WIDTH, FLOW_HEIGHT),
  ];
  const flowFramebuffers = flowTextures.map((texture) => createFramebuffer(gl, texture));
  const glyphTexture = createTexture(gl, 1, 1);
  let particleCount = 0;
  let flowIndex = 0;
  let frameIndex = 0;
  let rafId = 0;
  let disposed = false;
  let previousPointer: { x: number; y: number; at: number } | null = null;
  let pointer: OpticalLabPointer | null = null;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let latestGpuMs: number | null = null;
  let gpuTiming: OpticalLabRendererSnapshot['gpuTiming'] = 'unavailable';
  const metrics = createFrameMetrics(90);
  const renderer = gl.getParameter(gl.RENDERER) as string;
  const timerExtension = gl2
    ? (gl as WebGL2RenderingContext).getExtension('EXT_disjoint_timer_query_webgl2')
    : null;
  let timerQuery: WebGLQuery | null = null;

  const rebuildHeadline = () => {
    const raster = rasterizeHeadline(stage, width, height, dpr);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster.canvas);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, raster.particles, gl.STATIC_DRAW);
    particleCount = raster.particles.length / 3;
  };

  const measure = () => {
    const bounds = stage.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      rebuildHeadline();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const bounds = stage.getBoundingClientRect();
    const now = performance.now();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const elapsed = previousPointer ? Math.max(8, now - previousPointer.at) : 16;
    pointer = {
      lastActiveAt: now,
      velocityX: previousPointer ? ((x - previousPointer.x) / elapsed) * .08 : 0,
      velocityY: previousPointer ? ((y - previousPointer.y) / elapsed) * .08 : 0,
      x,
      y,
    };
    previousPointer = { at: now, x, y };
  };

  const drawFullscreen = (program: WebGLProgram) => {
    bindFullscreen(gl, program, fullscreenBuffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const sampleGpuTimer = () => {
    if (!timerExtension || !timerQuery) return;
    const glContext = gl as WebGL2RenderingContext;
    const available = glContext.getQueryParameter(timerQuery, glContext.QUERY_RESULT_AVAILABLE) as boolean;
    const disjoint = glContext.getParameter(timerExtension.GPU_DISJOINT_EXT) as boolean;
    if (available) {
      if (!disjoint) {
        latestGpuMs = (glContext.getQueryParameter(timerQuery, glContext.QUERY_RESULT) as number) / 1_000_000;
        gpuTiming = 'timer-query';
      }
      glContext.deleteQuery(timerQuery);
      timerQuery = null;
    }
  };

  const animate = (now: number) => {
    if (disposed) return;
    const cpuStarted = performance.now();
    sampleGpuTimer();
    const shouldTimeGpu = Boolean(timerExtension && !timerQuery && frameIndex % 60 === 0);
    if (shouldTimeGpu) {
      const glContext = gl as WebGL2RenderingContext;
      timerQuery = glContext.createQuery();
      if (timerQuery) glContext.beginQuery(timerExtension!.TIME_ELAPSED_EXT, timerQuery);
    }
    const field = sampleOpticalLabField(pointer, { height, width }, now);
    const pointerUv = { x: field.pointer.x / width, y: 1 - field.pointer.y / height };
    const verticalBias = field.verticalBias / height;

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, flowFramebuffers[1 - flowIndex]!);
    gl.viewport(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
    gl.useProgram(flowProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowTextures[flowIndex]!);
    gl.uniform1i(gl.getUniformLocation(flowProgram, 'uPrevious'), 0);
    setUniform1f(gl, flowProgram, 'uApertureX', OPTICAL_LAB_APERTURE_X);
    setUniform1f(gl, flowProgram, 'uDissipation', .955);
    setUniform1f(gl, flowProgram, 'uEnergy', field.energy);
    gl.uniform2f(gl.getUniformLocation(flowProgram, 'uPointer'), pointerUv.x, pointerUv.y);
    gl.uniform2f(gl.getUniformLocation(flowProgram, 'uVelocity'), field.pointer.velocityX, -field.pointer.velocityY);
    drawFullscreen(flowProgram);
    flowIndex = 1 - flowIndex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uGlyph'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, flowTextures[flowIndex]!);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uFlow'), 1);
    setUniform1f(gl, displayProgram, 'uApertureX', OPTICAL_LAB_APERTURE_X);
    setUniform1f(gl, displayProgram, 'uEnergy', field.energy);
    setUniform1f(gl, displayProgram, 'uPhase', field.phase);
    setUniform1f(gl, displayProgram, 'uTime', now);
    setUniform1f(gl, displayProgram, 'uVerticalBias', verticalBias);
    drawFullscreen(displayProgram);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(particleProgram);
    const particleLocation = gl.getAttribLocation(particleProgram, 'aParticle');
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.enableVertexAttribArray(particleLocation);
    gl.vertexAttribPointer(particleLocation, 3, gl.FLOAT, false, 0, 0);
    setUniform1f(gl, particleProgram, 'uApertureX', OPTICAL_LAB_APERTURE_X);
    setUniform1f(gl, particleProgram, 'uEnergy', field.energy);
    setUniform1f(gl, particleProgram, 'uPhase', field.phase);
    setUniform1f(gl, particleProgram, 'uTime', now);
    setUniform1f(gl, particleProgram, 'uVerticalBias', verticalBias);
    gl.drawArrays(gl.POINTS, 0, particleCount);

    if (shouldTimeGpu && timerQuery) (gl as WebGL2RenderingContext).endQuery(timerExtension!.TIME_ELAPSED_EXT);
    if (latestGpuMs === null && frameIndex >= 20) {
      const synchronizedAt = performance.now();
      gl.finish();
      latestGpuMs = performance.now() - synchronizedAt;
      gpuTiming = 'synchronized-fallback';
    }
    const cpuFrameMs = performance.now() - cpuStarted;
    metrics.record(now, cpuFrameMs, latestGpuMs);
    frameIndex += 1;
    if (frameIndex % 10 === 0) {
      const bounds = stage.getBoundingClientRect();
      const stableBounds = `${bounds.x.toFixed(1)},${bounds.y.toFixed(1)},${bounds.width.toFixed(1)},${bounds.height.toFixed(1)}`;
      const snapshot = metrics.snapshot({ height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y });
      onSnapshot({
        activeRaf: true,
        bounds: stableBounds,
        contextStatus: 'ready',
        cpuFrameMs: snapshot.cpuFrameMs,
        fps: snapshot.fps,
        frameCount: snapshot.frameCount,
        gpuFrameMs: snapshot.gpuFrameMs,
        gpuTiming,
        mode,
        particleCount,
        renderer,
      });
    }
    rafId = window.requestAnimationFrame(animate);
  };

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(stage);
  stage.addEventListener('pointermove', onPointerMove, { passive: true });
  measure();
  void document.fonts.ready.then(() => {
    if (!disposed) rebuildHeadline();
  });
  rafId = window.requestAnimationFrame(animate);

  return {
    mode,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      stage.removeEventListener('pointermove', onPointerMove);
      if (timerQuery) (gl as WebGL2RenderingContext).deleteQuery(timerQuery);
      gl.deleteBuffer(fullscreenBuffer);
      gl.deleteBuffer(particleBuffer);
      gl.deleteTexture(glyphTexture);
      flowTextures.forEach((texture) => gl.deleteTexture(texture));
      flowFramebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
      gl.deleteProgram(displayProgram);
      gl.deleteProgram(flowProgram);
      gl.deleteProgram(particleProgram);
      onSnapshot({
        activeRaf: false,
        bounds: 'disposed',
        contextStatus: 'disposed',
        cpuFrameMs: 0,
        fps: 0,
        frameCount: 0,
        gpuFrameMs: null,
        gpuTiming: 'unavailable',
        mode,
        particleCount,
        renderer,
      });
    },
  };
}
