import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('CLI rejects an unsupported region before any credential or network work', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/design/generate-minimax-image.mjs',
      '--output',
      'docs/design-assets/generated/region-test.png',
      '--prompt',
      'test prompt',
      '--region',
      'moon',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --region; expected cn or global/);
  assert.equal(result.stdout, '');
});
