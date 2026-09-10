import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, chown, lstat, mkdir, open, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCIENCE_REVIEW_MAX_JSON_BYTES,
  SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_MAX_RESPONSE_BYTES,
  validateScienceReviewRequest,
  validateScienceReviewResult,
} from '../../packages/ai-gateway/dist/index.js';

const exec = promisify(execFile);
const ROOT = '/opt/openscience-chatgpt-browser/';
const CONVERSATION = /^https:\/\/chatgpt\.com\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_GRACE_MS = 60 * 60 * 1000;
const exists = async path => { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function safeRead(path, maximum) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw Error('UNSAFE_FILE');
  const value = await readFile(path);
  const after = await lstat(path);
  if (after.ino !== before.ino || after.dev !== before.dev || value.length !== before.size) throw Error('UNSAFE_FILE');
  return value;
}
async function atomicWrite(path, bytes, mode = 0o600) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', mode);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
  const parent = await open(dirname(path), 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
async function directory(path, uid, mode) {
  const value = await lstat(path);
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== uid || (value.mode & 0o777) !== mode) throw Error('DIRECTORY_PERMISSIONS');
}
async function prepare(path, uid, mode = 0o700) {
  await mkdir(path, { mode }); await chown(path, uid, uid); await chmod(path, mode);
}
async function publish(results, request, status, errorCode, response) {
  const output = join(results, request.id);
  if (!await exists(output)) { await prepare(output, 0, 0o2750); await chown(output, 0, 1000); await chmod(output, 0o2750); }
  if (await exists(join(output, 'result.json'))) return;
  let responseHash;
  if (response !== undefined) {
    responseHash = createHash('sha256').update(response).digest('hex');
    await atomicWrite(join(output, 'response.txt'), response, 0o640);
  }
  await atomicWrite(join(output, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: request.provider,
    id: request.id, promptHash: request.promptHash, ...(responseHash ? { responseHash } : {}), status, ...(errorCode ? { errorCode } : {}) }), 0o640);
}
async function publishRecovery(results, request, response) {
  const output = join(results, request.id);
  const primary = validateScienceReviewResult(JSON.parse((await safeRead(join(output, 'result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
  if (primary.id !== request.id || primary.promptHash !== request.promptHash || primary.status === 'succeeded') throw uncertain();
  if (await exists(join(output, 'recovered-result.json'))) return;
  const responseHash = createHash('sha256').update(response).digest('hex');
  await atomicWrite(join(output, 'recovered-response.txt'), response, 0o640);
  await atomicWrite(join(output, 'recovered-result.json'), JSON.stringify({ schemaVersion: 1, provider: request.provider,
    id: request.id, promptHash: request.promptHash, responseHash, status: 'succeeded' }), 0o640);
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function uncertain() { const error = Error('UNCERTAIN'); error.code = 'UNCERTAIN'; return error; }
async function docker(args, timeout) { return exec('docker', args, { timeout, maxBuffer: 32 * 1024, encoding: 'utf8' }); }
async function copyAttachments(config, job, request) {
  if (!request.attachments?.length) return;
  const target = join(job, 'attachments');
  await prepare(target, 11040);
  let total = 0;
  for (const attachment of request.attachments) {
    const bytes = await safeRead(join(config.inbox, `${request.id}.${attachment.fileName}`), SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES);
    total += bytes.byteLength;
    if (total > SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES
      || createHash('sha256').update(bytes).digest('hex') !== attachment.sha256) throw Error('INVALID_ATTACHMENT');
    const path = join(target, attachment.fileName);
    await atomicWrite(path, bytes); await chown(path, 11040, 11040);
  }
}
async function jobResponse(job, request) {
  const recovered = await exists(join(job, 'recovered-result.json'));
  const resultName = recovered ? 'recovered-result.json' : 'result.json';
  const responseName = recovered ? 'recovered-response.txt' : 'response.txt';
  if (!await exists(join(job, resultName))) throw await exists(join(job, 'submitted.json')) ? uncertain() : Error('EXECUTION_FAILED');
  const persisted = JSON.parse((await safeRead(join(job, 'request.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8'));
  const result = JSON.parse((await safeRead(join(job, resultName), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8'));
  const expected = { schemaVersion: 1, provider: request.provider, id: request.id, prompt: request.prompt,
    promptHash: request.promptHash, deadlineAt: request.deadlineAt, source: request.source,
    ...(request.attachments?.length ? { attachments: request.attachments } : {}) };
  if (!same(persisted, expected) || result?.schemaVersion !== 1 || result.state !== 'received' || result.provider !== request.provider
    || result.id !== request.id || result.promptHash !== request.promptHash || !same(result.source, request.source)
    || result.file !== responseName || typeof result.responseHash !== 'string' || !/^[a-f0-9]{64}$/.test(result.responseHash)
    || !UUID.test(result.userMessageId || '') || !UUID.test(result.assistantMessageId || '')
    || typeof result.conversation !== 'string' || !CONVERSATION.test(result.conversation)) throw uncertain();
  const response = await safeRead(join(job, responseName), SCIENCE_REVIEW_MAX_RESPONSE_BYTES);
  if (createHash('sha256').update(response).digest('hex') !== result.responseHash) throw uncertain();
  return response;
}
async function execute(config, request) {
  const job = join(config.jobs, 'review', request.id);
  if (await exists(job)) throw uncertain();
  await prepare(job, 11040);
  await copyAttachments(config, job, request);
  const inner = { schemaVersion: 1, provider: request.provider, id: request.id, prompt: request.prompt,
    promptHash: request.promptHash, deadlineAt: request.deadlineAt, source: request.source,
    ...(request.attachments?.length ? { attachments: request.attachments } : {}) };
  const requestPath = join(job, 'request.json');
  await atomicWrite(requestPath, JSON.stringify(inner)); await chown(requestPath, 11040, 11040);
  const seconds = Math.floor((request.deadlineAt - Date.now() - 30000) / 1000);
  if (seconds < 45) throw Error('EXPIRED');
  let retriedBeforeSubmission = false;
  for (;;) {
    try {
      const remaining = Math.floor((request.deadlineAt - Date.now() - 30000) / 1000);
      if (remaining < 45) break;
      await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', String(remaining),
        'node', '/jobs/provider/review-runner.cjs', 'execute', request.id], (remaining + 10) * 1000);
      break;
    } catch {
      if (!await exists(join(job, 'submitted.json')) && !retriedBeforeSubmission) { retriedBeforeSubmission = true; continue; }
      break;
    }
  }
  if (!await exists(join(job, 'result.json')) && !await exists(join(job, 'recovered-result.json')) && await exists(join(job, 'submitted.json'))) {
    try {
      if (!await exists(join(job, 'result.json')) && await exists(join(job, 'submitted.json'))) {
        const remaining = Math.floor((request.deadlineAt - Date.now() - 30000) / 1000);
        if (await exists(join(job, 'conversation.json')) && remaining >= 45) {
          await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', String(remaining),
            'node', '/jobs/provider/review-runner.cjs', 'recover', request.id], (remaining + 10) * 1000);
        }
      }
    } catch {}
  }
  return jobResponse(job, request);
}
async function recoverPublishedFailure(config, request) {
  const job = join(config.jobs, 'review', request.id), output = join(config.results, request.id);
  if (request.deadlineAt + RECOVERY_GRACE_MS <= Date.now() || !await exists(join(output, 'result.json'))
    || await exists(join(output, 'recovered-result.json')) || !await exists(join(job, 'submitted.json'))
    || !await exists(join(job, 'conversation.json'))) return false;
  const primary = validateScienceReviewResult(JSON.parse((await safeRead(join(output, 'result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
  if (primary.id !== request.id || primary.promptHash !== request.promptHash || primary.status === 'succeeded') return false;
  if (!await exists(join(job, 'recovered-result.json'))) {
    await docker(['exec', config.browserContainer, 'timeout', '--signal=TERM', '--kill-after=5', '40',
      'node', '/jobs/provider/review-runner.cjs', 'recover', request.id], 50000).catch(() => {});
  }
  if (!await exists(join(job, 'recovered-result.json'))) return false;
  await publishRecovery(config.results, request, await jobResponse(job, request));
  return true;
}
async function main() {
  if (process.getuid?.() !== 0 || process.argv.length !== 4 || process.argv[2] !== '--config') throw Error('CONFIG_REQUIRED');
  const configPath = resolve(process.argv[3]);
  const config = JSON.parse((await safeRead(configPath, 16 * 1024)).toString('utf8'));
  if (Object.keys(config).sort().join(',') !== 'browserContainer,inbox,jobs,privateRoot,results'
    || config.browserContainer !== 'openscience-chatgpt-browser') throw Error('CONFIG_VALUE');
  for (const key of ['inbox', 'results', 'privateRoot', 'jobs']) {
    if (typeof config[key] !== 'string' || !config[key].startsWith(ROOT) || await realpath(config[key]) !== config[key]) throw Error('CONFIG_PATH');
  }
  await directory(config.inbox, 1000, 0o700); await directory(config.results, 0, 0o750);
  await directory(config.privateRoot, 0, 0o700); await directory(config.jobs, 11040, 0o700);
  await atomicWrite(join(config.results, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web-science-review', updatedAt: Date.now() }), 0o640);
  const queued = (await readdir(config.inbox)).filter(name => name.endsWith('.json') && !name.endsWith('.submitted.json') && UUID.test(name.slice(0, -5))).map(name => name.slice(0, -5));
  const existing = (await readdir(config.privateRoot)).filter(name => UUID.test(name));
  const recoverable = [];
  for (const id of existing) {
    try {
      const request = validateScienceReviewRequest(JSON.parse((await safeRead(join(config.privateRoot, id, 'request.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      if (request.deadlineAt + RECOVERY_GRACE_MS > Date.now()) recoverable.push(request);
    } catch {}
  }
  recoverable.sort((left, right) => right.deadlineAt - left.deadlineAt);
  for (const request of recoverable) if (await recoverPublishedFailure(config, request)) return;
  for (const id of [...new Set([...existing, ...queued])].sort()) {
    const incoming = join(config.inbox, `${id}.json`), claimed = join(config.privateRoot, id);
    if (!await exists(claimed)) await prepare(claimed, 0);
    const requestPath = join(claimed, 'request.json');
    if (!await exists(requestPath)) await rename(incoming, requestPath);
    let request;
    try { request = validateScienceReviewRequest(JSON.parse((await safeRead(requestPath, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')), Date.now()); }
    catch { continue; }
    if (request.id !== id || await exists(join(config.results, id, 'result.json'))) continue;
    const started = join(claimed, 'started');
    if (await exists(started)) { await publish(config.results, request, 'uncertain', 'UNCERTAIN'); return; }
    await atomicWrite(started, String(Date.now()));
    try { await publish(config.results, request, 'succeeded', undefined, await execute(config, request)); }
    catch (error) { const isUncertain = error?.code === 'UNCERTAIN'; await publish(config.results, request, isUncertain ? 'uncertain' : 'failed', isUncertain ? 'UNCERTAIN' : 'EXECUTION_FAILED'); }
    return;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('WEB_SCIENCE_REVIEW_BROKER_FAILED'); process.exitCode = 1; });
