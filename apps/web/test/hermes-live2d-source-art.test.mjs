/* global process */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { exportHermesLive2DSourceArt } from '../scripts/export-hermes-live2d-source-art.mjs';

const expectedPngs = [
  'brand.png',
  'lamp-atlas.png',
];

test('exports the exact native Cubism lamp source-art inventory', async () => {
  const outputRoot = path.join(
    tmpdir(),
    `xgs-hermes-live2d-source-art-${process.pid}-${Date.now()}`,
  );
  const metrics = await exportHermesLive2DSourceArt(outputRoot);
  const files = (await readdir(outputRoot))
    .filter((file) => file.endsWith('.png'))
    .sort();

  assert.deepEqual(files, expectedPngs);
  assert.equal(metrics.brand.blueNodeCount, 6);
  assert.equal(metrics.brand.openCentreCount, 1);
  assert.equal(metrics.brand.orangeDiffCount, 1);
  assert.equal(metrics.brand.routeCount, 3);
  assert.deepEqual(metrics.brand.nodesPerRoute, [2, 2, 2]);
  assert.equal(metrics.brand.rejoiningRouteCount, 0);
  assert.equal(metrics.brand.resultRoute, 'middle');
  assert.deepEqual(metrics.cubismRegions, [
    'lamp-rear',
    'opening',
    'front-shell',
    'front-rim',
    'spout',
    'handle',
    'brand',
  ]);
  assert.deepEqual(metrics.composition, {
    canonicalWankoIncludedInSource: false,
    lampToWankoWidthMax: 1.25,
    openCentreCount: 1,
    orangeDiffCount: 1,
    blueNodeCount: 6,
  });
  assert.deepEqual(metrics.sources, {
    brandSha256: 'AD7DB88B881FC006D64758345208F847F4511ED42DF0A7AC0BAB3554213A75E1',
    lampSha256: 'C1A49973F11843488A9714FF580CB54F3A96EAB89CEC253650D2BEEBA3EF4BA8',
  });
  assert.equal(metrics.runtimeReferenceCount, 0);
  assert.deepEqual(metrics.palette, {
    energyBlue: '#5bc7ff',
    enamelIndigo: '#132458',
    outlineBrown: '#512b23',
    rimGold: '#e6a24a',
  });

  for (const file of files) {
    const bytes = await readFile(path.join(outputRoot, file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 2079);
    assert.equal(bytes.readUInt32BE(20), 756);
    assert.equal(bytes[25], 6, `${file} must retain RGBA transparency`);
    assert.ok(metrics.layers[file].width > 0, `${file} must have visible source art`);
    assert.ok(metrics.layers[file].height > 0, `${file} must have visible source art`);
  }
});
