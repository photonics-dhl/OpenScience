import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { CONTAINER_PROGRAM, createDockerSource, exportObjects, verifyObjectBackup } from './backup-objects.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const release = 'a'.repeat(40);
const id = '20261003T120000Z-123';
const secret = 'fixture-secret-must-not-appear';
const digest = (data) => createHash('sha256').update(data).digest('hex');
const require = createRequire(import.meta.url);

async function fixture(t, entries = [{ key: 'paper.pdf', data: Buffer.from('abc') }]) {
  const temporaryRoot = path.join(projectRoot, 'tmp', 'ops-readiness-20261003');
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'backup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backupRoot = path.join(root, 'backups');
  const rows = entries.map(({ key, data }) => ({
    key, size: data.length, etag: '900150983cd24fb0d6963f7d28e17f72',
    lastModified: '2026-10-03T00:00:00.000Z', versionId: null,
    contentType: 'application/pdf', sourceSha256: digest(data),
  }));
  const source = {
    async info() { return { bucket: 'fixture-papers' }; },
    async *list() { for (const row of rows) yield row; },
    async stat(key) { return { ...rows.find((row) => row.key === key) }; },
    async get(key) { return Readable.from([entries.find((entry) => entry.key === key).data]); },
  };
  return { root, backupRoot, source, rows, options: { backupRoot, id, release, source } };
}

test('logical export stores hostile keys only in a private map and hashes actual blob bytes', async (t) => {
  const keys = ['../../outside.pdf', '/absolute/paper', 'C:\\outside.pdf', 'line\nname/雪.pdf'];
  const f = await fixture(t, keys.map((key) => ({ key, data: Buffer.from('abc') })));
  const result = await exportObjects(f.options);
  const directory = path.join(f.backupRoot, `objects-set-${id}`);
  assert.equal(result.directory, directory);
  assert.deepEqual(await readdir(f.root), ['backups']);
  assert.deepEqual(await readdir(f.backupRoot), [`objects-set-${id}`]);
  const records = (await readFile(path.join(directory, 'objects.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map((row) => row.key), keys);
  for (const [index, row] of records.entries()) {
    assert.equal(row.blob, `blobs/${String(index + 1).padStart(12, '0')}.bin`);
    assert.equal(row.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(row.size, 3);
    assert.equal(row.etag, '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(await readFile(path.join(directory, row.blob), 'utf8'), 'abc');
  }
  assert.match(await readFile(path.join(directory, 'manifest'), 'utf8'), /consistency=per-object-validated-not-point-in-time/);
  assert.deepEqual(await verifyObjectBackup(directory), { objectCount: 4, totalBytes: 12 });
});

for (const failure of ['truncated', 'overflow', 'stream-error', 'changed', 'deleted-later', 'bad-source-hash', 'list-error']) {
  test(`${failure} rejects the backup without publishing or removing an older set`, async (t) => {
    const f = await fixture(t);
    const old = path.join(f.backupRoot, 'objects-set-20261002T120000Z-1');
    await mkdir(old, { recursive: true });
    await writeFile(path.join(old, 'keep'), 'old backup');
    if (failure === 'truncated') f.source.get = async () => Readable.from(['ab']);
    if (failure === 'overflow') f.source.get = async () => Readable.from(['abcd']);
    if (failure === 'stream-error') f.source.get = async () => Readable.from((async function* () {
      yield Buffer.from('a');
      throw new Error(secret);
    })());
    if (failure === 'changed' || failure === 'deleted-later') {
      let calls = 0;
      f.source.stat = async () => {
        calls += 1;
        if (failure === 'deleted-later' && calls >= 3) throw new Error(secret);
        return { ...f.rows[0], etag: calls >= 2 && failure === 'changed' ? 'changed-etag' : f.rows[0].etag };
      };
    }
    if (failure === 'bad-source-hash') f.rows[0].sourceSha256 = '0'.repeat(64);
    if (failure === 'list-error') f.source.list = async function* () {
      yield f.rows[0];
      throw new Error(secret);
    };
    await assert.rejects(exportObjects(f.options), (error) => {
      assert.match(error.message, /^OBJECT_BACKUP_FAIL:/);
      assert.equal(String(error.stack).includes(secret), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.deepEqual(await readdir(f.backupRoot), ['objects-set-20261002T120000Z-1']);
    assert.equal(await readFile(path.join(old, 'keep'), 'utf8'), 'old backup');
  });
}

test('offline verification rejects corrupted bytes', async (t) => {
  const f = await fixture(t);
  const { directory } = await exportObjects(f.options);
  await writeFile(path.join(directory, 'blobs/000000000001.bin'), 'abd');
  await assert.rejects(verifyObjectBackup(directory), /^Error: OBJECT_BACKUP_FAIL:/);
});

test('POSIX backup directories and files are private', { skip: process.platform === 'win32' && 'Windows does not implement POSIX permission bits' }, async (t) => {
  const f = await fixture(t);
  const { directory } = await exportObjects(f.options);
  for (const location of [f.backupRoot, directory, path.join(directory, 'blobs')]) {
    assert.equal((await stat(location)).mode & 0o777, 0o700);
  }
  for (const location of ['manifest', 'manifest.sha256', 'objects.ndjson', 'objects.ndjson.sha256', 'blobs/000000000001.bin']) {
    assert.equal((await stat(path.join(directory, location))).mode & 0o777, 0o600);
  }
});

test('zero-byte objects are included and verify successfully', async (t) => {
  const f = await fixture(t, [{ key: 'empty.pdf', data: Buffer.alloc(0) }]);
  const { directory } = await exportObjects(f.options);
  assert.deepEqual(await verifyObjectBackup(directory), { objectCount: 1, totalBytes: 0 });
});

test('insufficient filesystem capacity refuses export before downloading any object', async (t) => {
  const f = await fixture(t);
  let downloads = 0;
  f.source.get = async () => { downloads++; return Readable.from(['abc']); };
  await assert.rejects(exportObjects({ ...f.options, availableBytes: async () => 8 * 1024 ** 3 }), /OBJECT_BACKUP_FAIL: SPACE/);
  assert.equal(downloads, 0);
  assert.deepEqual(await readdir(f.backupRoot), []);
});

test('lost filesystem headroom during export refuses publication and preserves older backup', async (t) => {
  const f = await fixture(t, [{ key: 'one', data: Buffer.from('abc') }, { key: 'two', data: Buffer.from('abc') }]);
  const old = path.join(f.backupRoot, 'objects-set-20261002T120000Z-1');
  await mkdir(old, { recursive: true });
  await writeFile(path.join(old, 'keep'), 'older');
  let checks = 0;
  await assert.rejects(exportObjects({ ...f.options, availableBytes: async () => ++checks < 3 ? 10 * 1024 ** 3 : 8 * 1024 ** 3 }), /OBJECT_BACKUP_FAIL: SPACE/);
  assert.deepEqual(await readdir(f.backupRoot), [path.basename(old)]);
  assert.equal(await readFile(path.join(old, 'keep'), 'utf8'), 'older');
});

test('insufficient inode capacity refuses export before reading object bytes', async (t) => {
  const f = await fixture(t);
  let downloads = 0;
  f.source.get = async () => { downloads++; return Readable.from(['abc']); };
  await assert.rejects(exportObjects({ ...f.options, availableInodes: async () => 1024 }), /OBJECT_BACKUP_FAIL: SPACE/);
  assert.equal(downloads, 0);
  assert.deepEqual(await readdir(f.backupRoot), []);
});

for (const limits of [{ maxObjects: 1 }, { maxObjectBytes: 2 }, { maxTotalBytes: 5 }, { maxManifestBytes: 10 }, { maxRecordBytes: 10 }]) {
  test(`configured bound ${Object.keys(limits)[0]} prevents publication`, async (t) => {
    const f = await fixture(t, [{ key: 'one', data: Buffer.from('abc') }, { key: 'two', data: Buffer.from('abc') }]);
    await assert.rejects(exportObjects({ ...f.options, limits }), /OBJECT_BACKUP_FAIL: LIMIT/);
    assert.deepEqual(await readdir(f.backupRoot), []);
  });
}

test('an existing completed directory is never overwritten', async (t) => {
  const f = await fixture(t);
  const { directory } = await exportObjects(f.options);
  await assert.rejects(exportObjects(f.options), /OBJECT_BACKUP_FAIL: COLLISION/);
  assert.deepEqual(await verifyObjectBackup(directory), { objectCount: 1, totalBytes: 3 });
});

test('duplicate listing keys fail instead of claiming a complete inventory', async (t) => {
  const f = await fixture(t, [{ key: 'one', data: Buffer.from('abc') }, { key: 'one', data: Buffer.from('abc') }]);
  await assert.rejects(exportObjects(f.options), /OBJECT_BACKUP_FAIL: FORMAT/);
  assert.deepEqual(await readdir(f.backupRoot), []);
});

test('offline verifier detects map corruption and rejects traversal even with a rewritten sidecar', async (t) => {
  const f = await fixture(t);
  const { directory } = await exportObjects(f.options);
  const mapPath = path.join(directory, 'objects.ndjson');
  const row = JSON.parse((await readFile(mapPath, 'utf8')).trim());
  row.blob = '../../outside.pdf';
  const changed = `${JSON.stringify(row)}\n`;
  await writeFile(mapPath, changed);
  await assert.rejects(verifyObjectBackup(directory), /OBJECT_BACKUP_FAIL: INTEGRITY/);
  await writeFile(`${mapPath}.sha256`, `${digest(changed)}  objects.ndjson\n`);
  await assert.rejects(verifyObjectBackup(directory), /OBJECT_BACKUP_FAIL: FORMAT/);
});

test('offline verifier rejects a symlinked blob directory', async (t) => {
  const f = await fixture(t);
  const { directory } = await exportObjects(f.options);
  const external = path.join(f.root, 'external');
  await mkdir(external);
  await rm(path.join(directory, 'blobs'), { recursive: true });
  await symlink(external, path.join(directory, 'blobs'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyObjectBackup(directory), /OBJECT_BACKUP_FAIL: PERMISSIONS/);
});

test('cancellation removes only the invocation staging directory', async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  f.source.get = async () => Readable.from((async function* () {
    yield Buffer.from('a');
    controller.abort();
    yield Buffer.from('bc');
  })());
  await assert.rejects(exportObjects({ ...f.options, signal: controller.signal }), /OBJECT_BACKUP_FAIL:/);
  assert.deepEqual(await readdir(f.backupRoot), []);
});

async function runContainer(request, methods) {
  const output = [];
  const diagnostics = [];
  const timers = [];
  let exitCode = 0;
  const childProcess = Object.assign(new EventEmitter(), {
    env: { S3_ENDPOINT: 'fixture-storage', S3_PORT: '8333', S3_USE_SSL: 'false',
      S3_ACCESS_KEY: secret, S3_SECRET_KEY: secret, S3_BUCKET: 'fixture-papers' },
    stdin: Readable.from([Buffer.from(JSON.stringify(request))]),
    stdout: new Writable({ write(chunk, encoding, done) { output.push(Buffer.from(chunk)); done(); } }),
    stderr: { write(value) { diagnostics.push(value); } },
    exit(code) { exitCode = code; },
  });
  class Client {
    constructor(config) {
      assert.deepEqual(JSON.parse(JSON.stringify(config)), {
        endPoint: 'fixture-storage', port: 8333, useSSL: false, accessKey: secret, secretKey: secret,
      });
      Object.assign(this, methods);
    }
  }
  try {
    await runInNewContext(CONTAINER_PROGRAM, {
      process: childProcess, Buffer,
      require(name) { return name === '/opt/openscience/packages/storage/node_modules/minio' ? { Client } : require(name); },
      setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timer.unref(); timers.push(timer); return timer; },
      clearTimeout,
    });
  } finally { timers.forEach(clearTimeout); }
  return { stdout: Buffer.concat(output), stderr: diagnostics.join(''), exitCode };
}

test('fixed container program lists all keys, preserves selected metadata, and streams raw bytes', async () => {
  const key = '../../private/雪\n.pdf';
  const methods = {
    listObjectsV2(bucket, prefix, recursive) {
      assert.deepEqual([bucket, prefix, recursive], ['fixture-papers', '', true]);
      return Readable.from([{ name: key, size: 3, etag: 'fixture-etag', lastModified: new Date('2026-10-03T00:00:00Z'), other: secret }]);
    },
    async statObject(bucket, requested) {
      assert.deepEqual([bucket, requested], ['fixture-papers', key]);
      return { size: 3, etag: 'fixture-etag', lastModified: new Date('2026-10-03T00:00:00Z'),
        metaData: { 'x-amz-meta-sha256': digest('abc'), 'content-type': 'application/pdf', ignored: secret } };
    },
    async getObject(bucket, requested) {
      assert.deepEqual([bucket, requested], ['fixture-papers', key]);
      return Readable.from([Buffer.from('a'), Buffer.from('bc')]);
    },
  };
  const listing = await runContainer({ op: 'list' }, methods);
  assert.equal(listing.exitCode, 0);
  assert.deepEqual(JSON.parse(listing.stdout), { key, size: 3, etag: 'fixture-etag', lastModified: '2026-10-03T00:00:00.000Z' });
  const head = await runContainer({ op: 'stat', key }, methods);
  assert.equal(JSON.parse(head.stdout).sourceSha256, digest('abc'));
  assert.equal(head.stdout.includes(secret), false);
  const get = await runContainer({ op: 'get', key }, methods);
  assert.equal(get.exitCode, 0);
  assert.equal(get.stdout.toString(), 'abc');
});

test('container errors and invalid operations never print keys or credentials', async () => {
  for (const op of ['stat', 'removeObject']) {
    const result = await runContainer({ op, key: secret }, { async statObject() { throw new Error(secret); } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr, 'OBJECT_SOURCE_FAIL\n');
  }
});

test('late docker-exec failure cannot publish a full-length object and raw stderr is discarded', async (t) => {
  const f = await fixture(t);
  const requests = [];
  const childCode = `
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      const request = JSON.parse(input);
      const row = ${JSON.stringify(f.rows[0])};
      if (request.op === 'info') process.stdout.write(JSON.stringify({ bucket: 'fixture-papers' }) + '\\n');
      else if (request.op === 'list' || request.op === 'stat') process.stdout.write(JSON.stringify(row) + '\\n');
      else { process.stdout.write('abc'); process.stderr.write(${JSON.stringify(secret)}); process.exitCode = 9; }
    });
  `;
  f.options.source = createDockerSource({ spawnImpl(command, args, options) {
    requests.push(args);
    assert.equal(command, 'docker');
    assert.deepEqual(args, ['exec', '-i', 'openscience-prod-api-1', 'node', '-e', CONTAINER_PROGRAM]);
    assert.equal(options.shell, false);
    assert.equal(options.stdio[2], 'ignore');
    return spawn(process.execPath, ['-e', childCode], options);
  } });
  await assert.rejects(exportObjects(f.options), (error) => {
    assert.equal(error.message, 'OBJECT_BACKUP_FAIL: SOURCE');
    assert.equal(error.stack.includes(secret), false);
    return true;
  });
  assert.equal(requests.length, 4);
  assert.deepEqual(await readdir(f.backupRoot), []);
});

test('transport bounds silent readers and sanitizes spawn failures', async () => {
  const source = createDockerSource({ limits: { idleMs: 40, operationMs: 1000 },
    spawnImpl(command, args, options) { return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options); } });
  await assert.rejects(source.info(), /OBJECT_BACKUP_FAIL: TIMEOUT/);
  const failed = createDockerSource({ spawnImpl() { throw new Error(secret); } });
  await assert.rejects(failed.info(), (error) => error.message === 'OBJECT_BACKUP_FAIL: SOURCE' && !error.stack.includes(secret));
});

test('CLI reports only safe diagnostics for invalid arguments', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./backup-objects.mjs', import.meta.url)), 'invalid', secret], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'OBJECT_BACKUP_FAIL: ARGUMENT\n');
});

const shellQuote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const bashPath = (text) => process.platform === 'win32'
  ? text.replaceAll('\\', '/').replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`)
  : text;
for (const mode of ['adjacent', 'source-first', 'failed-export', 'failed-inventory']) {
  test(`backup.sh ${mode} uses the operational helper and rotates only after success`, async (t) => {
    const f = await fixture(t);
    const installed = path.join(f.root, 'installed');
    const releaseRoot = path.join(f.root, 'release-source', release);
    const remoteRoot = path.join(f.root, 'runtime');
    const bin = path.join(f.root, 'bin');
    await mkdir(installed);
    await mkdir(remoteRoot);
    await mkdir(bin);
    await mkdir(path.join(releaseRoot, 'infra/scripts'), { recursive: true });
    await writeFile(path.join(remoteRoot, '.release-id'), release);
    await writeFile(path.join(releaseRoot, '.release-source'), release);
    let script = (await readFile(new URL('./backup.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
    // Only relocate the three hard-coded host roots in this ignored fixture.
    // All production commands in the object branch run unchanged, with Docker
    // explicitly forbidden and flock replaced at the external process boundary.
    const replacements = [
      ['REMOTE_ROOT="/opt/openscience"', `REMOTE_ROOT=${shellQuote(remoteRoot.replaceAll('\\', '/'))}`],
      ['RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"', `RELEASE_ROOT=${shellQuote(releaseRoot.replaceAll('\\', '/'))}`],
      ['DUMP_DIR="/var/backups/openscience"', `DUMP_DIR=${shellQuote(f.backupRoot.replaceAll('\\', '/'))}`],
    ];
    for (const [before, after] of replacements) {
      assert.ok(script.includes(before), 'test root relocation must match before executing the fixture');
      script = script.replace(before, after);
    }
    script = script.replace('set -euo pipefail', `export PATH=${shellQuote(bashPath(bin))}:"$PATH"\nset -euo pipefail`);
    const scriptPath = path.join(installed, 'backup.sh');
    await writeFile(scriptPath, script, { mode: 0o700 });
    await writeFile(path.join(bin, 'flock'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o700 });
    await writeFile(path.join(bin, 'docker'), '#!/usr/bin/env bash\necho forbidden-docker >&2\nexit 99\n', { mode: 0o700 });
    await writeFile(path.join(bin, 'node'), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath.replaceAll('\\', '/'))} "$@"\n`, { mode: 0o700 });
    if (mode === 'failed-inventory') {
      await writeFile(path.join(bin, 'find'), '#!/usr/bin/env bash\nprintf "objects-set-20200101T000000Z-1\\n"\nexit 23\n', { mode: 0o700 });
    }
    if (process.platform === 'win32') {
      // Git Bash install cannot apply Linux modes on this Windows filesystem.
      // The POSIX permissions test above remains explicitly skipped, not mocked
      // into a passing permissions claim. Here only helper/rotation flow is tested.
      await writeFile(path.join(bin, 'install'), '#!/usr/bin/env bash\n[[ "$#" -eq 4 && "$1" == -d && "$2" == -m && "$3" == 0700 ]] || exit 95\nmkdir -p -- "$4"\n', { mode: 0o700 });
    }
    const helper = (label, failure = false) => `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import path from 'node:path';
      const [operation, root, id, release, keep] = process.argv.slice(2);
      if (operation !== 'export' || path.resolve(root) !== ${JSON.stringify(path.resolve(f.backupRoot))} || release !== ${JSON.stringify(release)} || keep !== '1') process.exit(96);
      if (${failure}) process.exit(23);
      const target = path.join(root, 'objects-set-' + id);
      mkdirSync(target, { mode: 0o700 });
      writeFileSync(path.join(target, 'fixture-helper'), ${JSON.stringify(label)}, { mode: 0o600 });
      process.stdout.write('OBJECT_BACKUP_OK objects=1 bytes=3\\n');
    `;
    await writeFile(path.join(installed, 'backup-objects.mjs'), helper('adjacent', mode === 'failed-export'));
    if (mode === 'source-first') await writeFile(path.join(releaseRoot, 'infra/scripts/backup-objects.mjs'), helper('source-first'));
    const oldSets = ['objects-set-20200101T000000Z-1', 'objects-set-20200102T000000Z-2'];
    for (const name of oldSets) await mkdir(path.join(f.backupRoot, name), { recursive: true });
    await writeFile(path.join(f.backupRoot, 'objects-legacy.tar.gz'), 'legacy');
    const otherStage = '.objects-set-20200103T000000Z-3.staging';
    await mkdir(path.join(f.backupRoot, otherStage));
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
    const result = spawnSync(bash, [scriptPath, '--objects', '--confirm'], {
      cwd: f.root, encoding: 'utf8', timeout: 15_000, env: { ...process.env, KEEP_BACKUPS: '1' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, mode === 'failed-export' ? 23 : mode === 'failed-inventory' ? 1 : 0, result.stderr);
    assert.equal(result.stderr.includes('forbidden-docker'), false);
    const names = await readdir(f.backupRoot);
    assert.ok(names.includes('objects-legacy.tar.gz'));
    assert.ok(names.includes(otherStage));
    const sets = names.filter((name) => name.startsWith('objects-set-'));
    if (mode === 'failed-export') {
      assert.deepEqual(sets, oldSets);
      assert.equal(result.stdout.includes('OBJECT_BACKUP_OK'), false);
    } else if (mode === 'failed-inventory') {
      assert.equal(sets.length, 3);
      assert.ok(sets.includes(oldSets[0]) && sets.includes(oldSets[1]));
      assert.match(result.stderr, /OBJECT_BACKUP_FAIL: retention inventory failed/);
    } else {
      assert.equal(sets.length, 1);
      assert.equal(await readFile(path.join(f.backupRoot, sets[0], 'fixture-helper'), 'utf8'), mode);
    }
  });
}
