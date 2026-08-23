/* global Buffer, process */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyCubismExport } from '../scripts/verify-hermes-cubism-export.mjs';

const transparentPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PsK0WQAAAABJRU5ErkJggg==',
  'base64',
);

async function createFixture(name, model, files) {
  const fixtureRoot = path.join(
    tmpdir(),
    `xgs-hermes-cubism-${name}-${process.pid}-${Date.now()}`,
  );
  await mkdir(fixtureRoot, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  await writeFile(
    path.join(fixtureRoot, 'wanko_touch.model3.json'),
    JSON.stringify(model),
  );
  return fixtureRoot;
}

test('rejects an Editor export whose model3 manifest references a missing texture', async () => {
  const fixtureRoot = path.join(
    tmpdir(),
    `xgs-hermes-cubism-missing-texture-${process.pid}-${Date.now()}`,
  );
  await mkdir(fixtureRoot, { recursive: true });
  await writeFile(path.join(fixtureRoot, 'wanko_touch.moc3'), 'fixture moc');
  await writeFile(path.join(fixtureRoot, 'wanko_touch.physics3.json'), '{}');
  await writeFile(
    path.join(fixtureRoot, 'wanko_touch.cdi3.json'),
    JSON.stringify({ Version: 3, Parameters: [], Parts: [] }),
  );
  await writeFile(
    path.join(fixtureRoot, 'wanko_touch.model3.json'),
    JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'wanko_touch.moc3',
        Textures: ['wanko_touch.1024/texture_00.png'],
        Physics: 'wanko_touch.physics3.json',
        DisplayInfo: 'wanko_touch.cdi3.json',
      },
    }),
  );

  assert.deepEqual(verifyCubismExport(fixtureRoot), {
    ok: false,
    errors: [
      'model3.json references missing texture: wanko_touch.1024/texture_00.png',
    ],
  });
});

test('rejects a non-texture manifest reference that is missing', async () => {
  const fixtureRoot = await createFixture(
    'missing-moc',
    {
      Version: 3,
      FileReferences: {
        Moc: 'wanko_touch.moc3',
        Textures: [],
      },
    },
    {},
  );

  assert.deepEqual(verifyCubismExport(fixtureRoot), {
    ok: false,
    errors: ['model3.json references missing moc: wanko_touch.moc3'],
  });
});

test('rejects a manifest reference that escapes the export root', async () => {
  const fixtureRoot = await createFixture(
    'path-escape',
    {
      Version: 3,
      FileReferences: {
        Moc: '../outside.moc3',
        Textures: [],
      },
    },
    {},
  );

  assert.deepEqual(verifyCubismExport(fixtureRoot), {
    ok: false,
    errors: ['model3.json moc reference escapes export root: ../outside.moc3'],
  });
});

test('reports a closed export inventory from real manifest files', async () => {
  const fixtureRoot = await createFixture(
    'closed',
    {
      Version: 3,
      FileReferences: {
        Moc: 'wanko_touch.moc3',
        Textures: ['wanko_touch.1024/texture_00.png'],
        Physics: 'wanko_touch.physics3.json',
        DisplayInfo: 'wanko_touch.cdi3.json',
        Motions: {
          Idle: [{ File: 'motion/idle_01.motion3.json' }],
        },
      },
    },
    {
      'wanko_touch.moc3': 'fixture moc',
      'wanko_touch.physics3.json': '{}',
      'wanko_touch.cdi3.json': JSON.stringify({
        Version: 3,
        Parameters: [{ Id: 'PARAM_ANGLE_X' }],
        Parts: [{ Id: 'PARTS_01_BODY' }],
      }),
      'wanko_touch.1024/texture_00.png': transparentPixel,
      'motion/idle_01.motion3.json': '{}',
    },
  );

  assert.deepEqual(verifyCubismExport(fixtureRoot), {
    ok: true,
    errors: [],
    inventory: {
      modelFile: 'wanko_touch.model3.json',
      moc: 'wanko_touch.moc3',
      referencedFiles: [
        'motion/idle_01.motion3.json',
        'wanko_touch.1024/texture_00.png',
        'wanko_touch.cdi3.json',
        'wanko_touch.moc3',
        'wanko_touch.physics3.json',
      ],
      textures: [
        {
          path: 'wanko_touch.1024/texture_00.png',
          width: 1,
          height: 1,
          hasAlpha: true,
        },
      ],
      parameterIds: ['PARAM_ANGLE_X'],
      partIds: ['PARTS_01_BODY'],
    },
  });
});
