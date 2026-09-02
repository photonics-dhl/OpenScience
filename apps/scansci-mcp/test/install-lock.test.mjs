import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../install-lock.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';

test('lock splitter emits one hash-complete requirement per file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-lock-'));
  try {
    const lock = join(root, 'requirements.lock');
    const output = join(root, 'blocks');
    await writeFile(lock, [
      '# generated',
      'alpha==1.0 \\',
      '    --hash=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '    # via example',
      'beta[extra]==2.0 \\',
      '    --hash=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \\',
      '    --hash=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '',
    ].join('\n'));

    const result = spawnSync(python, [script, '--lock', lock, '--output', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readdir(output), ['0001.txt', '0002.txt']);
    assert.equal(await readFile(join(output, '0001.txt'), 'utf8'), [
      'alpha==1.0 \\',
      '    --hash=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '',
    ].join('\n'));
    assert.doesNotMatch(await readFile(join(output, '0002.txt'), 'utf8'), /# via/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lock splitter rejects a requirement without a complete sha256 hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-lock-invalid-'));
  try {
    const lock = join(root, 'requirements.lock');
    await writeFile(lock, 'alpha==1.0\n');
    const result = spawnSync(python, [script, '--lock', lock, '--output', join(root, 'blocks')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
