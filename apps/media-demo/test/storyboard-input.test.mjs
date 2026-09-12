import test from 'node:test';
import assert from 'node:assert/strict';
import { storyboardTimeline, readSceneArtwork } from '../storyboard-input.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

const manifest = (count = 3) => ({ schemaVersion: 1, title: '光学研究', locale: 'zh', style: 'watercolor', provider: 'Qwen3-TTS', speaker: 'Serena', scenes: Array.from({length: count}, (_, i) => ({title: `Scene ${i}`, artwork: `scene-${i}.png`, start: i * 5, cues: [{start: 0, end: 4, text: '连续配音'}]})) });

test('supports three through six scenes without fixed-paper content or rounding boundaries', () => {
  for (const count of [3, 4, 5, 6]) {
    const result = storyboardTimeline(manifest(count), count * 5 + .01);
    assert.equal(result.scenes.length, count);
    assert.equal(result.scenes[1].start, 5);
    assert.equal(result.frameCount, Math.ceil((count * 5 + .01) * 24));
    assert.equal(result.scenes[0].title, 'Scene 0');
  }
});

test('rejects traversal, remote images, invalid boundaries, cue overflow and excessive strings', () => {
  for (const patch of [{artwork:'../secret.png'}, {artwork:'https://example.com/x.png'}, {start:1}, {title:'x'.repeat(121)}, {cues:[{start:0,end:6,text:'bad'}]}, {cues:[{start:0,end:3,text:'a'},{start:2,end:4,text:'b'}]}]) {
    const input = manifest(); Object.assign(input.scenes[0], patch);
    assert.throws(() => storyboardTimeline(input, 15));
  }
  for (const seconds of [0, NaN, Infinity, 91, 9]) assert.throws(() => storyboardTimeline(manifest(), seconds));
  for (const count of [0, 2, 7]) assert.throws(() => storyboardTimeline(manifest(count), 40));
});

test('rejects unknown settings instead of silently accepting execution or approval claims', () => {
  for (const patch of [{approved:true},{script:'evil()'},{style:'unknown'},{locale:'unknown'}]) assert.throws(() => storyboardTimeline({...manifest(), ...patch}, 15));
});

test('on-chip animation profile requires exactly five scenes and preserves explicit timing', () => {
  const input = {...manifest(5), profile: 'onchip-field-sampling-v1'};
  input.scenes = input.scenes.map((scene, i) => ({...scene, role: ['driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction'][i]}));
  assert.equal(storyboardTimeline(input, 25).scenes[3].start, 15);
  for (const count of [3, 4, 6]) assert.throws(() => storyboardTimeline({...manifest(count), profile: input.profile}, 35));
  assert.throws(() => storyboardTimeline({...input, profile: 'unreviewed-arbitrary-physics'}, 25));
  assert.throws(() => storyboardTimeline({...input, scenes: input.scenes.map((scene, i) => ({...scene, role: i === 0 ? 'delay_scan' : scene.role}))}, 25));
});

test('artwork rejects remote paths, non-PNG bytes and decompression-sized dimensions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyboard-png-'));
  await assert.rejects(readSceneArtwork(root,[{artwork:'../secret.png'}]));
  await writeFile(join(root,'scene-0.png'),Buffer.alloc(40));
  await assert.rejects(readSceneArtwork(root,[{artwork:'scene-0.png'}]));
  const png = Buffer.alloc(40); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.write('IHDR',12); png.writeUInt32BE(8192,16); png.writeUInt32BE(8192,20);
  await writeFile(join(root,'scene-0.png'),png);
  await assert.rejects(readSceneArtwork(root,[{artwork:'scene-0.png'}]));
});
