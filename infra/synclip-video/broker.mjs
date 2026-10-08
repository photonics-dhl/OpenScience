import { createHash, randomUUID } from 'node:crypto';
import { chmod, chown, mkdir, open, lstat, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SynclipVideoClient, SynclipVideoError, downloadSynclipVideo,
  validateSynclipVideoRequest, validateSynclipVideoTask,
} from '../../packages/ai-gateway/dist/synclip-video-api.js';
import { resolveSynclipImageReference } from './image-reference.mjs';

const ROOT = '/opt/openscience-synclip-video';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON = 512 * 1024, MAX_PNG = 10 * 1024 * 1024, MAX_MP4 = 256 * 1024 * 1024;
const REV = 'synclip-video-v2';
const fail = code => { throw Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function dir(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('VIDEO_DIR');
  return info;
}
async function read(path, maximum) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maximum) fail('VIDEO_FILE');
  const bytes = await readFile(path);
  if (bytes.length !== info.size) fail('VIDEO_FILE');
  return bytes;
}
async function write(path, bytes, mode = 0o600) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx', mode);
  try {
    await file.writeFile(bytes);
    // A restrictive service umask must not remove the worker's group read access.
    await file.chmod(mode);
    await file.sync();
  } finally { await file.close(); }
  await rename(temporary, path);
}
async function exclusive(path, bytes) {
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    return true;
  } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}
const json = async (path, maximum = MAX_JSON) => JSON.parse((await read(path, maximum)).toString('utf8'));
async function key(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o777) !== 0o600 || resolve(path) !== path) fail('VIDEO_KEY');
  const value = (await read(path, 4096)).toString();
  if (!/^[\x21-\x7e]{1,4096}$/u.test(value)) fail('VIDEO_KEY');
  return value;
}
function config(value) {
  if (!value || value.model !== 'ltx23' || value.resolution !== '720p' || value.referenceMode !== 'synclip-receipt'
    || typeof value.adminModelsEnabled !== 'boolean'
    || value.adapterRevision !== REV || !/^sha256:[a-f0-9]{64}$/u.test(value.rendererImage)
    || [value.inbox, value.results, value.privateRoot, value.keyPath].some(path => typeof path !== 'string' || !path.startsWith('/opt/'))) fail('VIDEO_CONFIG');
  return value;
}
async function request(directory, id) {
  const value = await json(join(directory, 'request.json'));
  if (value.schemaVersion !== 1 || value.id !== id || value.taskId !== id || value.profile !== 'content-driven-v1'
    || value.provider !== 'synclip' || value.model !== 'ltx23' || value.resolution !== '720p' || !UUID.test(id)
    || !Number.isSafeInteger(value.deadlineAt) || !Array.isArray(value.scenes) || value.scenes.length < 3 || value.scenes.length > 6
    || !value.files || !Array.isArray(value.files.scenes)) fail('VIDEO_REQUEST');
  const story = await read(join(directory, 'storyboard.json'), MAX_JSON);
  if (value.files.storyboard?.name !== 'storyboard.json' || value.files.storyboard.size !== story.length
    || value.files.storyboard.sha256 !== hash(story) || value.files.scenes.length !== value.scenes.length) fail('VIDEO_REQUEST');
  for (let i = 0; i < value.scenes.length; i++) {
    const scene = value.scenes[i], spec = value.files.scenes[i];
    const bytes = await read(join(directory, 'scene-' + i + '.png'), MAX_PNG);
    if (scene.index !== i || ![5, 10, 15].includes(scene.durationSeconds) || typeof scene.prompt !== 'string' || scene.prompt.length < 20
      || spec?.size !== bytes.length || spec.sha256 !== hash(bytes) || scene.image?.sha256 !== spec.sha256) fail('VIDEO_REQUEST');
  }
  if (hash(Buffer.from(JSON.stringify(value.files))) !== value.inputHash) fail('VIDEO_REQUEST');
  return value;
}
function checkDeadline(request, now) {
  if (now() >= request.deadlineAt) fail('DEADLINE_EXCEEDED');
}
async function prepareRequests(directory, request, apiKey, deps) {
  const prepared = [];
  const receipt = await exists(join(directory, 'synclip-receipts.json')) ? await json(join(directory, 'synclip-receipts.json')) : null;
  // Validate every locally assembled payload before marking or paying for any shot.
  for (const scene of request.scenes) {
    // Paid shots are resumed by task ID, even if their original frame URL has expired.
    if (receipt?.shots?.some(item => item.index === scene.index)) { prepared.push(undefined); continue; }
    const approvedPng = await read(join(directory, 'scene-' + scene.index + '.png'), MAX_PNG);
    const reference = await (deps.resolveReference ?? resolveSynclipImageReference)({
      requestId: scene.image?.requestId, approvedPng, apiKey, deadlineAt: request.deadlineAt,
    });
    prepared.push(validateSynclipVideoRequest({ prompt: scene.prompt, model: 'ltx23', duration: scene.durationSeconds,
      resolution: '720p', first_frame_url: reference }));
  }
  return prepared;
}
async function ffmpeg(cfg, privateDir, outDir) {
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  return new Promise((resolveRender, reject) => {
    const process = spawn('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--memory', '1g', '--memory-swap', '1g', '--cpus', '2', '--pids-limit', '128',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m', '-v', privateDir + ':/input:ro', '-v', outDir + ':/output:rw',
      '--entrypoint', '/usr/bin/ffmpeg', cfg.rendererImage, '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
      '-i', '/input/concat.txt', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '/output/result.mp4'], { stdio: ['ignore', 'ignore', 'ignore'] });
    process.once('error', reject);
    process.once('exit', code => code === 0 ? resolveRender() : reject(Error('VIDEO_RENDER')));
  });
}
async function publish(cfg, request, status, error, output) {
  const directory = join(cfg.results, request.id);
  const parent = await dir(cfg.results);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await dir(directory);
  // mkdir leaves existing modes unchanged; setgid also keeps atomic temp files in the worker group.
  await chown(directory, parent.uid, parent.gid);
  await chmod(directory, 0o2750);
  const result = { schemaVersion: 1, id: request.id, inputHash: request.inputHash, executionAttempt: request.executionAttempt,
    provider: 'synclip', model: 'ltx23', adapterRevision: REV, status,
    ...(error ? { errorCode: error } : {}), ...(output ? output.result : {}) };
  if (output) {
    await write(join(directory, 'result.mp4'), output.bytes, 0o640);
    await write(join(directory, 'metrics.json'), JSON.stringify(output.metrics), 0o640);
  }
  await write(join(directory, 'result.json'), JSON.stringify(result), 0o640);
}
async function execute(cfg, directory, request, client, prepared, deps) {
  const now = deps.now ?? Date.now;
  const shots = join(directory, 'shots'), receiptPath = join(directory, 'synclip-receipts.json');
  await mkdir(shots, { recursive: true, mode: 0o700 });
  let receipt = { id: request.id, shots: [] };
  try { receipt = await json(receiptPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const scene of request.scenes) {
    const old = receipt.shots.find(item => item.index === scene.index);
    const output = join(shots, 'shot-' + scene.index + '.mp4');
    if (old && await exists(output)) continue;
    if (!old) {
      if (cfg.adminModelsEnabled !== true) fail('SYNCLIP_VIDEO_ADMIN_ACCESS_REQUIRED');
      const attemptPath = join(directory, 'shot-' + scene.index + '.attempt.json');
      if (await exists(attemptPath)) fail('UNCERTAIN');
      checkDeadline(request, now);
      if (!await exclusive(attemptPath, JSON.stringify({ id: request.id, index: scene.index, inputHash: request.inputHash }))) fail('UNCERTAIN');
      checkDeadline(request, now);
      try {
        const made = await client.create(prepared[scene.index]);
        receipt = { ...receipt, shots: [...receipt.shots, { index: scene.index, taskId: made.task_id }] };
        await write(receiptPath, JSON.stringify(receipt));
      } catch {
        // Once POST may have started, even an invalid returned task ID cannot prove no charge.
        // Keep the attempt until a receipt is durably saved; never authorize a replacement POST.
        fail('UNCERTAIN');
      }
      await unlink(attemptPath);
    }
    const task = receipt.shots.find(item => item.index === scene.index);
    if (!task) fail('VIDEO_RECEIPT');
    for (;;) {
      checkDeadline(request, now);
      const value = validateSynclipVideoTask(await client.query(task.taskId), task.taskId);
      await write(join(directory, 'shot-' + scene.index + '.status.json'), JSON.stringify(value));
      if (value.status === 'failed') fail('PROVIDER_FAILED');
      if (value.status === 'completed') {
        await write(output, await (deps.download ?? downloadSynclipVideo)(value, { timeoutMs: 90000, now }));
        break;
      }
      await (deps.sleep ?? sleep)(Math.min(3000, Math.max(0, request.deadlineAt - now())));
    }
  }
  checkDeadline(request, now);
  await write(join(directory, 'concat.txt'), request.scenes.map(scene => "file '/input/shots/shot-" + scene.index + ".mp4'").join('\n') + '\n');
  const outDir = join(directory, 'output');
  await (deps.render ?? ffmpeg)(cfg, directory, outDir);
  const bytes = await read(join(outDir, 'result.mp4'), MAX_MP4);
  if (!bytes.subarray(4, 12).includes(Buffer.from('ftyp'))) fail('VIDEO_MP4');
  await publish(cfg, request, 'succeeded', undefined, { bytes,
    metrics: { provider: 'synclip', model: 'ltx23', shotCount: request.scenes.length, audioMode: 'provider-output-unverified' },
    result: { contentType: 'video/mp4', outputSha256: hash(bytes), outputSize: bytes.length } });
}
async function runPending(cfg, deps) {
  const now = deps.now ?? Date.now;
  const ids = [...(await readdir(cfg.inbox)).filter(id => UUID.test(id)), ...(await readdir(cfg.privateRoot)).filter(id => UUID.test(id))];
  for (const id of [...new Set(ids)].sort()) {
    // Terminal jobs remain private for recovery/audit; their inputs may be expired or archived.
    if (await exists(join(cfg.results, id, 'result.json'))) continue;
    const source = join(cfg.inbox, id), directory = join(cfg.privateRoot, id);
    if (!await exists(directory)) await rename(source, directory);
    const value = await request(directory, id);
    const started = join(directory, 'started'), hasStarted = await exists(started);
    if (hasStarted && !await exists(join(directory, 'synclip-receipts.json'))) {
      await publish(cfg, value, 'uncertain', 'UNCERTAIN');
      return { id, status: 'uncertain' };
    }
    try {
      checkDeadline(value, now);
      const apiKey = await (deps.readKey ?? key)(cfg.keyPath);
      if (cfg.adminModelsEnabled !== true && !await exists(join(directory, 'synclip-receipts.json'))) fail('SYNCLIP_VIDEO_ADMIN_ACCESS_REQUIRED');
      const prepared = await prepareRequests(directory, value, apiKey, deps);
      const client = new SynclipVideoClient({ apiKey, timeoutMs: 15000, fetch: deps.fetch, adminModelsEnabled: cfg.adminModelsEnabled });
      checkDeadline(value, now);
      if (!hasStarted && !await exclusive(started, String(now()))) fail('UNCERTAIN');
      await execute(cfg, directory, value, client, prepared, deps);
      return { id, status: 'succeeded' };
    } catch (error) {
      const uncertain = error?.message === 'UNCERTAIN' || error instanceof SynclipVideoError && error.outcome === 'uncertain';
      const code = uncertain ? 'UNCERTAIN' : error?.message === 'DEADLINE_EXCEEDED' ? 'DEADLINE_EXCEEDED' : 'EXECUTION_FAILED';
      const status = uncertain ? 'uncertain' : 'failed';
      await publish(cfg, value, status, code);
      return { id, status };
    }
  }
  return null;
}
export async function runSynclipVideoBrokerOnce(cfg, deps = {}) {
  for (const path of [cfg.inbox, cfg.results, cfg.privateRoot]) await dir(path);
  const parent = await dir(cfg.results), ready = join(cfg.results, '.ready');
  const beat = async accepting => {
    await write(ready, JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', adapterRevision: REV,
      updatedAt: (deps.now ?? Date.now)(), accepting: accepting && cfg.adminModelsEnabled === true }), 0o640);
    await chown(ready, parent.uid, parent.gid);
  };
  await beat(true);
  let pendingBeat, heartbeatError, accepting = true;
  const timer = (deps.setInterval ?? setInterval)(() => {
    pendingBeat ??= beat(true).catch(error => { heartbeatError = error; }).finally(() => { pendingBeat = undefined; });
    return pendingBeat;
  }, 15000);
  try {
    const result = await runPending(cfg, deps);
    if (heartbeatError) throw heartbeatError;
    return result;
  } catch (error) { accepting = false; throw error; }
  finally {
    (deps.clearInterval ?? clearInterval)(timer);
    await pendingBeat;
    await beat(accepting && !heartbeatError);
  }
}
export function validateSynclipVideoBrokerConfig(value) { return config(value); }
async function main() {
  if (process.getuid?.() !== 0 || process.getgid?.() !== 1000 || process.argv.length !== 4
    || process.argv[2] !== '--config' || resolve(process.argv[3]) !== ROOT + '/config.json') fail('VIDEO_CONFIG_REQUIRED');
  const path = resolve(process.argv[3]), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o777) !== 0o600) fail('VIDEO_CONFIG_PERMISSIONS');
  const cfg = config(JSON.parse((await read(path, 16384)).toString()));
  await key(cfg.keyPath);
  const result = await runSynclipVideoBrokerOnce(cfg);
  if (result) console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('SYNCLIP_VIDEO_BROKER_FAILED'); process.exitCode = 1; });
}
