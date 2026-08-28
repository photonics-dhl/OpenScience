import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  chmod, cp, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  classifyPnpmWorkspaceCatalogSymlink,
  createReleaseRuntimeSnapshot,
  findUncoveredDirectorySymlinkDescendant,
  normalizeReleaseRuntimePermissions,
  normalizedRuntimeMode,
  verifyReleaseRuntimeSnapshot,
} from './release-input-manifest.mjs';
import { buildReleaseMaterializeCommand } from './release-sync-command.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifestTool = resolve(here, 'release-input-manifest.mjs');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

test('runtime mode normalization implements additive a+rX semantics', () => {
  assert.equal(normalizedRuntimeMode('file', 0o600), 0o644);
  assert.equal(normalizedRuntimeMode('file', 0o700), 0o755);
  assert.equal(normalizedRuntimeMode('file', 0o640), 0o644);
  assert.equal(normalizedRuntimeMode('file', 0o000), 0o444);
  assert.equal(normalizedRuntimeMode('directory', 0o700), 0o755);
  assert.equal(normalizedRuntimeMode('directory', 0o750), 0o755);
  assert.equal(normalizedRuntimeMode('directory', 0o000), 0o555);
  assert.throws(() => normalizedRuntimeMode('symlink', 0o777), /mode|invalid/i);
});

test('runtime-covered directory symlinks do not scan the complete release tree', () => {
  let scans = 0;
  const walked = {
    find() {
      scans += 1;
      throw new Error('runtime target performed an unnecessary descendant scan');
    },
  };
  assert.equal(findUncoveredDirectorySymlinkDescendant({
    canonicalTargetPath: 'node_modules/runtime-package',
    sourceTargets: new Set(),
    walked,
  }), undefined);
  assert.equal(scans, 0);

  const uncovered = { path: 'apps/web/.next/server/app.js' };
  assert.equal(findUncoveredDirectorySymlinkDescendant({
    canonicalTargetPath: 'apps/web',
    sourceTargets: new Set(['apps/web', 'apps/web/package.json']),
    walked: [
      { path: 'apps/web/package.json' },
      uncovered,
    ],
  }), uncovered);
});

test('pnpm workspace catalog symlinks fail closed against the source manifest', () => {
  const sourceEntries = new Map([
    ['apps/web', { path: 'apps/web', type: 'directory' }],
    ['apps/web/package.json', { path: 'apps/web/package.json', type: 'file' }],
    ['packages/search', { path: 'packages/search', type: 'directory' }],
    ['packages/search/package.json', { path: 'packages/search/package.json', type: 'file' }],
  ]);
  assert.equal(classifyPnpmWorkspaceCatalogSymlink({
    path: 'node_modules/.pnpm/node_modules/@openscience/web',
    canonicalTargetPath: 'apps/web',
    sourceEntries,
  }), true);
  assert.equal(classifyPnpmWorkspaceCatalogSymlink({
    path: 'node_modules/runtime-package/workspace',
    canonicalTargetPath: 'apps/web',
    sourceEntries,
  }), false);
  assert.throws(() => classifyPnpmWorkspaceCatalogSymlink({
    path: 'node_modules/.pnpm/node_modules/@openscience/web',
    canonicalTargetPath: 'packages/search',
    sourceEntries,
  }), /catalog|workspace|target|manifest/i);

  const missingPackageManifest = new Map(sourceEntries);
  missingPackageManifest.delete('apps/web/package.json');
  assert.throws(() => classifyPnpmWorkspaceCatalogSymlink({
    path: 'node_modules/.pnpm/node_modules/@openscience/web',
    canonicalTargetPath: 'apps/web',
    sourceEntries: missingPackageManifest,
  }), /catalog|workspace|package|manifest/i);

  const directoryPackageManifest = new Map(sourceEntries);
  directoryPackageManifest.set('apps/web/package.json', {
    path: 'apps/web/package.json', type: 'directory',
  });
  assert.throws(() => classifyPnpmWorkspaceCatalogSymlink({
    path: 'node_modules/.pnpm/node_modules/@openscience/web',
    canonicalTargetPath: 'apps/web',
    sourceEntries: directoryPackageManifest,
  }), /catalog|workspace|package|manifest/i);
});

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
  await mkdir(join(repository, 'apps', 'web'), { recursive: true });
  await mkdir(join(repository, 'packages', 'search'), { recursive: true });
  await writeFile(join(repository, '.dockerignore'), 'node_modules\n');
  await writeFile(join(repository, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(repository, 'tracked.txt'), 'tracked\n');
  await writeFile(join(repository, 'apps', 'agent-worker', 'package.json'), '{"name":"worker-fixture"}\n');
  await writeFile(join(repository, 'apps', 'web', 'package.json'), '{"name":"web-fixture"}\n');
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
      'apps/web',
      'apps/web/package.json',
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
      ['gid', 'mode', 'nlink', 'path', 'sha256', 'type', 'uid'],
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

test('source verification rejects a tracked file replaced by an external same-byte hardlink', async () => {
  const state = await fixture();
  try {
    const tracked = join(state.releaseRoot, 'tracked.txt');
    const outside = join(state.sandbox, 'outside-tracked.txt');
    await writeFile(outside, 'tracked\n');
    await rm(tracked);
    await link(outside, tracked);
    const checked = verify(state.releaseRoot, state.sha);
    assert.notEqual(checked.status, 0);
    assert.match(checked.stderr, /hardlink|link count|nlink|manifest|source/i);
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

test('runtime snapshot ignores pnpm install-state timestamps while binding dependency bytes', async () => {
  const state = await fixture();
  try {
    const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    const installState = join(state.releaseRoot, 'node_modules', '.modules.yaml');
    const runtimeMetadata = join(dependencyRoot, 'metadata.json');
    await mkdir(dependencyRoot, { recursive: true });
    await writeFile(installState, 'prunedAt: Thu, 01 Jan 1970 00:00:00 GMT\n');
    await writeFile(runtimeMetadata, '{"runtime":true}\n');

    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await writeFile(installState, 'prunedAt: Fri, 28 Aug 2026 21:51:14 GMT\n');
    await assert.doesNotReject(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }));

    await writeFile(runtimeMetadata, '{"runtime":"tampered"}\n');
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot binds executable dist JavaScript but ignores compiler-only adjuncts', async () => {
  const state = await fixture();
  try {
    const dist = join(state.releaseRoot, 'apps', 'agent-worker', 'dist');
    const runtime = join(dist, 'index.js');
    const declaration = join(dist, 'index.d.ts');
    const sourceMap = join(dist, 'index.js.map');
    await mkdir(dist, { recursive: true });
    await writeFile(runtime, 'export const runtime = true;\n');
    await writeFile(declaration, 'export declare const runtime: boolean;\n');
    await writeFile(sourceMap, '{"version":3}\n');

    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await writeFile(declaration, 'export declare const runtime: "rebuilt";\n');
    await writeFile(sourceMap, '{"version":3,"rebuilt":true}\n');
    await assert.doesNotReject(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }));

    await writeFile(runtime, 'export const runtime = false;\n');
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot rejects executable symlinks to excluded dist adjuncts and binds JavaScript targets', async () => {
  const state = await fixture();
  try {
    const dist = join(state.releaseRoot, 'packages', 'search', 'dist');
    const runtime = join(dist, 'runtime.js');
    const declaration = join(dist, 'runtime.d.ts');
    const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    const runtimeLink = join(dependencyRoot, 'runtime.js');
    await mkdir(dist, { recursive: true });
    await mkdir(dependencyRoot, { recursive: true });
    await writeFile(runtime, 'export const runtime = true;\n');
    await writeFile(declaration, 'export declare const runtime: boolean;\n');

    await symlink(declaration, runtimeLink);
    await assert.rejects(
      createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha }),
      /symlink|target|closure|runtime/i,
    );

    await rm(runtimeLink);
    await symlink(runtime, runtimeLink);
    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await writeFile(runtime, 'export const runtime = false;\n');
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime permission normalization repairs restrictive retry outputs and remains snapshot-bound', {
  skip: process.platform === 'win32',
}, async () => {
  const state = await fixture();
  try {
    const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    const runtimeFile = join(dependencyRoot, 'index.js');
    const distRoot = join(state.releaseRoot, 'apps', 'agent-worker', 'dist');
    const nestedDist = join(distRoot, 'nested');
    const distRuntime = join(nestedDist, 'worker.js');
    const distDeclaration = join(nestedDist, 'worker.d.ts');
    const distSourceMap = join(nestedDist, 'worker.js.map');
    const trackedFile = join(state.releaseRoot, 'tracked.txt');
    await mkdir(dependencyRoot, { recursive: true });
    await writeFile(runtimeFile, 'runtime-v1\n');
    await mkdir(nestedDist, { recursive: true });
    await writeFile(distRuntime, 'export const worker = true;\n');
    await writeFile(distDeclaration, 'export declare const worker: boolean;\n');
    await writeFile(distSourceMap, '{"version":3}\n');
    await chmod(dependencyRoot, 0o700);
    await chmod(runtimeFile, 0o600);
    await chmod(distRoot, 0o700);
    await chmod(nestedDist, 0o700);
    await chmod(distRuntime, 0o600);
    await chmod(distDeclaration, 0o600);
    await chmod(distSourceMap, 0o600);
    const trackedMode = (await lstat(trackedFile)).mode & 0o777;

    await normalizeReleaseRuntimePermissions({ root: state.releaseRoot, sourceSha: state.sha });
    assert.equal((await lstat(dependencyRoot)).mode & 0o777, 0o755);
    assert.equal((await lstat(runtimeFile)).mode & 0o777, 0o644);
    assert.equal((await lstat(distRoot)).mode & 0o777, 0o755);
    assert.equal((await lstat(nestedDist)).mode & 0o777, 0o755);
    assert.equal((await lstat(distRuntime)).mode & 0o777, 0o644);
    assert.equal((await lstat(distDeclaration)).mode & 0o777, 0o600);
    assert.equal((await lstat(distSourceMap)).mode & 0o777, 0o600);
    assert.equal((await lstat(trackedFile)).mode & 0o777, trackedMode);
    await normalizeReleaseRuntimePermissions({ root: state.releaseRoot, sourceSha: state.sha });
    assert.equal((await lstat(runtimeFile)).mode & 0o777, 0o644);

    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await chmod(runtimeFile, 0o600);
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest|mode/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime permission normalization rejects restrictive external hardlinks without changing them', {
  skip: process.platform === 'win32',
}, async () => {
  const state = await fixture();
  try {
    const externalFile = join(state.sandbox, 'external-private.js');
    const runtimeRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    await writeFile(externalFile, 'private-runtime\n');
    await chmod(externalFile, 0o600);
    await mkdir(runtimeRoot, { recursive: true });
    await link(externalFile, join(runtimeRoot, 'index.js'));

    await assert.rejects(
      normalizeReleaseRuntimePermissions({ root: state.releaseRoot, sourceSha: state.sha }),
      /exclusive|hardlink|link count/i,
    );
    assert.equal((await lstat(externalFile)).mode & 0o777, 0o600);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot permits a source-covered workspace symlink and binds its generated runtime bytes', async () => {
  const state = await fixture();
  try {
    const generated = join(state.releaseRoot, 'packages', 'search', 'generated', 'client');
    await mkdir(generated, { recursive: true });
    await writeFile(join(generated, 'index.js'), 'workspace-runtime-v1\n');
    const scope = join(state.releaseRoot, 'node_modules', '@openscience');
    await mkdir(scope, { recursive: true });
    await symlink(
      join(state.releaseRoot, 'packages', 'search'),
      join(scope, 'search'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await writeFile(join(generated, 'index.js'), 'workspace-runtime-v2\n');
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot binds pnpm workspace catalog symlinks without treating unrelated build output as worker runtime', async () => {
  const state = await fixture();
  try {
    const nextOutput = join(state.releaseRoot, 'apps', 'web', '.next', 'server.js');
    await mkdir(dirname(nextOutput), { recursive: true });
    await writeFile(nextOutput, 'unrelated-web-build-v1\n');
    const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
    await mkdir(dependencyRoot, { recursive: true });
    await writeFile(join(dependencyRoot, 'metadata.json'), '{"runtime":true}\n');
    const catalog = join(state.releaseRoot, 'node_modules', '.pnpm', 'node_modules', '@openscience');
    await mkdir(catalog, { recursive: true });
    const workspaceLink = join(catalog, 'web');
    await symlink(
      join(state.releaseRoot, 'packages', 'search'),
      workspaceLink,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(
      createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha }),
      /catalog|workspace|target|manifest|symlink/i,
    );
    await rm(workspaceLink);
    await symlink(
      join(state.releaseRoot, 'apps', 'web'),
      workspaceLink,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const snapshot = await createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha });
    await writeFile(nextOutput, 'unrelated-web-build-v2\n');
    await assert.doesNotReject(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }));

    await rm(workspaceLink);
    await symlink(
      join(state.releaseRoot, 'packages', 'search'),
      workspaceLink,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(verifyReleaseRuntimeSnapshot({
      root: state.releaseRoot, sourceSha: state.sha, expected: snapshot,
    }), /runtime|generated|identity|digest|symlink|catalog|workspace|manifest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('runtime snapshot rejects symlinks whose canonical target is excluded from both source and runtime closure', async (t) => {
  const cases = [
    ['Next.js output', join('apps', 'web', '.next', 'server.js')],
    ['TypeScript build metadata', join('apps', 'agent-worker', 'tsconfig.tsbuildinfo')],
  ];
  for (const [name, targetPath] of cases) {
    await t.test(name, async () => {
      const state = await fixture();
      try {
        const target = join(state.releaseRoot, targetPath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, 'excluded-runtime-v1\n');
        const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
        await mkdir(dependencyRoot, { recursive: true });
        await writeFile(join(dependencyRoot, 'metadata.json'), '{}\n');
        await symlink(target, join(dependencyRoot, 'excluded-target.js'));
        await assert.rejects(
          createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha }),
          /symlink|closure|covered|runtime/i,
        );
      } finally {
        await rm(state.sandbox, { recursive: true, force: true });
      }
    });
  }
});

test('runtime snapshot rejects source-covered directory symlinks that expose excluded descendants', async (t) => {
  for (const targetPath of ['apps', join('apps', 'web')]) {
    await t.test(targetPath, async () => {
      const state = await fixture();
      try {
        const excluded = join(state.releaseRoot, 'apps', 'web', '.next', 'server.js');
        await mkdir(dirname(excluded), { recursive: true });
        await writeFile(excluded, 'unbound-descendant\n');
        const dependencyRoot = join(state.releaseRoot, 'node_modules', 'runtime-package');
        await mkdir(dependencyRoot, { recursive: true });
        await writeFile(join(dependencyRoot, 'metadata.json'), '{}\n');
        await symlink(
          join(state.releaseRoot, targetPath),
          join(dependencyRoot, 'covered-ancestor'),
          process.platform === 'win32' ? 'junction' : 'dir',
        );
        await assert.rejects(
          createReleaseRuntimeSnapshot({ root: state.releaseRoot, sourceSha: state.sha }),
          /symlink|closure|descendant|runtime/i,
        );
      } finally {
        await rm(state.sandbox, { recursive: true, force: true });
      }
    });
  }
});
