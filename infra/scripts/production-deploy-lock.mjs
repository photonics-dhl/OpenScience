#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fstatSync } from 'node:fs';
import {
  chmod, lstat, open, readFile, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PRODUCTION_LOCK_DIRECTORY = '/run/lock/openscience-production-deploy';
const PRODUCTION_ACTIVE_MARKER = '/opt/openscience/.release-id';
const PRODUCTION_JOURNAL = '/opt/openscience/.deploy-transaction.json';
const JOURNAL_PHASES = new Set(['prepared', 'migrating', 'switching', 'published']);

export async function verifyProductionDeployLockOnHost({
  lockDirectory = PRODUCTION_LOCK_DIRECTORY, requiredUid = 0, lockFd,
}) {
  if (!Number.isSafeInteger(lockFd) || lockFd < 3) {
    throw new Error('production deploy inherited lock FD is invalid');
  }
  const directoryInfo = await lstat(lockDirectory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== requiredUid
    || (directoryInfo.mode & 0o777) !== 0o700 || await realpath(lockDirectory) !== lockDirectory) {
    throw new Error('production deploy lock directory is unsafe');
  }
  const lockPath = `${lockDirectory}/lock`;
  const inheritedLockInfo = fstatSync(lockFd);
  const lockInfo = await lstat(lockPath);
  if (!lockInfo.isFile() || lockInfo.isSymbolicLink() || lockInfo.nlink !== 1
    || lockInfo.uid !== requiredUid || (lockInfo.mode & 0o777) !== 0o600) {
    throw new Error('production deploy lock file is unsafe');
  }
  if (!inheritedLockInfo.isFile() || inheritedLockInfo.dev !== lockInfo.dev
    || inheritedLockInfo.ino !== lockInfo.ino) {
    throw new Error('production deploy payload did not inherit the held flock FD');
  }
  const probe = spawnSync('flock', ['-n', '-E', '73', lockPath, '-c', ':'], { stdio: 'ignore' });
  if (probe.status !== 73) throw new Error('production deploy flock is not held');
}

export async function compareAndSwapActiveRelease({
  markerPath, expectedSha, nextSha, lockDirectory, requiredUid, lockFd,
}) {
  if (!SHA_PATTERN.test(expectedSha) || !SHA_PATTERN.test(nextSha)) {
    throw new Error('active release compare-and-swap SHA is invalid');
  }
  if (lockFd !== 9) throw new Error('active release mutation requires inherited production lock FD9');
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  const canonicalMarker = resolve(markerPath);
  const markerInfo = await lstat(canonicalMarker);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.nlink !== 1
    || await realpath(canonicalMarker) !== canonicalMarker) {
    throw new Error('active release marker is unsafe');
  }
  if ((await readFile(canonicalMarker, 'utf8')).trim() !== expectedSha) {
    throw new Error('active release changed before compare-and-swap');
  }
  const temporary = `${canonicalMarker}.${process.pid}.${randomUUID()}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${nextSha}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, markerInfo.mode & 0o777);
    const currentInfo = await lstat(canonicalMarker);
    if (!currentInfo.isFile() || currentInfo.isSymbolicLink() || currentInfo.nlink !== 1
      || currentInfo.dev !== markerInfo.dev || currentInfo.ino !== markerInfo.ino
      || (await readFile(canonicalMarker, 'utf8')).trim() !== expectedSha) {
      throw new Error('active release changed during compare-and-swap');
    }
    await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
    await rename(temporary, canonicalMarker);
    await syncParent(canonicalMarker);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

async function syncParent(path) {
  const handle = await open(dirname(path), 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readTrustedJournal({ journalPath, requiredUid }) {
  const info = await lstat(journalPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== requiredUid
    || (info.mode & 0o777) !== 0o600 || await realpath(journalPath) !== journalPath) {
    throw new Error('production deploy journal is unsafe');
  }
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || Object.keys(journal).sort().join(',') !== 'candidateSha,phase,rollbackSha,schemaVersion,updatedAt'
    || journal.schemaVersion !== 1 || !SHA_PATTERN.test(journal.candidateSha)
    || !SHA_PATTERN.test(journal.rollbackSha) || !JOURNAL_PHASES.has(journal.phase)
    || typeof journal.updatedAt !== 'string') {
    throw new Error('production deploy journal identity is invalid');
  }
  return journal;
}

export async function writeProductionDeployJournal({
  journalPath,
  candidateSha,
  rollbackSha,
  phase,
  create,
  lockDirectory,
  requiredUid = 0,
  lockFd,
}) {
  if (!SHA_PATTERN.test(candidateSha) || !SHA_PATTERN.test(rollbackSha)
    || !JOURNAL_PHASES.has(phase) || typeof create !== 'boolean') {
    throw new Error('production deploy journal arguments are invalid');
  }
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  if (create) {
    try {
      await lstat(journalPath);
      throw new Error('unfinished production deploy journal already exists');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } else {
    const current = await readTrustedJournal({ journalPath, requiredUid });
    if (current.candidateSha !== candidateSha || current.rollbackSha !== rollbackSha) {
      throw new Error('production deploy journal belongs to another transaction');
    }
  }
  const temporary = `${journalPath}.${process.pid}.${randomUUID()}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      candidateSha,
      rollbackSha,
      phase,
      updatedAt: new Date().toISOString(),
    })}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
    if (create) {
      try {
        await lstat(journalPath);
        throw new Error('unfinished production deploy journal appeared during publication');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    await rename(temporary, journalPath);
    await syncParent(journalPath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function clearProductionDeployJournal({
  journalPath,
  candidateSha,
  rollbackSha,
  lockDirectory,
  requiredUid = 0,
  lockFd,
}) {
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  const current = await readTrustedJournal({ journalPath, requiredUid });
  if (current.candidateSha !== candidateSha || current.rollbackSha !== rollbackSha) {
    throw new Error('production deploy journal belongs to another transaction');
  }
  await rm(journalPath);
  await syncParent(journalPath);
}

export function validateProductionSwitchState({
  activeSha,
  rollbackSha,
  acceptedWorkerImageId,
  acceptedParserImageId,
  currentWorkerImageId,
  currentParserImageId,
  runningWorkerImageId,
  runningParserImageId,
}) {
  if (!SHA_PATTERN.test(activeSha) || !SHA_PATTERN.test(rollbackSha)
    || ![acceptedWorkerImageId, acceptedParserImageId, currentWorkerImageId, currentParserImageId]
      .every((value) => IMAGE_PATTERN.test(value))) {
    throw new Error('production switch identity is malformed');
  }
  if (activeSha !== rollbackSha) throw new Error('active release changed after deploy preflight');
  if (currentWorkerImageId !== acceptedWorkerImageId
    || currentParserImageId !== acceptedParserImageId) {
    throw new Error('release SHA image tag changed after formal acceptance');
  }
  const running = [runningWorkerImageId, runningParserImageId];
  if (running.some((value) => value !== undefined)) {
    if (!running.every((value) => IMAGE_PATTERN.test(value))) {
      throw new Error('running production image identity is malformed');
    }
    if (runningWorkerImageId !== acceptedWorkerImageId
      || runningParserImageId !== acceptedParserImageId) {
      throw new Error('running production container image differs from formal acceptance');
    }
  }
}

function parseActiveCasCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid active release compare-and-swap arguments');
    }
    values.set(flag, value);
  }
  if (values.size !== 4 || values.get('--marker') !== PRODUCTION_ACTIVE_MARKER
    || !values.has('--expected') || !values.has('--next')
    || values.get('--lock-fd') !== '9') {
    throw new Error('active release compare-and-swap requires the fixed production marker');
  }
  return {
    markerPath: values.get('--marker'), expectedSha: values.get('--expected'), nextSha: values.get('--next'),
    lockDirectory: PRODUCTION_LOCK_DIRECTORY, requiredUid: 0, lockFd: 9,
  };
}

function parseSwitchCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid production switch verifier arguments');
    }
    values.set(flag, value);
  }
  const required = [
    '--active-sha', '--rollback-sha', '--accepted-worker-image-id', '--accepted-parser-image-id',
    '--current-worker-image-id', '--current-parser-image-id',
  ];
  if (required.some((flag) => !values.has(flag))) throw new Error('production switch verifier arguments are incomplete');
  const optional = ['--running-worker-image-id', '--running-parser-image-id'];
  if ([...values.keys()].some((flag) => !required.includes(flag) && !optional.includes(flag))
    || optional.filter((flag) => values.has(flag)).length === 1) {
    throw new Error('production switch verifier arguments are invalid');
  }
  return {
    activeSha: values.get('--active-sha'),
    rollbackSha: values.get('--rollback-sha'),
    acceptedWorkerImageId: values.get('--accepted-worker-image-id'),
    acceptedParserImageId: values.get('--accepted-parser-image-id'),
    currentWorkerImageId: values.get('--current-worker-image-id'),
    currentParserImageId: values.get('--current-parser-image-id'),
    runningWorkerImageId: values.get('--running-worker-image-id'),
    runningParserImageId: values.get('--running-parser-image-id'),
  };
}

function parseJournalCli(argv, command) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid production deploy journal arguments');
    }
    values.set(flag, value);
  }
  const expectedSize = command === 'journal-clear' ? 4 : 5;
  if (values.size !== expectedSize || values.get('--journal') !== PRODUCTION_JOURNAL
    || !values.has('--candidate') || !values.has('--rollback') || values.get('--lock-fd') !== '9'
    || (command !== 'journal-clear' && !JOURNAL_PHASES.has(values.get('--phase')))) {
    throw new Error('production deploy journal requires fixed production paths and FD9');
  }
  return {
    journalPath: values.get('--journal'),
    candidateSha: values.get('--candidate'),
    rollbackSha: values.get('--rollback'),
    phase: values.get('--phase'),
    create: command === 'journal-start',
    lockDirectory: PRODUCTION_LOCK_DIRECTORY,
    requiredUid: 0,
    lockFd: 9,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'verify-state') {
    validateProductionSwitchState(parseSwitchCli(argv.slice(1)));
    process.stdout.write('PRODUCTION_SWITCH_STATE_OK\n');
  } else if (argv[0] === 'cas-active') {
    await compareAndSwapActiveRelease(parseActiveCasCli(argv.slice(1)));
    process.stdout.write('ACTIVE_RELEASE_CAS_OK\n');
  } else if (['journal-start', 'journal-update'].includes(argv[0])) {
    await writeProductionDeployJournal(parseJournalCli(argv.slice(1), argv[0]));
    process.stdout.write('PRODUCTION_DEPLOY_JOURNAL_OK\n');
  } else if (argv[0] === 'journal-clear') {
    await clearProductionDeployJournal(parseJournalCli(argv.slice(1), argv[0]));
    process.stdout.write('PRODUCTION_DEPLOY_JOURNAL_CLEARED\n');
  } else {
    throw new Error(`usage: ${basename(process.argv[1] ?? 'production-deploy-lock.mjs')} <verify-state|cas-active|journal-start|journal-update|journal-clear>`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'production deploy contract command failed');
    process.exitCode = 64;
  });
}
