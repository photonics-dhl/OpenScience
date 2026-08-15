/* global Buffer */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;

const ACCESSOR_COMPONENTS = { MAT2: 4, MAT3: 9, MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function parseHermesGlb(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 20) throw new Error('GLB is shorter than its header and JSON chunk');
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (magic !== GLB_MAGIC) throw new Error('GLB magic is invalid');
  if (version !== 2) throw new Error(`GLB version ${version} is unsupported`);
  if (declaredLength !== buffer.length) {
    throw new Error(`GLB declared length ${declaredLength} does not match ${buffer.length}`);
  }

  let offset = 12;
  let document;
  let binaryChunk;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.length) throw new Error('GLB chunk exceeds declared file length');
    if (chunkType === GLB_JSON_CHUNK) {
      document = JSON.parse(buffer.subarray(chunkStart, chunkEnd).toString('utf8').trim());
    } else if (chunkType === GLB_BINARY_CHUNK) {
      binaryChunk = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd;
  }
  if (!document) throw new Error('GLB JSON chunk is missing');

  const accessors = document.accessors ?? [];
  const bufferViews = document.bufferViews ?? [];
  const readFloatAccessor = (accessorIndex) => {
    const accessor = accessors[accessorIndex];
    const view = bufferViews[accessor?.bufferView];
    const components = ACCESSOR_COMPONENTS[accessor?.type];
    if (!binaryChunk || !accessor || !view || accessor.componentType !== 5126 || !components) return null;
    const stride = view.byteStride ?? components * 4;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, row) => Array.from(
      { length: components },
      (_, component) => binaryChunk.readFloatLE(start + row * stride + component * 4),
    ));
  };
  const animationDurations = Object.fromEntries((document.animations ?? []).map((animation) => {
    const ranges = (animation.samplers ?? []).map((sampler) => accessors[sampler.input]).filter(Boolean);
    const min = ranges.length ? Math.min(...ranges.map((accessor) => accessor.min?.[0] ?? 0)) : 0;
    const max = ranges.length ? Math.max(...ranges.map((accessor) => accessor.max?.[0] ?? 0)) : 0;
    return [animation.name ?? '', Math.max(0, max - min)];
  }));
  const animationStable = Object.fromEntries((document.animations ?? []).map((animation) => [
    animation.name ?? '',
    (animation.samplers ?? []).every((sampler) => {
      const rows = readFloatAccessor(sampler.output);
      return Boolean(rows?.length) && rows.every((row) => row.every(
        (value, component) => Math.abs(value - rows[0][component]) <= 1e-6,
      ));
    }),
  ]));

  const materialFacts = Object.fromEntries((document.materials ?? []).map((material) => [
    material.name ?? '',
    {
      baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1],
      emissiveFactor: material.emissiveFactor ?? [0, 0, 0],
      roughnessFactor: material.pbrMetallicRoughness?.roughnessFactor ?? 1,
    },
  ]));

  const triangleCount = (document.meshes ?? []).reduce((meshTotal, mesh) => meshTotal +
    (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
      const count = primitive.indices === undefined
        ? accessors[primitive.attributes?.POSITION]?.count ?? 0
        : accessors[primitive.indices]?.count ?? 0;
      return primitiveTotal + Math.floor(count / 3);
    }, 0), 0);
  const primitiveCount = (document.meshes ?? []).reduce(
    (total, mesh) => total + (mesh.primitives?.length ?? 0),
    0,
  );

  return {
    animationDurations,
    animationStable,
    animationNames: (document.animations ?? []).map((animation) => animation.name ?? ''),
    byteLength: buffer.length,
    generator: document.asset?.generator ?? '',
    gzipByteLength: gzipSync(buffer, { level: 9 }).byteLength,
    materialNames: (document.materials ?? []).map((material) => material.name ?? ''),
    materialFacts,
    meshCount: (document.meshes ?? []).length,
    nodeNames: (document.nodes ?? []).map((node) => node.name ?? ''),
    primitiveCount,
    sceneExtras: (document.scenes ?? []).flatMap((scene) => scene.extras ? [scene.extras] : []),
    triangleCount,
    version,
  };
}

export async function inspectHermesGlb(path) {
  return parseHermesGlb(await readFile(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path) throw new Error('usage: node inspect-hermes-glb.mjs <asset.glb>');
  process.stdout.write(`${JSON.stringify(await inspectHermesGlb(path), null, 2)}\n`);
}
