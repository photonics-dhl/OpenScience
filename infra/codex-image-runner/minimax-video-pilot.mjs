import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRead, atomicWrite } from './core.mjs';
import {
  MiniMaxVideoClient, MiniMaxVideoError, MINIMAX_VIDEO_MAX_REQUEST_BYTES,
  validateMiniMaxVideoBaseUrl, validateMiniMaxVideoRequest,
  validateMiniMaxVideoTaskId, validateMiniMaxVideoTask,
} from '../../packages/ai-gateway/dist/minimax-video.js';

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
  const { command, requestFile } = options ?? {};
  if (!['prepare', 'submit', 'status'].includes(command)
    || (command !== 'status' && typeof requestFile !== 'string')
    || Object.keys(options).some(key => !['command', 'requestFile'].includes(key))) fail('PILOT_ARGUMENTS_INVALID');
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
  const root = dirname(configPath), stateRoot = join(root, 'minimax-h3-pilot');
  const config = json(await read(configPath, 16384));
  validateMiniMaxVideoBaseUrl(config.baseUrl);
  if (config.model !== 'MiniMax-H3' || config.apiKeyFile !== join(root, 'secrets', 'minimax-video.key')
    || config.pilot?.duration !== 10 || config.pilot?.resolution !== '768P'
    || config.pilot?.ratio !== '16:9' || config.pilot?.maxCreateRequests !== 1) fail('PILOT_CONFIG_INVALID');
  let created = false;
  try { await mkdir(stateRoot, { mode: 0o700 }); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await directories(stateRoot, true);
  if (created) await sync(root);
  const savedRequestPath = join(stateRoot, 'request.json');
  const summary = (status, extra = {}) => ({ status, model: 'MiniMax-H3', duration: 10,
    resolution: '768P', ratio: '16:9', maxCreateRequests: 1, ...extra });
  let proposed;
  if (requestFile !== undefined) proposed = validateMiniMaxVideoRequest(json(await read(resolve(requestFile), MINIMAX_VIDEO_MAX_REQUEST_BYTES)));
  if (command === 'prepare') {
    await writeExclusive(savedRequestPath, JSON.stringify(proposed), sync);
  }
  const request = validateMiniMaxVideoRequest(json(await read(savedRequestPath, MINIMAX_VIDEO_MAX_REQUEST_BYTES)));
  const canonical = JSON.stringify(request);
  if (proposed && JSON.stringify(proposed) !== canonical) fail('PILOT_REQUEST_MISMATCH');

  async function submission() {
    const attempted = await optional(join(stateRoot, 'create-attempt'));
    if (attempted === null) {
      if (await optional(join(stateRoot, 'receipt.json')) !== null) fail('PILOT_INVALID_STATE');
      return summary('prepared');
    }
    let attempt;
    try { attempt = JSON.parse(attempted.toString('utf8')); }
    catch { return summary('uncertain', { errorCode: 'PILOT_ATTEMPT_INCOMPLETE' }); }
    if (attempt.schemaVersion !== 1 || JSON.stringify(validateMiniMaxVideoRequest(attempt.request)) !== canonical) fail('PILOT_REQUEST_MISMATCH');
    const receiptBytes = await optional(join(stateRoot, 'receipt.json'));
    if (receiptBytes !== null) {
      const receipt = json(receiptBytes);
      if (receipt.schemaVersion !== 1) fail('PILOT_INVALID_STATE');
      const taskId = validateMiniMaxVideoTaskId(receipt.taskId);
      const terminalBytes = await optional(join(stateRoot, 'terminal.json'));
      if (terminalBytes !== null) {
        const terminal = validateMiniMaxVideoTask(json(terminalBytes), taskId);
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
  if (command === 'prepare') return previous;
  if (command === 'submit' && previous.status !== 'prepared') return previous;
  if (command === 'status' && previous.status !== 'submitted') return previous;
  async function client() {
    if (dependencies.getClient) return dependencies.getClient(config);
    await directories(dirname(config.apiKeyFile), true);
    const apiKey = (await read(config.apiKeyFile, 4096)).toString('utf8').replace(/\r?\n$/u, '');
    return new MiniMaxVideoClient({ baseUrl: config.baseUrl, apiKey });
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
    const task = validateMiniMaxVideoTask(await provider.query(previous.taskId), previous.taskId);
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      await writeExclusive(join(stateRoot, 'terminal.json'), JSON.stringify(task), sync);
      return submission();
    }
    await atomicWrite(join(stateRoot, 'status.json'), JSON.stringify(task), 0o600);
    return summary(task.status, { taskId: task.id, hasVideo: false });
  } catch (error) { return summary('query_failed', { taskId: previous.taskId, ...diagnostics(error) }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = (args.length === 1 && args[0] === 'status')
    || (args.length === 3 && ['prepare', 'submit'].includes(args[0]) && args[1] === '--request-file');
  if (!valid) { console.error('PILOT_ARGUMENTS_INVALID'); process.exitCode = 64; }
  else {
    runPilot({ command: args[0], ...(args.length === 3 ? { requestFile: args[2] } : {}) }).then(result => {
      console.log(JSON.stringify(result));
      if (['uncertain', 'rejected', 'failed', 'cancelled', 'query_failed'].includes(result.status)) process.exitCode = 1;
    }).catch(error => {
      const code = error instanceof MiniMaxVideoError ? error.code
        : /^PILOT_[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'PILOT_OPERATION_FAILED';
      console.error(JSON.stringify({ status: 'failed', errorCode: code })); process.exitCode = 1;
    });
  }
}
