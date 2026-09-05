import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNarration, sceneTemplates } from '../scenes.mjs';

const scenes = () => sceneTemplates.map(scene => ({ ...scene, voiceDuration: 5 }));
const metadata = () => ({ provider: 'Qwen3-TTS', speaker: 'Serena', scenes: scenes().map(() => ({ text: '口语旁白。', cues: [{ start: 0, end: 2, text: '口语旁白。' }] })) });
test('optional metadata preserves legacy captions and uses unknown supplied WAV provenance', () => {
  const value = scenes();
  assert.match(applyNarration(value), /unknown/i);
  assert.equal(value[0].cues, undefined);
  assert.equal(value[0].caption, sceneTemplates[0].caption);
});
test('validated scene relative cues and provider become narration provenance', () => {
  const value = scenes();
  assert.match(applyNarration(value, metadata()), /Qwen3-TTS.*Serena/);
  assert.equal(value[0].cues[0].end, 2);
});
test('rejects invalid cue timing, scene count and bounded strings', () => {
  for (const patch of [{start: -1}, {end: 6}, {end: 0}, {start: NaN}, {end: Infinity}, {text: 'x'.repeat(81)}]) {
    const data = metadata(); Object.assign(data.scenes[0].cues[0], patch);
    assert.throws(() => applyNarration(scenes(), data));
  }
  const overlapping = metadata(); overlapping.scenes[0].cues.push({start: 1, end: 3, text: '重叠'});
  assert.throws(() => applyNarration(scenes(), overlapping));
  const missing = metadata(); missing.scenes.pop();
  assert.throws(() => applyNarration(scenes(), missing));
});

 test('continuous timeline preserves absolute boundaries and full audio with at most one frame rounding', async () => {
  const { continuousTimeline } = await import('../scenes.mjs');
  assert.equal(typeof continuousTimeline, 'function');
  const data = metadata();
  const starts = [0, 7.15, 15.27, 24.38, 33.11];
  data.scenes.forEach((scene, i) => { scene.start = starts[i]; });
  const result = continuousTimeline(sceneTemplates, data, 41.28, 24);
  assert.equal(result.total, 41.28);
  assert.ok(result.frameCount / 24 >= 41.28);
  assert.ok(result.frameCount / 24 - 41.28 < 1 / 24);
  result.scenes.forEach((scene, i) => {
   assert.equal(scene.start, starts[i]);
   assert.equal(scene.voiceDuration, scene.duration);
   assert.equal(scene.duration, (starts[i + 1] ?? 41.28) - starts[i]);
  });
  assert.equal(sceneTemplates[0].start, undefined);
  for (const duration of [0, -1, NaN, Infinity, 60.01]) assert.throws(() => continuousTimeline(sceneTemplates, data, duration));
  for (const start of [1, -1, NaN]) {
   const bad = globalThis.structuredClone(data); bad.scenes[0].start = start;
   assert.throws(() => continuousTimeline(sceneTemplates, bad, 41.28));
  }
  for (const start of [7.15, 4, 41.28, Infinity, undefined]) {
   const bad = globalThis.structuredClone(data); bad.scenes[2].start = start;
   assert.throws(() => continuousTimeline(sceneTemplates, bad, 41.28));
  }
  assert.throws(() => continuousTimeline(sceneTemplates, undefined, 41.28));
  const spill = globalThis.structuredClone(data); spill.scenes[0].cues[0].end = 7.16;
  assert.throws(() => continuousTimeline(sceneTemplates, spill, 41.28), /cue/);
 });
