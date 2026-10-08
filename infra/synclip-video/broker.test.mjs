import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { runSynclipVideoBrokerOnce } from './broker.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const nextId = '00000000-0000-4000-8000-000000000002';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
const mp4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(16)]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => stat(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

async function fixture(t) {
  const root = resolve('tmp');
  await mkdir(root, { recursive: true });
  const base = await mkdtemp(join(root, 'synclip-video-broker-test-'));
  t.after(async () => {
    const child = relative(root, base);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    // Only the directory created by this fixture is removed, after its broker has stopped.
    await rm(base, { recursive: true, force: true });
  });
  const cfg = { inbox: join(base, 'inbox'), results: join(base, 'results'), privateRoot: join(base, 'private'),
    keyPath: join(base, 'unused-key'), rendererImage: `sha256:${'a'.repeat(64)}`, adminModelsEnabled: true };
  for (const path of [cfg.inbox, cfg.results, cfg.privateRoot]) await mkdir(path);
  const calls = [];
  let now = Date.now();
  const deps = {
    readKey: async () => 'synthetic-test-key', now: () => now,
    resolveReference: async () => 'https://cdn.synclip.ai/approved-frame.png?signature=synthetic',
    sleep: async ms => { now += ms; },
    fetch: async (url, options) => {
      calls.push({ method: options.method, url, body: options.body && JSON.parse(options.body) });
      const taskId = options.method === 'POST' ? 'task-' + calls.filter(c => c.method === 'POST').length : url.split('/').at(-1);
      return Response.json(options.method === 'POST' ? { task_id: taskId } : { task_id: taskId,
        status: 'completed', output: { type: 'video', url: 'https://cdn.synclip.ai/synthetic.mp4' },
        url_expires_at: '2099-01-01T00:00:00Z' });
    },
    download: async () => mp4,
    render: async (_cfg, _privateDir, outDir) => {
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'result.mp4'), mp4);
    },
  };
  async function job(taskId = id, { privateJob = false, expired = false, prompts = [] } = {}) {
    const d = join(privateJob ? cfg.privateRoot : cfg.inbox, taskId);
    await mkdir(d);
    const story = Buffer.from(JSON.stringify({ approved: true }));
    const scenes = [0, 1, 2].map(index => ({ index, durationSeconds: 5,
      prompt: prompts[index] ?? 'Preserve the approved geometry and show slow motion.',
      image: { name: `scene-${index}.png`, size: png.length, sha256: hash(png), requestId: taskId } }));
    const files = { storyboard: { name: 'storyboard.json', size: story.length, sha256: hash(story) },
      scenes: scenes.map(s => s.image) };
    const request = { schemaVersion: 1, id: taskId, taskId, executionAttempt: 1, profile: 'content-driven-v1',
      provider: 'synclip', model: 'ltx23', resolution: '720p', deadlineAt: now + (expired ? -1 : 600_000),
      scenes, files, inputHash: hash(JSON.stringify(files)) };
    await writeFile(join(d, 'request.json'), JSON.stringify(request));
    await writeFile(join(d, 'storyboard.json'), story);
    for (const s of scenes) await writeFile(join(d, `scene-${s.index}.png`), png);
    return { d, request, resultDir: join(cfg.results, taskId) };
  }
  return { cfg, deps, calls, job, advance: ms => { now += ms; },
    privateDir: join(cfg.privateRoot, id), resultDir: join(cfg.results, id) };
}

test('a finished private job is skipped before expired or missing input validation', async t => {
  const f = await fixture(t);
  const old = await f.job(id, { privateJob: true, expired: true });
  await mkdir(old.resultDir);
  const terminal = JSON.stringify({ status: 'succeeded', id, inputHash: old.request.inputHash });
  await writeFile(join(old.resultDir, 'result.json'), terminal);
  await rm(join(old.d, 'storyboard.json'));
  await f.job(nextId);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id: nextId, status: 'succeeded' });
  assert.equal(await readFile(join(old.resultDir, 'result.json'), 'utf8'), terminal);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 3);
});

test('an expired unfinished job gets a terminal result and cannot poison later runs', async t => {
  const f = await fixture(t);
  await f.job(id, { privateJob: true, expired: true });
  await f.job(nextId);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'DEADLINE_EXCEEDED');
  assert.equal(f.calls.length, 0);
  assert.equal(await exists(join(f.privateDir, 'started')), false);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id: nextId, status: 'succeeded' });
});

test('HTTP uncertainty retains the attempt and never automatically resubmits', async t => {
  const f = await fixture(t);
  await f.job();
  f.deps.fetch = async (_url, options) => { f.calls.push(options.method); return new Response('', { status: 503 }); };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  const attempt = await readFile(join(f.privateDir, 'shot-0.attempt.json'));
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'UNCERTAIN');
  assert.equal(await runSynclipVideoBrokerOnce(f.cfg, f.deps), null);
  assert.deepEqual(f.calls, ['POST']);
  assert.deepEqual(await readFile(join(f.privateDir, 'shot-0.attempt.json')), attempt);
});

test('a malformed create receipt is uncertain even when task-ID validation reports invalid', async t => {
  const f = await fixture(t);
  await f.job();
  f.deps.fetch = async (_url, options) => { f.calls.push(options.method); return Response.json({ task_id: '' }); };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(await exists(join(f.privateDir, 'shot-0.attempt.json')), true);
  assert.deepEqual(f.calls, ['POST']);
});

test('all shots are preflight validated before any started or paid-attempt marker', async t => {
  const f = await fixture(t);
  await f.job(id, { prompts: [undefined, 'x'.repeat(64 * 1024 + 1)] });
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(f.calls.length, 0);
  assert.equal(await exists(join(f.privateDir, 'started')), false);
  assert.equal((await readdir(f.privateDir)).some(name => name.endsWith('.attempt.json')), false);
});

test('the deadline is rechecked before paying for the next sequential shot', async t => {
  const f = await fixture(t);
  await f.job();
  f.deps.download = async () => { f.advance(600_001); return mp4; };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'DEADLINE_EXCEEDED');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(await exists(join(f.privateDir, 'shot-1.attempt.json')), false);
  assert.deepEqual(await readFile(join(f.privateDir, 'shots', 'shot-0.mp4')), mp4);
  assert.deepEqual((await json(join(f.privateDir, 'synclip-receipts.json'))).shots, [{ index: 0, taskId: 'task-1' }]);
});

test('started without any receipt remains uncertain and performs no network call', async t => {
  const f = await fixture(t);
  const old = await f.job(id, { privateJob: true });
  await writeFile(join(old.d, 'started'), 'previous-start');
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(join(old.d, 'started'), 'utf8'), 'previous-start');
});

test('saved shots and receipts are reused, and a later missing receipt cannot pay again', async t => {
  const f = await fixture(t);
  const old = await f.job(id, { privateJob: true });
  await writeFile(join(old.d, 'started'), 'previous-start');
  const receipt = JSON.stringify({ id, shots: [{ index: 0, taskId: 'already-paid' }] });
  await writeFile(join(old.d, 'synclip-receipts.json'), receipt);
  await mkdir(join(old.d, 'shots'));
  await writeFile(join(old.d, 'shots', 'shot-0.mp4'), mp4);
  await writeFile(join(old.d, 'shot-1.attempt.json'), 'preserve-unknown-attempt');
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(join(old.d, 'synclip-receipts.json'), 'utf8'), receipt);
  assert.deepEqual(await readFile(join(old.d, 'shots', 'shot-0.mp4')), mp4);
  assert.equal(await readFile(join(old.d, 'shot-1.attempt.json'), 'utf8'), 'preserve-unknown-attempt');
});

test('a saved receipt is polled without POST and completed shots survive publication', async t => {
  const f = await fixture(t);
  const old = await f.job(id, { privateJob: true });
  await writeFile(join(old.d, 'started'), 'previous-start');
  const receipts = { id, shots: [0, 1, 2].map(index => ({ index, taskId: 'saved-' + index })) };
  await writeFile(join(old.d, 'synclip-receipts.json'), JSON.stringify(receipts));
  await mkdir(join(old.d, 'shots'));
  await writeFile(join(old.d, 'shots', 'shot-0.mp4'), mp4);
  f.cfg.adminModelsEnabled = false;
  f.deps.resolveReference = async () => { throw new Error('Paid shots must not need expired image URLs'); };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.deepEqual(f.calls.map(c => [c.method, c.url.split('/').at(-1)]), [['GET', 'saved-1'], ['GET', 'saved-2']]);
  assert.deepEqual(await json(join(old.d, 'synclip-receipts.json')), receipts);
  const result = await json(join(old.resultDir, 'result.json'));
  assert.equal(result.inputHash, old.request.inputHash);
  assert.equal(result.executionAttempt, 1);
  assert.equal(result.outputSha256, hash(mp4));
  assert.deepEqual(await readFile(join(old.resultDir, 'result.mp4')), mp4);
});

test('a disabled admin route advertises unavailable and does not reserve a paid attempt', async t => {
  const f = await fixture(t);
  f.cfg.adminModelsEnabled = false;
  await f.job();
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.cfg.results, '.ready'))).accepting, false);
  assert.equal(f.calls.length, 0);
  assert.equal(await exists(join(f.privateDir, 'started')), false);
});

test('a missing approved frame receipt cannot cause a paid video POST', async t => {
  const f = await fixture(t);
  await f.job();
  f.deps.resolveReference = async () => { throw new Error('SYNCLIP_VIDEO_REFERENCE_INVALID'); };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(f.calls.length, 0);
  assert.equal(await exists(join(f.privateDir, 'started')), false);
});

test('the paid request contains a short HTTPS reference and current admin field names', async t => {
  const f = await fixture(t);
  await f.job();
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  for (const call of f.calls.filter(c => c.method === 'POST')) {
    assert.equal(call.url, 'https://api.synclip.ai/v1/video-admin');
    assert.equal(call.body.duration_seconds, 5);
    assert.equal(call.body.orientation, 'landscape');
    assert.equal(call.body.first_frame_url, 'https://cdn.synclip.ai/approved-frame.png?signature=synthetic');
    assert.equal(call.body.resolution, undefined);
    assert.equal(call.body.duration, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(call.body)) < 1024);
  }
});

test('ready JSON and mtime are refreshed while a renderer holds a long-running job', async t => {
  const f = await fixture(t);
  await f.job();
  let tick, cleared = false;
  f.deps.setInterval = (callback, ms) => { assert.ok(ms < 60_000); tick = callback; return 123; };
  f.deps.clearInterval = timer => { assert.equal(timer, 123); cleared = true; };
  const render = f.deps.render;
  f.deps.render = async (...args) => {
    const readyPath = join(f.cfg.results, '.ready');
    const before = await json(readyPath);
    const beforeStat = await stat(readyPath);
    f.advance(120_000);
    await tick();
    const ready = await json(readyPath);
    assert.equal(ready.accepting, true);
    assert.equal(ready.updatedAt, f.deps.now());
    assert.ok(ready.updatedAt > before.updatedAt);
    assert.ok((await stat(readyPath)).mtimeMs >= beforeStat.mtimeMs);
    await render(...args);
  };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.equal(cleared, true);
});

test('result directory and files are worker-readable despite restrictive inherited permissions', {
  skip: process.platform === 'win32' ? 'POSIX ownership/mode enforcement requires Linux' : false,
}, async t => {
  const f = await fixture(t);
  await f.job();
  await chmod(f.cfg.results, 0o2750);
  await mkdir(f.resultDir, { mode: 0o700 });
  const previousMask = process.umask(0o077);
  try { assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' }); }
  finally { process.umask(previousMask); }
  const parent = await stat(f.cfg.results);
  const directory = await stat(f.resultDir);
  assert.equal(directory.gid, parent.gid);
  assert.equal(directory.mode & 0o7777, 0o2750);
  for (const name of ['result.json', 'metrics.json', 'result.mp4']) {
    const file = await stat(join(f.resultDir, name));
    assert.equal(file.gid, parent.gid);
    assert.equal(file.mode & 0o777, 0o640);
  }
});
