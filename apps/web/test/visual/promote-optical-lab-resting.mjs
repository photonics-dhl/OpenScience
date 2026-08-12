import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const expectedSource = path.resolve('apps/web/test/visual/out/optical-lab/desktop-resting.png');
const sourceFlag = process.argv.indexOf('--source');
const source = sourceFlag >= 0 ? path.resolve(process.argv[sourceFlag + 1] ?? '') : '';
if (source !== expectedSource) throw new Error(`Only the approved resting capture may be promoted: ${expectedSource}`);

const bytes = await readFile(source);
const signature = bytes.subarray(0, 8).toString('hex');
if (signature !== '89504e470d0a1a0a') throw new Error('Approved resting capture is not a PNG');
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
if (width !== 1672 || height !== 941) throw new Error(`Expected 1672x941, received ${width}x${height}`);
if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('Approved resting capture exceeds 2 MiB');

const destination = path.resolve('apps/web/public/optical-lab/accepted-resting.png');
const digest = createHash('sha256').update(bytes).digest('hex');
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
await writeFile(`${destination}.sha256`, `${digest}  ${path.relative(process.cwd(), source).replaceAll('\\', '/')}\n`, 'utf8');
