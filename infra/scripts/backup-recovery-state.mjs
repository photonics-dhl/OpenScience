#!/usr/bin/env node
// Private logical host recovery state. Never copy a whole runtime/profile root.
import { constants } from 'node:fs';
import { lstat, realpath, open, mkdir, readdir, rename, rm, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCES = Object.freeze([
  ...['inbox', 'bridges'].map(p => ({ name: `native-${p}`, root: `/opt/openscience-hermes/${p}`, native: true })),
  ...['openscience-synclip', 'openscience-synclip-video'].flatMap(p => [
    ...['inbox', 'results'].map(s => ({ name: `${p}-${s}`, root: `/opt/${p}/spool/${s}` })),
    { name: `${p}-private`, root: `/opt/${p}/private` },
  ]),
  ...['openscience-codex', 'openscience-codex-review', 'openscience-video'].flatMap(p =>
    ['inbox', 'results', 'private'].map(s => ({ name: `${p}-${s}`, root: `/opt/${p}/${s}` }))),
  // Historical paid jobs remain recoverable; login profiles/config are outside.
  ...['/opt/openscience-chatgpt-browser', '/var/backups/openscience/retired-chatgpt-web/20261013/runtime'].flatMap((root, index) =>
    ['jobs', 'spool/inbox', 'spool/results', 'private', 'review-spool/inbox', 'review-spool/results', 'review-private'].map(p =>
      ({ name: `legacy-chat-${index}-${p.replaceAll('/', '-')}`, root: `${root}/${p}` }))),
]);
const MAX_FILES = 100_000, MAX_BYTES = 256 * 1024 ** 3, MAX_MAP = 64 * 1024 ** 2;
const FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const bad = () => { throw new Error('RECOVERY_STATE_FAIL'); };
const fingerprint = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.mode, s.uid, s.gid, s.nlink].join(':');
const secretName = n => /^(?:\.env(?:\..*)?|.*\.env|.*credential.*|api[-_]key|auth\.json|config\.json|runtime\.env)$/iu.test(n);
const allowed = (source, relative) => !source.native || /^[a-f0-9-]{36}-[1-9][0-9]*\/(?:request\.json|ended)$/u.test(relative);

// Linux walks from / through opened directories and uses the parent descriptor
// for each child. Renaming/replacing a producer directory cannot redirect reads
// into an unrelated tree. Windows fixtures validate path/byte behavior only.
async function directory(root) {
  if (!path.isAbsolute(root)) bad();
  if (process.platform !== 'linux') {
    if ((await lstat(root)).isSymbolicLink() || path.resolve(await realpath(root)) !== path.resolve(root)) bad();
    return { location: root, close: async () => {} };
  }
  let fd = await open('/', FLAGS | constants.O_DIRECTORY);
  try {
    for (const segment of root.split('/').filter(Boolean)) {
      if (segment === '.' || segment === '..') bad();
      const next = await open(`/proc/self/fd/${fd.fd}/${segment}`, FLAGS | constants.O_DIRECTORY);
      await fd.close(); fd = next;
    }
    return { location: `/proc/self/fd/${fd.fd}`, close: () => fd.close() };
  } catch (e) { await fd.close(); throw e; }
}

async function inventory(source, visit) {
  let entries = 0;
  let root;
  try { root = await directory(source.root); }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  const walk = async (location, relative = '', depth = 0) => {
    if (depth > 12) bad();
    for (const name of (await readdir(location)).sort()) {
      if (++entries > MAX_FILES * 2) bad();
      if (secretName(name) || name === 'worker.sock' || name === '.ready') continue;
      const rel = relative ? `${relative}/${name}` : name;
      const file = path.join(location, name), info = await lstat(file);
      if (info.isSymbolicLink()) bad();
      if (info.isDirectory()) {
        // Native only stores fixed attempt identities, never task HOME/cache.
        if (source.native && (depth !== 0 || !/^[a-f0-9-]{36}-[1-9][0-9]*$/u.test(name))) continue;
        if (process.platform === 'linux') {
          const fd = await open(file, FLAGS | constants.O_DIRECTORY);
          try { await walk(`/proc/self/fd/${fd.fd}`, rel, depth + 1); } finally { await fd.close(); }
        } else await walk(file, rel, depth + 1);
      } else if (allowed(source, rel)) {
        if (!info.isFile() || info.nlink !== 1) bad();
        await visit(file, rel, info);
      }
    }
  };
  try { await walk(root.location); return true; } finally { await root.close(); }
}
async function writePrivate(file, bytes) {
  const fd = await open(file, 'wx', 0o600);
  try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
}
async function syncDir(location) {
  if (process.platform === 'win32') return;
  const fd = await open(location, FLAGS | constants.O_DIRECTORY);
  try { await fd.sync(); } finally { await fd.close(); }
}

export async function exportRecoveryState({ backupRoot, id, release, sources = SOURCES, reserve = 8 * 1024 ** 3, afterCopy } = {}) {
  let stage;
  try {
    if (!path.isAbsolute(backupRoot ?? '') || !/^\d{8}T\d{6}Z-[1-9]\d*$/u.test(id ?? '') || !/^[a-f0-9]{40}$/u.test(release ?? '') ||
        new Set(sources.map(s => s.name)).size !== sources.length) bad();
    const parent = await directory(backupRoot);
    try { if (process.platform !== 'win32' && ((await lstat(backupRoot)).mode & 0o777) !== 0o700) bad(); }
    finally { await parent.close(); }
    const final = path.join(backupRoot, `recovery-state-${id}`);
    try { await lstat(final); bad(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const candidate = path.join(backupRoot, `.recovery-state-${id}.staging`);
    await mkdir(candidate, { mode: 0o700 }); stage = candidate;
    await mkdir(path.join(stage, 'blobs'), { mode: 0o700 });
    const records = [], roots = [], known = new Map(); let bytes = 0, mapBytes = 0;
    for (const source of sources) {
      if (!/^[a-z0-9-]+$/u.test(source.name)) bad();
      const present = await inventory(source, async (file, relative, before) => {
        if (records.length >= MAX_FILES || before.size + bytes > MAX_BYTES) bad();
        const space = await statfs(backupRoot, { bigint: true });
        if (space.bavail * space.bsize < BigInt(before.size + reserve)) bad();
        const blob = `blobs/${String(records.length + 1).padStart(12, '0')}.bin`;
        const reader = await open(file, FLAGS), writer = await open(path.join(stage, blob), 'wx', 0o600);
        let size = 0; const hash = createHash('sha256');
        try {
          if (fingerprint(await reader.stat()) !== fingerprint(before)) bad();
          for await (const part of reader.createReadStream({ autoClose: false })) {
            size += part.length; if (size > before.size) bad();
            hash.update(part); await writer.writeFile(part);
          }
          if (size !== before.size || fingerprint(await reader.stat()) !== fingerprint(before)) bad();
          await writer.sync();
        } finally { await reader.close(); await writer.close(); }
        const row = { source: source.name, relative, blob, size, sha256: hash.digest('hex'), mode: before.mode & 0o777, uid: before.uid, gid: before.gid };
        mapBytes += Buffer.byteLength(JSON.stringify(row)) + 1; if (mapBytes > MAX_MAP) bad();
        records.push(row); bytes += size; known.set(`${source.name}/${relative}`, fingerprint(before));
      });
      roots.push({ name: source.name, present });
    }
    await afterCopy?.();
    // Detect additions/deletions/replacements during the entire copy interval.
    for (const source of sources) {
      const present = await inventory(source, async (_file, relative, info) => {
        const key = `${source.name}/${relative}`;
        if (known.get(key) !== fingerprint(info)) bad(); known.delete(key);
      });
      if (present !== roots.find(r => r.name === source.name).present) bad();
    }
    if (known.size) bad();
    const map = records.map(r => JSON.stringify(r) + '\n').join('');
    await writePrivate(path.join(stage, 'files.ndjson'), map);
    await writePrivate(path.join(stage, 'manifest.json'), JSON.stringify({ schema: 1, release, id, roots, files: records.length, bytes,
      mapSha256: createHash('sha256').update(map).digest('hex'), consistency: 'validated-copy-not-point-in-time', secrets: 'runtime-credentials-excluded' }) + '\n');
    await syncDir(path.join(stage, 'blobs')); await syncDir(stage);
    await rename(stage, final); stage = undefined; await syncDir(backupRoot);
    return { files: records.length, bytes };
  } catch {
    if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
    bad(); // Never print source paths, object keys, file contents or system errors.
  }
}

export async function verifyRecoveryState(set) {
  try {
    if (process.platform !== 'win32' && (((await lstat(set)).mode & 0o777) !== 0o700 || ((await lstat(path.join(set, 'blobs'))).mode & 0o777) !== 0o700)) bad();
    const root = await directory(set);
    try {
      const read = async name => {
        const fd = await open(path.join(root.location, name), FLAGS);
        try {
          const info = await fd.stat();
          if (!info.isFile() || info.size > MAX_MAP || (process.platform !== 'win32' && (info.mode & 0o777) !== 0o600)) bad();
          return await fd.readFile();
        } finally { await fd.close(); }
      };
      const manifest = JSON.parse(await read('manifest.json')), map = await read('files.ndjson');
      if (manifest.schema !== 1 || manifest.mapSha256 !== createHash('sha256').update(map).digest('hex') || manifest.consistency !== 'validated-copy-not-point-in-time') bad();
      const rows = map.toString('utf8').trim() ? map.toString('utf8').trimEnd().split('\n').map(JSON.parse) : [];
      if (rows.length !== manifest.files || rows.length > MAX_FILES) bad();
      let bytes = 0;
      const blobRoot = await directory(path.join(set, 'blobs'));
      try {
        for (const [i, row] of rows.entries()) {
          if (row.blob !== `blobs/${String(i + 1).padStart(12, '0')}.bin` || !/^[a-f0-9]{64}$/u.test(row.sha256)) bad();
          const fd = await open(path.join(blobRoot.location, path.basename(row.blob)), FLAGS);
          const hash = createHash('sha256'); let size = 0;
          try {
            const info = await fd.stat(); if (!info.isFile() || info.size !== row.size || (process.platform !== 'win32' && (info.mode & 0o777) !== 0o600)) bad();
            for await (const part of fd.createReadStream({ autoClose: false })) { size += part.length; if (bytes + size > MAX_BYTES) bad(); hash.update(part); }
          } finally { await fd.close(); }
          if (size !== row.size || hash.digest('hex') !== row.sha256) bad(); bytes += size;
        }
      } finally { await blobRoot.close(); }
      if (bytes !== manifest.bytes) bad(); return { files: rows.length, bytes };
    } finally { await root.close(); }
  } catch { bad(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, ...args] = process.argv.slice(2);
    const result = operation === 'export' && args.length === 3 ? await exportRecoveryState({ backupRoot: args[0], id: args[1], release: args[2] })
      : operation === 'verify' && args.length === 1 ? await verifyRecoveryState(args[0]) : bad();
    console.log(`RECOVERY_STATE_OK files=${result.files} bytes=${result.bytes}`);
  } catch { console.error('RECOVERY_STATE_FAIL'); process.exitCode = 1; }
}
