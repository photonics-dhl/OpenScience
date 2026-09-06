import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

function invalid() { throw new Error('Invalid storyboard media input'); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.split(',').sort().join(',')) invalid();
  return value;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(ch => ch.codePointAt(0) < 32)) invalid();
  return value;
}

// This parser validates rendering data, never scientific approval or RO authority.
export function storyboardTimeline(value, seconds, fps = 24) {
  const v = object(value, 'schemaVersion,title,locale,style,provider,speaker,scenes');
  if (v.schemaVersion !== 1 || !['zh', 'en'].includes(v.locale) || !['technical', 'watercolor', 'ink'].includes(v.style)
    || !Number.isFinite(seconds) || seconds <= 0 || seconds > 90 || fps !== 24
    || !Array.isArray(v.scenes) || v.scenes.length < 3 || v.scenes.length > 6) invalid();
  const title = text(v.title, 120);
  const provider = text(v.provider, 120); const speaker = text(v.speaker, 80);
  const scenes = v.scenes.map((raw, i) => {
    const s = object(raw, 'title,artwork,start,cues');
    if (s.artwork !== `scene-${i}.png` || !Number.isFinite(s.start) || s.start < 0 || s.start >= seconds
      || (i === 0 ? s.start !== 0 : s.start <= v.scenes[i - 1].start)) invalid();
    const duration = (v.scenes[i + 1]?.start ?? seconds) - s.start;
    if (!Number.isFinite(duration) || duration < .5 || !Array.isArray(s.cues) || s.cues.length < 1 || s.cues.length > 100) invalid();
    let previousEnd = 0;
    const cues = s.cues.map(rawCue => {
      const cue = object(rawCue, 'start,end,text');
      if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < previousEnd || cue.start >= cue.end || cue.end > duration) invalid();
      previousEnd = cue.end;
      return {start: cue.start, end: cue.end, text: text(cue.text, 80)};
    });
    return {title: text(s.title, 120), artwork: s.artwork, start: s.start, duration, cues};
  });
  return { title, locale: v.locale, visualStyle: v.style, scenes, total: seconds, frameCount: Math.ceil(seconds * fps), narration: `Supplied continuous WAV; provider: ${provider}; speaker: ${speaker}; no TTS during rendering.` };
}

export async function readStoryboardInput(input) {
  const path = resolve(input, 'storyboard.json');
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > 65536) invalid();
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  // Validate structural/timing bounds before reading any manifest-selected files.
  storyboardTimeline(manifest, 90);
  return manifest;
}

export async function readSceneArtwork(input, scenes) {
  return Promise.all(scenes.map(async (scene, index) => {
    if (scene.artwork !== `scene-${index}.png`) invalid();
    const path = resolve(input, scene.artwork);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 33 || info.size > 10 * 1024 * 1024) invalid();
    const data = await readFile(path);
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.toString('ascii', 12, 16) !== 'IHDR') invalid();
    const width = data.readUInt32BE(16); const height = data.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16777216) invalid();
    return `data:image/png;base64,${data.toString('base64')}`;
  }));
}
