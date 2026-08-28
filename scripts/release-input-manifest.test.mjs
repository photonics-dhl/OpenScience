import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createReleaseRuntimeSnapshot,
  verifyReleaseRuntimeSnapshot,
} from './release-input-manifest.mjs';
import { buildReleaseMaterializeCommand } from './release-sync-command.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifestTool = resolve(here, 'release-input-manifest.mjs');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

function bashPath(path) {
  if (process.platform !== 'win32') return path;
  return spawnSync(bash, ['-lc', `cygpath -u '${path.replaceAll("'", "'\\''")}'`], {
    encoding: 'utf8',
  }).stdout.trim();
}

async function fixture() {
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-release-inputs-'));
  const repository = join(sandbox, 'repository');
  await mkdir(join(repository, 'scripts'), { recursive: true });
  await mkdir(join(repository, 'infra', 'compose'), { recursive: true });
  await mkdir(join(repository, 'apps', 'agent-worker'), { recursive: true });
  await mkdir(join(repository, 'packages', 'search'), { recursive: true });
  await writeFile(join(repository, '.dockerignore'), 'node_modules\n');
  await writeFile(join(repository, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(repository, 'tracked.txt'), 'tracked\n');
  await writeFile(join(repository, 'apps', 'agent-worker', 'package.json'), '{"name":"worker-fixture"}\n');
  await writeFile(join(repository, 'packages', 'search', 'package.json'), '{"name":"search-fixture"}\n');
  await writeFile(join(repository, 'infra', 'compose', 'docker-compose.prod.yml'), 'services: {}\n');
  await cp(manifestTool, join(repository, 'scripts', 'release-input-manifest.mjs'));
  execFileSync('git', ['init'], { cwd: repository, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'gate@example.invalid'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Release Gate'], { cwd: repository });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repository, stdio: 'ignore' });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  const archive = execFileSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar.gz', sha], {
    cwd: repository,
  });
  const releaseBase = join(sandbox, 'releases');
  const productionRoot = `/opt/openscience-releases/${sha}`;
  const command = buildReleaseMaterializeCommand(productionRoot, sha)
    .replaceAll('/opt/openscience-releases', bashPath(releaseBase))
    .replaceAll('/usr/bin/node', 'node');
  const materialized = spawnSync(bash, ['-c', command], { input: archive, encoding: 'utf8' });
  assert.equal(materialized.status, 0, materialized.stderr);
  return { sandbox, repository, releaseRoot: join(releaseBase, sha), sha, archive, command };
}

function verify(releaseRoot, sha) {
  return spawnSync(process.execPath, [manifestTool, 'verify', '--root', releaseRoot, '--sha', sha], {
    encoding: 'utf8',
  });
}

test('git archive materialization creates a complete immutable source manifest', async () => {
  const state = await fixture();
  try {
    assert.equal((await readFile(join(state.releaseRoot, '.release-source'), 'utf8')).trim(), state.sha);
    const manifest = JSON.parse(await readFile(join(state.releaseRoot, '.release-inputs.sha256'), 'utf8'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.sourceSha, state.sha);
    assert.deepEqual(Object.keys(manifest.root).sort(), ['gid', 'mode', 'uid']);
    assert.deepEqual(manifest.entries.map(({ path }) => path), [
      '.dockerignore',
      'apps',
      'apps/agent-worker',
      'apps/agent-worker/package.json',
      'infra',
      'infra/compose',
      'infra/compose/docker-compose.prod.yml',
      'package.json',
      'packages',
      'packages/search',
      'packages/search/package.json',
      'scripts',
      'scripts/release-input-manifest.mjs',
      'tracked.txt',
    ]);
    assert.deepEqual(
      Object.keys(manifest.entries.find(({ path }) => path === 'package.json')).sort(),
      ['gid', 'mode', 'path', 'sha256', 'type', 'uid'],
    );
    assert.deepEqual(
      Object.keys(manifest.entries.find(({ path }) => path === 'infra')).sort(),
      ['gid', 'mode', 'path', 'type', 'uid'],
    );
    const checked = verify(state.releaseRoot, state.sha);
    assert.equal(checked.status, 0, checked.stderr);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('source verification rejects tracked tampering, unmanifested content and symlinks', async (t) => {
  const mutations = [
    ['manifest missing', async (root) => rm(join(root, '.release-inputs.sha256'))],
    ['tracked file changed', async (root) => writeFile(join(root, 'tracked.txt'), 'tampered\n')],
    ...(process.platform === 'win32'
      ? []
      : [
        ['tracked file read mode changed', async (root) => chmod(join(root, 'tracked.txt'), 0o600)],
        ['tracked directory traversal mode changed', async (root) => chmod(join(root, 'infra'), 0o700)],
      ]),
    ['unmanifested file added', async (root) => writeFile(join(root, 'unexpected.txt'), 'unexpected\n')],
    ['symlink added', async (root) => symlink('tracked.txt', join(root, 'unexpected-link'))],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const state = await fixture();
      try {
        await mutate(state.releaseRoot);
        const checked = verify(state.releaseRoot, state.sha);
        assert.notEqual(checked.status, 0);
        assert.match(checked.stderr, /manifest|source|symlink|unexpected|hash/i);
      } finally {
        await rm(state.sandbox, { recursive: true, force: true });
      }
    });
  }
});

test('source verification rejects malformed, missing, duplicate and wrong-SHA manifest entries', async (t) => {
  const mutations = [
    ['wrong SHA', (manifest) => ({ ...manifest, sourceSha: 'f'.repeat(40) })],
    ['missing entry', (manifest) => ({ ...manifest, entries: manifest.entries.slice(1) })],
    ['duplicate entry', (manifest) => ({ ...manifest, entries: [...manifest.entries, manifest.entries[0]] })],
    ['extra entry', (manifest) => ({
      ...manifest,
      entries: [...manifest.entries, { path: 'absent.txt', sha256: '0'.repeat(64) }],
    })],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const state = await fixture();
      try {
        const path = join(state.releaseRoot, '.release-inputs.sha256');
        const manifest = JSON.parse(await readFile(path, 'utf8'));
        await chmod(path, 0o600);
        await writeFile(path, `${JSON.stringify(mutate(manifest), null, 2)}\n`);
        const checked = verify(state.releaseRoot, state.sha);
        assert.notEqual(checked.status, 0);
        assert.match(checked.stderr, /manifest|source|entry|SHA/i);
      } finally {
        await rm(state.sandbox, { recursive: true, force: true });
      }
    });
  }
});

test('existing immutable release reuse verifies marker and manifest before accepting a new archive', async () => {
  const state = await fixture();
  try {
    await writeFile(join(state.releaseRoot, 'tracked.txt'), 'tampered\n');
    const reused = spawnSync(bash, ['-c', state.command], { input: state.archive, encoding: 'utf8' });
    assert.notEqual(reused.status, 0);
    assert.match(reused.stderr, /manifest|source|hash/i);
    assert.equal(basename(state.releaseRoot), state.sha);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('verification permits only the known package-manager and build output locations', async () => {
  const state = await fixture();
  try {
    await mkdir(join(state.releaseRoot, 'packages', 'search', 'generated', 'client'), { recursive: true });
    await writeFile(join(state.releaseRoot, 'packages', 'search', 'generated', 'client', 'index.js'), 'generated\n');
    await mkdir(join(state.releaseRoot, 'apps', 'agent-worker', 'dist'), { recursive: true });
    await writeFile(join(state.releaseRoot, 'apps', 'agent-worker', 'dist', 'index.js'), 'compiled\n');
    await mkdir(join(state.releaseRoot, 'node_modules', '.pnpm'), { recursive: true });
    await writeFile(join(state.releaseRoot, 'node_modules', '.pnpm', 'lock.yaml'), 'generated\n');
    const checked = verify(state.releaseRoot, state.sha);
    assert.equal(checked.status, 0, checked.stderr);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot binds generated bytes and rejects release-escaping dependency symlinks', async () => {
  const state = await fixture();
  try {
    const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    await mkdir(dependencyRoot, { recursive: true });
    const nativeModule = join(dependencyRoot, 'binding.node');
    const runtimeMetadata = join(dependencyRoot, 'metadata.json');
    await writeFile(nativeModule, 'native-runtime-bytes\n');
    await writeFile(runtimeMetadata, '{"runtime":true}\n');
    await mkdir(join(state.releaseRoot, 'apps', 'web', '.next'), { recursive: true });
    await writeFile(join(state.releaseRoot, 'apps', 'web', '.next', 'BUILD_ID'), 'first-random-build-id\n');
    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await assert.doesNotReject(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }));

    await writeFile(runtimeMetadata, '{"runtime":"tampered"}\n');
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest/i);
    await writeFile(runtimeMetadata, '{"runtime":true}\n');

    await writeFile(join(state.releaseRoot, 'apps', 'web', '.next', 'BUILD_ID'), 'second-random-build-id\n');
    await assert.doesNotReject(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }));

    if (process.platform !== 'win32') {
      await chmod(runtimeMetadata, 0o600);
      await assert.rejects(verifyReleaseRuntimeSnapshot({
        root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
      }), /runtime|mode|identity|digest/i);
      await chmod(runtimeMetadata, 0o644);
      await chmod(dependencyRoot, 0o700);
      await assert.rejects(verifyReleaseRuntimeSnapshot({
        root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
      }), /runtime|mode|identity|digest/i);
      await chmod(dependencyRoot, 0o755);
    }

    const outside = join(state.sandbox, 'outside.js');
    await writeFile(outside, 'outside release\n');
    await symlink(outside, join(dependencyRoot, 'escape.js'));
    await assert.rejects(
      createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha }),
      /symlink|escape|release root/i,
    );
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});
