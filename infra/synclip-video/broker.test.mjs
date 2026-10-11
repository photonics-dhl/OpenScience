import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runSynclipVideoBrokerOnce, muxSynclipNarration, probeMedia, decodeSynclipAudio, rendererCommand } from './broker.mjs';
import * as broker from './broker.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const nextId = '00000000-0000-4000-8000-000000000002';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
const mp4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(16)]);
const mp3Frame = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.alloc(413)]);
const mp3 = Buffer.concat([mp3Frame, mp3Frame]);
const narration = { provider: 'synclip', voice: 'test-catalog-voice', speed: 1 };
const executeFile = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => stat(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

test('voice catalog reads once while admission is closed and preserves pending jobs and heartbeat', async t => {
  const f = await fixture(t);
  f.cfg.adminModelsEnabled = false;
  await mkdir(f.privateDir);
  await writeFile(join(f.privateDir, 'started'), 'preserved unknown submission');
  await writeFile(join(f.cfg.results, '.ready'), 'preserved disabled heartbeat');
  const beforeConfig = JSON.stringify(f.cfg);
  assert.equal(typeof broker.listSynclipAudioCatalog, 'function');
  const catalog = await broker.listSynclipAudioCatalog(f.cfg, { readKey: f.deps.readKey, fetch: f.deps.audioFetch });
  assert.deepEqual(catalog, { provider: 'synclip', voices: [{ id: narration.voice, name: 'Offline catalog fixture',
    gender: 'Female', languages: ['en'], is_premium: false, coins_per_char: 1, previewAvailable: false }] });
  assert.deepEqual(f.audioCalls, [{ method: 'GET', url: 'https://api.synclip.ai/v1/voices', body: undefined }]);
  assert.deepEqual(f.calls, []);
  assert.equal(JSON.stringify(f.cfg), beforeConfig);
  assert.equal(await readFile(join(f.privateDir, 'started'), 'utf8'), 'preserved unknown submission');
  assert.equal(await readFile(join(f.cfg.results, '.ready'), 'utf8'), 'preserved disabled heartbeat');
  assert.deepEqual(await readdir(f.cfg.inbox), []);
  assert.deepEqual(await readdir(f.privateDir), ['started']);
  assert.deepEqual(await readdir(f.cfg.results), ['.ready']);
});

test('voice catalog omits remote preview URLs and does not choose or synthesize a voice', async t => {
  const f = await fixture(t), calls = [];
  assert.equal(typeof broker.listSynclipAudioCatalog, 'function');
  const catalog = await broker.listSynclipAudioCatalog(f.cfg, { readKey: f.deps.readKey, fetch: async (url, options) => {
    calls.push({ url, method: options.method });
    return Response.json({ success: true, data: [{ id: 'catalog-zh-voice', name: 'Catalog Chinese voice', gender: 'Female',
      languages: ['zh-CN'], is_premium: true, coins_per_char: 2,
      preview_url: 'https://cdn.synclip.ai/sample.mp3?signature=private-preview-token' }] });
  } });
  assert.equal(catalog.voices[0].previewAvailable, true);
  assert.equal(catalog.voices[0].id, 'catalog-zh-voice');
  assert.deepEqual(catalog.voices[0].languages, ['zh-CN']);
  assert.equal(JSON.stringify(catalog).includes('private-preview-token'), false);
  assert.equal(JSON.stringify(catalog).includes('preview_url'), false);
  assert.equal(Object.hasOwn(f.cfg, 'audio'), false);
  assert.deepEqual(calls, [{ url: 'https://api.synclip.ai/v1/voices', method: 'GET' }]);
});

test('voice catalog reports bounded HTTP or validation failures without retrying or exposing provider bodies', async t => {
  const f = await fixture(t);
  assert.equal(typeof broker.listSynclipAudioCatalog, 'function');
  assert.equal(typeof broker.synclipAudioCatalogFailure, 'function');
  for (const [response, expected] of [
    [new Response('private-provider-error-body', { status: 403 }),
      { error: 'SYNCLIP_AUDIO_CATALOG_FAILED', code: 'SYNCLIP_AUDIO_HTTP_FAILED', httpStatus: 403 }],
    [Response.json({ success: true, data: [{ id: 'malformed' }] }),
      { error: 'SYNCLIP_AUDIO_CATALOG_FAILED', code: 'SYNCLIP_AUDIO_RESPONSE_INVALID' }],
  ]) {
    const calls = [];
    await assert.rejects(() => broker.listSynclipAudioCatalog(f.cfg, { readKey: f.deps.readKey,
      fetch: async (url, options) => { calls.push({ url, method: options.method }); return response; } }), error => {
      assert.deepEqual(broker.synclipAudioCatalogFailure(error), expected);
      return true;
    });
    assert.deepEqual(calls, [{ url: 'https://api.synclip.ai/v1/voices', method: 'GET' }]);
  }
  assert.deepEqual(broker.synclipAudioCatalogFailure(new Error('synthetic-test-key private-provider-error-body')),
    { error: 'SYNCLIP_AUDIO_CATALOG_FAILED', code: 'EXECUTION_FAILED' });
  assert.deepEqual(await readdir(f.cfg.results), []);
  assert.deepEqual(await readdir(f.cfg.privateRoot), []);
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
  const calls = [], audioCalls = [], order = [];
  let now = Date.now();
  const deps = {
    readKey: async () => 'synthetic-test-key', now: () => now,
    resolveReference: async () => 'https://cdn.synclip.ai/approved-frame.png?signature=synthetic',
    sleep: async ms => { now += ms; },
    fetch: async (url, options) => {
      calls.push({ method: options.method, url, body: options.body && JSON.parse(options.body) });
      order.push({ type: 'video', method: options.method });
      const taskId = options.method === 'POST' ? 'task-' + calls.filter(c => c.method === 'POST').length : url.split('/').at(-1);
      return Response.json(options.method === 'POST' ? { task_id: taskId } : { task_id: taskId,
        status: 'completed', output: { type: 'video', url: 'https://cdn.synclip.ai/synthetic.mp4' },
        url_expires_at: '2099-01-01T00:00:00Z' });
    },
    download: async () => mp4,
    audioFetch: async (url, options) => {
      audioCalls.push({ method: options.method, url, body: options.body && JSON.parse(options.body) });
      order.push({ type: 'audio', method: options.method });
      const taskId = options.method === 'POST' ? 'tts-' + audioCalls.filter(call => call.method === 'POST').length : url.split('/').at(-1);
      const data = url.endsWith('/voices') ? [{ id: narration.voice, name: 'Offline catalog fixture', gender: 'Female', languages: ['en'],
        is_premium: false, coins_per_char: 1, preview_url: null }] : options.method === 'POST' ? { task_id: taskId, status: 'queued' }
        : { task_id: taskId, status: 'completed', output: { type: 'audio', url: 'https://cdn.synclip.ai/offline.mp3' }, url_expires_at: '2099-01-01T00:00:00Z' };
      return Response.json({ success: true, data });
    },
    downloadAudio: async () => ({ bytes: mp3, format: 'mp3', contentType: 'audio/mpeg' }),
    decodeAudio: async () => 2.5,
    probe: async (_cfg, _directory, path) => path.startsWith('audio/')
      ? { durationSeconds: 2.5, streams: [{ type: 'audio', codec: 'mp3' }] }
      : { durationSeconds: 30, streams: [{ type: 'video', codec: 'h264', width: 1280, height: 720, startTimeSeconds: 0, durationSeconds: 30 },
        { type: 'audio', codec: 'aac', channels: 2, startTimeSeconds: 0, durationSeconds: 30 }] },
    render: async (_cfg, _privateDir, outDir) => {
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'result.mp4'), mp4);
    },
  };
  async function job(taskId = id, { privateJob = false, expired = false, prompts = [], audio = false, narrations = [] } = {}) {
    const d = join(privateJob ? cfg.privateRoot : cfg.inbox, taskId);
    await mkdir(d);
    const scenes = [0, 1, 2].map(index => ({ index, durationSeconds: audio ? 10 : 5, ...(audio ? { narration: narrations[index] ?? 'Source-bound spoken sentence ' + index + '.' } : {}),
      prompt: prompts[index] ?? 'Preserve the approved geometry and show slow motion.',
      image: { name: `scene-${index}.png`, size: png.length, sha256: hash(png), requestId: taskId } }));
    if (audio) cfg.audio = { ...narration };
    const document = audio ? { locale: 'en', narrative: { mainMessage: 'A supported connection', audience: 'New readers' },
      videoProduction: { audioPolicy: 'external-narration' }, scenes: scenes.map(scene => ({ narration: scene.narration, durationSeconds: scene.durationSeconds,
        videoDirection: { reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration', subtitleMode: 'none' } })) } : { approved: true };
    const story = Buffer.from(JSON.stringify(document));
    const files = { storyboard: { name: 'storyboard.json', size: story.length, sha256: hash(story) },
      scenes: scenes.map(s => s.image) };
    const request = { schemaVersion: 1, id: taskId, taskId, executionAttempt: 1, profile: 'content-driven-v1',
      provider: 'synclip', model: 'ltx23', resolution: '720p', deadlineAt: now + (expired ? -1 : 600_000),
      scenes, files, ...(audio ? { audio: narration } : {}), inputHash: hash(JSON.stringify(audio ? { files, audio: narration, scenes } : files)) };
    await writeFile(join(d, 'request.json'), JSON.stringify(request));
    await writeFile(join(d, 'storyboard.json'), story);
    for (const s of scenes) await writeFile(join(d, `scene-${s.index}.png`), png);
    return { d, request, resultDir: join(cfg.results, taskId) };
  }
  return { cfg, deps, calls, audioCalls, order, job, advance: ms => { now += ms; },
    privateDir: join(cfg.privateRoot, id), resultDir: join(cfg.results, id) };
}

async function auditionFixture(t) {
  const f = await fixture(t), job = await f.job(id, { audio: true, privateJob: true });
  await writeFile(join(job.d, 'started'), 'claimed-original-task');
  f.cfg.adminModelsEnabled = false;
  const claims = [];
  const scope = { taskId: id, executionAttempt: 1, inputHash: job.request.inputHash, sceneIndex: 1 };
  const deps = { ...f.deps, withSubmission: async (owner, publish) => { claims.push(owner); return publish(); } };
  return { ...f, job, scope, deps, claims, run: override => broker.prepareSynclipAudioAudition(f.cfg, { ...scope, ...override }, deps) };
}

async function authorizedAuditionJob(t, { workerCeiling = 200, hostCeiling = 200, narrations = [] } = {}) {
  const f = await fixture(t), job = await f.job(id, { audio: true, narrations });
  f.cfg.adminModelsEnabled = false; f.cfg.audioAuditionEnabled = true; f.cfg.audioAuditionBudget = { maxEstimatedCoins: hostCeiling };
  const value = { ...job.request, purpose: 'audio-audition', sceneIndex: 1, locale: 'en', sourceClaimIds: [nextId], createdAt: f.deps.now() };
  value.inputHash = hash(JSON.stringify({ files: value.files, audio: value.audio, scenes: value.scenes,
    purpose: value.purpose, sceneIndex: value.sceneIndex, voice: value.audio.voice, locale: value.locale }));
  value.audioAuditionGrant = { schemaVersion: 1, purpose: value.purpose, taskId: id, executionAttempt: 1, inputHash: value.inputHash,
    actorId: 'actor', workspaceId: 'workspace', researchObjectId: 'ro', versionId: 'version', sourceClaimIds: value.sourceClaimIds,
    parentIdentity: 'accepted-source-parent', sceneIndex: 1, locale: 'en', audio: value.audio,
    workerMaxEstimatedCoins: workerCeiling, hostMaxEstimatedCoins: hostCeiling, createdAt: value.createdAt, deadlineAt: value.deadlineAt };
  await writeFile(join(job.d, 'request.json'), JSON.stringify(value));
  f.deps.resolveReference = async () => assert.fail('Audio audition must not refresh a video frame');
  f.deps.render = async () => assert.fail('Audio audition must not render a video');
  return { ...f, job, value };
}

test('audition narration length permits a selected short scene and posts only its TTS with an unselected long scene', async t => {
  const selected = 'The source-bound selected narration.';
  const unselected = 'Unselected source narration. '.repeat(5);
  const f = await authorizedAuditionJob(t, { narrations: [unselected, selected] });
  assert.ok([...unselected].length > 120);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.deepEqual(f.audioCalls.filter(call => call.method === 'POST').map(call => call.body), [{ text: selected, voice: narration.voice, speed: narration.speed }]);
  assert.deepEqual((await json(join(f.privateDir, 'audio-receipts.json'))).scenes.map(scene => scene.index), [1]);
  assert.equal((await json(join(f.resultDir, 'result.json'))).audio.quote.characters, [...selected].length);
  assert.equal(f.calls.length, 0);
});

test('audition narration length accepts 120 non-BMP codepoints and quotes the same character count', async t => {
  const selected = '\u{20BB7}'.repeat(120);
  const f = await authorizedAuditionJob(t, { narrations: [undefined, selected] });
  assert.equal(selected.length, 240); assert.equal([...selected].length, 120);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  const result = await json(join(f.resultDir, 'result.json'));
  assert.equal(result.audio.quote.characters, 120); assert.equal(result.audio.quote.estimatedCoins, 120);
  assert.deepEqual(f.audioCalls.filter(call => call.method === 'POST').map(call => call.body), [{ text: selected, voice: narration.voice, speed: narration.speed }]);
  assert.equal(f.calls.length, 0);
});

test('audition narration length rejects 121 selected non-BMP codepoints before key or provider access', async t => {
  const f = await authorizedAuditionJob(t, { narrations: [undefined, '\u{20BB7}'.repeat(121)] });
  let keyReads = 0;
  f.deps.readKey = async () => { keyReads++; return 'synthetic-test-key'; };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_AUDITION_SCOPE');
  assert.equal(keyReads, 0); assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
  assert.equal(await exists(join(f.privateDir, 'audio-1.attempt.json')), false);
});

test('authorized audio-purpose broker produces one private MP3 and quote with video admission closed', async t => {
  const f = await authorizedAuditionJob(t);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  const result = await json(join(f.resultDir, 'result.json'));
  assert.equal(result.purpose, 'audio-audition'); assert.equal(result.executionAttempt, 1);
  assert.equal(result.audio.sceneIndex, 1); assert.equal(result.audio.contentType, 'audio/mpeg');
  assert.equal(result.audio.quote.estimatedCoins, f.value.scenes[1].narration.length);
  assert.equal(result.audio.quote.coinsPerCharacter, 1);
  assert.equal(Object.hasOwn(result.audio, 'coinsUsed'), false);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.length, 0); assert.equal(await exists(join(f.resultDir, 'result.mp4')), false);
  assert.deepEqual(await readFile(join(f.resultDir, 'audition.mp3')), mp3);
  const ready = await json(join(f.cfg.results, '.ready'));
  assert.equal(ready.accepting, false); assert.equal(ready.audioAccepting, true);
  const receipt = await json(join(f.privateDir, 'audio-receipts.json'));
  assert.equal(receipt.scenes.length, 1); assert.equal(receipt.scenes[0].quote.estimatedCoins, result.audio.quote.estimatedCoins);
});

for (const caps of [{ workerCeiling: 1, hostCeiling: 200 }, { workerCeiling: 200, hostCeiling: 1 }])
  test('authorized audio-purpose quote respects the stricter worker/host ceiling ' + JSON.stringify(caps), async t => {
    const f = await authorizedAuditionJob(t, caps);
    assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
    assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_AUDITION_BUDGET_EXCEEDED');
    assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 0);
    assert.equal(await exists(join(f.privateDir, 'audio-1.attempt.json')), false); assert.equal(f.calls.length, 0);
    assert.equal((await json(join(f.cfg.results, '.ready'))).audioAccepting, true);
  });

test('authorized audio-purpose preserves an unknown POST and never resubmits it on another broker tick', async t => {
  const f = await authorizedAuditionJob(t), original = f.deps.audioFetch;
  f.deps.audioFetch = async (url, options) => {
    if (options.method !== 'POST') return original(url, options);
    f.audioCalls.push({ url, method: 'POST' }); throw Error('Lost accepted audio response');
  };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(await exists(join(f.privateDir, 'audio-1.attempt.json')), true);
  const attempt = await json(join(f.privateDir, 'audio-1.attempt.json'));
  assert.equal(attempt.quote.estimatedCoins, f.value.scenes[1].narration.length);
  assert.equal(await runSynclipVideoBrokerOnce(f.cfg, f.deps), null);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1); assert.equal(f.calls.length, 0);
});

test('authorized audio-purpose timing revision retains playable MP3 without reporting a video result', async t => {
  const f = await authorizedAuditionJob(t); f.deps.decodeAudio = async () => 10.2;
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  const result = await json(join(f.resultDir, 'result.json'));
  assert.equal(result.audio.timingStatus, 'requires_revision'); assert.equal(result.audio.durationSeconds, 10.2);
  assert.equal(await exists(join(f.resultDir, 'audition.mp3')), true); assert.equal(f.calls.length, 0);
});

for (const change of ['missing', 'attempt', 'scene', 'budget', 'locale'])
  test('authorized audio-purpose rejects changed grant ' + change + ' before provider work', async t => {
    const f = await authorizedAuditionJob(t);
    if (change === 'missing') delete f.value.audioAuditionGrant;
    if (change === 'attempt') f.value.audioAuditionGrant.executionAttempt = 2;
    if (change === 'scene') f.value.audioAuditionGrant.sceneIndex = 0;
    if (change === 'budget') f.value.audioAuditionGrant.workerMaxEstimatedCoins = 0;
    if (change === 'locale') f.value.audioAuditionGrant.locale = 'zh';
    await writeFile(join(f.job.d, 'request.json'), JSON.stringify(f.value));
    await assert.rejects(runSynclipVideoBrokerOnce(f.cfg, f.deps), /AUDIO_AUDITION_GRANT/u);
    assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
  });

test('authorized audio-purpose rejects a grant stripped of its purpose before legacy video routing', async t => {
  const f = await authorizedAuditionJob(t);
  delete f.value.purpose;
  f.value.inputHash = hash(JSON.stringify({ files: f.value.files, audio: f.value.audio, scenes: f.value.scenes }));
  await writeFile(join(f.job.d, 'request.json'), JSON.stringify(f.value));
  await assert.rejects(runSynclipVideoBrokerOnce(f.cfg, f.deps), /VIDEO_REQUEST/u);
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
});

test('authorized audio-purpose missing Host budget refuses only the request without a default quote or charge', async t => {
  const f = await authorizedAuditionJob(t); delete f.cfg.audioAuditionBudget;
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_AUDITION_BUDGET_UNAVAILABLE');
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
  assert.equal((await json(join(f.cfg.results, '.ready'))).audioAccepting, false);
});

test('authorized audio-purpose retains actual returned coins only when present on a known result', async t => {
  const f = await authorizedAuditionJob(t), original = f.deps.audioFetch;
  f.deps.audioFetch = async (url, options) => {
    const response = await original(url, options);
    if (options.method === 'GET' && !url.endsWith('/voices')) {
      const body = await response.json(); body.data.coins_used = 23; return Response.json(body);
    }
    return response;
  };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).audio.coinsUsed, 23);
});

test('authorized audio-purpose rechecks the protected Host ceiling at claim before writing an attempt', async t => {
  const f = await authorizedAuditionJob(t);
  f.deps.readAudioAuditionConfig = async () => ({ ...f.cfg, audioAuditionBudget: { maxEstimatedCoins: 1 } });
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_AUDITION_BUDGET_EXCEEDED');
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 0);
  assert.equal(await exists(join(f.privateDir, 'audio-1.attempt.json')), false);
});

test('authorized audio-purpose adopts known cached paid speech after its fixed POST deadline without new POST', async t => {
  const f = await authorizedAuditionJob(t);
  await mkdir(join(f.cfg.privateRoot, id));
  // Move the original fixture inputs using the same claim as production, then emulate a crash after measured speech.
  const directory = join(f.cfg.privateRoot, id);
  for (const name of ['request.json', 'storyboard.json', 'scene-0.png', 'scene-1.png', 'scene-2.png'])
    await writeFile(join(directory, name), await readFile(join(f.job.d, name)));
  await writeFile(join(directory, 'started'), 'original-attempt'); await mkdir(join(directory, 'audio'));
  const scene = f.value.scenes[1], parameters = { text: scene.narration, voice: narration.voice, speed: 1 };
  const quote = { coinsPerCharacter: 1, characters: scene.narration.length, estimatedCoins: scene.narration.length, workerCeiling: 200, hostCeiling: 200 };
  await writeFile(join(directory, 'audio-receipts.json'), JSON.stringify({ id, inputHash: f.value.inputHash, voice: narration.voice, speed: 1,
    scenes: [{ index: 1, taskId: 'known-paid-tts', request: parameters, quote }] }));
  await writeFile(join(directory, 'audio/scene-1.mp3'), mp3);
  await writeFile(join(directory, 'audio/scene-1.json'), JSON.stringify({ sceneIndex: 1, narration: scene.narration,
    plannedDurationSeconds: scene.durationSeconds, taskId: 'known-paid-tts', contentHash: hash(mp3), size: mp3.length, durationSeconds: 2.5, request: parameters }));
  f.advance(600_001); f.cfg.audioAuditionEnabled = false;
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).audio.audioTaskId, 'known-paid-tts');
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
});

test('private audio audition uses the selected original scene once and never calls video or publishes film success', async t => {
  const f = await auditionFixture(t);
  assert.equal(typeof broker.prepareSynclipAudioAudition, 'function');
  await writeFile(join(f.cfg.results, '.ready'), 'unchanged closed admission');
  f.deps.resolveReference = async () => assert.fail('Audition must not resolve video references');
  f.deps.render = async () => assert.fail('Audition must not render a video');
  const output = await f.run();
  assert.equal(output.sceneIndex, 1); assert.equal(output.durationSeconds, 2.5);
  assert.equal(output.taskId, id); assert.equal(output.inputHash, f.scope.inputHash);
  assert.equal(output.filePath, join(f.job.d, 'audio/scene-1.mp3'));
  assert.equal(output.contentHash, hash(mp3)); assert.equal(output.size, mp3.length);
  assert.equal(output.voice, narration.voice); assert.equal(output.speed, 1);
  assert.deepEqual(f.audioCalls.filter(call => call.method === 'POST').map(call => call.body), [{
    text: f.job.request.scenes[1].narration, voice: narration.voice, speed: 1,
  }]);
  assert.equal(f.claims.length, 1); assert.equal(f.claims[0].taskId, id);
  assert.deepEqual(f.calls, []);
  assert.equal(await exists(join(f.resultDir, 'result.json')), false);
  assert.equal(await readFile(join(f.cfg.results, '.ready'), 'utf8'), 'unchanged closed admission');
  const before = f.audioCalls.length;
  assert.deepEqual(await f.run(), output);
  assert.equal(f.audioCalls.length, before); assert.equal(f.claims.length, 1);
  assert.deepEqual((await json(join(f.job.d, 'audio-receipts.json'))).scenes.map(scene => scene.index), [1]);
});

for (const [field, changed] of [['executionAttempt', 2], ['inputHash', 'b'.repeat(64)], ['sceneIndex', -1]])
  test('private audio audition rejects changed ' + field + ' before reading a key or making requests', async t => {
    const f = await auditionFixture(t); let keyReads = 0;
    f.deps.readKey = async () => { keyReads++; return 'synthetic-test-key'; };
    await assert.rejects(f.run({ [field]: changed }), /AUDIO_AUDITION_SCOPE/u);
    assert.equal(keyReads, 0); assert.equal(f.audioCalls.length, 0); assert.equal(f.claims.length, 0);
  });

test('private audio audition requires the existing submission authority and preserves denial before charging', async t => {
  const f = await auditionFixture(t);
  delete f.deps.withSubmission;
  await assert.rejects(f.run(), /AUDIO_AUDITION_AUTHORITY/u);
  f.deps.withSubmission = async () => { throw Error('Existing task authority changed'); };
  await assert.rejects(f.run(), /Existing task authority changed/u);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 0);
  assert.equal(await exists(join(f.job.d, 'audio-1.attempt.json')), false);
});

test('private audio audition rejects legacy unbound narration before reading a key', async t => {
  const f = await fixture(t), job = await f.job(id, { privateJob: true }); let keyReads = 0;
  job.request.scenes.forEach(scene => { scene.narration = 'Legacy text outside the bound audio contract.'; });
  await writeFile(join(job.d, 'request.json'), JSON.stringify(job.request));
  await writeFile(join(job.d, 'started'), 'claimed-original-task');
  await assert.rejects(broker.prepareSynclipAudioAudition(f.cfg, { taskId: id, executionAttempt: 1,
    inputHash: job.request.inputHash, sceneIndex: 0 }, { ...f.deps,
    withSubmission: async (_owner, publish) => publish(), readKey: async () => { keyReads++; return 'synthetic-test-key'; } }), /AUDIO_AUDITION_SCOPE/u);
  assert.equal(keyReads, 0); assert.equal(f.audioCalls.length, 0);
});

for (const state of ['unclaimed', 'expired', 'voice-changed']) test('private audio audition rejects ' + state + ' before a provider request', async t => {
  const f = await auditionFixture(t);
  if (state === 'unclaimed') await rm(join(f.job.d, 'started'));
  if (state === 'expired') f.advance(600_001);
  if (state === 'voice-changed') f.cfg.audio = { ...narration, voice: 'different-voice' };
  await assert.rejects(f.run(), /AUDIO_AUDITION_TASK|DEADLINE_EXCEEDED|AUDIO_CONFIG_CHANGED/u);
  assert.equal(f.audioCalls.length, 0); assert.equal(f.claims.length, 0); assert.equal(f.calls.length, 0);
});

test('private audio audition concurrent calls submit audio at most once', async t => {
  const f = await auditionFixture(t);
  const outcomes = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1);
  assert.ok(outcomes.some(outcome => outcome.status === 'fulfilled'));
  for (const outcome of outcomes) if (outcome.status === 'rejected') assert.match(outcome.reason.message, /^UNCERTAIN$/u);
  assert.equal(f.calls.length, 0); assert.equal(await exists(join(f.resultDir, 'result.json')), false);
});

for (const mode of ['missing-voice', 'wrong-language']) test('private audio audition validates ' + mode + ' before charging', async t => {
  const f = await auditionFixture(t);
  f.deps.audioFetch = async (url, options) => {
    f.audioCalls.push({ url, method: options.method });
    return Response.json({ success: true, data: mode === 'missing-voice' ? [] : [{ id: narration.voice,
      name: 'Chinese-only fixture', gender: 'Female', languages: ['zh-CN'], is_premium: false, coins_per_char: 1 }] });
  };
  await assert.rejects(f.run(), mode === 'missing-voice' ? /AUDIO_VOICE_NOT_AVAILABLE/u : /AUDIO_VOICE_LANGUAGE_UNAVAILABLE/u);
  assert.equal(f.claims.length, 0); assert.equal(await exists(join(f.job.d, 'audio-1.attempt.json')), false);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 0); assert.equal(f.calls.length, 0);
});

test('private audio audition keeps an unknown audio POST and never repeats it', async t => {
  const f = await auditionFixture(t), original = f.deps.audioFetch;
  f.deps.audioFetch = async (url, options) => {
    if (options.method !== 'POST') return original(url, options);
    f.audioCalls.push({ url, method: 'POST' }); throw Error('Lost charged response');
  };
  await assert.rejects(f.run(), /UNCERTAIN/u);
  const attempt = await readFile(join(f.job.d, 'audio-1.attempt.json'), 'utf8');
  await assert.rejects(f.run(), /UNCERTAIN/u);
  assert.equal(await readFile(join(f.job.d, 'audio-1.attempt.json'), 'utf8'), attempt);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.length, 0); assert.equal(await exists(join(f.resultDir, 'result.json')), false);
});

test('private audio audition resumes its exact durable audio task instead of creating another', async t => {
  const f = await auditionFixture(t), parameters = { text: f.job.request.scenes[1].narration, voice: narration.voice, speed: 1 };
  await writeFile(join(f.job.d, 'audio-receipts.json'), JSON.stringify({ id, inputHash: f.scope.inputHash,
    voice: narration.voice, speed: 1, scenes: [{ index: 1, taskId: 'known-audition', request: parameters }] }));
  await writeFile(join(f.job.d, 'audio-1.attempt.json'), JSON.stringify({ id, inputHash: f.scope.inputHash, index: 1, request: parameters }));
  const output = await f.run();
  assert.equal(output.audioTaskId, 'known-audition');
  assert.ok(f.audioCalls.some(call => call.url.endsWith('/tasks/known-audition')));
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 0);
  assert.equal(f.claims.length, 0); assert.equal(await exists(join(f.job.d, 'audio-1.attempt.json')), false);
});

for (const prior of ['unknown-audio', 'unknown-video', 'paid-video', 'terminal'])
  test('private audio audition refuses ' + prior + ' before any new provider request', async t => {
    const f = await auditionFixture(t);
    if (prior === 'unknown-audio') await writeFile(join(f.job.d, 'audio-0.attempt.json'), '{}');
    if (prior === 'unknown-video') await writeFile(join(f.job.d, 'shot-0.attempt.json'), JSON.stringify({ id, inputHash: f.scope.inputHash, index: 0 }));
    if (prior === 'paid-video') await writeFile(join(f.job.d, 'synclip-receipts.json'), JSON.stringify({ id, inputHash: f.scope.inputHash,
      shots: [{ index: 0, taskId: 'paid-shot' }] }));
    if (prior === 'terminal') { await mkdir(f.resultDir); await writeFile(join(f.resultDir, 'result.json'), '{"status":"uncertain"}'); }
    await assert.rejects(f.run(), /UNCERTAIN|AUDIO_RECEIPT|AUDIO_AUDITION_VIDEO_STARTED|AUDIO_AUDITION_TASK/u);
    assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0); assert.equal(f.claims.length, 0);
  });

test('private audio audition reuses decoded timing and refuses speech longer than its approved shot', async t => {
  const f = await auditionFixture(t);
  f.deps.decodeAudio = async () => 10.2;
  await assert.rejects(f.run(), error => {
    assert.equal(error.message, 'AUDIO_TIMING_REVISION_REQUIRED');
    assert.equal(error.audioTiming.noVideoSubmissions, true);
    assert.deepEqual(error.audioTiming.scenes.map(scene => scene.sceneIndex), [1]);
    return true;
  });
  assert.equal((await json(join(f.job.d, 'audio-receipts.json'))).scenes.length, 1);
  assert.equal(await exists(join(f.job.d, 'audio/scene-1.mp3')), true);
  assert.equal(f.calls.length, 0);
});

test('existing ffmpeg decodes, aligns and muxes real synthetic media through the narrated broker path', async t => {
  try { await executeFile('ffmpeg', ['-version']); await executeFile('ffprobe', ['-version']); }
  catch (error) {
    if (process.env.CI === 'true') throw new Error('Narrated-video CI requires working ffmpeg and ffprobe for real decode/mux validation', { cause: error });
    t.skip('This host has no existing ffmpeg/ffprobe; no installation is performed'); return;
  }
  const f = await fixture(t); await f.job(id, { audio: true });
  const sourceVideo = join(f.cfg.inbox, 'source-fixture.mp4'), sourceAudio = join(f.cfg.inbox, 'audio-fixture.mp3');
  await executeFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x233c55:s=1280x720:r=24',
    '-t', '10', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourceVideo], { timeout: 60_000, maxBuffer: 128 * 1024 });
  await executeFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '1.5', '-c:a', 'libmp3lame', sourceAudio], { timeout: 30_000, maxBuffer: 128 * 1024 });
  const command = async (_cfg, privateDir, outDir, entrypoint, args, output = {}) => {
    const mapped = args.map(arg => arg.startsWith('/input/') ? join(privateDir, arg.slice(7))
      : arg.startsWith('/output/') ? join(outDir, arg.slice(8)) : arg);
    if (args.includes('concat')) {
      const inputIndex = mapped.indexOf('-i') + 1, localPath = join(outDir, 'local-concat.txt');
      await writeFile(localPath, (await readFile(mapped[inputIndex], 'utf8')).replaceAll('/input/', privateDir.replaceAll('\\', '/') + '/'));
      mapped[inputIndex] = localPath;
    }
    const result = await executeFile(entrypoint.endsWith('ffprobe') ? 'ffprobe' : 'ffmpeg', mapped,
      { timeout: 60_000, maxBuffer: output.maxBytes ?? 128 * 1024, encoding: output.countBytes ? 'buffer' : 'utf8' });
    return output.countBytes ? result.stdout.length : result.stdout;
  };
  const probe = (cfg, directory, path) => probeMedia(cfg, directory, path, command);
  f.deps.download = async () => readFile(sourceVideo);
  f.deps.downloadAudio = async () => ({ bytes: await readFile(sourceAudio), format: 'mp3', contentType: 'audio/mpeg' });
  f.deps.probe = probe;
  f.deps.decodeAudio = (cfg, directory, path) => decodeSynclipAudio(cfg, directory, path, command);
  f.deps.render = (cfg, directory, output, request) => muxSynclipNarration(cfg, directory, output, request, command, probe);
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  const metrics = await json(join(f.resultDir, 'metrics.json'));
  assert.ok(Math.abs(metrics.durationSeconds - 30) < 0.5);
  assert.equal(metrics.audioTiming.length, 3);
  assert.ok(metrics.audioTiming.every(scene => scene.durationSeconds > 1.4 && scene.durationSeconds < 1.7));
  const actual = await probe(f.cfg, f.privateDir, 'output/result.mp4');
  assert.equal(actual.streams.find(stream => stream.type === 'audio').codec, 'aac');
  assert.equal(actual.streams.find(stream => stream.type === 'video').height, 720);
  // A test tone establishes encoding/timing only; it is not a real voice or a paper-video quality sample.
});

test('native narration finishes and is measured before any video POST, then publishes an AAC-aligned result', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 3);
  const firstVideo = f.order.findIndex(call => call.type === 'video' && call.method === 'POST');
  assert.equal(f.order.slice(0, firstVideo).filter(call => call.type === 'audio' && call.method === 'POST').length, 3);
  assert.deepEqual(f.audioCalls.filter(call => call.method === 'POST').map(call => call.body), [0, 1, 2].map(index => ({
    text: 'Source-bound spoken sentence ' + index + '.', voice: narration.voice, speed: 1 })));
  const result = await json(join(f.resultDir, 'result.json'));
  assert.deepEqual(result.narration, { provider: 'synclip', speaker: narration.voice, speed: 1, timingStatus: 'measured_aligned' });
  assert.equal((await json(join(f.resultDir, 'metrics.json'))).audioTiming.length, 3);
});

test('cached narration is fully decoded again and cannot rely on an old short metadata duration', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true, privateJob: true });
  await mkdir(join(job.d, 'audio'));
  const scenes = job.request.scenes.map(scene => ({ index: scene.index, taskId: 'known-tts-' + scene.index,
    request: { text: scene.narration, voice: narration.voice, speed: 1 } }));
  await writeFile(join(job.d, 'audio-receipts.json'), JSON.stringify({ id, inputHash: job.request.inputHash, voice: narration.voice, speed: 1, scenes }));
  for (const scene of job.request.scenes) {
    await writeFile(join(job.d, 'audio/scene-' + scene.index + '.mp3'), mp3);
    await writeFile(join(job.d, 'audio/scene-' + scene.index + '.json'), JSON.stringify({ sceneIndex: scene.index, narration: scene.narration,
      plannedDurationSeconds: scene.durationSeconds, taskId: scenes[scene.index].taskId, contentHash: hash(mp3), size: mp3.length,
      durationSeconds: 1, request: scenes[scene.index].request }));
  }
  const decoded = [];
  f.deps.decodeAudio = async (_cfg, _directory, path) => { decoded.push(path); return path.endsWith('scene-1.mp3') ? 11 : 2.5; };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(decoded.length, 3); assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
  const result = await json(join(f.resultDir, 'result.json'));
  assert.equal(result.errorCode, 'AUDIO_TIMING_REVISION_REQUIRED'); assert.equal(result.audioTiming.scenes[1].durationSeconds, 11);
});

test('a complete-decode error stops before any paid video call and retains the original MP3', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  f.deps.decodeAudio = async () => { throw Error('AUDIO_DECODE_INVALID'); };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_DECODE_INVALID');
  assert.equal(f.calls.length, 0); assert.equal(await exists(join(f.privateDir, 'audio/scene-0.mp3')), true);
});

test('PCM measurement uses the complete decoded sample count', async () => {
  const count = 48_000 * 2 * 2 * 12;
  assert.equal(await decodeSynclipAudio({}, 'unused', 'audio/scene-0.mp3', async () => count), 12);
  for (const invalid of [0, count + 1, 600 * 48_000 * 2 * 2, NaN]) {
    await assert.rejects(decodeSynclipAudio({}, 'unused', 'audio/scene-0.mp3', async () => invalid), /AUDIO_DECODE_INVALID/u);
  }
});

test('PCM measurement waits for stdout to drain after exit before accepting child close', async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => {};
  const first = Buffer.alloc(192000), tail = Buffer.alloc(65536); let settled = false;
  const count = rendererCommand({ rendererImage: 'unused' }, 'unused', null, '/usr/bin/ffmpeg', [],
    { countBytes: true, maxBytes: 2 * 192000 }, () => child).then(value => { settled = true; return value; });
  child.stdout.write(first); child.emit('exit', 0);
  await new Promise(resolveNext => setImmediate(resolveNext)); assert.equal(settled, false);
  const ended = new Promise(resolveEnd => child.stdout.once('end', resolveEnd)); child.stdout.end(tail); await ended;
  child.emit('close', 0); assert.equal(await count, first.length + tail.length);
});

test('stdout error or close without completed stdout cannot qualify decoded PCM', async () => {
  for (const mode of ['error', 'incomplete']) {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => {};
    let launches = 0;
    const count = rendererCommand({ rendererImage: 'unused' }, 'unused', null, '/usr/bin/ffmpeg', [], { countBytes: true, maxBytes: 2 * 192000 },
      () => ++launches === 1 ? child : new EventEmitter());
    child.stdout.write(Buffer.alloc(192000));
    if (mode === 'error') child.stdout.emit('error', Error('offline stream failure'));
    child.emit('close', 0); await assert.rejects(count, /VIDEO_MEDIA_INVALID/u);
    child.stdout.destroy();
  }
});

test('a shorter selected video is rejected even when provider audio extends the container to the planned duration', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true });
  const proof = await probeMedia({}, 'unused', 'shot.mp4', async () => JSON.stringify({ format: { duration: '10' },
    streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, avg_frame_rate: '24/1' },
      { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000' }],
    frames: [{ stream_index: 0, best_effort_timestamp_time: '0', pkt_duration_time: '8' },
      { stream_index: 1, best_effort_timestamp_time: '0', nb_samples: 480000 }] }));
  assert.equal(proof.durationSeconds, 10); assert.equal(proof.streams[0].durationSeconds, 8);
  let commands = 0;
  await assert.rejects(muxSynclipNarration(f.cfg, job.d, join(job.d, 'output'), job.request,
    async () => { commands += 1; }, async () => proof), /VIDEO_SHOT_TIMING_INVALID/u);
  assert.equal(commands, 0);
});

test('decoded frame timelines with a gap fail qualification', async () => {
  await assert.rejects(probeMedia({}, 'unused', 'shot.mp4', async () => JSON.stringify({ format: { duration: '4' },
    streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', avg_frame_rate: '24/1' }], frames: [
      { stream_index: 0, best_effort_timestamp_time: '0', pkt_duration_time: '1' },
      { stream_index: 0, best_effort_timestamp_time: '3', pkt_duration_time: '1' }] })), /VIDEO_MEDIA_TIMELINE_GAP/u);
});

test('long decoded narration preserves all audio receipts, permanently stops the old job, and proves zero video submissions', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  f.deps.decodeAudio = async (_cfg, _directory, path) => path.endsWith('scene-1.mp3') ? 10.2 : 2.5;
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  const result = await json(join(f.resultDir, 'result.json'));
  assert.equal(result.errorCode, 'AUDIO_TIMING_REVISION_REQUIRED'); assert.equal(result.audioTiming.noVideoSubmissions, true);
  assert.equal(result.audioTiming.scenes[1].durationSeconds, 10.2);
  assert.equal((await json(join(f.privateDir, 'audio-receipts.json'))).scenes.length, 3);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(await exists(join(f.privateDir, 'synclip-receipts.json')), false);
  const callsBefore = f.audioCalls.length; assert.equal(await runSynclipVideoBrokerOnce(f.cfg, f.deps), null);
  assert.equal(f.audioCalls.length, callsBefore);
});

test('a timed-out TTS POST keeps its attempt and is never submitted again', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  const original = f.deps.audioFetch;
  f.deps.audioFetch = async (url, options) => {
    if (options.method !== 'POST') return original(url, options);
    f.audioCalls.push({ method: 'POST', url }); throw Error('Offline lost response after acceptance');
  };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(await exists(join(f.privateDir, 'audio-0.attempt.json')), true);
  assert.equal(f.calls.length, 0); assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal(await runSynclipVideoBrokerOnce(f.cfg, f.deps), null);
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 1);
});

test('a known TTS receipt resumes by its task ID after a crash without repeating its POST', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true, privateJob: true });
  const parameters = { text: job.request.scenes[0].narration, voice: narration.voice, speed: 1 };
  await writeFile(join(job.d, 'started'), 'already-started');
  await writeFile(join(job.d, 'audio-receipts.json'), JSON.stringify({ id, inputHash: job.request.inputHash, voice: narration.voice, speed: 1,
    scenes: [{ index: 0, taskId: 'known-tts', request: parameters }] }));
  await writeFile(join(job.d, 'audio-0.attempt.json'), JSON.stringify({ id, index: 0, inputHash: job.request.inputHash, request: parameters }));
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'succeeded' });
  assert.ok(f.audioCalls.some(call => call.method === 'GET' && call.url.endsWith('/tasks/known-tts')));
  assert.equal(f.audioCalls.filter(call => call.method === 'POST').length, 2);
  assert.equal(await exists(join(job.d, 'audio-0.attempt.json')), false);
});

for (const field of ['text', 'voice', 'speed']) test('TTS recovery rejects a changed exact ' + field + ' binding before any POST', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true, privateJob: true });
  const parameters = { text: job.request.scenes[0].narration, voice: narration.voice, speed: 1,
    [field]: field === 'speed' ? 1.1 : 'changed-binding' };
  await writeFile(join(job.d, 'started'), 'already-started');
  await writeFile(join(job.d, 'audio-receipts.json'), JSON.stringify({ id, inputHash: job.request.inputHash, voice: narration.voice, speed: 1,
    scenes: [{ index: 0, taskId: 'known-tts', request: parameters }] }));
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
});

test('unknown video attempts stop before new narration charges and never claim a zero-video timing proof', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true, privateJob: true });
  await writeFile(join(job.d, 'started'), 'already-started');
  await writeFile(join(job.d, 'shot-0.attempt.json'), JSON.stringify({ id, index: 0, inputHash: job.request.inputHash }));
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'uncertain' });
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
  assert.equal((await json(join(f.resultDir, 'result.json'))).audioTiming, undefined);
});

test('a missing selected catalog voice fails without writing a charged attempt', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  f.deps.audioFetch = async () => Response.json({ success: true, data: [] });
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(await exists(join(f.privateDir, 'audio-0.attempt.json')), false); assert.equal(f.calls.length, 0);
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_VOICE_NOT_AVAILABLE');
});

test('a catalog voice must support the exact narration language before any charge', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  f.deps.audioFetch = async () => Response.json({ success: true, data: [{ id: narration.voice, name: 'Chinese-only fixture', gender: 'Female',
    languages: ['zh-CN'], is_premium: false, coins_per_char: 1 }] });
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).errorCode, 'AUDIO_VOICE_LANGUAGE_UNAVAILABLE');
  assert.equal(await exists(join(f.privateDir, 'audio-0.attempt.json')), false); assert.equal(f.calls.length, 0);
});

for (const mode of ['native-audio', 'start-end', 'sidecar']) test('unsupported ' + mode + ' is rejected before any model submission', async t => {
  const f = await fixture(t), job = await f.job(id, { audio: true });
  const document = await json(join(job.d, 'storyboard.json'));
  if (mode === 'native-audio') document.scenes[0].videoDirection.audioMode = 'native-audio';
  if (mode === 'start-end') document.scenes[0].videoDirection.frameStrategy = 'start-end';
  if (mode === 'sidecar') document.scenes[0].videoDirection.subtitleMode = 'sidecar';
  const bytes = Buffer.from(JSON.stringify(document)); await writeFile(join(job.d, 'storyboard.json'), bytes);
  job.request.files.storyboard.size = bytes.length; job.request.files.storyboard.sha256 = hash(bytes);
  job.request.inputHash = hash(JSON.stringify({ files: job.request.files, audio: job.request.audio, scenes: job.request.scenes }));
  await writeFile(join(job.d, 'request.json'), JSON.stringify(job.request));
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal(f.audioCalls.length, 0); assert.equal(f.calls.length, 0);
});

for (const missing of ['audio', 'geometry', 'duration', 'video-span', 'aac-span', 'aac-start']) test('an unqualified final ' + missing + ' output cannot be published as a complete video', async t => {
  const f = await fixture(t); await f.job(id, { audio: true });
  const original = f.deps.probe;
  f.deps.probe = async (...args) => {
    const proof = await original(...args); if (!args[2].startsWith('output/')) return proof;
    if (missing === 'audio') proof.streams = proof.streams.filter(stream => stream.type !== 'audio');
    if (missing === 'geometry') proof.streams[0].height = 360;
    if (missing === 'duration') proof.durationSeconds = 29;
    if (missing === 'video-span') proof.streams[0].durationSeconds = 28;
    if (missing === 'aac-span') proof.streams[1].durationSeconds = 28;
    if (missing === 'aac-start') proof.streams[1].startTimeSeconds = 1;
    return proof;
  };
  assert.deepEqual(await runSynclipVideoBrokerOnce(f.cfg, f.deps), { id, status: 'failed' });
  assert.equal((await json(join(f.resultDir, 'result.json'))).contentType, undefined);
  assert.equal(await exists(join(f.privateDir, 'output/result.mp4')), true);
});

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
