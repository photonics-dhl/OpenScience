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
  info: {
    padding: number[];
    size: number;
  };
  kernings: Array<{ amount: number; first: number; second: number }>;
}

export interface BmFontInkMappingContract {
  glyphs: Array<{
    char: string;
    inkLeft: number;
    inkRight: number;
    penX: number;
    quadLeft: number;
    quadRight: number;
  }>;
  inkBounds: { left: number; right: number };
  quadBounds: { left: number; right: number };
  trackingUnits: number;
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
  render(flowTexture?: Texture | null, parityWord?: 'evolves' | 'science' | null): boolean;
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
    || !font.info
    || !Array.isArray(font.info.padding)
    || !Number.isFinite(font.info.size)
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

export function createBmFontInkMappingContract(
  font: Pick<BmFontData, 'chars' | 'common' | 'info'>,
  text: string,
  letterSpacingEm: number,
): BmFontInkMappingContract {
  const paddingRight = font.info.padding[1] ?? 0;
  const paddingLeft = font.info.padding[3] ?? 0;
  const trackingUnits = letterSpacingEm * font.info.size;
  const glyphs: BmFontInkMappingContract['glyphs'] = [];
  let penX = 0;

  for (const char of text) {
    const glyph = font.chars.find((candidate) => candidate.char === char);
    if (!glyph) throw new Error(`Optical Lab atlas is missing the ${JSON.stringify(char)} glyph`);
    const quadLeft = penX + glyph.xoffset;
    const quadRight = quadLeft + glyph.width;
    glyphs.push({
      char,
      inkLeft: quadLeft + paddingLeft,
      inkRight: quadRight - paddingRight,
      penX,
      quadLeft,
      quadRight,
    });
    penX += glyph.xadvance + trackingUnits;
  }

  return {
    glyphs,
    inkBounds: {
      left: Math.min(...glyphs.map(({ inkLeft }) => inkLeft)),
      right: Math.max(...glyphs.map(({ inkRight }) => inkRight)),
    },
    quadBounds: {
      left: Math.min(...glyphs.map(({ quadLeft }) => quadLeft)),
      right: Math.max(...glyphs.map(({ quadRight }) => quadRight)),
    },
    trackingUnits,
  };
}

export function transformTextPositions(
  source: Float32Array,
  bounds: OpticalCssBounds,
  skewDegrees = 0,
  inkXBounds?: { left: number; right: number },
) {
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
  const sourceLeft = inkXBounds?.left ?? minX;
  const sourceRight = inkXBounds?.right ?? maxX;
  const sourceWidth = Math.max(0.0001, sourceRight - sourceLeft);
  const sourceHeight = Math.max(0.0001, maxY - minY);
  const skew = Math.tan(skewDegrees * Math.PI / 180);
  const skewExtent = Math.min(bounds.width * .5, Math.abs(skew) * bounds.height);
  const contentLeft = bounds.left + skewExtent * .5;
  const contentWidth = Math.max(.0001, bounds.width - skewExtent);
  const centerY = bounds.top + bounds.height * .5;
  const transformed = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    const screenY = bounds.bottom - ((source[index + 1] - minY) / sourceHeight) * bounds.height;
    transformed[index] = contentLeft
      + ((source[index] - sourceLeft) / sourceWidth) * contentWidth
      + skew * (screenY - centerY);
    transformed[index + 1] = screenY;
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
  skewDegrees = 0,
  mapFromInk = false,
) {
  const mapping = mapFromInk
    ? createBmFontInkMappingContract(atlas.font, text, letterSpacing)
    : null;
  const textGeometry = new Text({
    align: 'left',
    font: atlas.font,
    letterSpacing: mapping ? mapping.trackingUnits / atlas.font.common.base : letterSpacing,
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
    position: {
      data: transformTextPositions(rawPositions, bounds, skewDegrees, mapping?.inkBounds),
      size: 3,
    },
    uv: { data: textGeometry.buffers.uv, size: 2 },
  });
  return { geometry, mapping, rawPositions };
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
    const evolves = createTextGeometry(gl, atlases.evolves, 'evolves.', layout.evolvesInk, -.085, -6, true);
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
        uWeightOffset: { value: 0 },
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

    const drawWords = (
      target: RenderTarget,
      outputMask: boolean,
      parityWord: 'evolves' | 'science' | null,
    ) => {
      glyphProgram.uniforms.uOutputMask.value = outputMask ? 1 : 0;
      if (parityWord !== 'evolves') {
        glyphProgram.uniforms.tAtlas.value = scienceTexture;
        glyphProgram.uniforms.uPeriodId.value = -1;
        glyphProgram.uniforms.uWeightOffset.value = 0;
        gl.renderer.render({ clear: true, frustumCull: false, scene: scienceMesh, sort: false, target });
      }
      if (parityWord !== 'science') {
        glyphProgram.uniforms.tAtlas.value = evolvesTexture;
        glyphProgram.uniforms.uPeriodId.value = 7;
        glyphProgram.uniforms.uWeightOffset.value = -.35;
        gl.renderer.render({ clear: parityWord === 'evolves', frustumCull: false, scene: evolvesMesh, sort: false, target });
      }
    };

    return {
      colorTexture: colorTarget.texture,
      dispose() {
        if (disposed) return;
        disposed = true;
        ledger.dispose();
      },
      maskTexture: maskTarget.texture,
      render(flowTexture, parityWord = null) {
        if (disposed) return false;
        void flowTexture;
        gl.clearColor(0, 0, 0, 0);
        drawWords(maskTarget, true, parityWord);
        drawWords(colorTarget, false, parityWord);
        gl.renderer.render({ clear: true, frustumCull: false, scene: compositeMesh, sort: false });
        ledger.counts();
        return gl.getError() === gl.NO_ERROR;
      },
      resize(nextLayout) {
        if (disposed) return;
        layout = nextLayout;
        glyphProgram.uniforms.uViewport.value = [layout.viewport.width, layout.viewport.height];
        updateGeometryBounds(science.geometry, science.rawPositions, layout.science);
        const position = evolves.geometry.attributes.position;
        position.data = transformTextPositions(
          evolves.rawPositions,
          layout.evolvesInk,
          -6,
          evolves.mapping?.inkBounds,
        );
        position.needsUpdate = true;
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
