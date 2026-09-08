import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
const onchipRoles = ['driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction'];
const objectKinds = ['rect', 'ellipse', 'arrow', 'trace', 'label'];
const objectColors = ['ink', 'blue', 'teal', 'amber', 'muted'];
const actionKinds = ['enter', 'fade', 'translate', 'pulse', 'draw', 'highlight'];

function invalid() { throw new Error('Invalid storyboard media input'); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.split(',').sort().join(',')) invalid();
  return value;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(ch => ch.codePointAt(0) < 32)) invalid();
  return value;
}
function unit(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function animation(value, sceneClaimIds) {
  const plan = object(value, 'objects,actions');
  if (!Array.isArray(plan.objects) || plan.objects.length < 1 || plan.objects.length > 12
    || !Array.isArray(plan.actions) || plan.actions.length < 1 || plan.actions.length > 16) invalid();
  const objects = plan.objects.map(raw => {
    const kind = raw?.kind;
    const item = object(raw, `id,kind,x,y,width,height,color,sourceClaimIds${kind === 'label' ? ',label' : ''}${['arrow', 'trace'].includes(kind) ? ',points' : ''}`);
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(item.id) || !objectKinds.includes(item.kind)
      || !objectColors.includes(item.color) || !unit(item.x) || !unit(item.y) || !unit(item.width) || item.width === 0
      || !unit(item.height) || item.height === 0 || item.x + item.width > 1 || item.y + item.height > 1
      || !Array.isArray(item.sourceClaimIds) || item.sourceClaimIds.length < 1 || item.sourceClaimIds.length > 12
      || new Set(item.sourceClaimIds).size !== item.sourceClaimIds.length || item.sourceClaimIds.some(id => typeof id !== 'string' || !sceneClaimIds.includes(id))) invalid();
    if (kind === 'label') text(item.label, 60);
    if (['arrow', 'trace'].includes(kind)) {
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > (kind === 'arrow' ? 2 : 32)) invalid();
      item.points.forEach(rawPoint => { const point = object(rawPoint, 'x,y'); if (!unit(point.x) || !unit(point.y)) invalid(); });
    }
    return item;
  });
  const byId = new Map(objects.map(item => [item.id, item]));
  if (byId.size !== objects.length) invalid();
  const actions = plan.actions.map(raw => {
    const kind = raw?.kind;
    const item = object(raw, `kind,target,start,end,meaning,basis${kind === 'translate' ? ',toX,toY' : ''}`);
    const target = byId.get(item.target);
    const basis = object(item.basis, 'claimId,quote');
    if (!target || !actionKinds.includes(kind) || !unit(item.start) || !unit(item.end) || item.start >= item.end
      || typeof item.meaning !== 'string' || !item.meaning.trim() || item.meaning.length > 180
      || typeof basis.claimId !== 'string' || !target.sourceClaimIds.includes(basis.claimId)
      || typeof basis.quote !== 'string' || basis.quote.trim().length < 12 || basis.quote.length > 400) invalid();
    if (kind === 'translate' && (!unit(item.toX) || !unit(item.toY) || item.toX + target.width > 1 || item.toY + target.height > 1)) invalid();
    if (kind === 'draw' && !['arrow', 'trace'].includes(target.kind)) invalid();
    return item;
  });
  if (new Set(actions.map(action => `${action.target}\u0000${action.kind}`)).size !== actions.length) invalid();
  if (!actions.some(action => ['translate', 'pulse', 'draw'].includes(action.kind) && byId.get(action.target).kind !== 'label')) invalid();
  return { objects, actions };
}

// This parser validates rendering data, never scientific approval or RO authority.
export function storyboardTimeline(value, seconds, fps = 24) {
  const hasProfile = value && Object.hasOwn(value, 'profile');
  const contentDriven = value?.profile === 'content-driven-v1';
  const v = object(value, `schemaVersion,title,locale,style,provider,speaker,scenes${hasProfile ? ',profile' : ''}`);
  if (hasProfile && !['onchip-field-sampling-v1', 'content-driven-v1'].includes(v.profile)) invalid();
  if (v.profile === 'onchip-field-sampling-v1' && (!Array.isArray(v.scenes) || v.scenes.length !== 5)) invalid();
  if (v.schemaVersion !== 1 || !['zh', 'en'].includes(v.locale) || !['technical', 'watercolor', 'ink'].includes(v.style)
    || !Number.isFinite(seconds) || seconds <= 0 || seconds > 90 || fps !== 24
    || !Array.isArray(v.scenes) || v.scenes.length < 3 || v.scenes.length > 6) invalid();
  const title = text(v.title, 120);
  const provider = text(v.provider, 120); const speaker = text(v.speaker, 80);
  const scenes = v.scenes.map((raw, i) => {
    const s = object(raw, `title,artwork,start,cues${v.profile === 'onchip-field-sampling-v1' ? ',role' : ''}${contentDriven ? ',sourceClaimIds,animation' : ''}`);
    if (v.profile === 'onchip-field-sampling-v1' && s.role !== onchipRoles[i]) invalid();
    if (contentDriven && (!Array.isArray(s.sourceClaimIds) || s.sourceClaimIds.length < 1 || s.sourceClaimIds.length > 12
      || new Set(s.sourceClaimIds).size !== s.sourceClaimIds.length || s.sourceClaimIds.some(id => typeof id !== 'string'))) invalid();
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
    return {title: text(s.title, 120), artwork: s.artwork, start: s.start, duration, cues,
      ...(v.profile === 'onchip-field-sampling-v1' ? {role: s.role} : {}),
      ...(contentDriven ? {sourceClaimIds: [...s.sourceClaimIds], animation: animation(s.animation, s.sourceClaimIds)} : {})};
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
