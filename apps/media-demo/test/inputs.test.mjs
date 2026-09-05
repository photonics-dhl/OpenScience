import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArguments, validatePaths, INPUT_FILES } from '../inputs.mjs';

test('requires explicit input/output and rejects duplicate or unknown switches', () => {
  assert.throws(() => parseArguments([]), /input.*output/);
  assert.throws(() => parseArguments(['--input', '/a', '--input', '/b', '--output', '/c']), /Duplicate/);
  assert.throws(() => parseArguments(['--input', '/a', '--output', '/b', '--url', 'https://example.com']), /Unknown/);
  assert.deepEqual(parseArguments(['--input', '/a', '--output', '/b']), { input: '/a', output: '/b' });
});

test('rejects missing fixed assets before creating output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-demo-input-'));
  await assert.rejects(validatePaths(root, join(root, '../missing-output')), /source-artwork.png/);
});

test('accepts fixed assets but refuses input/output overlap and existing final video', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-demo-paths-'));
  const input = join(root, 'input');
  const output = join(root, 'output');
  await mkdir(input);
  await mkdir(output);
  for (const name of INPUT_FILES) await writeFile(join(input, name), 'fixture');
  await assert.rejects(validatePaths(input, input), /overlap/);
  await assert.rejects(validatePaths(input, join(input, 'child')), /overlap/);
  await writeFile(join(output, 'd2nn-science-explainer-v2.mp4'), 'existing');
  await assert.rejects(validatePaths(input, output), /already exists/);
  const valid = await validatePaths(input, join(root, 'fresh-output'));
  assert.equal(valid.input, input);
});

 test('selects continuous narration without requiring five legacy WAVs and requires metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-demo-continuous-'));
  const input = join(root, 'input'); await mkdir(input);
  await writeFile(join(input, 'source-artwork.png'), 'fixture');
  await writeFile(join(input, 'narration.wav'), 'fixture');
  await assert.rejects(validatePaths(input, join(root, 'output')), /narration.json/);
  await writeFile(join(input, 'narration.json'), '{}');
  assert.equal((await validatePaths(input, join(root, 'output'))).audioMode, 'continuous');
  await writeFile(join(input, 'narration.wav'), '');
  await assert.rejects(validatePaths(input, join(root, 'output')), /nonempty regular/);
 });

 test('continuous files must be regular and within audio/metadata size bounds', async () => {
  for (const [name, size] of [['narration.wav', 64 * 1024 * 1024 + 1], ['narration.json', 64 * 1024 + 1]]) {
   const root = await mkdtemp(join(tmpdir(), 'science-demo-bounds-'));
   const input = join(root, 'input'); await mkdir(input);
   for (const asset of ['source-artwork.png', 'narration.wav', 'narration.json']) await writeFile(join(input, asset), 'fixture');
   const file = await open(join(input, name), 'r+');
   try { await file.truncate(size); } finally { await file.close(); }
   await assert.rejects(validatePaths(input, join(root, 'output')), /nonempty regular/);
  }
  const root = await mkdtemp(join(tmpdir(), 'science-demo-directory-'));
  const input = join(root, 'input'); await mkdir(input);
  await writeFile(join(input, 'source-artwork.png'), 'fixture');
  await mkdir(join(input, 'narration.wav'));
  await assert.rejects(validatePaths(input, join(root, 'output')), /nonempty regular/);
 });
