#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmod, lstat, open, readFile, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyProductionDeployLockOnHost } from './production-deploy-lock.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RELEASE_IMAGE_REPOSITORIES = [
  'openscience-agent-worker',
  'openscience-document-parser',
  'openscience-embedding-worker',
];
const PATHS = {
  root: '/opt/openscience',
  releases: '/opt/openscience-releases',
  capabilities: '/opt/openscience/.release-capabilities',
  active: '/opt/openscience/.release-id',
  rollback: '/opt/openscience/.rollback-id',
  pending: '/opt/openscience/.rollback-id.pending',
  journal: '/opt/openscience/.deploy-transaction.json',
  failure: '/opt/openscience/.release-failed',
};
const LOCK_DIRECTORY = '/run/lock/openscience-production-deploy';

function requireSha(name, value) {
  if (!SHA_PATTERN.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

export function selectInactiveReleaseShas({ activeSha, rollbackSha, entries }) {
  requireSha('active release', activeSha);
  requireSha('rollback release', rollbackSha);
  if (activeSha === rollbackSha) throw new Error('active and rollback releases must differ');
  return [...new Set(entries.filter((entry) => SHA_PATTERN.test(entry)))]
    .filter((entry) => entry !== activeSha && entry !== rollbackSha)
    .sort();
}

export function deriveReleaseImageTags(sha) {
  requireSha('release image SHA', sha);
  return RELEASE_IMAGE_REPOSITORIES.map((repository) => `${repository}:${sha}`);
}

function assertPlanExcludesProtected(plan, activeSha, rollbackSha) {
  const protectedShas = new Set([activeSha, rollbackSha]);
  const protectedTag = (tag) => protectedShas.has(tag.slice(tag.lastIndexOf(':') + 1));
  if (plan.releaseShas.some((sha) => protectedShas.has(sha))
    || plan.capabilityShas.some((sha) => protectedShas.has(sha))
    || plan.imageTags.some(protectedTag)) {
    throw new Error('retention plan contains a protected release');
  }
}

export function parsePendingIntent(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('rollback pending identity is invalid');
  }
  const keys = 'candidateSha,capabilityShas,imageTags,releaseShas,rollbackSha,schemaVersion';
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== keys
    || value.schemaVersion !== 2 || !SHA_PATTERN.test(value.candidateSha)
    || !SHA_PATTERN.test(value.rollbackSha) || value.candidateSha === value.rollbackSha) {
    throw new Error('rollback pending identity is invalid');
  }
  const shaList = (candidate) => Array.isArray(candidate) && candidate.length <= 256
    && candidate.every((entry) => SHA_PATTERN.test(entry))
    && new Set(candidate).size === candidate.length
    && candidate.every((entry, index) => index === 0 || candidate[index - 1] < entry);
  if (!shaList(value.releaseShas) || !shaList(value.capabilityShas)
    || !Array.isArray(value.imageTags) || value.imageTags.length > 768
    || new Set(value.imageTags).size !== value.imageTags.length
    || value.imageTags.some((tag, index) => typeof tag !== 'string'
      || index > 0 && value.imageTags[index - 1] >= tag
      || !RELEASE_IMAGE_REPOSITORIES.some((repository) => tag.startsWith(`${repository}:`))
      || !SHA_PATTERN.test(tag.slice(tag.lastIndexOf(':') + 1)))) {
    throw new Error('rollback pending identity is invalid');
  }
  assertPlanExcludesProtected(value, value.candidateSha, value.rollbackSha);
  return value;
}

export function parseRetentionCli(argv) {
  const command = argv[0];
  const allowed = new Set(['preflight', 'prepare', 'abort', 'complete', 'resume', 'bootstrap']);
  if (!allowed.has(command)) throw new Error('production retention command is invalid');
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('production retention arguments are invalid');
    }
    values.set(flag, value);
  }
  const expectedFlags = command === 'preflight'
    ? ['--expected-active', '--lock-fd']
    : ['--expected-active', '--expected-rollback', '--lock-fd'];
  if (values.size !== expectedFlags.length || expectedFlags.some((flag) => !values.has(flag))) {
    throw new Error('production retention arguments are incomplete');
  }
  if (values.get('--lock-fd') !== '9') throw new Error('production retention requires inherited FD9');
  const result = {
    command,
    expectedActive: requireSha('expected active release', values.get('--expected-active')),
    lockFd: 9,
  };
  if (command !== 'preflight') {
    result.expectedRollback = requireSha('expected rollback release', values.get('--expected-rollback'));
    if (result.expectedActive === result.expectedRollback) {
      throw new Error('active and rollback releases must differ');
    }
  }
  return result;
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

async function syncParent(path) {
  const handle = await open(dirname(path), 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function trustedFile(path, { requiredUid = 0, exactMode, maxBytes = 16 * 1024 } = {}) {
  const info = await lstat(path);
  const mode = info.mode & 0o777;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== requiredUid
    || await realpath(path) !== resolve(path) || info.size <= 0 || info.size > maxBytes
    || (exactMode === undefined ? (mode & 0o022) !== 0 : mode !== exactMode)) {
    throw new Error(`unsafe production state file: ${basename(path)}`);
  }
  return readFile(path, 'utf8');
}

async function trustedShaMarker(path, options) {
  const value = (await trustedFile(path, options)).trim();
  return requireSha(`${basename(path)} SHA`, value);
}

async function requireAbsent(path, label) {
  if (await pathExists(path)) throw new Error(`${label} already exists`);
}

async function atomicWrite(path, source, mode = 0o600) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(source);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, mode);
    await rename(temporary, path);
    await syncParent(path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readPending(paths, expectedActive, expectedRollback) {
  const pending = parsePendingIntent(await trustedFile(paths.pending, { exactMode: 0o600 }));
  if (pending.candidateSha !== expectedActive || pending.rollbackSha !== expectedRollback) {
    throw new Error('rollback pending intent belongs to another transaction');
  }
  return pending;
}

async function readJournalIdentity(paths) {
  const journal = JSON.parse(await trustedFile(paths.journal, { exactMode: 0o600 }));
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || Object.keys(journal).sort().join(',') !== 'candidateSha,phase,rollbackSha,schemaVersion,updatedAt'
    || journal.schemaVersion !== 1 || !SHA_PATTERN.test(journal.candidateSha)
    || !SHA_PATTERN.test(journal.rollbackSha) || journal.phase !== 'published'
    || typeof journal.updatedAt !== 'string') {
    throw new Error('production deploy journal identity is invalid');
  }
  return journal;
}

function run(command, args, { accepted = [0], maxBuffer = 16 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer });
  if (!accepted.includes(result.status)) {
    throw new Error(`${command} ${args[0] ?? ''} failed with status ${result.status ?? 'signal'}`);
  }
  return result.stdout.trim();
}

function inspectContainers({ all }) {
  const ids = run('docker', ['ps', all ? '-aq' : '-q']).split(/\s+/u).filter(Boolean);
  if (ids.length === 0) return [];
  return JSON.parse(run('docker', ['inspect', ...ids]));
}

function inspectImage(tag) {
  const result = spawnSync('docker', ['image', 'inspect', tag], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 1) return undefined;
  if (result.status !== 0) throw new Error(`docker image inspect failed for ${tag}`);
  const images = JSON.parse(result.stdout);
  const id = images[0]?.Id;
  if (!IMAGE_ID_PATTERN.test(id)) throw new Error(`docker image identity is invalid for ${tag}`);
  return id;
}

function decodeMountPath(value) {
  return value.replace(/\\(040|011|012|134)/gu, (_, code) => ({
    '040': ' ', '011': '\t', '012': '\n', '134': '\\',
  })[code]);
}

export function parseMountInfo(source) {
  return source.split(/\r?\n/u).filter(Boolean).map((line) => {
    const fields = line.split(' ');
    if (fields.length < 6) throw new Error('host mountinfo is invalid');
    return decodeMountPath(fields[4]);
  });
}

function assertNoNestedMount(path, mountPoints) {
  if (mountPoints.some((mountPoint) => mountPoint === path || mountPoint.startsWith(`${path}/`))) {
    throw new Error(`release cleanup target contains a mount: ${basename(path)}`);
  }
}

async function validateReleaseRoot(path, sha, {
  requiredUid = 0,
  releasesRoot = PATHS.releases,
  mountPoints,
  requireSource = true,
} = {}) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== requiredUid
    || dirname(path) !== releasesRoot || basename(path) !== sha
    || await realpath(path) !== path) {
    throw new Error(`unsafe release root: ${sha}`);
  }
  if (mountPoints) assertNoNestedMount(path, mountPoints);
  if (requireSource && (await trustedFile(join(path, '.release-source'), { requiredUid })).trim() !== sha) {
    throw new Error(`release source identity mismatch: ${sha}`);
  }
}

async function validateTombstoneRoot(path, sha, mountPoints) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0
    || dirname(path) !== PATHS.releases || basename(path) !== `.retention-${sha}`
    || await realpath(path) !== path) {
    throw new Error(`unsafe retention tombstone: ${sha}`);
  }
  assertNoNestedMount(path, mountPoints);
}

async function validateCapability(path, { requiredUid = 0, capabilitiesRoot = PATHS.capabilities } = {}) {
  const info = await lstat(path);
  const mode = info.mode & 0o777;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== requiredUid
    || mode !== 0o644 || info.size <= 0 || info.size > 16 * 1024
    || dirname(path) !== capabilitiesRoot || await realpath(path) !== path) {
    throw new Error(`unsafe release capability: ${basename(path)}`);
  }
}

async function readReleaseCapability(sha, paths = PATHS) {
  const path = join(paths.capabilities, sha);
  await validateCapability(path, { capabilitiesRoot: paths.capabilities });
  const values = new Map();
  for (const line of (await readFile(path, 'utf8')).trim().split(/\r?\n/u)) {
    const separator = line.indexOf('=');
    if (separator <= 0 || values.has(line.slice(0, separator))) {
      throw new Error(`release capability is invalid: ${sha}`);
    }
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const expectedKeys = 'bge_m3_enabled,embedding_deploy,model_manifest_sha256,model_revision,model_version_id,package_freeze_sha256,schema,source_sha256';
  if ([...values.keys()].sort().join(',') !== expectedKeys
    || values.get('schema') !== '2'
    || !['true', 'false'].includes(values.get('embedding_deploy'))
    || !['true', 'false'].includes(values.get('bge_m3_enabled'))
    || values.get('bge_m3_enabled') === 'true' && values.get('embedding_deploy') !== 'true') {
    throw new Error(`release capability is invalid: ${sha}`);
  }
  return { embeddingDeploy: values.get('embedding_deploy') === 'true' };
}

async function protectedImageState(activeSha, rollbackSha, paths = PATHS) {
  const capabilities = new Map([
    [activeSha, await readReleaseCapability(activeSha, paths)],
    [rollbackSha, await readReleaseCapability(rollbackSha, paths)],
  ]);
  const ids = new Map();
  for (const sha of [activeSha, rollbackSha]) {
    for (const tag of deriveReleaseImageTags(sha)) {
      const imageId = inspectImage(tag);
      const embedding = tag.startsWith('openscience-embedding-worker:');
      if (!imageId && (!embedding || capabilities.get(sha).embeddingDeploy)) {
        throw new Error(`protected release image is missing: ${tag}`);
      }
      if (imageId) ids.set(tag, imageId);
    }
  }
  return { capabilities, ids };
}

async function collectRetentionPlan({ activeSha, rollbackSha, expected, paths = PATHS }) {
  if (expected) assertPlanExcludesProtected(expected, activeSha, rollbackSha);
  const entries = await readdir(paths.releases, { withFileTypes: true });
  const tombstones = entries.map((entry) => entry.name)
    .filter((name) => /^\.retention-[a-f0-9]{40}$/u.test(name));
  if (!expected && tombstones.length > 0) throw new Error('retention tombstone exists without pending intent');
  if (expected && tombstones.some((name) => !expected.releaseShas.includes(name.slice('.retention-'.length)))) {
    throw new Error('retention tombstone does not belong to pending intent');
  }
  const currentReleaseShas = selectInactiveReleaseShas({
    activeSha,
    rollbackSha,
    entries: entries.map((entry) => entry.name),
  });
  if (expected && currentReleaseShas.some((sha) => !expected.releaseShas.includes(sha))) {
    throw new Error('inactive release appeared after retention intent publication');
  }
  const releaseShas = expected ? expected.releaseShas : currentReleaseShas;
  const mountPoints = parseMountInfo(await readFile('/proc/self/mountinfo', 'utf8'));
  await validateReleaseRoot(join(paths.releases, activeSha), activeSha, { releasesRoot: paths.releases, mountPoints });
  await validateReleaseRoot(join(paths.releases, rollbackSha), rollbackSha, { releasesRoot: paths.releases, mountPoints });
  const allContainers = inspectContainers({ all: true });
  for (const sha of releaseShas) {
    const path = join(paths.releases, sha);
    const tombstone = join(paths.releases, `.retention-${sha}`);
    const originalExists = await pathExists(path);
    const tombstoneExists = await pathExists(tombstone);
    if (originalExists && tombstoneExists) throw new Error(`release and tombstone both exist: ${sha}`);
    if (originalExists) await validateReleaseRoot(path, sha, { releasesRoot: paths.releases, mountPoints });
    if (tombstoneExists) await validateTombstoneRoot(tombstone, sha, mountPoints);
    for (const target of [path, tombstone]) {
      if (allContainers.some((container) => container.Mounts?.some((mount) => mount.Source === target
        || mount.Source?.startsWith(`${target}/`)))) {
        throw new Error(`container mounts inactive release cleanup target: ${sha}`);
      }
    }
  }

  const protectedState = await protectedImageState(activeSha, rollbackSha, paths);
  const protectedImageIds = new Set(protectedState.ids.values());
  const repositoryTags = run('docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'])
    .split(/\r?\n/u).filter(Boolean);
  const currentImageTags = repositoryTags.filter((tag) => {
    const separator = tag.lastIndexOf(':');
    if (separator < 0) return false;
    const repository = tag.slice(0, separator);
    const sha = tag.slice(separator + 1);
    return RELEASE_IMAGE_REPOSITORIES.includes(repository) && SHA_PATTERN.test(sha)
      && sha !== activeSha && sha !== rollbackSha;
  }).sort();
  if (expected && currentImageTags.some((tag) => !expected.imageTags.includes(tag))) {
    throw new Error('inactive release image appeared after retention intent publication');
  }
  const imageTags = expected ? expected.imageTags : currentImageTags;
  for (const tag of imageTags) {
    const imageId = inspectImage(tag);
    if (imageId && allContainers.some((container) => container.Image === imageId)
      && !protectedImageIds.has(imageId)) {
      throw new Error(`container references inactive release image: ${tag}`);
    }
  }

  const currentCapabilityShas = [];
  if (await pathExists(paths.capabilities)) {
    for (const entry of await readdir(paths.capabilities, { withFileTypes: true })) {
      if (!SHA_PATTERN.test(entry.name) || entry.name === activeSha || entry.name === rollbackSha) continue;
      const path = join(paths.capabilities, entry.name);
      await validateCapability(path, { capabilitiesRoot: paths.capabilities });
      currentCapabilityShas.push(entry.name);
    }
  }
  currentCapabilityShas.sort();
  if (expected && currentCapabilityShas.some((sha) => !expected.capabilityShas.includes(sha))) {
    throw new Error('inactive release capability appeared after retention intent publication');
  }
  const capabilityShas = expected ? expected.capabilityShas : currentCapabilityShas;
  for (const sha of capabilityShas) {
    const path = join(paths.capabilities, sha);
    if (await pathExists(path)) await validateCapability(path, { capabilitiesRoot: paths.capabilities });
  }
  const plan = { releaseShas, imageTags, capabilityShas };
  assertPlanExcludesProtected(plan, activeSha, rollbackSha);
  return plan;
}

async function executeRetentionPlan(plan, activeSha, rollbackSha, paths = PATHS) {
  assertPlanExcludesProtected(plan, activeSha, rollbackSha);
  for (const sha of plan.releaseShas) {
    const path = join(paths.releases, sha);
    const tombstone = join(paths.releases, `.retention-${sha}`);
    if (await pathExists(path)) {
      await rename(path, tombstone);
      await syncParent(path);
    }
  }
  for (const sha of plan.releaseShas) {
    const tombstone = join(paths.releases, `.retention-${sha}`);
    if (await pathExists(tombstone)) await rm(tombstone, { recursive: true });
  }
  for (const sha of plan.capabilityShas) {
    const path = join(paths.capabilities, sha);
    if (await pathExists(path)) await rm(path);
  }
  for (const tag of plan.imageTags) {
    if (inspectImage(tag)) run('docker', ['image', 'rm', tag]);
  }
  await protectedImageState(activeSha, rollbackSha, paths);
}

async function verifyLock(lockFd) {
  await verifyProductionDeployLockOnHost({
    lockDirectory: LOCK_DIRECTORY,
    requiredUid: 0,
    lockFd,
  });
}

async function preflight({ expectedActive, lockFd }, paths = PATHS) {
  await verifyLock(lockFd);
  await requireAbsent(paths.pending, 'rollback pending intent');
  const entries = await readdir(paths.releases);
  if (entries.some((name) => /^\.retention-[a-f0-9]{40}$/u.test(name))) {
    throw new Error('retention tombstone exists without pending intent');
  }
  const active = await trustedShaMarker(paths.active);
  if (active !== expectedActive) throw new Error('active release changed before retention preflight');
  if (await pathExists(paths.rollback)) {
    const rollback = await trustedShaMarker(paths.rollback, { exactMode: 0o600 });
    if (rollback === active) throw new Error('machine rollback release equals active release');
    const mountPoints = parseMountInfo(await readFile('/proc/self/mountinfo', 'utf8'));
    await validateReleaseRoot(join(paths.releases, rollback), rollback, { releasesRoot: paths.releases, mountPoints });
    await protectedImageState(active, rollback, paths);
  }
}

async function prepare({ expectedActive, expectedRollback, lockFd }, paths = PATHS) {
  await verifyLock(lockFd);
  await requireAbsent(paths.pending, 'rollback pending intent');
  if (await trustedShaMarker(paths.active) !== expectedActive) throw new Error('active release changed before rollback intent');
  const journal = await readJournalIdentity(paths);
  if (journal.candidateSha !== expectedActive || journal.rollbackSha !== expectedRollback) {
    throw new Error('deploy journal does not match rollback intent');
  }
  if (await pathExists(paths.rollback)) await trustedShaMarker(paths.rollback, { exactMode: 0o600 });
  const plan = await collectRetentionPlan({ activeSha: expectedActive, rollbackSha: expectedRollback, paths });
  const intent = {
    schemaVersion: 2,
    candidateSha: expectedActive,
    rollbackSha: expectedRollback,
    releaseShas: plan.releaseShas,
    imageTags: plan.imageTags,
    capabilityShas: plan.capabilityShas,
  };
  parsePendingIntent(JSON.stringify(intent));
  await atomicWrite(paths.pending, `${JSON.stringify(intent)}\n`);
}

async function abort({ expectedActive, expectedRollback, lockFd }, paths = PATHS) {
  await verifyLock(lockFd);
  await readPending(paths, expectedActive, expectedRollback);
  if (await trustedShaMarker(paths.active) !== expectedRollback) {
    throw new Error('application rollback is not active before pending-intent abort');
  }
  if (await pathExists(paths.journal)) {
    const journal = await readJournalIdentity(paths);
    if (journal.candidateSha !== expectedActive || journal.rollbackSha !== expectedRollback) {
      throw new Error('deploy journal does not match pending-intent abort');
    }
  }
  await rm(paths.pending);
  await syncParent(paths.pending);
}

async function publishRollbackMarker(expectedActive, expectedRollback, paths = PATHS) {
  const pending = await readPending(paths, expectedActive, expectedRollback);
  if (await trustedShaMarker(paths.active) !== expectedActive) throw new Error('accepted release is no longer active');
  await requireAbsent(paths.journal, 'production deploy journal');
  await requireAbsent(paths.failure, 'production release failure marker');
  if (await pathExists(paths.rollback)) await trustedShaMarker(paths.rollback, { exactMode: 0o600 });
  await atomicWrite(paths.rollback, `${expectedRollback}\n`);
  return pending;
}

async function complete(options, paths = PATHS) {
  await verifyLock(options.lockFd);
  const pending = await publishRollbackMarker(options.expectedActive, options.expectedRollback, paths);
  const plan = await collectRetentionPlan({
    activeSha: options.expectedActive,
    rollbackSha: options.expectedRollback,
    expected: pending,
    paths,
  });
  await executeRetentionPlan(plan, options.expectedActive, options.expectedRollback, paths);
  await readPending(paths, options.expectedActive, options.expectedRollback);
  await rm(paths.pending);
  await syncParent(paths.pending);
  return plan;
}

async function bootstrap(options, paths = PATHS) {
  await verifyLock(options.lockFd);
  await requireAbsent(paths.pending, 'rollback pending intent');
  await requireAbsent(paths.journal, 'production deploy journal');
  await requireAbsent(paths.failure, 'production release failure marker');
  if (await trustedShaMarker(paths.active) !== options.expectedActive) throw new Error('bootstrap active release mismatch');
  if (await pathExists(paths.rollback)) throw new Error('rollback marker already exists');
  const mountPoints = parseMountInfo(await readFile('/proc/self/mountinfo', 'utf8'));
  await validateReleaseRoot(join(paths.releases, options.expectedActive), options.expectedActive, { releasesRoot: paths.releases, mountPoints });
  await validateReleaseRoot(join(paths.releases, options.expectedRollback), options.expectedRollback, { releasesRoot: paths.releases, mountPoints });
  const protectedState = await protectedImageState(options.expectedActive, options.expectedRollback, paths);
  const requiredServices = ['agent-worker', 'document-parser'];
  if (protectedState.capabilities.get(options.expectedActive).embeddingDeploy) requiredServices.push('embedding-worker');
  const containers = inspectContainers({ all: false });
  for (const service of requiredServices) {
    const container = containers.find((candidate) => candidate.Name === `/openscience-prod-${service}-1`);
    const tag = `openscience-${service}:${options.expectedActive}`;
    if (!container || container.State?.Running !== true || container.Image !== protectedState.ids.get(tag)) {
      throw new Error(`bootstrap running container identity mismatch: ${service}`);
    }
  }
  await atomicWrite(paths.rollback, `${options.expectedRollback}\n`);
}

async function main() {
  const options = parseRetentionCli(process.argv.slice(2));
  if (options.command === 'preflight') await preflight(options);
  else if (options.command === 'prepare') await prepare(options);
  else if (options.command === 'abort') await abort(options);
  else if (options.command === 'bootstrap') await bootstrap(options);
  else await complete(options);
  process.stdout.write(`PRODUCTION_RELEASE_RETENTION_${options.command.toUpperCase()}_OK\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'production release retention failed');
    process.exitCode = ['complete', 'resume'].includes(process.argv[2]) ? 78 : 65;
  });
}
