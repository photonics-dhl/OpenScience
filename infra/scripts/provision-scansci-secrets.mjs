#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chmod, lstat, link, mkdir, open, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_ROOT = '/opt/openscience-secrets/scansci';
const SECRET_FILES = new Map([
  ['serviceToken', 'scansci_service_token'],
  ['username', 'scansci_username'],
  ['password', 'scansci_password'],
  ['sessionBootstrapKey', 'scansci_session_bootstrap_key'],
]);

export function parseProvisionCli(argv) {
  if (argv.length === 0) return { replaceExisting: false };
  if (argv.length === 1 && argv[0] === '--replace-existing') return { replaceExisting: true };
  throw new Error('ScanSci Secret provision arguments are invalid');
}

function parseInput(source) {
  if (Buffer.byteLength(source, 'utf8') > 32 * 1024) throw new Error('ScanSci Secret input is invalid');
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('ScanSci Secret input is invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ScanSci Secret input is invalid');
  }
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !SECRET_FILES.has(key))) {
    throw new Error('ScanSci Secret input is invalid');
  }
  if (Object.hasOwn(value, 'username') !== Object.hasOwn(value, 'password')) {
    throw new Error('ScanSci Secret input is invalid');
  }
  for (const key of keys) {
    const secret = value[key];
    if (typeof secret !== 'string' || secret.length === 0 || secret.length > 4096
      || /[\0\r\n]/u.test(secret) || secret.trim() !== secret) {
      throw new Error(`ScanSci Secret ${key} is invalid`);
    }
  }
  return value;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertDirectoryIdentity(root, requiredUid) {
  const info = await lstat(root);
  const actual = await realpath(root);
  if (!info.isDirectory() || info.isSymbolicLink() || actual !== resolve(root)
    || requiredUid !== undefined && (info.uid !== requiredUid || process.platform !== 'win32' && info.gid !== 0)) {
    throw new Error('unsafe ScanSci Secret directory');
  }
}

export function verifyRootOwnedSecretMetadata({ isFile, symbolic, nlink, uid, gid, mode }) {
  if (!isFile || symbolic || nlink !== 1 || uid !== 0 || gid !== 0 || mode !== 0o600) {
    throw new Error('unsafe ScanSci Secret metadata');
  }
}

async function assertPrivateDirectory(root, requiredUid) {
  await assertDirectoryIdentity(root, requiredUid);
  if (process.platform !== 'win32' && ((await lstat(root)).mode & 0o777) !== 0o700) {
    throw new Error('unsafe ScanSci Secret directory');
  }
}

async function assertPrivateFile(path, root, requiredUid) {
  const info = await lstat(path);
  const mode = info.mode & 0o777;
  if (requiredUid === 0 && process.platform !== 'win32') verifyRootOwnedSecretMetadata({
    isFile: info.isFile(), symbolic: info.isSymbolicLink(), nlink: info.nlink,
    uid: info.uid, gid: info.gid, mode,
  });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || dirname(path) !== root
    || requiredUid !== undefined && (info.uid !== requiredUid || process.platform !== 'win32' && info.gid !== 0)
    || process.platform !== 'win32' && mode !== 0o600
    || await realpath(path) !== path) {
    throw new Error(`unsafe ScanSci Secret file: ${path.slice(path.lastIndexOf('/') + 1)}`);
  }
}

async function syncDirectory(root) {
  if (process.platform === 'win32') return;
  const handle = await open(root, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicPublish(path, source, replaceExisting) {
  const root = dirname(path);
  const temporary = join(root, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${source}\n`, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  try {
    if (replaceExisting) {
      await rename(temporary, path);
    } else {
      await link(temporary, path);
      await rm(temporary);
    }
    await syncDirectory(root);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function provisionScanSciSecrets({
  root = SECRET_ROOT,
  input,
  replaceExisting = false,
  requiredUid = 0,
}) {
  const values = parseInput(input);
  const parent = dirname(root);
  if (!await pathExists(parent)) await mkdir(parent, { recursive: true, mode: 0o700 });
  await assertDirectoryIdentity(parent, requiredUid);
  await chmod(parent, 0o700);
  await assertPrivateDirectory(parent, requiredUid);
  if (!await pathExists(root)) await mkdir(root, { mode: 0o700 });
  await assertDirectoryIdentity(root, requiredUid);
  await chmod(root, 0o700);
  await assertPrivateDirectory(root, requiredUid);
  const statuses = [];
  for (const [key, filename] of SECRET_FILES) {
    if (!(key in values)) continue;
    const path = join(root, filename);
    const exists = await pathExists(path);
    if (exists) {
      await assertPrivateFile(path, root, requiredUid);
      if (!replaceExisting) {
        statuses.push({ key, status: 'preserved' });
        continue;
      }
    }
    await atomicPublish(path, values[key], exists);
    await assertPrivateFile(path, root, requiredUid);
    statuses.push({ key, status: exists ? 'replaced' : 'created' });
  }
  return statuses;
}

function formatStatuses(statuses) {
  return `${statuses.map(({ key, status }) => (
    `SCANSCI_SECRET_${key.replace(/([A-Z])/gu, '_$1').toUpperCase()}_${status.toUpperCase()}`
  )).join('\n')}\n`;
}

async function main() {
  const options = parseProvisionCli(process.argv.slice(2));
  const input = readFileSync(0, 'utf8');
  const statuses = await provisionScanSciSecrets({ input, ...options });
  process.stdout.write(formatStatuses(statuses));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'ScanSci Secret provisioning failed');
    process.exitCode = 65;
  });
}
