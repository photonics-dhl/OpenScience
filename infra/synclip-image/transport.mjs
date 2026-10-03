import { open, lstat, mkdir, chmod, chown, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { safeRead, atomicWrite } from '../codex-image-runner/core.mjs';
import { normalizeImage } from '../chatgpt-browser/broker.mjs';
import { validateCodexImageRequest } from '../../packages/ai-gateway/dist/codex-image-protocol.js';
import { validateImageBytes } from '../../packages/ai-gateway/dist/image.js';
import { SynclipImageClient, SYNCLIP_IMAGE_MODEL, SYNCLIP_IMAGE_MAX_BYTES,
  validateSynclipTaskId, validateSynclipImageTask, validateSynclipOriginal, downloadSynclipImage } from '../../packages/ai-gateway/dist/synclip-image-api.js';

function uncertain() { return Object.assign(Error('UNCERTAIN'), { code: 'UNCERTAIN' }); }
function failed() { return Object.assign(Error('SYNCLIP_TASK_FAILED'), { code: 'EXECUTION_FAILED' }); }
async function optional(path, max) {
  try { return await safeRead(path, max); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const file = await open(path, 'r'); try { await file.sync(); } finally { await file.close(); }
}
// Same exclusive-attempt rule as the existing video pilot: a partial file stays
// consumed. Removing it after an error could repeat a paid POST.
async function exclusive(path, bytes) {
  let file;
  try { file = await open(path, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await syncDirectory(dirname(path)); return true;
}
async function publishOriginal(path, bytes) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  let owned = false;
  try {
    // A partial temporary file is never consumed as the original on resume.
    owned = await exclusive(temporary, bytes);
    if (!owned) throw uncertain();
    try { await link(temporary, path); }
    catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    await syncDirectory(dirname(path)); return true;
  } finally { if (owned) await unlink(temporary); }
}
async function safeDirectory(path) {
  if (!isAbsolute(path)) throw uncertain();
  for (let current = path;; current = dirname(current)) {
    const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw uncertain();
    if (dirname(current) === current) break;
  }
}
async function context(request, privateDir, config, dependencies) {
  validateCodexImageRequest(request, undefined, 'synclip');
  if (request.reference || basename(privateDir) !== request.id || !/^(?:[a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$/u.test(config.rendererImage)) throw uncertain();
  await safeDirectory(privateDir);
  const original = JSON.parse((await safeRead(join(privateDir, 'request.json'), 16384)).toString('utf8'));
  if (!isDeepStrictEqual(original, request)) throw uncertain();
  const now = dependencies.now ?? Date.now;
  const deadlineAt = config.deadlineAt ?? now() + 90000;
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= now() || deadlineAt - now() > 600000) throw uncertain();
  const identity = { schemaVersion: 1, requestId: request.id, promptHash: request.promptHash,
    model: SYNCLIP_IMAGE_MODEL, aspectRatio: '16:9' };
  const client = () => dependencies.client ?? new SynclipImageClient({ apiKey: config.apiKey,
    timeoutMs: Math.max(1, Math.min(15000, deadlineAt - now())) });
  return { request, privateDir, config, dependencies, now, deadlineAt, identity, client };
}
async function receipt(ctx) {
  const attemptBytes = await optional(join(ctx.privateDir, 'synclip-attempt.json'), 2048);
  if (!attemptBytes || !isDeepStrictEqual(JSON.parse(attemptBytes.toString('utf8')), ctx.identity)) throw uncertain();
  const bytes = await optional(join(ctx.privateDir, 'synclip-receipt.json'), 4096);
  if (!bytes) throw uncertain();
  const value = JSON.parse(bytes.toString('utf8')); const taskId = validateSynclipTaskId(value.taskId);
  if (!isDeepStrictEqual(value, { ...ctx.identity, taskId })) throw uncertain();
  return taskId;
}
async function normalize(ctx, rawPath) {
  await chmod(rawPath, 0o444);
  const normalizedDir = join(ctx.privateDir, 'normalized');
  try { await mkdir(normalizedDir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await safeDirectory(normalizedDir);
  if (process.platform !== 'win32') { await chown(normalizedDir, 1000, 1000); await chmod(normalizedDir, 0o700); }
  return validateImageBytes(await (ctx.dependencies.normalize ?? normalizeImage)(ctx.config, ctx.request.id, rawPath, normalizedDir, ctx.deadlineAt)).bytes;
}
async function resume(ctx) {
  const taskId = await receipt(ctx);
  const statusPath = join(ctx.privateDir, 'synclip-status.json');
  const savedStatus = await optional(statusPath, 65536);
  const previous = savedStatus ? validateSynclipImageTask(JSON.parse(savedStatus.toString('utf8')), taskId) : null;
  if (previous?.status === 'failed') throw failed();
  const rawPath = join(ctx.privateDir, 'synclip-original');
  const raw = await optional(rawPath, SYNCLIP_IMAGE_MAX_BYTES);
  if (raw) {
    if (previous?.status !== 'completed') throw uncertain();
    validateSynclipOriginal(raw);
    const normalizedDir = join(ctx.privateDir, 'normalized');
    try { await safeDirectory(normalizedDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const ready = await optional(join(normalizedDir, 'result.png'), 10 * 1024 * 1024);
    if (ready) return validateImageBytes(ready).bytes;
    return normalize(ctx, rawPath);
  }
  if (ctx.now() >= ctx.deadlineAt) throw uncertain();
  // Query only the remote ID already bound to the original request. Never create.
  const task = validateSynclipImageTask(await ctx.client().query(taskId), taskId);
  if (previous?.status === 'completed' && task.status !== 'completed') throw uncertain();
  await atomicWrite(statusPath, JSON.stringify(task), 0o600);
  if (task.status === 'failed') throw failed();
  if (task.status !== 'completed') return null;
  const bytes = validateSynclipOriginal(await (ctx.dependencies.download ?? downloadSynclipImage)(task, {
    timeoutMs: Math.max(1, Math.min(45000, ctx.deadlineAt - ctx.now())), now: ctx.now,
  }));
  if (!await publishOriginal(rawPath, bytes)) {
    if (!(await safeRead(rawPath, SYNCLIP_IMAGE_MAX_BYTES)).equals(bytes)) throw uncertain();
  }
  return normalize(ctx, rawPath);
}

/** Only execute can acquire a first POST. The host retains its original runner lock.
 * config: {apiKey, rendererImage, deadlineAt?}; fourth argument is a test-only boundary injection. */
export async function executeSynclipImage(request, privateDir, config, dependencies = {}) {
  try {
    const ctx = await context(request, privateDir, { ...config, deadlineAt: Math.min(config.deadlineAt ?? request.deadlineAt, request.deadlineAt) }, dependencies);
    const client = ctx.client(); // Reject missing host credentials before reserving a paid attempt.
    const path = join(privateDir, 'synclip-attempt.json');
    if (!await optional(path, 2048) && await exclusive(path, JSON.stringify(ctx.identity))) {
      if (ctx.now() >= ctx.deadlineAt) throw uncertain();
      const created = await client.create(request.prompt);
      const taskId = validateSynclipTaskId(created.task_id);
      if (!await exclusive(join(privateDir, 'synclip-receipt.json'), JSON.stringify({ ...ctx.identity, taskId }))) throw uncertain();
    }
    for (;;) {
      const result = await resume(ctx); if (result) return result;
      const remaining = ctx.deadlineAt - ctx.now(); if (remaining <= 0) throw uncertain();
      await (dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(Math.min(3000, remaining));
    }
  } catch (error) { if (error?.code === 'EXECUTION_FAILED' && error.message === 'SYNCLIP_TASK_FAILED') throw failed(); throw uncertain(); }
}

/** One bounded GET, or local recovery. Pending returns null; no path can POST. */
export async function resumeSynclipImage(request, privateDir, config, dependencies = {}) {
  try { return await resume(await context(request, privateDir, config, dependencies)); }
  catch (error) { if (error?.code === 'EXECUTION_FAILED' && error.message === 'SYNCLIP_TASK_FAILED') throw failed(); throw uncertain(); }
}
