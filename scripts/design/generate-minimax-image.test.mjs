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
      '--prompt-file',
      'docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md',
      '--intended-surface',
      'Landing / Workspace dark hero ambient background',
      '--region',
      'moon',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --region; expected cn or global/);
  assert.equal(result.stdout, '');
});

test('CLI rejects a missing prompt file before credential or network work', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/design/generate-minimax-image.mjs',
      '--output',
      'docs/design-assets/generated/prompt-file-test.png',
      '--region',
      'cn',
      '--intended-surface',
      'Landing / Workspace dark hero ambient background',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required option: --prompt-file/);
  assert.equal(result.stdout, '');
});

test('CLI rejects a missing intended surface before credential or network work', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/design/generate-minimax-image.mjs',
      '--output',
      'docs/design-assets/generated/intended-surface-test.png',
      '--prompt-file',
      'docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md',
      '--region',
      'cn',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required option: --intended-surface/);
  assert.equal(result.stdout, '');
});

test('CLI rejects inline prompts so the approved prompt file remains the source of truth', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/design/generate-minimax-image.mjs',
      '--output',
      'docs/design-assets/generated/inline-prompt-test.png',
      '--prompt-file',
      'docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md',
      '--intended-surface',
      'Landing / Workspace dark hero ambient background',
      '--region',
      'cn',
      '--prompt',
      'unapproved inline prompt',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported option: --prompt/);
  assert.equal(result.stdout, '');
});
