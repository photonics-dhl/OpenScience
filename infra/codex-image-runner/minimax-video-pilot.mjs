import { lstat, mkdir, open, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRead, atomicWrite } from './core.mjs';
import {
  MiniMaxVideoClient, MiniMaxVideoError, MINIMAX_VIDEO_MAX_REQUEST_BYTES,
  MINIMAX_PAPER_VIDEO, MINIMAX_VIDEO_MAX_PAPER_REQUEST_BYTES,
  validateMiniMaxVideoBaseUrl, validateMiniMaxVideoRequest,
  validateMiniMaxVideoTaskId, validateMiniMaxVideoTask,
} from '../../packages/ai-gateway/dist/minimax-video.js';
import { downloadMiniMaxVideo, validateMiniMaxVideoBytes, MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES } from '../../packages/ai-gateway/dist/minimax-video-download.js';

const CONFIG_PATH = '/opt/openscience-video/minimax-cloud.json';
const fail = code => { throw new Error(code); };
const json = bytes => {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { return fail('PILOT_INVALID_STATE'); }
};

async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const file = await open(path, 'r');
  try { await file.sync(); } finally { await file.close(); }
}

// Never remove a partial exclusive file: even an interrupted reservation must
// prevent a second paid request. A human may reconcile an unknown task later.
async function writeExclusive(path, bytes, sync) {
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
  await sync(dirname(path));
  return true;
}

function diagnostics(error) {
  if (!(error instanceof MiniMaxVideoError)) return { errorCode: 'PILOT_OPERATION_FAILED' };
  return { errorCode: error.code, ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    ...(error.providerCode === undefined ? {} : { providerCode: error.providerCode }) };
}

/** Root-only operator entry. Dependency overrides are for local tests, not CLI flags. */
export async function runPilot(options, dependencies = {}) {
  if ((dependencies.platform ?? process.platform) !== 'linux'
    || (dependencies.getuid ?? process.getuid)?.() !== 0
    || (dependencies.geteuid ?? process.geteuid)?.() !== 0) fail('PILOT_ROOT_REQUIRED');
  const { command, requestFile, paperShot } = options ?? {};
  if (!['prepare', 'submit', 'status', 'download'].includes(command)
    || (!['status', 'download'].includes(command) && typeof requestFile !== 'string')
    || Object.keys(options).some(key => !['command', 'requestFile', 'paperShot'].includes(key))
    || (paperShot !== undefined && !MINIMAX_PAPER_VIDEO.shots.includes(paperShot))) fail('PILOT_ARGUMENTS_INVALID');
  const mode = paperShot === undefined ? 'pilot' : 'paper';
  const requestLimit = mode === 'paper' ? MINIMAX_VIDEO_MAX_PAPER_REQUEST_BYTES : MINIMAX_VIDEO_MAX_REQUEST_BYTES;
  const validateRequest = value => validateMiniMaxVideoRequest(value, mode);
  const validateTask = (value, id) => validateMiniMaxVideoTask(value, id, mode);
  const inspect = dependencies.lstat ?? lstat;
  const sync = dependencies.syncDirectory ?? syncDirectory;
  async function directories(path, privateLeaf = false) {
    for (let current = resolve(path);; current = dirname(current)) {
      const stat = await inspect(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0
        || (stat.mode & (privateLeaf && current === resolve(path) ? 0o077 : 0o022))) fail('PILOT_DIRECTORY_PERMISSIONS');
      if (dirname(current) === current) break;
    }
  }
  async function read(path, maxBytes) {
    await directories(dirname(path));
    const stat = await inspect(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o077)) fail('PILOT_FILE_PERMISSIONS');
    return safeRead(path, maxBytes);
  }
  async function optional(path, maxBytes = 65536) {
    try { return await read(path, maxBytes); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  const configPath = resolve(dependencies.configPath ?? CONFIG_PATH);
  const root = dirname(configPath), stateRoot = join(root, paperShot === undefined ? 'minimax-h3-pilot' : `minimax-${MINIMAX_PAPER_VIDEO.id}-${paperShot}`);
  const config = json(await read(configPath, 16384));
  validateMiniMaxVideoBaseUrl(config.baseUrl);
  if (config.model !== 'MiniMax-H3' || config.apiKeyFile !== join(root, 'secrets', 'minimax-video.key')
    || config.pilot?.duration !== 10 || config.pilot?.resolution !== '768P'
    || config.pilot?.ratio !== '16:9' || config.pilot?.maxCreateRequests !== 1) fail('PILOT_CONFIG_INVALID');
  if (mode === 'paper' && (config.paperVideo?.id !== MINIMAX_PAPER_VIDEO.id
    || config.paperVideo?.duration !== MINIMAX_PAPER_VIDEO.duration || config.paperVideo?.resolution !== MINIMAX_PAPER_VIDEO.resolution
    || config.paperVideo?.ratio !== MINIMAX_PAPER_VIDEO.ratio
    || JSON.stringify(config.paperVideo?.shots) !== JSON.stringify(MINIMAX_PAPER_VIDEO.shots)
    || Object.keys(config.paperVideo).sort().join(',') !== 'duration,id,ratio,resolution,shots')) fail('PILOT_CONFIG_INVALID');
  let created = false;
  try { await mkdir(stateRoot, { mode: 0o700 }); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await directories(stateRoot, true);
  if (created) await sync(root);
  const savedRequestPath = join(stateRoot, 'request.json');
  const summary = (status, extra = {}) => ({ status, model: 'MiniMax-H3', duration: mode === 'paper' ? 15 : 10,
    resolution: mode === 'paper' ? '2K' : '768P', ratio: '16:9', maxCreateRequests: 1,
    ...(paperShot === undefined ? {} : { paperShot, runId: MINIMAX_PAPER_VIDEO.id }), ...extra });
  let proposed;
  if (requestFile !== undefined) proposed = validateRequest(json(await read(resolve(requestFile), requestLimit)));
  if (command === 'prepare') {
    await writeExclusive(savedRequestPath, JSON.stringify(proposed), sync);
  }
  const request = validateRequest(json(await read(savedRequestPath, requestLimit)));
  const canonical = JSON.stringify(request);
  if (proposed && JSON.stringify(proposed) !== canonical) fail('PILOT_REQUEST_MISMATCH');

  async function submission() {
    const attempted = await optional(join(stateRoot, 'create-attempt'), requestLimit + 1024);
    if (attempted === null) {
      if (await optional(join(stateRoot, 'receipt.json')) !== null) fail('PILOT_INVALID_STATE');
      return summary('prepared');
    }
    let attempt;
    try { attempt = JSON.parse(attempted.toString('utf8')); }
    catch { return summary('uncertain', { errorCode: 'PILOT_ATTEMPT_INCOMPLETE' }); }
    if (attempt.schemaVersion !== 1 || JSON.stringify(validateRequest(attempt.request)) !== canonical) fail('PILOT_REQUEST_MISMATCH');
    const receiptBytes = await optional(join(stateRoot, 'receipt.json'));
    if (receiptBytes !== null) {
      const receipt = json(receiptBytes);
      if (receipt.schemaVersion !== 1) fail('PILOT_INVALID_STATE');
      const taskId = validateMiniMaxVideoTaskId(receipt.taskId);
      const terminalBytes = await optional(join(stateRoot, 'terminal.json'));
      if (terminalBytes !== null) {
        const terminal = validateTask(json(terminalBytes), taskId);
        if (!['succeeded', 'failed', 'cancelled'].includes(terminal.status)) fail('PILOT_INVALID_STATE');
        return summary(terminal.status, { taskId, hasVideo: !!terminal.content.url });
      }
      return summary('submitted', { taskId });
    }
    const failureBytes = await optional(join(stateRoot, 'create-failure.json'));
    if (failureBytes !== null) {
      const failure = json(failureBytes);
      if (!['rejected', 'uncertain'].includes(failure.outcome)) fail('PILOT_INVALID_STATE');
      // Reconstruct an allowlisted diagnostic; do not print arbitrary saved text.
      const error = new MiniMaxVideoError('VIDEO_HTTP_FAILED', failure.outcome,
        Number.isInteger(failure.httpStatus) ? failure.httpStatus : undefined, failure.providerCode);
      return summary(failure.outcome, diagnostics(error));
    }
    return summary('uncertain');
  }

  const previous = await submission();
  if (command === 'download') {
    if (previous.status !== 'succeeded') fail('PILOT_VIDEO_NOT_READY');
    const outputPath = join(stateRoot, 'source.mp4');
    const validVideo = bytes => {
      if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES
        || bytes.toString('ascii', 4, 8) !== 'ftyp') fail('PILOT_VIDEO_INVALID');
      return validateMiniMaxVideoBytes(bytes);
    };
    let saved = await optional(outputPath, MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES);
    if (saved === null) {
      const terminal = validateTask(json(await read(join(stateRoot, 'terminal.json'), 65536)), previous.taskId);
      const bytes = validVideo(await (dependencies.download ?? downloadMiniMaxVideo)(terminal, { mode }));
      const temporaryPath = join(stateRoot, `.source-${randomUUID()}.part`);
      let owned = false;
      try {
        owned = await writeExclusive(temporaryPath, bytes, sync);
        if (!owned) fail('PILOT_OUTPUT_CONFLICT');
        // Publish one complete original; concurrent GETs cannot overwrite it.
        try { await link(temporaryPath, outputPath); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        await sync(stateRoot);
      } finally {
        if (owned) await unlink(temporaryPath);
      }
      saved = await read(outputPath, MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES);
    }
    validVideo(saved);
    return summary('downloaded', { taskId: previous.taskId, path: outputPath, bytes: saved.length });
  }
  if (command === 'prepare') return previous;
  if (command === 'submit' && previous.status !== 'prepared') return previous;
  if (command === 'status' && previous.status !== 'submitted') return previous;
  async function client() {
    if (dependencies.getClient) return dependencies.getClient(config);
    await directories(dirname(config.apiKeyFile), true);
    const apiKey = (await read(config.apiKeyFile, 4096)).toString('utf8').replace(/\r?\n$/u, '');
    return new MiniMaxVideoClient({ baseUrl: config.baseUrl, apiKey, mode });
  }
  const provider = await client();
  if (command === 'submit') {
    const won = await writeExclusive(join(stateRoot, 'create-attempt'),
      JSON.stringify({ schemaVersion: 1, request, reservedAt: Date.now() }), sync);
    if (!won) return submission();
    if (dependencies.afterReservation) await dependencies.afterReservation();
    let receipt;
    try {
      receipt = await provider.create(request);
      validateMiniMaxVideoTaskId(receipt.task_id);
    } catch (error) {
      const outcome = error instanceof MiniMaxVideoError && error.outcome === 'rejected' ? 'rejected' : 'uncertain';
      const info = diagnostics(error);
      await writeExclusive(join(stateRoot, 'create-failure.json'), JSON.stringify({ outcome, ...info }), sync);
      return summary(outcome, info);
    }
    // Once the server has accepted, saving the ID precedes every possible GET.
    await writeExclusive(join(stateRoot, 'receipt.json'), JSON.stringify({ schemaVersion: 1, taskId: receipt.task_id }), sync);
    return summary('submitted', { taskId: receipt.task_id });
  }
  try {
    const task = validateTask(await provider.query(previous.taskId), previous.taskId);
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      await writeExclusive(join(stateRoot, 'terminal.json'), JSON.stringify(task), sync);
      return submission();
    }
    await atomicWrite(join(stateRoot, 'status.json'), JSON.stringify(task), 0o600);
    return summary(task.status, { taskId: task.id, hasVideo: false });
  } catch (error) { return summary('query_failed', { taskId: previous.taskId, ...diagnostics(error) }); }
}

export function parsePilotArgs(args) {
  const [command, ...flags] = args;
  if (!['prepare', 'submit', 'status', 'download'].includes(command) || flags.length % 2) fail('PILOT_ARGUMENTS_INVALID');
  const options = { command };
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index] === '--request-file' ? 'requestFile' : flags[index] === '--paper-shot' ? 'paperShot' : null;
    if (!key || key in options || !flags[index + 1]) fail('PILOT_ARGUMENTS_INVALID');
    options[key] = flags[index + 1];
  }
  if ((['prepare', 'submit'].includes(command)) !== ('requestFile' in options)
    || ('paperShot' in options && !MINIMAX_PAPER_VIDEO.shots.includes(options.paperShot))) fail('PILOT_ARGUMENTS_INVALID');
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try { options = parsePilotArgs(process.argv.slice(2)); } catch { /* handled below */ }
  if (!options) { console.error('PILOT_ARGUMENTS_INVALID'); process.exitCode = 64; }
  else {
    runPilot(options).then(result => {
      console.log(JSON.stringify(result));
      if (['uncertain', 'rejected', 'failed', 'cancelled', 'query_failed'].includes(result.status)) process.exitCode = 1;
    }).catch(error => {
      const code = error instanceof MiniMaxVideoError ? error.code
        : /^PILOT_[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'PILOT_OPERATION_FAILED';
      console.error(JSON.stringify({ status: 'failed', errorCode: code })); process.exitCode = 1;
    });
  }
}
