#!/usr/bin/env node
// Read-only logical S3 export. Install beside backup.sh; no application redeploy
// or host SDK is needed. Keys/metadata belong only in the private backup files.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const DEFAULT_LIMITS = Object.freeze({
  maxObjects: 100_000,
  maxObjectBytes: 16 * 1024 ** 3,
  maxTotalBytes: 256 * 1024 ** 3,
  maxManifestBytes: 64 * 1024 ** 2,
  maxRecordBytes: 16 * 1024,
  idleMs: 60_000,
  operationMs: 3_600_000,
});
const ID = /^\d{8}T\d{6}Z-[1-9]\d*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const ERROR_CODES = new Set(['ARGUMENT', 'SOURCE', 'SOURCE_CHANGED', 'INTEGRITY', 'LIMIT', 'IO', 'FORMAT', 'PERMISSIONS', 'CANCELLED', 'COLLISION', 'TIMEOUT', 'SPACE']);
const FREE_SPACE_RESERVE = 8 * 1024 ** 3;
const FREE_INODE_RESERVE = 1024;
class BackupError extends Error {
  constructor(code) { super(`OBJECT_BACKUP_FAIL: ${ERROR_CODES.has(code) ? code : 'IO'}`); }
}
const fail = (code) => { throw new BackupError(code); };
const sanitize = (error) => error instanceof BackupError ? error : new BackupError('IO');
const checkAbort = (signal) => { if (signal?.aborted) fail('CANCELLED'); };
const blobName = (number) => `blobs/${String(number).padStart(12, '0')}.bin`;

function limitsFor(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) fail('ARGUMENT');
  }
  return limits;
}

// This exact, fixed program is passed as argv to node -e. The only variable
// request is bounded JSON on stdin. Credentials never cross the container.
// The hard deadline also bounds a disconnected docker-exec reader in-container.
export const CONTAINER_PROGRAM = String.raw`
'use strict';
const die = () => { process.stderr.write('OBJECT_SOURCE_FAIL\n'); process.exit(1); };
process.on('uncaughtException', die);
process.on('unhandledRejection', die);
process.stdout.on('error', die);
process.stdin.on('error', die);
const deadline = setTimeout(die, 3600000);
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');
async function write(value) {
  const line = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(line) > 16384) throw new Error();
  if (!process.stdout.write(line)) await once(process.stdout, 'drain');
}
function identity(key, value) {
  return { key, size: value.size, etag: value.etag, lastModified: value.lastModified };
}
(async () => {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 8192) throw new Error();
    chunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!request || !['info', 'list', 'stat', 'get'].includes(request.op)) throw new Error();
  if (['stat', 'get'].includes(request.op) &&
      (typeof request.key !== 'string' || !request.key.length || Buffer.byteLength(request.key) > 1024)) throw new Error();
  const env = process.env;
  if ((env.S3_DRIVER && env.S3_DRIVER !== 'minio') ||
      !env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY || !env.S3_BUCKET ||
      (env.S3_USE_SSL && !['true', 'false'].includes(env.S3_USE_SSL))) throw new Error();
  const port = Number(env.S3_PORT || '9000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  const { Client } = require('/opt/openscience/packages/storage/node_modules/minio');
  const client = new Client({ endPoint: env.S3_ENDPOINT, port,
    useSSL: env.S3_USE_SSL === 'true', accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY });
  const bucket = env.S3_BUCKET;
  if (request.op === 'info') {
    await write({ bucket });
  } else if (request.op === 'list') {
    for await (const value of client.listObjectsV2(bucket, '', true)) {
      await write(identity(value.name, value));
    }
  } else if (request.op === 'stat') {
    const value = await client.statObject(bucket, request.key);
    const meta = value.metaData || {};
    const checksum = meta.sha256 ?? meta['x-amz-meta-sha256'] ?? null;
    const sourceSha256 = checksum === null ? null : String(checksum).trim().toLowerCase();
    if (sourceSha256 !== null && !/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error();
    await write({ ...identity(request.key, value), versionId: value.versionId ?? null,
      contentType: meta['content-type'] ?? null, sourceSha256 });
  } else {
    await pipeline(await client.getObject(bucket, request.key), process.stdout);
  }
  clearTimeout(deadline);
})().catch(die);
`;

async function* jsonLines(stream, limits) {
  let pending = Buffer.alloc(0);
  let bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const part of stream) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > limits.maxManifestBytes) fail('LIMIT');
    pending = Buffer.concat([pending, chunk]);
    let end;
    while ((end = pending.indexOf(10)) !== -1) {
      if (end === 0 || end > limits.maxRecordBytes) fail('FORMAT');
      const value = JSON.parse(decoder.decode(pending.subarray(0, end)));
      pending = pending.subarray(end + 1);
      yield value;
    }
    if (pending.length > limits.maxRecordBytes) fail('LIMIT');
  }
  if (pending.length) fail('FORMAT');
}

export function createDockerSource({ spawnImpl = spawn, limits: overrides, signal } = {}) {
  const limits = limitsFor(overrides);
  async function* request(payload, maxBytes) {
    checkAbort(signal);
    let child;
    try {
      child = spawnImpl('docker', ['exec', '-i', 'openscience-prod-api-1', 'node', '-e', CONTAINER_PROGRAM], {
        shell: false, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
      });
    } catch { fail('SOURCE'); }
    let closed = false;
    let failed = false;
    let timedOut = false;
    const complete = new Promise((resolve) => {
      child.on('error', () => { failed = true; });
      child.once('close', (code, childSignal) => {
        closed = true;
        resolve(!failed && code === 0 && !childSignal);
      });
    });
    child.stdin.on('error', () => { failed = true; });
    const stop = () => { if (!closed) child.kill('SIGKILL'); };
    const timeout = () => { timedOut = true; stop(); };
    const deadline = setTimeout(timeout, limits.operationMs);
    const idle = setTimeout(timeout, limits.idleMs);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      checkAbort(signal);
      child.stdin.end(JSON.stringify(payload));
      let bytes = 0;
      for await (const chunk of child.stdout) {
        idle.refresh();
        bytes += chunk.length;
        if (bytes > maxBytes) fail('LIMIT');
        yield chunk;
      }
      const success = await complete;
      checkAbort(signal);
      if (timedOut) fail('TIMEOUT');
      if (!success) fail('SOURCE');
    } catch (error) {
      if (signal?.aborted) fail('CANCELLED');
      if (timedOut) fail('TIMEOUT');
      throw error instanceof BackupError ? error : new BackupError('SOURCE');
    } finally {
      clearTimeout(deadline);
      clearTimeout(idle);
      signal?.removeEventListener('abort', stop);
      stop();
      await complete;
    }
  }
  async function one(payload) {
    let value;
    let count = 0;
    for await (const row of jsonLines(request(payload, limits.maxRecordBytes), limits)) {
      value = row;
      if (++count > 1) fail('FORMAT');
    }
    if (count !== 1) fail('FORMAT');
    return value;
  }
  return {
    info: () => one({ op: 'info' }),
    list: () => jsonLines(request({ op: 'list' }, limits.maxManifestBytes), limits),
    stat: (key) => one({ op: 'stat', key }),
    get: (key) => Readable.from(request({ op: 'get', key }, limits.maxObjectBytes)),
  };
}

function metadata(raw, key, full = false) {
  if (!raw || typeof raw.key !== 'string' || !raw.key.length || Buffer.byteLength(raw.key) > 1024 ||
      (key !== undefined && raw.key !== key) || !Number.isSafeInteger(raw.size) || raw.size < 0 ||
      typeof raw.etag !== 'string' || !raw.etag.length || raw.etag.length > 256 || /[\x00-\x1f]/.test(raw.etag) ||
      !Number.isFinite(Date.parse(raw.lastModified))) fail('FORMAT');
  const result = { key: raw.key, size: raw.size, etag: raw.etag, lastModified: new Date(raw.lastModified).toISOString() };
  if (full) {
    for (const field of ['versionId', 'contentType']) {
      const value = raw[field] ?? null;
      if (value !== null && (typeof value !== 'string' || Buffer.byteLength(value) > 1024)) fail('FORMAT');
      result[field] = value;
    }
    result.sourceSha256 = raw.sourceSha256 ?? null;
    if (result.sourceSha256 !== null && !SHA256.test(result.sourceSha256)) fail('FORMAT');
  }
  return result;
}

function sameMetadata(left, right) {
  for (const field of Object.keys(left)) {
    if (left[field] !== right[field]) fail('SOURCE_CHANGED');
  }
}

async function privateDirectory(location, create = false) {
  if (create) await mkdir(location, { recursive: true, mode: 0o700 });
  const info = await lstat(location);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('PERMISSIONS');
  if (create) await chmod(location, 0o700);
  else if (process.platform !== 'win32' && (info.mode & 0o777) !== 0o700) fail('PERMISSIONS');
}

async function privateFile(location) {
  const initial = await lstat(location);
  if (!initial.isFile() || initial.isSymbolicLink()) fail('PERMISSIONS');
  const handle = await open(location, READ_FLAGS);
  try {
    const info = await handle.stat();
    if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o777) !== 0o600)) fail('PERMISSIONS');
    // O_NOFOLLOW is unavailable on Windows; reject its reparse-point symlinks too.
    if ((await lstat(location)).isSymbolicLink()) fail('PERMISSIONS');
    return handle;
  } catch (error) { await handle.close(); throw error; }
}

async function syncDirectory(location) {
  if (process.platform === 'win32') return; // Linux production uses directory fsync.
  const handle = await open(location, READ_FLAGS);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writePrivate(location, text) {
  const handle = await open(location, 'wx', 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
}

async function readSmall(location, maximum) {
  const handle = await privateFile(location);
  try {
    if ((await handle.stat()).size > maximum) fail('LIMIT');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      if (bytes > maximum) fail('LIMIT');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await handle.close(); }
}

async function hashFile(location, maximum) {
  const handle = await privateFile(location);
  let size = 0;
  const hash = createHash('sha256');
  try {
    if ((await handle.stat()).size > maximum) fail('LIMIT');
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > maximum) fail('LIMIT');
      hash.update(chunk);
    }
  } finally { await handle.close(); }
  return { size, sha256: hash.digest('hex') };
}

async function checksumFile(directory, name, maximum) {
  const result = await hashFile(path.join(directory, name), maximum);
  await writePrivate(path.join(directory, `${name}.sha256`), `${result.sha256}  ${name}\n`);
}

async function checkFileChecksum(directory, name, maximum) {
  const expected = await readSmall(path.join(directory, `${name}.sha256`), 256);
  const actual = await hashFile(path.join(directory, name), maximum);
  if (expected !== `${actual.sha256}  ${name}\n`) fail('INTEGRITY');
}

async function* recordsAt(location, limits) {
  const handle = await privateFile(location);
  try { yield* jsonLines(handle.createReadStream({ autoClose: false }), limits); }
  finally { await handle.close(); }
}

async function appendRecord(handle, value, state, limits) {
  const text = `${JSON.stringify(value)}\n`;
  const bytes = Buffer.byteLength(text);
  state.bytes += bytes;
  if (bytes > limits.maxRecordBytes || state.bytes > limits.maxManifestBytes) fail('LIMIT');
  await handle.writeFile(text);
}

/** Source adapter methods are read-only. Caller backup.sh owns the existing flock. */
export async function exportObjects({ backupRoot, id, release, retention = 7, source, limits: overrides, signal, availableBytes, availableInodes } = {}) {
  let staging;
  try {
    const limits = limitsFor(overrides);
    if (typeof backupRoot !== 'string' || !path.isAbsolute(backupRoot) || !ID.test(id ?? '') ||
        !/^[a-f0-9]{40}$/.test(release ?? '') || !Number.isSafeInteger(retention) || retention < 1) fail('ARGUMENT');
    checkAbort(signal);
    source ??= createDockerSource({ limits, signal });
    const { bucket } = await source.info();
    if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) fail('FORMAT');
    await privateDirectory(backupRoot, true);
    availableBytes ??= async () => {
      const space = await statfs(backupRoot, { bigint: true });
      const bytes = space.bavail * space.bsize;
      if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) fail('IO');
      return Number(bytes);
    };
    availableInodes ??= async () => {
      const space = await statfs(backupRoot, { bigint: true });
      // Filesystems without a fixed inode pool (including NTFS) report zero.
      if (space.files === 0n) return null;
      if (space.ffree > BigInt(Number.MAX_SAFE_INTEGER)) fail('IO');
      return Number(space.ffree);
    };
    const requireSpace = async (remaining, remainingFiles = 8) => {
      const free = await availableBytes();
      if (!Number.isSafeInteger(free) || free < 0) fail('IO');
      // Reserve for the website and concurrent writers; a byte limit alone is
      // insufficient when that limit exceeds this host's available filesystem.
      if (free - FREE_SPACE_RESERVE < remaining + 2 * limits.maxManifestBytes) fail('SPACE');
      const inodes = await availableInodes();
      if (inodes !== null && (!Number.isSafeInteger(inodes) || inodes < 0)) fail('IO');
      if (inodes !== null && inodes - FREE_INODE_RESERVE < remainingFiles) fail('SPACE');
    };
    const directory = path.join(backupRoot, `objects-set-${id}`);
    try { await lstat(directory); fail('COLLISION'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await requireSpace(0);
    const stagePath = path.join(backupRoot, `.objects-set-${id}.staging`);
    await mkdir(stagePath, { mode: 0o700 });
    staging = stagePath; // Only a directory successfully created by this invocation is cleaned.
    await mkdir(path.join(staging, 'blobs'), { mode: 0o700 });
    const inventory = path.join(staging, 'inventory.ndjson');
    const inventoryHandle = await open(inventory, 'wx', 0o600);
    let objectCount = 0;
    let totalBytes = 0;
    const seen = new Set(); // Bounded by both maxObjects and the on-disk inventory byte limit.
    try {
      const state = { bytes: 0 };
      for await (const raw of source.list()) {
        checkAbort(signal);
        await requireSpace(0);
        const row = metadata(raw);
        totalBytes += row.size;
        if (++objectCount > limits.maxObjects || row.size > limits.maxObjectBytes || totalBytes > limits.maxTotalBytes) fail('LIMIT');
        if (seen.has(row.key)) fail('FORMAT');
        seen.add(row.key);
        await appendRecord(inventoryHandle, row, state, limits);
      }
      await inventoryHandle.sync();
    } finally { await inventoryHandle.close(); seen.clear(); }

    await requireSpace(totalBytes, objectCount + 8);

    const mapPath = path.join(staging, 'objects.ndjson');
    const mapHandle = await open(mapPath, 'wx', 0o600);
    try {
      const state = { bytes: 0 };
      let number = 0;
      let copiedBytes = 0;
      for await (const listed of recordsAt(inventory, limits)) {
        checkAbort(signal);
        await requireSpace(totalBytes - copiedBytes, objectCount - number + 8);
        const before = metadata(await source.stat(listed.key), listed.key, true);
        sameMetadata(listed, before);
        const blob = blobName(++number);
        const target = path.join(staging, blob);
        const hash = createHash('sha256');
        let bytes = 0;
        const meter = new Transform({ transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > before.size || bytes > limits.maxObjectBytes) return callback(new BackupError('INTEGRITY'));
          hash.update(chunk);
          callback(null, chunk);
        } });
        const body = await source.get(listed.key);
        await pipeline(body, meter, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal });
        const sha256 = hash.digest('hex');
        if (bytes !== before.size || (before.sourceSha256 && sha256 !== before.sourceSha256)) fail('INTEGRITY');
        sameMetadata(before, metadata(await source.stat(listed.key), listed.key, true));
        // Windows requires a writable descriptor for fsync. This is our newly
        // created backup blob, never a source object or production volume file.
        const blobHandle = await open(target, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
        try { await blobHandle.sync(); } finally { await blobHandle.close(); }
        await appendRecord(mapHandle, { ...before, blob, sha256 }, state, limits);
        copiedBytes += bytes;
      }
      await mapHandle.sync();
    } finally { await mapHandle.close(); }

    // Detect keys deleted/replaced while other objects were being copied. These
    // observations cannot freeze later S3 writes or create a DB/S3 snapshot.
    for await (const row of recordsAt(mapPath, limits)) {
      checkAbort(signal);
      sameMetadata(metadata(row, row.key, true), metadata(await source.stat(row.key), row.key, true));
    }
    await rm(inventory);
    await checksumFile(staging, 'objects.ndjson', limits.maxManifestBytes);
    await writePrivate(path.join(staging, 'manifest'), [
      'schema=1', 'kind=s3-logical', `created_at=${id}`, `release=${release}`, `retention_sets=${retention}`,
      `bucket=${bucket}`, 'objects=objects.ndjson', `object_count=${objectCount}`, `total_bytes=${totalBytes}`,
      'consistency=per-object-validated-not-point-in-time', '',
    ].join('\n'));
    await checksumFile(staging, 'manifest', 4096);
    await syncDirectory(path.join(staging, 'blobs'));
    await syncDirectory(staging);
    checkAbort(signal);
    await requireSpace(0);
    await rename(staging, directory);
    staging = undefined;
    await syncDirectory(backupRoot);
    return { directory, objectCount, totalBytes };
  } catch (error) {
    if (staging) {
      try { await rm(staging, { recursive: true, force: true }); }
      catch { fail('IO'); }
    }
    throw sanitize(error);
  }
}

/** Offline verifier only: never writes restored data, opens Docker, or calls S3. */
export async function verifyObjectBackup(directory, { limits: overrides } = {}) {
  try {
    const limits = limitsFor(overrides);
    await privateDirectory(directory);
    await privateDirectory(path.join(directory, 'blobs'));
    await checkFileChecksum(directory, 'manifest', 4096);
    const text = await readSmall(path.join(directory, 'manifest'), 4096);
    const manifest = Object.create(null);
    for (const line of text.trimEnd().split('\n')) {
      const separator = line.indexOf('=');
      if (separator < 1 || Object.hasOwn(manifest, line.slice(0, separator))) fail('FORMAT');
      manifest[line.slice(0, separator)] = line.slice(separator + 1);
    }
    if (manifest.schema !== '1' || manifest.kind !== 's3-logical' || manifest.objects !== 'objects.ndjson' ||
        manifest.consistency !== 'per-object-validated-not-point-in-time' || !ID.test(manifest.created_at ?? '') ||
        !/^[a-f0-9]{40}$/.test(manifest.release ?? '') || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(manifest.bucket ?? '') ||
        !/^[1-9]\d*$/.test(manifest.retention_sets ?? '') || !/^\d+$/.test(manifest.object_count ?? '') ||
        !/^\d+$/.test(manifest.total_bytes ?? '')) fail('FORMAT');
    await checkFileChecksum(directory, 'objects.ndjson', limits.maxManifestBytes);
    let objectCount = 0;
    let totalBytes = 0;
    const seen = new Set();
    for await (const row of recordsAt(path.join(directory, 'objects.ndjson'), limits)) {
      metadata(row, undefined, true);
      if (++objectCount > limits.maxObjects || row.size > limits.maxObjectBytes) fail('LIMIT');
      if (row.blob !== blobName(objectCount) || !SHA256.test(row.sha256) || seen.has(row.key)) fail('FORMAT');
      seen.add(row.key);
      const actual = await hashFile(path.join(directory, row.blob), limits.maxObjectBytes);
      if (actual.size !== row.size || actual.sha256 !== row.sha256 ||
          (row.sourceSha256 && row.sourceSha256 !== row.sha256)) fail('INTEGRITY');
      totalBytes += actual.size;
      if (totalBytes > limits.maxTotalBytes) fail('LIMIT');
    }
    if (String(objectCount) !== manifest.object_count || String(totalBytes) !== manifest.total_bytes) fail('INTEGRITY');
    return { objectCount, totalBytes };
  } catch (error) { throw sanitize(error); }
}

async function main(args) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(name, cancel);
  try {
    if (args[0] === 'export' && args.length === 5) {
      const result = await exportObjects({ backupRoot: args[1], id: args[2], release: args[3], retention: Number(args[4]), signal: controller.signal });
      process.stdout.write(`OBJECT_BACKUP_OK objects=${result.objectCount} bytes=${result.totalBytes}\n`);
    } else if (args[0] === 'verify' && args.length === 2) {
      const result = await verifyObjectBackup(args[1]);
      process.stdout.write(`OBJECT_BACKUP_VERIFY_OK objects=${result.objectCount} bytes=${result.totalBytes}\n`);
    } else { fail('ARGUMENT'); }
  } catch (error) {
    process.stderr.write(`${sanitize(error).message}\n`);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(name, cancel);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
