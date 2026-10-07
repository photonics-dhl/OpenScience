import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { lstat, mkdir, open, readdir, realpath, chown, chmod, utimes } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOne, safeRead, atomicWrite, UUID } from '../codex-image-runner/core.mjs';
import { validateCodexImageRequest, validateCodexImageResult } from '../../packages/ai-gateway/dist/codex-image-protocol.js';
import { validateImageBytes } from '../../packages/ai-gateway/dist/image.js';
import { SYNCLIP_IMAGE_MODEL, validateSynclipTaskId } from '../../packages/ai-gateway/dist/synclip-image-api.js';
import { executeSynclipImage, resumeSynclipImage } from './transport.mjs';

export const SYNCLIP_ROOT = '/opt/openscience-synclip';
const KEY_PATH = `${SYNCLIP_ROOT}/api-key`;
const RECOVERY_GRACE_MS = 60 * 60 * 1000; // Same bounded late-result window as the existing web image broker.
const RECOVERY_OPERATION_MS = 90000;
const exec = promisify(execFile);
const uncertain = () => Object.assign(Error('UNCERTAIN'), { code: 'UNCERTAIN' });

export function validateSynclipBrokerConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'inbox,privateRoot,rendererImage,results'
    || value.inbox !== `${SYNCLIP_ROOT}/spool/inbox` || value.results !== `${SYNCLIP_ROOT}/spool/results`
    || value.privateRoot !== `${SYNCLIP_ROOT}/private`
    || !/^(?:[a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$/u.test(value.rendererImage ?? '')) throw Error('SYNCLIP_CONFIG_INVALID');
  return { inbox: value.inbox, results: value.results, privateRoot: value.privateRoot, rendererImage: value.rendererImage };
}
async function directory(path) {
  const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw uncertain(); return stat;
}
async function optional(path, max = 16384) {
  try { return await safeRead(path, max); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function exclusive(path, bytes, mode = 0o644) {
  let file;
  try { file = await open(path, 'wx', mode); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await safeRead(path, Math.max(bytes.length, 16384))).equals(bytes)) throw uncertain();
    return;
  }
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  if (process.platform !== 'win32') {
    const parent = await open(dirname(path), 'r'); try { await parent.sync(); } finally { await parent.close(); }
  }
}
async function boundRequest(config, id) {
  const privateDir = join(config.privateRoot, id); await directory(privateDir);
  const request = validateCodexImageRequest(JSON.parse((await safeRead(join(privateDir, 'request.json'), 16384)).toString('utf8')), undefined, 'synclip');
  const reserved = validateCodexImageRequest(JSON.parse((await safeRead(join(config.inbox, `${id}.submitted.json`), 16384)).toString('utf8')), undefined, 'synclip');
  if (request.id !== id || !isDeepStrictEqual(request, reserved)) throw uncertain();
  return request;
}
async function recoveryCandidate(config, id, now) {
  const request = await boundRequest(config, id); const privateDir = join(config.privateRoot, id);
  const startedText = (await safeRead(join(privateDir, 'started'), 32)).toString('utf8'); const startedAt = Number(startedText);
  if (!/^\d{1,16}$/u.test(startedText) || !Number.isSafeInteger(startedAt)
    || startedAt < request.createdAt || startedAt > now || startedAt >= request.deadlineAt) throw uncertain();
  const graceUntil = Math.min(request.deadlineAt, startedAt + 600000) + RECOVERY_GRACE_MS;
  if (now >= graceUntil) return null;
  const identity = { schemaVersion: 1, requestId: id, promptHash: request.promptHash, model: SYNCLIP_IMAGE_MODEL, aspectRatio: '16:9' };
  const attempt = JSON.parse((await safeRead(join(privateDir, 'synclip-attempt.json'), 2048)).toString('utf8'));
  const receipt = JSON.parse((await safeRead(join(privateDir, 'synclip-receipt.json'), 4096)).toString('utf8'));
  if (!isDeepStrictEqual(attempt, identity) || !isDeepStrictEqual(receipt, { ...identity, taskId: validateSynclipTaskId(receipt.taskId) })) throw uncertain();
  const resultDir = join(config.results, id);
  try { await directory(resultDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previous = await optional(join(resultDir, 'result.json'));
  if (previous) {
    const result = validateCodexImageResult(JSON.parse(previous.toString('utf8')), 'synclip');
    if (result.id !== id || result.promptHash !== request.promptHash) throw uncertain();
    if (result.status === 'succeeded') return null;
    if (result.status !== 'uncertain' && !(result.status === 'failed' && ['EXPIRED', 'EXECUTION_FAILED'].includes(result.errorCode))) throw uncertain();
  }
  return { request, taskId: receipt.taskId, privateDir, resultDir, previous, graceUntil };
}
async function publishRecovery(candidate, bytes) {
  validateImageBytes(bytes);
  try { await mkdir(candidate.resultDir, { mode: 0o755 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await directory(candidate.resultDir);
  const current = await optional(join(candidate.resultDir, 'result.json'));
  if (!isDeepStrictEqual(current, candidate.previous)) throw uncertain();
  // Never overwrite an original image or receipt. A crash at any intermediate
  // write leaves the old result recoverable on the next host scan.
  await exclusive(join(candidate.resultDir, 'result.png'), bytes);
  if (candidate.previous) await exclusive(join(candidate.resultDir, 'result.before-synclip-recovery.json'), candidate.previous);
  await atomicWrite(join(candidate.resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'synclip',
    id: candidate.request.id, promptHash: candidate.request.promptHash, status: 'succeeded' }));
}
async function readPrivateKey() {
  if (process.getuid?.() !== 0) throw Error('SYNCLIP_ROOT_REQUIRED');
  const root = await directory(SYNCLIP_ROOT); const stat = await lstat(KEY_PATH);
  if (root.uid !== 0 || (root.mode & 0o777) !== 0o700 || !stat.isFile() || stat.isSymbolicLink()
    || stat.uid !== 0 || (stat.mode & 0o777) !== 0o600 || await realpath(KEY_PATH) !== KEY_PATH) throw Error('SYNCLIP_KEY_UNAVAILABLE');
  const key = (await safeRead(KEY_PATH, 4096)).toString('utf8');
  if (!/^[\x21-\x7e]{1,4096}$/u.test(key)) throw Error('SYNCLIP_KEY_UNAVAILABLE');
  return key;
}

/** One host cycle under the installer's flock. Dependencies are local test seams,
 * never public config. API/Worker see only the existing completed spool. */
export async function runSynclipBrokerOnce(config, dependencies = {}) {
  for (const path of [config.inbox, config.results, config.privateRoot]) await directory(path);
  const now = dependencies.now ?? Date.now;
  let key;
  const transportConfig = async deadlineAt => {
    key ??= await (dependencies.readKey ?? readPrivateKey)();
    if (typeof key !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(key)) throw Error('SYNCLIP_KEY_UNAVAILABLE');
    return { apiKey: key, rendererImage: config.rendererImage, deadlineAt };
  };
  let pending = null;
  const recoveryDeadlineAt = now() + RECOVERY_OPERATION_MS;
  for (const id of (await readdir(config.privateRoot)).filter(name => UUID.test(name)).sort()) {
    if (now() >= recoveryDeadlineAt) break;
    let candidate;
    try { candidate = await recoveryCandidate(config, id, now()); } catch { continue; }
    if (!candidate) continue;
    try {
      const bytes = await (dependencies.resume ?? resumeSynclipImage)(candidate.request, candidate.privateDir,
        await transportConfig(Math.min(candidate.graceUntil, recoveryDeadlineAt)), dependencies.transportDependencies);
      if (bytes) {
        if (now() >= candidate.graceUntil) throw uncertain();
        // Re-read the immutable reservation and result immediately before adoption.
        const current = await recoveryCandidate(config, id, now());
        if (!current || !isDeepStrictEqual(current, candidate)) throw uncertain();
        await publishRecovery(candidate, bytes); return { id, status: 'reconciled' };
      }
    } catch { /* Unknown remains unknown. Never turn a failed GET into permission to POST. */ }
    pending ??= { id, status: 'recovery_pending' };
    // Pending or a failed GET cannot hide another completed original request.
    // All recovery calls share one bounded cycle before the existing fresh queue.
  }
  const result = await runOne({ ...config, provider: 'synclip', now, execute: async (request, privateDir, deadlineAt) => {
    const original = await boundRequest(config, request.id);
    if (!isDeepStrictEqual(request, original)) throw uncertain();
    return (dependencies.execute ?? executeSynclipImage)(request, privateDir, await transportConfig(deadlineAt), dependencies.transportDependencies);
  } });
  return result ?? pending;
}

async function main() {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0 || process.getgid?.() !== 1000) throw Error('SYNCLIP_ROOT_REQUIRED');
  if (process.argv.length !== 4 || process.argv[2] !== '--config'
    || resolve(process.argv[3]) !== `${SYNCLIP_ROOT}/config.json`) throw Error('SYNCLIP_CONFIG_REQUIRED');
  const configPath = resolve(process.argv[3]); const stat = await lstat(configPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o777) !== 0o600) throw Error('SYNCLIP_CONFIG_PERMISSIONS');
  const config = validateSynclipBrokerConfig(JSON.parse((await safeRead(configPath, 16384)).toString('utf8')));
  const root = await directory(SYNCLIP_ROOT);
  if (root.uid !== 0 || (root.mode & 0o777) !== 0o700) throw Error('SYNCLIP_CONFIG_PERMISSIONS');
  for (const [path, uid, mode] of [[config.inbox, 1000, 0o700], [config.results, 0, 0o750], [config.privateRoot, 0, 0o700]]) {
    const info = await directory(path);
    if (await realpath(path) !== path || info.uid !== uid || (info.mode & 0o777) !== mode
      || path === config.results && info.gid !== 1000) throw Error('SYNCLIP_DIRECTORY_PERMISSIONS');
  }
  // Validate the existing local renderer before advertising readiness or reading a key.
  await exec('docker', ['image', 'inspect', '--format', '{{.Id}}', config.rendererImage], { timeout: 15000, maxBuffer: 32768 });
  const apiKey = await readPrivateKey();
  const previousUmask = process.umask(0o027);
  let heartbeatError;
  const heartbeat = async () => {
    const path = join(config.results, '.ready');
    await atomicWrite(path, JSON.stringify({ schemaVersion: 1, provider: 'synclip', updatedAt: Date.now() }));
    await chown(path, 0, 1000); await chmod(path, 0o640);
  };
  await heartbeat();
  const timer = setInterval(() => { heartbeat().catch(error => { heartbeatError = error; }); }, 15000);
  try {
    const outcome = await runSynclipBrokerOnce(config, { readKey: async () => { if (heartbeatError) throw Error('SYNCLIP_NOT_READY'); return apiKey; } });
    if (heartbeatError) throw Error('SYNCLIP_NOT_READY');
    if (outcome) console.log(JSON.stringify(outcome));
  } catch (error) {
    await utimes(join(config.results, '.ready'), 0, 0).catch(() => {});
    throw error;
  } finally { clearInterval(timer); process.umask(previousUmask); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('SYNCLIP_BROKER_FAILED'); process.exitCode = 1; });
}
