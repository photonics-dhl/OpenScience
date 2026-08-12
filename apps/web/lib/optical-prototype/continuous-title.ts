import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';

import type { OpticalParticleGeometry, ParticleViewportFit } from './particle-grid';
import {
  CONTINUOUS_TITLE_FRAGMENT_SHADER,
  CONTINUOUS_TITLE_VERTEX_SHADER,
} from './shaders/title';

export const CONTINUOUS_TITLE_MAX_WARP_CSS_PX = 4;

type Bounds = { maxX: number; maxY: number; minX: number; minY: number };

export type ContinuousTitleGeometry = OpticalParticleGeometry & {
  center: { x: number; y: number };
  glyphs: ReadonlyArray<{ bounds: Bounds; group: string }>;
  outlinePath: string;
  words: ReadonlyArray<{ text: string; visibleBounds: Bounds }>;
};

type ContinuousTitleDependencies = {
  createCanvas?: () => HTMLCanvasElement;
  createGeometry?: () => PlaneGeometry;
  createMaterial?: (parameters: ConstructorParameters<typeof ShaderMaterial>[0]) => ShaderMaterial;
  createPath2D?: (path: string) => Path2D;
  createTexture?: (canvas: HTMLCanvasElement) => CanvasTexture;
  touchTexture: unknown;
};

const clampQualityScale = (value: number) => Math.min(2, Math.max(0.5, value));

export function createContinuousTitle(
  titleGeometry: ContinuousTitleGeometry,
  qualityScale: number,
  dependencies: ContinuousTitleDependencies,
) {
  const science = titleGeometry.words.find(({ text }) => text === 'Science');
  const period = titleGeometry.glyphs.find(({ group }) => group === 'period');
  if (!science || !period) throw new Error('Continuous title requires Science and period bounds.');
  const scale = clampQualityScale(qualityScale);
  const canvas = (dependencies.createCanvas ?? (() => document.createElement('canvas')))();
  canvas.width = Math.round(titleGeometry.viewport.width * scale);
  canvas.height = Math.round(titleGeometry.viewport.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Continuous title requires a 2D canvas context.');
  const createPath = dependencies.createPath2D ?? ((path: string) => new Path2D(path));
  const path = createPath(titleGeometry.outlinePath);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, titleGeometry.viewport.width, titleGeometry.viewport.height);
  context.fillStyle = '#ffffff';
  context.fill(path, 'nonzero');

  let texture: CanvasTexture | null = null;
  let geometry: PlaneGeometry | null = null;
  let material: ShaderMaterial | null = null;
  try {
    texture = (dependencies.createTexture ?? ((source) => new CanvasTexture(source)))(canvas);
    texture.colorSpace = NoColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.needsUpdate = true;

    const uniforms = {
      uDesignOffset: { value: new Vector2(0, 0) },
      uDesignScale: { value: 1 },
      uDesignViewport: {
        value: new Vector2(titleGeometry.viewport.width, titleGeometry.viewport.height),
      },
      uFieldCenter: { value: new Vector2(titleGeometry.center.x, titleGeometry.center.y) },
      uMaxWarpCssPx: { value: CONTINUOUS_TITLE_MAX_WARP_CSS_PX },
      uPeriodMaxX: { value: period.bounds.maxX + 0.5 },
      uPeriodMinX: { value: period.bounds.minX - 0.5 },
      uPointer: { value: new Vector2(titleGeometry.center.x / titleGeometry.viewport.width, 0.5) },
      uScienceMaxX: { value: science.visibleBounds.maxX },
      uTitleMask: { value: texture },
      uTouch: { value: dependencies.touchTexture },
    };
    geometry = (dependencies.createGeometry ?? (() => new PlaneGeometry(1, 1)))();
    material = (dependencies.createMaterial ?? ((parameters) => new ShaderMaterial(parameters)))({
      depthTest: false,
      depthWrite: false,
      fragmentShader: CONTINUOUS_TITLE_FRAGMENT_SHADER,
      side: DoubleSide,
      transparent: true,
      uniforms,
      vertexShader: CONTINUOUS_TITLE_VERTEX_SHADER,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    let disposed = false;

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        geometry!.dispose();
        material!.dispose();
        texture!.dispose();
      },
      mesh,
      setPointer(pointer: { x: number; y: number }) {
        uniforms.uPointer.value.set(pointer.x, pointer.y);
      },
      setViewport(fit: ParticleViewportFit) {
        uniforms.uDesignOffset.value.set(fit.offsetX, fit.offsetY);
        uniforms.uDesignScale.value = fit.scale;
      },
      texture,
      uniforms,
    };
  } catch (error) {
    material?.dispose();
    geometry?.dispose();
    texture?.dispose();
    throw error;
  }
}
