import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { safeRead, UUID } from '../codex-image-runner/core.mjs';
import { validateImageBytes } from '../../packages/ai-gateway/dist/image.js';

const exec = promisify(execFile);
async function docker(args, timeout = 30000) {
  return exec('docker', args, { timeout, maxBuffer: 32 * 1024, encoding: 'utf8' });
}
// Sample only the outermost pixels, so scientific objects are not extended into
// the added margin. The dominant coarse color group tolerates edge labels.
const EDGE_SAMPLE_FILTER = 'format=rgba,split=4[top][bottom][left][right];'
  + '[top]crop=iw:1:0:0,scale=16:1:flags=neighbor[t];'
  + '[bottom]crop=iw:1:0:ih-1,scale=16:1:flags=neighbor[b];'
  + '[left]crop=1:ih:0:0,transpose=1,scale=16:1:flags=neighbor[l];'
  + '[right]crop=1:ih:iw-1:0,transpose=1,scale=16:1:flags=neighbor[r];'
  + '[t][b][l][r]vstack=inputs=4,format=rgba';
function edgeBackground(bytes) {
  if (bytes.length !== 16 * 4 * 4) throw Error('INVALID_EDGE_SAMPLE');
  const groups = new Map();
  for (let offset = 0; offset < bytes.length; offset += 4) {
    if (bytes[offset + 3] < 192) continue;
    const rgb = [...bytes.subarray(offset, offset + 3)];
    const key = rgb.map(channel => channel >> 4).join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rgb);
  }
  const dominant = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  // Fully transparent artwork has no background to infer; retain the existing
  // neutral ground and composite alpha explicitly instead of dropping it.
  if (!dominant) return 'f7f2e8';
  return [0, 1, 2].map(channel => dominant.map(rgb => rgb[channel]).sort((a, b) => a - b)[Math.floor(dominant.length / 2)]
    .toString(16).padStart(2, '0')).join('');
}
/** Local decoding only; importing this module never starts a provider. */
export async function normalizeImage(config, requestId, rawPath, normalizedDir, deadlineAt, runDocker = docker) {
  if (!UUID.test(requestId) || !/^(?:[a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$/u.test(config.rendererImage)
    || !Number.isSafeInteger(deadlineAt)) throw Error('NORMALIZATION_INPUT_INVALID');
  const container = 'xgs-synclip-normalize-' + requestId;
  try {
    const rendererArgs = ['run', '--rm', '--name', container, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '512m', '--memory-swap', '512m',
      '--pids-limit', '64', '-v', rawPath + ':/input.png:ro', '-v', normalizedDir + ':/output:rw',
      '--entrypoint', '/usr/bin/ffmpeg', config.rendererImage, '-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', '/input.png'];
    const remainingTime = () => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) throw Error('NORMALIZATION_DEADLINE_EXPIRED');
      return Math.min(45000, remaining);
    };
    await runDocker([...rendererArgs, '-filter_complex_threads', '1', '-filter_complex', EDGE_SAMPLE_FILTER,
      '-frames:v', '1', '-threads', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '/output/edge-sample.rgba'], remainingTime());
    const background = edgeBackground(await safeRead(join(normalizedDir, 'edge-sample.rgba'), 256));
    await unlink(join(normalizedDir, 'edge-sample.rgba'));
    await runDocker([...rendererArgs, '-filter_complex_threads', '1', '-filter_complex',
      `color=c=0x${background}:s=1280x720,format=rgb24[ground];[0:v]scale=1280:720:force_original_aspect_ratio=decrease,format=rgba[image];[ground][image]overlay=(W-w)/2:(H-h)/2:format=rgb:shortest=1`,
      '-map_metadata', '-1',
      '-frames:v', '1', '-threads', '1', '-pix_fmt', 'rgb24', '/output/result.pending.png'],
    remainingTime());
    const bytes = validateImageBytes(await safeRead(join(normalizedDir, 'result.pending.png'), 10 * 1024 * 1024)).bytes;
    await rename(join(normalizedDir, 'result.pending.png'), join(normalizedDir, 'result.png'));
    return bytes;
  } finally {
    await runDocker(['rm', '-f', container]).catch(() => {});
  }
}
