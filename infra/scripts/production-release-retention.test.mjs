import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  deriveReleaseImageTags,
  parseReleaseCapability,
  parseMountInfo,
  parsePendingIntent,
  parseRetentionCli,
  PENDING_INTENT_MAX_BYTES,
  selectInactiveReleaseShas,
} from './production-release-retention.mjs';

const active = 'a'.repeat(40);
const rollback = 'b'.repeat(40);
const inactive = 'c'.repeat(40);

test('retention selects only inactive lowercase SHA release directories', () => {
  assert.deepEqual(selectInactiveReleaseShas({
    activeSha: active,
    rollbackSha: rollback,
    entries: [inactive, rollback, 'notes', active],
  }), [inactive]);
  assert.throws(() => selectInactiveReleaseShas({
    activeSha: active,
    rollbackSha: active,
    entries: [],
  }), /must differ/u);
});
test('retention derives only exact release-scoped image tags', () => {
  assert.deepEqual(deriveReleaseImageTags(inactive), [
    `openscience-agent-worker:${inactive}`,
    `openscience-document-parser:${inactive}`,
    `openscience-embedding-worker:${inactive}`,
    `openscience-scansci-mcp:${inactive}`,
  ]);
});
test('schema 6 capability binds only the official MCP image ID', () => {
  const mcpId = `sha256:${'a'.repeat(64)}`;
  const source = [
    'schema=6', 'embedding_deploy=false', 'bge_m3_enabled=false', 'model_version_id=',
    'model_revision=', 'source_sha256=', 'package_freeze_sha256=', 'model_manifest_sha256=',
    'scansci_deploy=true', `scansci_mcp_image_id=${mcpId}`,
  ].join('\n');
  assert.deepEqual(parseReleaseCapability(source), {
    embeddingDeploy: false, scansciDeploy: true, mcpImageId: mcpId,
  });
  assert.throws(() => parseReleaseCapability(source, { expectedMcpImageId: `sha256:${'c'.repeat(64)}` }), /invalid/u);
});

test('schema 5 rollback metadata keeps only the official MCP identity', () => {
  const mcpId = `sha256:${'a'.repeat(64)}`;
  const authId = `sha256:${'b'.repeat(64)}`;
  const source = [
    'schema=5', 'embedding_deploy=false', 'bge_m3_enabled=false', 'model_version_id=',
    'model_revision=', 'source_sha256=', 'package_freeze_sha256=', 'model_manifest_sha256=',
    'scansci_deploy=true', `scansci_mcp_image_id=${mcpId}`, `scansci_auth_image_id=${authId}`,
  ].join('\n');
  assert.deepEqual(parseReleaseCapability(source), {
    embeddingDeploy: false, scansciDeploy: true, mcpImageId: mcpId,
  });
});



test('mountinfo parser exposes nested cleanup boundaries with escaped paths decoded', () => {
  assert.deepEqual(parseMountInfo([
    '24 20 0:21 / / rw,relatime - ext4 /dev/root rw',
    `25 24 0:22 / ${`/opt/openscience-releases/${inactive}/nested\\040data`} rw - tmpfs tmpfs rw`,
  ].join('\n')), ['/', `/opt/openscience-releases/${inactive}/nested data`]);
});

test('pending intent is strict and binds candidate to rollback', () => {
  assert.deepEqual(parsePendingIntent(`${JSON.stringify({
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [inactive],
    imageTags: deriveReleaseImageTags(inactive),
    capabilityShas: [inactive],
  })}\n`), {
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [inactive],
    imageTags: deriveReleaseImageTags(inactive),
    capabilityShas: [inactive],
  });
  assert.throws(() => parsePendingIntent(JSON.stringify({
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [],
    imageTags: [],
    capabilityShas: [],
    ignored: true,
  })), /identity is invalid/u);
  for (const protectedEntry of [
    { releaseShas: [active], imageTags: [], capabilityShas: [] },
    { releaseShas: [], imageTags: [`openscience-agent-worker:${rollback}`], capabilityShas: [] },
    { releaseShas: [], imageTags: [], capabilityShas: [rollback] },
  ]) {
    assert.throws(() => parsePendingIntent(JSON.stringify({
      schemaVersion: 2,
      candidateSha: active,
      rollbackSha: rollback,
      ...protectedEntry,
    })), /protected release/u);
  }
});

test('the trusted pending-file limit covers the largest valid frozen retention plan', () => {
  const shas = Array.from({ length: 256 }, (_, index) => (index + 2).toString(16).padStart(40, '0'));
  const intent = {
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: shas,
    capabilityShas: shas,
    imageTags: shas.flatMap(deriveReleaseImageTags).sort(),
  };
  const serialized = `${JSON.stringify(intent)}\n`;
  assert.ok(Buffer.byteLength(serialized) > 16 * 1024);
  assert.ok(Buffer.byteLength(serialized) <= PENDING_INTENT_MAX_BYTES);
  assert.deepEqual(parsePendingIntent(serialized), intent);
  assert.throws(() => parsePendingIntent(JSON.stringify({ ...intent, releaseShas: [...shas, 'f'.repeat(40)] })), /identity is invalid/u);
});

test('CLI requires fixed FD9 and explicit expected identity', () => {
  assert.deepEqual(parseRetentionCli([
    'complete', '--expected-active', active, '--expected-rollback', rollback, '--lock-fd', '9',
  ]), {
    command: 'complete',
    expectedActive: active,
    expectedRollback: rollback,
    lockFd: 9,
  });
  assert.throws(() => parseRetentionCli([
    'complete', '--expected-active', active, '--expected-rollback', rollback, '--lock-fd', '8',
  ]), /FD9/u);
});

test('automatic retention source contains no broad Docker prune', () => {
  const retentionSource = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    /docker\s+system\s+prune/u,
    /docker\s+image\s+prune/u,
    /docker\s+volume\s+prune/u,
    /docker\s+builder\s+prune/u,
    /['"](?:system|image|volume|builder)['"]\s*,\s*['"]prune['"]/u,
  ]) assert.doesNotMatch(retentionSource, forbidden);
});

// Exercise the real CLI and transaction on Windows without host/root/Docker access.
// Keep function bodies/dispatch intact; bind filesystem metadata, flock and Docker in a VM.
const retentionProgram = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8')
  .replace(/^#![^\n]*\n/u, '')
  .replace(/^import[\s\S]*?;\r?\n/gmu, '')
  .replace(/^export /gmu, '')
  .replaceAll('import.meta.url', 'retentionModuleUrl');

function retentionHost() {
  const paths = {
    active: '/opt/openscience/.release-id',
    rollback: '/opt/openscience/.rollback-id',
    pending: '/opt/openscience/.rollback-id.pending',
    journal: '/opt/openscience/.deploy-transaction.json',
    failure: '/opt/openscience/.release-failed',
    releases: '/opt/openscience-releases',
    capabilities: '/opt/openscience/.release-capabilities',
  };
  const nodes = new Map();
  const file = (path, content, mode = 0o644) => nodes.set(path, { kind: 'file', content, mode, uid: 0, nlink: 1 });
  const directory = (path) => nodes.set(path, { kind: 'directory', mode: 0o755, uid: 0, nlink: 1 });
  const entry = (path) => {
    if (!nodes.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    return nodes.get(path);
  };
  for (const path of ['/opt/openscience', paths.releases, paths.capabilities]) directory(path);
  file(paths.active, `${active}\n`);
  file(paths.rollback, `${rollback}\n`, 0o600);
  file('/proc/self/mountinfo', '24 20 0:21 / / rw,relatime - ext4 /dev/root rw\n');
  for (const sha of [active, rollback, inactive]) {
    directory(`${paths.releases}/${sha}`);
    file(`${paths.releases}/${sha}/.release-source`, `${sha}\n`);
    file(`${paths.capabilities}/${sha}`, 'schema=1\nembedding=0\n');
  }
  // Non-release directories and third-party images must survive cleanup.
  directory(`${paths.releases}/notes`);
  file(`${paths.releases}/notes/evidence`, 'keep');
  directory('/opt/openscience/data');
  file('/opt/openscience/data/business-data', 'keep');
  const images = new Map([
    ...[active, rollback].flatMap((sha) => [
      `openscience-agent-worker:${sha}`, `openscience-document-parser:${sha}`,
    ]),
    `openscience-agent-worker:${inactive}`, `openscience-document-parser:${inactive}`,
    'postgres:16',
  ].map((tag, index) => [tag, `sha256:${(index + 1).toString(16).padStart(64, '0')}`]));
  const containers = [{
    Id: 'live-worker', Name: '/openscience-prod-agent-worker-1',
    Image: images.get(`openscience-agent-worker:${active}`), State: { Running: true }, Mounts: [],
  }];
  const commands = [];
  const host = { paths, nodes, images, containers, commands, file, directory, locked: true, failRemove: undefined };
  const bindings = {
    ...posix,
    randomUUID: () => 'fixture',
    retentionModuleUrl: 'file:///retention.mjs',
    fileURLToPath: () => '/retention.mjs',
    verifyProductionDeployLockOnHost: async (options) => {
      assert.equal(options.lockFd, 9);
      assert.equal(options.requiredUid, 0);
      assert.equal(options.lockDirectory, '/run/lock/openscience-production-deploy');
      if (!host.locked) throw new Error('production deploy flock is not held');
    },
    lstat: async (path) => {
      const value = entry(path);
      return {
        ...value, size: Buffer.byteLength(value.content ?? ''),
        isFile: () => value.kind === 'file', isDirectory: () => value.kind === 'directory',
        isSymbolicLink: () => value.kind === 'symlink',
      };
    },
    realpath: async (path) => entry(path).realPath ?? path,
    readFile: async (path) => entry(path).content,
    readdir: async (path, options) => {
      assert.equal(entry(path).kind, 'directory');
      const names = [...nodes.keys()].filter((candidate) => posix.dirname(candidate) === path).map((candidate) => posix.basename(candidate));
      return options?.withFileTypes ? names.map((name) => ({ name })) : names;
    },
    chmod: async (path, mode) => { entry(path).mode = mode; },
    open: async (path, flags, mode) => {
      if (flags === 'wx') {
        if (nodes.has(path)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        entry(posix.dirname(path));
        file(path, '', mode);
      } else {
        assert.equal(flags, 'r');
        entry(path);
      }
      return {
        writeFile: async (content) => { entry(path).content = content; },
        sync: async () => {}, close: async () => {},
      };
    },
    rename: async (from, to) => {
      entry(from);
      for (const [path, value] of [...nodes]) {
        if (path === from || path.startsWith(`${from}/`)) {
          nodes.set(to + path.slice(from.length), value);
          nodes.delete(path);
        }
      }
    },
    rm: async (path, options) => {
      if (host.failRemove === path) throw new Error('injected cleanup interruption');
      if (!options?.force) entry(path);
      for (const candidate of [...nodes.keys()]) {
        if (candidate === path || options?.recursive && candidate.startsWith(`${path}/`)) nodes.delete(candidate);
      }
    },
    spawnSync: (command, args) => {
      assert.equal(command, 'docker');
      commands.push([...args]);
      const result = (stdout = '', status = 0) => ({ stdout, status });
      if (args[0] === 'ps') {
        assert.ok(args[1] === '-aq' || args[1] === '-q');
        return result(containers.filter((container) => args[1] === '-aq' || container.State.Running)
          .map((container) => container.Id).join('\n'));
      }
      if (args[0] === 'inspect') return result(JSON.stringify(containers.filter((container) => args.slice(1).includes(container.Id))));
      assert.equal(args[0], 'image');
      if (args[1] === 'inspect') return images.has(args[2])
        ? result(JSON.stringify([{ Id: images.get(args[2]) }])) : result('', 1);
      if (args[1] === 'ls') {
        assert.deepEqual([...args], ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']);
        return result([...images.keys()].join('\n'));
      }
      assert.equal(args[1], 'rm');
      assert.equal(args.length, 3);
      assert.ok(images.delete(args[2]));
      return result();
    },
  };
  host.invoke = async (command = 'prepare-cleanup', extra = [], expected = {}) => {
    let output = '';
    // Appending main() keeps private production functions private; argv[1] avoids auto-start.
    await runInNewContext(`${retentionProgram}\nmain();`, {
      ...bindings,
      process: { pid: 123, argv: [
        'node', '/retention-test.mjs', command,
        '--expected-active', expected.active ?? active,
        '--expected-rollback', expected.rollback ?? rollback, '--lock-fd', '9', ...extra,
      ], stdout: { write: (value) => { output += value; } } },
    });
    return output;
  };
  host.snapshot = () => JSON.stringify({ nodes: [...nodes].sort(), images: [...images].sort() });
  return host;
}

test('prepare-cleanup CLI accepts only explicit stable identities and FD9', () => {
  const argv = [
    'prepare-cleanup', '--expected-active', active, '--expected-rollback', rollback, '--lock-fd', '9',
  ];
  assert.deepEqual(parseRetentionCli(argv), { command: 'prepare-cleanup', expectedActive: active, expectedRollback: rollback, lockFd: 9 });
  for (const invalid of [
    argv.slice(0, -2), argv.slice(0, -1),
    ['prepare-cleanup', '--expected-active', active, '--lock-fd', '9'],
    ['prepare-cleanup', '--expected-rollback', rollback, '--lock-fd', '9'],
    [...argv.slice(0, -1), '8'], [...argv.slice(0, -1), '09'],
    ['prepare-cleanup', '--expected-active', active, '--expected-rollback', active, '--lock-fd', '9'],
    ['prepare-cleanup', '--expected-active', 'invalid', '--expected-rollback', rollback, '--lock-fd', '9'],
    ['prepare-cleanup', '--expected-active', active, '--expected-rollback', 'invalid', '--lock-fd', '9'],
    [...argv, '--expected-active', inactive], [...argv, '--prune-unused', '1'],
    [...argv, '--root', '/tmp/other-host'],
  ]) assert.throws(() => parseRetentionCli(invalid), /invalid|incomplete|FD9|must differ/u);
});

test('prepare-cleanup publishes a schema-2 plan on a stable host without deleting anything', async () => {
  const host = retentionHost();
  const before = host.snapshot();
  assert.equal(await host.invoke(), 'PRODUCTION_RELEASE_RETENTION_PREPARE-CLEANUP_OK\n');
  assert.deepEqual(JSON.parse(host.nodes.get(host.paths.pending).content), {
    schemaVersion: 2, candidateSha: active, rollbackSha: rollback,
    releaseShas: [inactive], capabilityShas: [inactive],
    imageTags: [`openscience-agent-worker:${inactive}`, `openscience-document-parser:${inactive}`],
  });
  assert.equal(host.nodes.get(host.paths.pending).mode, 0o600);
  host.nodes.delete(host.paths.pending);
  assert.equal(host.snapshot(), before);
});

test('normal prepare still requires a journal and keeps historical runtime inputs by default', async () => {
  const host = retentionHost();
  await assert.rejects(host.invoke('prepare'), /ENOENT.*deploy-transaction/u);
  host.file(host.paths.journal, JSON.stringify({
    schemaVersion: 1, candidateSha: active, rollbackSha: rollback,
    phase: 'published', updatedAt: '2026-10-03T00:00:00Z',
  }), 0o600);
  // A deployment replaces the previous rollback identity; cleanup must not do so.
  host.file(host.paths.rollback, `${inactive}\n`, 0o600);
  host.containers[0].Mounts = [{ Source: `${host.paths.releases}/${inactive}/tools` }];
  await host.invoke('prepare');
  assert.deepEqual(JSON.parse(host.nodes.get(host.paths.pending).content), {
    schemaVersion: 2, candidateSha: active, rollbackSha: rollback,
    releaseShas: [], capabilityShas: [], imageTags: [],
  });
  host.nodes.delete(host.paths.pending);
  await assert.rejects(host.invoke('prepare', ['--prune-unused', '1']), /container mounts inactive release/u);
  assert.equal(host.nodes.has(host.paths.pending), false);
});

test('prepare-cleanup fails closed before publishing an intent when host guards reject', async (t) => {
  const cases = [
    ['unheld lock', (host) => { host.locked = false; }, /flock is not held/u],
    ['changed active', (host) => host.file(host.paths.active, `${inactive}\n`), /cleanup active release mismatch/u],
    ['wrong expected rollback', () => {}, /cleanup rollback release mismatch/u, { rollback: inactive }],
    ['missing active', (host) => host.nodes.delete(host.paths.active), /ENOENT.*release-id/u],
    ['missing rollback', (host) => host.nodes.delete(host.paths.rollback), /ENOENT.*rollback-id/u],
    ['untrusted active owner', (host) => { host.nodes.get(host.paths.active).uid = 1000; }, /unsafe production state file/u],
    ['writable active marker', (host) => { host.nodes.get(host.paths.active).mode = 0o666; }, /unsafe production state file/u],
    ['untrusted rollback owner', (host) => { host.nodes.get(host.paths.rollback).uid = 1000; }, /unsafe production state file/u],
    ['nonprivate rollback', (host) => { host.nodes.get(host.paths.rollback).mode = 0o644; }, /unsafe production state file/u],
    ['symlink rollback', (host) => { host.nodes.get(host.paths.rollback).kind = 'symlink'; }, /unsafe production state file/u],
    ['hardlinked rollback', (host) => { host.nodes.get(host.paths.rollback).nlink = 2; }, /unsafe production state file/u],
    ['malformed rollback', (host) => host.file(host.paths.rollback, 'not-a-sha\n', 0o600), /rollback-id SHA is invalid/u],
    ...['prepared', 'migrating', 'switching', 'published'].map((phase) => [
      `${phase} deploy journal`, (host) => host.file(host.paths.journal, JSON.stringify({
        schemaVersion: 1, candidateSha: active, rollbackSha: rollback, phase, updatedAt: '2026-10-03T00:00:00Z',
      }), 0o600), /production deploy journal already exists/u,
    ]),
    ['failure marker', (host) => host.file(host.paths.failure, ''), /production release failure marker already exists/u],
    ['pending intent', (host) => host.file(host.paths.pending, 'keep existing intent', 0o600), /rollback pending intent already exists/u],
    ['orphan tombstone', (host) => host.directory(`${host.paths.releases}/.retention-${inactive}`), /tombstone exists without pending intent/u],
    ['untrusted release owner', (host) => { host.nodes.get(`${host.paths.releases}/${inactive}`).uid = 1000; }, /unsafe release root/u],
    ['symlink release', (host) => { host.nodes.get(`${host.paths.releases}/${inactive}`).kind = 'symlink'; }, /unsafe release root/u],
    ['release source drift', (host) => host.file(`${host.paths.releases}/${inactive}/.release-source`, active), /source identity mismatch/u],
    ['nested mount', (host) => host.file('/proc/self/mountinfo',
      `25 24 0:22 / ${host.paths.releases}/${inactive}/data rw - tmpfs tmpfs rw\n`), /cleanup target contains a mount/u],
    ...[true, false].flatMap((running) => [
      [`${running ? 'running' : 'stopped'} container mount`, (host) => host.containers.push({
        Id: 'tool', Image: host.images.get('postgres:16'), State: { Running: running },
        Mounts: [{ Source: `${host.paths.releases}/${inactive}/tools` }],
      }), /container mounts inactive release/u],
      [`${running ? 'running' : 'stopped'} container image`, (host) => host.containers.push({
        Id: 'tool', Image: host.images.get(`openscience-agent-worker:${inactive}`), State: { Running: running }, Mounts: [],
      }), /container references inactive release image/u],
    ]),
    ...[active, rollback].map((sha) => [
      `missing protected image ${sha[0]}`, (host) => host.images.delete(`openscience-document-parser:${sha}`), /protected release image is missing/u,
    ]),
    ['untrusted capability owner', (host) => { host.nodes.get(`${host.paths.capabilities}/${inactive}`).uid = 1000; }, /unsafe release capability/u],
  ];
  for (const [name, mutate, error, expected] of cases) {
    await t.test(name, async () => {
      const host = retentionHost();
      mutate(host);
      const before = host.snapshot();
      await assert.rejects(host.invoke('prepare-cleanup', [], expected), error);
      assert.equal(host.snapshot(), before);
      assert.equal(host.commands.some((args) => args[0] === 'image' && args[1] === 'rm'), false);
    });
  }
});

test('stable cleanup uses existing complete/resume after a tombstone interruption', async () => {
  const host = retentionHost();
  const removedPaths = [
    `${host.paths.releases}/${inactive}`, `${host.paths.releases}/${inactive}/.release-source`,
    `${host.paths.capabilities}/${inactive}`,
  ];
  const preservedNodes = [...host.nodes].filter(([path]) => !removedPaths.includes(path))
    .map(([path, value]) => [path, { ...value }]);
  const removedTags = [`openscience-agent-worker:${inactive}`, `openscience-document-parser:${inactive}`];
  const preservedImages = [...host.images].filter(([tag]) => !removedTags.includes(tag));
  await host.invoke();
  const pending = host.nodes.get(host.paths.pending).content;
  const tombstone = `${host.paths.releases}/.retention-${inactive}`;
  host.failRemove = tombstone;
  await assert.rejects(host.invoke('complete'), /injected cleanup interruption/u);
  assert.equal(host.nodes.get(host.paths.pending).content, pending);
  assert.equal(host.nodes.has(`${host.paths.releases}/${inactive}`), false);
  assert.equal(host.nodes.has(tombstone), true);
  host.failRemove = undefined;
  assert.equal(await host.invoke('resume'), 'PRODUCTION_RELEASE_RETENTION_RESUME_OK\n');
  assert.deepEqual([...host.nodes].sort(), preservedNodes.sort());
  assert.deepEqual([...host.images].sort(), preservedImages.sort());
});

test('cleanup completion rechecks runtime references against the prepared plan', async () => {
  const host = retentionHost();
  await host.invoke();
  host.containers.push({
    Id: 'new-tool', Image: host.images.get(`openscience-agent-worker:${inactive}`), State: { Running: false }, Mounts: [],
  });
  const before = host.snapshot();
  await assert.rejects(host.invoke('complete'), /container references inactive release image/u);
  assert.equal(host.snapshot(), before);
});
