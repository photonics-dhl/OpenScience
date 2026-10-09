#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fstatSync } from 'node:fs';
import {
  chmod, lstat, open, readFile, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PRODUCTION_LOCK_DIRECTORY = '/run/lock/openscience-production-deploy';
const PRODUCTION_ACTIVE_MARKER = '/opt/openscience/.release-id';
const PRODUCTION_JOURNAL = '/opt/openscience/.deploy-transaction.json';
const JOURNAL_PHASES = new Set(['prepared', 'migrating', 'switching', 'published']);
const NATIVE_ROOT = '/opt/openscience-hermes';
const NATIVE_TIMER = 'openscience-hermes-broker.timer';
const executeFile = promisify(execFile);

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

function exactObjectKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function invalidNativeState() {
  throw new Error('Native deployment state is invalid or changed');
}

export function validateNativeJournalState(value, candidateSha) {
  const hasInstallation = Object.hasOwn(value ?? {}, 'installation');
  if (!SHA_PATTERN.test(candidateSha)
    || !exactObjectKeys(value, ['before', 'quiesceState', 'installState', 'restoreState', 'candidateCheckpoint', ...(hasInstallation ? ['installation'] : [])])
    || !['not_started', 'quiescing', 'quiesced', 'rollback_quiescing', 'rollback_quiesced'].includes(value.quiesceState)
    || !['not_attempted', 'install_attempting', 'installed'].includes(value.installState)
    || !['not_started', 'restore_attempting', 'restored_verified'].includes(value.restoreState)
    || !(value.candidateCheckpoint === null || (typeof value.candidateCheckpoint === 'string'
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.candidateCheckpoint)
      && Number.isFinite(Date.parse(value.candidateCheckpoint)) && new Date(value.candidateCheckpoint).toISOString() === value.candidateCheckpoint))
    || !exactObjectKeys(value.before, ['runtimeId', 'skillCatalogueId', 'timerEnableState', 'timerWasActive', 'producers', 'containers'])) invalidNativeState();
  const before = value.before;
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(id);
  const absent = before.runtimeId === null && before.skillCatalogueId === null;
  if ((!absent && (!validId(before.runtimeId) || !validId(before.skillCatalogueId)))
    || !['enabled', 'enabled-runtime', 'disabled', 'not-found'].includes(before.timerEnableState)
    || typeof before.timerWasActive !== 'boolean'
    || (absent && (before.timerEnableState !== 'not-found' || before.timerWasActive))
    || (!absent && before.timerEnableState === 'not-found')
    || !exactObjectKeys(before.producers, ['api', 'web', 'agentWorker'])
    || Object.values(before.producers).some(running => typeof running !== 'boolean')
    || !exactObjectKeys(before.containers, ['api', 'web', 'agentWorker'])
    || Object.entries(before.containers).some(([service, id]) => !(id === null || /^[a-f0-9]{64}$/u.test(id))
      || (before.producers[service] && id === null))) invalidNativeState();
  const normalized = {
    before: {
      runtimeId: before.runtimeId, skillCatalogueId: before.skillCatalogueId,
      timerEnableState: before.timerEnableState, timerWasActive: before.timerWasActive,
      producers: { api: before.producers.api, web: before.producers.web, agentWorker: before.producers.agentWorker },
      containers: { api: before.containers.api, web: before.containers.web, agentWorker: before.containers.agentWorker },
    },
    quiesceState: value.quiesceState, installState: value.installState,
    restoreState: value.restoreState, candidateCheckpoint: value.candidateCheckpoint,
  };
  if (hasInstallation) {
    const receipt = value.installation;
    if (value.installState !== 'installed' || !exactObjectKeys(receipt, ['releaseSha', 'runtimeId', 'skillCatalogueId', 'timerDeferred'])
      || receipt.releaseSha !== candidateSha || receipt.runtimeId !== `installed-native-continuation-${candidateSha}`
      || receipt.skillCatalogueId !== `project-catalogue-${candidateSha}`
      || receipt.timerDeferred !== true) invalidNativeState();
    normalized.installation = { releaseSha: receipt.releaseSha, runtimeId: receipt.runtimeId,
      skillCatalogueId: receipt.skillCatalogueId, timerDeferred: true };
  }
  if ((value.installState === 'installed') !== hasInstallation
    || (value.restoreState !== 'not_started' && value.installState !== 'installed')
    || (value.candidateCheckpoint !== null && value.installState !== 'installed')
    || (value.installState !== 'not_attempted' && ['not_started', 'quiescing'].includes(value.quiesceState))
    || (value.restoreState !== 'not_started' && value.quiesceState !== 'rollback_quiesced')) invalidNativeState();
  return normalized;
}

export function preserveNativeJournalState(current, supplied, candidateSha, create) {
  if (create) {
    if (supplied === undefined) return undefined;
    const initial = validateNativeJournalState(supplied, candidateSha);
    if (initial.installState !== 'not_attempted' || initial.quiesceState !== 'not_started'
      || initial.restoreState !== 'not_started' || initial.candidateCheckpoint !== null) invalidNativeState();
    return initial;
  }
  const hadNative = Object.hasOwn(current ?? {}, 'nativeRefresh');
  if (!hadNative) {
    if (supplied !== undefined) invalidNativeState();
    return undefined;
  }
  const previous = validateNativeJournalState(current.nativeRefresh, candidateSha);
  if (supplied === undefined) return previous;
  const next = validateNativeJournalState(supplied, candidateSha);
  if (JSON.stringify(next.before) !== JSON.stringify(previous.before)
    || !validMonotonicTransition(previous.installState, next.installState, ['not_attempted', 'install_attempting', 'installed'])
    || !validMonotonicTransition(previous.restoreState, next.restoreState, ['not_started', 'restore_attempting', 'restored_verified'])
    || !validMonotonicTransition(previous.quiesceState, next.quiesceState, ['not_started', 'quiescing', 'quiesced', 'rollback_quiescing', 'rollback_quiesced'])
    || (previous.candidateCheckpoint !== null && previous.candidateCheckpoint !== next.candidateCheckpoint)
    || (next.installState === 'install_attempting' && next.quiesceState !== 'quiesced')
    || (next.restoreState !== 'not_started' && next.quiesceState !== 'rollback_quiesced')
    || (previous.installation && JSON.stringify(next.installation) !== JSON.stringify(previous.installation))) invalidNativeState();
  return next;
}

function validMonotonicTransition(previous, next, states) {
  const index = states.indexOf(previous);
  return next === previous || next === states[index + 1];
}

export function transitionNativeJournalState(value, candidateSha, action, detail) {
  const next = validateNativeJournalState(value, candidateSha);
  switch (action) {
    case 'quiesce-start':
      if (next.quiesceState !== 'not_started') invalidNativeState();
      next.quiesceState = 'quiescing'; break;
    case 'quiesce-complete':
      if (next.quiesceState !== 'quiescing') invalidNativeState();
      next.quiesceState = 'quiesced'; break;
    case 'install-start':
      if (next.quiesceState !== 'quiesced' || next.installState !== 'not_attempted') invalidNativeState();
      next.installState = 'install_attempting'; break;
    case 'install-complete':
      if (next.installState !== 'install_attempting') invalidNativeState();
      next.installState = 'installed'; next.installation = detail; break;
    case 'candidate-start':
      if (next.installState !== 'installed' || next.candidateCheckpoint !== null
        || next.restoreState !== 'not_started' || next.quiesceState !== 'quiesced') invalidNativeState();
      next.candidateCheckpoint = detail; break;
    case 'rollback-quiesce-start':
      if (next.quiesceState !== 'quiesced' || next.installState === 'install_attempting') invalidNativeState();
      next.quiesceState = 'rollback_quiescing'; break;
    case 'rollback-quiesce-complete':
      if (next.quiesceState !== 'rollback_quiescing') invalidNativeState();
      next.quiesceState = 'rollback_quiesced'; break;
    case 'restore-start':
      if (next.installState !== 'installed' || next.quiesceState !== 'rollback_quiesced' || next.restoreState !== 'not_started') invalidNativeState();
      next.restoreState = 'restore_attempting'; break;
    case 'restore-complete':
      if (next.restoreState !== 'restore_attempting'
        || !exactObjectKeys(detail, ['releaseSha', 'restored', 'timerDeferred', 'previousRuntimeId', 'previousSkillCatalogueId'])
        || detail.releaseSha !== candidateSha || detail.restored !== true || detail.timerDeferred !== true
        || detail.previousRuntimeId !== next.before.runtimeId || detail.previousSkillCatalogueId !== next.before.skillCatalogueId) invalidNativeState();
      next.restoreState = 'restored_verified'; break;
    default: invalidNativeState();
  }
  return validateNativeJournalState(next, candidateSha);
}

export function classifyNativeWorkSnapshot({ tasks, queue, processing, journals }, checkpoint) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const unfinished = task => task.status === 'pending' || task.status === 'running' || task.providerUncertain;
  const changed = value => checkpoint !== null && Date.parse(value) >= Date.parse(checkpoint);
  const safe = !tasks.some(task => task.status === 'running'
      || (unfinished(task) && changed(task.updatedAt)))
    && [...queue, ...processing].every(id => {
      const task = byId.get(id);
      return task?.status === 'pending' && !task.deletedAt && !task.providerUncertain;
    })
    && !journals.some(job => !['staging', 'pending', 'succeeded', 'failed', 'cancelled'].includes(job.state) || job.leaseToken !== null
      || job.leaseExpiresAt !== null || (!['succeeded', 'failed', 'cancelled'].includes(job.state) && changed(job.updatedAt)));
  return { safe, nativePending: tasks.some(task => task.status === 'pending' && !task.deletedAt && task.nativePending)
    || journals.some(job => job.state === 'pending' && job.kind !== 'source_parse'),
  nativeBoundPending: tasks.some(task => task.status === 'pending' && !task.deletedAt && task.nativeBound === true) };
}

async function nativeCommand(executable, args, { timeout = 30_000, allowFailure = false, env } = {}) {
  try {
    const result = await executeFile(executable, args, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env });
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure && Number.isInteger(error?.code)) return String(error.stdout ?? '').trim();
    throw new Error('Native deployment operation failed; journal retained');
  }
}

async function nativeFile(path, { optional = false } = {}) {
  let info;
  try { info = await lstat(path); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.nlink !== 1
    || (info.mode & 0o022) !== 0 || info.size > 256 * 1024 || await realpath(path) !== path) invalidNativeState();
  return readFile(path, 'utf8');
}

async function nativeBinding() {
  const text = await nativeFile(`${NATIVE_ROOT}/runtime.env`, { optional: true });
  if (text === null) return { runtimeId: null, skillCatalogueId: null };
  const pick = key => {
    const values = text.split('\n').filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1).trim());
    if (values.length !== 1) invalidNativeState();
    return values[0];
  };
  return { runtimeId: pick('HERMES_NATIVE_RUNTIME_ID'), skillCatalogueId: pick('HERMES_NATIVE_SKILL_CATALOGUE_ID') };
}

async function nativeContainers() {
  const result = {};
  for (const [key, service] of [['api', 'api'], ['web', 'web'], ['agentWorker', 'agent-worker']]) {
    const ids = await nativeCommand('docker', ['ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=openscience-prod', '--filter', 'label=com.docker.compose.oneoff=False', '--filter', `label=com.docker.compose.service=${service}`]);
    if (ids === '') { result[key] = null; continue; }
    if (!/^[a-f0-9]{64}$/u.test(ids)) invalidNativeState();
    const metadata = JSON.parse(await nativeCommand('docker', ['inspect', '--format', '{{json .}}', ids]));
    if (metadata.Id !== ids || metadata.Config?.Labels?.['com.docker.compose.service'] !== service
      || metadata.Config?.Labels?.['com.docker.compose.project'] !== 'openscience-prod'
      || metadata.HostConfig?.RestartPolicy?.Name !== 'unless-stopped'
      || !['', 'SIGTERM', '15', undefined].includes(metadata.Config?.StopSignal)
      || !['running', 'exited', 'created'].includes(metadata.State?.Status)) invalidNativeState();
    result[key] = metadata;
  }
  return result;
}

async function captureNativeState(rollbackSha) {
  const containers = await nativeContainers();
  const activity = await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true });
  if (!['active', 'inactive', 'failed', 'unknown'].includes(activity)) invalidNativeState();
  const before = { ...await nativeBinding(),
    timerEnableState: (await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value'])) === 'not-found'
      ? 'not-found' : await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true }),
    timerWasActive: activity === 'active',
    producers: {}, containers: {} };
  for (const key of ['api', 'web', 'agentWorker']) {
    before.producers[key] = containers[key]?.State.Running === true;
    before.containers[key] = containers[key]?.Id ?? null;
    if (containers[key] !== null) {
      verifyNativeContainerBinding(containers[key], { service: key === 'agentWorker' ? 'agent-worker' : key,
        releaseSha: rollbackSha, ...before, running: before.producers[key] });
    }
  }
  return { before, quiesceState: 'not_started', installState: 'not_attempted', restoreState: 'not_started', candidateCheckpoint: null };
}

async function pauseNativeProducers(state, original) {
  const containers = await nativeContainers();
  if (original && Object.keys(containers).some(key => (containers[key]?.Id ?? null) !== state.before.containers[key])) invalidNativeState();
  const running = Object.values(containers).filter(container => container?.State.Running).map(container => container.Id);
  // Docker receives an infinite daemon timeout. Only this client wait is bounded;
  // timeout cannot be interpreted as drain and never triggers docker kill.
  if (running.length) await nativeCommand('docker', ['stop', '--time', '-1', ...running], { timeout: 600_000 });
  for (const container of Object.values(containers).filter(Boolean)) {
    const stopped = JSON.parse(await nativeCommand('docker', ['inspect', '--format', '{{json .State}}', container.Id]));
    if (container.State.Running && (stopped.Status !== 'exited' || stopped.ExitCode !== 0 || stopped.OOMKilled !== false)) invalidNativeState();
    if (stopped.Running) invalidNativeState();
  }
  const after = await nativeContainers();
  if (Object.keys(containers).some(key => (after[key]?.Id ?? null) !== (containers[key]?.Id ?? null)
    || after[key]?.State.Running)) invalidNativeState();
}

async function holdNativeTimer() {
  const loaded = await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value']);
  if (loaded === 'not-found') return;
  if (loaded !== 'loaded') invalidNativeState();
  await nativeCommand('systemctl', ['stop', NATIVE_TIMER]);
  await nativeCommand('systemctl', ['disable', NATIVE_TIMER]);
  await nativeCommand('systemctl', ['disable', '--runtime', NATIVE_TIMER]);
  if (!['inactive', 'failed'].includes(await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true }))) invalidNativeState();
}

async function verifyNativeIdle() {
  const loaded = await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value']);
  if (loaded !== 'not-found' && (loaded !== 'loaded'
    || (await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true })) !== 'disabled'
    || !['inactive', 'failed'].includes(await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true })))) invalidNativeState();
  if (!['inactive', 'failed', 'unknown'].includes(await nativeCommand('systemctl', ['is-active', 'openscience-hermes-broker.service'], { allowFailure: true }))) invalidNativeState();
  if (await nativeCommand('systemctl', ['list-units', '--no-legend', '--plain', '--state=active,activating,deactivating', 'openscience-hermes@*.service'])) invalidNativeState();
  try {
    const info = await lstat(`${NATIVE_ROOT}/inbox`);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(`${NATIVE_ROOT}/inbox`)).length) invalidNativeState();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function verifyNativeBinding(expected) {
  const binding = await nativeBinding();
  if (binding.runtimeId !== expected.runtimeId || binding.skillCatalogueId !== expected.skillCatalogueId) invalidNativeState();
  if (binding.runtimeId === null) return;
  const match = /^installed-native-continuation-([a-f0-9]{40})$/u.exec(binding.runtimeId);
  if (!match || binding.skillCatalogueId !== `project-catalogue-${match[1]}`) invalidNativeState();
  const release = `${NATIVE_ROOT}/releases/${match[1]}`;
  if ((await nativeFile(`${release}/runtime/.runtime-id`)).trim() !== binding.runtimeId
    || (await nativeFile(`${release}/catalogue/.catalogue-id`)).trim() !== binding.skillCatalogueId) invalidNativeState();
  const instance = await nativeFile('/etc/systemd/system/openscience-hermes@.service');
  const broker = await nativeFile('/etc/systemd/system/openscience-hermes-broker.service');
  if (!instance.includes(`RootDirectory=${release}/root\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/runtime:/opt/hermes-agent\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/catalogue:/catalogue\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/adapter:/adapter\n`)
    || !broker.includes(`ExecStart=/usr/bin/python3 ${release}/adapter/host_broker.py\n`)) invalidNativeState();
}

export function verifyNativeContainerBinding(container, { service, releaseSha, runtimeId, skillCatalogueId, running }) {
  if (!container || container.Config?.Labels?.['com.docker.compose.service'] !== service
    || container.Config?.Labels?.['com.docker.compose.project.working_dir'] !== `/opt/openscience-releases/${releaseSha}`
    || container.State?.Running !== running || (running && container.State?.Health?.Status !== 'healthy')
    || !container.Mounts?.some(mount => mount.Type === 'bind' && mount.Source === `/opt/openscience-releases/${releaseSha}`
      && mount.Destination === '/opt/openscience' && mount.RW === false)
    || (service === 'agent-worker' && container.Config.Image !== `openscience-agent-worker:${releaseSha}`)) invalidNativeState();
  if (service === 'web') return;
  const values = (container.Config.Env ?? []).filter(value => /^HERMES_NATIVE_(?:AGENT_ENABLED|RUNTIME_ID|SKILL_CATALOGUE_ID|AGENT_MODEL|AGENT_INBOX)=/u.test(value));
  const env = new Map(values.map(value => { const split = value.indexOf('='); return [value.slice(0, split), value.slice(split + 1)]; }));
  if (values.length !== env.size) invalidNativeState();
  if (runtimeId === null) {
    if (env.get('HERMES_NATIVE_AGENT_ENABLED') === 'true' || env.get('HERMES_NATIVE_RUNTIME_ID') || env.get('HERMES_NATIVE_SKILL_CATALOGUE_ID')) invalidNativeState();
    return;
  }
  if (env.get('HERMES_NATIVE_AGENT_ENABLED') !== 'true' || env.get('HERMES_NATIVE_RUNTIME_ID') !== runtimeId
    || env.get('HERMES_NATIVE_SKILL_CATALOGUE_ID') !== skillCatalogueId || env.get('HERMES_NATIVE_AGENT_MODEL') !== 'MiniMax-M3'
    || env.get('HERMES_NATIVE_AGENT_INBOX') !== '/native-agent/inbox') invalidNativeState();
  if (service === 'agent-worker' && !container.Mounts?.some(mount => mount.Type === 'bind'
    && mount.Source === `${NATIVE_ROOT}/inbox` && mount.Destination === '/native-agent/inbox' && mount.RW === true)) invalidNativeState();
}

const NATIVE_WORK_QUERY = `
import {createPrismaClient,createRedisClient} from '@openscience/database';
import {AGENT_TASK_QUEUE,readNativeAgentExecution} from '@openscience/domain';
import {classifyNativeWorkSnapshot} from './infra/scripts/production-deploy-lock.mjs';
if(!process.env.DATABASE_URL||!process.env.REDIS_URL)throw Error('Native work configuration missing');
const prisma=createPrismaClient(),redis=createRedisClient();
try {
 const tasks=await prisma.$queryRawUnsafe("SELECT id,status,kind,deleted_at,updated_at,error, CASE WHEN result ? 'nativeAgentExecution' THEN jsonb_build_object('nativeAgentExecution',result->'nativeAgentExecution') ELSE NULL END AS result FROM agent_tasks WHERE status IN ('pending','running') OR result#>>'{nativeAgentExecution,checkpoint,state}'='started' OR error ~* 'unknown|uncertain'");
 const journals=await prisma.journalJob.findMany({select:{state:true,kind:true,leaseToken:true,leaseExpiresAt:true,updatedAt:true}});
 const [queue,processing]=await Promise.all([redis.lrange(AGENT_TASK_QUEUE,0,-1),redis.lrange(AGENT_TASK_QUEUE+':processing',0,-1)]);
 const snapshot={tasks:tasks.map(t=>{const n=readNativeAgentExecution(t.result);return{id:t.id,status:t.status,deletedAt:t.deleted_at,nativeBound:!!n,nativePending:!!n||['sdf.extract','presentation.generate'].includes(t.kind),providerUncertain:n?.checkpoint?.state==='started'||/unknown|uncertain/i.test(t.error??''),updatedAt:t.updated_at.toISOString()};}),journals:journals.map(j=>({...j,updatedAt:j.updatedAt.toISOString()})),queue,processing};
 const checkpoint=process.argv[1]==='none'?null:process.argv[1];
 const classified=classifyNativeWorkSnapshot(snapshot,checkpoint);
 const [clock]=await prisma.$queryRawUnsafe('SELECT clock_timestamp() AS now');
 process.stdout.write(JSON.stringify({...classified,dbTime:clock.now.toISOString()}));
}finally{await prisma.$disconnect();await redis.quit();}
`;

async function queryNativeWork(candidateSha, checkpoint) {
  const root = `/opt/openscience-releases/${candidateSha}`;
  const output = await nativeCommand('docker', ['compose', '--project-name', 'openscience-prod', '--project-directory', root,
    '--env-file', '/opt/openscience/.env.prod', '-f', `${root}/infra/compose/docker-compose.prod.yml`,
    'run', '--rm', '--no-deps', '-T', '-w', '/opt/openscience', '--entrypoint', 'node', 'agent-worker',
    '--input-type=module', '-e', NATIVE_WORK_QUERY, checkpoint ?? 'none'], { timeout: 120_000,
    env: { ...process.env, XGS_RELEASE_ROOT: root, XGS_RELEASE_IMAGE_TAG: candidateSha } });
  const result = JSON.parse(output);
  if (!exactObjectKeys(result, ['safe', 'nativePending', 'nativeBoundPending', 'dbTime']) || result.safe !== true
    || typeof result.nativePending !== 'boolean' || typeof result.nativeBoundPending !== 'boolean'
    || !Number.isFinite(Date.parse(result.dbTime))) invalidNativeState();
  return result;
}

function parseNativeCli(argv, command) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index + 1] || flags.has(argv[index])) invalidNativeState();
    flags.set(argv[index], argv[index + 1]);
  }
  const targetCommands = ['native-verify-stopped', 'native-api-web-ready', 'native-worker-ready', 'native-restore-timer'];
  const allowed = ['--candidate', '--rollback', '--lock-fd',
    ...(targetCommands.includes(command) ? ['--target'] : []), ...(command === 'native-original-running' ? ['--service'] : [])];
  if (flags.size !== allowed.length || [...flags.keys()].some(flag => !allowed.includes(flag))
    || !SHA_PATTERN.test(flags.get('--candidate')) || !SHA_PATTERN.test(flags.get('--rollback')) || flags.get('--lock-fd') !== '9'
    || (targetCommands.includes(command) && !['candidate', 'original'].includes(flags.get('--target')))
    || (command === 'native-original-running' && !['api', 'web', 'agent-worker'].includes(flags.get('--service')))) invalidNativeState();
  return { journalPath: PRODUCTION_JOURNAL, candidateSha: flags.get('--candidate'), rollbackSha: flags.get('--rollback'),
    lockDirectory: PRODUCTION_LOCK_DIRECTORY, lockFd: 9, requiredUid: 0,
    target: flags.get('--target'), service: flags.get('--service') };
}

async function nativeOperation(command, options) {
  await verifyProductionDeployLockOnHost(options);
  if (command === 'native-capture') {
    const state = validateNativeJournalState(await captureNativeState(options.rollbackSha), options.candidateSha);
    await verifyNativeBinding(state.before);
    return JSON.stringify(state);
  }
  const journal = await readTrustedJournal(options);
  if (journal.candidateSha !== options.candidateSha || journal.rollbackSha !== options.rollbackSha || !journal.nativeRefresh) invalidNativeState();
  let state = journal.nativeRefresh;
  const update = async (action, detail) => {
    const next = transitionNativeJournalState(state, options.candidateSha, action, detail);
    await writeProductionDeployJournal({ ...options, phase: journal.phase, create: false, native: next });
    state = next;
  };
  const expected = options.target === 'original' ? state.before : state.installation;
  if (options.target === 'original' && state.installState === 'installed' && state.restoreState !== 'restored_verified') invalidNativeState();
  const verifyContainers = async services => {
    if (!expected) invalidNativeState();
    await verifyNativeBinding(expected);
    const containers = await nativeContainers();
    for (const service of services) {
      const key = service === 'agent-worker' ? 'agentWorker' : service;
      verifyNativeContainerBinding(containers[key], { service,
        releaseSha: options.target === 'original' ? options.rollbackSha : options.candidateSha,
        ...expected, running: command === 'native-verify-stopped' ? false : state.before.producers[key] });
    }
  };
  if (command === 'native-original-running') return state.before.producers[options.service === 'agent-worker' ? 'agentWorker' : options.service] ? '1' : '0';
  if (command === 'native-pause-original') {
    if (!['migrating', 'switching'].includes(journal.phase)) invalidNativeState();
    await update('quiesce-start');
    await pauseNativeProducers(state, true);
    await holdNativeTimer(); await verifyNativeIdle();
    await update('quiesce-complete');
  } else if (command === 'native-install') {
    if (journal.phase !== 'switching') invalidNativeState();
    if (Object.values(await nativeContainers()).some(container => container?.State.Running)) invalidNativeState();
    await verifyNativeIdle();
    // The candidate schema is available only after the outer migration completes.
    // Existing Native markers pin pending tasks to their original immutable host.
    const work = await queryNativeWork(options.candidateSha, null);
    if (work.nativeBoundPending) invalidNativeState();
    const root = `/opt/openscience-releases/${options.candidateSha}`;
    const snapshot = `/opt/openscience/.native-runtime-${options.candidateSha}-${randomUUID()}.json`;
    let file, created = false;
    try {
      file = await open(snapshot, 'wx', 0o600);
      created = true;
      const receipt = await nativeCommand('/usr/bin/node', [`${root}/scripts/release-input-manifest.mjs`, 'runtime-snapshot', '--root', root, '--sha', options.candidateSha], { timeout: 900_000 });
      await file.writeFile(`${receipt}\n`); await file.sync(); await file.close(); file = undefined;
      await update('install-start');
      const installed = JSON.parse(await nativeCommand('/usr/bin/python3', ['-B', `${root}/infra/hermes-agent/install.py`, '--source', root, '--runtime-snapshot', snapshot, '--defer-timer'], { timeout: 2700_000 }));
      await update('install-complete', installed);
      await verifyNativeBinding(state.installation); await verifyNativeIdle();
    } finally { await file?.close().catch(() => {}); if (created) await rm(snapshot, { force: true }); }
  } else if (command === 'native-before-start') {
    const work = await queryNativeWork(options.candidateSha, null);
    await update('candidate-start', work.dbTime);
  } else if (command === 'native-hold-producers') {
    if (state.quiesceState === 'not_started') await update('quiesce-start');
    else if (state.quiesceState === 'quiesced') await update('rollback-quiesce-start');
    await pauseNativeProducers(state, false); await holdNativeTimer();
  } else if (command === 'native-prepare-rollback') {
    if (state.installState === 'install_attempting' || state.restoreState === 'restore_attempting'
      || ['quiescing', 'rollback_quiescing'].includes(state.quiesceState)) invalidNativeState();
    if (state.quiesceState === 'not_started') {
      await update('quiesce-start'); await pauseNativeProducers(state, true);
      await holdNativeTimer(); await verifyNativeIdle(); await update('quiesce-complete');
    }
    await update('rollback-quiesce-start');
    await pauseNativeProducers(state, false); await holdNativeTimer(); await verifyNativeIdle();
    await queryNativeWork(options.candidateSha, state.candidateCheckpoint);
    await update('rollback-quiesce-complete');
    if (state.installState === 'installed') {
      await update('restore-start');
      const restored = JSON.parse(await nativeCommand('/usr/bin/python3', ['-B', `/opt/openscience-releases/${options.candidateSha}/infra/hermes-agent/install.py`, '--restore-previous', options.candidateSha], { timeout: 900_000 }));
      await verifyNativeBinding(state.before); await verifyNativeIdle();
      await update('restore-complete', restored);
    } else await verifyNativeBinding(state.before);
  } else if (command === 'native-verify-stopped') await verifyContainers(['api', 'web', 'agent-worker']);
  else if (command === 'native-api-web-ready') await verifyContainers(['api', 'web']);
  else if (command === 'native-worker-ready') await verifyContainers(['agent-worker']);
  else if (command === 'native-restore-timer') {
    if (!expected) invalidNativeState();
    await verifyContainers(['api', 'web']);
    const work = await queryNativeWork(options.candidateSha, null);
    if (state.before.producers.agentWorker && work.nativePending && !state.before.timerWasActive) invalidNativeState();
    if (state.before.timerEnableState !== 'not-found') {
      await holdNativeTimer();
      if (state.before.timerEnableState === 'enabled') await nativeCommand('systemctl', ['enable', NATIVE_TIMER]);
      else if (state.before.timerEnableState === 'enabled-runtime') await nativeCommand('systemctl', ['enable', '--runtime', NATIVE_TIMER]);
      if (state.before.timerWasActive) await nativeCommand('systemctl', ['start', NATIVE_TIMER]);
      if ((await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true })) !== state.before.timerEnableState
        || ((await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true })) === 'active') !== state.before.timerWasActive) invalidNativeState();
    }
  } else invalidNativeState();
  return 'NATIVE_OPERATION_OK';
}

async function readTrustedJournal({ journalPath, requiredUid }) {
  const info = await lstat(journalPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== requiredUid
    || (info.mode & 0o777) !== 0o600 || await realpath(journalPath) !== journalPath) {
    throw new Error('production deploy journal is unsafe');
  }
  let journal;
  try { journal = JSON.parse(await readFile(journalPath, 'utf8')); }
  catch { throw new Error('production deploy journal identity is invalid'); }
  const hasNative = Object.hasOwn(journal ?? {}, 'nativeRefresh');
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || !exactObjectKeys(journal, ['candidateSha', 'phase', 'rollbackSha', 'schemaVersion', 'updatedAt', ...(hasNative ? ['nativeRefresh'] : [])])
    || journal.schemaVersion !== 1 || !SHA_PATTERN.test(journal.candidateSha)
    || !SHA_PATTERN.test(journal.rollbackSha) || !JOURNAL_PHASES.has(journal.phase)
    || typeof journal.updatedAt !== 'string') {
    throw new Error('production deploy journal identity is invalid');
  }
  if (hasNative) journal.nativeRefresh = validateNativeJournalState(journal.nativeRefresh, journal.candidateSha);
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
  native,
}) {
  if (!SHA_PATTERN.test(candidateSha) || !SHA_PATTERN.test(rollbackSha)
    || !JOURNAL_PHASES.has(phase) || typeof create !== 'boolean') {
    throw new Error('production deploy journal arguments are invalid');
  }
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  let current;
  if (create) {
    try {
      await lstat(journalPath);
      throw new Error('unfinished production deploy journal already exists');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } else {
    current = await readTrustedJournal({ journalPath, requiredUid });
    if (current.candidateSha !== candidateSha || current.rollbackSha !== rollbackSha) {
      throw new Error('production deploy journal belongs to another transaction');
    }
  }
  const nativeState = preserveNativeJournalState(current, native, candidateSha, create);
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
      ...(nativeState === undefined ? {} : { nativeRefresh: nativeState }),
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
  const native = current.nativeRefresh;
  if (native && (['quiescing', 'rollback_quiescing'].includes(native.quiesceState)
    || native.installState === 'install_attempting' || native.restoreState === 'restore_attempting'
    || (native.installState === 'not_attempted' && !['not_started', 'rollback_quiesced'].includes(native.quiesceState))
    || (native.installState === 'installed' && native.candidateCheckpoint === null && native.restoreState !== 'restored_verified'))) {
    throw new Error('Native deployment state is uncertain; journal retained');
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
  const hasNative = values.has('--native-state');
  const allowed = ['--journal', '--candidate', '--rollback', '--lock-fd',
    ...(command === 'journal-clear' ? [] : ['--phase', '--native-state'])];
  const expectedSize = command === 'journal-clear' ? 4 : 5 + Number(hasNative);
  if (values.size !== expectedSize || values.get('--journal') !== PRODUCTION_JOURNAL
    || [...values.keys()].some(flag => !allowed.includes(flag))
    || !values.has('--candidate') || !values.has('--rollback') || values.get('--lock-fd') !== '9'
    || (command !== 'journal-clear' && !JOURNAL_PHASES.has(values.get('--phase')))) {
    throw new Error('production deploy journal requires fixed production paths and FD9');
  }
  let native;
  if (hasNative) {
    const input = values.get('--native-state');
    if (Buffer.byteLength(input, 'utf8') > 4096) invalidNativeState();
    try { native = JSON.parse(input); } catch { invalidNativeState(); }
    native = validateNativeJournalState(native, values.get('--candidate'));
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
    ...(hasNative ? { native } : {}),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (['native-capture', 'native-pause-original', 'native-install', 'native-before-start', 'native-prepare-rollback',
    'native-hold-producers', 'native-verify-stopped', 'native-api-web-ready', 'native-worker-ready', 'native-restore-timer', 'native-original-running'].includes(argv[0])) {
    process.stdout.write(`${await nativeOperation(argv[0], parseNativeCli(argv.slice(1), argv[0]))}\n`);
  } else if (argv[0] === 'verify-state') {
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
    console.error(process.argv[2]?.startsWith('native-') ? 'Native deployment operation failed; durable journal retained'
      : error instanceof Error ? error.message : 'production deploy contract command failed');
    process.exitCode = 64;
  });
}
