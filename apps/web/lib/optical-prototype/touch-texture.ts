import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  type Texture,
} from 'three';

type TouchTextureSurface = {
  getContext(kind: '2d'): Pick<CanvasRenderingContext2D, 'createImageData' | 'putImageData'> | null;
  height: number;
  width: number;
};

type TouchTextureResource = Pick<Texture, 'dispose'> & { needsUpdate: boolean };

export type TouchPointer = { velocity: number; x: number; y: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function createTouchTexture({
  createCanvas = () => document.createElement('canvas'),
  createTexture = (canvas) => {
    const texture = new CanvasTexture(canvas as HTMLCanvasElement);
    texture.colorSpace = NoColorSpace;
    texture.flipY = false;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    return texture;
  },
  size = 128,
}: {
  createCanvas?: () => TouchTextureSurface;
  createTexture?: (canvas: TouchTextureSurface) => TouchTextureResource;
  size?: number;
} = {}) {
  const safeSize = Math.max(8, Math.round(size));
  const canvas = createCanvas();
  canvas.width = safeSize;
  canvas.height = safeSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('TouchTexture requires a 2D canvas context.');
  const drawingContext = context;
  const texture = createTexture(canvas);
  const image = drawingContext.createImageData(safeSize, safeSize);
  const energy = new Float32Array(safeSize * safeSize);
  let dirty = false;
  let disposed = false;
  let lastPointer: TouchPointer | null = null;

  function stamp(pointer: TouchPointer) {
    const x = clamp01(pointer.x) * (safeSize - 1);
    const y = clamp01(pointer.y) * (safeSize - 1);
    const velocity = clamp01(pointer.velocity);
    const radius = Math.max(4, safeSize * (0.065 + velocity * 0.025));
    const intensity = 0.5 + velocity * 0.45;
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(safeSize - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(safeSize - 1, Math.ceil(y + radius));
    for (let row = minY; row <= maxY; row += 1) {
      for (let column = minX; column <= maxX; column += 1) {
        const distance = Math.hypot(column - x, row - y) / radius;
        if (distance >= 1) continue;
        const falloff = (1 - distance) ** 2;
        const index = row * safeSize + column;
        energy[index] = Math.min(1, Math.max(energy[index], intensity * falloff));
      }
    }
    dirty = true;
  }

  function upload() {
    for (let index = 0; index < energy.length; index += 1) {
      const byte = Math.round(clamp01(energy[index]) * 255);
      const offset = index * 4;
      image.data[offset] = byte;
      image.data[offset + 1] = byte;
      image.data[offset + 2] = byte;
      image.data[offset + 3] = byte;
    }
    drawingContext.putImageData(image, 0, 0);
    texture.needsUpdate = true;
    dirty = false;
  }

  return {
    addPointer(pointer: TouchPointer) {
      if (disposed) return;
      const next = {
        velocity: clamp01(pointer.velocity),
        x: clamp01(pointer.x),
        y: clamp01(pointer.y),
      };
      if (lastPointer) {
        const distance = Math.hypot(next.x - lastPointer.x, next.y - lastPointer.y) * safeSize;
        const steps = Math.min(32, Math.max(1, Math.ceil(distance / 2)));
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          stamp({
            velocity: next.velocity,
            x: lastPointer.x + (next.x - lastPointer.x) * progress,
            y: lastPointer.y + (next.y - lastPointer.y) * progress,
          });
        }
      } else {
        stamp(next);
      }
      lastPointer = next;
    },
    clear() {
      if (disposed) return;
      energy.fill(0);
      lastPointer = null;
      dirty = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      energy.fill(0);
      lastPointer = null;
      texture.dispose();
    },
    sample(x: number, y: number) {
      const column = Math.round(clamp01(x) * (safeSize - 1));
      const row = Math.round(clamp01(y) * (safeSize - 1));
      return energy[row * safeSize + column];
    },
    texture,
    update(deltaMs: number) {
      if (disposed) return;
      const elapsed = Math.max(0, deltaMs);
      if (elapsed > 0) {
        const decay = Math.exp(-elapsed / 650);
        let active = false;
        let changed = false;
        for (let index = 0; index < energy.length; index += 1) {
          const previous = energy[index];
          energy[index] *= decay;
          if (energy[index] > 0.001) active = true;
          else energy[index] = 0;
          changed ||= energy[index] !== previous;
        }
        dirty ||= active || changed;
      }
      if (dirty) upload();
    },
  };
}
