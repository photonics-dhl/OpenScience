import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, chown, lstat, mkdir, readdir, realpath, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOne, safeRead, atomicWrite, exists } from '../codex-image-runner/core.mjs';
import { validateCodexImageRequest, validateCodexImageResult, validateImageBytes } from '../../packages/ai-gateway/dist/index.js';

const exec = promisify(execFile);
const CONVERSATION = /^https:\/\/chatgpt\.com\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOT = '/opt/openscience-chatgpt-browser/';
const RECOVERY_GRACE_MS = 60 * 60 * 1000;
async function docker(args, timeout = 30000) {
  return exec('docker', args, { timeout, maxBuffer: 32 * 1024, encoding: 'utf8' });
}
async function safeDirectory(path, uid, mode) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o777) !== mode) throw Error('DIRECTORY_PERMISSIONS');
  return stat;
}
async function prepareDirectory(path, uid) {
  await mkdir(path, { mode: 0o700 });
  await chown(path, uid, uid);
  await chmod(path, 0o700);
}
function exactInnerRequest(request) {
  return {
    id: request.id,
    provider: 'chatgpt-web',
    prompt: request.prompt,
    promptHash: request.promptHash,
    deadlineAt: request.deadlineAt,
    source: { kind: 'hermes-scene-image', requestId: request.id, promptHash: request.promptHash },
  };
}
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function validateRawPng(bytes) {
  if (bytes.length < 33 || bytes.length > 30 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('INVALID_RAW_IMAGE');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024) throw Error('INVALID_RAW_IMAGE');
}
function uncertain() {
  const error = Error('UNCERTAIN');
  error.code = 'UNCERTAIN';
  return error;
}
function isUsageLimit(error) {
  try {
    const report = JSON.parse(String(error?.stdout ?? '').trim());
    return report.error === 'USAGE_LIMIT' && ['ambiguous_no_resend', 'not_submitted'].includes(report.state);
  } catch { return false; }
}
export async function executeWebImage(config, request, privateDir) {
  validateCodexImageRequest(request, Date.now(), 'chatgpt-web');
  const circuit = join(config.privateRoot, 'web-image-circuit.json');
  if (await exists(circuit)) throw Error('WEB_IMAGE_CIRCUIT_OPEN');
  const jobDir = join(config.jobs, request.id);
  if (await exists(jobDir)) throw uncertain();
  await prepareDirectory(jobDir, 11040);
  const innerRequest = exactInnerRequest(request);
  const innerRequestPath = join(jobDir, 'request.json');
  await atomicWrite(innerRequestPath, JSON.stringify(innerRequest), 0o600);
  await chown(innerRequestPath, 11040, 11040);
  const seconds = Math.floor((request.deadlineAt - Date.now() - 45000) / 1000);
  if (seconds < 45) throw Error('EXPIRED');
  try {
    await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', String(seconds),
      'node', '/jobs/provider/runner.cjs', 'execute', request.id], (seconds + 10) * 1000);
  } catch (error) {
    if (await exists(join(jobDir, 'result.json'))) {
      // Continue into exact result verification; stdout and exit status are never success evidence.
    } else if (isUsageLimit(error)) {
      throw Error('USAGE_LIMIT');
    } else if (await exists(join(jobDir, 'submitted.json'))) {
      const remainingSeconds = Math.floor((request.deadlineAt - Date.now() - 45000) / 1000);
      if (await exists(join(jobDir, 'conversation.json')) && remainingSeconds >= 45) {
        await docker(['restart', config.browserContainer], 45000).catch(() => {});
        await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', String(remainingSeconds),
          'node', '/jobs/provider/runner.cjs', 'recover', request.id], (remainingSeconds + 10) * 1000).catch(() => {});
      }
      if (!await exists(join(jobDir, 'result.json'))) {
        await atomicWrite(circuit, JSON.stringify({ schemaVersion: 1, state: 'open', taskId: request.id,
          promptHash: request.promptHash, openedAt: Date.now(), reason: 'submitted_without_verified_png' }), 0o600);
        throw uncertain();
      }
    }
    else throw error;
  }
  return finalizeWebImage(config, request, privateDir, jobDir);
}
async function finalizeWebImage(config, request, privateDir, jobDir, operationDeadlineAt = request.deadlineAt) {
  const innerRequest = exactInnerRequest(request);
  const innerRequestPath = join(jobDir, 'request.json');
  const persistedRequest = JSON.parse((await safeRead(innerRequestPath, 32768)).toString('utf8'));
  const innerResult = JSON.parse((await safeRead(join(jobDir, 'result.json'), 32768)).toString('utf8'));
  if (!sameJson(persistedRequest, innerRequest) || innerResult?.state !== 'downloaded' || innerResult.provider !== 'chatgpt-web'
    || innerResult.id !== request.id || innerResult.promptHash !== request.promptHash || !sameJson(innerResult.source, innerRequest.source)
    || innerResult.file !== 'output/image.png' || innerResult.scientificReview !== 'pending'
    || typeof innerResult.conversation !== 'string' || !CONVERSATION.test(innerResult.conversation)
    || Object.keys(innerResult).some(key => !['state', 'provider', 'id', 'promptHash', 'source', 'conversation', 'file', 'bytes', 'width', 'height', 'scientificReview'].includes(key))) throw uncertain();
  const raw = await safeRead(join(jobDir, 'output/image.png'), 30 * 1024 * 1024);
  validateRawPng(raw);
  if (innerResult.bytes !== raw.length || innerResult.width !== raw.readUInt32BE(16) || innerResult.height !== raw.readUInt32BE(20)) throw uncertain();
  const rawPath = join(privateDir, 'browser-result.png');
  await atomicWrite(rawPath, raw, 0o444);
  // The systemd UMask intentionally tightens new files. The isolated
  // normalizer runs as uid 1000 and needs read-only access to this exact PNG.
  await chmod(rawPath, 0o444);
  const normalized = join(privateDir, 'normalized');
  await prepareDirectory(normalized, 1000);
  const container = 'xgs-chatgpt-web-normalize-' + request.id;
  try {
    await docker(['run', '--rm', '--name', container, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '512m', '--memory-swap', '512m',
      '--pids-limit', '64', '-v', rawPath + ':/input.png:ro', '-v', normalized + ':/output:rw',
      '--entrypoint', '/usr/bin/ffmpeg', config.rendererImage, '-v', 'error', '-nostdin', '-threads', '1', '-i', '/input.png',
      '-map_metadata', '-1', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xf7f2e8',
      '-frames:v', '1', '-threads', '1', '-pix_fmt', 'rgb24', '/output/result.png'],
    Math.min(45000, Math.max(1, operationDeadlineAt - Date.now())));
    return validateImageBytes(await safeRead(join(normalized, 'result.png'), 10 * 1024 * 1024)).bytes;
  } finally {
    await docker(['rm', '-f', container]).catch(() => {});
  }
}
async function recoverUncertainWebImage(config) {
  for (const id of (await readdir(config.privateRoot)).filter(name => /^[0-9a-f-]{36}$/i.test(name))) {
    const privateDir = join(config.privateRoot, id);
    try {
      const request = validateCodexImageRequest(JSON.parse((await safeRead(join(privateDir, 'request.json'), 16384)).toString('utf8')), undefined, 'chatgpt-web');
      if (request.id !== id || request.deadlineAt + RECOVERY_GRACE_MS <= Date.now()) continue;
      const resultDir = join(config.results, id);
      const result = validateCodexImageResult(JSON.parse((await safeRead(join(resultDir, 'result.json'), 16384)).toString('utf8')), 'chatgpt-web');
      if (result.id !== id || result.promptHash !== request.promptHash || result.status !== 'uncertain') continue;
      const jobDir = join(config.jobs, id);
      if (!await exists(join(jobDir, 'submitted.json')) || !await exists(join(jobDir, 'conversation.json'))
        || await exists(join(privateDir, 'late-recovery.started'))) continue;
      await atomicWrite(join(privateDir, 'late-recovery.started'), String(Date.now()), 0o600);
      if (!await exists(join(jobDir, 'result.json'))) {
        try {
          await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', '330',
            'node', '/jobs/provider/runner.cjs', 'recover-late', id], 340000);
        } catch (error) {
          if (isUsageLimit(error)) {
            await rename(join(resultDir, 'result.json'), join(resultDir, 'result.uncertain.json'));
            await atomicWrite(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web',
              id, promptHash: request.promptHash, status: 'failed', errorCode: 'USAGE_LIMIT' }));
            // Preserve the circuit: an operator can resume after the account limit recovers.
            return id;
          }
        }
      }
      if (!await exists(join(jobDir, 'result.json'))) continue;
      const bytes = await finalizeWebImage(config, request, privateDir, jobDir, Date.now() + 45_000);
      await rename(join(resultDir, 'result.json'), join(resultDir, 'result.uncertain.json'));
      await atomicWrite(join(resultDir, 'result.png'), bytes);
      await atomicWrite(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web',
        id, promptHash: request.promptHash, status: 'succeeded' }));
      const circuit = join(config.privateRoot, 'web-image-circuit.json');
      if (await exists(circuit)) {
        const state = JSON.parse((await safeRead(circuit, 16384)).toString('utf8'));
        if (state.taskId === id && state.promptHash === request.promptHash) {
          await rename(circuit, join(config.privateRoot, `web-image-circuit.resolved-${id}.json`));
        }
      }
      return id;
    } catch {}
  }
  return null;
}
async function main() {
  if (process.getuid?.() !== 0) throw Error('ROOT_BROKER_REQUIRED');
  if (process.argv.length !== 4 || process.argv[2] !== '--config') throw Error('CONFIG_REQUIRED');
  const configPath = resolve(process.argv[3]);
  const configStat = await lstat(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink() || configStat.uid !== 0 || (configStat.mode & 0o777) !== 0o600) throw Error('CONFIG_PERMISSIONS');
  const config = JSON.parse((await safeRead(configPath, 16384)).toString('utf8'));
  if (Object.keys(config).some(key => !['inbox', 'results', 'privateRoot', 'jobs', 'browserContainer', 'rendererImage'].includes(key))
    || config.browserContainer !== 'openscience-chatgpt-browser' || !/^(?:[a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$/.test(config.rendererImage || '')) throw Error('CONFIG_VALUE');
  const roots = ['inbox', 'results', 'privateRoot', 'jobs'];
  for (const key of roots) {
    const path = config[key];
    if (typeof path !== 'string' || !path.startsWith(ROOT) || path.startsWith('/opt/openscience-codex/') || await realpath(path) !== path) throw Error('CONFIG_PATH');
  }
  if (new Set(roots.map(key => config[key])).size !== roots.length) throw Error('SHARED_PATH');
  const directoryStats = [
    await safeDirectory(config.inbox, 1000, 0o700),
    await safeDirectory(config.results, 0, 0o750),
    await safeDirectory(config.privateRoot, 0, 0o700),
    await safeDirectory(config.jobs, 11040, 0o700),
  ];
  if (new Set(directoryStats.map(stat => `${stat.dev}:${stat.ino}`)).size !== directoryStats.length) throw Error('SHARED_PATH');
  const heartbeat = () => atomicWrite(join(config.results, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web', updatedAt: Date.now() }));
  await heartbeat();
  const timer = setInterval(() => { heartbeat().catch(() => {}); }, 15000);
  try {
    const recovered = await recoverUncertainWebImage(config);
    if (recovered) { console.log(JSON.stringify({ id: recovered, status: 'recovered' })); return; }
    const result = await runOne({ ...config, provider: 'chatgpt-web', execute: (request, dir) => executeWebImage(config, request, dir) });
    if (result) console.log(JSON.stringify(result));
  } finally {
    clearInterval(timer);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('WEB_IMAGE_BROKER_START_FAILED'); process.exitCode = 1; });
