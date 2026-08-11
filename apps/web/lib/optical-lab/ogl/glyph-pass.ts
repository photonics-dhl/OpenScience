import {
  Geometry,
  Mesh,
  Program,
  RenderTarget,
  Text,
  Texture,
  Triangle,
  type OGLRenderingContext,
} from 'ogl';

import type { OpticalLayout, OpticalCssBounds } from '../layout';
import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';
import {
  OPTICAL_GLYPH_COMPOSITE_FRAGMENT_SHADER,
  OPTICAL_GLYPH_FRAGMENT_SHADER,
  OPTICAL_GLYPH_VERTEX_SHADER,
} from './shaders/glyph';

interface BmFontGlyph {
  char: string;
  height: number;
  id: number;
  width: number;
  x: number;
  xadvance: number;
  xoffset: number;
  y: number;
  yoffset: number;
}

interface BmFontData {
  chars: BmFontGlyph[];
  common: {
    base: number;
    lineHeight: number;
    scaleH: number;
    scaleW: number;
  };
  distanceField: {
    distanceRange: number;
    fieldType: string;
  };
  kernings: Array<{ amount: number; first: number; second: number }>;
}

interface LoadedAtlas {
  font: BmFontData;
  image: HTMLImageElement;
}

export interface OpticalGlyphAtlases {
  evolves: LoadedAtlas;
  science: LoadedAtlas;
}

export interface OpticalGlyphPass {
  colorTexture: Texture;
  dispose(): void;
  maskTexture: Texture;
  render(flowTexture?: Texture | null): boolean;
  resize(layout: OpticalLayout): void;
  resourceCounts(): OpticalOglResourceCounts;
}

const ATLAS_ROOT = '/optical-lab/atlas';
const PAPER = [241 / 255, 238 / 255, 231 / 255];
const VERMILION = [1, 78 / 255, 34 / 255];

function validateFont(data: unknown, label: string): asserts data is BmFontData {
  const font = data as Partial<BmFontData>;
  if (
    !font
    || !Array.isArray(font.chars)
    || !font.common
    || !Array.isArray(font.kernings)
    || font.distanceField?.fieldType !== 'msdf'
    || font.distanceField.distanceRange !== 8
  ) throw new Error(`Optical Lab ${label} atlas metadata is invalid`);
}

async function loadImage(url: string) {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error(`Optical Lab atlas texture failed to load: ${url}`)), { once: true });
  });
  image.src = url;
  await loaded;
  await image.decode();
  return image;
}

async function loadAtlas(stem: string): Promise<LoadedAtlas> {
  const response = await fetch(`${ATLAS_ROOT}/${stem}.json`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Optical Lab atlas metadata failed to load: ${stem}`);
  const font: unknown = await response.json();
  validateFont(font, stem);
  const image = await loadImage(`${ATLAS_ROOT}/${stem}.png`);
  return { font, image };
}

export async function loadOpticalGlyphAtlases(): Promise<OpticalGlyphAtlases> {
  const [science, evolves] = await Promise.all([
    loadAtlas('science-display'),
    loadAtlas('evolves-editorial'),
  ]);
  return { evolves, science };
}

function transformTextPositions(source: Float32Array, bounds: OpticalCssBounds) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < source.length; index += 3) {
    minX = Math.min(minX, source[index]);
    maxX = Math.max(maxX, source[index]);
    minY = Math.min(minY, source[index + 1]);
    maxY = Math.max(maxY, source[index + 1]);
  }
  const sourceWidth = Math.max(0.0001, maxX - minX);
  const sourceHeight = Math.max(0.0001, maxY - minY);
  const transformed = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    transformed[index] = bounds.left + ((source[index] - minX) / sourceWidth) * bounds.width;
    transformed[index + 1] = bounds.bottom - ((source[index + 1] - minY) / sourceHeight) * bounds.height;
    transformed[index + 2] = 0;
  }
  return transformed;
}

function createTextGeometry(
  gl: OGLRenderingContext,
  atlas: LoadedAtlas,
  text: string,
  bounds: OpticalCssBounds,
  letterSpacing: number,
) {
  const textGeometry = new Text({
    align: 'left',
    font: atlas.font,
    letterSpacing,
    lineHeight: 1,
    size: atlas.font.common.base,
    text,
    width: Infinity,
    wordBreak: false,
    wordSpacing: 0,
  });
  const rawPositions = new Float32Array(textGeometry.buffers.position);
  const geometry = new Geometry(gl, {
    glyphId: { data: textGeometry.buffers.id, size: 1 },
    index: { data: textGeometry.buffers.index, size: 1 },
    position: { data: transformTextPositions(rawPositions, bounds), size: 3 },
    uv: { data: textGeometry.buffers.uv, size: 2 },
  });
  return { geometry, rawPositions };
}

function updateGeometryBounds(
  geometry: Geometry,
  rawPositions: Float32Array,
  bounds: OpticalCssBounds,
) {
  const position = geometry.attributes.position;
  position.data = transformTextPositions(rawPositions, bounds);
  position.needsUpdate = true;
}

function createAtlasTexture(gl: OGLRenderingContext, atlas: LoadedAtlas) {
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  return new Texture(gl, {
    flipY: true,
    generateMipmaps: false,
    image: atlas.image,
    internalFormat: gl.RGBA8,
    magFilter: gl.LINEAR,
    minFilter: gl.LINEAR,
  });
}

function assertCompleteTarget(gl: OGLRenderingContext, target: RenderTarget, label: string) {
  gl.bindFramebuffer(target.target, target.buffer);
  const status = gl.checkFramebufferStatus(target.target);
  gl.bindFramebuffer(target.target, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Optical Lab ${label} framebuffer is incomplete: ${status}`);
  }
}

export function createGlyphPass(
  gl: OGLRenderingContext,
  initialLayout: OpticalLayout,
  atlases: OpticalGlyphAtlases,
): OpticalGlyphPass {
  const ledger = createOpticalOglResourceLedger(gl as WebGL2RenderingContext);
  let disposed = false;
  let layout = initialLayout;

  try {
    const scienceTexture = createAtlasTexture(gl, atlases.science);
    const evolvesTexture = createAtlasTexture(gl, atlases.evolves);
    ledger.trackTexture(scienceTexture);
    ledger.trackTexture(evolvesTexture);

    const science = createTextGeometry(gl, atlases.science, 'Science', layout.science, -.077);
    const evolves = createTextGeometry(gl, atlases.evolves, 'evolves.', layout.evolves, -.085);
    ledger.trackGeometry(science.geometry);
    ledger.trackGeometry(evolves.geometry);

    const glyphProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_GLYPH_FRAGMENT_SHADER,
      transparent: false,
      uniforms: {
        tAtlas: { value: scienceTexture },
        uAccentColor: { value: VERMILION },
        uBaseColor: { value: PAPER },
        uDistanceRange: { value: 8 },
        uOutputMask: { value: 0 },
        uPeriodId: { value: -1 },
        uViewport: { value: [layout.viewport.width, layout.viewport.height] },
      },
      vertex: OPTICAL_GLYPH_VERTEX_SHADER,
    });
    ledger.trackProgram(glyphProgram);

    const scienceMesh = new Mesh(gl, { geometry: science.geometry, program: glyphProgram });
    const evolvesMesh = new Mesh(gl, { geometry: evolves.geometry, program: glyphProgram });
    const targetOptions = {
      depth: false,
      format: gl.RGBA,
      height: gl.canvas.height,
      internalFormat: gl.RGBA8,
      magFilter: gl.LINEAR,
      minFilter: gl.LINEAR,
      stencil: false,
      type: gl.UNSIGNED_BYTE,
      width: gl.canvas.width,
    };
    const maskTarget = new RenderTarget(gl, targetOptions);
    ledger.trackRenderTarget(maskTarget);
    assertCompleteTarget(gl, maskTarget, 'mask');
    const colorTarget = new RenderTarget(gl, targetOptions);
    ledger.trackRenderTarget(colorTarget);
    assertCompleteTarget(gl, colorTarget, 'color');

    const compositeGeometry = new Triangle(gl);
    const compositeProgram = new Program(gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_GLYPH_COMPOSITE_FRAGMENT_SHADER,
      transparent: false,
      uniforms: { tColor: { value: colorTarget.texture } },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    const compositeMesh = new Mesh(gl, { geometry: compositeGeometry, program: compositeProgram });
    ledger.trackGeometry(compositeGeometry);
    ledger.trackProgram(compositeProgram);

    const drawWords = (target: RenderTarget, outputMask: boolean) => {
      glyphProgram.uniforms.uOutputMask.value = outputMask ? 1 : 0;
      glyphProgram.uniforms.tAtlas.value = scienceTexture;
      glyphProgram.uniforms.uPeriodId.value = -1;
      gl.renderer.render({ clear: true, frustumCull: false, scene: scienceMesh, sort: false, target });
      glyphProgram.uniforms.tAtlas.value = evolvesTexture;
      glyphProgram.uniforms.uPeriodId.value = 7;
      gl.renderer.render({ clear: false, frustumCull: false, scene: evolvesMesh, sort: false, target });
    };

    return {
      colorTexture: colorTarget.texture,
      dispose() {
        if (disposed) return;
        disposed = true;
        ledger.dispose();
      },
      maskTexture: maskTarget.texture,
      render(flowTexture) {
        if (disposed) return false;
        void flowTexture;
        gl.clearColor(0, 0, 0, 0);
        drawWords(maskTarget, true);
        drawWords(colorTarget, false);
        gl.renderer.render({ clear: true, frustumCull: false, scene: compositeMesh, sort: false });
        ledger.counts();
        return gl.getError() === gl.NO_ERROR;
      },
      resize(nextLayout) {
        if (disposed) return;
        layout = nextLayout;
        glyphProgram.uniforms.uViewport.value = [layout.viewport.width, layout.viewport.height];
        updateGeometryBounds(science.geometry, science.rawPositions, layout.science);
        updateGeometryBounds(evolves.geometry, evolves.rawPositions, layout.evolves);
        maskTarget.setSize(gl.canvas.width, gl.canvas.height);
        colorTarget.setSize(gl.canvas.width, gl.canvas.height);
      },
      resourceCounts: () => ledger.counts(),
    };
  } catch (error) {
    ledger.dispose();
    throw error;
  }
}
