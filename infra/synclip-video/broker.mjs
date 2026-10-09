import { createHash, randomUUID } from 'node:crypto';
import { chmod, chown, mkdir, open, lstat, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  SynclipVideoClient, SynclipVideoError, downloadSynclipVideo,
  validateSynclipVideoRequest, validateSynclipVideoTask,
} from '../../packages/ai-gateway/dist/synclip-video-api.js';
import { SynclipAudioClient, SynclipAudioError, downloadSynclipAudio, validateSynclipAudioRequest,
  validateSynclipAudioTask, validateSynclipAudioTaskId, validateSynclipAudioBytes,
} from '../../packages/ai-gateway/dist/synclip-audio-api.js';
import { resolveSynclipImageReference } from './image-reference.mjs';

const ROOT = '/opt/openscience-synclip-video';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON = 512 * 1024, MAX_PNG = 10 * 1024 * 1024, MAX_MP4 = 256 * 1024 * 1024, MAX_AUDIO = 32 * 1024 * 1024;
const REV = 'synclip-video-v2';
const fail = code => { throw Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function dir(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('VIDEO_DIR');
  return info;
}
async function read(path, maximum) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maximum) fail('VIDEO_FILE');
  const bytes = await readFile(path);
  if (bytes.length !== info.size) fail('VIDEO_FILE');
  return bytes;
}
async function write(path, bytes, mode = 0o600) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx', mode);
  try {
    await file.writeFile(bytes);
    // A restrictive service umask must not remove the worker's group read access.
    await file.chmod(mode);
    await file.sync();
  } finally { await file.close(); }
  await rename(temporary, path);
}
async function exclusive(path, bytes) {
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    return true;
  } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}
const json = async (path, maximum = MAX_JSON) => JSON.parse((await read(path, maximum)).toString('utf8'));
async function key(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o777) !== 0o600 || resolve(path) !== path) fail('VIDEO_KEY');
  const value = (await read(path, 4096)).toString();
  if (!/^[\x21-\x7e]{1,4096}$/u.test(value)) fail('VIDEO_KEY');
  return value;
}
function config(value) {
  if (!value || value.model !== 'ltx23' || value.resolution !== '720p' || value.referenceMode !== 'synclip-receipt'
    || typeof value.adminModelsEnabled !== 'boolean'
    || value.adapterRevision !== REV || !/^sha256:[a-f0-9]{64}$/u.test(value.rendererImage)
    || [value.inbox, value.results, value.privateRoot, value.keyPath].some(path => typeof path !== 'string' || !path.startsWith('/opt/'))) fail('VIDEO_CONFIG');
  if (value.audio !== undefined) audioConfig(value.audio);
  return value;
}
function audioConfig(value) {
  if (!value || value.provider !== 'synclip' || Object.keys(value).sort().join(',') !== 'provider,speed,voice'
    || typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed <= 0) fail('AUDIO_CONFIG');
  const checked = validateSynclipAudioRequest({ text: 'catalog validation', voice: value.voice, speed: value.speed });
  return { provider: 'synclip', voice: checked.voice, speed: checked.speed };
}
async function request(directory, id) {
  const value = await json(join(directory, 'request.json'));
  if (value.schemaVersion !== 1 || value.id !== id || value.taskId !== id || value.profile !== 'content-driven-v1'
    || value.provider !== 'synclip' || value.model !== 'ltx23' || value.resolution !== '720p' || !UUID.test(id)
    || !Number.isSafeInteger(value.deadlineAt) || !Array.isArray(value.scenes) || value.scenes.length < 3 || value.scenes.length > 6
    || !value.files || !Array.isArray(value.files.scenes)) fail('VIDEO_REQUEST');
  const story = await read(join(directory, 'storyboard.json'), MAX_JSON);
  if (value.files.storyboard?.name !== 'storyboard.json' || value.files.storyboard.size !== story.length
    || value.files.storyboard.sha256 !== hash(story) || value.files.scenes.length !== value.scenes.length) fail('VIDEO_REQUEST');
  for (let i = 0; i < value.scenes.length; i++) {
    const scene = value.scenes[i], spec = value.files.scenes[i];
    const bytes = await read(join(directory, 'scene-' + i + '.png'), MAX_PNG);
    if (scene.index !== i || ![5, 10, 15].includes(scene.durationSeconds) || typeof scene.prompt !== 'string' || scene.prompt.length < 20
      || spec?.size !== bytes.length || spec.sha256 !== hash(bytes) || scene.image?.sha256 !== spec.sha256) fail('VIDEO_REQUEST');
  }
  if (value.audio !== undefined) audioConfig(value.audio);
  if (hash(Buffer.from(JSON.stringify(value.audio ? { files: value.files, audio: value.audio, scenes: value.scenes } : value.files))) !== value.inputHash) fail('VIDEO_REQUEST');
  return { ...value, storyboard: JSON.parse(story.toString('utf8')) };
}
function requireSupportedPlan(request, cfg) {
  if (!request.audio && !request.storyboard.narrative) return; // Preserve existing paid/recovery jobs.
  if (!request.audio || !isDeepStrictEqual(audioConfig(cfg.audio), request.audio)) fail('AUDIO_CONFIG_CHANGED');
  if (!request.storyboard.narrative || !Array.isArray(request.storyboard.scenes)
    || !['zh', 'en'].includes(request.storyboard.locale)
    || request.storyboard.scenes.length !== request.scenes.length
    || request.storyboard.videoProduction?.audioPolicy !== 'external-narration') fail('VIDEO_PLAN_UNSUPPORTED');
  for (const [index, scene] of request.scenes.entries()) {
    const original = request.storyboard.scenes[index], direction = original?.videoDirection;
    if (!original || original.narration !== scene.narration || original.durationSeconds !== scene.durationSeconds
      || direction?.reference !== 'scene-artwork' || direction.frameStrategy !== 'start-reference'
      || direction.audioMode !== 'external-narration' || direction.subtitleMode !== 'none') fail('VIDEO_PLAN_UNSUPPORTED');
    validateSynclipAudioRequest({ text: scene.narration, voice: request.audio.voice, speed: request.audio.speed });
  }
}
function checkDeadline(request, now) {
  if (now() >= request.deadlineAt) fail('DEADLINE_EXCEEDED');
}
async function requireKnownVideoOutcome(directory, request) {
  if (!request.audio) return;
  const path = join(directory, 'synclip-receipts.json'), receipt = await exists(path) ? await json(path) : null;
  if (receipt && (receipt.id !== request.id || receipt.inputHash !== request.inputHash || !Array.isArray(receipt.shots)
    || new Set(receipt.shots.map(shot => shot.index)).size !== receipt.shots.length
    || receipt.shots.some(shot => !Number.isInteger(shot.index) || !request.scenes[shot.index] || typeof shot.taskId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(shot.taskId)))) fail('VIDEO_RECEIPT');
  for (const scene of request.scenes) {
    const attemptPath = join(directory, 'shot-' + scene.index + '.attempt.json');
    if (await exists(attemptPath)) {
      const attempt = await json(attemptPath);
      if (attempt.id !== request.id || attempt.index !== scene.index || attempt.inputHash !== request.inputHash
        || !receipt?.shots.some(shot => shot.index === scene.index)) fail('UNCERTAIN');
    }
  }
  const shotFiles = await exists(join(directory, 'shots')) ? await readdir(join(directory, 'shots')) : [];
  if (shotFiles.some(name => {
    const matched = /^shot-([0-5])\.mp4$/u.exec(name);
    return !matched || !receipt?.shots.some(shot => shot.index === Number(matched[1]));
  })) fail('UNCERTAIN');
  if (receipt?.shots.length || shotFiles.length) {
    const audio = await json(join(directory, 'audio-receipts.json'));
    if (audio.id !== request.id || audio.inputHash !== request.inputHash || audio.voice !== request.audio.voice || audio.speed !== request.audio.speed
      || !Array.isArray(audio.scenes) || audio.scenes.length !== request.scenes.length) fail('AUDIO_RECEIPT');
  }
}
async function prepareRequests(directory, request, apiKey, deps) {
  const prepared = [];
  const receipt = await exists(join(directory, 'synclip-receipts.json')) ? await json(join(directory, 'synclip-receipts.json')) : null;
  // Validate every locally assembled payload before marking or paying for any shot.
  for (const scene of request.scenes) {
    // Paid shots are resumed by task ID, even if their original frame URL has expired.
    if (receipt?.shots?.some(item => item.index === scene.index)) { prepared.push(undefined); continue; }
    const approvedPng = await read(join(directory, 'scene-' + scene.index + '.png'), MAX_PNG);
    const reference = await (deps.resolveReference ?? resolveSynclipImageReference)({
      requestId: scene.image?.requestId, approvedPng, apiKey, deadlineAt: request.deadlineAt,
    });
    prepared.push(validateSynclipVideoRequest({ prompt: scene.prompt, model: 'ltx23', duration: scene.durationSeconds,
      resolution: '720p', first_frame_url: reference }));
  }
  return prepared;
}
export async function rendererCommand(cfg, privateDir, outDir, entrypoint, args, output = {}, startProcess = spawn) {
  const name = 'openscience-synclip-media-' + randomUUID();
  return new Promise((resolveCommand, reject) => {
    const child = startProcess('docker', ['run', '--rm', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--memory', '1g', '--memory-swap', '1g', '--cpus', '2', '--pids-limit', '128',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m', '-v', privateDir + ':/input:ro',
      ...(outDir ? ['-v', outDir + ':/output:rw'] : []), '--entrypoint', entrypoint, cfg.rendererImage, ...args],
    { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = []; let size = 0, stopped = false, stdoutEnded = false;
    const stop = code => {
      if (stopped) return; stopped = true; clearTimeout(timer); child.kill('SIGKILL');
      const cleanup = startProcess('docker', ['rm', '-f', name], { stdio: 'ignore' }); cleanup.on('error', () => {});
      reject(Error(code));
    };
    const timer = setTimeout(() => stop('VIDEO_MEDIA_TIMEOUT'), output.countBytes || entrypoint.endsWith('ffprobe') ? 60_000 : 300_000);
    child.stdout.on('data', bytes => {
      size += bytes.length; if (size > (output.maxBytes ?? 128 * 1024)) stop('VIDEO_MEDIA_OUTPUT_LIMIT'); else if (!output.countBytes) chunks.push(bytes);
    });
    child.stdout.once('end', () => { stdoutEnded = true; });
    child.stdout.once('error', () => stop('VIDEO_MEDIA_INVALID'));
    child.once('error', () => { clearTimeout(timer); if (!stopped) { stopped = true; reject(Error('VIDEO_MEDIA_UNAVAILABLE')); } });
    child.once('close', code => {
      clearTimeout(timer); if (stopped) return; stopped = true;
      if (code !== 0 || !stdoutEnded) reject(Error('VIDEO_MEDIA_INVALID')); else resolveCommand(output.countBytes ? size : Buffer.concat(chunks).toString('utf8'));
    });
  });
}
export async function decodeSynclipAudio(cfg, directory, relativePath, command = rendererCommand) {
  // Count decoded PCM samples instead of trusting an MP3 header or writing a duplicate audio file.
  const bytesPerSecond = 48_000 * 2 * 2, maximum = 600 * bytesPerSecond;
  let bytes;
  try {
    bytes = await command(cfg, directory, null, '/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode',
      '-i', '/input/' + relativePath, '-map', '0:a:0', '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1'],
    { countBytes: true, maxBytes: maximum });
  } catch { fail('AUDIO_DECODE_INVALID'); }
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes >= maximum || bytes % 4 !== 0) fail('AUDIO_DECODE_INVALID');
  return bytes / bytesPerSecond;
}
export async function probeMedia(cfg, directory, relativePath, command = rendererCommand) {
  const value = JSON.parse(await command(cfg, directory, null, '/usr/bin/ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-show_frames', '-show_entries',
    'stream=index,codec_type,codec_name,width,height,channels,sample_rate,avg_frame_rate:format=duration:frame=media_type,stream_index,best_effort_timestamp_time,duration_time,pkt_duration_time,nb_samples',
    '-of', 'json', '/input/' + relativePath], { maxBytes: 2 * 1024 * 1024 }));
  const durationSeconds = Number(value.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600 || !Array.isArray(value.streams) || !value.streams.length || value.streams.length > 8
    || !Array.isArray(value.frames) || value.frames.length > 10_000) fail('VIDEO_MEDIA_INVALID');
  const streams = value.streams.map(stream => {
    if (!Number.isInteger(stream.index) || stream.index < 0) fail('VIDEO_MEDIA_INVALID');
    const rate = String(stream.avg_frame_rate ?? '').split('/').map(Number), frameSeconds = rate.length === 2 ? rate[1] / rate[0] : NaN;
    const frames = value.frames.filter(frame => frame.stream_index === stream.index).map(frame => {
      const reported = Number(frame.duration_time ?? frame.pkt_duration_time);
      return { start: Number(frame.best_effort_timestamp_time), duration: stream.codec_type === 'audio'
        ? Number(frame.nb_samples) / Number(stream.sample_rate) : Number.isFinite(reported) && reported > 0 ? reported : frameSeconds };
    }).sort((a, b) => a.start - b.start);
    if (!frames.length || frames.some(frame => !Number.isFinite(frame.start) || !Number.isFinite(frame.duration) || frame.duration <= 0)) fail('VIDEO_MEDIA_INVALID');
    let end = frames[0].start;
    for (const frame of frames) { if (frame.start > end + 0.1) fail('VIDEO_MEDIA_TIMELINE_GAP'); end = Math.max(end, frame.start + frame.duration); }
    return { type: stream.codec_type, codec: stream.codec_name, width: stream.width, height: stream.height, channels: stream.channels,
      startTimeSeconds: frames[0].start, durationSeconds: end - frames[0].start, endTimeSeconds: end };
  });
  return { durationSeconds, streams };
}
async function noVideoSubmissions(directory) {
  if (await exists(join(directory, 'synclip-receipts.json'))) return false;
  const names = await readdir(directory);
  if (names.some(name => /^shot-[0-5]\.attempt\.json$/u.test(name))) return false;
  if (await exists(join(directory, 'shots')) && (await readdir(join(directory, 'shots'))).length) return false;
  return true;
}
async function prepareAudio(cfg, directory, request, apiKey, deps) {
  if (!request.audio) return undefined;
  const now = deps.now ?? Date.now, client = new SynclipAudioClient({ apiKey, timeoutMs: 15000, fetch: deps.audioFetch ?? deps.fetch });
  const audioDir = join(directory, 'audio'), receiptPath = join(directory, 'audio-receipts.json');
  await mkdir(audioDir, { recursive: true, mode: 0o700 }); await dir(audioDir);
  let receipt = { id: request.id, inputHash: request.inputHash, voice: request.audio.voice, speed: request.audio.speed, scenes: [] };
  if (await exists(receiptPath)) receipt = await json(receiptPath);
  if (receipt.id !== request.id || receipt.inputHash !== request.inputHash || receipt.voice !== request.audio.voice || receipt.speed !== request.audio.speed
    || !Array.isArray(receipt.scenes) || new Set(receipt.scenes.map(item => item.index)).size !== receipt.scenes.length) fail('AUDIO_RECEIPT');
  for (const item of receipt.scenes) {
    const scene = request.scenes[item.index];
    if (!scene || !isDeepStrictEqual(item.request, { text: scene.narration, voice: request.audio.voice, speed: request.audio.speed })) fail('AUDIO_RECEIPT');
    validateSynclipAudioTaskId(item.taskId);
  }
  let catalogLoaded = false; const measured = [];
  for (const scene of request.scenes) {
    const parameters = validateSynclipAudioRequest({ text: scene.narration, voice: request.audio.voice, speed: request.audio.speed });
    const attemptPath = join(directory, 'audio-' + scene.index + '.attempt.json');
    let old = receipt.scenes.find(item => item.index === scene.index);
    if (!old) {
      if (await exists(attemptPath)) fail('UNCERTAIN');
      if (!catalogLoaded) {
        checkDeadline(request, now); const voices = await client.listVoices();
        const selected = voices.find(voice => voice.id === request.audio.voice);
        if (!selected) fail('AUDIO_VOICE_NOT_AVAILABLE');
        if (!selected.languages.some(language => language.toLowerCase() === request.storyboard.locale
          || language.toLowerCase().startsWith(request.storyboard.locale + '-'))) fail('AUDIO_VOICE_LANGUAGE_UNAVAILABLE');
        catalogLoaded = true;
      }
      checkDeadline(request, now);
      if (!await exclusive(attemptPath, JSON.stringify({ id: request.id, index: scene.index, inputHash: request.inputHash, request: parameters }))) fail('UNCERTAIN');
      checkDeadline(request, now);
      try {
        const made = await client.create(parameters); old = { index: scene.index, taskId: made.task_id, request: parameters };
        receipt = { ...receipt, scenes: [...receipt.scenes, old] }; await write(receiptPath, JSON.stringify(receipt));
      } catch { fail('UNCERTAIN'); }
      await unlink(attemptPath);
    } else if (await exists(attemptPath)) {
      const attempt = await json(attemptPath);
      if (attempt.id !== request.id || attempt.index !== scene.index || attempt.inputHash !== request.inputHash
        || !isDeepStrictEqual(attempt.request, parameters)) fail('AUDIO_RECEIPT');
      await unlink(attemptPath); // The matching durable task ID is the only proof needed to resume GET.
    }
    const relativePath = 'audio/scene-' + scene.index + '.mp3', path = join(directory, relativePath);
    if (!await exists(path)) {
      for (;;) {
        checkDeadline(request, now);
        const status = validateSynclipAudioTask(await client.query(old.taskId), old.taskId);
        await write(join(audioDir, 'scene-' + scene.index + '.status.json'), JSON.stringify(status));
        if (status.status === 'failed') fail('AUDIO_PROVIDER_FAILED');
        if (status.status === 'completed') {
          const output = await (deps.downloadAudio ?? downloadSynclipAudio)(status, { timeoutMs: 90000, now });
          await write(path, validateSynclipAudioBytes(output.bytes).bytes); break;
        }
        await (deps.sleep ?? sleep)(Math.min(3000, Math.max(0, request.deadlineAt - now())));
      }
    }
    const bytes = validateSynclipAudioBytes(await read(path, MAX_AUDIO)).bytes;
    const binding = { sceneIndex: scene.index, narration: scene.narration, plannedDurationSeconds: scene.durationSeconds,
      taskId: old.taskId, contentHash: hash(bytes), size: bytes.length };
    const metadataPath = join(audioDir, 'scene-' + scene.index + '.json'); let metadata;
    if (await exists(metadataPath)) {
      metadata = await json(metadataPath);
      const { durationSeconds, ...saved } = metadata;
      if (!isDeepStrictEqual(saved, { ...binding, request: parameters }) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600) fail('AUDIO_RECEIPT');
    }
    checkDeadline(request, now);
    const decodedDuration = await (deps.decodeAudio ?? decodeSynclipAudio)(cfg, directory, relativePath);
    if (!Number.isFinite(decodedDuration) || decodedDuration <= 0 || decodedDuration >= 600) fail('AUDIO_DECODE_INVALID');
    metadata = { ...binding, durationSeconds: decodedDuration, request: parameters };
    await write(metadataPath, JSON.stringify(metadata));
    measured.push({ ...binding, durationSeconds: metadata.durationSeconds });
  }
  if (measured.some(scene => scene.durationSeconds + 0.3 > scene.plannedDurationSeconds)) {
    if (!await noVideoSubmissions(directory)) fail('AUDIO_TIMING_AFTER_VIDEO_SUBMISSION');
    const error = Error('AUDIO_TIMING_REVISION_REQUIRED');
    error.audioTiming = { inputHash: request.inputHash, voice: request.audio.voice, speed: request.audio.speed,
      noVideoSubmissions: true, scenes: measured };
    throw error;
  }
  return measured;
}
export async function muxSynclipNarration(cfg, privateDir, outDir, request, command = rendererCommand, probe = probeMedia) {
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  for (const scene of request.scenes) {
    const source = await probe(cfg, privateDir, 'shots/shot-' + scene.index + '.mp4');
    const videos = source.streams?.filter(stream => stream.type === 'video');
    if (videos?.length !== 1 || !Number.isFinite(videos[0].durationSeconds) || !Number.isFinite(videos[0].startTimeSeconds)
      || Math.abs(videos[0].startTimeSeconds) > 0.1 || Math.abs(videos[0].durationSeconds - scene.durationSeconds) > 0.5
      || !Number.isFinite(videos[0].width) || !Number.isFinite(videos[0].height) || videos[0].width < 1280 || videos[0].height < 720) fail('VIDEO_SHOT_TIMING_INVALID');
    await command(cfg, privateDir, outDir, '/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-i', '/input/shots/shot-' + scene.index + '.mp4', '-i', '/input/audio/scene-' + scene.index + '.mp3',
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(scene.durationSeconds),
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,adelay=150:all=1,apad,alimiter=limit=0.95',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '/output/scene-' + scene.index + '.mp4']);
  }
  await write(join(outDir, 'concat.txt'), request.scenes.map(scene => "file '/input/output/scene-" + scene.index + ".mp4'").join('\n') + '\n');
  await command(cfg, privateDir, outDir, '/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', '/input/output/concat.txt', '-c', 'copy', '-movflags', '+faststart', '/output/result.mp4']);
}
async function ffmpeg(cfg, privateDir, outDir, request) {
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  if (request?.audio) return muxSynclipNarration(cfg, privateDir, outDir, request);
  return new Promise((resolveRender, reject) => {
    const process = spawn('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--memory', '1g', '--memory-swap', '1g', '--cpus', '2', '--pids-limit', '128',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m', '-v', privateDir + ':/input:ro', '-v', outDir + ':/output:rw',
      '--entrypoint', '/usr/bin/ffmpeg', cfg.rendererImage, '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
      '-i', '/input/concat.txt', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '/output/result.mp4'], { stdio: ['ignore', 'ignore', 'ignore'] });
    process.once('error', reject);
    process.once('exit', code => code === 0 ? resolveRender() : reject(Error('VIDEO_RENDER')));
  });
}
async function publish(cfg, request, status, error, output, diagnostics) {
  const directory = join(cfg.results, request.id);
  const parent = await dir(cfg.results);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await dir(directory);
  // mkdir leaves existing modes unchanged; setgid also keeps atomic temp files in the worker group.
  await chown(directory, parent.uid, parent.gid);
  await chmod(directory, 0o2750);
  const result = { schemaVersion: 1, id: request.id, inputHash: request.inputHash, executionAttempt: request.executionAttempt,
    provider: 'synclip', model: 'ltx23', adapterRevision: REV, status,
    ...(error ? { errorCode: error } : {}), ...(output ? output.result : {}), ...(diagnostics ?? {}) };
  if (output) {
    await write(join(directory, 'result.mp4'), output.bytes, 0o640);
    await write(join(directory, 'metrics.json'), JSON.stringify(output.metrics), 0o640);
  }
  await write(join(directory, 'result.json'), JSON.stringify(result), 0o640);
}
async function execute(cfg, directory, request, client, prepared, deps, audioTiming) {
  const now = deps.now ?? Date.now;
  const shots = join(directory, 'shots'), receiptPath = join(directory, 'synclip-receipts.json');
  await mkdir(shots, { recursive: true, mode: 0o700 });
  let receipt = { id: request.id, ...(request.audio ? { inputHash: request.inputHash } : {}), shots: [] };
  try { receipt = await json(receiptPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const scene of request.scenes) {
    const old = receipt.shots.find(item => item.index === scene.index);
    const output = join(shots, 'shot-' + scene.index + '.mp4');
    if (old && await exists(output)) continue;
    if (!old) {
      if (cfg.adminModelsEnabled !== true) fail('SYNCLIP_VIDEO_ADMIN_ACCESS_REQUIRED');
      const attemptPath = join(directory, 'shot-' + scene.index + '.attempt.json');
      if (await exists(attemptPath)) fail('UNCERTAIN');
      checkDeadline(request, now);
      if (!await exclusive(attemptPath, JSON.stringify({ id: request.id, index: scene.index, inputHash: request.inputHash }))) fail('UNCERTAIN');
      checkDeadline(request, now);
      try {
        const made = await client.create(prepared[scene.index]);
        receipt = { ...receipt, shots: [...receipt.shots, { index: scene.index, taskId: made.task_id }] };
        await write(receiptPath, JSON.stringify(receipt));
      } catch {
        // Once POST may have started, even an invalid returned task ID cannot prove no charge.
        // Keep the attempt until a receipt is durably saved; never authorize a replacement POST.
        fail('UNCERTAIN');
      }
      await unlink(attemptPath);
    }
    const task = receipt.shots.find(item => item.index === scene.index);
    if (!task) fail('VIDEO_RECEIPT');
    for (;;) {
      checkDeadline(request, now);
      const value = validateSynclipVideoTask(await client.query(task.taskId), task.taskId);
      await write(join(directory, 'shot-' + scene.index + '.status.json'), JSON.stringify(value));
      if (value.status === 'failed') fail('PROVIDER_FAILED');
      if (value.status === 'completed') {
        await write(output, await (deps.download ?? downloadSynclipVideo)(value, { timeoutMs: 90000, now }));
        break;
      }
      await (deps.sleep ?? sleep)(Math.min(3000, Math.max(0, request.deadlineAt - now())));
    }
  }
  checkDeadline(request, now);
  await write(join(directory, 'concat.txt'), request.scenes.map(scene => "file '/input/shots/shot-" + scene.index + ".mp4'").join('\n') + '\n');
  const outDir = join(directory, 'output');
  await (deps.render ?? ffmpeg)(cfg, directory, outDir, request);
  const bytes = await read(join(outDir, 'result.mp4'), MAX_MP4);
  if (!bytes.subarray(4, 12).includes(Buffer.from('ftyp'))) fail('VIDEO_MP4');
  let narration, measuredOutput;
  if (request.audio) {
    measuredOutput = await (deps.probe ?? probeMedia)(cfg, directory, 'output/result.mp4');
    const audioStreams = measuredOutput.streams?.filter(stream => stream.type === 'audio'), videoStreams = measuredOutput.streams?.filter(stream => stream.type === 'video');
    const expectedDuration = request.scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
    if (!Number.isFinite(measuredOutput.durationSeconds) || Math.abs(measuredOutput.durationSeconds - expectedDuration) > 0.5
      || measuredOutput.streams?.length !== 2 || audioStreams?.length !== 1 || audioStreams[0].codec !== 'aac' || audioStreams[0].channels !== 2
      || videoStreams?.length !== 1 || videoStreams[0].codec !== 'h264' || videoStreams[0].width !== 1280 || videoStreams[0].height !== 720
      || [...audioStreams, ...videoStreams].some(stream => !Number.isFinite(stream.durationSeconds) || !Number.isFinite(stream.startTimeSeconds)
        || Math.abs(stream.startTimeSeconds) > 0.1 || Math.abs(stream.durationSeconds - expectedDuration) > 0.5)) fail('VIDEO_NARRATION_OUTPUT_INVALID');
    narration = { provider: 'synclip', speaker: request.audio.voice, speed: request.audio.speed, timingStatus: 'measured_aligned' };
  }
  await publish(cfg, request, 'succeeded', undefined, { bytes,
    metrics: { provider: 'synclip', model: 'ltx23', shotCount: request.scenes.length,
      audioMode: request.audio ? 'external-narration' : 'provider-output-unverified',
      ...(request.audio ? { audioTiming, durationSeconds: measuredOutput.durationSeconds, narration } : {}) },
    result: { contentType: 'video/mp4', outputSha256: hash(bytes), outputSize: bytes.length, ...(narration ? { narration } : {}) } });
}
async function runPending(cfg, deps) {
  const now = deps.now ?? Date.now;
  const ids = [...(await readdir(cfg.inbox)).filter(id => UUID.test(id)), ...(await readdir(cfg.privateRoot)).filter(id => UUID.test(id))];
  for (const id of [...new Set(ids)].sort()) {
    // Terminal jobs remain private for recovery/audit; their inputs may be expired or archived.
    if (await exists(join(cfg.results, id, 'result.json'))) continue;
    const source = join(cfg.inbox, id), directory = join(cfg.privateRoot, id);
    if (!await exists(directory)) await rename(source, directory);
    const value = await request(directory, id);
    const started = join(directory, 'started'), hasStarted = await exists(started);
    if (hasStarted && !value.audio && !await exists(join(directory, 'synclip-receipts.json'))) {
      await publish(cfg, value, 'uncertain', 'UNCERTAIN');
      return { id, status: 'uncertain' };
    }
    try {
      checkDeadline(value, now);
      requireSupportedPlan(value, cfg);
      await requireKnownVideoOutcome(directory, value);
      const apiKey = await (deps.readKey ?? key)(cfg.keyPath);
      if (cfg.adminModelsEnabled !== true && !await exists(join(directory, 'synclip-receipts.json'))) fail('SYNCLIP_VIDEO_ADMIN_ACCESS_REQUIRED');
      const prepared = await prepareRequests(directory, value, apiKey, deps);
      const client = new SynclipVideoClient({ apiKey, timeoutMs: 15000, fetch: deps.fetch, adminModelsEnabled: cfg.adminModelsEnabled });
      checkDeadline(value, now);
      if (!hasStarted && !await exclusive(started, String(now()))) fail('UNCERTAIN');
      const audioTiming = await prepareAudio(cfg, directory, value, apiKey, deps);
      await execute(cfg, directory, value, client, prepared, deps, audioTiming);
      return { id, status: 'succeeded' };
    } catch (error) {
      const uncertain = error?.message === 'UNCERTAIN' || (error instanceof SynclipVideoError || error instanceof SynclipAudioError) && error.outcome === 'uncertain';
      const timing = error?.message === 'AUDIO_TIMING_REVISION_REQUIRED' && error.audioTiming && await noVideoSubmissions(directory);
      const code = uncertain ? 'UNCERTAIN' : timing ? 'AUDIO_TIMING_REVISION_REQUIRED'
        : error?.message === 'DEADLINE_EXCEEDED' ? 'DEADLINE_EXCEEDED'
          : /^(?:AUDIO|VIDEO|SYNCLIP_VIDEO)_[A-Z0-9_]{1,80}$/u.test(error?.message) ? error.message : 'EXECUTION_FAILED';
      const status = uncertain ? 'uncertain' : 'failed';
      await publish(cfg, value, status, code, undefined, timing ? { audioTiming: error.audioTiming } : undefined);
      return { id, status };
    }
  }
  return null;
}
export async function runSynclipVideoBrokerOnce(cfg, deps = {}) {
  for (const path of [cfg.inbox, cfg.results, cfg.privateRoot]) await dir(path);
  const parent = await dir(cfg.results), ready = join(cfg.results, '.ready');
  const beat = async accepting => {
    await write(ready, JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', adapterRevision: REV,
      updatedAt: (deps.now ?? Date.now)(), accepting: accepting && cfg.adminModelsEnabled === true,
      ...(cfg.audio ? { narration: audioConfig(cfg.audio) } : {}) }), 0o640);
    await chown(ready, parent.uid, parent.gid);
  };
  await beat(true);
  let pendingBeat, heartbeatError, accepting = true;
  const timer = (deps.setInterval ?? setInterval)(() => {
    pendingBeat ??= beat(true).catch(error => { heartbeatError = error; }).finally(() => { pendingBeat = undefined; });
    return pendingBeat;
  }, 15000);
  try {
    const result = await runPending(cfg, deps);
    if (heartbeatError) throw heartbeatError;
    return result;
  } catch (error) { accepting = false; throw error; }
  finally {
    (deps.clearInterval ?? clearInterval)(timer);
    await pendingBeat;
    await beat(accepting && !heartbeatError);
  }
}
export function validateSynclipVideoBrokerConfig(value) { return config(value); }
export async function listSynclipAudioCatalog(cfg, deps = {}) {
  const apiKey = await (deps.readKey ?? key)(cfg.keyPath);
  const client = new SynclipAudioClient({ apiKey, timeoutMs: 15000, fetch: deps.fetch });
  const voices = await client.listVoices();
  return { provider: 'synclip', voices: voices.map(({ preview_url, ...voice }) => ({
    ...voice, previewAvailable: Boolean(preview_url),
  })) };
}
export function synclipAudioCatalogFailure(error) {
  const known = error instanceof SynclipAudioError;
  return { error: 'SYNCLIP_AUDIO_CATALOG_FAILED', code: known ? error.code : 'EXECUTION_FAILED',
    ...(known && Number.isInteger(error.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599
      ? { httpStatus: error.httpStatus } : {}) };
}
async function main() {
  const catalogMode = process.argv[2] === '--list-voices';
  const args = process.argv.slice(catalogMode ? 3 : 2);
  if (process.getuid?.() !== 0 || process.getgid?.() !== 1000 || args.length !== 2
    || args[0] !== '--config' || resolve(args[1]) !== ROOT + '/config.json') fail('VIDEO_CONFIG_REQUIRED');
  const path = resolve(args[1]), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o777) !== 0o600) fail('VIDEO_CONFIG_PERMISSIONS');
  const cfg = config(JSON.parse((await read(path, 16384)).toString()));
  if (catalogMode) {
    console.log(JSON.stringify(await listSynclipAudioCatalog(cfg)));
    return;
  }
  await key(cfg.keyPath);
  const result = await runSynclipVideoBrokerOnce(cfg);
  if (result) console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(process.argv[2] === '--list-voices' ? JSON.stringify(synclipAudioCatalogFailure(error)) : 'SYNCLIP_VIDEO_BROKER_FAILED');
    process.exitCode = 1;
  });
}
