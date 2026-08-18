import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';

const FRAME_NAMES = [
  'hermes-pet-idle.png',
  'hermes-pet-blink.png',
  'hermes-pet-working.png',
];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const prediction = a + b - c;
  const pa = Math.abs(prediction - a);
  const pb = Math.abs(prediction - b);
  const pc = Math.abs(prediction - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function inspectPng(bytes, name) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`invalid PNG signature: ${name}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`${name} must be non-interlaced RGBA8`);
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const decoded = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (stride + 1);
    const filter = inflated[sourceOffset];
    const targetOffset = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + 1 + column];
      const left = column >= 4 ? decoded[targetOffset + column - 4] : 0;
      const above = row > 0 ? decoded[targetOffset + column - stride] : 0;
      const upperLeft = row > 0 && column >= 4 ? decoded[targetOffset + column - stride - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : NaN;
      if (Number.isNaN(predictor)) throw new Error(`unsupported PNG filter ${filter}: ${name}`);
      decoded[targetOffset + column] = (raw + predictor) & 0xff;
    }
  }
  let visible = 0;
  const alpha = Buffer.alloc(width * height);
  let alphaIndex = 0;
  for (let index = 3; index < decoded.length; index += 4) {
    const value = decoded[index];
    alpha[alphaIndex] = value;
    alphaIndex += 1;
    if (value > 12) visible += 1;
  }
  return {
    alphaCoverage: visible / (width * height),
    alphaDigest: createHash('sha256').update(alpha).digest('hex'),
    colorType,
    height,
    width,
  };
}

export async function inspectPetAssets(webRoot) {
  const root = path.join(webRoot, 'public', 'hermes', 'pet');
  const frames = await Promise.all(FRAME_NAMES.map(async (name) => {
    const bytes = await fs.readFile(path.join(root, name));
    return { ...inspectPng(bytes, name), bytes: bytes.length, name };
  }));
  const readmeExists = await fs.stat(path.join(root, 'README.md')).then((stat) => stat.isFile(), () => false);
  return {
    frames,
    readmeExists,
    totalBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0),
  };
}

async function main() {
  const webRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..'));
  process.stdout.write(`${JSON.stringify(await inspectPetAssets(webRoot))}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
