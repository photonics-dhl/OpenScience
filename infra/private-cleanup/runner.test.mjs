import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = join(repo, 'tmp/legacy-web-retirement/cleanup');
const supported = process.platform === 'linux' && process.getuid?.() === 0;
const archiveRoot = '/var/backups/openscience/retired-chatgpt-web/20261013/runtime';
const copyDirectories = ['spool/inbox', 'spool/results', 'private', 'jobs', 'review-spool/inbox', 'review-spool/results', 'review-private'];
const execute = promisify(execFile);
const id = '01900000-0000-7000-8000-000000000001';
const imageId = '01900000-0000-7000-8000-000000000002';
const reviewId = '01900000-0000-7000-8000-000000000003';
const protectedId = '01900000-0000-7000-8000-000000000004';
const artifactId = '01900000-0000-7000-8000-000000000005';

async function fixture(t, oldLedger = false, locations = ['live'], artifactsOnly = false) {
  await mkdir(fixtureRoot, { recursive: true });
  const base = await mkdtemp(join(fixtureRoot, 'private-cleanup-'));
  t.after(async () => {
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), await realpath(fixtureRoot));
    assert.match(basename(target), /^private-cleanup-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true });
  });
  const cleanup = join(base, 'cleanup'); const browser = join(base, 'legacy-browser');
  const archive = join(base, 'retired-web/runtime');
  const roots = locations.map(location => location === 'live' ? browser : archive);
  for (const relative of ['inbox', 'results', 'state']) await mkdir(join(cleanup, relative), { recursive: true });
  const scope = { trashEntryId: id, taskIds: oldLedger || artifactsOnly ? [] : [imageId, reviewId],
    artifactIds: artifactsOnly ? [artifactId] : [], assetIds: [] };
  await writeFile(join(cleanup, 'inbox', `${id}.json`), JSON.stringify(scope));
  if (oldLedger) await writeFile(join(cleanup, 'state', `${id}.json`), JSON.stringify({ schemaVersion: 1, scope,
    jobs: { codex: [], video: [], image: [imageId], review: [reviewId] } }));
  const copies = [];
  for (const browser of roots) {
    for (const [task, paths] of [[imageId, ['spool/inbox', 'spool/results', 'private', 'jobs']],
      [reviewId, ['review-spool/inbox', 'review-spool/results', 'review-private', 'jobs/review']]]) {
      for (const relative of paths) {
        const root = join(browser, relative); await mkdir(root, { recursive: true });
        if (relative.endsWith('/inbox')) {
          const path = join(root, `${task}.submitted.json`);
          await writeFile(path, JSON.stringify({ id: task, source: { artifactId } })); copies.push(path);
        } else {
          const path = join(root, task); await mkdir(path);
          await writeFile(join(path, 'request.json'), JSON.stringify({ id: task, source: { artifactId } }));
          await writeFile(join(path, 'fixture-private-copy.txt'), 'fixture-only private bytes'); copies.push(path);
        }
      }
    }
  }
  const unowned = [];
  for (const root of roots) {
    const path = join(root, 'private', protectedId); await mkdir(path);
    await writeFile(join(path, 'request.json'), JSON.stringify({ id: protectedId })); unowned.push(path);
  }
  const protectedCopies = [];
  for (const path of [join(base, 'retired-web/units', imageId), join(base, 'other-backup', imageId),
    ...roots.flatMap(root => ['profile', 'downloads', 'egress', 'control'].map(relative => join(root, relative, imageId)))]) {
    await mkdir(path, { recursive: true });
    const file = join(path, 'fixture-only.txt'); await writeFile(file, 'outside cleanup ownership'); protectedCopies.push(file);
  }
  const source = (await readFile(join(repo, 'infra/private-cleanup/runner.mjs'), 'utf8'))
    .replaceAll('/opt/openscience-private-cleanup', cleanup)
    .replaceAll('/opt/openscience-chatgpt-browser', browser)
    .replaceAll(archiveRoot, archive)
    .replaceAll('/opt/openscience-codex', join(base, 'absent-codex'))
    .replaceAll('/opt/openscience-video', join(base, 'absent-video'));
  // Keep production filesystem functions intact; omit only host CLI dispatch for direct sweeps.
  const modulePath = join(base, 'fixture-runner.mjs'); await writeFile(modulePath, source.replace(/^main\(\)\.catch\(.*$/mu, 'export { sweep };'));
  const { sweep } = await import(pathToFileURL(modulePath).href);
  const run = async () => {
    const previous = process.env.PRIVATE_CLEANUP_LOCKS_HELD;
    process.env.PRIVATE_CLEANUP_LOCKS_HELD = '1';
    try { await sweep([scope]); }
    finally { if (previous === undefined) delete process.env.PRIVATE_CLEANUP_LOCKS_HELD; else process.env.PRIVATE_CLEANUP_LOCKS_HELD = previous; }
    return JSON.parse(await readFile(join(cleanup, 'results', `${id}.json`), 'utf8'));
  };
  const sha = 'a'.repeat(40); const bundle = join(cleanup, 'releases', sha); await mkdir(bundle, { recursive: true });
  await writeFile(join(bundle, 'runner.mjs'), source);
  const control = join(base, 'fixture-systemctl.sh');
  await writeFile(control, '#!/bin/sh\ncase "$*" in *LoadState*) printf "not-found\\n" ;; *ActiveState*) printf "inactive\\n" ;; *) exit 0 ;; esac\n');
  await chmod(control, 0o700);
  for (const name of ['runner.lock', 'paused.units']) { await writeFile(join(cleanup, name), ''); await chmod(join(cleanup, name), 0o600); }
  for (const root of roots) for (const name of ['image-runner.lock', 'science-review-runner.lock', 'runner.lock'])
    await writeFile(join(root, 'jobs', name), '', { mode: 0o600 });
  const shell = (await readFile(join(repo, 'infra/private-cleanup/run.sh'), 'utf8'))
    .replaceAll('/opt/openscience-private-cleanup', cleanup)
    .replaceAll('/opt/openscience-chatgpt-browser', browser)
    .replaceAll(archiveRoot, archive)
    .replaceAll('/opt/openscience-codex', join(base, 'absent-codex'))
    .replaceAll('/opt/openscience-video', join(base, 'absent-video'))
    .replaceAll('/usr/bin/systemctl', `"${control}"`)
    .replace('node=/usr/bin/node', `node='${process.execPath.replaceAll("'", "'\\''")}'`)
    .replace(/^\[\[ \$bundle =~ .*$/mu, `[[ $bundle == "${bundle}" ]] || exit 65`);
  const script = join(bundle, 'run.sh'); await writeFile(script, shell);
  const runGuard = async () => {
    await execute('/bin/bash', [script], { timeout: 10_000 });
    return JSON.parse(await readFile(join(cleanup, 'results', `${id}.json`), 'utf8'));
  };
  return { cleanup, browser, archive, roots, scope, copies, unowned, protectedCopies, run, runGuard };
}

for (const oldLedger of [false, true]) for (const locations of [['live'], ['archive'], ['live', 'archive']]) {
  test(`cleanup erases ${locations.join('+')} Web copies for ${oldLedger ? 'an old four-provider ledger' : 'a fresh scope'}`, { skip: !supported }, async t => {
    const f = await fixture(t, oldLedger, locations);
    const result = await f.runGuard(); assert.equal(result.state, 'complete');
    for (const path of f.copies) await assert.rejects(lstat(path), { code: 'ENOENT' });
    for (const path of f.unowned) assert.equal((await lstat(path)).isDirectory(), true);
    for (const path of f.protectedCopies) assert.equal(await readFile(path, 'utf8'), 'outside cleanup ownership');
    const state = JSON.parse(await readFile(join(f.cleanup, 'state', `${id}.json`), 'utf8'));
    assert.deepEqual(Object.keys(state.jobs).sort(), ['codex', 'image', 'review', 'video']);
    assert.ok(state.jobs.image.includes(imageId)); assert.ok(state.jobs.review.includes(reviewId));
  });
}

for (const location of ['live', 'archive']) test(`cleanup stays pending for a protected ${location} job entry`, { skip: !supported }, async t => {
  const f = await fixture(t, false, [location]);
  const protectedPath = join(f.roots[0], 'private', imageId, 'config.json');
  await writeFile(protectedPath, '{"fixtureOnly":true}');
  const result = await f.run();
  assert.equal(result.state, 'pending'); assert.equal(result.reason, 'PROTECTED_JOB_ENTRY');
  assert.equal(await readFile(protectedPath, 'utf8'), '{"fixtureOnly":true}');
});

test('archive cleanup resolves artifact ownership before erasing its requests', { skip: !supported }, async t => {
  const f = await fixture(t, false, ['archive'], true);
  assert.equal((await f.run()).state, 'complete');
  for (const path of f.copies) await assert.rejects(lstat(path), { code: 'ENOENT' });
  for (const path of f.unowned) assert.equal((await lstat(path)).isDirectory(), true);
});

test('archive cleanup rejects a changed schema1 ledger scope without deleting copies', { skip: !supported }, async t => {
  const f = await fixture(t, true, ['archive']);
  const filename = join(f.cleanup, 'state', `${id}.json`); const ledger = JSON.parse(await readFile(filename, 'utf8'));
  ledger.scope.artifactIds = [artifactId]; await writeFile(filename, JSON.stringify(ledger));
  const result = await f.run(); assert.equal(result.state, 'pending'); assert.equal(result.reason, 'RESUME_SCOPE_MISMATCH');
  for (const path of f.copies) await lstat(path);
});

test('archive cleanup never follows a symbolic root into another backup', { skip: !supported }, async t => {
  const f = await fixture(t, false, ['live']);
  await symlink(dirname(f.protectedCopies[1]), f.archive);
  const result = await f.run(); assert.equal(result.state, 'pending');
  for (const path of f.copies) await lstat(path);
  assert.equal(await readFile(f.protectedCopies[1], 'utf8'), 'outside cleanup ownership');
});

test('shell guard defers instead of sweeping an archive with a missing original shared lock', { skip: !supported }, async t => {
  const f = await fixture(t, false, ['archive']); await unlink(join(f.archive, 'jobs/runner.lock'));
  const result = await f.runGuard(); assert.equal(result.state, 'pending'); assert.equal(result.reason, 'PROVIDER_DRAIN_OR_LOCK_PENDING');
  for (const path of f.copies) await lstat(path);
});

test('shell guard locks both roots and defers when an archive image lock is busy', { skip: !supported }, async t => {
  const f = await fixture(t, false, ['live', 'archive']); const ready = join(f.cleanup, 'fixture-lock-held');
  const holder = spawn('/usr/bin/flock', ['-x', '-F', join(f.archive, 'jobs/image-runner.lock'), process.execPath, '-e',
    'require("fs").writeFileSync(process.argv[1], "held"); setInterval(() => {}, 1000)', ready], { stdio: 'ignore' });
  const closed = once(holder, 'close');
  try {
    for (let wait = 0; ; wait++) {
      if (await lstat(ready).catch(() => null)) break;
      assert.ok(wait < 100, 'fixture lock holder did not start'); await new Promise(resolve => setTimeout(resolve, 10));
    }
    const result = await f.runGuard(); assert.equal(result.state, 'pending'); assert.equal(result.reason, 'PROVIDER_DRAIN_OR_LOCK_PENDING');
    for (const path of f.copies) await lstat(path);
  } finally { holder.kill('SIGTERM'); await closed; }
});

test('archive service writes only the original seven copy directories and excludes browser control state', async () => {
  const source = await readFile(join(repo, 'infra/private-cleanup/install.sh'), 'utf8');
  const writable = [...source.matchAll(/^ReadWritePaths=(.*)$/gmu)].flatMap(match => match[1].split(/\s+/u))
    .filter(path => path.startsWith('-/var/backups/'));
  assert.deepEqual(writable.sort(), copyDirectories.map(relative => `-${archiveRoot}/${relative}`).sort());
  const inaccessible = [...source.matchAll(/^InaccessiblePaths=(.*)$/gmu)].flatMap(match => match[1].split(/\s+/u));
  for (const relative of ['profile', 'downloads', 'egress', 'control']) assert.ok(inaccessible.includes(`-${archiveRoot}/${relative}`));
});
