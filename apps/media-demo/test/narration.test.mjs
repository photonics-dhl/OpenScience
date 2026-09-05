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
