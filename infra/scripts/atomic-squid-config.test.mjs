import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activateConfig, publishConfig, recoverConfig, restoreConfig, snapshotConfig,
} from './atomic-squid-config.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'atomic-squid-config-'));
  const source = join(root, 'candidate.conf');
  const target = join(root, 'squid.conf');
  const rollback = join(root, 'squid.conf.openscience-rollback');
  await Promise.all([
    writeFile(source, 'new-valid-config\n'),
    writeFile(target, 'old-valid-config\n'),
  ]);
  return { root, source, target, rollback };
}

test('failure before target commit preserves the complete live config and durable rollback', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));

  await assert.rejects(publishConfig({
    ...f,
    beforeTargetCommit: () => { throw new Error('injected pre-commit stop'); },
  }), /injected pre-commit stop/u);

  assert.equal(await readFile(f.target, 'utf8'), 'old-valid-config\n');
  assert.equal(await readFile(f.rollback, 'utf8'), 'old-valid-config\n');
  assert.equal(await recoverConfig({ target: f.target, rollback: f.rollback }), true);
});

test('failure after atomic commit leaves a complete candidate and one-step atomic restore', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));

  await assert.rejects(publishConfig({
    ...f,
    afterTargetCommit: () => { throw new Error('injected post-commit stop'); },
  }), /injected post-commit stop/u);

  assert.equal(await readFile(f.target, 'utf8'), 'new-valid-config\n');
  assert.equal(await readFile(f.rollback, 'utf8'), 'old-valid-config\n');
  await restoreConfig({ target: f.target, rollback: f.rollback });
  assert.equal(await readFile(f.target, 'utf8'), 'old-valid-config\n');
});

test('activation failure after commit automatically restores and reloads the previous config', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const activated = [];

  await assert.rejects(activateConfig({
    ...f,
    reconfigure: async () => { activated.push(await readFile(f.target, 'utf8')); },
    afterTargetCommit: () => { throw new Error('injected activation stop'); },
  }), /injected activation stop/u);

  assert.deepEqual(activated, ['old-valid-config\n']);
  assert.equal(await readFile(f.target, 'utf8'), 'old-valid-config\n');
  assert.equal(await recoverConfig({ target: f.target, rollback: f.rollback }), false);
});

test('failed candidate reload automatically restores and reloads the previous config', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const activated = [];

  await assert.rejects(activateConfig({
    ...f,
    reconfigure: async () => {
      const content = await readFile(f.target, 'utf8');
      activated.push(content);
      if (content === 'new-valid-config\n') throw new Error('injected reload failure');
    },
  }), /injected reload failure/u);

  assert.deepEqual(activated, ['new-valid-config\n', 'old-valid-config\n']);
  assert.equal(await readFile(f.target, 'utf8'), 'old-valid-config\n');
});

test('durable snapshot is private, exclusive and self-cleans before publication completes', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const snapshot = join(f.root, 'release.preimage');

  await assert.rejects(
    snapshotConfig({
      source: f.target,
      snapshot,
      afterFileSync: () => { throw new Error('injected snapshot interruption'); },
    }),
    /injected snapshot interruption/u,
  );
  await assert.rejects(lstat(snapshot), { code: 'ENOENT' });

  await snapshotConfig({ source: f.target, snapshot });
  const metadata = await lstat(snapshot);
  assert.equal(metadata.isFile(), true);
  if (process.platform !== 'win32') assert.equal(metadata.mode & 0o777, 0o600);
  assert.equal(metadata.nlink, 1);
  assert.equal(await readFile(snapshot, 'utf8'), 'old-valid-config\n');

  await writeFile(f.target, 'changed-after-snapshot\n');
  await assert.rejects(snapshotConfig({ source: f.target, snapshot }));
  assert.equal(await readFile(snapshot, 'utf8'), 'old-valid-config\n');
});
