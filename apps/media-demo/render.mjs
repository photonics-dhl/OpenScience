/* global document, window */
// document/window references are serialized callbacks executed in Chromium.
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArguments, validatePaths, VIDEO_FILE } from './inputs.mjs';
import { sceneTemplates, applyNarration, continuousTimeline, resolveVisualStyle } from './scenes.mjs';
import { installDrawing } from './drawing.mjs';
import { hasFastStart } from './media.mjs';

const execute = promisify(execFile);
const fps = 24;

function startEncoder(command, args) {
  const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`Encoder failed (${signal ?? code})`)));
  });
  // An encoder can fail while Chromium is producing a frame. Keep its rejection handled.
  done.catch(() => {});
  child.stdin.on('error', () => {});
  return { child, done };
}

async function main() {
  const started = performance.now();
  let browser;
  let encoder;
  let interrupted = false;
  const cancellation = new globalThis.AbortController();
  const stop = () => {
    interrupted = true;
    cancellation.abort();
    encoder?.child.kill('SIGTERM');
    if (browser) browser.close().catch(() => {});
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
  const args = parseArguments(process.argv.slice(2));
  const { input, output, audioMode } = await validatePaths(args.input, args.output);
  const ffmpeg = process.env.SCIENCE_FFMPEG || '/usr/bin/ffmpeg';
  const ffprobe = process.env.SCIENCE_FFPROBE || '/usr/bin/ffprobe';
  let metadata;
  const narrationPath = resolve(input, 'narration.json');
  try {
    const info = await lstat(narrationPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 64 * 1024) throw new Error('Narration metadata must be a regular file of at most 64 KiB');
    metadata = JSON.parse(await readFile(narrationPath, 'utf8'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const visualStyle = resolveVisualStyle(metadata);
  let scenes = sceneTemplates.map(scene => ({ ...scene }));
  let total = 0;
  let frameCount;
  let narration;
  if (audioMode === 'continuous') {
    const { stdout } = await execute(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', resolve(input, 'narration.wav')], { timeout: 30000, signal: cancellation.signal });
    ({ scenes, total, frameCount, narration } = continuousTimeline(scenes, metadata, Number(stdout.trim()), fps));
  } else {
    for (let i = 0; i < scenes.length; i++) {
      const { stdout } = await execute(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', resolve(input, `voice-${i}.wav`)], { timeout: 30000, signal: cancellation.signal });
      const seconds = Number(stdout.trim());
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error(`Invalid duration for voice-${i}.wav`);
      scenes[i].start = total;
      scenes[i].voiceDuration = seconds;
      scenes[i].duration = Math.ceil((seconds + 0.55) * fps) / fps;
      total += scenes[i].duration;
    }
    if (total > 60) throw new Error('Fixed demo exceeds the 60 second rendering limit');
    frameCount = Math.round(total * fps);
    narration = applyNarration(scenes, metadata);
  }
  await mkdir(output, { recursive: true });
  // Exclusive writes and FFmpeg -n preserve existing evidence, including partial prior runs.
  await writeFile(resolve(output, 'storyboard.json'), JSON.stringify({ fps, total, audioMode, frameCount, visualStyle, source: 'https://arxiv.org/abs/1804.08711v2', notice: 'Conceptual animation; intensities illustrative, not measured.', narration, scenes }, null, 2), { flag: 'wx' });
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ headless: true, executablePath: process.env.SCIENCE_CHROMIUM || '/usr/bin/chromium' });
    if (interrupted) throw new Error('Render interrupted');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html><body style="margin:0"><canvas width="1280" height="720"></canvas></body></html>');
    await page.evaluate(installDrawing, { scenes, total, visualStyle, artworkData: `data:image/png;base64,${(await readFile(resolve(input, 'source-artwork.png'))).toString('base64')}` });
    await page.evaluate(() => document.fonts.ready);
    encoder = startEncoder(ffmpeg, ['-n', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', resolve(output, 'silent-v2.mp4')]);
    const middle = i => scenes[i].start + scenes[i].duration / 2;
    const samples = [['poster-v2', middle(0)], ['frame-interference-v2', middle(2)], ['frame-detector-v2', middle(3)], ...scenes.slice(1).map((scene, i) => [`transition-${i + 1}-v2`, scene.start + 0.3])];
    for (let frame = 0; frame < frameCount; frame++) {
      if (interrupted) throw new Error('Render interrupted');
      const png = Buffer.from(await page.evaluate(time => window.render(time), frame / fps), 'base64');
      await Promise.race([
        new Promise((accept, reject) => encoder.child.stdin.write(png, error => error ? reject(error) : accept())),
        encoder.done.then(() => { throw new Error('Encoder ended before all frames were submitted'); }),
      ]);
      for (const [name, time] of samples) {
        if (frame === Math.round(time * fps)) await writeFile(resolve(output, `${name}.png`), png, { flag: 'wx' });
      }
    }
    encoder.child.stdin.end();
    await encoder.done;
    await browser.close();
    browser = undefined;
    if (interrupted) throw new Error('Render interrupted');
    let audioArgs;
    if (audioMode === 'continuous') {
      // Mux the full source directly: no split, padding, trimming, or rate filters.
      audioArgs = ['-protocol_whitelist', 'file,pipe', '-i', resolve(input, 'narration.wav'), '-map', '0:v', '-map', '1:a:0'];
    } else {
      const audioInputs = scenes.flatMap((_, i) => ['-protocol_whitelist', 'file,pipe', '-i', resolve(input, `voice-${i}.wav`)]);
      const filters = scenes.map((scene, i) => `[${i + 1}:a]apad,atrim=duration=${scene.duration},asetpts=PTS-STARTPTS[a${i}]`).join(';') + ';' + scenes.map((_, i) => `[a${i}]`).join('') + `concat=n=${scenes.length}:v=0:a=1[a]`;
      audioArgs = [...audioInputs, '-filter_complex', filters, '-map', '0:v', '-map', '[a]'];
    }
    encoder = startEncoder(ffmpeg, ['-n', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-i', resolve(output, 'silent-v2.mp4'), ...audioArgs, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', ...(audioMode === 'legacy' ? ['-shortest'] : []), resolve(output, VIDEO_FILE)]);
    encoder.child.stdin.end();
    await encoder.done;
    if (interrupted) throw new Error('Render interrupted');
    const { stdout } = await execute(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate:format=duration,size', '-of', 'json', resolve(output, VIDEO_FILE)], { timeout: 30000, signal: cancellation.signal });
    const probe = JSON.parse(stdout);
    const video = probe.streams.find(stream => stream.codec_type === 'video');
    if (video?.codec_name !== 'h264' || video.width !== 1280 || video.height !== 720 || video.pix_fmt !== 'yuv420p' || !probe.streams.some(stream => stream.codec_name === 'aac') || Math.abs(Number(probe.format.duration) - total) > (audioMode === 'continuous' ? 1 / fps : 0.1)) throw new Error('Rendered media failed format validation');
    const fastStart = await hasFastStart(resolve(output, VIDEO_FILE));
    if (!fastStart) throw new Error('Rendered MP4 is missing fast-start atom ordering');
    await execute(ffmpeg, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', resolve(output, VIDEO_FILE), '-f', 'null', '-'], { timeout: 120000, signal: cancellation.signal });
    if (interrupted) throw new Error('Render interrupted');
    const metrics = { schemaVersion: 1, audioMode, frameCount, visualStyle, width: video.width, height: video.height, durationSeconds: Number(probe.format.duration), videoCodec: video.codec_name, audioCodec: 'aac', pixelFormat: video.pix_fmt, fastStart, completeDecode: true, renderSeconds: (performance.now() - started) / 1000, total, fps, freshPaidApiCalls: 0, narration, probe };
    await writeFile(resolve(output, 'metrics.json'), JSON.stringify(metrics, null, 2), { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(metrics)}\n`);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    let killTimer;
    if (encoder && encoder.child.exitCode === null && encoder.child.signalCode === null) {
      encoder.child.kill('SIGTERM');
      killTimer = setTimeout(() => encoder.child.kill('SIGKILL'), 5000);
    }
    try { if (encoder) await encoder.done.catch(() => {}); } finally { clearTimeout(killTimer); }
    if (browser) await browser.close();
  }
}

main().catch(error => {
  process.stderr.write(`Media demo failed: ${error.message}\n`);
  process.exitCode = 1;
});
