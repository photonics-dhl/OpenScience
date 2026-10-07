import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, open, writeFile, readFile, readdir, realpath, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { executeSynclipImage, resumeSynclipImage } from './transport.mjs';
import { normalizeImage } from '../chatgpt-browser/broker.mjs';
import { SynclipImageClient } from '../../packages/ai-gateway/dist/synclip-image-api.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = join(repo, 'tmp/hermes-cleanup-20261003');
const fixtureDirectories = [];
after(async () => {
  if (!fixtureDirectories.length) return;
  const expectedRoot = join(await realpath(repo), 'tmp/hermes-cleanup-20261003');
  assert.equal(await realpath(fixtureRoot), expectedRoot);
  for (const base of fixtureDirectories) {
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), expectedRoot);
    assert.match(basename(target), /^independent-domain-synclip-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true, force: true });
  }
});

const id = '77777777-7777-4777-8777-777777777777';
function chunk(type, payload) {
  const body = Buffer.concat([Buffer.from(type), payload]); let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const value = Buffer.alloc(payload.length + 12); value.writeUInt32BE(payload.length); body.copy(value, 4);
  value.writeUInt32BE((crc ^ 0xffffffff) >>> 0, value.length - 4); return value;
}
const header = Buffer.alloc(13); header.writeUInt32BE(1280); header.writeUInt32BE(720, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.alloc((1280 * 4 + 1) * 720))), chunk('IEND', Buffer.alloc(0))]);
const remote = { task_id: 'synclip-original-1', status: 'completed', output: { type: 'image',
  url: 'https://cdn.synclip.ai/original.png?signature=private', watermarked: false }, url_expires_at: '2099-01-01T00:00:00.000Z' };
async function fixture() {
  await mkdir(fixtureRoot, { recursive: true });
  const base = await mkdtemp(join(fixtureRoot, 'independent-domain-synclip-'));
  fixtureDirectories.push(base);
  const privateDir = join(base, id); await mkdir(privateDir);
  const createdAt = Date.now();
  const request = { schemaVersion: 1, provider: 'synclip', id, prompt: 'Exact privately reviewed scientific brief.',
    promptHash: createHash('sha256').update('Exact privately reviewed scientific brief.').digest('hex'),
    createdAt, deadlineAt: createdAt + 600000 };
  await writeFile(join(privateDir, 'request.json'), JSON.stringify(request));
  const calls = []; const config = { apiKey: 'test-only-host-key', rendererImage: `sha256:${'a'.repeat(64)}` };
  const deps = {
    client: {
      create: async prompt => {
        calls.push(['POST', prompt]);
        const attempt = JSON.parse(await readFile(join(privateDir, 'synclip-attempt.json'), 'utf8'));
        assert.equal(attempt.requestId, id); assert.equal(attempt.promptHash, request.promptHash);
        return { task_id: remote.task_id, status: 'processing' };
      },
      query: async taskId => {
        calls.push(['GET', taskId]);
        assert.equal(JSON.parse(await readFile(join(privateDir, 'synclip-receipt.json'), 'utf8')).taskId, taskId);
        return remote;
      },
    },
    download: async task => { calls.push(['download', task.task_id]); return png; },
    normalize: async (_config, requestId, rawPath, normalizedDir) => {
      calls.push(['normalize', requestId]); assert.deepEqual(await readFile(rawPath), png);
      await mkdir(normalizedDir, { recursive: true }); await writeFile(join(normalizedDir, 'result.png'), png); return png;
    },
  };
  return { request, privateDir, config, deps, calls };
}
test('durably binds attempt and task ID before polling, saves originals and returns strict normalized bytes', async () => {
  const f = await fixture(); assert.deepEqual(await executeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(f.calls.map(row => row[0]), ['POST', 'GET', 'download', 'normalize']);
  assert.deepEqual(await readFile(join(f.privateDir, 'synclip-original')), png);
  const receipt = JSON.parse(await readFile(join(f.privateDir, 'synclip-receipt.json'), 'utf8'));
  assert.equal(receipt.model, 'gpt-image-2'); assert.equal(receipt.aspectRatio, '16:9'); assert.equal(receipt.promptHash, f.request.promptHash);
  for (const name of await readdir(f.privateDir)) {
    if (name.endsWith('.json')) assert.ok(!(await readFile(join(f.privateDir, name), 'utf8')).includes(f.config.apiKey));
  }
  f.calls.length = 0;
  assert.deepEqual(await resumeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(f.calls, []);
});
test('lost POST response cannot resend through either execute or resume', async () => {
  const f = await fixture(); f.deps.client.create = async () => { f.calls.push(['POST']); throw Error(f.config.apiKey); };
  for (const method of [executeSynclipImage, executeSynclipImage, resumeSynclipImage]) {
    await assert.rejects(method(f.request, f.privateDir, f.config, f.deps), error => error.code === 'UNCERTAIN' && !String(error).includes(f.config.apiKey));
  }
  assert.deepEqual(f.calls, [['POST']]);
});
test('concurrent executors consume one exclusive POST opportunity', async () => {
  const f = await fixture(); const first = f.deps.client.create;
  f.deps.client.create = async prompt => { await new Promise(resolve => setTimeout(resolve, 20)); return first(prompt); };
  const outcomes = await Promise.allSettled([executeSynclipImage(f.request, f.privateDir, f.config, f.deps), executeSynclipImage(f.request, f.privateDir, f.config, f.deps)]);
  assert.equal(f.calls.filter(row => row[0] === 'POST').length, 1);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
});
test('saved ID survives GET failure and resumes with GET only', async () => {
  const f = await fixture(); const query = f.deps.client.query;
  f.deps.client.query = async () => { throw Error('temporary GET failure'); };
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
  f.deps.client.query = query; f.calls.length = 0;
  assert.deepEqual(await resumeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(f.calls.map(row => row[0]), ['GET', 'download', 'normalize']);
});

test('an interrupted original write cannot publish a partial image and resumes the same receipt with GET only', async t => {
  const f = await fixture(); const rawPath = join(f.privateDir, 'synclip-original');
  const probePath = join(f.privateDir, 'write-probe'); const probe = await open(probePath, 'wx');
  const prototype = Object.getPrototypeOf(probe); const write = prototype.writeFile;
  await probe.close(); await unlink(probePath);
  let interrupted = false;
  const injected = t.mock.method(prototype, 'writeFile', async function (bytes, ...options) {
    if (!interrupted && Buffer.isBuffer(bytes) && bytes.equals(png)) {
      interrupted = true;
      await write.call(this, bytes.subarray(0, 7), ...options); await this.sync();
      throw Object.assign(Error('injected interrupted original write'), { code: 'EIO' });
    }
    return write.call(this, bytes, ...options);
  });
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
  injected.mock.restore(); assert.equal(interrupted, true);
  const attempt = await readFile(join(f.privateDir, 'synclip-attempt.json'));
  const receipt = await readFile(join(f.privateDir, 'synclip-receipt.json'));
  assert.equal(JSON.parse(receipt).taskId, remote.task_id);
  await assert.rejects(readFile(rawPath), { code: 'ENOENT' });
  // A killed process can leave a private temporary file; it is never a result.
  await writeFile(join(f.privateDir, 'synclip-original.interrupted.tmp'), png.subarray(0, 7));
  assert.deepEqual(await resumeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(await readFile(rawPath), png);
  assert.deepEqual(await readFile(join(f.privateDir, 'synclip-attempt.json')), attempt);
  assert.deepEqual(await readFile(join(f.privateDir, 'synclip-receipt.json')), receipt);
  assert.equal(f.calls.filter(row => row[0] === 'POST').length, 1);
  assert.deepEqual(f.calls.filter(row => row[0] === 'GET'), [['GET', remote.task_id], ['GET', remote.task_id]]);
});

test('publishing a complete download never overwrites an original that appeared during the download', async () => {
  const f = await fixture(); const rawPath = join(f.privateDir, 'synclip-original'); const retained = Buffer.from('retained original');
  f.deps.download = async () => { await writeFile(rawPath, retained, { flag: 'wx' }); return png; };
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
  assert.deepEqual(await readFile(rawPath), retained);
  assert.equal(f.calls.filter(row => row[0] === 'POST').length, 1);
  assert.equal(JSON.parse(await readFile(join(f.privateDir, 'synclip-receipt.json'), 'utf8')).taskId, remote.task_id);
});
test('pending resume returns null after one GET without sleeping, POST or download', async () => {
  const f = await fixture(); f.deps.client.query = async () => { throw Error('connection lost'); };
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps)); f.calls.length = 0;
  f.deps.client.query = async task_id => { f.calls.push(['GET', task_id]); return { task_id, status: 'processing' }; };
  assert.equal(await resumeSynclipImage(f.request, f.privateDir, f.config, f.deps), null);
  assert.deepEqual(f.calls, [['GET', remote.task_id]]);
});
test('an incomplete exclusive attempt stays unknown without a POST', async () => {
  const f = await fixture(); await writeFile(join(f.privateDir, 'synclip-attempt.json'), '{');
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' }); assert.deepEqual(f.calls, []);
});
test('changed original request or mismatched receipt is rejected before networking', async () => {
  const f = await fixture(); await executeSynclipImage(f.request, f.privateDir, f.config, f.deps); f.calls.length = 0;
  await assert.rejects(resumeSynclipImage({ ...f.request, prompt: 'replacement' }, f.privateDir, f.config, f.deps));
  const path = join(f.privateDir, 'synclip-receipt.json'); const receipt = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...receipt, promptHash: '0'.repeat(64) }));
  await assert.rejects(resumeSynclipImage(f.request, f.privateDir, f.config, f.deps)); assert.deepEqual(f.calls, []);
});
test('retains downloaded original after normalization failure and resumes locally without another GET', async () => {
  const f = await fixture(); const normalize = f.deps.normalize;
  f.deps.normalize = async () => { throw Error('local failure'); };
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
  assert.deepEqual(await readFile(join(f.privateDir, 'synclip-original')), png);
  f.deps.normalize = normalize; f.calls.length = 0;
  assert.deepEqual(await resumeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(f.calls.map(row => row[0]), ['normalize']);
});
test('failed remote task remains terminal with no second POST', async () => {
  const f = await fixture(); f.deps.client.query = async task_id => ({ task_id, status: 'failed' });
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), /SYNCLIP_TASK_FAILED/);
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), /SYNCLIP_TASK_FAILED/);
  assert.equal(f.calls.filter(row => row[0] === 'POST').length, 1);
});
test('does not submit an expired request and validates normalized output from the local boundary', async () => {
  const f = await fixture(); const expired = { ...f.request, createdAt: 1, deadlineAt: 2 };
  await writeFile(join(f.privateDir, 'request.json'), JSON.stringify(expired));
  await assert.rejects(executeSynclipImage(expired, f.privateDir, f.config, f.deps)); assert.deepEqual(f.calls, []);
  await writeFile(join(f.privateDir, 'request.json'), JSON.stringify(f.request));
  f.deps.normalize = async () => Buffer.from('invalid output');
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
});
test('real Gateway client and host transport preserve the exact private wire prompt through POST and GET', async () => {
  const f = await fixture(); const wire = [];
  f.deps.client = new SynclipImageClient({ apiKey: f.config.apiKey, fetch: async (url, options) => {
    wire.push({ url, options });
    if (options.method === 'POST') {
      assert.equal(JSON.parse(await readFile(join(f.privateDir, 'synclip-attempt.json'), 'utf8')).promptHash, f.request.promptHash);
      return Response.json({ success: true, data: { task_id: remote.task_id, status: 'processing' } });
    }
    assert.equal(JSON.parse(await readFile(join(f.privateDir, 'synclip-receipt.json'), 'utf8')).taskId, remote.task_id);
    return Response.json({ success: true, data: remote });
  } });
  assert.deepEqual(await executeSynclipImage(f.request, f.privateDir, f.config, f.deps), png);
  assert.deepEqual(wire.map(call => call.options.method), ['POST', 'GET']);
  assert.deepEqual(JSON.parse(wire[0].options.body), { prompt: f.request.prompt, model: 'gpt-image-2', aspectRatio: '16:9' });
});
test('execute polls the same saved task at bounded intervals and stops without resubmission at its deadline', async () => {
  const f = await fixture(); let clock = Date.now(); const start = clock;
  f.deps.now = () => clock; f.config.deadlineAt = clock + 4000;
  f.deps.sleep = async ms => { f.calls.push(['sleep', ms]); clock += ms; };
  f.deps.client.query = async task_id => { f.calls.push(['GET', task_id]); return { task_id, status: 'processing' }; };
  await assert.rejects(executeSynclipImage(f.request, f.privateDir, f.config, f.deps), { code: 'UNCERTAIN' });
  assert.equal(f.calls.filter(call => call[0] === 'POST').length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'GET'), [['GET', remote.task_id], ['GET', remote.task_id]]);
  assert.equal(clock - start, 4000);
});
test('normalizer reuse is import-safe and runs only isolated local edge sampling and contain/pad conversion', async () => {
  const f = await fixture(); const normalizedDir = join(f.privateDir, 'normalized'); await mkdir(normalizedDir);
  f.config.rendererImage = `registry.example/renderer@sha256:${'a'.repeat(64)}`; // Existing broker accepts pinned registry references too.
  const rawPath = join(f.privateDir, 'synclip-original'); await writeFile(rawPath, png);
  const calls = [];
  const runDocker = async args => {
    calls.push(args);
    if (args.at(-1) === '/output/edge-sample.rgba') {
      await writeFile(join(normalizedDir, 'edge-sample.rgba'), Buffer.from(Array(64).fill([255, 255, 255, 255]).flat()));
    } else if (args.at(-1) === '/output/result.pending.png') await writeFile(join(normalizedDir, 'result.pending.png'), png);
  };
  assert.deepEqual(await normalizeImage(f.config, id, rawPath, normalizedDir, Date.now() + 45000, runDocker), png);
  assert.equal(calls.length, 3); assert.deepEqual(calls[2], ['rm', '-f', `xgs-chatgpt-web-normalize-${id}`]);
  for (const args of calls.slice(0, 2)) {
    assert.equal(args[args.indexOf('--network') + 1], 'none'); assert.ok(args.includes('--read-only'));
    assert.ok(!args.join(' ').includes(f.config.apiKey)); assert.ok(!args.includes('auth.json'));
  }
  const filter = calls[1][calls[1].indexOf('-filter_complex') + 1];
  assert.match(filter, /scale=1280:720:force_original_aspect_ratio=decrease/);
  assert.match(filter, /overlay=\(W-w\)\/2:\(H-h\)\/2/); assert.match(filter, /color=c=0xffffff/);
  assert.deepEqual(await readFile(join(normalizedDir, 'result.png')), png);
});
