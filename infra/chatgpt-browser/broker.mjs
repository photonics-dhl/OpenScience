import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, chown, lstat, link, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { runOne, safeRead, atomicWrite, exists, UUID } from '../codex-image-runner/core.mjs';
import { validateCodexImageRequest, validateCodexImageResult } from '../../packages/ai-gateway/dist/codex-image-protocol.js';
import { validateImageBytes } from '../../packages/ai-gateway/dist/image.js';

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
async function publishExclusive(path, bytes, mode = 0o644) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx', mode);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  try {
    await link(temporary, path);
    const parent = await open(dirname(path), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  } finally {
    await unlink(temporary);
  }
}
function reportFailure(id, phase, error) {
  // Process output may contain private input or infrastructure details. Keep
  // diagnostics to the task identity, stage and a fixed reason vocabulary.
  const code = ['ENOENT', 'EACCES', 'ENOSPC', 'EEXIST'].includes(error?.code) ? error.code
    : error?.killed ? 'TIMEOUT'
    : Number.isInteger(error?.code) ? 'PROCESS_EXIT' : 'INVALID_RESULT';
  console.error(JSON.stringify({ ...(id ? { id } : {}), phase, reason: code }));
}
async function normalizedResult(privateDir) {
  const path = join(privateDir, 'normalized', 'result.png');
  if (!await exists(path)) return null;
  return validateImageBytes(await safeRead(path, 10 * 1024 * 1024)).bytes;
}
function exactInnerRequest(request) {
  return {
    id: request.id,
    provider: 'chatgpt-web',
    prompt: request.prompt,
    promptHash: request.promptHash,
    ...(request.reference ? { reference: request.reference } : {}),
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
// Sample only the outermost pixels, so scientific objects are not extended into
// the added margin. The dominant coarse color group tolerates edge labels.
const EDGE_SAMPLE_FILTER = 'format=rgba,split=4[top][bottom][left][right];'
  + '[top]crop=iw:1:0:0,scale=16:1:flags=neighbor[t];'
  + '[bottom]crop=iw:1:0:ih-1,scale=16:1:flags=neighbor[b];'
  + '[left]crop=1:ih:0:0,transpose=1,scale=16:1:flags=neighbor[l];'
  + '[right]crop=1:ih:iw-1:0,transpose=1,scale=16:1:flags=neighbor[r];'
  + '[t][b][l][r]vstack=inputs=4,format=rgba';
function edgeBackground(bytes) {
  if (bytes.length !== 16 * 4 * 4) throw Error('INVALID_EDGE_SAMPLE');
  const groups = new Map();
  for (let offset = 0; offset < bytes.length; offset += 4) {
    if (bytes[offset + 3] < 192) continue;
    const rgb = [...bytes.subarray(offset, offset + 3)];
    const key = rgb.map(channel => channel >> 4).join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rgb);
  }
  const dominant = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  // Fully transparent artwork has no background to infer; retain the existing
  // neutral ground and composite alpha explicitly instead of dropping it.
  if (!dominant) return 'f7f2e8';
  return [0, 1, 2].map(channel => dominant.map(rgb => rgb[channel]).sort((a, b) => a - b)[Math.floor(dominant.length / 2)]
    .toString(16).padStart(2, '0')).join('');
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
  let referenceBytes;
  if (request.reference) {
    // The validated UUID selects one fixed inbox sidecar; requests never supply paths or URLs.
    const image = validateImageBytes(await safeRead(join(config.inbox, request.id + '.reference.png'), 10 * 1024 * 1024));
    if (image.contentType !== 'image/png' || createHash('sha256').update(image.bytes).digest('hex') !== request.reference.contentHash) throw Error('INVALID_REFERENCE');
    referenceBytes = image.bytes;
  }
  // Each explicit product request has its own ledger. An uncertain prior request
  // must not prevent a different request from using the browser.
  const jobDir = join(config.jobs, request.id);
  if (await exists(jobDir)) throw uncertain();
  await prepareDirectory(jobDir, 11040);
  if (referenceBytes) {
    const referencePath = join(jobDir, 'reference.png');
    await atomicWrite(referencePath, referenceBytes, 0o600);
    await chown(referencePath, 11040, 11040);
  }
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
        // Preserve the submitted page and its connection to the generator.
        // Transport/observer errors are not evidence that Chrome needs restarting.
        await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', String(remainingSeconds),
          'node', '/jobs/provider/runner.cjs', 'recover', request.id], (remainingSeconds + 10) * 1000).catch(() => {});
      }
      if (!await exists(join(jobDir, 'result.json'))) {
        throw uncertain();
      }
    }
    else throw error;
  }
  const bytes = await finalizeWebImage(config, request, privateDir, jobDir);
  // The durable PNG remains recoverable even if the original request deadline
  // expires during local normalization. Never classify it as safe to resend.
  if (Date.now() >= request.deadlineAt) throw uncertain();
  return bytes;
}
async function finalizeWebImage(config, request, privateDir, jobDir, operationDeadlineAt = request.deadlineAt, recovering = false) {
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
  const container = 'xgs-chatgpt-web-normalize-' + request.id;
  try {
    const rawPath = join(privateDir, 'browser-result.png');
    if (await exists(rawPath)) {
      if (!(await safeRead(rawPath, 30 * 1024 * 1024)).equals(raw)) throw Error('RAW_IMAGE_MISMATCH');
    } else {
      await atomicWrite(rawPath, raw, 0o444);
    }
    // UMask tightens new files; the isolated uid 1000 needs this exact PNG.
    await chmod(rawPath, 0o444);
    const normalized = join(privateDir, 'normalized');
    if (await exists(normalized)) await safeDirectory(normalized, 1000, 0o700);
    else await prepareDirectory(normalized, 1000);
    const completed = await normalizedResult(privateDir);
    if (completed) return completed;
    if (recovering) {
      // One extra local attempt within the existing grace period, never a new
      // browser submission. The caller holds the original image-runner flock.
      const marker = join(privateDir, 'normalization-recovery.started');
      if (await exists(marker)) throw Error('NORMALIZATION_RECOVERY_EXHAUSTED');
      await atomicWrite(marker, String(Date.now()), 0o600);
    }
    const rendererArgs = ['run', '--rm', '--name', container, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '512m', '--memory-swap', '512m',
      '--pids-limit', '64', '-v', rawPath + ':/input.png:ro', '-v', normalized + ':/output:rw',
      '--entrypoint', '/usr/bin/ffmpeg', config.rendererImage, '-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', '/input.png'];
    const remainingTime = () => {
      const remaining = operationDeadlineAt - Date.now();
      if (remaining <= 0) throw Error('NORMALIZATION_DEADLINE_EXPIRED');
      return Math.min(45000, remaining);
    };
    await docker([...rendererArgs, '-filter_complex_threads', '1', '-filter_complex', EDGE_SAMPLE_FILTER,
      '-frames:v', '1', '-threads', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '/output/edge-sample.rgba'], remainingTime());
    const background = edgeBackground(await safeRead(join(normalized, 'edge-sample.rgba'), 256));
    await unlink(join(normalized, 'edge-sample.rgba'));
    await docker([...rendererArgs, '-filter_complex_threads', '1', '-filter_complex',
      `color=c=0x${background}:s=1280x720,format=rgb24[ground];[0:v]scale=1280:720:force_original_aspect_ratio=decrease,format=rgba[image];[ground][image]overlay=(W-w)/2:(H-h)/2:format=rgb:shortest=1`,
      '-map_metadata', '-1',
      '-frames:v', '1', '-threads', '1', '-pix_fmt', 'rgb24', '/output/result.pending.png'],
    remainingTime());
    const bytes = validateImageBytes(await safeRead(join(normalized, 'result.pending.png'), 10 * 1024 * 1024)).bytes;
    await rename(join(normalized, 'result.pending.png'), join(normalized, 'result.png'));
    return bytes;
  } catch (error) {
    reportFailure(request.id, 'normalization', error);
    throw uncertain();
  } finally {
    await docker(['rm', '-f', container]).catch(() => {});
  }
}
async function recoverUncertainWebImage(config) {
  for (const id of (await readdir(config.privateRoot)).filter(name => UUID.test(name))) {
    const privateDir = join(config.privateRoot, id);
    try {
      const request = validateCodexImageRequest(JSON.parse((await safeRead(join(privateDir, 'request.json'), 16384)).toString('utf8')), undefined, 'chatgpt-web');
      if (request.id !== id || request.deadlineAt + RECOVERY_GRACE_MS <= Date.now()) continue;
      const resultDir = join(config.results, id);
      const resultBytes = await safeRead(join(resultDir, 'result.json'), 16384);
      const result = validateCodexImageResult(JSON.parse(resultBytes.toString('utf8')), 'chatgpt-web');
      if (result.id !== id || result.promptHash !== request.promptHash || result.status !== 'uncertain') continue;
      const jobDir = join(config.jobs, id);
      if (!await exists(join(jobDir, 'submitted.json')) || !await exists(join(jobDir, 'conversation.json'))
        || (await exists(join(privateDir, 'late-recovery.started')) && !await exists(join(jobDir, 'result.json')))) continue;
      if (!await exists(join(jobDir, 'result.json'))) {
        await atomicWrite(join(privateDir, 'late-recovery.started'), String(Date.now()), 0o600);
        try {
          await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', '330',
            'node', '/jobs/provider/runner.cjs', 'recover-late', id], 340000);
        } catch (error) {
          if (isUsageLimit(error)) {
            await rename(join(resultDir, 'result.json'), join(resultDir, 'result.uncertain.json'));
            await atomicWrite(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web',
              id, promptHash: request.promptHash, status: 'failed', errorCode: 'USAGE_LIMIT' }));
            // A visible terminal rejection resolves uncertainty; only an explicit product retry can resubmit.
            const circuit = join(config.privateRoot, 'web-image-circuit.json');
            if (await exists(circuit)) {
              const state = JSON.parse((await safeRead(circuit, 16384)).toString('utf8'));
              if (state.taskId === id && state.promptHash === request.promptHash) {
                await rename(circuit, join(config.privateRoot, `web-image-circuit.resolved-${id}.json`));
              }
            }
            return id;
          }
        }
      }
      if (!await exists(join(jobDir, 'result.json'))) continue;
      if (await exists(join(privateDir, 'normalization-recovery.started')) && !await normalizedResult(privateDir)) continue;
      const bytes = await finalizeWebImage(config, request, privateDir, jobDir, Date.now() + 45_000, true);
      await atomicWrite(join(resultDir, 'result.png'), bytes);
      // Preserve the old receipt only after the complete image is durable.
      await atomicWrite(join(resultDir, 'result.uncertain.json'), resultBytes);
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
async function pathEntryExists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function publishNotSubmittedEvidence(config, preferredId) {
  const listed = (await readdir(config.privateRoot)).filter(name => UUID.test(name));
  const ids = [...new Set([...(preferredId && UUID.test(preferredId) ? [preferredId] : []), ...listed])];
  for (const id of ids) {
    const privateDir = join(config.privateRoot, id);
    const resultDir = join(config.results, id);
    const evidencePath = join(resultDir, 'not-submitted.json');
    if (await exists(evidencePath)) continue;
    try {
      await safeDirectory(privateDir, 0, 0o700);
      await safeDirectory(resultDir, 0, 0o750);
      const request = validateCodexImageRequest(JSON.parse((await safeRead(join(privateDir, 'request.json'), 16384)).toString('utf8')), undefined, 'chatgpt-web');
      const reservation = validateCodexImageRequest(JSON.parse((await safeRead(join(config.inbox, id + '.submitted.json'), 16384)).toString('utf8')), undefined, 'chatgpt-web');
      const primaryResult = validateCodexImageResult(JSON.parse((await safeRead(join(resultDir, 'result.json'), 16384)).toString('utf8')), 'chatgpt-web');
      const jobDir = join(config.jobs, id);
      if (request.id !== id || request.provider !== 'chatgpt-web'
        || !sameJson(reservation, request)
        || primaryResult.status !== 'failed' || primaryResult.id !== id || primaryResult.provider !== 'chatgpt-web'
        || primaryResult.promptHash !== request.promptHash
        || await pathEntryExists(join(privateDir, 'browser-result.png')) || await pathEntryExists(join(privateDir, 'normalized'))
        || await pathEntryExists(join(resultDir, 'result.png'))) continue;
      if (primaryResult.errorCode === 'EXPIRED') {
        // runOne can exhaust its queue budget before creating the execution marker.
        if (await pathEntryExists(join(privateDir, 'started')) || await pathEntryExists(jobDir)) continue;
      } else {
        await safeDirectory(jobDir, 11040, 0o700);
        const persistedInnerRequest = JSON.parse((await safeRead(join(jobDir, 'request.json'), 32768)).toString('utf8'));
        const operatorError = JSON.parse((await safeRead(join(jobDir, 'operator-error.json'), 32768)).toString('utf8'));
        if (!sameJson(persistedInnerRequest, exactInnerRequest(request)) || operatorError?.state !== 'not_submitted'
          || await exists(join(jobDir, 'submitted.json')) || await exists(join(jobDir, 'conversation.json'))
          || await exists(join(jobDir, 'result.json')) || await exists(join(jobDir, 'output', 'image.png'))) continue;
      }
      const evidence = { id, provider: 'chatgpt-web', promptHash: request.promptHash, state: 'not_submitted' };
      const serialized = JSON.stringify(evidence);
      if (!await publishExclusive(evidencePath, serialized)) {
        const existing = JSON.parse((await safeRead(evidencePath, 1024)).toString('utf8'));
        if (!sameJson(existing, evidence)) continue;
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
  try {
    // This dependency disappeared in the observed download/normalize failure.
    // Refuse new work before advertising readiness or spending on a browser job.
    await docker(['image', 'inspect', '--format', '{{.Id}}', config.rendererImage]);
  } catch (error) {
    await unlink(join(config.results, '.ready')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    reportFailure(null, 'renderer_dependency', error);
    throw Error('RENDERER_UNAVAILABLE');
  }
  const heartbeat = () => atomicWrite(join(config.results, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web', updatedAt: Date.now() }));
  await heartbeat();
  const timer = setInterval(() => { heartbeat().catch(() => {}); }, 15000);
  try {
    const recovered = await recoverUncertainWebImage(config);
    if (recovered) { console.log(JSON.stringify({ id: recovered, status: 'reconciled' })); return; }
    const result = await runOne({ ...config, provider: 'chatgpt-web', execute: (request, dir) => executeWebImage(config, request, dir) });
    const notSubmitted = await publishNotSubmittedEvidence(config, result?.status === 'failed' ? result.id : undefined);
    if (result) console.log(JSON.stringify(result));
    else if (notSubmitted) console.log(JSON.stringify({ id: notSubmitted, status: 'not_submitted_reconciled' }));
  } finally {
    clearInterval(timer);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('WEB_IMAGE_BROKER_START_FAILED'); process.exitCode = 1; });
