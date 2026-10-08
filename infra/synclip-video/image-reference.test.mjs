import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { resolveSynclipImageReference } from './image-reference.mjs';
import { SynclipImageClient, downloadSynclipImage } from '../../packages/ai-gateway/dist/synclip-image-api.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = join(repo, 'tmp/synclip-image-reference-tests');
const requestId = '77777777-7777-4777-8777-777777777777';
const taskId = 'paid-original-image-1';
const now = 1800000000000;
const signedUrl = 'https://cdn.synclip.ai/original.png?signature=private-test-signature';
const apiKey = 'private-test-provider-key';
const hash = value => createHash('sha256').update(value).digest('hex');

function chunk(type, payload) {
  const body = Buffer.concat([Buffer.from(type), payload]); let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const bytes = Buffer.alloc(payload.length + 12); bytes.writeUInt32BE(payload.length); body.copy(bytes, 4);
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
}
function png(pixel, level) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1280); header.writeUInt32BE(720, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc((1280 * 4 + 1) * 720, pixel);
  for (let row = 0; row < 720; row++) scanlines[row * (1280 * 4 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level })), chunk('IEND', Buffer.alloc(0))]);
}
// Same pixels, different encoded files: approved normalization need not equal the provider original.
const approved = png(31, 0), original = png(31, 9), differentImage = png(32, 9);

async function fixture(t) {
  await mkdir(fixtures, { recursive: true });
  const base = await mkdtemp(join(fixtures, 'owned-'));
  t.after(async () => {
    // Delete only this completed test's directory, never follow a substituted fixture root.
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), await realpath(fixtures));
    assert.match(basename(target), /^owned-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true, force: true });
  });
  const root = join(base, 'image-broker'), directory = join(root, 'private', requestId);
  await mkdir(join(directory, 'normalized'), { recursive: true });
  const request = { schemaVersion: 1, provider: 'synclip', id: requestId, prompt: 'An already approved scientific illustration.',
    promptHash: hash('An already approved scientific illustration.'), createdAt: now - 900000, deadlineAt: now - 300000 };
  const identity = { schemaVersion: 1, requestId, promptHash: request.promptHash, model: 'gpt-image-2', aspectRatio: '16:9' };
  const task = { task_id: taskId, status: 'completed', output: { type: 'image', url: signedUrl, watermarked: false },
    url_expires_at: new Date(now + 900000).toISOString() };
  const put = (name, value) => writeFile(join(directory, name), Buffer.isBuffer(value) ? value : JSON.stringify(value));
  await put('request.json', request); await put('synclip-attempt.json', identity);
  await put('synclip-receipt.json', { ...identity, taskId }); await put('synclip-status.json', task);
  await put('synclip-original', original); await put('normalized/result.png', approved);
  const calls = [], options = { requestId, approvedPng: approved, apiKey, deadlineAt: now + 600000 };
  const deps = {
    imageRoot: root,
    now: () => now,
    client: {
      query: async id => { calls.push(['GET', id]); return structuredClone(task); },
      create: async () => { calls.push(['POST']); throw Error('must never create'); },
    },
    download: async (value, downloadOptions) => { calls.push(['download', value.task_id, downloadOptions.timeoutMs]); return original; },
  };
  t.after(() => assert.equal(calls.filter(([method]) => method === 'POST').length, 0));
  return { base, root, directory, request, identity, task, calls, options, deps, put };
}

async function invalid(f) {
  await assert.rejects(resolveSynclipImageReference(f.options, f.deps), error => {
    assert.equal(error.message, 'SYNCLIP_REFERENCE_INVALID');
    assert.equal(error.code, 'SYNCLIP_REFERENCE_INVALID');
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(inspect(error), /private-test|signature=|https:\/\/|paid-original|image-broker/u);
    return true;
  });
}
async function snapshot(directory) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), info = await lstat(path);
    entries.push([name, info.isDirectory() ? await snapshot(path) : hash(await readFile(path))]);
  }
  return entries;
}

test('approved PNG above 500 KiB resolves a paid HTTPS URL with GET only and no persisted changes', async t => {
  const f = await fixture(t), before = await snapshot(f.root);
  assert.ok(approved.length > 500 * 1024); assert.notDeepEqual(approved, original);
  assert.equal(await resolveSynclipImageReference(f.options, f.deps), signedUrl);
  assert.deepEqual(f.calls, [['GET', taskId], ['download', taskId, 45000]]);
  assert.deepEqual(await snapshot(f.root), before);
});

test('expired saved URL is refreshed from the same paid task without rewriting status or receipt', async t => {
  const f = await fixture(t);
  await f.put('synclip-status.json', { ...f.task, url_expires_at: new Date(now - 1).toISOString() });
  const before = await snapshot(f.root);
  assert.equal(await resolveSynclipImageReference(f.options, f.deps), signedUrl);
  assert.deepEqual(await snapshot(f.root), before);
});

test('new URL expiring exactly at the video deadline is accepted', async t => {
  const f = await fixture(t);
  f.task.url_expires_at = new Date(f.options.deadlineAt).toISOString();
  assert.equal(await resolveSynclipImageReference(f.options, f.deps), signedUrl);
});

test('existing gateway client and bounded downloader perform only GET and keep the provider key off the CDN', async t => {
  const f = await fixture(t);
  f.deps.client = new SynclipImageClient({ apiKey, fetch: async (url, options) => {
    f.calls.push([options.method, url]);
    assert.equal(options.method, 'GET');
    assert.equal(url, 'https://api.synclip.ai/v1/tasks/paid-original-image-1');
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    return Response.json({ success: true, data: f.task });
  } });
  f.deps.download = (task, options) => downloadSynclipImage(task, { ...options,
    resolve: async host => { assert.equal(host, 'cdn.synclip.ai'); return [{ address: '1.1.1.1', family: 4 }]; },
    request: (url, options, callback) => {
      f.calls.push([options.method, url.href]);
      assert.equal(options.method, 'GET'); assert.equal(url.href, signedUrl);
      assert.equal(options.headers.Authorization, undefined);
      assert.doesNotMatch(JSON.stringify(options.headers), /private-test/u);
      const request = new EventEmitter(); request.destroy = () => {};
      process.nextTick(() => {
        const response = Readable.from([original]); response.statusCode = 200;
        response.headers = { 'content-type': 'image/png', 'content-length': String(original.length) };
        callback(response);
      });
      return request;
    },
  });
  assert.equal(await resolveSynclipImageReference(f.options, f.deps), signedUrl);
  assert.deepEqual(f.calls.map(([method]) => method), ['GET', 'GET']);
});

test('malformed invocation also returns only the generic reference error', async () => {
  for (const options of [null, undefined, {}, { get requestId() { throw Error(signedUrl); } }]) {
    await invalid({ options, deps: {} });
  }
});

test('approved bytes, normalized bytes and downloaded original mismatches fail closed', async t => {
  for (const change of ['approved bytes', 'normalized', 'original', 'download', 'invalid PNG']) await t.test(change, async t => {
    const f = await fixture(t);
    if (change === 'approved bytes') f.options.approvedPng = differentImage;
    if (change === 'normalized') await f.put('normalized/result.png', differentImage);
    if (change === 'original') await f.put('synclip-original', differentImage);
    if (change === 'download') f.deps.download = async () => differentImage;
    if (change === 'invalid PNG') f.options.approvedPng = Buffer.from('not a PNG');
    await invalid(f);
    if (!['original', 'download'].includes(change)) assert.deepEqual(f.calls, []);
  });
});

test('source request, attempt, receipt and saved task identity must agree before any GET', async t => {
  const edits = [
    ['request.json', 'id', '88888888-8888-4888-8888-888888888888'],
    ['request.json', 'prompt', 'A substituted private prompt'],
    ['request.json', 'provider', 'codex'],
    ...['synclip-attempt.json', 'synclip-receipt.json'].flatMap(name => [
      [name, 'requestId', '88888888-8888-4888-8888-888888888888'], [name, 'promptHash', 'a'.repeat(64)],
      [name, 'model', 'gpt-image-2.5'], [name, 'aspectRatio', '1:1'],
    ]),
    ['synclip-receipt.json', 'taskId', 'other-paid-task'], ['synclip-receipt.json', 'taskId', '../../private'],
    ['synclip-status.json', 'task_id', 'other-paid-task'], ['synclip-status.json', 'status', 'processing'],
  ];
  for (const [file, key, value] of edits) await t.test(`${file} ${key} ${value}`, async t => {
    const f = await fixture(t), saved = JSON.parse(await readFile(join(f.directory, file), 'utf8'));
    await f.put(file, { ...saved, [key]: value }); await invalid(f); assert.deepEqual(f.calls, []);
  });
});

test('fresh task must be completed, explicitly nonwatermarked, bound to its ID and usable through the deadline', async t => {
  const changes = [
    ['other task', task => { task.task_id = 'other-task'; }],
    ...['queued', 'processing', 'failed'].map(status => [status, task => { task.status = status; }]),
    ['watermarked', task => { task.output.watermarked = true; }],
    ['unknown watermark', task => { delete task.output.watermarked; }],
    ['expired', task => { task.url_expires_at = new Date(now - 1).toISOString(); }],
    ['before deadline', task => { task.url_expires_at = new Date(now + 599999).toISOString(); }],
    ['no expiry', task => { delete task.url_expires_at; }],
    ['data URI', task => { task.output.url = 'data:image/png;base64,AA=='; }],
    ['HTTP', task => { task.output.url = 'http://cdn.synclip.ai/image'; }],
    ['credential URL', task => { task.output.url = 'https://private-test@cdn.synclip.ai/image'; }],
    ['IP URL', task => { task.output.url = 'https://127.0.0.1/image'; }],
  ];
  for (const [label, change] of changes) await t.test(label, async t => {
    const f = await fixture(t); change(f.task); await invalid(f);
    assert.deepEqual(f.calls, [['GET', taskId]]);
  });
});

test('watermarked saved image is rejected without contacting the provider', async t => {
  const f = await fixture(t);
  await f.put('synclip-status.json', { ...f.task, output: { ...f.task.output, watermarked: true } });
  await invalid(f); assert.deepEqual(f.calls, []);
});

test('network and filesystem errors discard signed URLs, provider secrets, raw causes and paths', async t => {
  for (const stage of ['query', 'download', 'json', 'missing']) await t.test(stage, async t => {
    const f = await fixture(t), before = await snapshot(f.root);
    const fail = async () => { throw new Error(`${apiKey} ${signedUrl}`, { cause: { task: f.task } }); };
    if (stage === 'query') f.deps.client.query = fail;
    if (stage === 'download') f.deps.download = fail;
    if (stage === 'json') await writeFile(join(f.directory, 'synclip-receipt.json'), signedUrl);
    if (stage === 'missing') await rm(join(f.directory, 'synclip-receipt.json'));
    await invalid(f);
    if (stage === 'query' || stage === 'download') assert.deepEqual(await snapshot(f.root), before);
  });
});

test('invalid or elapsed deadline stops before GET and time spent querying/downloading cannot yield a late URL', async t => {
  for (const deadlineAt of [now, now - 1, NaN, Infinity, 'later']) await t.test(String(deadlineAt), async t => {
    const f = await fixture(t); f.options.deadlineAt = deadlineAt; await invalid(f); assert.deepEqual(f.calls, []);
  });
  for (const stage of ['query', 'download']) await t.test(`expires during ${stage}`, async t => {
    const f = await fixture(t); let clock = now;
    f.options.deadlineAt = now + 1000; f.deps.now = () => clock;
    if (stage === 'query') f.deps.client.query = async () => { clock += 1000; return f.task; };
    else f.deps.download = async (_task, options) => { assert.equal(options.timeoutMs, 1000); clock += 1000; return original; };
    await invalid(f);
    assert.equal(f.calls.some(([method]) => method === 'download'), false);
  });
});

test('path traversal, symlink components, oversized and nonregular source files never reach GET', async t => {
  for (const id of ['../private', `${requestId}/..`, `${requestId}\\..`, '', null]) await t.test(`requestId ${id}`, async t => {
    const f = await fixture(t); f.options.requestId = id; await invalid(f); assert.deepEqual(f.calls, []);
  });
  for (const [file, maximum] of [['request.json', 16384], ['synclip-attempt.json', 2048], ['synclip-receipt.json', 4096],
    ['synclip-status.json', 65536], ['normalized/result.png', 10 * 1024 * 1024], ['synclip-original', 30 * 1024 * 1024]]) {
    await t.test(`oversized ${file}`, async t => {
      const f = await fixture(t); await truncate(join(f.directory, file), maximum + 1);
      await invalid(f); assert.deepEqual(f.calls, []);
    });
  }
  await t.test('directory in place of receipt', async t => {
    const f = await fixture(t); await rm(join(f.directory, 'synclip-receipt.json')); await mkdir(join(f.directory, 'synclip-receipt.json'));
    await invalid(f); assert.deepEqual(f.calls, []);
  });
  for (const component of ['root', 'private', 'request', 'normalized', 'file']) await t.test(`symlink ${component}`, async t => {
    const f = await fixture(t);
    const source = component === 'root' ? f.root : component === 'private' ? join(f.root, 'private')
      : component === 'request' ? f.directory : component === 'normalized' ? join(f.directory, 'normalized') : join(f.directory, 'synclip-receipt.json');
    const target = join(f.base, `moved-${component}`); await rename(source, target);
    try { await symlink(target, source, component === 'file' ? 'file' : process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM' && component === 'file') { t.skip('Windows file-symlink privilege unavailable; directory junction checks still run'); return; }
      throw error;
    }
    await invalid(f); assert.deepEqual(f.calls, []);
  });
});
