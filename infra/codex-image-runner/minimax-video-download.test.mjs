import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runPilot } from './minimax-video-pilot.mjs';

const video = await readFile(new URL('../../packages/ai-gateway/test/fixtures/minimax-video-sample.mp4', import.meta.url));
async function fixture(t, download = async () => video, status = 'succeeded') {
  const tmp = resolve('tmp');
  await mkdir(tmp, { recursive: true });
  const root = await mkdtemp(join(tmp, 'minimax-download-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, 'minimax-h3-pilot');
  await mkdir(state, { mode: 0o700 });
  const request = { model: 'MiniMax-H3', content: [{ type: 'text', text: 'Original public promotional concept.' }],
    resolution: '768P', duration: 10, ratio: '16:9' };
  const files = {
    [join(root, 'minimax-cloud.json')]: { baseUrl: 'https://api.minimax.cn', apiKeyFile: join(root, 'secrets', 'minimax-video.key'),
      model: 'MiniMax-H3', pilot: { duration: 10, resolution: '768P', ratio: '16:9', maxCreateRequests: 1 } },
    [join(state, 'request.json')]: request,
    [join(state, 'create-attempt')]: { schemaVersion: 1, request, reservedAt: Date.now() },
    [join(state, 'receipt.json')]: { schemaVersion: 1, taskId: 'saved-task-1' },
  };
  if (status === 'succeeded') files[join(state, 'terminal.json')] = {
    id: 'saved-task-1', model: 'MiniMax-H3', status,
    content: { url: 'https://media.example.com/video.mp4?signature=do-not-print' },
    duration: 10, resolution: '768P', ratio: '16:9',
  };
  for (const [path, value] of Object.entries(files)) await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  const dependencies = {
    configPath: join(root, 'minimax-cloud.json'), platform: 'linux', getuid: () => 0, geteuid: () => 0,
    // These tests isolate download behavior; the existing CLI suite covers unsafe metadata.
    lstat: async path => {
      const stat = await lstat(path);
      stat.uid = 0;
      stat.mode = stat.isDirectory() ? 0o40700 : 0o100600;
      return stat;
    },
    getClient: () => { throw new Error('DOWNLOAD_MUST_NOT_READ_KEY_OR_CALL_CREATE'); },
    download,
  };
  return { dependencies, state, output: join(state, 'source.mp4') };
}

test('download uses the saved task without loading the API key or creating another job', async t => {
  let seen;
  const f = await fixture(t, async task => { seen = task.id; return video; });
  const result = await runPilot({ command: 'download' }, f.dependencies);
  assert.equal(seen, 'saved-task-1');
  assert.equal(result.status, 'downloaded');
  assert.equal(result.taskId, 'saved-task-1');
  assert.equal(result.bytes, video.length);
  assert.equal(result.path, f.output);
  assert.deepEqual(await readFile(f.output), video);
  assert.ok(!JSON.stringify(result).includes('signature'));
  assert.ok(!(await readdir(f.state)).some(name => name.endsWith('.part')));
});

test('a completed download is reused without any network call', async t => {
  const f = await fixture(t, async () => { throw new Error('SHOULD_REUSE_EXISTING'); });
  await writeFile(f.output, video, { mode: 0o600 });
  const result = await runPilot({ command: 'download' }, f.dependencies);
  assert.equal(result.status, 'downloaded');
  assert.deepEqual(await readFile(f.output), video);
});

test('download refuses a nonterminal task without querying or recreating it', async t => {
  const f = await fixture(t, async () => { throw new Error('SHOULD_NOT_DOWNLOAD'); }, 'running');
  await assert.rejects(runPilot({ command: 'download' }, f.dependencies), /PILOT_VIDEO_NOT_READY/);
  await assert.rejects(readFile(f.output), { code: 'ENOENT' });
});

test('failed download preserves task receipts and publishes no media', async t => {
  const f = await fixture(t, async () => { throw new Error('VIDEO_TIMEOUT'); });
  const before = await readFile(join(f.state, 'receipt.json'));
  await assert.rejects(runPilot({ command: 'download' }, f.dependencies), /VIDEO_TIMEOUT/);
  assert.deepEqual(await readFile(join(f.state, 'receipt.json')), before);
  await assert.rejects(readFile(f.output), { code: 'ENOENT' });
});

test('invalid cached media is retained for diagnosis rather than overwritten', async t => {
  const f = await fixture(t, async () => { throw new Error('MUST_NOT_OVERWRITE'); });
  await writeFile(f.output, 'partial', { mode: 0o600 });
  await assert.rejects(runPilot({ command: 'download' }, f.dependencies), /PILOT_VIDEO_INVALID/);
  assert.equal(await readFile(f.output, 'utf8'), 'partial');
});

test('a cached truncated container is rejected even when the ftyp signature survives', async t => {
  const f = await fixture(t, async () => { throw new Error('MUST_NOT_OVERWRITE'); });
  await writeFile(f.output, video.subarray(0, video.length - 2), { mode: 0o600 });
  await assert.rejects(runPilot({ command: 'download' }, f.dependencies), /VIDEO_RESPONSE_INVALID/);
  assert.equal((await readFile(f.output)).length, video.length - 2);
});

test('concurrent downloads publish one complete original and remove only their own temporary files', async t => {
  let count = 0;
  let release;
  const ready = new Promise(resolveReady => { release = resolveReady; });
  const f = await fixture(t, async () => {
    const free = Buffer.alloc(9);
    free.writeUInt32BE(9, 0);
    free.write('free', 4);
    free[8] = ++count;
    const ownBytes = Buffer.concat([video, free]);
    if (count === 2) release();
    await ready;
    return ownBytes;
  });
  const results = await Promise.all([
    runPilot({ command: 'download' }, f.dependencies), runPilot({ command: 'download' }, f.dependencies),
  ]);
  const saved = await readFile(f.output);
  assert.deepEqual(saved.subarray(0, video.length), video);
  assert.equal(saved.toString('ascii', video.length + 4, video.length + 8), 'free');
  assert.ok([1, 2].includes(saved[video.length + 8]));
  assert.ok(results.every(result => result.status === 'downloaded' && result.bytes === saved.length));
  assert.ok(!(await readdir(f.state)).some(name => name.endsWith('.part')));
});
