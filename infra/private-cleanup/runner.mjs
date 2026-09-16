#!/usr/bin/env node
// Host-owned, ID-only cleanup. It never accesses external ChatGPT conversations.
import { constants } from 'node:fs';
import { lstat, open, readdir, readFile, readlink, realpath, rename, unlink, rmdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';

const ROOT = '/opt/openscience-private-cleanup';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDERS = [
  { name: 'codex', base: '/opt/openscience-codex', inbox: 'inbox', results: 'results', private: 'private' },
  { name: 'video', base: '/opt/openscience-video', inbox: 'inbox', results: 'results', private: 'private', directoryInbox: true },
  { name: 'image', base: '/opt/openscience-chatgpt-browser', inbox: 'spool/inbox', results: 'spool/results', private: 'private', jobs: 'jobs' },
  { name: 'review', base: '/opt/openscience-chatgpt-browser', inbox: 'review-spool/inbox', results: 'review-spool/results', private: 'review-private', jobs: 'jobs/review' },
];
const SIGNAL_UNITS = {
  'openscience-codex-image.service': { base: '/opt/openscience-codex', script: 'runner.mjs' },
  'openscience-video-runner.service': { base: '/opt/openscience-video', script: 'video-runner.mjs' },
};
let operations = 0;
let deadline = Date.now() + 45_000;
function pending(code) { const error = new Error(code); error.code = code; throw error; }
function budget() { if (++operations > 50_000 || Date.now() > deadline) pending('SWEEP_LIMIT'); }
function safeName(name) { return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' && !/[\/\\\0]/u.test(name); }
function pointer(handle, name = '') { if (name && !safeName(name)) pending('UNSAFE_NAME'); return `/proc/self/fd/${handle.fd}${name ? `/${name}` : ''}`; }
function missing(error) { return error?.code === 'ENOENT'; }

// Every path component is opened with O_NOFOLLOW. Subsequent operations use only
// the pinned kernel directory handle, never a mutable user-controlled parent path.
async function directory(path) {
  if (!path.startsWith('/') || path.includes('..') || path.includes('\0')) pending('UNSAFE_DIRECTORY');
  let handle = await open('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const part of path.split('/').filter(Boolean)) {
      const next = await open(pointer(handle, part), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await handle.close(); handle = next;
    }
    if (await readlink(pointer(handle)) !== path) pending('DIRECTORY_MOVED');
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
async function jsonAt(parent, name, maximum = 1024 * 1024) {
  const handle = await open(pointer(parent, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum) pending('UNSAFE_RECORD');
    const bytes = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count <= maximum) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
    if (count > maximum) pending('RECORD_LIMIT');
    return JSON.parse(bytes.subarray(0, count).toString('utf8'));
  } finally { await handle.close(); }
}
async function json(path, name, maximum) { const dir = await directory(path); try { return await jsonAt(dir, name, maximum); } finally { await dir.close(); } }
async function writeJson(path, name, value) {
  const parent = await directory(path), temp = `${name}.${randomUUID()}.tmp`;
  try {
    const handle = await open(pointer(parent, temp), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o640);
    try { await handle.writeFile(JSON.stringify(value)); await handle.chown(0, 1000); await handle.chmod(0o640); await handle.sync(); } finally { await handle.close(); }
    await rename(pointer(parent, temp), pointer(parent, name)); await parent.sync();
  } finally { await parent.close(); }
}
function validateScope(scope, id) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || scope.trashEntryId !== id || !UUID.test(id)
    || Object.keys(scope).some(key => !['trashEntryId', 'workspaceId', 'researchObjectId', 'taskIds', 'artifactIds', 'assetIds'].includes(key))) pending('INVALID_SCOPE');
  for (const key of ['workspaceId', 'researchObjectId']) if (scope[key] !== undefined && !UUID.test(scope[key])) pending('INVALID_SCOPE');
  for (const key of ['taskIds', 'artifactIds', 'assetIds']) if (!Array.isArray(scope[key]) || scope[key].length > 20_000 || scope[key].some(value => typeof value !== 'string' || !UUID.test(value))) pending('INVALID_SCOPE');
  return scope;
}
async function requests() {
  const inbox = await directory(`${ROOT}/inbox`), result = [];
  try {
    const names = await readdir(pointer(inbox));
    if (names.length > 20_000) pending('QUEUE_LIMIT');
    for (const name of names.sort()) {
      if (!name.endsWith('.json') || !UUID.test(name.slice(0, -5))) continue;
      try {
        const scope = validateScope(await jsonAt(inbox, name), name.slice(0, -5));
        let receipt;
        try { receipt = await json(`${ROOT}/results`, name); } catch (error) { if (!missing(error)) receipt = null; }
        if (receipt?.schemaVersion === 1 && receipt.id === scope.trashEntryId && receipt.state === 'complete' && isDeepStrictEqual(receipt.scope, scope)) continue;
        result.push(scope);
      } catch { console.error('PRIVATE_CLEANUP_REQUEST_INVALID'); }
      if (result.length === 20) break;
    }
    return result;
  } finally { await inbox.close(); }
}
async function receipt(scope, state, reason) {
  const current = validateScope(await json(`${ROOT}/inbox`, `${scope.trashEntryId}.json`), scope.trashEntryId);
  if (!isDeepStrictEqual(current, scope)) pending('SCOPE_CHANGED');
  await writeJson(`${ROOT}/results`, `${scope.trashEntryId}.json`, { schemaVersion: 1, id: scope.trashEntryId, scope, state, ...(reason ? { reason } : {}) });
}
async function entries(path) {
  let dir;
  try { dir = await directory(path); } catch (error) { if (missing(error)) return []; throw error; }
  try { const names = await readdir(pointer(dir)); if (names.length > 20_000) pending('DIRECTORY_LIMIT'); return names; }
  finally { await dir.close(); }
}
function group(name, kind) {
  if (kind === 'quarantine') { const first = name.slice(0, 36), second = name.slice(37); return name[36] === '-' && UUID.test(first) && UUID.test(second) ? first : null; }
  if (UUID.test(name)) return name;
  if (kind === 'flat' && name[36] === '.' && UUID.test(name.slice(0, 36))) return name.slice(0, 36);
  return null;
}
function flatFile(name, id) {
  if (!name.startsWith(`${id}.`)) return false;
  const suffix = name.slice(37).replace(/\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/i, '');
  return /^(?:json|submitted\.json|source\.pdf|reference\.png|page-[1-9][0-9]*\.png)$/u.test(suffix);
}
async function catalog(provider) {
  const groups = [];
  for (const [key, relative] of Object.entries(provider).filter(([key]) => ['inbox', 'results', 'private', 'jobs'].includes(key))) {
    const root = `${provider.base}/${relative}`;
    for (const name of await entries(root)) {
      budget(); const flat = key === 'inbox' && !provider.directoryInbox;
      const id = group(name, flat ? 'flat' : 'directory');
      if (id) groups.push({ root, name, id, flat, request: flat ? (name === `${id}.json` || name === `${id}.submitted.json` ? name : null) : 'request.json' });
    }
  }
  const quarantine = `${provider.base}/${provider.private}/quarantine`;
  for (const name of await entries(quarantine)) { budget(); const id = group(name, 'quarantine'); if (id) groups.push({ root: quarantine, name, id, flat: false, request: 'request.json' }); }
  return groups;
}
async function sourceArtifact(candidate) {
  if (!candidate.request) return null;
  try {
    const request = candidate.flat ? await json(candidate.root, candidate.request, 2 * 1024 * 1024) : await json(`${candidate.root}/${candidate.name}`, candidate.request, 2 * 1024 * 1024);
    return request?.id === candidate.id && request.source && typeof request.source === 'object' && UUID.test(request.source.artifactId ?? '') ? request.source.artifactId : null;
  } catch (error) { if (missing(error)) return null; pending('UNREADABLE_JOB_OWNERSHIP'); }
}
async function resolvedJobs(scope, catalogs) {
  const jobs = Object.fromEntries(PROVIDERS.map(provider => [provider.name, new Set([...scope.taskIds, ...scope.assetIds])]));
  const filename = `${scope.trashEntryId}.json`;
  try {
    const previous = await json(`${ROOT}/state`, filename);
    if (previous?.schemaVersion !== 1 || !isDeepStrictEqual(previous.scope, scope) || !previous.jobs || Object.keys(previous.jobs).sort().join(',') !== 'codex,image,review,video') pending('RESUME_SCOPE_MISMATCH');
    for (const provider of PROVIDERS) {
      const saved = previous.jobs[provider.name];
      if (!Array.isArray(saved) || saved.length > 50_000 || saved.some(id => !UUID.test(id))) pending('INVALID_RESUME_LEDGER');
      for (const id of saved) jobs[provider.name].add(id);
    }
  } catch (error) { if (!missing(error)) throw error; }
  if (scope.artifactIds.length) {
    const artifacts = new Set(scope.artifactIds);
    for (const provider of PROVIDERS) for (const candidate of catalogs[provider.name]) {
      if (jobs[provider.name].has(candidate.id)) continue;
      if (artifacts.has(await sourceArtifact(candidate))) jobs[provider.name].add(candidate.id);
    }
  }
  // Preserve only ownership IDs before removing any source record, so partial sweeps resume safely.
  await writeJson(`${ROOT}/state`, filename, { schemaVersion: 1, scope, jobs: Object.fromEntries(PROVIDERS.map(provider => [provider.name, [...jobs[provider.name]].sort()])) });
  return jobs;
}
function protectedName(name, stat) {
  // Docker may leave an empty auth.json mount placeholder in the isolated task state.
  if (name === 'auth.json' && stat.isFile() && stat.size === 0) return false;
  return /^(?:\.env(?:\..*)?|auth\.json|credentials?(?:\..*)?|secrets?(?:\..*)?|config(?:\..*)?)$/iu.test(name);
}
async function removeChild(parent, name, device, depth = 0) {
  budget(); if (depth > 24) pending('DEPTH_LIMIT');
  let stat;
  try { stat = await lstat(pointer(parent, name)); } catch (error) { if (missing(error)) return; throw error; }
  if (stat.isSymbolicLink() || stat.dev !== device || protectedName(name, stat)) pending('PROTECTED_JOB_ENTRY');
  if (stat.isDirectory()) {
    const child = await open(pointer(parent, name), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const pinned = await child.stat();
      if (pinned.ino !== stat.ino || pinned.dev !== stat.dev) pending('JOB_CHANGED');
      for (const entry of await readdir(pointer(child))) await removeChild(child, entry, device, depth + 1);
      const current = await lstat(pointer(parent, name));
      if (current.ino !== pinned.ino || current.dev !== pinned.dev) pending('JOB_CHANGED');
      await rmdir(pointer(parent, name));
    } finally { await child.close(); }
  } else if (stat.isFile() || stat.isSocket()) await unlink(pointer(parent, name));
  else pending('SPECIAL_JOB_ENTRY');
}
async function removeCandidate(candidate) {
  if (candidate.flat && !flatFile(candidate.name, candidate.id)) pending('UNOWNED_JOB_FILE');
  const parent = await directory(candidate.root);
  try { const stat = await parent.stat(); await removeChild(parent, candidate.name, stat.dev); await parent.sync(); }
  finally { await parent.close(); }
}
async function checkOperators() {
  for (const pid of (await readdir('/proc')).filter(name => /^[1-9][0-9]*$/u.test(name))) {
    budget();
    let args;
    try { args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean); }
    catch (error) { if (missing(error) || error.code === 'ESRCH') continue; throw error; }
    if (args.some(arg => /^\/jobs\/(?:provider\/)?(?:runner|review-runner)\.cjs$/u.test(arg))
      || args.includes('/scripts/container-client.mjs') || args.includes('/scripts/video-tts.py')) pending('LOCAL_OPERATOR_ACTIVE');
  }
}
async function signalRunner(unit) {
  const allowed = SIGNAL_UNITS[unit]; if (!allowed) pending('UNKNOWN_UNIT');
  // Distribution Node packages may expose /usr/bin/node as a versioned symlink.
  // Compare the running executable with the resolved trusted entry point.
  const nodeExecutable = await realpath('/usr/bin/node');
  const cgroup = execFileSync('/usr/bin/systemctl', ['show', '--property=ControlGroup', '--value', unit], { encoding: 'utf8', timeout: 5000 }).trim();
  if (cgroup !== `/system.slice/${unit}`) pending('UNVERIFIED_CGROUP');
  const pids = (await readFile(`/sys/fs/cgroup${cgroup}/cgroup.procs`, 'utf8')).trim().split(/\s+/u).filter(Boolean);
  const matched = [];
  for (const pid of pids) {
    if (!/^[1-9][0-9]*$/u.test(pid)) pending('UNVERIFIED_PID');
    let args, membership;
    try { args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean); membership = await readFile(`/proc/${pid}/cgroup`, 'utf8'); }
    catch (error) { if (missing(error)) continue; throw error; }
    if (args.length !== 4 || args[0] !== '/usr/bin/node' || args[2] !== '--config') continue;
    const relative = args[1].slice(allowed.base.length);
    const match = /^\/releases\/([a-f0-9]{40})\/infra\/codex-image-runner\/(runner|video-runner)\.mjs$/u.exec(relative);
    if (!args[1].startsWith(`${allowed.base}/`) || !match || `${match[2]}.mjs` !== allowed.script || args[3] !== `${allowed.base}/config-${match[1]}.json`
      || !membership.split('\n').includes(`0::${cgroup}`) || await readlink(`/proc/${pid}/exe`) !== nodeExecutable) continue;
    matched.push(pid);
  }
  if (matched.length !== 1) pending('RUNNER_NOT_IDENTIFIED');
  const pid = matched[0];
  if (!(await readFile(`/proc/${pid}/cgroup`, 'utf8')).split('\n').includes(`0::${cgroup}`)) pending('RUNNER_CHANGED');
  process.kill(Number(pid), 'SIGTERM');
}
async function sweep(scopes) {
  if (process.env.PRIVATE_CLEANUP_LOCKS_HELD !== '1') pending('LOCKS_REQUIRED');
  await checkOperators();
  for (const scope of scopes) {
    operations = 0; deadline = Date.now() + 45_000;
    try {
      const catalogs = {};
      for (const provider of PROVIDERS) catalogs[provider.name] = await catalog(provider);
      const jobs = await resolvedJobs(scope, catalogs);
      for (const provider of PROVIDERS) for (const candidate of catalogs[provider.name]) if (jobs[provider.name].has(candidate.id)) await removeCandidate(candidate);
      // Re-enumerate the same fixed roots under the held leases. A late or unknown copy defers completion.
      for (const provider of PROVIDERS) if ((await catalog(provider)).some(candidate => jobs[provider.name].has(candidate.id))) pending('JOB_COPY_REMAINS');
      await receipt(scope, 'complete');
    } catch (error) { await receipt(scope, 'pending', /^[A-Z_]+$/u.test(error.code ?? '') ? error.code : 'HOST_CLEANUP_PENDING'); }
  }
}
async function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0) pending('ROOT_LINUX_REQUIRED');
  const mode = process.argv[2];
  if (mode === '--signal' && process.argv.length === 4) return signalRunner(process.argv[3]);
  if (!['--has-work', '--pending', '--sweep'].includes(mode)) pending('INVALID_MODE');
  const scopes = await requests();
  if (mode === '--has-work') { process.exitCode = scopes.length ? 0 : 3; return; }
  if (mode === '--pending') { for (const scope of scopes) await receipt(scope, 'pending', 'PROVIDER_DRAIN_OR_LOCK_PENDING'); return; }
  try { await sweep(scopes); }
  catch { for (const scope of scopes) await receipt(scope, 'pending', 'HOST_LEASE_OR_OPERATOR_PENDING'); process.exitCode = 1; }
}
main().catch(error => { console.error('PRIVATE_CLEANUP_PENDING', /^[A-Z_]+$/u.test(error.code ?? '') ? error.code : 'HOST_CLEANUP_PENDING'); process.exitCode = 1; });
