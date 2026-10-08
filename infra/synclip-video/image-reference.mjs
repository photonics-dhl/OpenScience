import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CODEX_IMAGE_ID_PATTERN, CODEX_IMAGE_MAX_JSON_BYTES, CODEX_IMAGE_MAX_PNG_BYTES,
  validateCodexImageRequest } from '../../packages/ai-gateway/dist/codex-image-protocol.js';
import { validateImageBytes } from '../../packages/ai-gateway/dist/image.js';
import { SynclipImageClient, SYNCLIP_IMAGE_MODEL, SYNCLIP_IMAGE_MAX_BYTES,
  validateSynclipTaskId, validateSynclipImageTask, validateSynclipOriginal,
  downloadSynclipImage } from '../../packages/ai-gateway/dist/synclip-image-api.js';

const IMAGE_ROOT = '/opt/openscience-synclip';
const invalid = () => Object.assign(new Error('SYNCLIP_REFERENCE_INVALID'), { code: 'SYNCLIP_REFERENCE_INVALID' });
function requireValid(value) { if (!value) throw invalid(); }
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

async function directories(path) {
  for (let current = path;; current = dirname(current)) {
    const stat = await lstat(current);
    requireValid(stat.isDirectory() && !stat.isSymbolicLink());
    if (dirname(current) === current) return;
  }
}

async function read(path, maximum) {
  let parent, file;
  try {
    let target = path;
    if (process.platform === 'linux') {
      // Node has no openat. Pin each directory with a descriptor so a renamed
      // parent cannot redirect a later open through a symlink. /proc/self/fd is
      // only used for these owned descriptors, never for a caller-supplied path.
      const root = parse(path).root;
      const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
      parent = await open(root, flags);
      for (const component of relative(root, dirname(path)).split(sep).filter(Boolean)) {
        const next = await open(`/proc/self/fd/${parent.fd}/${component}`, flags);
        const previous = parent; parent = next; await previous.close();
      }
      target = `/proc/self/fd/${parent.fd}/${basename(path)}`;
    } else {
      // Offline Windows fixtures also reject junctions at every path component.
      await directories(dirname(path));
    }
    const before = await lstat(target);
    requireValid(before.isFile() && !before.isSymbolicLink() && before.size > 0 && before.size <= maximum);
    file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = await file.stat();
    requireValid(opened.isFile() && sameFile(before, opened) && opened.size === before.size);
    if (process.platform !== 'linux') {
      await directories(dirname(path));
      const current = await lstat(path);
      requireValid(!current.isSymbolicLink() && sameFile(current, opened));
    }
    // Bound the read itself: a concurrent append must not allocate an unbounded buffer.
    const bytes = Buffer.alloc(opened.size + 1); let size = 0;
    while (size < bytes.length) {
      const result = await file.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    const after = await file.stat();
    requireValid(size === opened.size && after.size === opened.size
      && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs);
    return bytes.subarray(0, size);
  } finally {
    try { await file?.close(); } finally { await parent?.close(); }
  }
}

const json = async (path, maximum) => JSON.parse((await read(path, maximum)).toString('utf8'));
function remaining(deadlineAt, now) {
  const time = now();
  requireValid(Number.isSafeInteger(deadlineAt) && Number.isSafeInteger(time) && deadlineAt > time);
  return deadlineAt - time;
}
function completed(task) {
  requireValid(task.status === 'completed' && task.output?.watermarked === false);
}

/**
 * Return only an in-memory URL for a previously paid image. approvedPng is the
 * caller's approved, hash-checked scene PNG; equality binds it to normalization.
 * The sole production root is fixed here. imageRoot/client/download/now are
 * dependency seams for offline tests, never fields from the queued request.
 * This resolver neither persists refreshed URLs nor creates image/video tasks.
 */
export async function resolveSynclipImageReference(input = {}, dependencies = {}) {
  try {
    const { requestId, approvedPng, apiKey, deadlineAt } = input;
    const now = dependencies.now ?? Date.now;
    remaining(deadlineAt, now);
    requireValid(typeof requestId === 'string' && CODEX_IMAGE_ID_PATTERN.test(requestId) && Buffer.isBuffer(approvedPng));
    const approved = validateImageBytes(approvedPng);
    requireValid(approved.contentType === 'image/png');
    const root = dependencies.imageRoot ?? IMAGE_ROOT;
    requireValid(typeof root === 'string' && isAbsolute(root) && resolve(root) === root);
    const directory = join(root, 'private', requestId);
    // Historical generation deadlines may have elapsed; its validated identity
    // remains the source of the already paid task, not permission for a new POST.
    const request = validateCodexImageRequest(await json(join(directory, 'request.json'), CODEX_IMAGE_MAX_JSON_BYTES), undefined, 'synclip');
    requireValid(request.id === requestId);
    const identity = { schemaVersion: 1, requestId, promptHash: request.promptHash, model: SYNCLIP_IMAGE_MODEL, aspectRatio: '16:9' };
    const attempt = await json(join(directory, 'synclip-attempt.json'), 2048);
    const receipt = await json(join(directory, 'synclip-receipt.json'), 4096);
    const taskId = validateSynclipTaskId(receipt.taskId);
    requireValid(isDeepStrictEqual(attempt, identity) && isDeepStrictEqual(receipt, { ...identity, taskId }));
    const previous = validateSynclipImageTask(await json(join(directory, 'synclip-status.json'), 65536), taskId);
    completed(previous); // Its signed URL may be expired: GET below refreshes it.
    const normalized = await read(join(directory, 'normalized', 'result.png'), CODEX_IMAGE_MAX_PNG_BYTES);
    requireValid(normalized.equals(approved.bytes));
    const original = validateSynclipOriginal(await read(join(directory, 'synclip-original'), SYNCLIP_IMAGE_MAX_BYTES));
    const timeoutMs = Math.min(15000, remaining(deadlineAt, now));
    const client = dependencies.client ?? new SynclipImageClient({ apiKey, timeoutMs });
    const task = validateSynclipImageTask(await client.query(taskId), taskId);
    completed(task);
    requireValid(Date.parse(task.url_expires_at) >= deadlineAt);
    const bytes = validateSynclipOriginal(await (dependencies.download ?? downloadSynclipImage)(task, {
      timeoutMs: Math.min(45000, remaining(deadlineAt, now)), now,
    }));
    requireValid(bytes.equals(original));
    remaining(deadlineAt, now);
    return new URL(task.output.url).href;
  } catch {
    // Never attach causes, file paths, provider messages, keys or signed URLs.
    throw invalid();
  }
}
