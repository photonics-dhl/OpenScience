#!/usr/bin/env node

import { constants } from 'node:fs';
import { chmod, copyFile, lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CONFIG_BYTES = 1024 * 1024;

function fail() {
  throw new Error('atomic Squid config operation failed');
}

async function validateRegularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0
    || metadata.size > MAX_CONFIG_BYTES || metadata.nlink !== 1) fail();
}

async function syncFile(path) {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicCopy(source, destination) {
  await validateRegularFile(source);
  const directory = dirname(destination);
  const temporary = join(directory, `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    await chmod(temporary, 0o644);
    await syncFile(temporary);
    await rename(temporary, destination);
    await syncDirectory(directory);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

async function atomicWrite(destination, content) {
  const directory = dirname(destination);
  const temporary = join(directory, `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await syncDirectory(directory);
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

export async function snapshotConfig({
  source,
  snapshot,
  afterFileSync = async () => {},
  expectedUid,
}) {
  if (!isAbsolute(source) || !isAbsolute(snapshot) || source === snapshot) fail();
  await validateRegularFile(source);
  const content = await readFile(source);
  let handle;
  let created = false;
  let published = false;
  try {
    handle = await open(snapshot, 'wx', 0o600);
    created = true;
    await handle.writeFile(content);
    await handle.chmod(0o600);
    await handle.sync();
    await afterFileSync();
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size !== content.length || metadata.nlink !== 1
      || (process.platform !== 'win32' && (metadata.mode & 0o777) !== 0o600)
      || (expectedUid !== undefined && metadata.uid !== expectedUid)) fail();
    await handle.close();
    handle = undefined;
    await syncDirectory(dirname(snapshot));
    published = true;
  } finally {
    await handle?.close().catch(() => {});
    if (created && !published) {
      await unlink(snapshot);
      await syncDirectory(dirname(snapshot));
    }
  }
}

function validatePaths(target, rollback) {
  if (!isAbsolute(target) || !isAbsolute(rollback)
    || dirname(target) !== dirname(rollback)
    || rollback !== `${target}.openscience-rollback`) fail();
}

export async function publishConfig({
  source,
  target,
  rollback = `${target}.openscience-rollback`,
  beforeTargetCommit = async () => {},
  afterTargetCommit = async () => {},
}) {
  validatePaths(target, rollback);
  await Promise.all([validateRegularFile(source), validateRegularFile(target)]);
  await atomicCopy(target, rollback);
  await atomicWrite(`${target}.openscience-pending`, 'schema=1\n');
  await beforeTargetCommit();
  await atomicCopy(source, target);
  await afterTargetCommit();
}

export async function restoreConfig({ target, rollback = `${target}.openscience-rollback` }) {
  validatePaths(target, rollback);
  await Promise.all([validateRegularFile(target), validateRegularFile(rollback)]);
  await atomicCopy(rollback, target);
}

async function hasPendingMarker(target) {
  const pending = `${target}.openscience-pending`;
  try {
    await validateRegularFile(pending);
    if (await readFile(pending, 'utf8') !== 'schema=1\n') fail();
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function clearPendingMarker(target) {
  await unlink(`${target}.openscience-pending`);
  await syncDirectory(dirname(target));
}

export async function recoverConfig({ target, rollback = `${target}.openscience-rollback` }) {
  validatePaths(target, rollback);
  if (!await hasPendingMarker(target)) return false;
  await restoreConfig({ target, rollback });
  await clearPendingMarker(target);
  return true;
}

export async function activateConfig({
  source,
  target,
  rollback = `${target}.openscience-rollback`,
  reconfigure,
  beforeTargetCommit,
  afterTargetCommit,
}) {
  if (typeof reconfigure !== 'function') fail();
  if (await recoverConfig({ target, rollback })) await reconfigure();
  await Promise.all([validateRegularFile(source), validateRegularFile(target)]);
  const [candidate, current] = await Promise.all([readFile(source), readFile(target)]);
  if (candidate.equals(current)) {
    await reconfigure();
    return;
  }
  try {
    await publishConfig({ source, target, rollback, beforeTargetCommit, afterTargetCommit });
    await reconfigure();
    await clearPendingMarker(target);
  } catch (error) {
    if (await recoverConfig({ target, rollback })) await reconfigure();
    throw error;
  }
}

function productionReconfigure(target) {
  const result = spawnSync('/usr/sbin/squid', ['-k', 'reconfigure', '-f', target], {
    stdio: 'ignore', timeout: 10_000,
  });
  if (result.status !== 0) fail();
}

async function main(argv) {
  const [action, first, second, ...rest] = argv;
  if (rest.length !== 0) fail();
  if (action === 'activate' && first && second) {
    const target = resolve(second);
    await activateConfig({
      source: resolve(first), target, reconfigure: () => productionReconfigure(target),
    });
    return;
  }
  if (action === 'publish' && first && second) {
    await publishConfig({ source: resolve(first), target: resolve(second) });
    return;
  }
  if (action === 'snapshot' && first && second) {
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) fail();
    await snapshotConfig({ source: resolve(first), snapshot: resolve(second), expectedUid: 0 });
    return;
  }
  if (action === 'restore' && first && !second) {
    await restoreConfig({ target: resolve(first) });
    return;
  }
  if (action === 'recover' && first && !second) {
    await recoverConfig({ target: resolve(first) });
    return;
  }
  fail();
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).catch(() => {
    console.error('atomic Squid config operation failed');
    process.exitCode = 65;
  });
}
