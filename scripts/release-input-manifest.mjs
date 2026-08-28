#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod, lstat, open, opendir, readFile, readlink, realpath, rename, rm, writeFile,
} from 'node:fs/promises';
import {
  isAbsolute, join, relative, resolve, sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_NAME = '.release-inputs.sha256';
const SOURCE_MARKER = '.release-source';
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_MANIFEST_ENTRIES = 100_000;
const MAX_WALK_ENTRIES = 350_000;
const MAX_RUNTIME_SNAPSHOT_BYTES = 4096;
const PNPM_INSTALL_STATE_PATH = 'node_modules/.modules.yaml';
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

function portablePath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function validEntryPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096
    && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0')
    && path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function isGeneratedPath(path) {
  return path === 'packages/search/generated'
    || path.startsWith('packages/search/generated/')
    || path === 'packages/search/src/generated'
    || path.startsWith('packages/search/src/generated/')
    || path.endsWith('.tsbuildinfo')
    || path.split('/').some((segment) => segment === 'node_modules' || segment === 'dist' || segment === '.next');
}

function isWorkerRuntimePath(path) {
  return path === 'packages/search/generated'
    || path.startsWith('packages/search/generated/')
    || path === 'packages/search/src/generated'
    || path.startsWith('packages/search/src/generated/')
    || path.split('/').some((segment) => segment === 'node_modules' || segment === 'dist');
}

function isWorkerRuntimeLeafPath(path) {
  if (path === PNPM_INSTALL_STATE_PATH) return false;
  const segments = path.split('/');
  return path === 'packages/search/generated'
    || path.startsWith('packages/search/generated/')
    || path === 'packages/search/src/generated'
    || path.startsWith('packages/search/src/generated/')
    || segments.includes('node_modules')
    || (segments.includes('dist') && path.endsWith('.js'));
}

function isMetadataPath(path) {
  return path === SOURCE_MARKER || path === MANIFEST_NAME;
}

function filesystemIdentity(info) {
  return { mode: info.mode & 0o7777, uid: info.uid, gid: info.gid };
}

function validFilesystemIdentity(value) {
  return value && Number.isSafeInteger(value.mode) && value.mode >= 0 && value.mode <= 0o7777
    && Number.isSafeInteger(value.uid) && value.uid >= 0
    && Number.isSafeInteger(value.gid) && value.gid >= 0;
}

async function sha256(path, { requireExclusiveLink = false } = {}) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  try {
    const before = await handle.stat();
    if (!before.isFile() || (requireExclusiveLink && before.nlink !== 1)) {
      throw new Error('release input is not an exclusive regular file');
    }
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (!after.isFile() || (requireExclusiveLink && after.nlink !== 1)
      || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error('release input identity changed while hashing');
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

async function canonicalRoot(root) {
  const requested = resolve(root);
  const info = await lstat(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('release source root is not a real directory');
  const canonical = await realpath(requested);
  if (canonical !== requested) throw new Error('release source root is noncanonical or has a symlink component');
  return requested;
}

async function walk(root) {
  const entries = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const handle = await opendir(directory);
    for await (const item of handle) {
      const absolute = join(directory, item.name);
      const path = portablePath(root, absolute);
      if (!validEntryPath(path)) throw new Error(`invalid release source path: ${path}`);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        entries.push({
          path, type: 'symlink', absolute, mode: info.mode & 0o7777, uid: info.uid, gid: info.gid,
        });
      } else if (info.isDirectory()) {
        entries.push({
          path, type: 'directory', absolute, mode: info.mode & 0o7777, uid: info.uid, gid: info.gid,
          dev: info.dev, ino: info.ino,
        });
        pending.push(absolute);
      } else if (info.isFile()) {
        entries.push({
          path,
          type: 'file',
          absolute,
          executable: (info.mode & 0o111) !== 0,
          mode: info.mode & 0o7777,
          uid: info.uid,
          gid: info.gid,
          nlink: info.nlink,
          dev: info.dev,
          ino: info.ino,
        });
      } else {
        throw new Error(`unsupported release source entry: ${path}`);
      }
      if (entries.length > MAX_WALK_ENTRIES) throw new Error('release source has too many entries');
    }
  }
  return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

async function verifySourceMarker(root, sourceSha) {
  const marker = join(root, SOURCE_MARKER);
  const info = await lstat(marker);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('release source marker is invalid');
  if ((await readFile(marker, 'utf8')).trim() !== sourceSha) throw new Error('release source SHA marker mismatch');
}

export async function createReleaseInputManifest({ root, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source SHA must be a full Git commit SHA');
  const canonical = await canonicalRoot(root);
  await verifySourceMarker(canonical, sourceSha);
  const walked = await walk(canonical);
  const sourceInputs = walked.filter(({ path }) => !isMetadataPath(path));
  const unsafe = sourceInputs.find(({ path, type }) => type === 'symlink' || isGeneratedPath(path));
  if (unsafe) throw new Error(`archive source contains generated content or symlink: ${unsafe.path}`);
  const entries = [];
  for (const item of sourceInputs) {
    const identity = { path: item.path, type: item.type, ...filesystemIdentity(item) };
    if (item.type === 'file') {
      if (item.nlink !== 1) throw new Error(`archive source file has unsafe hardlink count: ${item.path}`);
      identity.nlink = 1;
      identity.sha256 = await sha256(item.absolute, { requireExclusiveLink: true });
    }
    entries.push(identity);
  }
  const manifest = {
    schemaVersion: 2,
    sourceSha,
    root: filesystemIdentity(await lstat(canonical)),
    entries,
  };
  const manifestPath = join(canonical, MANIFEST_NAME);
  const temporary = `${manifestPath}.next`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o400 });
  try {
    await rename(temporary, manifestPath);
    await chmod(manifestPath, 0o444);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return manifest;
}

export async function verifyReleaseInputManifest({ root, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source SHA must be a full Git commit SHA');
  const canonical = await canonicalRoot(root);
  await verifySourceMarker(canonical, sourceSha);
  const manifestPath = join(canonical, MANIFEST_NAME);
  let manifestInfo;
  try {
    manifestInfo = await lstat(manifestPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('release input manifest is missing');
    throw error;
  }
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > MAX_MANIFEST_BYTES) {
    throw new Error('release input manifest is missing, unsafe or too large');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || Object.keys(manifest).sort().join(',') !== 'entries,root,schemaVersion,sourceSha'
    || manifest.schemaVersion !== 2 || manifest.sourceSha !== sourceSha
    || !validFilesystemIdentity(manifest.root)
    || Object.keys(manifest.root).sort().join(',') !== 'gid,mode,uid'
    || !Array.isArray(manifest.entries)
    || manifest.entries.length === 0 || manifest.entries.length > MAX_MANIFEST_ENTRIES) {
    throw new Error('release input manifest identity is invalid');
  }
  const currentRootIdentity = filesystemIdentity(await lstat(canonical));
  if (JSON.stringify(currentRootIdentity) !== JSON.stringify(manifest.root)) {
    throw new Error('release source root ownership or mode mismatch');
  }
  const expected = new Map();
  let previous = '';
  for (const entry of manifest.entries) {
    const expectedKeys = entry?.type === 'file'
      ? 'gid,mode,nlink,path,sha256,type,uid' : 'gid,mode,path,type,uid';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).sort().join(',') !== expectedKeys
      || !['file', 'directory'].includes(entry.type) || !validFilesystemIdentity(entry)
      || !validEntryPath(entry.path) || isGeneratedPath(entry.path) || isMetadataPath(entry.path)
      || (entry.type === 'file' && (entry.nlink !== 1 || !DIGEST_PATTERN.test(entry.sha256)))
      || entry.path <= previous || expected.has(entry.path)) {
      throw new Error('release input manifest entry is invalid, duplicate or unsorted');
    }
    expected.set(entry.path, entry);
    previous = entry.path;
  }
  const walked = await walk(canonical);
  for (const item of walked.filter(({ path, type }) => isGeneratedPath(path) && type === 'symlink')) {
    await generatedSymlinkIdentity(canonical, item);
  }
  const actual = walked.filter(({ path }) => !isMetadataPath(path) && !isGeneratedPath(path));
  const generatedUnsafe = walked.find(({ path, type }) => isGeneratedPath(path)
    && type === 'symlink' && !path.split('/').includes('node_modules'));
  if (generatedUnsafe) throw new Error(`unexpected generated symlink: ${generatedUnsafe.path}`);
  if (actual.some(({ type }) => type === 'symlink') || actual.length !== expected.size) {
    throw new Error('release source contains an unexpected file or symlink');
  }
  for (const item of actual) {
    const identity = expected.get(item.path);
    if (!identity) throw new Error(`release source has unmanifested content: ${item.path}`);
    const currentIdentity = { path: item.path, type: item.type, ...filesystemIdentity(item) };
    if (item.type === 'file') {
      if (item.nlink !== 1) throw new Error(`release source file has unsafe hardlink count: ${item.path}`);
      currentIdentity.nlink = 1;
      currentIdentity.sha256 = await sha256(item.absolute, { requireExclusiveLink: true });
    }
    if (JSON.stringify(currentIdentity) !== JSON.stringify(identity)) {
      throw new Error(`release source hash, ownership or mode mismatch: ${item.path}`);
    }
  }
  return manifest;
}

export function normalizedRuntimeMode(type, mode) {
  if (!['directory', 'file'].includes(type)
    || !Number.isSafeInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new Error('generated runtime mode is invalid');
  }
  const executable = type === 'directory' || (mode & 0o111) !== 0;
  return mode | 0o444 | (executable ? 0o111 : 0);
}

async function normalizeRuntimeEntry(item) {
  const normalizedMode = normalizedRuntimeMode(item.type, item.mode);
  if (normalizedMode === item.mode) return false;
  if (item.type === 'file' && item.nlink !== 1) {
    throw new Error(`generated runtime file is not an exclusive file: ${item.path}`);
  }
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    | (item.type === 'directory' ? (constants.O_DIRECTORY ?? 0) : 0);
  const handle = await open(item.absolute, flags);
  try {
    const before = await handle.stat();
    const expectedType = item.type === 'directory' ? before.isDirectory() : before.isFile();
    if (!expectedType || before.dev !== item.dev || before.ino !== item.ino
      || (item.type === 'file' && before.nlink !== 1)) {
      throw new Error(`generated runtime entry changed before permission normalization: ${item.path}`);
    }
    await handle.chmod(normalizedMode);
    const after = await handle.stat();
    if (after.dev !== before.dev || after.ino !== before.ino
      || (item.type === 'file' && after.nlink !== 1)
      || (after.mode & 0o7777) !== normalizedMode) {
      throw new Error(`generated runtime permission normalization failed: ${item.path}`);
    }
  } finally {
    await handle.close();
  }
  return true;
}

export async function normalizeReleaseRuntimePermissions({ root, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source SHA must be a full Git commit SHA');
  const canonical = await canonicalRoot(root);
  await verifySourceMarker(canonical, sourceSha);
  await verifyReleaseInputManifest({ root: canonical, sourceSha });
  const runtimeEntries = (await walk(canonical)).filter(({ path, type }) => (
    ['directory', 'file'].includes(type)
      && (type === 'directory' ? isWorkerRuntimePath(path) : isWorkerRuntimeLeafPath(path))
  ));
  if (runtimeEntries.length === 0) throw new Error('generated runtime permission set is empty');
  let normalizedEntries = 0;
  for (const item of runtimeEntries) {
    if (await normalizeRuntimeEntry(item)) normalizedEntries += 1;
  }
  const unreadable = (await walk(canonical)).find(({ path, type, mode }) => (
    (type === 'directory' ? isWorkerRuntimePath(path) : isWorkerRuntimeLeafPath(path))
      && ((type === 'directory' && (mode & 0o555) !== 0o555)
        || (type === 'file' && (mode & 0o444) !== 0o444))
  ));
  if (unreadable) throw new Error(`generated runtime entry remains unreadable: ${unreadable.path}`);
  await verifyReleaseInputManifest({ root: canonical, sourceSha });
  return { normalizedEntries, runtimeEntries: runtimeEntries.length };
}

function pathIsInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export function findUncoveredDirectorySymlinkDescendant({
  canonicalTargetPath, sourceTargets, walked,
}) {
  if (!sourceTargets.has(canonicalTargetPath) || isWorkerRuntimePath(canonicalTargetPath)) {
    return undefined;
  }
  const prefix = `${canonicalTargetPath}/`;
  return walked.find(({ path }) => path.startsWith(prefix)
    && !sourceTargets.has(path) && !isWorkerRuntimePath(path));
}

export function classifyPnpmWorkspaceCatalogSymlink({
  path, canonicalTargetPath, sourceEntries,
}) {
  const match = /^node_modules\/\.pnpm\/node_modules\/@openscience\/([^/]+)$/u.exec(path);
  if (!match) return false;
  const workspaceName = match[1];
  const expectedTargets = new Set([`apps/${workspaceName}`, `packages/${workspaceName}`]);
  const targetEntry = sourceEntries.get(canonicalTargetPath);
  const packageEntry = sourceEntries.get(`${canonicalTargetPath}/package.json`);
  if (!expectedTargets.has(canonicalTargetPath)
    || targetEntry?.type !== 'directory'
    || packageEntry?.type !== 'file') {
    throw new Error(`pnpm workspace catalog target is outside the source manifest: ${path}`);
  }
  return true;
}

async function generatedSymlinkIdentity(root, item, closure) {
  let canonicalTarget;
  try {
    canonicalTarget = await realpath(item.absolute);
  } catch {
    throw new Error(`generated runtime symlink is dangling: ${item.path}`);
  }
  if (!pathIsInside(root, canonicalTarget)) {
    throw new Error(`generated runtime symlink escaped release root: ${item.path}`);
  }
  const canonicalTargetPath = portablePath(root, canonicalTarget);
  const targetInfo = await lstat(canonicalTarget);
  const coveredRuntimeTarget = targetInfo.isDirectory()
    ? isWorkerRuntimePath(canonicalTargetPath)
    : targetInfo.isFile() && isWorkerRuntimeLeafPath(canonicalTargetPath);
  if (closure && !closure.sourceTargets.has(canonicalTargetPath) && !coveredRuntimeTarget) {
    throw new Error(`generated runtime symlink target is outside the source/runtime closure: ${item.path}`);
  }
  const pnpmWorkspaceCatalog = closure && classifyPnpmWorkspaceCatalogSymlink({
    path: item.path,
    canonicalTargetPath,
    sourceEntries: closure.sourceEntries,
  });
  if (closure && targetInfo.isDirectory() && !pnpmWorkspaceCatalog) {
    const uncovered = findUncoveredDirectorySymlinkDescendant({
      canonicalTargetPath,
      sourceTargets: closure.sourceTargets,
      walked: closure.walked,
    });
    if (uncovered) {
      throw new Error(`generated runtime symlink exposes an uncovered descendant: ${item.path}`);
    }
  }
  return {
    path: item.path,
    type: 'symlink',
    target: await readlink(item.absolute),
    canonicalTarget: canonicalTargetPath,
    mode: item.mode,
    uid: item.uid,
    gid: item.gid,
  };
}

function validateRuntimeSnapshot(value, sourceSha) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'entryCount,schemaVersion,sha256,sourceSha'
    || value.schemaVersion !== 1 || value.sourceSha !== sourceSha
    || !Number.isSafeInteger(value.entryCount) || value.entryCount <= 0
    || value.entryCount > MAX_WALK_ENTRIES || !DIGEST_PATTERN.test(value.sha256)) {
    throw new Error('generated runtime snapshot identity is invalid');
  }
  return value;
}

export async function createReleaseRuntimeSnapshot({ root, sourceSha }) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('source SHA must be a full Git commit SHA');
  const canonical = await canonicalRoot(root);
  await verifySourceMarker(canonical, sourceSha);
  const sourceManifest = await verifyReleaseInputManifest({ root: canonical, sourceSha });
  const sourceEntries = new Map(sourceManifest.entries.map((entry) => [entry.path, entry]));
  const sourceTargets = new Set(sourceEntries.keys());
  const walked = await walk(canonical);
  const runtimeLeaves = walked.filter(({ path, type }) => (
    type !== 'directory' && isWorkerRuntimeLeafPath(path)
  ));
  if (runtimeLeaves.length === 0) throw new Error('generated runtime snapshot is empty');
  const requiredDirectories = new Set();
  for (const { path } of runtimeLeaves) {
    const segments = path.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      requiredDirectories.add(segments.slice(0, length).join('/'));
    }
  }
  const rootInfo = await lstat(canonical);
  const runtimeEntries = [
    {
      path: '.', type: 'directory', absolute: canonical,
      mode: rootInfo.mode & 0o7777, uid: rootInfo.uid, gid: rootInfo.gid,
    },
    ...walked.filter(({ path, type }) => type === 'directory' && requiredDirectories.has(path)),
    ...runtimeLeaves,
  ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const aggregate = createHash('sha256');
  for (const item of runtimeEntries) {
    let identity;
    if (item.type === 'file') {
      identity = {
        path: item.path,
        type: 'file',
        sha256: await sha256(item.absolute),
        mode: item.mode,
        uid: item.uid,
        gid: item.gid,
      };
    } else if (item.type === 'symlink') {
      identity = await generatedSymlinkIdentity(canonical, item, { sourceEntries, sourceTargets, walked });
    } else if (item.type === 'directory') {
      identity = {
        path: item.path, type: 'directory', mode: item.mode, uid: item.uid, gid: item.gid,
      };
    } else {
      throw new Error(`unsupported generated runtime entry: ${item.path}`);
    }
    aggregate.update(`${JSON.stringify(identity)}\n`);
  }
  return {
    schemaVersion: 1,
    sourceSha,
    entryCount: runtimeEntries.length,
    sha256: aggregate.digest('hex'),
  };
}

export async function verifyReleaseRuntimeSnapshot({ root, sourceSha, expected }) {
  const validated = validateRuntimeSnapshot(expected, sourceSha);
  const current = await createReleaseRuntimeSnapshot({ root, sourceSha });
  if (current.entryCount !== validated.entryCount || current.sha256 !== validated.sha256) {
    throw new Error('generated runtime snapshot identity changed');
  }
  return current;
}

async function readRuntimeSnapshot(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > MAX_RUNTIME_SNAPSHOT_BYTES) {
    throw new Error('generated runtime snapshot file is unsafe');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

function parseCli(argv) {
  const [command, ...tokens] = argv;
  if (!['create', 'verify', 'runtime-normalize', 'runtime-snapshot', 'runtime-verify'].includes(command)
    || tokens.length % 2 !== 0) {
    throw new Error('usage: release-input-manifest.mjs <create|verify|runtime-normalize|runtime-snapshot|runtime-verify> --root <release-root> --sha <source-sha> [--snapshot <snapshot-path>]');
  }
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) throw new Error('invalid release input manifest arguments');
    values.set(flag, value);
  }
  const required = ['--root', '--sha'];
  const runtimeSnapshotFlags = ['--snapshot', '--snapshot-json'].filter((flag) => values.has(flag));
  if (required.some((flag) => !values.has(flag))
    || (command === 'runtime-verify'
      ? values.size !== 3 || runtimeSnapshotFlags.length !== 1
      : values.size !== 2 || runtimeSnapshotFlags.length !== 0)) {
    throw new Error('invalid release input manifest arguments');
  }
  return {
    command,
    root: values.get('--root'),
    sourceSha: values.get('--sha'),
    snapshot: values.get('--snapshot'),
    snapshotJson: values.get('--snapshot-json'),
  };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.command === 'create') await createReleaseInputManifest(options);
  else if (options.command === 'verify') await verifyReleaseInputManifest(options);
  else if (options.command === 'runtime-normalize') await normalizeReleaseRuntimePermissions(options);
  else if (options.command === 'runtime-snapshot') {
    process.stdout.write(`${JSON.stringify(await createReleaseRuntimeSnapshot(options))}\n`);
  } else {
    await verifyReleaseRuntimeSnapshot({
      ...options,
      expected: options.snapshotJson === undefined
        ? await readRuntimeSnapshot(options.snapshot)
        : JSON.parse(options.snapshotJson),
    });
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'release input manifest failed');
    process.exitCode = 65;
  });
}
