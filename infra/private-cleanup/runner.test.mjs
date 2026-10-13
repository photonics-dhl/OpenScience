import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = join(repo, 'tmp/legacy-web-retirement/cleanup');
const supported = process.platform === 'linux' && process.getuid?.() === 0;
const id = '01900000-0000-7000-8000-000000000001';
const imageId = '01900000-0000-7000-8000-000000000002';
const reviewId = '01900000-0000-7000-8000-000000000003';
const protectedId = '01900000-0000-7000-8000-000000000004';

async function fixture(t, oldLedger = false) {
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
  for (const relative of ['inbox', 'results', 'state']) await mkdir(join(cleanup, relative), { recursive: true });
  const scope = { trashEntryId: id, taskIds: oldLedger ? [] : [imageId, reviewId], artifactIds: [], assetIds: [] };
  await writeFile(join(cleanup, 'inbox', `${id}.json`), JSON.stringify(scope));
  if (oldLedger) await writeFile(join(cleanup, 'state', `${id}.json`), JSON.stringify({ schemaVersion: 1, scope,
    jobs: { codex: [], video: [], image: [imageId], review: [reviewId] } }));
  const copies = [];
  for (const [task, paths] of [[imageId, ['spool/inbox', 'spool/results', 'private', 'jobs']],
    [reviewId, ['review-spool/inbox', 'review-spool/results', 'review-private', 'jobs/review']]]) {
    for (const relative of paths) {
      const root = join(browser, relative); await mkdir(root, { recursive: true });
      if (relative.endsWith('/inbox')) {
        const path = join(root, `${task}.submitted.json`);
        await writeFile(path, JSON.stringify({ id: task })); copies.push(path);
      } else {
        const path = join(root, task); await mkdir(path);
        await writeFile(join(path, 'request.json'), JSON.stringify({ id: task }));
        await writeFile(join(path, 'fixture-private-copy.txt'), 'fixture-only private bytes'); copies.push(path);
      }
    }
  }
  const unowned = join(browser, 'private', protectedId); await mkdir(unowned);
  await writeFile(join(unowned, 'request.json'), JSON.stringify({ id: protectedId }));
  const source = (await readFile(join(repo, 'infra/private-cleanup/runner.mjs'), 'utf8'))
    .replaceAll('/opt/openscience-private-cleanup', cleanup)
    .replaceAll('/opt/openscience-chatgpt-browser', browser)
    .replaceAll('/opt/openscience-codex', join(base, 'absent-codex'))
    .replaceAll('/opt/openscience-video', join(base, 'absent-video'))
    // Keep the production filesystem functions and sweep intact; omit only host CLI dispatch.
    .replace(/^main\(\)\.catch\(.*$/mu, 'export { sweep };');
  const modulePath = join(base, 'fixture-runner.mjs'); await writeFile(modulePath, source);
  const { sweep } = await import(pathToFileURL(modulePath).href);
  const run = async () => {
    const previous = process.env.PRIVATE_CLEANUP_LOCKS_HELD;
    process.env.PRIVATE_CLEANUP_LOCKS_HELD = '1';
    try { await sweep([scope]); }
    finally { if (previous === undefined) delete process.env.PRIVATE_CLEANUP_LOCKS_HELD; else process.env.PRIVATE_CLEANUP_LOCKS_HELD = previous; }
    return JSON.parse(await readFile(join(cleanup, 'results', `${id}.json`), 'utf8'));
  };
  return { cleanup, browser, scope, copies, unowned, run };
}

for (const oldLedger of [false, true]) {
  test(`cleanup retains deletion of legacy Web private copies for ${oldLedger ? 'an old four-provider ledger' : 'a fresh authorized scope'}`, { skip: !supported }, async t => {
    const f = await fixture(t, oldLedger);
    const result = await f.run(); assert.equal(result.state, 'complete');
    for (const path of f.copies) await assert.rejects(lstat(path), { code: 'ENOENT' });
    assert.equal((await lstat(f.unowned)).isDirectory(), true);
    const state = JSON.parse(await readFile(join(f.cleanup, 'state', `${id}.json`), 'utf8'));
    assert.deepEqual(Object.keys(state.jobs).sort(), ['codex', 'image', 'review', 'video']);
    assert.ok(state.jobs.image.includes(imageId)); assert.ok(state.jobs.review.includes(reviewId));
  });
}

test('cleanup keeps the scope pending when a protected legacy private entry remains', { skip: !supported }, async t => {
  const f = await fixture(t);
  const protectedPath = join(f.browser, 'private', imageId, 'config.json');
  await writeFile(protectedPath, '{"fixtureOnly":true}');
  const result = await f.run();
  assert.equal(result.state, 'pending'); assert.equal(result.reason, 'PROTECTED_JOB_ENTRY');
  assert.equal(await readFile(protectedPath, 'utf8'), '{"fixtureOnly":true}');
});
